"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { moveCard } from "@/server/crm/crm-service";
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
