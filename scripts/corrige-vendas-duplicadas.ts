/**
 * Desfaz as vendas duplicadas que nasceram da corrida do webhook em 11/11.
 *
 * O Mercado Pago avisou o mesmo pagamento duas vezes no mesmo segundo, o n8n
 * rodou as duas execucoes em paralelo e as duas criaram venda: Giliard e
 * Andre Rafel ficaram com duas consultas cada, dois custos de R$ 25,00 e, no
 * caso do Giliard, a 2a parte paga pendurada na venda errada.
 *
 * A causa ja esta fechada (Idempotency-Key no n8n + dedupe dentro da
 * transacao serializavel). Este script so arruma o que ja entrou:
 *
 *   1. move o pagamento da 2a parte do Giliard para a parcela 2 da venda boa;
 *   2. cancela o custo duplicado das vendas sobrando;
 *   3. cancela e apaga (soft delete) as vendas sobrando, com contrato,
 *      parcelas e servico.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/corrige-vendas-duplicadas.ts --prod
 *   ...                                                            --aplicar --prod
 *
 * Idempotente: olha o estado antes de cada passo e pula o que ja esta certo.
 * Recusa apagar venda que ainda tenha pagamento alocado — dinheiro recebido
 * nao some junto com a venda.
 */
import "./carrega-env";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { recalculateInstallment, recalculateSale } from "../src/server/finance/transactions";

const APLICAR = process.argv.includes("--aplicar");
const ATOR = "Correcao da venda duplicada";

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

/** Pagamento preso na venda errada: para onde ele tem de ir. */
const MUDANCAS = [
  { lancamento: "TRX-2026-00033", vendaDestino: "VND-2026-00012", parcelaDestino: 2 },
];

/** Vendas que nao deviam existir. */
const DESCARTAR = ["VND-2026-00013", "VND-2026-00015"];

async function moverPagamento(mudanca: (typeof MUDANCAS)[number]) {
  const lancamento = await prisma.transaction.findFirst({
    where: { code: mudanca.lancamento },
    include: { allocations: { where: { reversedAt: null }, include: { installment: true } } },
  });
  if (!lancamento) throw new Error(`${mudanca.lancamento} nao existe.`);

  const venda = await prisma.sale.findFirst({
    where: { code: mudanca.vendaDestino },
    include: { contracts: { include: { installments: { orderBy: { number: "asc" } } } } },
  });
  const contrato = venda?.contracts[0];
  const destino = contrato?.installments.find((p) => p.number === mudanca.parcelaDestino);
  if (!venda || !contrato || !destino) {
    throw new Error(`Parcela ${mudanca.parcelaDestino} de ${mudanca.vendaDestino} nao existe.`);
  }

  if (lancamento.allocations.some((a) => a.installmentId === destino.id)) {
    console.log(`  ${mudanca.lancamento} ja esta na parcela certa. Nada a fazer.`);
    return;
  }

  const atual = lancamento.allocations[0];
  console.log(
    `  ${mudanca.lancamento} (R$ ${lancamento.settledAmount}) sai da parcela ` +
      `${atual?.installment?.number ?? "?"} do contrato ${atual?.contractId ?? "-"} ` +
      `e vai para ${contrato.code} parcela ${destino.number}.`,
  );
  if (!APLICAR) return;

  await prisma.$transaction(
    async (tx) => {
      const agora = new Date();
      const mexidas = new Set<string>();

      for (const alocacao of lancamento.allocations) {
        if (alocacao.installmentId) mexidas.add(alocacao.installmentId);
        await tx.transactionAllocation.update({
          where: { id: alocacao.id },
          data: { reversedAt: agora },
        });
      }

      await tx.transactionAllocation.create({
        data: {
          transactionId: lancamento.id,
          targetType: "INSTALLMENT",
          installmentId: destino.id,
          contractId: contrato.id,
          amount: lancamento.settledAmount,
        },
      });

      for (const id of mexidas) await recalculateInstallment(tx, id);
      await recalculateInstallment(tx, destino.id);
      await recalculateSale(tx, venda.id);

      await tx.auditLog.create({
        data: {
          actorLabel: ATOR,
          action: "transaction.reallocate",
          entity: "Transaction",
          entityId: lancamento.id,
          changes: {
            de: atual?.installmentId ?? null,
            para: destino.id,
            motivo: "pagamento caiu na venda duplicada",
          },
        },
      });
    },
    { timeout: 25000 },
  );
  console.log("    movido.");
}

async function descartarVenda(code: string) {
  const venda = await prisma.sale.findFirst({
    where: { code },
    include: {
      items: true,
      contracts: {
        include: { installments: { include: { allocations: { where: { reversedAt: null } } } } },
      },
    },
  });
  if (!venda) throw new Error(`${code} nao existe.`);

  if (venda.deletedAt) {
    console.log(`  ${code} ja esta apagada. Nada a fazer.`);
    return;
  }

  const presos = venda.contracts.flatMap((c) => c.installments.flatMap((p) => p.allocations));
  if (presos.length > 0) {
    throw new Error(
      `${code} ainda tem ${presos.length} pagamento(s) alocado(s). Mova antes de descartar.`,
    );
  }

  const custos = await prisma.transaction.findMany({
    where: {
      externalProvider: "SALE_COST",
      externalId: { in: venda.items.map((i) => i.id) },
      status: { not: "CANCELLED" },
    },
  });

  console.log(
    `  ${code}: cancela e apaga a venda, ${venda.contracts.length} contrato(s) e ` +
      `${custos.length} custo(s) duplicado(s) (${custos.map((t) => t.code).join(", ") || "nenhum"}).`,
  );
  if (!APLICAR) return;

  await prisma.$transaction(
    async (tx) => {
      const agora = new Date();

      for (const custo of custos) {
        await tx.transaction.update({
          where: { id: custo.id },
          data: {
            status: "CANCELLED",
            cancelledAt: agora,
            notes: `${custo.notes ?? ""}\n[CANCELADO] custo da venda duplicada ${code}`.trim(),
          },
        });
      }

      await tx.installment.updateMany({
        where: { contract: { saleId: venda.id } },
        data: { status: "CANCELLED" },
      });
      await tx.contract.updateMany({
        where: { saleId: venda.id },
        data: { status: "CANCELLED" },
      });
      await tx.crmCard.updateMany({
        where: { contract: { saleId: venda.id } },
        data: { status: "ARCHIVED" },
      });
      await tx.serviceExecution.updateMany({
        where: { saleId: venda.id },
        data: { status: "CANCELLED" },
      });
      await tx.sale.update({
        where: { id: venda.id },
        data: {
          status: "CANCELLED",
          cancelledAt: agora,
          deletedAt: agora,
          notes:
            `${venda.notes ?? ""}\n[duplicada] criada pela corrida do webhook do Mercado Pago em 11/11.`.trim(),
        },
      });

      await tx.auditLog.create({
        data: {
          actorLabel: ATOR,
          action: "sale.delete",
          entity: "Sale",
          entityId: venda.id,
          changes: { code, motivo: "venda duplicada pela corrida do webhook" },
        },
      });
    },
    { timeout: 25000 },
  );
  console.log("    descartada.");
}

async function main() {
  console.log("Passo 1 — pagamento na venda errada\n");
  for (const mudanca of MUDANCAS) await moverPagamento(mudanca);

  console.log("\nPasso 2 — vendas duplicadas\n");
  for (const code of DESCARTAR) await descartarVenda(code);

  if (!APLICAR) console.log("\nSimulacao. Rode de novo com --aplicar para gravar.");
  else console.log("\nPronto.");
}

main()
  .catch((erro) => {
    console.error("\nFalhou:", erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
