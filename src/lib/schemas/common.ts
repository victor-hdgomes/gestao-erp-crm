import { z } from "zod";

import { onlyDigits } from "@/lib/format";
import { isValidCpf, isValidPhone } from "@/lib/validators/document";

/** Accepts "1234.56" or "1.234,56" and normalises to a decimal string. */
export const moneySchema = z
  .union([z.string(), z.number()])
  .transform((value) => {
    if (typeof value === "number") return value.toFixed(2);
    const raw = value.trim();
    const normalised = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
    return normalised;
  })
  .refine((value) => /^-?\d+(\.\d{1,2})?$/.test(value), {
    message: "Valor monetário inválido.",
  });

export const positiveMoneySchema = moneySchema.refine((value) => Number(value) > 0, {
  message: "O valor deve ser maior que zero.",
});

export const nonNegativeMoneySchema = moneySchema.refine((value) => Number(value) >= 0, {
  message: "O valor não pode ser negativo.",
});

export const cpfSchema = z
  .string()
  .transform(onlyDigits)
  .refine(isValidCpf, { message: "CPF inválido." });

export const phoneSchema = z
  .string()
  .transform(onlyDigits)
  .refine(isValidPhone, { message: "Telefone inválido." });

export const urlSchema = z.string().url({ message: "URL inválida." });

export const dateSchema = z.coerce.date({ message: "Data inválida." });

export const optionalString = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .optional();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;

export const periodSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
