import { Decimal, money, sumMoney, toCents, type MoneyInput } from "@/lib/money";

export type InstallmentLike = {
  id: string;
  number: number;
  dueDate: Date;
  expectedAmount: MoneyInput;
  paidAmount: MoneyInput;
  status: InstallmentStatusValue;
};

export type InstallmentStatusValue =
  | "PENDING"
  | "PARTIALLY_PAID"
  | "PAID"
  | "OVERDUE"
  | "CANCELLED";

export type ContractFinancialSummary = {
  total: Decimal;
  received: Decimal;
  pending: Decimal;
  overdueAmount: Decimal;
  overdueCount: number;
  installmentCount: number;
  paidInstallmentCount: number;
  nextDueDate: Date | null;
  nextDueAmount: Decimal | null;
};

/** Status derived purely from amounts and the due date. Cancelled wins. */
export function resolveInstallmentStatus(
  installment: Pick<InstallmentLike, "expectedAmount" | "paidAmount" | "dueDate" | "status">,
  now: Date = new Date(),
): InstallmentStatusValue {
  if (installment.status === "CANCELLED") return "CANCELLED";

  const expected = toCents(installment.expectedAmount);
  const paid = toCents(installment.paidAmount);

  if (paid.greaterThanOrEqualTo(expected) && expected.greaterThan(0)) return "PAID";
  if (paid.greaterThan(0)) {
    return installment.dueDate < startOfDay(now) ? "OVERDUE" : "PARTIALLY_PAID";
  }
  return installment.dueDate < startOfDay(now) ? "OVERDUE" : "PENDING";
}

export function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function summarizeContract(
  installments: InstallmentLike[],
  now: Date = new Date(),
): ContractFinancialSummary {
  const active = installments.filter((item) => item.status !== "CANCELLED");

  const total = sumMoney(active.map((item) => item.expectedAmount));
  const received = sumMoney(active.map((item) => item.paidAmount));
  const pending = total.minus(received);

  let overdueAmount = new Decimal(0);
  let overdueCount = 0;
  let paidInstallmentCount = 0;
  let nextDueDate: Date | null = null;
  let nextDueAmount: Decimal | null = null;

  const sorted = [...active].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  for (const item of sorted) {
    const status = resolveInstallmentStatus(item, now);
    const remaining = toCents(item.expectedAmount).minus(toCents(item.paidAmount));

    if (status === "PAID") {
      paidInstallmentCount += 1;
      continue;
    }
    if (status === "OVERDUE") {
      overdueCount += 1;
      overdueAmount = overdueAmount.plus(remaining);
    }
    if (!nextDueDate && remaining.greaterThan(0)) {
      nextDueDate = item.dueDate;
      nextDueAmount = remaining;
    }
  }

  return {
    total,
    received,
    pending: pending.isNegative() ? new Decimal(0) : pending,
    overdueAmount,
    overdueCount,
    installmentCount: active.length,
    paidInstallmentCount,
    nextDueDate,
    nextDueAmount,
  };
}

export type PlannedInstallment = {
  number: number;
  label: string;
  dueDate: Date;
  amount: Decimal;
};

/**
 * Splits a total into N installments, optionally with a different down payment.
 * Rounding leftovers land on the last installment so the plan always adds up.
 */
export function buildInstallmentPlan(params: {
  total: MoneyInput;
  count: number;
  firstDueDate: Date;
  intervalDays?: number;
  downPayment?: MoneyInput | null;
}): PlannedInstallment[] {
  const total = toCents(params.total);
  const count = Math.max(1, Math.floor(params.count));
  const intervalDays = params.intervalDays ?? 30;

  if (total.lessThanOrEqualTo(0)) {
    throw new Error("O valor total deve ser maior que zero.");
  }

  const down = params.downPayment ? toCents(params.downPayment) : null;
  if (down && (down.lessThanOrEqualTo(0) || down.greaterThan(total))) {
    throw new Error("A entrada deve ser maior que zero e menor ou igual ao total.");
  }
  if (down && count < 2) {
    throw new Error("Com entrada, informe ao menos duas parcelas.");
  }

  const plan: PlannedInstallment[] = [];
  let allocated = new Decimal(0);

  const remainderCount = down ? count - 1 : count;
  const remainderTotal = down ? total.minus(down) : total;
  const baseAmount = remainderTotal.dividedBy(remainderCount).toDecimalPlaces(2, Decimal.ROUND_DOWN);

  for (let index = 0; index < count; index += 1) {
    const isFirst = index === 0;
    const isLast = index === count - 1;
    const dueDate = addDays(params.firstDueDate, index * intervalDays);

    let amount: Decimal;
    if (down && isFirst) {
      amount = down;
    } else if (isLast) {
      amount = total.minus(allocated);
    } else {
      amount = baseAmount;
    }

    allocated = allocated.plus(amount);
    plan.push({
      number: index + 1,
      label: down && isFirst ? "Entrada" : isLast ? "Finalização" : `Parcela ${index + 1}`,
      dueDate,
      amount,
    });
  }

  return plan;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export type AutoAllocation = { installmentId: string; amount: Decimal };

/**
 * Spreads a settled amount over open installments, oldest due date first.
 * Never allocates more than each installment still owes.
 */
export function allocateOldestFirst(
  amount: MoneyInput,
  installments: InstallmentLike[],
): { allocations: AutoAllocation[]; leftover: Decimal } {
  let remaining = toCents(amount);
  const allocations: AutoAllocation[] = [];

  const open = installments
    .filter((item) => item.status !== "CANCELLED")
    .map((item) => ({
      item,
      balance: toCents(item.expectedAmount).minus(toCents(item.paidAmount)),
    }))
    .filter((entry) => entry.balance.greaterThan(0))
    .sort((a, b) => a.item.dueDate.getTime() - b.item.dueDate.getTime());

  for (const entry of open) {
    if (remaining.lessThanOrEqualTo(0)) break;
    const applied = Decimal.min(remaining, entry.balance);
    allocations.push({ installmentId: entry.item.id, amount: applied });
    remaining = remaining.minus(applied);
  }

  return { allocations, leftover: remaining };
}

/** Guards against allocating more money than the transaction actually settled. */
export function assertAllocationsFit(
  settledAmount: MoneyInput,
  allocations: { amount: MoneyInput }[],
): void {
  const settled = toCents(settledAmount);
  const allocated = sumMoney(allocations.map((entry) => entry.amount));

  if (allocated.greaterThan(settled)) {
    throw new Error(
      `A soma das alocações (${allocated.toFixed(2)}) excede o valor liquidado (${settled.toFixed(2)}).`,
    );
  }
}

/** Guards against paying an installment beyond what it owes. */
export function assertInstallmentBalance(
  installment: Pick<InstallmentLike, "expectedAmount" | "paidAmount">,
  increment: MoneyInput,
): void {
  const balance = toCents(installment.expectedAmount).minus(toCents(installment.paidAmount));
  if (money(increment).greaterThan(balance)) {
    throw new Error(
      `Alocação de ${toCents(increment).toFixed(2)} excede o saldo da parcela (${balance.toFixed(2)}).`,
    );
  }
}

export function planTotal(plan: PlannedInstallment[]): Decimal {
  return sumMoney(plan.map((item) => item.amount));
}

/**
 * An installment becomes overdue with the passing of time, not with an event, so
 * the stored column is only as fresh as the last payment. Every screen that shows
 * a status to a human resolves it again at read time.
 */
export function withResolvedStatus<
  T extends Pick<InstallmentLike, "expectedAmount" | "paidAmount" | "dueDate" | "status">,
>(installment: T, now: Date = new Date()): T & { status: InstallmentStatusValue } {
  return { ...installment, status: resolveInstallmentStatus(installment, now) };
}
