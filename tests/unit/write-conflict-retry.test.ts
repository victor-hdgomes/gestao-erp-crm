import { describe, expect, it } from "vitest";

import { withWriteConflictRetry } from "@/server/shared/retry";

function prismaError(code: string) {
  return Object.assign(new Error(`Prisma falhou com ${code}`), { code });
}

describe("withWriteConflictRetry", () => {
  it("devolve o resultado sem repetir quando nao ha conflito", async () => {
    let chamadas = 0;

    const resultado = await withWriteConflictRetry(async () => {
      chamadas += 1;
      return "ok";
    });

    expect(resultado).toBe("ok");
    expect(chamadas).toBe(1);
  });

  it("repete o conflito de escrita e aceita o resultado da segunda tentativa", async () => {
    let chamadas = 0;

    const resultado = await withWriteConflictRetry(async () => {
      chamadas += 1;
      if (chamadas === 1) throw prismaError("P2034");
      return "gravou na segunda";
    });

    expect(resultado).toBe("gravou na segunda");
    expect(chamadas).toBe(2);
  });

  it("repete deadlock tambem", async () => {
    let chamadas = 0;

    await withWriteConflictRetry(async () => {
      chamadas += 1;
      if (chamadas < 3) throw prismaError("P2035");
      return null;
    });

    expect(chamadas).toBe(3);
  });

  // O ponto da funcao e nao esconder erro de verdade: sem isso, um pedido
  // invalido viraria tentativa repetida e o problema demoraria a aparecer.
  it("nao repete um erro que nao seja de concorrencia", async () => {
    let chamadas = 0;

    await expect(
      withWriteConflictRetry(async () => {
        chamadas += 1;
        throw prismaError("P2002");
      }),
    ).rejects.toThrow(/P2002/);

    expect(chamadas).toBe(1);
  });

  it("desiste depois do limite e deixa o ultimo erro subir", async () => {
    let chamadas = 0;

    await expect(
      withWriteConflictRetry(async () => {
        chamadas += 1;
        throw prismaError("P2034");
      }, 3),
    ).rejects.toThrow(/P2034/);

    expect(chamadas).toBe(3);
  });
});

/**
 * Um pagamento real caiu em 500 no dia 06/11 mesmo com o retry ligado: a
 * espera somava 150ms e a transação concorrente levava segundos, então a
 * perdedora desistia antes de a vencedora gravar.
 */
describe("fôlego da espera", () => {
  it("insiste por mais de um segundo antes de desistir", async () => {
    const inicio = Date.now();
    let chamadas = 0;

    await expect(
      withWriteConflictRetry(async () => {
        chamadas += 1;
        throw Object.assign(new Error("conflito"), { code: "P2034" });
      }),
    ).rejects.toThrow();

    expect(chamadas).toBe(6);
    expect(Date.now() - inicio).toBeGreaterThan(1000);
  });
});

/**
 * O erro que chegou de verdade em 09/11, no formato que o driver adapter
 * (@prisma/adapter-pg) entrega: sem `code`, com o codigo do Postgres enterrado
 * em `cause.originalCode`. A checagem antiga olhava so `error.code` e dizia
 * que isto nao era conflito, entao o retry nunca rodava e o 500 subia inteiro.
 */
function driverAdapterConflict() {
  return Object.assign(new Error("TransactionWriteConflict"), {
    name: "DriverAdapterError",
    cause: {
      originalCode: "40001",
      originalMessage:
        "could not serialize access due to read/write dependencies among transactions",
      kind: "TransactionWriteConflict",
    },
  });
}

describe("conflito vindo do driver adapter", () => {
  it("repete o DriverAdapterError de conflito de escrita", async () => {
    let chamadas = 0;

    const resultado = await withWriteConflictRetry(async () => {
      chamadas += 1;
      if (chamadas === 1) throw driverAdapterConflict();
      return "gravou na segunda";
    });

    expect(resultado).toBe("gravou na segunda");
    expect(chamadas).toBe(2);
  });

  it("repete quando o codigo do Postgres vem direto no erro", async () => {
    let chamadas = 0;

    await withWriteConflictRetry(async () => {
      chamadas += 1;
      if (chamadas < 2) throw prismaError("40001");
      return null;
    });

    expect(chamadas).toBe(2);
  });

  it("repete deadlock do Postgres (40P01)", async () => {
    let chamadas = 0;

    await withWriteConflictRetry(async () => {
      chamadas += 1;
      if (chamadas < 2) throw prismaError("40P01");
      return null;
    });

    expect(chamadas).toBe(2);
  });

  it("acha o conflito mesmo embrulhado em outro erro", async () => {
    let chamadas = 0;

    await withWriteConflictRetry(async () => {
      chamadas += 1;
      if (chamadas < 2) {
        throw Object.assign(new Error("falha na transacao"), {
          cause: driverAdapterConflict(),
        });
      }
      return null;
    });

    expect(chamadas).toBe(2);
  });

  // Continua valendo o ponto da funcao: erro de verdade nao vira tentativa.
  it("nao repete outro erro do driver adapter", async () => {
    let chamadas = 0;

    await expect(
      withWriteConflictRetry(async () => {
        chamadas += 1;
        throw Object.assign(new Error("coluna inexistente"), {
          name: "DriverAdapterError",
          cause: { originalCode: "42703", kind: "QueryError" },
        });
      }),
    ).rejects.toThrow(/coluna inexistente/);

    expect(chamadas).toBe(1);
  });
});
