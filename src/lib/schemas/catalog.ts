import { z } from "zod";

import { nonNegativeMoneySchema, optionalString } from "@/lib/schemas/common";

export const productKindSchema = z.enum(["CONSULTATION", "SERVICE", "OTHER"]);

export const productCreateSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do serviço."),
  description: optionalString,
  category: optionalString,
  kind: productKindSchema.default("SERVICE"),
  defaultPrice: nonNegativeMoneySchema,
  defaultCost: nonNegativeMoneySchema.default("0"),
  allowCustomPrice: z.boolean().default(true),
  createsCrmCard: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

export const productUpdateSchema = productCreateSchema.partial();

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
