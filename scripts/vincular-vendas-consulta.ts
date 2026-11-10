/**
 * Liga as consultas ja pagas a uma venda do catalogo.
 *
 * Os pagamentos do Mercado Pago entravam no ERP so como lancamento financeiro:
 * dinheiro no caixa, sem venda, sem servico vendido e sem o custo de R$ 25,00
 * da consulta. Este script cria, para cada consulta ja paga, a venda que
 * faltava e pendura os lancamentos existentes nas parcelas dela.
 *
 * Uma consulta custa R$ 117,00 e pode ser paga de duas formas:
 *   - a vista -> 1 parcela de 117,00  (descricao "Consulta + Analise...")
 *   - em duas -> 2 parcelas de 58,50  (descricoes "1a parte" e "2a parte")
 * Nos dois casos e UMA venda e UM custo de 25,00. Criar uma venda por parcela
 * dobraria o custo e inventaria uma consulta que ninguem comprou.
 *
 * Roda em modo simulacao por padrao, no banco local. As combinacoes:
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/vincular-vendas-consulta.ts
 *   ...                                                                 --prod
 *   ...                                                      --aplicar --prod
 *
 * E idempotente de duas maneiras, porque a primeira execucao em producao
 * parou no meio por timeout e deixou uma venda sem as parcelas pagas:
 *   - lancamento que ja tem alocacao nao entra de novo;
 *   - venda que ja existe para aquela consulta e reaproveitada, nao duplicada.
 */
import "./carrega-env";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { createSale } from "../src/server/sales/sales-service";
import { recalculateInstallment } from "../src/server/finance/transactions";

const APLICAR = process.argv.includes("--aplicar");
const PRODUTO = "Consulta de crédito";
const ATOR = "Correcao retroativa";

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

type Pagamento = {
  id: string;
  code: string;
  valor: string;
  pagoEm: Date;
  parte: "1" | "2" | "unica";
};

type Consulta = {
  clienteId: string;
  clienteNome: string;
  telefone: string | null;
  modelo: "unica" | "5050";
  pagamentos: Pagamento[];
};

type Contrato = {
  id: string;
  code: string;
  installments: { id: string; number: number }[];
};

function classificar(descricao: string): "1" | "2" | "unica" {
  const d = descricao.toLowerCase();
  if (d.includes("2a parte") || d.includes("2ª parte")) return "2";
  if (d.includes("1a parte") || d.includes("1ª parte")) return "1";
  return "unica";
}

function maisDias(data: Date, dias: number): Date {
  const nova = new Date(data);
  nova.setDate(nova.getDate() + dias);
  return nova;
}

function chaveExterna(consulta: Consulta): string | null {
  return consulta.telefone ? `consulta:${consulta.telefone}` : null;
}

async function montarConsultas(): Promise<Consulta[]> {
  const lancamentos = await prisma.transaction.findMany({
    where: {
      type: "INCOME",
      status: "SETTLED",
      customerId: { not: null },
      description: { contains: "Consulta", mode: "insensitive" },
    },
    include: {
      customer: true,
      allocations: { where: { reversedAt: null } },
    },
    orderBy: { createdAt: "asc" },
  });

  // So entra o que tem cara de consulta: 117,00 a vista ou 58,50 por parte.
  // Teste antigo de valor quebrado (R$ 1,00) nao vira venda, senao a correcao
  // inventaria uma consulta de 117 que ninguem comprou.
  const VALORES = new Set(["117.00", "58.50"]);
  const semAlocacao = lancamentos.filter((l) => l.allocations.length === 0);
  const soltos = semAlocacao.filter((l) => VALORES.has(l.settledAmount.toFixed(2)));

  for (const fora of semAlocacao.filter((l) => !VALORES.has(l.settledAmount.toFixed(2)))) {
    console.warn(
      `! ${fora.code} (${fora.customer?.name ?? "sem cliente"}) e de R$ ${fora.settledAmount} — ` +
        `nao e 117,00 nem 58,50. Fica como esta.`,
    );
  }

  console.log(
    `Lancamentos de consulta liquidados: ${lancamentos.length} | ja vinculados: ` +
      `${lancamentos.length - semAlocacao.length} | fora do padrao: ` +
      `${semAlocacao.length - soltos.length} | a vincular: ${soltos.length}\n`,
  );

  const porCliente = new Map<string, typeof soltos>();
  for (const l of soltos) {
    const lista = porCliente.get(l.customerId!) ?? [];
    lista.push(l);
    porCliente.set(l.customerId!, lista);
  }

  const consultas: Consulta[] = [];

  for (const [clienteId, lista] of porCliente) {
    const cliente = lista[0].customer!;
    // Consultas em aberto: uma "1a parte" fica esperando a "2a parte" do
    // mesmo cliente. Fila, para o caso de alguem comprar duas vezes.
    const aguardando: Consulta[] = [];

    for (const l of lista) {
      const parte = classificar(l.description);
      const pagamento: Pagamento = {
        id: l.id,
        code: l.code,
        valor: l.settledAmount.toFixed(2),
        pagoEm: l.settledAt ?? l.competenceDate ?? l.createdAt,
        parte,
      };

      if (parte === "unica") {
        consultas.push({
          clienteId,
          clienteNome: cliente.name,
          telefone: cliente.phone,
          modelo: "unica",
          pagamentos: [pagamento],
        });
        continue;
      }

      if (parte === "1") {
        const consulta: Consulta = {
          clienteId,
          clienteNome: cliente.name,
          telefone: cliente.phone,
          modelo: "5050",
          pagamentos: [pagamento],
        };
        consultas.push(consulta);
        aguardando.push(consulta);
        continue;
      }

      const aberta = aguardando.shift();
      if (aberta) {
        aberta.pagamentos.push(pagamento);
      } else {
        console.warn(
          `! ${cliente.name}: ${l.code} e "2a parte" sem a "1a parte" correspondente. Ignorado.`,
        );
      }
    }
  }

  return consultas;
}

/** Venda que ja existe para esta consulta, de uma execucao anterior. */
async function vendaExistente(consulta: Consulta) {
  const externalId = chaveExterna(consulta);
  if (!externalId) return null;

  const venda = await prisma.sale.findFirst({
    where: { externalId, deletedAt: null, customerId: consulta.clienteId },
    orderBy: { createdAt: "desc" },
    include: { contracts: { include: { installments: { orderBy: { number: "asc" } } } } },
  });

  if (!venda || venda.contracts.length === 0) return null;
  return venda;
}

async function criarVenda(consulta: Consulta, produto: { id: string; defaultCost: unknown }) {
  const primeiro = consulta.pagamentos[0];
  const segundo = consulta.pagamentos[1] ?? null;

  const parcelas =
    consulta.modelo === "unica"
      ? [{ label: "Pagamento único", dueDate: primeiro.pagoEm, amount: "117.00" }]
      : [
          { label: "1ª parte", dueDate: primeiro.pagoEm, amount: "58.50" },
          {
            label: "2ª parte",
            // Quem ainda nao pagou a segunda parte fica com vencimento a
            // frente, nao vencido no mesmo dia da primeira.
            dueDate: segundo ? segundo.pagoEm : maisDias(primeiro.pagoEm, 7),
            amount: "58.50",
          },
        ];

  return createSale(
    {
      customerId: consulta.clienteId,
      soldAt: primeiro.pagoEm,
      discount: "0",
      notes: "Venda criada pela correcao retroativa dos pagamentos do Mercado Pago.",
      items: [
        {
          productId: produto.id,
          quantity: 1,
          unitPrice: "117.00",
          unitCost: String(produto.defaultCost),
          discount: "0",
        },
      ],
      contract: {
        startDate: primeiro.pagoEm,
        installments: parcelas.map((p) => ({
          label: p.label,
          dueDate: p.dueDate,
          amount: p.amount,
          paymentMethodId: null,
          notes: null,
        })),
      },
    },
    {
      actorLabel: ATOR,
      // Mesma chave que o fluxo novo usa, para a segunda parcela cair aqui.
      externalId: chaveExterna(consulta),
    },
  );
}

/**
 * Pendura cada lancamento na parcela que ele pagou. Nao mexe no valor do
 * lancamento: ele ja estava liquidado, so faltava o vinculo.
 *
 * Uma transacao por pagamento, e nao uma para a consulta inteira: o recalculo
 * sobe de parcela para contrato e para venda, e o conjunto estourou o limite
 * de 5 segundos do Prisma na primeira tentativa em producao.
 */
async function alocar(consulta: Consulta, contrato: Contrato) {
  for (const pagamento of consulta.pagamentos) {
    const jaTem = await prisma.transactionAllocation.count({
      where: { transactionId: pagamento.id, reversedAt: null },
    });
    if (jaTem > 0) continue;

    const indice = pagamento.parte === "2" ? 1 : 0;
    const parcela = contrato.installments[indice];
    if (!parcela) throw new Error(`Parcela ${indice + 1} nao existe em ${contrato.code}.`);

    await prisma.$transaction(
      async (tx) => {
        await tx.transactionAllocation.create({
          data: {
            transactionId: pagamento.id,
            targetType: "INSTALLMENT",
            installmentId: parcela.id,
            contractId: contrato.id,
            amount: pagamento.valor,
          },
        });

        await recalculateInstallment(tx, parcela.id);
      },
      { timeout: 25000 },
    );
  }
}

async function main() {
  const produto = await prisma.productService.findFirst({
    where: { name: PRODUTO, deletedAt: null },
  });
  if (!produto) throw new Error(`Servico "${PRODUTO}" nao encontrado no catalogo.`);

  console.log(
    `Servico: ${produto.name} | preco ${produto.defaultPrice} | custo ${produto.defaultCost} | ` +
      `card no CRM: ${produto.createsCrmCard ? "sim" : "nao"}\n`,
  );

  const consultas = await montarConsultas();

  if (consultas.length === 0) {
    console.log("Nada a fazer: todo pagamento de consulta ja esta vinculado a uma venda.");
    return;
  }

  console.log(`Consultas a tratar: ${consultas.length}\n`);
  for (const c of consultas) {
    const partes = c.pagamentos.map((p) => `${p.code} (${p.parte}) R$ ${p.valor}`).join(" + ");
    const recebido = c.pagamentos.reduce((soma, p) => soma + Number(p.valor), 0);
    console.log(
      `  ${c.clienteNome.padEnd(26)} ${c.modelo.padEnd(6)} recebido R$ ${recebido
        .toFixed(2)
        .padStart(7)} de 117,00 | ${partes}`,
    );
  }

  const custoTotal = consultas.length * Number(produto.defaultCost);
  console.log(
    `\nResumo: ${consultas.length} vendas de R$ 117,00, custo de R$ ${custoTotal.toFixed(2)}.`,
  );

  if (!APLICAR) {
    console.log("\nSimulacao. Rode de novo com --aplicar para gravar.");
    return;
  }

  console.log("\nGravando...\n");
  for (const consulta of consultas) {
    const existente = await vendaExistente(consulta);
    const venda = existente ?? (await criarVenda(consulta, produto));
    const contrato = venda.contracts[0];
    if (!contrato) throw new Error(`Venda ${venda.code} saiu sem contrato.`);

    await alocar(consulta, contrato);

    console.log(
      `  ${venda.code}  ${contrato.code}  ${consulta.clienteNome}` +
        (existente ? "  (venda ja existia, faltavam as parcelas)" : ""),
    );
  }
  console.log("\nPronto.");
}

main()
  .catch((erro) => {
    console.error("\nFalhou:", erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
