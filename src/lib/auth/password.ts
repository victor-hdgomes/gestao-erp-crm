import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export const PASSWORD_MIN_LENGTH = 8;

export function describePasswordPolicy(): string {
  return `Mínimo de ${PASSWORD_MIN_LENGTH} caracteres, com letras e números.`;
}

export function isStrongEnough(plain: string): boolean {
  return plain.length >= PASSWORD_MIN_LENGTH && /[a-zA-Z]/.test(plain) && /\d/.test(plain);
}
