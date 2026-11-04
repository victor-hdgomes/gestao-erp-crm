import { prisma, type PrismaTransactionClient } from "@/lib/prisma";
import { Decimal, sumMoney, toCents } from "@/lib/money";
import { conflict, notFound, unprocessable } from "@/lib/errors";
import { generateCode } from "@/server/shared/codes";
import { recordAudit } from "@/server/shared/audit";
import {
  allocateOldestFirst,
  assertAllocationsFit,
  assertInstallmentBalance,
  resolveInstallmentStatus,
  summarizeContract,
  type InstallmentLike,
} from "@/server/finance/calculations";
import type { AllocationInput, TransactionCreateInput } from "@/lib/schemas/finance";

export type CreateTransactionOptions = {
  actorId?: string | null;
  actorLabel?: string | null;
  /** Spreads the settled amount over the contract's open installments. */
  autoAllocateContractId?: string | null;
  /** Settles a sale that has no contract, such as a one-off consultation. */
  autoAllocateSaleId?: string | null;
};

/**
 * Creates a financial transaction and, when money actually moved, applies its
 * allocations to the obligations it settles.
 */
export async function createTransaction(
  input: TransactionCreateInput,
  options: CreateTransactionOptions = {},
) {
  return prisma.$transaction(
    async (tx) => {
      const code = await generateCode(tx, "transaction");

      if (input.externalProvider && input.externalId) {
        const existing = await tx.transaction.findFirst({
          where: { externalProvider: input.externalProvider, externalId: input.externalId },
        });
        if (existing) {
          throw conflict("Transação já registrada para este identificador externo.", {
            transactionId: existing.id,
          });
        }
      }

      const settled = toCents(input.settledAmount ?? "0");
      const expected = toCents(input.expectedAmount);

      if (settled.greaterThan(expected)) {
        throw unprocessable("O valor liquidado não pode ser maior que o valor previsto.");
      }

      let allocations: AllocationInput[] = input.allocations ?? [];

      if (allocations.length === 0 && options.autoAllocateContractId && settled.greaterThan(0)) {
        allocations = await buildAutoAllocations(
          tx,
          options.autoAllocateContractId,
          settled,
        );
      }

      if (allocations.length === 0 && options.autoAllocateSaleId && settled.greaterThan(0)) {
        allocations = await buildSaleAllocation(tx, options.autoAllocateSaleId, settled);
      }

      assertAllocationsFit(settled, allocations);

      const transaction = await tx.transaction.create({
        data: {
          code,
          type: input.type,
          description: input.description,
          customerId: input.customerId ?? null,
          expenseCategoryId: input.expenseCategoryId ?? null,
          paymentMethodId: input.paymentMethodId ?? null,
          expectedAmount: expected.toFixed(2),
          settledAmount: settled.toFixed(2),
          dueDate: input.dueDate ?? null,
          settledAt: input.settledAt ?? (settled.greaterThan(0) ? new Date() : null),
          competenceDate: input.competenceDate ?? new Date(),
          status: deriveTransactionStatus(expected, settled, input.dueDate ?? null),
          origin: input.origin ?? "MANUAL",
          externalId: input.externalId ?? null,
          externalProvider: input.externalProvider ?? null,
          notes: input.notes ?? null,
          createdById: options.actorId ?? null,
        },
      });

      await applyAllocations(tx, transaction.id, allocations);

      await recordAudit(
        {
          userId: options.actorId ?? null,
          actorLabel: options.actorLabel ?? null,
          action: "transaction.create",
          entity: "Transaction",
          entityId: transaction.id,
          changes: { code, type: input.type, expected: expected.toFixed(2), settled: settled.toFixed(2) },
        },
        tx,
      );

      return tx.transaction.findUniqueOrThrow({
        where: { id: transaction.id },
        include: { allocations: true, customer: true, expenseCategory: true, paymentMethod: true },
      });
    },
    { isolationLevel: "Serializable", timeout: 20000 },
  );
}

/** Registers an extra settlement against an existing transaction. */
export async function settleTransaction(
  transactionId: string,
  input: {
    amount: string;
    settledAt: Date;
    paymentMethodId?: string | null;
    allocations?: AllocationInput[];
    notes?: string | null;
  },
  options: CreateTransactionOptions = {},
) {
  return prisma.$transaction(
    async (tx) => {
      const current = await tx.transaction.findUnique({ where: { id: transactionId } });
      if (!current) throw notFound("Transação");
      if (current.status === "CANCELLED" || current.status === "REFUNDED") {
        throw unprocessable("Transação cancelada ou estornada não pode receber liquidações.");
      }

      const amount = toCents(input.amount);
      const newSettled = toCents(current.settledAmount).plus(amount);
      const expected = toCents(current.expectedAmount);

      if (newSettled.greaterThan(expected)) {
        throw unprocessable("A liquidação excede o valor previsto da transação.");
      }

      let allocations = input.allocations ?? [];
      if (allocations.length === 0 && options.autoAllocateContractId) {
        allocations = await buildAutoAllocations(tx, options.autoAllocateContractId, amount);
      }

      assertAllocationsFit(amount, allocations);
      await applyAllocations(tx, transactionId, allocations);

      const updated = await tx.transaction.update({
        where: { id: transactionId },
        data: {
          settledAmount: newSettled.toFixed(2),
          settledAt: input.settledAt,
          paymentMethodId: input.paymentMethodId ?? current.paymentMethodId,
          status: deriveTransactionStatus(expected, newSettled, current.dueDate),
          notes: input.notes ?? current.notes,
        },
      });

      await recordAudit(
        {
          userId: options.actorId ?? null,
          action: "transaction.settle",
          entity: "Transaction",
          entityId: transactionId,
          changes: { amount: amount.toFixed(2), settled: newSettled.toFixed(2) },
        },
        tx,
      );

      return updated;
    },
    { isolationLevel: "Serializable", timeout: 20000 },
  );
}

/**
 * Cancels or reverses a transaction. History is preserved: allocations are
 * marked reversed instead of deleted, and the affected installments are recomputed.
 */
export async function reverseTransaction(
  transactionId: string,
  mode: "CANCELLED" | "REFUNDED",
  options: CreateTransactionOptions & { reason?: string | null } = {},
) {
  return prisma.$transaction(
    async (tx) => {
      const current = await tx.transaction.findUnique({
        where: { id: transactionId },
        include: { allocations: { where: { reversedAt: null } } },
      });
      if (!current) throw notFound("Transação");
      if (current.status === mode) return current;

      const now = new Date();
      const touchedInstallments = new Set<string>();

      for (const allocation of current.allocations) {
        if (allocation.installmentId) touchedInstallments.add(allocation.installmentId);
        await tx.transactionAllocation.update({
          where: { id: allocation.id },
          data: { reversedAt: now },
        });
      }

      for (const installmentId of touchedInstallments) {
        await recalculateInstallment(tx, installmentId);
      }

      const updated = await tx.transaction.update({
        where: { id: transactionId },
        data: {
          status: mode,
          cancelledAt: mode === "CANCELLED" ? now : current.cancelledAt,
          refundedAt: mode === "REFUNDED" ? now : current.refundedAt,
          notes: options.reason ? `${current.notes ?? ""}\n[${mode}] ${options.reason}`.trim() : current.notes,
        },
      });

      await recordAudit(
        {
          userId: options.actorId ?? null,
          action: mode === "CANCELLED" ? "transaction.cancel" : "transaction.refund",
          entity: "Transaction",
          entityId: transactionId,
          changes: { reason: options.reason ?? null },
        },
        tx,
      );

      return updated;
    },
    { isolationLevel: "Serializable", timeout: 20000 },
  );
}

async function buildAutoAllocations(
  tx: PrismaTransactionClient,
  contractId: string,
  amount: Decimal,
): Promise<AllocationInput[]> {
  const installments = await tx.installment.findMany({
    where: { contractId },
    orderBy: { dueDate: "asc" },
  });

  const { allocations } = allocateOldestFirst(
    amount,
    installments.map(toInstallmentLike),
  );

  return allocations.map((allocation) => ({
    targetType: "INSTALLMENT" as const,
    installmentId: allocation.installmentId,
    contractId,
    saleId: null,
    amount: allocation.amount.toFixed(2),
  }));
}

/**
 * A sale without a contract has no installment to aim at, so the receipt is
 * applied to the sale itself, capped at what the sale still owes.
 */
async function buildSaleAllocation(
  tx: PrismaTransactionClient,
  saleId: string,
  amount: Decimal,
): Promise<AllocationInput[]> {
  const sale = await tx.sale.findUnique({
    where: { id: saleId },
    include: {
      contracts: { include: { installments: true } },
      allocations: { where: { reversedAt: null } },
    },
  });
  if (!sale) throw notFound("Venda");
  if (sale.status === "CANCELLED") {
    throw unprocessable("Não é possível receber por uma venda cancelada.");
  }

  const received = sumMoney([
    ...sale.contracts.flatMap((contract) =>
      contract.installments.map((installment) => installment.paidAmount),
    ),
    ...sale.allocations.map((allocation) => allocation.amount),
  ]);
  const balance = toCents(sale.total).minus(received);
  if (balance.lessThanOrEqualTo(0)) return [];

  const value = amount.greaterThan(balance) ? balance : amount;
  return [
    {
      targetType: "SALE" as const,
      installmentId: null,
      contractId: null,
      saleId,
      amount: value.toFixed(2),
    },
  ];
}

async function applyAllocations(
  tx: PrismaTransactionClient,
  transactionId: string,
  allocations: AllocationInput[],
): Promise<void> {
  for (const allocation of allocations) {
    const amount = toCents(allocation.amount);
    if (amount.lessThanOrEqualTo(0)) continue;

    if (allocation.targetType === "INSTALLMENT") {
      if (!allocation.installmentId) {
        throw unprocessable("Alocação de parcela sem identificador da parcela.");
      }
      const installment = await tx.installment.findUnique({
        where: { id: allocation.installmentId },
      });
      if (!installment) throw notFound("Parcela");
      if (installment.status === "CANCELLED") {
        throw unprocessable("Não é possível alocar valores em uma parcela cancelada.");
      }

      assertInstallmentBalance(toInstallmentLike(installment), amount);

      await tx.transactionAllocation.create({
        data: {
          transactionId,
          targetType: "INSTALLMENT",
          installmentId: installment.id,
          contractId: installment.contractId,
          amount: amount.toFixed(2),
        },
      });

      await recalculateInstallment(tx, installment.id);
      continue;
    }

    await tx.transactionAllocation.create({
      data: {
        transactionId,
        targetType: allocation.targetType,
        contractId: allocation.contractId ?? null,
        saleId: allocation.saleId ?? null,
        amount: amount.toFixed(2),
      },
    });

    if (allocation.saleId) await recalculateSale(tx, allocation.saleId);
  }
}

/** Recomputes an installment from its live allocations, never from a delta. */
export async function recalculateInstallment(
  tx: PrismaTransactionClient,
  installmentId: string,
): Promise<void> {
  const installment = await tx.installment.findUnique({
    where: { id: installmentId },
    include: { allocations: { where: { reversedAt: null } } },
  });
  if (!installment) return;

  const paid = sumMoney(installment.allocations.map((allocation) => allocation.amount));
  const status = resolveInstallmentStatus({
    expectedAmount: installment.expectedAmount,
    paidAmount: paid,
    dueDate: installment.dueDate,
    status: installment.status,
  });

  await tx.installment.update({
    where: { id: installmentId },
    data: { paidAmount: paid.toFixed(2), status },
  });

  await recalculateContract(tx, installment.contractId);
}

export async function recalculateContract(
  tx: PrismaTransactionClient,
  contractId: string,
): Promise<void> {
  const contract = await tx.contract.findUnique({
    where: { id: contractId },
    include: { installments: true },
  });
  if (!contract) return;

  const summary = summarizeContract(contract.installments.map(toInstallmentLike));
  const allPaid = summary.installmentCount > 0 && summary.pending.lessThanOrEqualTo(0);

  if (contract.status !== "CANCELLED") {
    await tx.contract.update({
      where: { id: contractId },
      data: { status: allPaid ? "COMPLETED" : "ACTIVE" },
    });
  }

  if (contract.saleId) await recalculateSale(tx, contract.saleId);
}

export async function recalculateSale(
  tx: PrismaTransactionClient,
  saleId: string,
): Promise<void> {
  const sale = await tx.sale.findUnique({
    where: { id: saleId },
    include: {
      contracts: { include: { installments: true } },
      allocations: { where: { reversedAt: null } },
    },
  });
  if (!sale || sale.status === "CANCELLED") return;

  const fromContracts = sale.contracts.flatMap((contract) =>
    contract.installments.map((installment) => installment.paidAmount),
  );
  const direct = sale.allocations.map((allocation) => allocation.amount);
  const received = sumMoney([...fromContracts, ...direct]);
  const total = toCents(sale.total);

  const status = received.greaterThanOrEqualTo(total) && total.greaterThan(0)
    ? "PAID"
    : received.greaterThan(0)
      ? "PARTIALLY_PAID"
      : "OPEN";

  await tx.sale.update({ where: { id: saleId }, data: { status } });
}

function deriveTransactionStatus(
  expected: Decimal,
  settled: Decimal,
  dueDate: Date | null,
): "PENDING" | "PARTIALLY_SETTLED" | "SETTLED" | "OVERDUE" {
  if (settled.greaterThanOrEqualTo(expected) && expected.greaterThan(0)) return "SETTLED";
  const overdue = dueDate ? dueDate < new Date() : false;
  if (settled.greaterThan(0)) return overdue ? "OVERDUE" : "PARTIALLY_SETTLED";
  return overdue ? "OVERDUE" : "PENDING";
}

type InstallmentRow = {
  id: string;
  number: number;
  dueDate: Date;
  expectedAmount: unknown;
  paidAmount: unknown;
  status: string;
};

export function toInstallmentLike(installment: InstallmentRow): InstallmentLike {
  return {
    id: installment.id,
    number: installment.number,
    dueDate: installment.dueDate,
    expectedAmount: installment.expectedAmount as never,
    paidAmount: installment.paidAmount as never,
    status: installment.status as InstallmentLike["status"],
  };
}
