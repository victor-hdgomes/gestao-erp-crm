import type { PrismaTransactionClient } from "@/lib/prisma";

export type CodedEntity = "sale" | "contract" | "transaction";

const PREFIX: Record<CodedEntity, string> = {
  sale: "VND",
  contract: "CTR",
  transaction: "TRX",
};

/**
 * Sequential, human readable code scoped to the current year.
 * Callers run inside a serializable transaction and the unique constraint on
 * `code` is the final guard, so a concurrent writer fails and is retried.
 */
export async function generateCode(
  tx: PrismaTransactionClient,
  entity: CodedEntity,
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `${PREFIX[entity]}-${year}-`;

  const last = await findLast(tx, entity, prefix);
  const lastNumber = last ? Number.parseInt(last.slice(prefix.length), 10) : 0;
  const next = Number.isFinite(lastNumber) ? lastNumber + 1 : 1;

  return `${prefix}${String(next).padStart(5, "0")}`;
}

async function findLast(
  tx: PrismaTransactionClient,
  entity: CodedEntity,
  prefix: string,
): Promise<string | null> {
  const where = { code: { startsWith: prefix } };
  const orderBy = { code: "desc" } as const;

  if (entity === "sale") {
    const row = await tx.sale.findFirst({ where, orderBy, select: { code: true } });
    return row?.code ?? null;
  }
  if (entity === "contract") {
    const row = await tx.contract.findFirst({ where, orderBy, select: { code: true } });
    return row?.code ?? null;
  }
  const row = await tx.transaction.findFirst({ where, orderBy, select: { code: true } });
  return row?.code ?? null;
}
