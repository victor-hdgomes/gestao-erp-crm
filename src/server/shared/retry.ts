import "server-only";

/**
 * Codigos que o Postgres devolve quando duas transacoes serializaveis se
 * cruzam. P2034 e o conflito de escrita, P2035 o deadlock. Nenhum dos dois
 * significa que o pedido estava errado: significa que duas requisicoes
 * chegaram juntas e o banco desfez uma para manter a ordem.
 */
const RETRYABLE_PRISMA = new Set(["P2034", "P2035"]);

/**
 * Os mesmos conflitos vistos pelo lado do Postgres. 40001 e
 * "serialization_failure", 40P01 e "deadlock_detected".
 *
 * Estes importam porque o cliente aqui roda sobre o driver adapter
 * (@prisma/adapter-pg): nesse caminho o Prisma NAO traduz a falha para P2034 —
 * ele entrega um DriverAdapterError cru, com o codigo do Postgres guardado em
 * `cause.originalCode`. Foi exatamente assim que um pagamento real caiu em 500
 * no dia 09/11 com o retry ja ligado: o erro chegou como
 *
 *   Error [DriverAdapterError]: TransactionWriteConflict
 *     [cause]: { originalCode: '40001', kind: 'TransactionWriteConflict' }
 *
 * e a checagem antiga, que olhava so `error.code`, respondia "nao e conflito".
 * O retry nunca chegou a rodar uma vez sequer.
 */
const RETRYABLE_POSTGRES = new Set(["40001", "40P01"]);

/** Como o driver adapter nomeia o mesmo conflito quando nao manda o codigo. */
const RETRYABLE_KINDS = new Set(["TransactionWriteConflict", "TransactionDeadlock"]);

type ErrorLike = {
  code?: unknown;
  originalCode?: unknown;
  kind?: unknown;
  cause?: unknown;
};

/**
 * Procura o conflito no erro e em toda a cadeia de `cause`.
 *
 * A cadeia importa porque cada camada embrulha a anterior: o Prisma embrulha o
 * driver, que embrulha o erro do `pg`. O codigo pode aparecer em qualquer um
 * dos niveis, entao olhar so o primeiro deixa passar o caso real.
 */
function isRetryable(error: unknown): boolean {
  let current: unknown = error;

  // O limite existe so para nao girar para sempre se alguem montar um ciclo.
  for (let depth = 0; current && depth < 8; depth += 1) {
    const candidate = current as ErrorLike;

    if (typeof candidate.code === "string") {
      if (RETRYABLE_PRISMA.has(candidate.code)) return true;
      if (RETRYABLE_POSTGRES.has(candidate.code)) return true;
    }

    if (
      typeof candidate.originalCode === "string" &&
      RETRYABLE_POSTGRES.has(candidate.originalCode)
    ) {
      return true;
    }

    if (typeof candidate.kind === "string" && RETRYABLE_KINDS.has(candidate.kind)) return true;

    current = candidate.cause;
  }

  return false;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Roda de novo uma transacao que o banco abortou por conflito de escrita.
 *
 * Isso nao e um caso raro aqui: o Mercado Pago avisa o mesmo pagamento duas ou
 * tres vezes dentro do mesmo segundo, uma vez como "payment" e outra como
 * "order", e as chamadas chegam ao ERP em paralelo. Sob isolamento
 * serializavel, uma delas e desfeita. Repetir e o conserto certo — na segunda
 * tentativa a perdedora enxerga o que a vencedora gravou e segue pelo caminho
 * de "ja registrado", que e exatamente o que queremos.
 *
 * Sem isso, o conflito sobe como erro 500 e o fluxo do n8n para no meio: o
 * dinheiro entrou e o cliente nao recebe a confirmacao.
 */
export async function withWriteConflictRetry<T>(
  run: () => Promise<T>,
  attempts = 6,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (!isRetryable(error) || attempt >= attempts) throw error;

      // A espera dobra a cada tentativa porque quem perdeu a corrida precisa
      // esperar a transacao vencedora terminar, e ela leva segundos, nao
      // milissegundos. Com a espera linear de antes o total dava 150ms e a
      // segunda chamada desistia antes da primeira gravar — foi assim que um
      // pagamento real caiu em 500 mesmo com o retry ligado. Agora a soma
      // passa de um segundo e meio. O jitter evita que as duas voltem a
      // colidir em sincronia.
      await sleep(50 * 2 ** (attempt - 1) + Math.random() * 50);
    }
  }
}
