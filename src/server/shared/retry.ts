import "server-only";

/**
 * Codigos que o Postgres devolve quando duas transacoes serializaveis se
 * cruzam. P2034 e o conflito de escrita, P2035 o deadlock. Nenhum dos dois
 * significa que o pedido estava errado: significa que duas requisicoes
 * chegaram juntas e o banco desfez uma para manter a ordem.
 */
const RETRYABLE = new Set(["P2034", "P2035"]);

function isRetryable(error: unknown): boolean {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return typeof code === "string" && RETRYABLE.has(code);
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
  attempts = 4,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (!isRetryable(error) || attempt >= attempts) throw error;
      // O jitter evita que as duas requisicoes voltem a colidir em sincronia.
      await sleep(attempt * 25 + Math.random() * 25);
    }
  }
}
