/**
 * Lanca a despesa do custo das vendas que ja existiam.
 *
 * O custo do catalogo (R$ 25,00 na consulta) ficava so como margem no
 * relatorio de servicos. Nao era lancamento, entao "Despesas pagas" marcava
 * zero e o caixa mostrava receita sem o custo correspondente.
 *
 * A venda nova ja nasce com a despesa. Este script faz o mesmo para as que
 * foram criadas antes, pelo mesmo caminho do codigo — nao por uma copia da
 * regra, para as duas rotas nao divergirem.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/lancar-custo-das-vendas.ts --prod
 *   ...                                                             --aplicar --prod
 *
 * Idempotente: a chave (externalProvider, externalId) e unica no banco, com
 * o id do item da venda. Rodar de novo nao duplica despesa.
 */
import "./carrega-env";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  ORIGEM_CUSTO_VENDA,
  registrarCustoDeVendaExistente,
} from "../src/server/sales/sales-service";

const APLICAR = process.argv.includes("--aplicar");
const ATOR = "Correcao retroativa";

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const vendas = await prisma.sale.findMany({
    where: { deletedAt: null, status: { not: "CANCELLED" } },
    include: { customer: true, items: true },
    orderBy: { code: "asc" },
  });

  const jaLancadas = await prisma.transaction.findMany({
    where: { externalProvider: ORIGEM_CUSTO_VENDA },
    select: { externalId: true },
  });
  const comDespesa = new Set(jaLancadas.map((t) => t.externalId));

  const pendentes = vendas.filter((venda) =>
    venda.items.some(
      (item) => Number(item.unitCost) > 0 && !comDespesa.has(item.id),
    ),
  );

  console.log(
    `Vendas: ${vendas.length} | itens com custo ja lancado: ${comDespesa.size} | ` +
      `vendas a tratar: ${pendentes.length}\n`,
  );

  if (pendentes.length === 0) {
    console.log("Nada a fazer: o custo de toda venda ja esta lancado como despesa.");
    return;
  }

  let total = 0;
  for (const venda of pendentes) {
    const custo = venda.items.reduce(
      (soma, item) => soma + Number(item.unitCost) * item.quantity,
      0,
    );
    total += custo;
    console.log(
      `  ${venda.code}  ${venda.customer.name.padEnd(26)} custo R$ ${custo.toFixed(2)}`,
    );
  }
  console.log(`\nTotal a lancar como despesa: R$ ${total.toFixed(2)}`);

  if (!APLICAR) {
    console.log("\nSimulacao. Rode de novo com --aplicar para gravar.");
    return;
  }

  console.log("\nGravando...\n");
  for (const venda of pendentes) {
    await registrarCustoDeVendaExistente(venda.id, ATOR);
    console.log(`  ${venda.code}  ok`);
  }
  console.log("\nPronto.");
}

main()
  .catch((erro) => {
    console.error("\nFalhou:", erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
