import { prisma } from "@/lib/prisma";
import { notFound, validationError } from "@/lib/errors";
import { recordAudit } from "@/server/shared/audit";
import { toCents } from "@/lib/money";
import type { ProductCreateInput } from "@/lib/schemas/catalog";

export async function listProducts(filters: { search?: string; onlyActive?: boolean } = {}) {
  return prisma.productService.findMany({
    where: {
      deletedAt: null,
      isActive: filters.onlyActive ? true : undefined,
      ...(filters.search
        ? { name: { contains: filters.search, mode: "insensitive" as const } }
        : {}),
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
}

export async function createProduct(
  input: ProductCreateInput,
  options: { actorId?: string | null } = {},
) {
  const product = await prisma.productService.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      category: input.category ?? null,
      kind: input.kind,
      defaultPrice: toCents(input.defaultPrice).toFixed(2),
      defaultCost: toCents(input.defaultCost ?? "0").toFixed(2),
      allowCustomPrice: input.allowCustomPrice,
      createsCrmCard: input.createsCrmCard,
      isActive: input.isActive,
    },
  });

  await recordAudit({
    userId: options.actorId ?? null,
    action: "catalog.product.create",
    entity: "ProductService",
    entityId: product.id,
    changes: { name: product.name },
  });

  return product;
}

export async function updateProduct(
  id: string,
  input: Partial<ProductCreateInput>,
  options: { actorId?: string | null } = {},
) {
  const existing = await prisma.productService.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) throw notFound("Serviço");

  const product = await prisma.productService.update({
    where: { id },
    data: {
      name: input.name ?? undefined,
      description: input.description === undefined ? undefined : input.description,
      category: input.category === undefined ? undefined : input.category,
      kind: input.kind ?? undefined,
      defaultPrice:
        input.defaultPrice === undefined ? undefined : toCents(input.defaultPrice).toFixed(2),
      defaultCost:
        input.defaultCost === undefined ? undefined : toCents(input.defaultCost).toFixed(2),
      allowCustomPrice: input.allowCustomPrice ?? undefined,
      createsCrmCard: input.createsCrmCard ?? undefined,
      isActive: input.isActive ?? undefined,
    },
  });

  await recordAudit({
    userId: options.actorId ?? null,
    action: "catalog.product.update",
    entity: "ProductService",
    entityId: id,
    changes: input as Record<string, unknown>,
  });

  return product;
}

export async function archiveProduct(id: string, options: { actorId?: string | null } = {}) {
  await prisma.productService.update({
    where: { id },
    data: { isActive: false, deletedAt: new Date() },
  });

  await recordAudit({
    userId: options.actorId ?? null,
    action: "catalog.product.archive",
    entity: "ProductService",
    entityId: id,
  });
}

export async function listPaymentMethods() {
  return prisma.paymentMethod.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
}

export async function listExpenseCategories() {
  return prisma.expenseCategory.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
}

/** Slug used as the stable key of a lookup row, so renames never break references. */
function toLookupKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function createExpenseCategory(
  name: string,
  options: { actorId?: string | null } = {},
) {
  const label = name.trim();
  const key = toLookupKey(label);
  if (key.length < 2) throw validationError("Informe um nome para a categoria.");

  const existing = await prisma.expenseCategory.findUnique({ where: { key } });
  if (existing) {
    // Reactivating beats creating a near-duplicate the user would have to clean up.
    if (existing.isActive) return existing;
    return prisma.expenseCategory.update({
      where: { id: existing.id },
      data: { isActive: true, name: label },
    });
  }

  const category = await prisma.expenseCategory.create({ data: { key, name: label } });

  await recordAudit({
    userId: options.actorId ?? null,
    action: "catalog.expenseCategory.create",
    entity: "ExpenseCategory",
    entityId: category.id,
    changes: { key, name: label },
  });

  return category;
}

export async function createPaymentMethod(
  name: string,
  options: { actorId?: string | null } = {},
) {
  const label = name.trim();
  const key = toLookupKey(label);
  if (key.length < 2) throw validationError("Informe um nome para a forma de pagamento.");

  const existing = await prisma.paymentMethod.findUnique({ where: { key } });
  if (existing) {
    if (existing.isActive) return existing;
    return prisma.paymentMethod.update({
      where: { id: existing.id },
      data: { isActive: true, name: label },
    });
  }

  const method = await prisma.paymentMethod.create({ data: { key, name: label } });

  await recordAudit({
    userId: options.actorId ?? null,
    action: "catalog.paymentMethod.create",
    entity: "PaymentMethod",
    entityId: method.id,
    changes: { key, name: label },
  });

  return method;
}
