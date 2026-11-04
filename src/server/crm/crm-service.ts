import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/errors";
import { recordAudit } from "@/server/shared/audit";
import { summarizeContract } from "@/server/finance/calculations";
import { toInstallmentLike } from "@/server/finance/transactions";
import { moneyToString } from "@/lib/money";

export type KanbanCard = {
  id: string;
  title: string;
  position: number;
  customer: { id: string; name: string; document: string | null; phone: string | null };
  contract: {
    id: string;
    code: string;
    startDate: string;
    total: string;
    received: string;
    pending: string;
    overdueCount: number;
    nextDueDate: string | null;
    nextDueAmount: string | null;
  } | null;
  enteredStageAt: string;
  assignee: { id: string; name: string } | null;
};

export type KanbanColumn = {
  id: string;
  name: string;
  position: number;
  color: string | null;
  isFinal: boolean;
  cards: KanbanCard[];
  totals: { count: number; contracted: string; received: string; pending: string };
};

export type KanbanFilters = {
  search?: string;
  assigneeId?: string;
  onlyOverdue?: boolean;
};

/** Builds the whole board in one pass, reading finance from the ERP entities. */
export async function getKanbanBoard(filters: KanbanFilters = {}): Promise<KanbanColumn[]> {
  const stages = await prisma.crmStage.findMany({
    where: { isActive: true },
    orderBy: { position: "asc" },
  });

  const cards = await prisma.crmCard.findMany({
    where: {
      deletedAt: null,
      status: { not: "ARCHIVED" },
      assigneeId: filters.assigneeId ?? undefined,
      ...(filters.search ? { OR: buildSearchConditions(filters.search) } : {}),
    },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: {
      customer: { select: { id: true, name: true, document: true, phone: true } },
      assignee: { select: { id: true, name: true } },
      contract: { include: { installments: { orderBy: { number: "asc" } } } },
    },
  });

  const byStage = new Map<string, KanbanCard[]>();

  for (const card of cards) {
    const summary = card.contract
      ? summarizeContract(card.contract.installments.map(toInstallmentLike))
      : null;

    if (filters.onlyOverdue && (!summary || summary.overdueCount === 0)) continue;

    const entry: KanbanCard = {
      id: card.id,
      title: card.title,
      position: card.position,
      customer: card.customer,
      enteredStageAt: card.enteredStageAt.toISOString(),
      assignee: card.assignee,
      contract:
        card.contract && summary
          ? {
              id: card.contract.id,
              code: card.contract.code,
              startDate: card.contract.startDate.toISOString(),
              total: moneyToString(summary.total),
              received: moneyToString(summary.received),
              pending: moneyToString(summary.pending),
              overdueCount: summary.overdueCount,
              nextDueDate: summary.nextDueDate?.toISOString() ?? null,
              nextDueAmount: summary.nextDueAmount ? moneyToString(summary.nextDueAmount) : null,
            }
          : null,
    };

    const list = byStage.get(card.stageId) ?? [];
    list.push(entry);
    byStage.set(card.stageId, list);
  }

  return stages.map((stage) => {
    const stageCards = byStage.get(stage.id) ?? [];
    return {
      id: stage.id,
      name: stage.name,
      position: stage.position,
      color: stage.color,
      isFinal: stage.isFinal,
      cards: stageCards,
      totals: {
        count: stageCards.length,
        contracted: sumStrings(stageCards.map((card) => card.contract?.total ?? "0")),
        received: sumStrings(stageCards.map((card) => card.contract?.received ?? "0")),
        pending: sumStrings(stageCards.map((card) => card.contract?.pending ?? "0")),
      },
    };
  });
}

/**
 * A term with no digits must not add a `document contains ""` clause, which
 * would match every customer and return the whole board.
 */
function buildSearchConditions(search: string) {
  const digits = search.replace(/\D/g, "");

  return [
    { title: { contains: search, mode: "insensitive" as const } },
    { customer: { name: { contains: search, mode: "insensitive" as const } } },
    ...(digits.length >= 3 ? [{ customer: { document: { contains: digits } } }] : []),
  ];
}

function sumStrings(values: string[]): string {
  return values.reduce((acc, value) => acc + Number(value), 0).toFixed(2);
}

export async function moveCard(
  cardId: string,
  params: { toStageId: string; position?: number; note?: string | null },
  options: { actorId?: string | null; actorLabel?: string | null } = {},
) {
  return prisma.$transaction(async (tx) => {
    const card = await tx.crmCard.findUnique({ where: { id: cardId } });
    if (!card || card.deletedAt) throw notFound("Card");

    const stage = await tx.crmStage.findUnique({ where: { id: params.toStageId } });
    if (!stage) throw notFound("Etapa");

    const position =
      params.position ??
      ((
        await tx.crmCard.findFirst({
          where: { stageId: stage.id },
          orderBy: { position: "desc" },
          select: { position: true },
        })
      )?.position ?? 0) + 1;

    const updated = await tx.crmCard.update({
      where: { id: cardId },
      data: {
        stageId: stage.id,
        position,
        enteredStageAt: card.stageId === stage.id ? card.enteredStageAt : new Date(),
        status: stage.isFinal ? "DONE" : "OPEN",
      },
    });

    if (card.stageId !== stage.id) {
      await tx.crmStageHistory.create({
        data: {
          cardId,
          fromStageId: card.stageId,
          toStageId: stage.id,
          movedById: options.actorId ?? null,
          note: params.note ?? null,
        },
      });

      if (card.serviceId) {
        await tx.serviceExecution.update({
          where: { id: card.serviceId },
          data: {
            status: stage.isFinal ? "COMPLETED" : "IN_PROGRESS",
            startedAt: stage.isFinal ? undefined : new Date(),
            completedAt: stage.isFinal ? new Date() : null,
          },
        });
      }

      await recordAudit(
        {
          userId: options.actorId ?? null,
          actorLabel: options.actorLabel ?? null,
          action: "crm.card.move",
          entity: "CrmCard",
          entityId: cardId,
          changes: { fromStageId: card.stageId, toStageId: stage.id },
        },
        tx,
      );
    }

    return updated;
  });
}

export async function getCardDetails(cardId: string) {
  const card = await prisma.crmCard.findUnique({
    where: { id: cardId },
    include: {
      customer: true,
      assignee: { select: { id: true, name: true } },
      stage: true,
      service: { include: { product: true } },
      contract: {
        include: {
          installments: {
            orderBy: { number: "asc" },
            include: {
              paymentMethod: true,
              allocations: {
                where: { reversedAt: null },
                include: { transaction: true },
              },
            },
          },
          documents: true,
        },
      },
      history: {
        orderBy: { createdAt: "desc" },
        include: { fromStage: true, toStage: true, movedBy: { select: { name: true } } },
      },
    },
  });

  if (!card) throw notFound("Card");
  return card;
}
