import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { createSale } from "@/server/sales/sales-service";
import {
  createTransaction,
  reverseTransaction,
} from "@/server/finance/transactions";
import { getKanbanBoard, moveCard } from "@/server/crm/crm-service";
import { cleanupByPrefix, makeCpf, testPrisma } from "../helpers/db";

const PREFIX = "TEST_FLOW_";

/**
 * The end-to-end money path the business cares about: a R$ 5.400 contract in
 * three installments, two receipts, one expense and a Kanban move.
 */
describe("contract lifecycle", () => {
  let customerId: string;
  let productId: string;

  beforeAll(async () => {
    await cleanupByPrefix(PREFIX);

    const customer = await testPrisma.customer.create({
      data: {
        name: `${PREFIX}Cliente Teste`,
        document: makeCpf(987654321),
        phone: "11999990000",
        status: "ACTIVE",
      },
    });
    customerId = customer.id;

    const product = await testPrisma.productService.findFirstOrThrow({
      where: { kind: "SERVICE", isActive: true },
    });
    productId = product.id;
  });

  afterAll(async () => {
    await cleanupByPrefix(PREFIX);
    await prisma.$disconnect();
    await testPrisma.$disconnect();
  });

  it("creates the sale, the contract, the installments and the CRM card", async () => {
    const sale = await createSale({
      customerId,
      soldAt: new Date(),
      discount: "0",
      notes: null,
      items: [
        { productId, quantity: 1, unitPrice: "5400.00", unitCost: "0", discount: "0" },
      ],
      contract: {
        startDate: new Date(),
        installments: [
          { label: "Entrada", dueDate: daysFromNow(0), amount: "2700.00", paymentMethodId: null, notes: null },
          { label: "Parcela 2", dueDate: daysFromNow(30), amount: "1350.00", paymentMethodId: null, notes: null },
          { label: "Finalização", dueDate: daysFromNow(60), amount: "1350.00", paymentMethodId: null, notes: null },
        ],
      },
    });

    expect(sale.total.toString()).toBe("5400");
    expect(sale.contracts).toHaveLength(1);
    expect(sale.contracts[0].installments).toHaveLength(3);
    expect(sale.status).toBe("OPEN");

    const cards = await testPrisma.crmCard.findMany({ where: { customerId } });
    expect(cards).toHaveLength(1);
  });

  it("rejects an installment plan that does not add up", async () => {
    await expect(
      createSale({
        customerId,
        soldAt: new Date(),
        discount: "0",
        notes: null,
        items: [
          { productId, quantity: 1, unitPrice: "1000.00", unitCost: "0", discount: "0" },
        ],
        contract: {
          startDate: new Date(),
          installments: [
            { label: "Única", dueDate: daysFromNow(0), amount: "900.00", paymentMethodId: null, notes: null },
          ],
        },
      }),
    ).rejects.toThrow(/difere do valor contratado/);
  });

  it("applies a receipt to the chosen installment and updates the balances", async () => {
    const contract = await currentContract(customerId);
    const entry = contract.installments[0];

    await createTransaction({
      type: "INCOME",
      description: `${PREFIX}Entrada`,
      customerId,
      expenseCategoryId: null,
      paymentMethodId: null,
      expectedAmount: "2700.00",
      settledAmount: "2700.00",
      dueDate: entry.dueDate,
      settledAt: new Date(),
      competenceDate: new Date(),
      notes: null,
      origin: "MANUAL",
      externalId: null,
      externalProvider: null,
      allocations: [
        {
          targetType: "INSTALLMENT",
          installmentId: entry.id,
          contractId: contract.id,
          saleId: null,
          amount: "2700.00",
        },
      ],
    });

    const updated = await currentContract(customerId);
    expect(updated.installments[0].paidAmount.toString()).toBe("2700");
    expect(updated.installments[0].status).toBe("PAID");

    const sale = await testPrisma.sale.findFirstOrThrow({ where: { customerId } });
    expect(sale.status).toBe("PARTIALLY_PAID");
  });

  it("spreads an unallocated receipt over the oldest open installments", async () => {
    const contract = await currentContract(customerId);

    await createTransaction(
      {
        type: "INCOME",
        description: `${PREFIX}Parcela 2 automática`,
        customerId,
        expenseCategoryId: null,
        paymentMethodId: null,
        expectedAmount: "1350.00",
        settledAmount: "1350.00",
        dueDate: null,
        settledAt: new Date(),
        competenceDate: new Date(),
        notes: null,
        origin: "MANUAL",
        externalId: null,
        externalProvider: null,
        allocations: [],
      },
      { autoAllocateContractId: contract.id },
    );

    const updated = await currentContract(customerId);
    expect(updated.installments[1].paidAmount.toString()).toBe("1350");
    expect(updated.installments[2].paidAmount.toString()).toBe("0");
  });

  it("refuses to allocate more than the installment still owes", async () => {
    const contract = await currentContract(customerId);
    const paid = contract.installments[0];

    await expect(
      createTransaction({
        type: "INCOME",
        description: `${PREFIX}Excedente`,
        customerId,
        expenseCategoryId: null,
        paymentMethodId: null,
        expectedAmount: "100.00",
        settledAmount: "100.00",
        dueDate: null,
        settledAt: new Date(),
        competenceDate: new Date(),
        notes: null,
        origin: "MANUAL",
        externalId: null,
        externalProvider: null,
        allocations: [
          {
            targetType: "INSTALLMENT",
            installmentId: paid.id,
            contractId: contract.id,
            saleId: null,
            amount: "100.00",
          },
        ],
      }),
    ).rejects.toThrow(/excede o saldo da parcela/);
  });

  it("refuses to allocate more than the transaction settled", async () => {
    const contract = await currentContract(customerId);
    const open = contract.installments[2];

    await expect(
      createTransaction({
        type: "INCOME",
        description: `${PREFIX}Alocação inflada`,
        customerId,
        expenseCategoryId: null,
        paymentMethodId: null,
        expectedAmount: "100.00",
        settledAmount: "100.00",
        dueDate: null,
        settledAt: new Date(),
        competenceDate: new Date(),
        notes: null,
        origin: "MANUAL",
        externalId: null,
        externalProvider: null,
        allocations: [
          {
            targetType: "INSTALLMENT",
            installmentId: open.id,
            contractId: contract.id,
            saleId: null,
            amount: "500.00",
          },
        ],
      }),
    ).rejects.toThrow(/excede o valor liquidado/);
  });

  it("blocks a duplicated external payment", async () => {
    const payload = {
      type: "INCOME" as const,
      description: `${PREFIX}Mercado Pago`,
      customerId,
      expenseCategoryId: null,
      paymentMethodId: null,
      expectedAmount: "10.00",
      settledAmount: "10.00",
      dueDate: null,
      settledAt: new Date(),
      competenceDate: new Date(),
      notes: null,
      origin: "MERCADO_PAGO",
      externalId: `${PREFIX}payment-1`,
      externalProvider: "MERCADO_PAGO",
      allocations: [],
    };

    await createTransaction(payload);
    await expect(createTransaction(payload)).rejects.toThrow(/já registrada/);
  });

  it("restores the installment when a receipt is reversed", async () => {
    const contract = await currentContract(customerId);
    const second = contract.installments[1];

    const allocation = await testPrisma.transactionAllocation.findFirstOrThrow({
      where: { installmentId: second.id, reversedAt: null },
    });

    await reverseTransaction(allocation.transactionId, "REFUNDED", { reason: "teste" });

    const updated = await currentContract(customerId);
    expect(updated.installments[1].paidAmount.toString()).toBe("0");
    expect(updated.installments[1].status).not.toBe("PAID");

    // History is preserved, not deleted.
    const reversed = await testPrisma.transactionAllocation.findUniqueOrThrow({
      where: { id: allocation.id },
    });
    expect(reversed.reversedAt).not.toBeNull();
  });

  it("moves the Kanban card and records the history", async () => {
    const board = await getKanbanBoard({ search: `${PREFIX}` });
    const card = board.flatMap((column) => column.cards)[0];
    expect(card).toBeDefined();

    const target = await testPrisma.crmStage.findFirstOrThrow({ where: { position: 3 } });
    await moveCard(card.id, { toStageId: target.id, note: "teste" });

    const moved = await testPrisma.crmCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(moved.stageId).toBe(target.id);

    const history = await testPrisma.crmStageHistory.findMany({ where: { cardId: card.id } });
    expect(history.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps the CRM reading the ERP numbers", async () => {
    const board = await getKanbanBoard({ search: `${PREFIX}` });
    const card = board.flatMap((column) => column.cards)[0];

    expect(card.contract?.total).toBe("5400.00");
    expect(card.contract?.received).toBe("2700.00");
    expect(card.contract?.pending).toBe("2700.00");
  });
});

async function currentContract(customerId: string) {
  return testPrisma.contract.findFirstOrThrow({
    where: { customerId },
    include: { installments: { orderBy: { number: "asc" } } },
  });
}

function daysFromNow(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(12, 0, 0, 0);
  return date;
}
