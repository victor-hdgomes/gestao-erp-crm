import { prisma, type PrismaTransactionClient } from "@/lib/prisma";
import { notFound, unprocessable, validationError } from "@/lib/errors";
import { recordAudit } from "@/server/shared/audit";

export type StageInput = { name: string; color: string | null; isFinal: boolean };

/**
 * Posições são únicas na tabela inteira, então qualquer troca passa por um
 * valor temporário fora do alcance das reais.
 */
const PARKING_POSITION = -1;

export async function listStages(options: { includeInactive?: boolean } = {}) {
  return prisma.crmStage.findMany({
    where: options.includeInactive ? {} : { isActive: true },
    orderBy: { position: "asc" },
  });
}

/** Quantos cards vivos moram em cada etapa, para a tela avisar antes de remover. */
export async function countCardsByStage(): Promise<Map<string, number>> {
  const rows = await prisma.crmCard.groupBy({
    by: ["stageId"],
    where: { deletedAt: null },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.stageId, row._count._all]));
}

function normalize(input: StageInput): StageInput {
  const name = input.name.trim();
  if (name.length < 2) throw validationError("Informe um nome para a etapa.");
  const color = input.color?.trim() || null;
  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
    throw validationError("A cor precisa estar no formato #rrggbb.");
  }
  return { name, color, isFinal: input.isFinal };
}

export async function createStage(input: StageInput, options: { actorId?: string | null } = {}) {
  const data = normalize(input);

  return prisma.$transaction(async (tx) => {
    const last = await tx.crmStage.findFirst({
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const stage = await tx.crmStage.create({
      data: { ...data, position: (last?.position ?? 0) + 1 },
    });

    await recordAudit(
      {
        userId: options.actorId ?? null,
        action: "crm.stage.create",
        entity: "CrmStage",
        entityId: stage.id,
        changes: { name: stage.name },
      },
      tx,
    );

    return stage;
  });
}

export async function updateStage(
  id: string,
  input: StageInput,
  options: { actorId?: string | null } = {},
) {
  const data = normalize(input);
  const current = await prisma.crmStage.findUnique({ where: { id } });
  if (!current) throw notFound("Etapa");

  const stage = await prisma.crmStage.update({ where: { id }, data });

  await recordAudit({
    userId: options.actorId ?? null,
    action: "crm.stage.update",
    entity: "CrmStage",
    entityId: id,
    changes: { from: { name: current.name, isFinal: current.isFinal }, to: data },
  });

  return stage;
}

/** Troca a etapa de lugar com a vizinha ativa, para cima ou para baixo. */
export async function moveStage(
  id: string,
  direction: "up" | "down",
  options: { actorId?: string | null } = {},
) {
  return prisma.$transaction(async (tx) => {
    const stage = await tx.crmStage.findUnique({ where: { id } });
    if (!stage || !stage.isActive) throw notFound("Etapa");

    const neighbour = await tx.crmStage.findFirst({
      where: {
        isActive: true,
        position: direction === "up" ? { lt: stage.position } : { gt: stage.position },
      },
      orderBy: { position: direction === "up" ? "desc" : "asc" },
    });
    if (!neighbour) return stage;

    await tx.crmStage.update({ where: { id: stage.id }, data: { position: PARKING_POSITION } });
    await tx.crmStage.update({
      where: { id: neighbour.id },
      data: { position: stage.position },
    });
    const moved = await tx.crmStage.update({
      where: { id: stage.id },
      data: { position: neighbour.position },
    });

    await recordAudit(
      {
        userId: options.actorId ?? null,
        action: "crm.stage.reorder",
        entity: "CrmStage",
        entityId: id,
        changes: { direction, swappedWith: neighbour.name },
      },
      tx,
    );

    return moved;
  });
}

async function nextCardPosition(tx: PrismaTransactionClient, stageId: string): Promise<number> {
  const last = await tx.crmCard.findFirst({
    where: { stageId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return (last?.position ?? 0) + 1;
}

/**
 * Tira a etapa do quadro e manda os cards dela para outra. A linha não é
 * apagada de verdade: o histórico de movimentações aponta para ela, e um
 * "passou por Cancelados" precisa continuar legível depois que a coluna some.
 */
export async function removeStage(
  id: string,
  targetStageId: string,
  options: { actorId?: string | null } = {},
) {
  return prisma.$transaction(async (tx) => {
    const stage = await tx.crmStage.findUnique({ where: { id } });
    if (!stage || !stage.isActive) throw notFound("Etapa");

    if (targetStageId === id) {
      throw unprocessable("Escolha uma etapa diferente para receber os cards.");
    }

    const target = await tx.crmStage.findUnique({ where: { id: targetStageId } });
    if (!target || !target.isActive) throw notFound("Etapa de destino");

    const remaining = await tx.crmStage.count({ where: { isActive: true } });
    if (remaining <= 1) throw unprocessable("O quadro precisa de pelo menos uma etapa.");

    const cards = await tx.crmCard.findMany({
      where: { stageId: id },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { id: true, serviceId: true },
    });

    let position = await nextCardPosition(tx, target.id);
    const now = new Date();

    for (const card of cards) {
      await tx.crmCard.update({
        where: { id: card.id },
        data: {
          stageId: target.id,
          position,
          enteredStageAt: now,
          status: target.isFinal ? "DONE" : "OPEN",
        },
      });

      // A movimentação é real e entra no histórico como qualquer outra.
      await tx.crmStageHistory.create({
        data: {
          cardId: card.id,
          fromStageId: id,
          toStageId: target.id,
          movedById: options.actorId ?? null,
          note: `Etapa "${stage.name}" removida do quadro.`,
        },
      });

      if (card.serviceId) {
        await tx.serviceExecution.update({
          where: { id: card.serviceId },
          data: {
            status: target.isFinal ? "COMPLETED" : "IN_PROGRESS",
            completedAt: target.isFinal ? now : null,
          },
        });
      }

      position += 1;
    }

    // Sai da numeração das ativas para não deixar buraco nem travar a posição.
    const lastPosition = await tx.crmStage.findFirst({
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const removed = await tx.crmStage.update({
      where: { id },
      data: { isActive: false, position: (lastPosition?.position ?? 0) + 1 },
    });

    await recordAudit(
      {
        userId: options.actorId ?? null,
        action: "crm.stage.remove",
        entity: "CrmStage",
        entityId: id,
        changes: { name: stage.name, movedTo: target.name, cards: cards.length },
      },
      tx,
    );

    return { stage: removed, movedCards: cards.length };
  });
}
