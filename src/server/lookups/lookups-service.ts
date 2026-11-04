import { prisma } from "@/lib/prisma";
import { notFound, unprocessable, validationError } from "@/lib/errors";
import { recordAudit } from "@/server/shared/audit";

export type TransactionCategoryKind = "INCOME" | "EXPENSE";

/** Slug used as the stable key of a lookup row, so renames never break references. */
export function toLookupKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// ---------------------------------------------------------------------------
// Categorias de receita e de despesa
// ---------------------------------------------------------------------------

export async function listTransactionCategories(
  filters: { kind?: TransactionCategoryKind; includeInactive?: boolean } = {},
) {
  return prisma.transactionCategory.findMany({
    where: {
      kind: filters.kind,
      ...(filters.includeInactive ? {} : { isActive: true }),
    },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });
}

export async function createTransactionCategory(
  name: string,
  kind: TransactionCategoryKind = "EXPENSE",
  options: { actorId?: string | null } = {},
) {
  const label = name.trim();
  const key = toLookupKey(label);
  if (key.length < 2) throw validationError("Informe um nome para a categoria.");

  // The key is unique across both kinds, so "Consultas" cannot be a category of
  // income and of expense at the same time — which is what the operator means
  // when they say the word anyway.
  const existing = await prisma.transactionCategory.findUnique({ where: { key } });
  if (existing) {
    if (existing.kind !== kind) {
      throw unprocessable(
        `Já existe uma categoria de ${existing.kind === "INCOME" ? "receita" : "despesa"} chamada "${existing.name}".`,
      );
    }
    // Reactivating beats creating a near-duplicate the user would have to clean up.
    if (existing.isActive) return existing;
    return prisma.transactionCategory.update({
      where: { id: existing.id },
      data: { isActive: true, name: label },
    });
  }

  const category = await prisma.transactionCategory.create({ data: { key, name: label, kind } });

  await recordAudit({
    userId: options.actorId ?? null,
    action: "lookup.transactionCategory.create",
    entity: "TransactionCategory",
    entityId: category.id,
    changes: { key, name: label, kind },
  });

  return category;
}

export async function updateTransactionCategory(
  id: string,
  input: { name: string; isActive: boolean },
  options: { actorId?: string | null } = {},
) {
  const current = await prisma.transactionCategory.findUnique({ where: { id } });
  if (!current) throw notFound("Categoria");

  const label = input.name.trim();
  if (toLookupKey(label).length < 2) throw validationError("Informe um nome para a categoria.");
  if (current.isSystem && !input.isActive) {
    throw unprocessable(
      `"${current.name}" é usada pelos indicadores do dashboard e não pode ser desativada.`,
    );
  }

  // The key stays as it was born: renaming is a label change, and every
  // transaction already pointing here must keep pointing here.
  const category = await prisma.transactionCategory.update({
    where: { id },
    data: { name: label, isActive: input.isActive },
  });

  await recordAudit({
    userId: options.actorId ?? null,
    action: "lookup.transactionCategory.update",
    entity: "TransactionCategory",
    entityId: id,
    changes: { from: { name: current.name, isActive: current.isActive }, to: input },
  });

  return category;
}

export async function archiveTransactionCategory(
  id: string,
  options: { actorId?: string | null } = {},
) {
  const current = await prisma.transactionCategory.findUnique({ where: { id } });
  if (!current) throw notFound("Categoria");
  if (current.isSystem) {
    throw unprocessable(`"${current.name}" é uma categoria do sistema e não pode ser removida.`);
  }

  // Lançamentos antigos continuam apontando para ela; arquivar só a tira das
  // listas de escolha, para o histórico não perder o rótulo.
  const category = await prisma.transactionCategory.update({
    where: { id },
    data: { isActive: false },
  });

  await recordAudit({
    userId: options.actorId ?? null,
    action: "lookup.transactionCategory.archive",
    entity: "TransactionCategory",
    entityId: id,
    changes: { name: current.name },
  });

  return category;
}

export async function countTransactionsByCategory(ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where: { categoryId: { in: ids } },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.categoryId ?? "", row._count._all]));
}

// ---------------------------------------------------------------------------
// Tipos de documento
// ---------------------------------------------------------------------------

export async function listDocumentTypes(filters: { includeInactive?: boolean } = {}) {
  return prisma.documentType.findMany({
    where: filters.includeInactive ? {} : { isActive: true },
    orderBy: { name: "asc" },
  });
}

export async function createDocumentType(
  name: string,
  options: { actorId?: string | null } = {},
) {
  const label = name.trim();
  const key = toLookupKey(label);
  if (key.length < 2) throw validationError("Informe um nome para o tipo de documento.");

  const existing = await prisma.documentType.findUnique({ where: { key } });
  if (existing) {
    if (existing.isActive) return existing;
    return prisma.documentType.update({
      where: { id: existing.id },
      data: { isActive: true, name: label },
    });
  }

  const type = await prisma.documentType.create({ data: { key, name: label } });

  await recordAudit({
    userId: options.actorId ?? null,
    action: "lookup.documentType.create",
    entity: "DocumentType",
    entityId: type.id,
    changes: { key, name: label },
  });

  return type;
}

export async function updateDocumentType(
  id: string,
  input: { name: string; isActive: boolean },
  options: { actorId?: string | null } = {},
) {
  const current = await prisma.documentType.findUnique({ where: { id } });
  if (!current) throw notFound("Tipo de documento");

  const label = input.name.trim();
  if (toLookupKey(label).length < 2) {
    throw validationError("Informe um nome para o tipo de documento.");
  }
  if (current.isSystem && !input.isActive) {
    throw unprocessable(
      `"${current.name}" é criado automaticamente pelo sistema e não pode ser desativado.`,
    );
  }

  const type = await prisma.documentType.update({
    where: { id },
    data: { name: label, isActive: input.isActive },
  });

  await recordAudit({
    userId: options.actorId ?? null,
    action: "lookup.documentType.update",
    entity: "DocumentType",
    entityId: id,
    changes: { from: { name: current.name, isActive: current.isActive }, to: input },
  });

  return type;
}

export async function archiveDocumentType(id: string, options: { actorId?: string | null } = {}) {
  const current = await prisma.documentType.findUnique({ where: { id } });
  if (!current) throw notFound("Tipo de documento");
  if (current.isSystem) {
    throw unprocessable(`"${current.name}" é um tipo do sistema e não pode ser removido.`);
  }

  const type = await prisma.documentType.update({ where: { id }, data: { isActive: false } });

  await recordAudit({
    userId: options.actorId ?? null,
    action: "lookup.documentType.archive",
    entity: "DocumentType",
    entityId: id,
    changes: { name: current.name },
  });

  return type;
}

export async function countDocumentsByType(ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.document.groupBy({
    by: ["typeId"],
    where: { typeId: { in: ids }, deletedAt: null },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.typeId ?? "", row._count._all]));
}
