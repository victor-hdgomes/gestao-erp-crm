import { z } from "zod";

import {
  dateSchema,
  nonNegativeMoneySchema,
  optionalString,
  positiveMoneySchema,
  urlSchema,
} from "@/lib/schemas/common";

export const saleItemSchema = z.object({
  productId: z.string().min(1, "Selecione um serviço."),
  quantity: z.coerce.number().int().min(1, "Quantidade mínima é 1."),
  unitPrice: positiveMoneySchema,
  unitCost: nonNegativeMoneySchema.default("0"),
  discount: nonNegativeMoneySchema.default("0"),
});

export const installmentPlanItemSchema = z.object({
  label: optionalString,
  dueDate: dateSchema,
  amount: positiveMoneySchema,
  paymentMethodId: z.string().nullable().optional(),
  notes: optionalString,
});

export const saleCreateSchema = z.object({
  customerId: z.string().min(1, "Selecione um cliente."),
  soldAt: dateSchema.default(() => new Date()),
  discount: nonNegativeMoneySchema.default("0"),
  notes: optionalString,
  items: z.array(saleItemSchema).min(1, "Adicione ao menos um item."),
  /** When present, a contract plus its installments is created from the sale. */
  contract: z
    .object({
      title: z.string().trim().min(3).optional(),
      startDate: dateSchema.default(() => new Date()),
      /** Link to the signed contract; stored as a document of the customer. */
      documentUrl: urlSchema.optional().nullable().or(z.literal("")),
      installments: z.array(installmentPlanItemSchema).min(1),
    })
    .optional(),
});

/** Editing keeps the customer: moving a sale between people would orphan its CRM cards. */
export const saleUpdateSchema = saleCreateSchema.omit({ customerId: true });

export const saleFilterSchema = z.object({
  search: z.string().trim().optional(),
  customerId: z.string().optional(),
  productId: z.string().optional(),
  status: z.enum(["OPEN", "PARTIALLY_PAID", "PAID", "CANCELLED"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type SaleCreateInput = z.infer<typeof saleCreateSchema>;
export type SaleUpdateInput = z.infer<typeof saleUpdateSchema>;
export type InstallmentPlanItem = z.infer<typeof installmentPlanItemSchema>;
