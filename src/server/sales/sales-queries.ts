import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/errors";
import { sumMoney } from "@/lib/money";
import { summarizeContract } from "@/server/finance/calculations";
import { toInstallmentLike } from "@/server/finance/transactions";

export type SaleFilters = {
  search?: string;
  customerId?: string;
  productId?: string;
  status?: "OPEN" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
};

export async function listSales(filters: SaleFilters = {}) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;

  const where = {
    deletedAt: null,
    status: filters.status,
    customerId: filters.customerId,
    soldAt:
      filters.from || filters.to
        ? { gte: filters.from ?? undefined, lte: filters.to ?? undefined }
        : undefined,
    ...(filters.productId ? { items: { some: { productId: filters.productId } } } : {}),
    ...(filters.search
      ? {
          OR: [
            { code: { contains: filters.search, mode: "insensitive" as const } },
            { customer: { name: { contains: filters.search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      orderBy: { soldAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        customer: { select: { id: true, name: true, document: true } },
        items: { include: { product: { select: { name: true, kind: true } } } },
        contracts: { include: { installments: true } },
        allocations: { where: { reversedAt: null }, select: { amount: true } },
      },
    }),
    prisma.sale.count({ where }),
  ]);

  const rows = items.map((sale) => {
    const fromInstallments = sale.contracts
      .flatMap((contract) => contract.installments)
      .reduce((acc, installment) => acc + Number(installment.paidAmount), 0);
    // A consultation has no contract: its receipt is allocated to the sale itself.
    const direct = sale.allocations.reduce(
      (acc, allocation) => acc + Number(allocation.amount),
      0,
    );

    return { sale, received: fromInstallments + direct };
  });

  return { rows, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getSaleDetails(id: string) {
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: {
      customer: true,
      createdBy: { select: { name: true } },
      items: { include: { product: true } },
      contracts: {
        include: {
          documents: { where: { type: { key: "contract" }, deletedAt: null }, take: 1 },
          installments: {
            orderBy: { number: "asc" },
            include: {
              paymentMethod: true,
              allocations: { where: { reversedAt: null }, include: { transaction: true } },
            },
          },
        },
      },
      services: { include: { product: true } },
      allocations: {
        where: { reversedAt: null },
        include: { transaction: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!sale || sale.deletedAt) throw notFound("Venda");

  const contractSummaries = sale.contracts.map((contract) => ({
    contract,
    summary: summarizeContract(contract.installments.map(toInstallmentLike)),
  }));

  // Receipts applied straight to the sale, which is how a consultation is settled.
  const directReceived = sumMoney(sale.allocations.map((allocation) => allocation.amount));

  return { sale, contractSummaries, directReceived };
}
