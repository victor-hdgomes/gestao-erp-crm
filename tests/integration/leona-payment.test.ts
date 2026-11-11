import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  createSaleFromLeona,
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

/**
 * O Mercado Pago avisa o mesmo pagamento mais de uma vez quase junto: uma
 * notificação "payment" e outra "order" chegam ao n8n no mesmo segundo e
 * viram duas chamadas simultâneas ao ERP. Em produção isso criou duas vezes
 * o mesmo cliente e derrubou o lançamento com conflito de escrita.
 */
describe("duas notificações do mesmo pagamento chegando juntas", () => {
  const PARALELO = "TEST_MPRACE_";
  const phone = "61900000777";

  beforeAll(async () => {
    await cleanupByPrefix(PARALELO);
  });

  afterAll(async () => {
    await cleanupByPrefix(PARALELO);
  });

  it("não duplica a pessoa quando as duas chamadas correm ao mesmo tempo", async () => {
    const chamada = () =>
      upsertCustomerFromLeona({
        name: `${PARALELO}Victor`,
        phone,
        externalId: `leona:${phone}`,
        source: "Leona Flow",
        status: "ACTIVE",
      });

    const [um, dois] = await Promise.all([chamada(), chamada()]);

    // Uma das duas criou; a outra tem de ter encontrado a mesma pessoa.
    expect(um.id).toBe(dois.id);
    expect([um.created, dois.created].filter(Boolean)).toHaveLength(1);

    const pessoas = await testPrisma.customer.findMany({
      where: { externalId: `leona:${phone}` },
      select: { id: true },
    });
    expect(pessoas).toHaveLength(1);
  });

  it("lança o pagamento uma vez só, mesmo com as duas chegando juntas", async () => {
    const { id: customerId } = await upsertCustomerFromLeona({
      name: `${PARALELO}Pagante`,
      phone: "61900000778",
      externalId: "leona:61900000778",
      source: "Leona Flow",
    });

    const lancamento = () =>
      createTransactionFromLeona({
        type: "INCOME",
        description: `${PARALELO}Consulta pelo Mercado Pago`,
        customerId,
        amount: "1.00",
        settled: true,
        category: "consultation_revenue",
        paymentMethod: "pix",
        externalId: "mp-corrida-0001",
        externalProvider: "MERCADO_PAGO",
      });

    const resultados = await Promise.allSettled([lancamento(), lancamento()]);

    const criadas = resultados.filter((r) => r.status === "fulfilled");
    const recusadas = resultados.filter((r) => r.status === "rejected");

    // Uma entra, a outra é recusada por já existir — e não por erro interno:
    // é a recusa limpa que faz o n8n parar antes de mandar a segunda mensagem.
    expect(criadas).toHaveLength(1);
    expect(recusadas).toHaveLength(1);
    const erro = (recusadas[0] as PromiseRejectedResult).reason as Error;
    expect(erro.message).toMatch(/já registrada/i);

    const lancadas = await testPrisma.transaction.findMany({
      where: { externalProvider: "MERCADO_PAGO", externalId: "mp-corrida-0001" },
      select: { id: true },
    });
    expect(lancadas).toHaveLength(1);
  });

  /**
   * Em 11/11 dois clientes ganharam duas consultas cada: a busca pela chave
   * externa estava fora da transação, então as duas chamadas liam "não existe"
   * antes de qualquer uma gravar. Agora a busca mora dentro da transação
   * serializável, o banco recusa a segunda e o retry a traz vendo a primeira.
   */
  it("cria uma venda só quando as duas chamadas correm ao mesmo tempo", async () => {
    const { id: customerId } = await upsertCustomerFromLeona({
      name: `${PARALELO}Comprador`,
      phone: "61900000779",
      externalId: "leona:61900000779",
      source: "Leona Flow",
    });

    const externalId = "consulta:61900000779";
    const venda = () =>
      createSaleFromLeona({
        customerId,
        externalId,
        items: [{ productName: "Consulta de crédito", quantity: 1 }],
        installments: [
          { label: "1ª parte", dueDate: new Date().toISOString(), amount: "58.50" },
          { label: "2ª parte", dueDate: new Date().toISOString(), amount: "58.50" },
        ],
      });

    const [um, dois] = await Promise.all([venda(), venda()]);

    expect(um.id).toBe(dois.id);
    expect([um.created, dois.created].filter(Boolean)).toHaveLength(1);
    // O contrato volta nas duas: a 2ª parte chega numa chamada separada e
    // precisa dele para alocar o pagamento na parcela certa.
    expect(dois.contracts.length).toBeGreaterThan(0);

    const vendas = await testPrisma.sale.findMany({
      where: { externalId, deletedAt: null },
      select: { id: true },
    });
    expect(vendas).toHaveLength(1);
  });
});
