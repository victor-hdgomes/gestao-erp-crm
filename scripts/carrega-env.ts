/**
 * Escolhe o arquivo de ambiente antes de qualquer outro import.
 *
 * Precisa ser um modulo separado e ser o primeiro import do script: os
 * services do ERP leem as variaveis no momento em que sao importados, entao
 * chamar dotenv no corpo do script seria tarde demais.
 *
 * `override: true` nao e detalhe: o proprio tsx ja injeta o .env local antes
 * de qualquer linha nossa rodar, e o dotenv, por padrao, nao sobrescreve o que
 * ja existe. Sem isso o `--prod` apontaria para o banco local sem avisar.
 *
 * Sem `--prod` usa o .env local. Producao so entra se for pedida na linha de
 * comando, nunca por engano.
 */
import { config } from "dotenv";

const arquivo = process.argv.includes("--prod") ? ".env.production" : ".env";
config({ path: arquivo, override: true });

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "";
const host = url.replace(/^[a-z]+:\/\/[^@]*@?/i, "").split("/")[0] || "desconhecido";

console.log(`Ambiente: ${arquivo} | banco: ${host}\n`);
