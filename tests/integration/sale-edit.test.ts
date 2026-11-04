import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { createTransaction, reverseTransaction } from "@/server/finance/transactions";
import { createSale, updateSale } from "@/server/sales/sales-service";
import { cleanupByPrefix, makeCpf, testPrisma } from "../helpers/db";

const PREFIX = "TEST_EDIT_";

/**
 * Editing a sale is how a typing mistake gets fixed. It has to rewrite items and
 * the installment plan without ever letting the contracted amount drift away from
 * the money that actually came in.
 */
describe("sale editing", () => {
  let serviceId: string;
  let consultationId: string;
  let seed = 300000000;

  beforeAll(async () => {
    await cleanupByPrefix(PREFIX);

    serviceId = (
      await testPrisma.productService.findFirstOrThrow({
        where: { kind: "SERVICE", isActive: true, allowCustomPrice: true },
      })
    ).id;
    consultationId = (
      await testPrisma.productService.findFirstOrThrow({
        where: { kind: "CONSULTATION", isActive: true },
      })
    ).id;
  });

  afterAll(async () => {
    await cleanupByPrefix(PREFIX);
    await prisma.$disconnect();
    await testPrisma.$disconnect();
  });

  function daysFromNow(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() + days);
    date.setHours(12, 0, 0, 0);
    return date;
  }

  async function newCustomer(label: string) {
    seed += 1;
    return testPrisma.customer.create({
      data: {
        name: `${PREFIX}${label}`,
        document: makeCpf(seed),
        phone: "11988887777",
        status: "LEAD",
      },
    });
  }

  async function sell(label: string, amount: string, parts: string[]) {
    const customer = await newCustomer(label);
    const sale = await createSale({
      customerId: customer.id,
      soldAt: daysFromNow(0),
      discount: "0",
      notes: null,
      items: [
        { productId: serviceId, quantity: 1, unitPrice: amount, unitCost: "0", discount: "0" },
      ],
      contract: {
        startDate: daysFromNow(0),
        installments: parts.map((value, index) => ({
          label: `Parcela ${index + 1}`,
          dueDate: daysFromNow(30 * (index + 1)),
          amount: value,
        })),
      },
    });
    return { customer, sale };
  }

  it("rewrites value and plan while nothing was received", async () => {
    const { sale } = await sell("valor-errado", "3000.00", ["1500.00", "1500.00"]);

    await updateSale(sale.id, {
      soldAt: daysFromNow(0),
      discount: "200.00",
      notes: "Desconto combinado por telefone.",
      items: [
        { productId: serviceId, quantity: 1, unitPrice: "3000.00", unitCost: "0", discount: "0" },
      ],
      contract: {
        startDate: daysFromNow(0),
        installments: [
          { label: "Parcela única", dueDate: daysFromNow(60), amount: "2800.00" },
        ],
      },
    });

    const updated = await testPrisma.sale.findUniqueOrThrow({
      where: { id: sale.id },
      include: { contracts: { include: { installments: { orderBy: { number: "asc" } } } } },
    });

    expect(Number(updated.total)).toBe(2800);
    expect(Number(updated.discount)).toBe(200);
    expect(updated.contracts).toHaveLength(1);
    expect(updated.contracts[0].installments).toHaveLength(1);
    expect(Number(updated.contracts[0].installments[0].expectedAmount)).toBe(2800);
    expect(Number(updated.contracts[0].totalAmount)).toBe(2800);
  });

  it("keeps the same contract so its documents stay attached", async () => {
    const { sale } = await sell("mesmo-contrato", "1000.00", ["1000.00"]);
    const before = await testPrisma.contract.findFirstOrThrow({ where: { saleId: sale.id } });

    await testPrisma.document.create({
      data: {
        customerId: sale.customerId,
        contractId: before.id,
        title: "Contrato assinado",
        url: "https://example.test/contrato",
        kind: "CONTRACT",
      },
    });

    await updateSale(sale.id, {
      soldAt: daysFromNow(0),
      discount: "0",
      notes: null,
      items: [
        { productId: serviceId, quantity: 1, unitPrice: "1500.00", unitCost: "0", discount: "0" },
      ],
      contract: {
        startDate: daysFromNow(0),
        installments: [
          { label: "Entrada", dueDate: daysFromNow(0), amount: "500.00" },
          { label: "Finalização", dueDate: daysFromNow(30), amount: "1000.00" },
        ],
      },
    });

    const after = await testPrisma.contract.findFirstOrThrow({
      where: { saleId: sale.id },
      include: { documents: true, installments: true },
    });

    expect(after.id).toBe(before.id);
    expect(after.documents).toHaveLength(1);
    expect(after.installments).toHaveLength(2);
  });

  it("refuses an edit once money came in", async () => {
    const { customer, sale } = await sell("ja-recebeu", "1000.00", ["1000.00"]);
    const contract = await testPrisma.contract.findFirstOrThrow({ where: { saleId: sale.id } });
    const installment = await testPrisma.installment.findFirstOrThrow({
      where: { contractId: contract.id },
    });

    await createTransaction({
      type: "INCOME",
      description: `${PREFIX}recebimento`,
      customerId: customer.id,
      expectedAmount: "1000.00",
      settledAmount: "1000.00",
      settledAt: new Date(),
      competenceDate: new Date(),
      origin: "MANUAL",
      allocations: [{ targetType: "INSTALLMENT", installmentId: installment.id, amount: "1000.00" }],
    });

    await expect(
      updateSale(sale.id, {
        soldAt: daysFromNow(0),
        discount: "0",
        notes: null,
        items: [
          { productId: serviceId, quantity: 1, unitPrice: "900.00", unitCost: "0", discount: "0" },
        ],
        contract: {
          startDate: daysFromNow(0),
          installments: [{ label: "Única", dueDate: daysFromNow(30), amount: "900.00" }],
        },
      }),
    ).rejects.toThrow(/recebimentos/i);
  });

  it("allows the edit again after the receipt is reversed", async () => {
    const { customer, sale } = await sell("estornou", "1000.00", ["1000.00"]);
    const contract = await testPrisma.contract.findFirstOrThrow({ where: { saleId: sale.id } });
    const installment = await testPrisma.installment.findFirstOrThrow({
      where: { contractId: contract.id },
    });

    const transaction = await createTransaction({
      type: "INCOME",
      description: `${PREFIX}recebimento-errado`,
      customerId: customer.id,
      expectedAmount: "1000.00",
      settledAmount: "1000.00",
      settledAt: new Date(),
      competenceDate: new Date(),
      origin: "MANUAL",
      allocations: [{ targetType: "INSTALLMENT", installmentId: installment.id, amount: "1000.00" }],
    });

    await reverseTransaction(transaction.id, "REFUNDED", { reason: "cliente errado" });

    await updateSale(sale.id, {
      soldAt: daysFromNow(0),
      discount: "0",
      notes: null,
      items: [
        { productId: serviceId, quantity: 1, unitPrice: "700.00", unitCost: "0", discount: "0" },
      ],
      contract: {
        startDate: daysFromNow(0),
        installments: [{ label: "Única", dueDate: daysFromNow(30), amount: "700.00" }],
      },
    });

    const updated = await testPrisma.sale.findUniqueOrThrow({ where: { id: sale.id } });
    expect(Number(updated.total)).toBe(700);

    // The reversed transaction itself survives; only its dangling pointer went.
    const kept = await testPrisma.transaction.findUniqueOrThrow({
      where: { id: transaction.id },
    });
    expect(kept.status).toBe("REFUNDED");
  });

  it("refuses a plan that does not add up to the new total", async () => {
    const { sale } = await sell("plano-torto", "1000.00", ["1000.00"]);

    await expect(
      updateSale(sale.id, {
        soldAt: daysFromNow(0),
        discount: "0",
        notes: null,
        items: [
          { productId: serviceId, quantity: 1, unitPrice: "1000.00", unitCost: "0", discount: "0" },
        ],
        contract: {
          startDate: daysFromNow(0),
          installments: [{ label: "Única", dueDate: daysFromNow(30), amount: "400.00" }],
        },
      }),
    ).rejects.toThrow(/difere do valor contratado/i);
  });

  it("drops the contract and the card when the sale becomes a consultation", async () => {
    const { sale, customer } = await sell("virou-consulta", "1400.00", ["1400.00"]);

    const cardsBefore = await testPrisma.crmCard.count({ where: { customerId: customer.id } });
    expect(cardsBefore).toBe(1);

    await updateSale(sale.id, {
      soldAt: daysFromNow(0),
      discount: "0",
      notes: null,
      items: [
        { productId: consultationId, quantity: 1, unitPrice: "117.00", unitCost: "0", discount: "0" },
      ],
    });

    const updated = await testPrisma.sale.findUniqueOrThrow({
      where: { id: sale.id },
      include: { contracts: true, items: true },
    });

    expect(Number(updated.total)).toBe(117);
    expect(updated.contracts).toHaveLength(0);
    expect(updated.items).toHaveLength(1);
    expect(await testPrisma.crmCard.count({ where: { customerId: customer.id } })).toBe(0);
  });
});
