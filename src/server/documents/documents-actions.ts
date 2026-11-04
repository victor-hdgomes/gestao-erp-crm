"use server";

import { revalidatePath } from "next/cache";

import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import {
  createDocument,
  deleteDocument,
  documentCreateSchema,
} from "@/server/documents/documents-service";
import { toActionResult, type ActionResult } from "@/server/shared/action-result";

export async function createDocumentAction(
  payload: unknown,
): Promise<ActionResult<{ id: string }>> {
  return toActionResult(async () => {
    const user = await requirePermission(PERMISSIONS.DOCUMENT_MANAGE);
    const input = documentCreateSchema.parse(payload);
    const document = await createDocument(input, { actorId: user.id });

    revalidatePath("/documentos");
    if (input.customerId) revalidatePath(`/clientes/${input.customerId}`);
    return { id: document.id };
  });
}

export async function deleteDocumentAction(id: string): Promise<ActionResult<null>> {
  return toActionResult(async () => {
    const user = await requirePermission(PERMISSIONS.DOCUMENT_MANAGE);
    await deleteDocument(id, { actorId: user.id });
    revalidatePath("/documentos");
    return null;
  });
}
