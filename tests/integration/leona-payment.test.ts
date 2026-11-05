import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  createTransactionFromLeona,
  upsertCustomerFromLeona,
} from "@/server/integrations/leona-handlers";
import { cleanupByPrefix, testPrisma } from "../helpers/db";

const PREFIX = "TEST_MPPAY_";

/**
 * O caminho que o n8n percorre quando o Mercado Pago avisa que o cliente
 * pagou: achar ou criar a pessoa pelo telefone e lançar a entrada, sem venda
 * nem contrato no meio. O reenvio do mesmo pagamento não pode virar dinheiro
 * em dobro.
 */
describe("pagamento confirmado vindo do n8n", () => {
  const phone = "61991664479";

  beforeAll(async () => {
    await cleanupByPrefix(PREFIX);
  });

  afterAll(async () => {
    await cleanupByPrefix(PREFIX);
    await prisma.$disconnect();
    await testPrisma.$disconnect();
  });

  it("cria a pessoa só com nome e telefone, sem CPF", async () => {
    const created = await upsertCustomerFromLeona({
      name: `${PREFIX}Cliente do WhatsApp`,
      phone,
      externalId: `leona:${phone}`,
      source: "Leona Flow",
    });

    expect(created.created).toBe(true);

    // O mesmo contato voltando não vira uma segunda pessoa.
    const again = await upsertCustomerFromLeona({
      name: `${PREFIX}Cliente do WhatsApp`,
      phone,
      externalId: `leona:${phone}`,
    });

    expect(again.created).toBe(false);
    expect(again.id).toBe(created.id);
  });

  it("lança a entrada sem venda, com categoria de receita e forma de pagamento", async () => {
    const customer = await upsertCustomerFromLeona({
      name: `${PREFIX}Pagou a consulta`,
      phone: "61999990001",
      externalId: `leona:61999990001`,
    });

    const result = await createTransactionFromLeona({
      type: "INCOME",
      description: "Consulta + Análise de Crédito — Mercado Pago",
      customerId: customer.id,
      amount: "117.00",
      settled: true,
      category: "consultation_revenue",
      paymentMethod: "pix",
      externalId: "mp-payment-1001",
      externalProvider: "MERCADO_PAGO",
    });

    const transaction = await testPrisma.transaction.findUniqueOrThrow({
      where: { id: result.id },
      include: { allocations: true, category: true, paymentMethod: true },
    });

    expect(transaction.customerId).toBe(customer.id);
    expect(transaction.settledAmount.toString()).toBe("117");
    expect(transaction.allocations).toHaveLength(0);
    expect(transaction.paymentMethod?.key).toBe("pix");
    expect(transaction.category?.kind).toBe("INCOME");
    expect(transaction.origin).toBe("MERCADO_PAGO");
    expect(transaction.externalProvider).toBe("MERCADO_PAGO");
  });

  it("recusa o mesmo pagamento duas vezes", async () => {
    const customer = await upsertCustomerFromLeona({
      name: `${PREFIX}Reenvio`,
      phone: "61999990002",
      externalId: `leona:61999990002`,
    });

    const payload = {
      type: "INCOME" as const,
      description: "Consulta — Mercado Pago",
      customerId: customer.id,
      amount: "117.00",
      settled: true,
      externalId: "mp-payment-2002",
      externalProvider: "MERCADO_PAGO",
    };

    await createTransactionFromLeona(payload);

    // É o que protege o caixa quando o Mercado Pago reenvia a notificação.
    await expect(createTransactionFromLeona(payload)).rejects.toThrow(/já registrada/i);

    const all = await testPrisma.transaction.findMany({
      where: { externalProvider: "MERCADO_PAGO", externalId: "mp-payment-2002" },
    });
    expect(all).toHaveLength(1);
  });

  it("não deixa a receita travada por causa de uma categoria que não existe", async () => {
    const customer = await upsertCustomerFromLeona({
      name: `${PREFIX}Sem categoria`,
      phone: "61999990003",
      externalId: `leona:61999990003`,
    });

    const result = await createTransactionFromLeona({
      type: "INCOME",
      description: "Consulta — Mercado Pago",
      customerId: customer.id,
      amount: "117.00",
      settled: true,
      category: "categoria_que_nao_existe",
      externalId: "mp-payment-3003",
      externalProvider: "MERCADO_PAGO",
    });

    const transaction = await testPrisma.transaction.findUniqueOrThrow({
      where: { id: result.id },
    });
    expect(transaction.categoryId).toBeNull();
  });

  it("continua recusando despesa sem categoria", async () => {
    await expect(
      createTransactionFromLeona({
        type: "EXPENSE",
        description: "Despesa qualquer",
        amount: "10.00",
        settled: true,
      }),
    ).rejects.toThrow(/categoria/i);
  });

  it("não aceita categoria de despesa num lançamento de receita", async () => {
    const customer = await upsertCustomerFromLeona({
      name: `${PREFIX}Categoria trocada`,
      phone: "61999990004",
      externalId: `leona:61999990004`,
    });

    const result = await createTransactionFromLeona({
      type: "INCOME",
      description: "Consulta — Mercado Pago",
      customerId: customer.id,
      amount: "117.00",
      settled: true,
      category: "paid_traffic",
      externalId: "mp-payment-4004",
      externalProvider: "MERCADO_PAGO",
    });

    const transaction = await testPrisma.transaction.findUniqueOrThrow({
      where: { id: result.id },
    });
    expect(transaction.categoryId).toBeNull();
  });
});
