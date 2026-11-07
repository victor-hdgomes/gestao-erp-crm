import { describe, expect, it } from "vitest";

import type { FichaVenda } from "@/lib/importers/ficha-venda";
import { montarPlano, somarMeses } from "@/lib/importers/plano-parcelas";

const VAZIA: FichaVenda = {
  nome: "Cliente",
  cpf: null,
  email: null,
  endereco: null,
  telefone: null,
  fechamentoEm: "2026-01-31",
  valorTotal: null,
  parcelas: null,
  entradaValor: null,
  entradaEm: null,
  intermediariaValor: null,
  intermediariaEm: null,
};

const ficha = (campos: Partial<FichaVenda>): FichaVenda => ({ ...VAZIA, ...campos });
const soma = (parcelas: { amount: string }[]) =>
  parcelas.reduce((acc, p) => acc + Math.round(Number(p.amount) * 100), 0);

describe("somarMeses", () => {
  it("encolhe o dia quando o mês seguinte é mais curto", () => {
    expect(somarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(somarMeses("2026-01-31", 3)).toBe("2026-04-30");
  });

  it("mantém o dia quando cabe", () => {
    expect(somarMeses("2026-01-10", 1)).toBe("2026-02-10");
    expect(somarMeses("2026-12-05", 1)).toBe("2027-01-05");
  });
});

describe("montarPlano", () => {
  it("monta entrada mais mensais que somam o total", () => {
    const { parcelas, avisos } = montarPlano(
      ficha({
        fechamentoEm: "2026-11-05",
        valorTotal: "1500.00",
        parcelas: 3,
        entradaValor: "500.00",
        entradaEm: "2026-11-05",
      }),
    );

    expect(avisos).toEqual([]);
    expect(parcelas).toEqual([
      { label: "Entrada", dueDate: "2026-11-05", amount: "500.00" },
      { label: "Parcela 1 de 2", dueDate: "2026-12-05", amount: "500.00" },
      { label: "Parcela 2 de 2", dueDate: "2027-01-05", amount: "500.00" },
    ]);
  });

  it("inclui a intermediária na contagem", () => {
    const { parcelas, avisos } = montarPlano(
      ficha({
        fechamentoEm: "2026-11-05",
        valorTotal: "1500.00",
        parcelas: 3,
        entradaValor: "500.00",
        entradaEm: "2026-11-05",
        intermediariaValor: "500.00",
        intermediariaEm: "2026-12-05",
      }),
    );

    expect(avisos).toEqual([]);
    expect(parcelas.map((p) => p.label)).toEqual(["Entrada", "Intermediária", "Pagamento"]);
    expect(soma(parcelas)).toBe(150000);
  });

  // O caso que quebra divisão ingênua: 100/3 não fecha em centavos.
  it("não perde centavo quando a divisão não é exata", () => {
    const { parcelas } = montarPlano(ficha({ valorTotal: "100.00", parcelas: 3 }));

    expect(parcelas.map((p) => p.amount)).toEqual(["33.34", "33.33", "33.33"]);
    expect(soma(parcelas)).toBe(10000);
  });

  it("trata o pagamento único", () => {
    const { parcelas, avisos } = montarPlano(
      ficha({ fechamentoEm: "2026-11-05", valorTotal: "117.00" }),
    );

    expect(avisos).toEqual([]);
    expect(parcelas).toEqual([{ label: "Pagamento", dueDate: "2026-11-05", amount: "117.00" }]);
  });

  it("avisa quando entrada e intermediária passam do total", () => {
    const { avisos } = montarPlano(
      ficha({ valorTotal: "100.00", entradaValor: "80.00", intermediariaValor: "50.00" }),
    );

    expect(avisos.join(" ")).toMatch(/somam mais que o valor total/);
  });

  it("avisa quando sobra dinheiro sem parcela", () => {
    const { parcelas, avisos } = montarPlano(
      ficha({ valorTotal: "1000.00", parcelas: 1, entradaValor: "400.00" }),
    );

    expect(parcelas).toHaveLength(1);
    expect(avisos.join(" ")).toMatch(/Sobraram R\$ 600,?\.?00|Sobraram R\$ 600.00/);
  });

  it("não monta nada sem valor total", () => {
    const { parcelas, avisos } = montarPlano(ficha({}));
    expect(parcelas).toEqual([]);
    expect(avisos).toHaveLength(1);
  });
});
