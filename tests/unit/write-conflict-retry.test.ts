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
