import { Decimal } from "decimal.js";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export type MoneyInput = Decimal | string | number | { toString(): string };

/** Builds a Decimal from anything the ORM or a form can hand us. */
export function money(value: MoneyInput | null | undefined): Decimal {
  if (value === null || value === undefined) return new Decimal(0);
  if (value instanceof Decimal) return value;
  if (typeof value === "number") return new Decimal(value);
  return new Decimal(value.toString());
}

/** Rounds to cents, the only precision persisted in the database. */
export function toCents(value: MoneyInput): Decimal {
  return money(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Serializes a money value for a JSON payload: a fixed 2-decimal string. */
export function moneyToString(value: MoneyInput | null | undefined): string {
  return toCents(money(value)).toFixed(2);
}

/** Serializes a money value for client components that only need to display it. */
export function moneyToNumber(value: MoneyInput | null | undefined): number {
  return toCents(money(value)).toNumber();
}

export function sumMoney(values: MoneyInput[]): Decimal {
  return values.reduce<Decimal>((acc, value) => acc.plus(money(value)), new Decimal(0));
}

export function isZero(value: MoneyInput): boolean {
  return money(value).isZero();
}

export function isNegative(value: MoneyInput): boolean {
  return money(value).isNegative();
}

export { Decimal };
