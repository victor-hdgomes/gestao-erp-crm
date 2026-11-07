import type { FichaVenda } from "@/lib/importers/ficha-venda";

/**
 * Transforma o que a ficha diz sobre dinheiro num plano de parcelas.
 *
 * A ficha descreve o combinado em prosa — total, quantas vezes, quanto de
 * entrada, se houve uma intermediaria — e o sistema precisa de uma lista de
 * vencimentos com valores que somem exatamente o total. A conta e feita em
 * centavos para nao sobrar um centavo perdido no fim, e tudo que nao fecha
 * vira aviso em vez de virar parcela torta.
 */

export type ParcelaPlanejada = {
  label: string | null;
  /** yyyy-mm-dd */
  dueDate: string;
  /** Decimal com ponto, ex. "500.00". */
  amount: string;
};

export type Plano = {
  parcelas: ParcelaPlanejada[];
  avisos: string[];
};

const paraCentavos = (valor: string): number => Math.round(Number(valor) * 100);
const paraReais = (centavos: number): string => (centavos / 100).toFixed(2);

/** Soma meses mantendo o dia, encolhendo quando o mes seguinte e mais curto. */
export function somarMeses(iso: string, meses: number): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const alvo = new Date(Date.UTC(ano, mes - 1 + meses, 1));
  const ultimoDia = new Date(
    Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0),
  ).getUTCDate();
  alvo.setUTCDate(Math.min(dia, ultimoDia));
  return alvo.toISOString().slice(0, 10);
}

export function montarPlano(ficha: FichaVenda, hoje = new Date()): Plano {
  const avisos: string[] = [];
  const parcelas: ParcelaPlanejada[] = [];

  if (!ficha.valorTotal) {
    return { parcelas, avisos: ["Sem valor total não dá para montar as parcelas."] };
  }

  const base = ficha.fechamentoEm ?? hoje.toISOString().slice(0, 10);
  const total = paraCentavos(ficha.valorTotal);

  const entrada = ficha.entradaValor ? paraCentavos(ficha.entradaValor) : 0;
  const intermediaria = ficha.intermediariaValor ? paraCentavos(ficha.intermediariaValor) : 0;

  if (entrada > 0) {
    parcelas.push({
      label: "Entrada",
      dueDate: ficha.entradaEm ?? base,
      amount: paraReais(entrada),
    });
  }

  if (intermediaria > 0) {
    parcelas.push({
      label: "Intermediária",
      dueDate: ficha.intermediariaEm ?? somarMeses(base, 1),
      amount: paraReais(intermediaria),
    });
  }

  const restante = total - entrada - intermediaria;

  if (restante < 0) {
    avisos.push(
      "A entrada e a intermediária somam mais que o valor total. Confira os valores antes de criar.",
    );
    return { parcelas, avisos };
  }

  // "Número de parcelas" é lido como o total de pagamentos, contando a entrada
  // e a intermediária — é assim que o combinado costuma ser dito em português.
  const previstas = ficha.parcelas ?? parcelas.length + (restante > 0 ? 1 : 0);
  const faltam = Math.max(previstas - parcelas.length, 0);

  if (faltam === 0) {
    if (restante > 0) {
      avisos.push(
        `Sobraram R$ ${paraReais(restante)} sem parcela. Aumente o número de parcelas ou ajuste os valores.`,
      );
    }
    return { parcelas, avisos };
  }

  if (restante === 0) {
    avisos.push(
      `A entrada e a intermediária já cobrem o total, mas a ficha pede ${previstas} parcelas. Criei só as que têm valor.`,
    );
    return { parcelas, avisos };
  }

  // O resto da divisão vai na primeira parcela: é o que o comércio faz, e
  // garante que a soma bata com o total até o último centavo.
  const porParcela = Math.floor(restante / faltam);
  const sobra = restante - porParcela * faltam;

  // Quando há entrada, a primeira mensalidade cai um mês depois dela.
  const ancora = parcelas.length > 0 ? parcelas[parcelas.length - 1].dueDate : base;
  const primeiraEmUmMes = parcelas.length > 0;

  for (let i = 0; i < faltam; i += 1) {
    parcelas.push({
      label: faltam > 1 ? `Parcela ${i + 1} de ${faltam}` : "Pagamento",
      dueDate: somarMeses(ancora, primeiraEmUmMes ? i + 1 : i),
      amount: paraReais(porParcela + (i === 0 ? sobra : 0)),
    });
  }

  const somado = parcelas.reduce((acc, p) => acc + paraCentavos(p.amount), 0);
  if (somado !== total) {
    avisos.push(
      `As parcelas somam R$ ${paraReais(somado)} e o total informado é R$ ${paraReais(total)}.`,
    );
  }

  return { parcelas, avisos };
}
