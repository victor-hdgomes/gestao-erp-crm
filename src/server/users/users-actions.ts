"use server";

import { revalidatePath } from "next/cache";

import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import {
  createUser,
  updateUser,
  userCreateSchema,
  userUpdateSchema,
} from "@/server/users/users-service";
import { toActionResult, type ActionResult } from "@/server/shared/action-result";

export async function createUserAction(payload: unknown): Promise<ActionResult<{ id: string }>> {
  return toActionResult(async () => {
    const actor = await requirePermission(PERMISSIONS.USER_MANAGE);
    const input = userCreateSchema.parse(payload);
    const user = await createUser(input, { actorId: actor.id });
    revalidatePath("/usuarios");
    return { id: user.id };
  });
}

export async function updateUserAction(
  id: string,
  payload: unknown,
): Promise<ActionResult<null>> {
  return toActionResult(async () => {
    const actor = await requirePermission(PERMISSIONS.USER_MANAGE);
    const input = userUpdateSchema.parse(payload);
    await updateUser(id, input, { actorId: actor.id });
    revalidatePath("/usuarios");
    return null;
  });
}
