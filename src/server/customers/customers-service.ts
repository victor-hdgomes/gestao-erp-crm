import { prisma } from "@/lib/prisma";
import { conflict, notFound } from "@/lib/errors";
import { onlyDigits } from "@/lib/format";
import { recordAudit } from "@/server/shared/audit";
import { summarizeContract } from "@/server/finance/calculations";
import { toInstallmentLike } from "@/server/finance/transactions";
import type { CustomerCreateInput, CustomerUpdateInput } from "@/lib/schemas/customer";

export type CustomerListFilters = {
  search?: string;
  status?: "LEAD" | "ACTIVE" | "INACTIVE" | "BLOCKED";
  page?: number;
  pageSize?: number;
};

export async function listCustomers(filters: CustomerListFilters = {}) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const search = filters.search?.trim();
  const digits = search ? onlyDigits(search) : "";

  const where = {
    deletedAt: null,
    status: filters.status,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            ...(digits.length >= 3
              ? [{ document: { contains: digits } }, { phone: { contains: digits } }]
              : []),
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count: { select: { contracts: true, sales: true } },
      },
    }),
    prisma.customer.count({ where }),
  ]);

  return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function createCustomer(
  input: CustomerCreateInput,
  options: { actorId?: string | null; actorLabel?: string | null } = {},
) {
  if (input.document) {
    const existing = await prisma.customer.findUnique({ where: { document: input.document } });
    if (existing) {
      throw conflict("Já existe um cliente com este CPF.", { customerId: existing.id });
    }
  }

  const customer = await prisma.customer.create({
    data: {
      name: input.name,
      document: input.document ?? null,
      phone: input.phone ?? null,
      email: input.email || null,
      zipCode: input.zipCode ?? null,
      street: input.street ?? null,
      number: input.number ?? null,
      complement: input.complement ?? null,
      district: input.district ?? null,
      city: input.city ?? null,
      state: input.state || null,
      driveFolderUrl: input.driveFolderUrl || null,
      notes: input.notes ?? null,
      status: input.status,
    },
  });

  await recordAudit({
    userId: options.actorId ?? null,
    actorLabel: options.actorLabel ?? null,
    action: "customer.create",
    entity: "Customer",
    entityId: customer.id,
    changes: { name: customer.name },
  });

  return customer;
}

export async function updateCustomer(
  id: string,
  input: CustomerUpdateInput,
  options: { actorId?: string | null } = {},
) {
  const existing = await prisma.customer.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) throw notFound("Cliente");

  if (input.document && input.document !== existing.document) {
    const duplicate = await prisma.customer.findUnique({ where: { document: input.document } });
    if (duplicate) throw conflict("Já existe um cliente com este CPF.");
  }

  const customer = await prisma.customer.update({
    where: { id },
    data: {
      name: input.name ?? undefined,
      document: input.document === undefined ? undefined : input.document,
      phone: input.phone === undefined ? undefined : input.phone,
      email: input.email === undefined ? undefined : input.email || null,
      zipCode: input.zipCode === undefined ? undefined : input.zipCode,
      street: input.street === undefined ? undefined : input.street,
      number: input.number === undefined ? undefined : input.number,
      complement: input.complement === undefined ? undefined : input.complement,
      district: input.district === undefined ? undefined : input.district,
      city: input.city === undefined ? undefined : input.city,
      state: input.state === undefined ? undefined : input.state || null,
      driveFolderUrl:
        input.driveFolderUrl === undefined ? undefined : input.driveFolderUrl || null,
      notes: input.notes === undefined ? undefined : input.notes,
      status: input.status ?? undefined,
    },
  });

  await recordAudit({
    userId: options.actorId ?? null,
    action: "customer.update",
    entity: "Customer",
    entityId: id,
    changes: input as Record<string, unknown>,
  });

  return customer;
}

/** Everything the customer page needs, finance included, in one round trip. */
export async function getCustomerDetails(id: string) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      sales: {
        where: { deletedAt: null },
        orderBy: { soldAt: "desc" },
        include: { items: { include: { product: true } } },
      },
      contracts: {
        where: { deletedAt: null },
        orderBy: { startDate: "desc" },
        include: {
          installments: {
            orderBy: { number: "asc" },
            include: { paymentMethod: true },
          },
        },
      },
      services: { include: { product: true }, orderBy: { createdAt: "desc" } },
      documents: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
      transactions: {
        orderBy: { competenceDate: "desc" },
        include: { paymentMethod: true, allocations: true },
      },
      crmCards: {
        where: { deletedAt: null },
        include: { stage: true },
      },
    },
  });

  if (!customer || customer.deletedAt) throw notFound("Cliente");

  const contractSummaries = customer.contracts.map((contract) => ({
    contract,
    summary: summarizeContract(contract.installments.map(toInstallmentLike)),
  }));

  const totals = contractSummaries.reduce(
    (acc, entry) => ({
      contracted: acc.contracted + Number(entry.summary.total.toFixed(2)),
      received: acc.received + Number(entry.summary.received.toFixed(2)),
      pending: acc.pending + Number(entry.summary.pending.toFixed(2)),
      overdueCount: acc.overdueCount + entry.summary.overdueCount,
    }),
    { contracted: 0, received: 0, pending: 0, overdueCount: 0 },
  );

  const nextDue = contractSummaries
    .map((entry) => entry.summary)
    .filter((summary) => summary.nextDueDate)
    .sort((a, b) => (a.nextDueDate!.getTime() ?? 0) - (b.nextDueDate!.getTime() ?? 0))[0];

  return { customer, contractSummaries, totals, nextDue: nextDue ?? null };
}

export async function searchCustomersForSelect(term: string) {
  const digits = onlyDigits(term);
  return prisma.customer.findMany({
    where: {
      deletedAt: null,
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        ...(digits.length >= 3 ? [{ document: { contains: digits } }] : []),
      ],
    },
    orderBy: { name: "asc" },
    take: 20,
    select: { id: true, name: true, document: true, phone: true },
  });
}
