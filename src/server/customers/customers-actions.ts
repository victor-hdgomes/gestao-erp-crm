"use server";

import { revalidatePath } from "next/cache";

import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { customerCreateSchema, customerUpdateSchema } from "@/lib/schemas/customer";
import {
  createCustomer,
  searchCustomersForSelect,
  updateCustomer,
} from "@/server/customers/customers-service";
import { toActionResult, type ActionResult } from "@/server/shared/action-result";

export type CustomerOption = {
  id: string;
  name: string;
  document: string | null;
  phone: string | null;
};

export async function createCustomerAction(
  payload: unknown,
): Promise<ActionResult<CustomerOption>> {
  return toActionResult(async () => {
    const user = await requirePermission(PERMISSIONS.CUSTOMER_MANAGE);
    const input = customerCreateSchema.parse(payload);
    const customer = await createCustomer(input, { actorId: user.id });
    revalidatePath("/clientes");
    // The full option goes back so an inline picker can select it right away.
    return {
      id: customer.id,
      name: customer.name,
      document: customer.document,
      phone: customer.phone,
    };
  });
}

export async function updateCustomerAction(
  id: string,
  payload: unknown,
): Promise<ActionResult<{ id: string }>> {
  return toActionResult(async () => {
    const user = await requirePermission(PERMISSIONS.CUSTOMER_MANAGE);
    const input = customerUpdateSchema.parse(payload);
    const customer = await updateCustomer(id, input, { actorId: user.id });
    revalidatePath("/clientes");
    revalidatePath(`/clientes/${id}`);
    return { id: customer.id };
  });
}

export async function searchCustomersAction(
  term: string,
): Promise<ActionResult<CustomerOption[]>> {
  return toActionResult(async () => {
    await requirePermission(PERMISSIONS.CUSTOMER_VIEW);
    if (term.trim().length < 2) return [];
    return searchCustomersForSelect(term.trim());
  });
}
