import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { summarizeContract, withResolvedStatus } from "@/server/finance/calculations";
import { createTransaction } from "@/server/finance/transactions";
import { createSale } from "@/server/sales/sales-service";
import { cleanupByPrefix, makeCpf, testPrisma } from "../helpers/db";

const PREFIX = "TEST_TIMING_";

/**
 * The same R$ 3.000 contract paid at every moment the business sees in practice:
 * never, up front, halfway, only at the end, and all at once at the end.
 */
describe("payment timing", () => {
  let serviceId: string;
  let consultationId: string;
  let seed = 100000000;

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

  /** A contract of R$ 3.000 in three parts, with the due dates the test needs. */
  async function sellThreeInstallments(label: string, offsets: [number, number, number]) {
    const customer = await newCustomer(label);

    const sale = await createSale({
      customerId: customer.id,
      soldAt: daysFromNow(offsets[0]),
      discount: "0",
      notes: null,
      items: [{ productId: serviceId, quantity: 1, unitPrice: "3000.00", unitCost: "0", discount: "0" }],
      contract: {
        startDate: daysFromNow(offsets[0]),
        installments: [
          { label: "Entrada", dueDate: daysFromNow(offsets[0]), amount: "1000.00", paymentMethodId: null, notes: null },
          { label: "Parcela 2", dueDate: daysFromNow(offsets[1]), amount: "1000.00", paymentMethodId: null, notes: null },
          { label: "Finalização", dueDate: daysFromNow(offsets[2]), amount: "1000.00", paymentMethodId: null, notes: null },
        ],
      },
    });

    return { customer, contract: sale.contracts[0] };
  }

  async function statuses(contractId: string) {
    const installments = await testPrisma.installment.findMany({
      where: { contractId },
      orderBy: { number: "asc" },
    });
    // Resolved the way every screen resolves it: overdue comes from the clock.
    return installments.map((row) => withResolvedStatus(row))
      .map((installment) => ({
      number: installment.number,
      paid: installment.paidAmount.toString(),
      status: installment.status,
    }));
  }

  async function summary(contractId: string) {
    const installments = await testPrisma.installment.findMany({
      where: { contractId },
      orderBy: { number: "asc" },
    });
    return summarizeContract(installments);
  }

  it("leaves everything open when the customer has not paid anything yet", async () => {
    const { contract } = await sellThreeInstallments("NadaPago", [0, 30, 60]);

    expect(await statuses(contract.id)).toEqual([
      { number: 1, paid: "0", status: "PENDING" },
      { number: 2, paid: "0", status: "PENDING" },
      { number: 3, paid: "0", status: "PENDING" },
    ]);

    const totals = await summary(contract.id);
    expect(totals.total.toFixed(2)).toBe("3000.00");
    expect(totals.received.toFixed(2)).toBe("0.00");
    expect(totals.pending.toFixed(2)).toBe("3000.00");
  });

  it("settles the first installment when the customer pays up front", async () => {
    const { customer, contract } = await sellThreeInstallments("PagouInicio", [0, 30, 60]);

    await createTransaction(
      {
        type: "INCOME",
        description: "Entrada do contrato",
        customerId: customer.id,
        expectedAmount: "1000.00",
        settledAmount: "1000.00",
        dueDate: new Date(),
        settledAt: new Date(),
        competenceDate: new Date(),
        origin: "MANUAL",
        allocations: [],
      },
      { autoAllocateContractId: contract.id },
    );

    expect(await statuses(contract.id)).toEqual([
      { number: 1, paid: "1000", status: "PAID" },
      { number: 2, paid: "0", status: "PENDING" },
      { number: 3, paid: "0", status: "PENDING" },
    ]);

    const totals = await summary(contract.id);
    expect(totals.received.toFixed(2)).toBe("1000.00");
    expect(totals.pending.toFixed(2)).toBe("2000.00");
  });

  it("marks a partial payment as partially paid, never as settled", async () => {
    const { customer, contract } = await sellThreeInstallments("PagouMetade", [0, 30, 60]);

    await createTransaction(
      {
        type: "INCOME",
        description: "Pagamento parcial",
        customerId: customer.id,
        expectedAmount: "400.00",
        settledAmount: "400.00",
        dueDate: new Date(),
        settledAt: new Date(),
        competenceDate: new Date(),
        origin: "MANUAL",
        allocations: [],
      },
      { autoAllocateContractId: contract.id },
    );

    expect(await statuses(contract.id)).toEqual([
      { number: 1, paid: "400", status: "PARTIALLY_PAID" },
      { number: 2, paid: "0", status: "PENDING" },
      { number: 3, paid: "0", status: "PENDING" },
    ]);
  });

  it("reports overdue installments while the customer waits to pay at the end", async () => {
    const { contract } = await sellThreeInstallments("SoNoFinal", [-60, -30, 30]);

    const rows = await statuses(contract.id);
    expect(rows[0].status).toBe("OVERDUE");
    expect(rows[1].status).toBe("OVERDUE");
    expect(rows[2].status).toBe("PENDING");

    const totals = await summary(contract.id);
    expect(totals.overdueAmount.toFixed(2)).toBe("2000.00");
    expect(totals.overdueCount).toBe(2);
  });

  it("clears the whole contract with a single payment at the end", async () => {
    const { customer, contract } = await sellThreeInstallments("QuitouNoFim", [-60, -30, 0]);

    const transaction = await createTransaction(
      {
        type: "INCOME",
        description: "Quitação integral",
        customerId: customer.id,
        expectedAmount: "3000.00",
        settledAmount: "3000.00",
        dueDate: new Date(),
        settledAt: new Date(),
        competenceDate: new Date(),
        origin: "MANUAL",
        allocations: [],
      },
      { autoAllocateContractId: contract.id },
    );

    // One payment, three obligations settled: that is what allocations are for.
    const allocations = await testPrisma.transactionAllocation.findMany({
      where: { transactionId: transaction.id },
    });
    expect(allocations).toHaveLength(3);

    expect(await statuses(contract.id)).toEqual([
      { number: 1, paid: "1000", status: "PAID" },
      { number: 2, paid: "1000", status: "PAID" },
      { number: 3, paid: "1000", status: "PAID" },
    ]);

    const updated = await testPrisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(updated.status).toBe("COMPLETED");
  });

  it("never allocates more than the contract owes when the customer overpays", async () => {
    const { customer, contract } = await sellThreeInstallments("PagouDemais", [0, 30, 60]);

    const transaction = await createTransaction(
      {
        type: "INCOME",
        description: "Valor acima do contrato",
        customerId: customer.id,
        expectedAmount: "5000.00",
        settledAmount: "5000.00",
        dueDate: new Date(),
        settledAt: new Date(),
        competenceDate: new Date(),
        origin: "MANUAL",
        allocations: [],
      },
      { autoAllocateContractId: contract.id },
    );

    // The surplus stays on the transaction, unallocated: money received is never
    // thrown away, and no installment is ever recorded above its own value.
    const allocations = await testPrisma.transactionAllocation.findMany({
      where: { transactionId: transaction.id },
    });
    const allocated = allocations.reduce((acc, item) => acc + Number(item.amount), 0);
    expect(allocated).toBeCloseTo(3000, 2);

    const rows = await statuses(contract.id);
    expect(rows.every((row) => row.status === "PAID")).toBe(true);
    expect(rows.every((row) => Number(row.paid) === 1000)).toBe(true);
  });

  it("refuses an allocation larger than the amount actually settled", async () => {
    const { customer, contract } = await sellThreeInstallments("AlocouDemais", [0, 30, 60]);
    const first = await testPrisma.installment.findFirstOrThrow({
      where: { contractId: contract.id, number: 1 },
    });

    await expect(
      createTransaction({
        type: "INCOME",
        description: "Alocação acima do liquidado",
        customerId: customer.id,
        expectedAmount: "1000.00",
        settledAmount: "100.00",
        dueDate: new Date(),
        settledAt: new Date(),
        competenceDate: new Date(),
        origin: "MANUAL",
        allocations: [
          {
            targetType: "INSTALLMENT",
            installmentId: first.id,
            contractId: contract.id,
            saleId: null,
            amount: "1000.00",
          },
        ],
      }),
    ).rejects.toThrow();
  });

  it("sells a consultation without creating a contract or a CRM card", async () => {
    const customer = await newCustomer("Consulta");

    const sale = await createSale({
      customerId: customer.id,
      soldAt: new Date(),
      discount: "0",
      notes: null,
      items: [{ productId: consultationId, quantity: 1, unitPrice: "117.00", unitCost: "25.00", discount: "0" }],
    });

    expect(sale.contracts).toHaveLength(0);

    const cards = await testPrisma.crmCard.count({ where: { customerId: customer.id } });
    expect(cards).toBe(0);
  });

  it("settles a consultation that has no contract", async () => {
    const customer = await newCustomer("ConsultaPaga");

    const sale = await createSale({
      customerId: customer.id,
      soldAt: new Date(),
      discount: "0",
      notes: null,
      items: [{ productId: consultationId, quantity: 1, unitPrice: "117.00", unitCost: "25.00", discount: "0" }],
    });

    await createTransaction(
      {
        type: "INCOME",
        description: "Consulta paga no ato",
        customerId: customer.id,
        expectedAmount: "117.00",
        settledAmount: "117.00",
        dueDate: new Date(),
        settledAt: new Date(),
        competenceDate: new Date(),
        origin: "MANUAL",
        allocations: [],
      },
      { autoAllocateSaleId: sale.id },
    );

    const updated = await testPrisma.sale.findUniqueOrThrow({ where: { id: sale.id } });
    expect(updated.status).toBe("PAID");
  });

  it("stores the signed contract link as a document of the customer", async () => {
    const customer = await newCustomer("ComLink");

    const sale = await createSale({
      customerId: customer.id,
      soldAt: new Date(),
      discount: "0",
      notes: null,
      items: [{ productId: serviceId, quantity: 1, unitPrice: "1500.00", unitCost: "0", discount: "0" }],
      contract: {
        startDate: new Date(),
        documentUrl: "https://drive.google.com/file/d/contrato-assinado",
        installments: [
          { label: "Pagamento único", dueDate: daysFromNow(15), amount: "1500.00", paymentMethodId: null, notes: null },
        ],
      },
    });

    const document = await testPrisma.document.findFirstOrThrow({
      where: { customerId: customer.id, type: { key: "contract" } },
    });
    expect(document.contractId).toBe(sale.contracts[0].id);
    expect(document.url).toBe("https://drive.google.com/file/d/contrato-assinado");
  });
});

function daysFromNow(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(12, 0, 0, 0);
  return date;
}
