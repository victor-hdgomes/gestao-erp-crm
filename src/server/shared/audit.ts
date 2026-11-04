import { Prisma } from "@/generated/prisma/client";
import { prisma, type PrismaTransactionClient } from "@/lib/prisma";

export type AuditInput = {
  userId?: string | null;
  actorLabel?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  changes?: Record<string, unknown> | null;
  ipAddress?: string | null;
};

const SENSITIVE_KEYS = ["password", "token", "secret", "accessToken", "apiKey", "valueEncrypted"];

/** Drops credential-like values so audit rows never carry secrets. */
function sanitize(changes: Record<string, unknown> | null | undefined) {
  if (!changes) return undefined;
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(changes)) {
    clean[key] = SENSITIVE_KEYS.some((needle) =>
      key.toLowerCase().includes(needle.toLowerCase()),
    )
      ? "[redacted]"
      : value;
  }
  return clean;
}

export async function recordAudit(
  input: AuditInput,
  client: PrismaTransactionClient = prisma,
): Promise<void> {
  await client.auditLog.create({
    data: {
      userId: input.userId ?? null,
      actorLabel: input.actorLabel ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      changes: (sanitize(input.changes) ?? undefined) as Prisma.InputJsonValue | undefined,
      ipAddress: input.ipAddress ?? null,
    },
  });
}
