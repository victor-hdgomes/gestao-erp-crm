import { onlyDigits } from "@/lib/format";

/** Validates a Brazilian CPF by its two check digits. */
export function isValidCpf(input: string | null | undefined): boolean {
  if (!input) return false;
  const cpf = onlyDigits(input);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digits = cpf.split("").map(Number);

  for (const [length, position] of [
    [9, 10],
    [10, 11],
  ] as const) {
    let sum = 0;
    for (let i = 0; i < length; i += 1) {
      sum += digits[i] * (position - i);
    }
    const remainder = (sum * 10) % 11;
    const check = remainder === 10 || remainder === 11 ? 0 : remainder;
    if (check !== digits[length]) return false;
  }

  return true;
}

/** Accepts landlines and mobiles with a two digit area code. */
export function isValidPhone(input: string | null | undefined): boolean {
  if (!input) return false;
  const phone = onlyDigits(input);
  return phone.length === 10 || phone.length === 11;
}

export function isValidUrl(input: string | null | undefined): boolean {
  if (!input) return false;
  try {
    const url = new URL(input);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
