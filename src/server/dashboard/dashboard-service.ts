import { prisma } from "@/lib/prisma";
import { Decimal, moneyToString, sumMoney, toCents } from "@/lib/money";

export type DashboardPeriod = { from: Date; to: Date };

export type DashboardMetrics = {
  /** Contracted value of sales closed in the period (not cash). */
  revenueContracted: string;
  /** Cash that actually came in during the period. */
  revenueReceived: string;
  /** Open balance of every obligation due up to the end of the period. */
  accountsReceivable: string;
  overdueReceivable: string;
  expensesPaid: string;
  expensesPending: string;
  adsExpenses: string;
  consultationExpenses: string;
  /** Cash in minus cash out in the period. */
  operatingProfit: string;
  consultationsSold: number;
  contractsClosed: number;
  salesCount: number;
};

export type SeriesPoint = { label: string; contracted: number; received: number; expenses: number };
export type CategorySlice = { label: string; value: number };

const ADS_CATEGORY_KEY = "paid_traffic";
const CONSULTATION_CATEGORY_KEY = "consultations";

export async function getDashboardMetrics(period: DashboardPeriod): Promise<DashboardMetrics> {
  const [sales, incomeSettled, expenses, receivables, consultations, contractsClosed] =
    await Promise.all([
      prisma.sale.findMany({
        where: { soldAt: { gte: period.from, lte: period.to }, status: { not: "CANCELLED" } },
        select: { total: true },
      }),
      prisma.transaction.findMany({
        where: {
          type: "INCOME",
          status: { in: ["SETTLED", "PARTIALLY_SETTLED"] },
          settledAt: { gte: period.from, lte: period.to },
        },
        select: { settledAmount: true },
      }),
      prisma.transaction.findMany({
        where: {
          type: "EXPENSE",
          status: { notIn: ["CANCELLED", "REFUNDED"] },
          competenceDate: { gte: period.from, lte: period.to },
        },
        select: {
          expectedAmount: true,
          settledAmount: true,
          expenseCategory: { select: { key: true } },
        },
      }),
      // Receivables are a balance, not a flow: every open installment counts,
      // whatever the period filter, otherwise future instalments vanish.
      prisma.installment.findMany({
        where: {
          status: { notIn: ["PAID", "CANCELLED"] },
          contract: { status: { not: "CANCELLED" } },
        },
        select: { expectedAmount: true, paidAmount: true, dueDate: true },
      }),
      prisma.saleItem.aggregate({
        _sum: { quantity: true },
        where: {
          product: { kind: "CONSULTATION" },
          sale: { soldAt: { gte: period.from, lte: period.to }, status: { not: "CANCELLED" } },
        },
      }),
      prisma.contract.count({
        where: {
          startDate: { gte: period.from, lte: period.to },
          status: { not: "CANCELLED" },
        },
      }),
    ]);

  const revenueContracted = sumMoney(sales.map((sale) => sale.total));
  const revenueReceived = sumMoney(incomeSettled.map((item) => item.settledAmount));

  const expensesPaid = sumMoney(expenses.map((item) => item.settledAmount));
  const expensesPending = sumMoney(
    expenses.map((item) => toCents(item.expectedAmount).minus(toCents(item.settledAmount))),
  );

  const adsExpenses = sumMoney(
    expenses
      .filter((item) => item.expenseCategory?.key === ADS_CATEGORY_KEY)
      .map((item) => item.settledAmount),
  );
  const consultationExpenses = sumMoney(
    expenses
      .filter((item) => item.expenseCategory?.key === CONSULTATION_CATEGORY_KEY)
      .map((item) => item.settledAmount),
  );

  const now = new Date();
  let accountsReceivable = new Decimal(0);
  let overdueReceivable = new Decimal(0);

  for (const installment of receivables) {
    const balance = toCents(installment.expectedAmount).minus(toCents(installment.paidAmount));
    if (balance.lessThanOrEqualTo(0)) continue;
    accountsReceivable = accountsReceivable.plus(balance);
    if (installment.dueDate < now) overdueReceivable = overdueReceivable.plus(balance);
  }

  return {
    revenueContracted: moneyToString(revenueContracted),
    revenueReceived: moneyToString(revenueReceived),
    accountsReceivable: moneyToString(accountsReceivable),
    overdueReceivable: moneyToString(overdueReceivable),
    expensesPaid: moneyToString(expensesPaid),
    expensesPending: moneyToString(expensesPending),
    adsExpenses: moneyToString(adsExpenses),
    consultationExpenses: moneyToString(consultationExpenses),
    operatingProfit: moneyToString(revenueReceived.minus(expensesPaid)),
    consultationsSold: consultations._sum.quantity ?? 0,
    contractsClosed,
    salesCount: sales.length,
  };
}

/** Monthly buckets covering the period, so charts never show gaps. */
export async function getDashboardSeries(period: DashboardPeriod): Promise<SeriesPoint[]> {
  const [sales, income, expenses] = await Promise.all([
    prisma.sale.findMany({
      where: { soldAt: { gte: period.from, lte: period.to }, status: { not: "CANCELLED" } },
      select: { soldAt: true, total: true },
    }),
    prisma.transaction.findMany({
      where: {
        type: "INCOME",
        settledAt: { gte: period.from, lte: period.to },
        status: { in: ["SETTLED", "PARTIALLY_SETTLED"] },
      },
      select: { settledAt: true, settledAmount: true },
    }),
    prisma.transaction.findMany({
      where: {
        type: "EXPENSE",
        competenceDate: { gte: period.from, lte: period.to },
        status: { notIn: ["CANCELLED", "REFUNDED"] },
      },
      select: { competenceDate: true, settledAmount: true },
    }),
  ]);

  const buckets = new Map<string, SeriesPoint>();
  for (const key of monthKeys(period)) {
    buckets.set(key, { label: formatMonth(key), contracted: 0, received: 0, expenses: 0 });
  }

  const add = (date: Date | null, field: keyof Omit<SeriesPoint, "label">, value: unknown) => {
    if (!date) return;
    const key = monthKey(date);
    const bucket = buckets.get(key);
    if (!bucket) return;
    bucket[field] += Number(toCents(value as never).toFixed(2));
  };

  for (const sale of sales) add(sale.soldAt, "contracted", sale.total);
  for (const item of income) add(item.settledAt, "received", item.settledAmount);
  for (const item of expenses) add(item.competenceDate, "expenses", item.settledAmount);

  return Array.from(buckets.values());
}

export async function getExpensesByCategory(period: DashboardPeriod): Promise<CategorySlice[]> {
  const rows = await prisma.transaction.findMany({
    where: {
      type: "EXPENSE",
      competenceDate: { gte: period.from, lte: period.to },
      status: { notIn: ["CANCELLED", "REFUNDED"] },
    },
    select: { settledAmount: true, expenseCategory: { select: { name: true } } },
  });

  const totals = new Map<string, number>();
  for (const row of rows) {
    const label = row.expenseCategory?.name ?? "Sem categoria";
    totals.set(label, (totals.get(label) ?? 0) + Number(toCents(row.settledAmount).toFixed(2)));
  }

  return Array.from(totals.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

export async function getSalesByProduct(period: DashboardPeriod): Promise<CategorySlice[]> {
  const rows = await prisma.saleItem.findMany({
    where: {
      sale: { soldAt: { gte: period.from, lte: period.to }, status: { not: "CANCELLED" } },
    },
    select: { total: true, product: { select: { name: true } } },
  });

  const totals = new Map<string, number>();
  for (const row of rows) {
    const label = row.product.name;
    totals.set(label, (totals.get(label) ?? 0) + Number(toCents(row.total).toFixed(2)));
  }

  return Array.from(totals.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthKeys(period: DashboardPeriod): string[] {
  const keys: string[] = [];
  const cursor = new Date(period.from.getFullYear(), period.from.getMonth(), 1);
  const end = new Date(period.to.getFullYear(), period.to.getMonth(), 1);

  while (cursor <= end) {
    keys.push(monthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return keys.length > 0 ? keys : [monthKey(period.from)];
}

function formatMonth(key: string): string {
  const [year, month] = key.split("-");
  const names = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${names[Number(month) - 1]}/${year.slice(2)}`;
}
