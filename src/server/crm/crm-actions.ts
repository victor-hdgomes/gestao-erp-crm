"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { moveCard } from "@/server/crm/crm-service";
import {
  createStage,
  moveStage,
  removeStage,
  updateStage,
} from "@/server/crm/stages-service";
import { getCardDetailsDto, type CardDetailsDto } from "@/server/crm/card-details";
import { toActionResult, type ActionResult } from "@/server/shared/action-result";

const moveSchema = z.object({
  cardId: z.string().min(1),
  toStageId: z.string().min(1),
  position: z.number().int().optional(),
  note: z.string().trim().optional().nullable(),
});

export async function moveCardAction(payload: unknown): Promise<ActionResult<null>> {
  return toActionResult(async () => {
    const user = await requirePermission(PERMISSIONS.CRM_MANAGE);
    const input = moveSchema.parse(payload);

    await moveCard(
      input.cardId,
      { toStageId: input.toStageId, position: input.position, note: input.note ?? null },
      { actorId: user.id, actorLabel: user.name },
    );

    revalidatePath("/crm");
    return null;
  });
}

export async function loadCardDetailsAction(
  cardId: string,
): Promise<ActionResult<CardDetailsDto>> {
  return toActionResult(async () => {
    await requirePermission(PERMISSIONS.CRM_VIEW);
    return getCardDetailsDto(cardId);
  });
}

const stageSchema = z.object({
  name: z.string().trim().min(2, "Informe um nome para a etapa."),
  color: z.string().trim().nullable().optional(),
  isFinal: z.boolean().default(false),
});

function revalidateStages() {
  revalidatePath("/crm");
  revalidatePath("/cadastros");
}

export async function createStageAction(
  payload: unknown,
): Promise<ActionResult<{ id: string; name: string }>> {
  return toActionResult(async () => {
    const user = await requirePermission(PERMISSIONS.CRM_MANAGE);
    const input = stageSchema.parse(payload);
    const stage = await createStage(
      { name: input.name, color: input.color ?? null, isFinal: input.isFinal },
      { actorId: user.id },
    );
    revalidateStages();
    return { id: stage.id, name: stage.name };
  });
}

export async function updateStageAction(
  id: string,
  payload: unknown,
): Promise<ActionResult<{ id: string; name: string }>> {
  return toActionResult(async () => {
    const user = await requirePermission(PERMISSIONS.CRM_MANAGE);
    const input = stageSchema.parse(payload);
    const stage = await updateStage(
      id,
      { name: input.name, color: input.color ?? null, isFinal: input.isFinal },
      { actorId: user.id },
    );
    revalidateStages();
    return { id: stage.id, name: stage.name };
  });
}

export async function moveStageAction(
  id: string,
  direction: "up" | "down",
): Promise<ActionResult<null>> {
  return toActionResult(async () => {
    const user = await requirePermission(PERMISSIONS.CRM_MANAGE);
    await moveStage(id, direction, { actorId: user.id });
    revalidateStages();
    return null;
  });
}

export async function removeStageAction(
  id: string,
  targetStageId: string,
): Promise<ActionResult<{ movedCards: number }>> {
  return toActionResult(async () => {
    const user = await requirePermission(PERMISSIONS.CRM_MANAGE);
    const result = await removeStage(id, targetStageId, { actorId: user.id });
    revalidateStages();
    return { movedCards: result.movedCards };
  });
}
