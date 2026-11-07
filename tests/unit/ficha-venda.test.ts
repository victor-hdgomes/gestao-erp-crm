import { describe, expect, it } from "vitest";

import { lerData, lerDinheiro, lerFichaVenda } from "@/lib/importers/ficha-venda";

const HOJE = new Date("2026-11-07T12:00:00Z");

/** A ficha como ela sai do modelo que o cliente recebe, preenchida certinho. */
const FICHA_LIMPA = `Nome completo: Maria Aparecida de Souza
CPF: 529.982.247-25
E-mail: Maria.Souza@Exemplo.com
Endereço completo: Rua das Acácias, 120, apto 31
Telefone pessoal: (61) 99166-4479
Data de fechamento do serviço: 05/11/2026
Valor total do serviço: R$ 1.500,00
Número de parcelas: 3
Valor da entrada: R$ 500,00
Data de pagamento da entrada: 05/11/2026
Valor da parcela intermediária (se houver): R$ 500,00
Data de pagamento da parcela intermediária (se houver): 05/12/2026`;

describe("lerDinheiro", () => {
  it("entende os formatos que aparecem no WhatsApp", () => {
    expect(lerDinheiro("R$ 1.500,00")).toBe("1500.00");
    expect(lerDinheiro("1.500,00")).toBe("1500.00");
    expect(lerDinheiro("1500,50")).toBe("1500.50");
    expect(lerDinheiro("1500")).toBe("1500.00");
    expect(lerDinheiro("1500.50")).toBe("1500.50");
    expect(lerDinheiro(" r$117 ")).toBe("117.00");
  });

  // O ponto é ambíguo em português e é onde um leitor desatento erra por 1000x.
  it("trata o ponto como milhar quando separa três casas", () => {
    expect(lerDinheiro("1.500")).toBe("1500.00");
    expect(lerDinheiro("12.000")).toBe("12000.00");
    expect(lerDinheiro("1.50")).toBe("1.50");
  });

  it("recusa o que não é dinheiro", () => {
    expect(lerDinheiro("combinado")).toBeNull();
    expect(lerDinheiro("")).toBeNull();
    expect(lerDinheiro("0")).toBeNull();
  });
});

describe("lerData", () => {
  // O motivo de existir esta função: new Date("10/01/2026") devolve outubro.
  it("lê dia/mês/ano no formato brasileiro, não no americano", () => {
    expect(lerData("10/01/2026")).toBe("2026-01-10");
    expect(lerData("05/11/2026")).toBe("2026-11-05");
    expect(lerData("1/2/26")).toBe("2026-02-01");
    expect(lerData("10-01-2026")).toBe("2026-01-10");
  });

  it("aceita mês por extenso e data já em ISO", () => {
    expect(lerData("10 de janeiro de 2026")).toBe("2026-01-10");
    expect(lerData("3 de março")).toBe(`${new Date().getFullYear()}-03-03`);
    expect(lerData("2026-01-10")).toBe("2026-01-10");
  });

  it("recusa data que não existe", () => {
    expect(lerData("31/02/2026")).toBeNull();
    expect(lerData("semana que vem")).toBeNull();
  });
});

describe("lerFichaVenda", () => {
  it("lê a ficha preenchida sem sobrar nada", () => {
    const { dados, naoLidos, faltando } = lerFichaVenda(FICHA_LIMPA, HOJE);

    expect(faltando).toEqual([]);
    expect(naoLidos).toEqual([]);
    expect(dados).toEqual({
      nome: "Maria Aparecida de Souza",
      cpf: "52998224725",
      email: "maria.souza@exemplo.com",
      endereco: "Rua das Acácias, 120, apto 31",
      telefone: "61991664479",
      fechamentoEm: "2026-11-05",
      valorTotal: "1500.00",
      parcelas: 3,
      entradaValor: "500.00",
      entradaEm: "2026-11-05",
      intermediariaValor: "500.00",
      intermediariaEm: "2026-12-05",
    });
  });

  it("não confunde valor total com valor da entrada", () => {
    const { dados } = lerFichaVenda(
      ["Valor total do serviço: 1200", "Valor da entrada: 400", "Nome: Joao"].join("\n"),
      HOJE,
    );

    expect(dados.valorTotal).toBe("1200.00");
    expect(dados.entradaValor).toBe("400.00");
  });

  it("junta o endereço que o cliente quebrou em várias linhas", () => {
    const { dados } = lerFichaVenda(
      [
        "Nome: Joao",
        "Endereço completo: Rua A, 10",
        "Bairro Centro",
        "Goiânia - GO",
        "Telefone: 62994849138",
        "Valor: 300",
      ].join("\n"),
      HOJE,
    );

    expect(dados.endereco).toBe("Rua A, 10, Bairro Centro, Goiânia - GO");
    expect(dados.telefone).toBe("62994849138");
  });

  it("entende o telefone com o 55 na frente", () => {
    const { dados } = lerFichaVenda("Nome: Ana\nValor: 100\nTelefone: +55 61 99166-4479", HOJE);
    expect(dados.telefone).toBe("61991664479");
  });

  // Os campos "(se houver)" voltam em branco na maioria das fichas.
  it("trata campo vazio ou 'não houve' como ausente, sem reclamar", () => {
    const { dados, naoLidos } = lerFichaVenda(
      [
        "Nome: Ana",
        "Valor total: 900",
        "Valor da parcela intermediária (se houver):",
        "Data de pagamento da parcela intermediária (se houver): não houve",
      ].join("\n"),
      HOJE,
    );

    expect(dados.intermediariaValor).toBeNull();
    expect(dados.intermediariaEm).toBeNull();
    expect(naoLidos).toEqual([]);
  });

  // O ponto do desenho: o que não deu para ler aparece, em vez de entrar torto.
  it("acusa o campo que não conseguiu entender em vez de chutar", () => {
    const { dados, naoLidos } = lerFichaVenda(
      ["Nome: Ana", "Valor total: 900", "CPF: 111.111.111-11", "Data de fechamento: qualquer dia"].join(
        "\n",
      ),
      HOJE,
    );

    expect(dados.cpf).toBeNull();
    expect(dados.fechamentoEm).toBeNull();
    expect(naoLidos).toHaveLength(2);
    expect(naoLidos.join(" ")).toMatch(/CPF/);
    expect(naoLidos.join(" ")).toMatch(/fechamento/i);
  });

  it("avisa o que falta quando a ficha vem pela metade", () => {
    const { faltando } = lerFichaVenda("CPF: 529.982.247-25", HOJE);
    expect(faltando).toEqual(["Nome completo", "Valor total do serviço"]);
  });

  it("ignora a conversa em volta da ficha", () => {
    const { dados, faltando } = lerFichaVenda(
      [
        "boa tarde! segue aí 👇",
        "Nome completo: Carlos Lima",
        "Valor total do serviço: R$ 2.000,00",
        "qualquer coisa me chama",
      ].join("\n"),
      HOJE,
    );

    expect(dados.nome).toBe("Carlos Lima");
    expect(dados.valorTotal).toBe("2000.00");
    expect(faltando).toEqual([]);
  });

  it("aceita traço no lugar dos dois pontos e caixa alta", () => {
    const { dados } = lerFichaVenda("NOME COMPLETO - Paula Dias\nVALOR TOTAL - 450", HOJE);
    expect(dados.nome).toBe("Paula Dias");
    expect(dados.valorTotal).toBe("450.00");
  });
});
