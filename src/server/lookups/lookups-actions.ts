"use server";

import { revalidatePath } from "next/cache";

import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import {
  archiveDocumentType,
  archiveTransactionCategory,
  createDocumentType,
  createTransactionCategory,
  updateDocumentType,
  updateTransactionCategory,
  type TransactionCategoryKind,
} from "@/server/lookups/lookups-service";
import { toActionResult, type ActionResult } from "@/server/shared/action-result";

export type LookupOption = { id: string; name: string };

/** Every screen that offers one of these lookups has to see the change at once. */
function revalidateCategories() {
  revalidatePath("/cadastros");
  revalidatePath("/transacoes");
  revalidatePath("/financeiro");
  revalidatePath("/dashboard");
  revalidatePath("/relatorios");
}

function revalidateDocumentTypes() {
  revalidatePath("/cadastros");
  revalidatePath("/documentos");
  revalidatePath("/clientes");
}

export async function createTransactionCategoryAction(
  name: string,
  kind: TransactionCategoryKind = "EXPENSE",
): Promise<ActionResult<LookupOption>> {
  return toActionResult(async () => {
    const user = await requirePermission(PERMISSIONS.FINANCE_MANAGE);
    const category = await createTransactionCategory(name, kind, { actorId: user.id });
    revalidateCategories();
    return { id: category.id, name: category.name };
  });
}

export async function createIncomeCategoryAction(
  name: string,
): Promise<ActionResult<LookupOption>> {
  return createTransactionCategoryAction(name, "INCOME");
}

export async function createExpenseCategoryAction(
  name: string,
): Promise<ActionResult<LookupOption>> {
  return createTransactionCategoryAction(name, "EXPENSE");
}

export async function updateTransactionCategoryAction(
  id: string,
  input: { name: string; isActive: boolean },
): Promise<ActionResult<LookupOption>> {
  return toActionResult(async () => {
    const user = await requirePermission(PERMISSIONS.FINANCE_MANAGE);
    const category = await updateTransactionCategory(id, input, { actorId: user.id });
    revalidateCategories();
    return { id: category.id, name: category.name };
  });
}

export async function archiveTransactionCategoryAction(
  id: string,
): Promise<ActionResult<null>> {
  return toActionResult(async () => {
    const user = await requirePermission(PERMISSIONS.FINANCE_MANAGE);
    await archiveTransactionCategory(id, { actorId: user.id });
    revalidateCategories();
    return null;
  });
}

export async function createDocumentTypeAction(
  name: string,
): Promise<ActionResult<LookupOption>> {
  return toActionResult(async () => {
    const user = await requirePermission(PERMISSIONS.DOCUMENT_MANAGE);
    const type = await createDocumentType(name, { actorId: user.id });
    revalidateDocumentTypes();
    return { id: type.id, name: type.name };
  });
}

export async function updateDocumentTypeAction(
  id: string,
  input: { name: string; isActive: boolean },
): Promise<ActionResult<LookupOption>> {
  return toActionResult(async () => {
    const user = await requirePermission(PERMISSIONS.DOCUMENT_MANAGE);
    const type = await updateDocumentType(id, input, { actorId: user.id });
    revalidateDocumentTypes();
    return { id: type.id, name: type.name };
  });
}

export async function archiveDocumentTypeAction(id: string): Promise<ActionResult<null>> {
  return toActionResult(async () => {
    const user = await requirePermission(PERMISSIONS.DOCUMENT_MANAGE);
    await archiveDocumentType(id, { actorId: user.id });
    revalidateDocumentTypes();
    return null;
  });
}
