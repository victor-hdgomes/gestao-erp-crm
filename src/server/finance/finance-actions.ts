"use server";

import { revalidatePath } from "next/cache";

import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import {
  transactionCreateSchema,
  transactionSettleSchema,
} from "@/lib/schemas/finance";
import {
  createTransaction,
  reverseTransaction,
  settleTransaction,
} from "@/server/finance/transactions";
import { toActionResult, type ActionResult } from "@/server/shared/action-result";

function revalidateFinance() {
  revalidatePath("/transacoes");
  revalidatePath("/financeiro");
  revalidatePath("/dashboard");
  revalidatePath("/crm");
  revalidatePath("/vendas");
}

export async function createTransactionAction(
  payload: unknown,
  options: { autoAllocateContractId?: string | null; autoAllocateSaleId?: string | null } = {},
): Promise<ActionResult<{ id: string }>> {
  return toActionResult(async () => {
    const user = await requirePermission(PERMISSIONS.FINANCE_MANAGE);
    const input = transactionCreateSchema.parse(payload);

    const transaction = await createTransaction(input, {
      actorId: user.id,
      actorLabel: user.name,
      autoAllocateContractId: options.autoAllocateContractId ?? null,
      autoAllocateSaleId: options.autoAllocateSaleId ?? null,
    });

    revalidateFinance();
    return { id: transaction.id };
  });
}

export async function settleTransactionAction(
  id: string,
  payload: unknown,
  options: { autoAllocateContractId?: string | null } = {},
): Promise<ActionResult<{ id: string }>> {
  return toActionResult(async () => {
    const user = await requirePermission(PERMISSIONS.FINANCE_MANAGE);
    const input = transactionSettleSchema.parse(payload);

    await settleTransaction(
      id,
      {
        amount: input.amount,
        settledAt: input.settledAt,
        paymentMethodId: input.paymentMethodId ?? null,
        allocations: input.allocations,
        notes: input.notes ?? null,
      },
      { actorId: user.id, autoAllocateContractId: options.autoAllocateContractId ?? null },
    );

    revalidateFinance();
    return { id };
  });
}

export async function reverseTransactionAction(
  id: string,
  mode: "CANCELLED" | "REFUNDED",
  reason: string,
): Promise<ActionResult<null>> {
  return toActionResult(async () => {
    const user = await requirePermission(PERMISSIONS.FINANCE_MANAGE);
    await reverseTransaction(id, mode, { actorId: user.id, reason: reason || null });
    revalidateFinance();
    return null;
  });
}
