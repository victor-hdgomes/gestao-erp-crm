import { prisma } from "@/lib/prisma";
import { moneyToString, toCents } from "@/lib/money";
import { resolveInstallmentStatus } from "@/server/finance/calculations";

export type ReportKey =
  | "sales"
  | "services"
  | "receivables"
  | "overdue"
  | "receipts"
  | "expenses"
  | "contracts";

export const REPORT_LABELS: Record<ReportKey, string> = {
  sales: "Vendas por período",
  services: "Serviços mais vendidos",
  receivables: "Contas a receber",
  overdue: "Parcelas vencidas",
  receipts: "Recebimentos",
  expenses: "Despesas",
  contracts: "Contratos fechados",
};

export type ReportTable = { columns: string[]; rows: (string | number)[][] };

export async function buildReport(
  key: ReportKey,
  period: { from: Date; to: Date },
): Promise<ReportTable> {
  switch (key) {
    case "sales":
      return salesReport(period);
    case "services":
      return servicesReport(period);
    case "receivables":
      return receivablesReport(false);
    case "overdue":
      return receivablesReport(true);
    case "receipts":
      return receiptsReport(period);
    case "expenses":
      return expensesReport(period);
    case "contracts":
      return contractsReport(period);
  }
}

async function salesReport(period: { from: Date; to: Date }): Promise<ReportTable> {
  const sales = await prisma.sale.findMany({
    where: { soldAt: { gte: period.from, lte: period.to }, deletedAt: null },
    orderBy: { soldAt: "desc" },
    include: { customer: { select: { name: true } }, items: { include: { product: true } } },
  });

  return {
    columns: ["Código", "Data", "Cliente", "Itens", "Total", "Status"],
    rows: sales.map((sale) => [
      sale.code,
      sale.soldAt.toISOString().slice(0, 10),
      sale.customer.name,
      sale.items.map((item) => `${item.quantity}x ${item.product.name}`).join(" | "),
      moneyToString(sale.total),
      sale.status,
    ]),
  };
}

async function servicesReport(period: { from: Date; to: Date }): Promise<ReportTable> {
  const items = await prisma.saleItem.findMany({
    where: {
      sale: { soldAt: { gte: period.from, lte: period.to }, status: { not: "CANCELLED" } },
    },
    include: { product: true },
  });

  const totals = new Map<string, { quantity: number; revenue: number; cost: number }>();
  for (const item of items) {
    const current = totals.get(item.product.name) ?? { quantity: 0, revenue: 0, cost: 0 };
    current.quantity += item.quantity;
    current.revenue += Number(toCents(item.total).toFixed(2));
    current.cost += Number(toCents(item.unitCost).times(item.quantity).toFixed(2));
    totals.set(item.product.name, current);
  }

  return {
    columns: ["Serviço", "Quantidade", "Receita contratada", "Custo estimado", "Margem"],
    rows: Array.from(totals.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .map(([name, value]) => [
        name,
        value.quantity,
        value.revenue.toFixed(2),
        value.cost.toFixed(2),
        (value.revenue - value.cost).toFixed(2),
      ]),
  };
}

async function receivablesReport(onlyOverdue: boolean): Promise<ReportTable> {
  const installments = await prisma.installment.findMany({
    where: {
      status: { notIn: ["PAID", "CANCELLED"] },
      contract: { status: { not: "CANCELLED" }, deletedAt: null },
    },
    orderBy: { dueDate: "asc" },
    include: { contract: { include: { customer: { select: { name: true } } } } },
  });

  const now = new Date();
  const rows = installments
    .map((installment) => ({
      installment,
      status: resolveInstallmentStatus(
        {
          expectedAmount: installment.expectedAmount,
          paidAmount: installment.paidAmount,
          dueDate: installment.dueDate,
          status: installment.status,
        },
        now,
      ),
      balance: toCents(installment.expectedAmount).minus(toCents(installment.paidAmount)),
    }))
    .filter((row) => (onlyOverdue ? row.status === "OVERDUE" : true));

  return {
    columns: ["Cliente", "Contrato", "Parcela", "Vencimento", "Previsto", "Pago", "Saldo", "Status"],
    rows: rows.map((row) => [
      row.installment.contract.customer.name,
      row.installment.contract.code,
      row.installment.label ?? `Parcela ${row.installment.number}`,
      row.installment.dueDate.toISOString().slice(0, 10),
      moneyToString(row.installment.expectedAmount),
      moneyToString(row.installment.paidAmount),
      row.balance.toFixed(2),
      row.status,
    ]),
  };
}

async function receiptsReport(period: { from: Date; to: Date }): Promise<ReportTable> {
  const transactions = await prisma.transaction.findMany({
    where: {
      type: "INCOME",
      settledAt: { gte: period.from, lte: period.to },
      status: { in: ["SETTLED", "PARTIALLY_SETTLED"] },
    },
    orderBy: { settledAt: "desc" },
    include: { customer: { select: { name: true } }, paymentMethod: true },
  });

  return {
    columns: ["Código", "Liquidação", "Cliente", "Descrição", "Forma", "Valor"],
    rows: transactions.map((transaction) => [
      transaction.code,
      transaction.settledAt?.toISOString().slice(0, 10) ?? "",
      transaction.customer?.name ?? "",
      transaction.description,
      transaction.paymentMethod?.name ?? "",
      moneyToString(transaction.settledAmount),
    ]),
  };
}

async function expensesReport(period: { from: Date; to: Date }): Promise<ReportTable> {
  const transactions = await prisma.transaction.findMany({
    where: {
      type: "EXPENSE",
      competenceDate: { gte: period.from, lte: period.to },
      status: { notIn: ["CANCELLED", "REFUNDED"] },
    },
    orderBy: { competenceDate: "desc" },
    include: { category: true, paymentMethod: true },
  });

  return {
    columns: ["Código", "Competência", "Categoria", "Descrição", "Previsto", "Pago", "Status"],
    rows: transactions.map((transaction) => [
      transaction.code,
      transaction.competenceDate.toISOString().slice(0, 10),
      transaction.category?.name ?? "",
      transaction.description,
      moneyToString(transaction.expectedAmount),
      moneyToString(transaction.settledAmount),
      transaction.status,
    ]),
  };
}

async function contractsReport(period: { from: Date; to: Date }): Promise<ReportTable> {
  const contracts = await prisma.contract.findMany({
    where: { startDate: { gte: period.from, lte: period.to }, deletedAt: null },
    orderBy: { startDate: "desc" },
    include: {
      customer: { select: { name: true } },
      installments: true,
    },
  });

  return {
    columns: ["Código", "Cliente", "Título", "Início", "Contratado", "Recebido", "Status"],
    rows: contracts.map((contract) => {
      const received = contract.installments.reduce(
        (acc, installment) => acc + Number(installment.paidAmount),
        0,
      );
      return [
        contract.code,
        contract.customer.name,
        contract.title,
        contract.startDate.toISOString().slice(0, 10),
        moneyToString(contract.totalAmount),
        received.toFixed(2),
        contract.status,
      ];
    }),
  };
}

/** RFC 4180 quoting, with a BOM so Excel pt-BR opens it as UTF-8. */
export function toCsv(table: ReportTable): string {
  const escape = (value: string | number) => {
    const text = String(value ?? "");
    return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const lines = [
    table.columns.map(escape).join(";"),
    ...table.rows.map((row) => row.map(escape).join(";")),
  ];

  return `﻿${lines.join("\r\n")}`;
}
