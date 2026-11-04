import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/errors";
import { optionalString, urlSchema } from "@/lib/schemas/common";
import { recordAudit } from "@/server/shared/audit";

export const documentCreateSchema = z.object({
  customerId: z.string().min(1).nullable().optional(),
  contractId: z.string().min(1).nullable().optional(),
  title: z.string().trim().min(2, "Informe um título."),
  url: urlSchema,
  kind: z.enum(["DRIVE_FOLDER", "CONTRACT", "RECEIPT", "OTHER"]).default("OTHER"),
  notes: optionalString,
});

export type DocumentCreateInput = z.infer<typeof documentCreateSchema>;

export async function listDocuments(filters: { search?: string; customerId?: string } = {}) {
  return prisma.document.findMany({
    where: {
      deletedAt: null,
      customerId: filters.customerId,
      ...(filters.search
        ? { title: { contains: filters.search, mode: "insensitive" as const } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { id: true, name: true } },
      contract: { select: { id: true, code: true } },
    },
  });
}

export async function createDocument(
  input: DocumentCreateInput,
  options: { actorId?: string | null; externalId?: string | null } = {},
) {
  const document = await prisma.document.create({
    data: {
      customerId: input.customerId ?? null,
      contractId: input.contractId ?? null,
      title: input.title,
      url: input.url,
      kind: input.kind,
      notes: input.notes ?? null,
      externalId: options.externalId ?? null,
    },
  });

  await recordAudit({
    userId: options.actorId ?? null,
    action: "document.create",
    entity: "Document",
    entityId: document.id,
    changes: { title: document.title },
  });

  return document;
}

export async function deleteDocument(id: string, options: { actorId?: string | null } = {}) {
  const document = await prisma.document.findUnique({ where: { id } });
  if (!document || document.deletedAt) throw notFound("Documento");

  await prisma.document.update({ where: { id }, data: { deletedAt: new Date() } });

  await recordAudit({
    userId: options.actorId ?? null,
    action: "document.delete",
    entity: "Document",
    entityId: id,
  });
}
