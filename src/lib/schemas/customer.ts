import { z } from "zod";

import { cpfSchema, optionalString, phoneSchema, urlSchema } from "@/lib/schemas/common";

export const customerStatusSchema = z.enum(["LEAD", "ACTIVE", "INACTIVE", "BLOCKED"]);

export const customerCreateSchema = z.object({
  name: z.string().trim().min(3, "Informe o nome completo."),
  document: cpfSchema.optional().nullable(),
  phone: phoneSchema.optional().nullable(),
  email: z.string().email("E-mail inválido.").optional().nullable().or(z.literal("")),
  zipCode: optionalString,
  street: optionalString,
  number: optionalString,
  complement: optionalString,
  district: optionalString,
  city: optionalString,
  state: z
    .string()
    .trim()
    .length(2, "Use a sigla do estado.")
    .toUpperCase()
    .optional()
    .nullable()
    .or(z.literal("")),
  driveFolderUrl: urlSchema.optional().nullable().or(z.literal("")),
  notes: optionalString,
  status: customerStatusSchema.default("LEAD"),
});

export const customerUpdateSchema = customerCreateSchema.partial();

export const customerFilterSchema = z.object({
  search: z.string().trim().optional(),
  status: customerStatusSchema.optional(),
});

export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;
