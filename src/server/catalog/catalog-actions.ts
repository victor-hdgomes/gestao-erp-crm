"use server";

import { revalidatePath } from "next/cache";

import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { productCreateSchema, productUpdateSchema } from "@/lib/schemas/catalog";
import {
  archiveProduct,
  createPaymentMethod,
  createProduct,
  updateProduct,
} from "@/server/catalog/catalog-service";
import { toActionResult, type ActionResult } from "@/server/shared/action-result";

export type ProductOption = {
  id: string;
  name: string;
  kind: "CONSULTATION" | "SERVICE" | "OTHER";
  defaultPrice: string;
  defaultCost: string;
  allowCustomPrice: boolean;
};

export async function createProductAction(
  payload: unknown,
): Promise<ActionResult<ProductOption>> {
  return toActionResult(async () => {
    const user = await requirePermission(PERMISSIONS.CATALOG_MANAGE);
    const input = productCreateSchema.parse(payload);
    const product = await createProduct(input, { actorId: user.id });
    revalidatePath("/servicos");
    revalidatePath("/vendas/nova");
    // The full option goes back so the sale form can use it without a reload.
    return {
      id: product.id,
      name: product.name,
      kind: product.kind,
      defaultPrice: product.defaultPrice.toString(),
      defaultCost: product.defaultCost.toString(),
      allowCustomPrice: product.allowCustomPrice,
    };
  });
}

export async function updateProductAction(
  id: string,
  payload: unknown,
): Promise<ActionResult<{ id: string }>> {
  return toActionResult(async () => {
    const user = await requirePermission(PERMISSIONS.CATALOG_MANAGE);
    const input = productUpdateSchema.parse(payload);
    const product = await updateProduct(id, input, { actorId: user.id });
    revalidatePath("/servicos");
    return { id: product.id };
  });
}

export async function archiveProductAction(id: string): Promise<ActionResult<null>> {
  return toActionResult(async () => {
    const user = await requirePermission(PERMISSIONS.CATALOG_MANAGE);
    await archiveProduct(id, { actorId: user.id });
    revalidatePath("/servicos");
    return null;
  });
}

export type LookupOption = { id: string; name: string };

export async function createPaymentMethodAction(
  name: string,
): Promise<ActionResult<LookupOption>> {
  return toActionResult(async () => {
    const user = await requirePermission(PERMISSIONS.FINANCE_MANAGE);
    const method = await createPaymentMethod(name, { actorId: user.id });
    revalidatePath("/transacoes");
    revalidatePath("/financeiro");
    revalidatePath("/vendas/nova");
    return { id: method.id, name: method.name };
  });
}
