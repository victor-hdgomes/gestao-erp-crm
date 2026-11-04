import { prisma } from "@/lib/prisma";
import { sumMoney, toCents } from "@/lib/money";

export type TransactionFilters = {
  type?: "INCOME" | "EXPENSE";
  status?: "PENDING" | "PARTIALLY_SETTLED" | "SETTLED" | "OVERDUE" | "CANCELLED" | "REFUNDED";
  customerId?: string;
  expenseCategoryId?: string;
  search?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
};

export async function listTransactions(filters: TransactionFilters = {}) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;

  const where = {
    type: filters.type,
    status: filters.status,
    customerId: filters.customerId,
    expenseCategoryId: filters.expenseCategoryId,
    competenceDate:
      filters.from || filters.to
        ? { gte: filters.from ?? undefined, lte: filters.to ?? undefined }
        : undefined,
    ...(filters.search
      ? {
          OR: [
            { code: { contains: filters.search, mode: "insensitive" as const } },
            { description: { contains: filters.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, total, aggregates, missingPaymentMethod] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: [{ competenceDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        customer: { select: { id: true, name: true } },
        expenseCategory: true,
        paymentMethod: true,
        allocations: { where: { reversedAt: null } },
      },
    }),
    prisma.transaction.count({ where }),
    prisma.transaction.groupBy({
      by: ["type"],
      where,
      _sum: { expectedAmount: true, settledAmount: true },
    }),
    // Money that moved without saying how it moved: the receipts report cannot
    // split Pix from card when this is left blank.
    prisma.transaction.count({
      where: {
        ...where,
        paymentMethodId: null,
        settledAmount: { gt: 0 },
        status: { notIn: ["CANCELLED", "REFUNDED"] },
      },
    }),
  ]);

  const totals = {
    incomeExpected: "0.00",
    incomeSettled: "0.00",
    expenseExpected: "0.00",
    expenseSettled: "0.00",
  };

  for (const row of aggregates) {
    if (row.type === "INCOME") {
      totals.incomeExpected = toCents(row._sum.expectedAmount ?? 0).toFixed(2);
      totals.incomeSettled = toCents(row._sum.settledAmount ?? 0).toFixed(2);
    } else {
      totals.expenseExpected = toCents(row._sum.expectedAmount ?? 0).toFixed(2);
      totals.expenseSettled = toCents(row._sum.settledAmount ?? 0).toFixed(2);
    }
  }

  return {
    items,
    total,
    totals,
    missingPaymentMethod,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Open installments, used by the receivables screen and the settle dialog. */
export async function listOpenInstallments(filters: { customerId?: string } = {}) {
  return prisma.installment.findMany({
    where: {
      status: { notIn: ["PAID", "CANCELLED"] },
      contract: {
        status: { not: "CANCELLED" },
        customerId: filters.customerId,
        deletedAt: null,
      },
    },
    orderBy: { dueDate: "asc" },
    include: {
      contract: {
        select: {
          id: true,
          code: true,
          title: true,
          customer: { select: { id: true, name: true } },
        },
      },
      paymentMethod: true,
    },
  });
}

export async function listContractsForSelect(customerId?: string) {
  return prisma.contract.findMany({
    where: { deletedAt: null, status: { not: "CANCELLED" }, customerId },
    orderBy: { startDate: "desc" },
    take: 50,
    select: {
      id: true,
      code: true,
      title: true,
      customer: { select: { id: true, name: true } },
      installments: {
        orderBy: { number: "asc" },
        select: {
          id: true,
          number: true,
          label: true,
          dueDate: true,
          expectedAmount: true,
          paidAmount: true,
          status: true,
        },
      },
    },
  });
}

/**
 * Sales with no contract that still owe money — a consultation paid on the spot
 * has nowhere else to hang its receipt.
 */
export async function listOpenSalesForSelect(customerId?: string) {
  const sales = await prisma.sale.findMany({
    where: {
      deletedAt: null,
      status: { in: ["OPEN", "PARTIALLY_PAID"] },
      contracts: { none: {} },
      customerId,
    },
    orderBy: { soldAt: "desc" },
    take: 50,
    select: {
      id: true,
      code: true,
      total: true,
      soldAt: true,
      customer: { select: { id: true, name: true } },
      allocations: { where: { reversedAt: null }, select: { amount: true } },
      items: { select: { description: true } },
    },
  });

  return sales.map((sale) => {
    const received = sumMoney(sale.allocations.map((allocation) => allocation.amount));
    return {
      id: sale.id,
      code: sale.code,
      soldAt: sale.soldAt,
      customer: sale.customer,
      title: sale.items.map((item) => item.description).join(" + "),
      balance: toCents(sale.total).minus(received),
    };
  });
}

export async function getTransactionDetails(id: string) {
  return prisma.transaction.findUnique({
    where: { id },
    include: {
      customer: true,
      expenseCategory: true,
      paymentMethod: true,
      allocations: {
        include: {
          installment: { include: { contract: true } },
          contract: true,
          sale: true,
        },
      },
    },
  });
}
