import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  createStage,
  listStages,
  moveStage,
  removeStage,
  updateStage,
} from "@/server/crm/stages-service";
import { cleanupByPrefix, makeCpf, testPrisma } from "../helpers/db";

const PREFIX = "TEST_STAGE_";

/**
 * Remover uma coluna do Kanban nunca pode largar um card no vazio: os cards
 * mudam de etapa de verdade, com histórico, e a etapa antiga continua legível.
 */
describe("etapas do CRM", () => {
  const createdStageIds: string[] = [];
  let seed = 400000000;

  async function newStage(label: string, isFinal = false) {
    const stage = await createStage({
      name: `${PREFIX}${label}`,
      color: "#123456",
      isFinal,
    });
    createdStageIds.push(stage.id);
    return stage;
  }

  async function newCardIn(stageId: string, label: string) {
    seed += 1;
    const customer = await testPrisma.customer.create({
      data: {
        name: `${PREFIX}${label}`,
        document: makeCpf(seed),
        phone: "11988887777",
        status: "LEAD",
      },
    });
    return testPrisma.crmCard.create({
      data: {
        customerId: customer.id,
        stageId,
        title: `${PREFIX}${label}`,
        position: 1,
      },
    });
  }

  beforeAll(async () => {
    await cleanupByPrefix(PREFIX);
  });

  afterAll(async () => {
    await cleanupByPrefix(PREFIX);
    if (createdStageIds.length > 0) {
      await testPrisma.crmStageHistory.deleteMany({
        where: {
          OR: [
            { fromStageId: { in: createdStageIds } },
            { toStageId: { in: createdStageIds } },
          ],
        },
      });
      await testPrisma.crmCard.deleteMany({ where: { stageId: { in: createdStageIds } } });
      await testPrisma.crmStage.deleteMany({ where: { id: { in: createdStageIds } } });
    }
    await prisma.$disconnect();
    await testPrisma.$disconnect();
  });

  it("cria a etapa no fim do quadro", async () => {
    const before = await listStages();
    const stage = await newStage("nova");
    const after = await listStages();

    expect(after).toHaveLength(before.length + 1);
    expect(after[after.length - 1].id).toBe(stage.id);
    expect(stage.color).toBe("#123456");
  });

  it("recusa nome curto e cor fora do formato", async () => {
    await expect(createStage({ name: "x", color: null, isFinal: false })).rejects.toThrow(
      /nome/i,
    );
    await expect(
      createStage({ name: `${PREFIX}cor`, color: "vermelho", isFinal: false }),
    ).rejects.toThrow(/#rrggbb/i);
  });

  it("renomeia sem mexer na posição", async () => {
    const stage = await newStage("renomear");
    const updated = await updateStage(stage.id, {
      name: `${PREFIX}renomeada`,
      color: null,
      isFinal: false,
    });

    expect(updated.name).toBe(`${PREFIX}renomeada`);
    expect(updated.position).toBe(stage.position);
  });

  it("troca de lugar com a vizinha", async () => {
    const first = await newStage("ordem-a");
    const second = await newStage("ordem-b");

    await moveStage(second.id, "up");

    const stages = await listStages();
    const positions = new Map(stages.map((stage) => [stage.id, stage.position]));
    expect(positions.get(second.id)!).toBeLessThan(positions.get(first.id)!);

    // E volta, para a posição não ser um caminho só de ida.
    await moveStage(second.id, "down");
    const back = await listStages();
    const after = new Map(back.map((stage) => [stage.id, stage.position]));
    expect(after.get(second.id)!).toBeGreaterThan(after.get(first.id)!);
  });

  it("leva os cards para a etapa escolhida ao remover", async () => {
    const doomed = await newStage("cancelados");
    const target = await newStage("destino");
    const cardA = await newCardIn(doomed.id, "card-a");
    const cardB = await newCardIn(doomed.id, "card-b");

    const result = await removeStage(doomed.id, target.id);

    expect(result.movedCards).toBe(2);
    for (const card of [cardA, cardB]) {
      const moved = await testPrisma.crmCard.findUniqueOrThrow({ where: { id: card.id } });
      expect(moved.stageId).toBe(target.id);
    }

    // A etapa sai do quadro mas continua no banco, para o histórico ter nome.
    expect((await listStages()).some((stage) => stage.id === doomed.id)).toBe(false);
    const kept = await testPrisma.crmStage.findUniqueOrThrow({ where: { id: doomed.id } });
    expect(kept.isActive).toBe(false);

    const history = await testPrisma.crmStageHistory.findMany({
      where: { cardId: cardA.id, fromStageId: doomed.id },
    });
    expect(history).toHaveLength(1);
    expect(history[0].toStageId).toBe(target.id);
  });

  it("conclui o card quando o destino é uma etapa final", async () => {
    const doomed = await newStage("sai");
    const target = await newStage("fim", true);
    const card = await newCardIn(doomed.id, "card-final");

    await removeStage(doomed.id, target.id);

    const moved = await testPrisma.crmCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(moved.status).toBe("DONE");
  });

  it("recusa mandar os cards para a própria etapa removida", async () => {
    const stage = await newStage("mesma");
    await expect(removeStage(stage.id, stage.id)).rejects.toThrow(/diferente/i);
  });

  it("recusa um destino que não existe", async () => {
    const stage = await newStage("sem-destino");
    await expect(removeStage(stage.id, "nao-existe")).rejects.toThrow(/destino/i);
  });
});
