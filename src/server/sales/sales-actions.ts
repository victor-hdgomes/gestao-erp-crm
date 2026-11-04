"use server";

import { revalidatePath } from "next/cache";

import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { saleCreateSchema, saleUpdateSchema } from "@/lib/schemas/sale";
import { cancelSale, createSale, updateSale } from "@/server/sales/sales-service";
import { toActionResult, type ActionResult } from "@/server/shared/action-result";

export async function createSaleAction(payload: unknown): Promise<ActionResult<{ id: string }>> {
  return toActionResult(async () => {
    const user = await requirePermission(PERMISSIONS.SALE_MANAGE);
    const input = saleCreateSchema.parse(payload);
    const sale = await createSale(input, { actorId: user.id, actorLabel: user.name });

    revalidatePath("/vendas");
    revalidatePath("/dashboard");
    revalidatePath("/crm");
    return { id: sale.id };
  });
}

export async function updateSaleAction(
  id: string,
  payload: unknown,
): Promise<ActionResult<{ id: string }>> {
  return toActionResult(async () => {
    const user = await requirePermission(PERMISSIONS.SALE_MANAGE);
    const input = saleUpdateSchema.parse(payload);
    const sale = await updateSale(id, input, { actorId: user.id, actorLabel: user.name });

    revalidatePath("/vendas");
    revalidatePath(`/vendas/${id}`);
    revalidatePath("/financeiro");
    revalidatePath("/contratos");
    revalidatePath("/dashboard");
    revalidatePath("/crm");
    return { id: sale.id };
  });
}

export async function cancelSaleAction(
  id: string,
  reason: string,
): Promise<ActionResult<null>> {
  return toActionResult(async () => {
    const user = await requirePermission(PERMISSIONS.SALE_MANAGE);
    await cancelSale(id, { actorId: user.id, reason: reason || null });

    revalidatePath("/vendas");
    revalidatePath(`/vendas/${id}`);
    revalidatePath("/dashboard");
    return null;
  });
}
