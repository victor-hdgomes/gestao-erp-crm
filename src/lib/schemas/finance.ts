import { z } from "zod";

import {
  dateSchema,
  nonNegativeMoneySchema,
  optionalString,
  positiveMoneySchema,
} from "@/lib/schemas/common";

export const transactionTypeSchema = z.enum(["INCOME", "EXPENSE"]);

export const transactionStatusSchema = z.enum([
  "PENDING",
  "PARTIALLY_SETTLED",
  "SETTLED",
  "OVERDUE",
  "CANCELLED",
  "REFUNDED",
]);

export const allocationInputSchema = z.object({
  targetType: z.enum(["INSTALLMENT", "CONTRACT", "SALE", "SERVICE"]),
  installmentId: z.string().nullable().optional(),
  contractId: z.string().nullable().optional(),
  saleId: z.string().nullable().optional(),
  amount: positiveMoneySchema,
});

export const transactionCreateSchema = z
  .object({
    type: transactionTypeSchema,
    description: z.string().trim().min(3, "Descreva a transação."),
    customerId: z.string().nullable().optional(),
    categoryId: z.string().nullable().optional(),
    paymentMethodId: z.string().nullable().optional(),
    expectedAmount: positiveMoneySchema,
    settledAmount: nonNegativeMoneySchema.default("0"),
    dueDate: dateSchema.nullable().optional(),
    settledAt: dateSchema.nullable().optional(),
    competenceDate: dateSchema.default(() => new Date()),
    notes: optionalString,
    origin: z.string().default("MANUAL"),
    externalId: z.string().nullable().optional(),
    externalProvider: z.string().nullable().optional(),
    allocations: z.array(allocationInputSchema).default([]),
  })
  .refine(
    (value) => value.type !== "EXPENSE" || Boolean(value.categoryId),
    { message: "Selecione a categoria da despesa.", path: ["categoryId"] },
  )
  .refine(
    (value) => Number(value.settledAmount) === 0 || Boolean(value.settledAt),
    { message: "Informe a data de liquidação.", path: ["settledAt"] },
  );

export const transactionSettleSchema = z.object({
  amount: positiveMoneySchema,
  settledAt: dateSchema.default(() => new Date()),
  paymentMethodId: z.string().nullable().optional(),
  allocations: z.array(allocationInputSchema).default([]),
  notes: optionalString,
});

export const transactionFilterSchema = z.object({
  type: transactionTypeSchema.optional(),
  status: transactionStatusSchema.optional(),
  customerId: z.string().optional(),
  categoryId: z.string().optional(),
  search: z.string().trim().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const installmentPlanSchema = z.object({
  contractId: z.string().min(1),
  installments: z
    .array(
      z.object({
        label: optionalString,
        dueDate: dateSchema,
        amount: positiveMoneySchema,
        paymentMethodId: z.string().nullable().optional(),
        notes: optionalString,
      }),
    )
    .min(1, "Informe ao menos uma parcela."),
});

export type TransactionCreateInput = z.infer<typeof transactionCreateSchema>;
export type AllocationInput = z.infer<typeof allocationInputSchema>;
