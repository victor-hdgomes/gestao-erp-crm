import { isValidCpf, isValidPhone } from "@/lib/validators/document";

/**
 * Le a ficha que o cliente devolve no WhatsApp e devolve os campos ja no
 * formato que o sistema usa.
 *
 * Nao e uma IA de proposito. O texto e semiestruturado e os rotulos sao
 * nossos — nos mandamos o modelo e o cliente preenche —, entao um leitor
 * ancorado em rotulo acerta mais e erra de forma visivel. Em dado financeiro
 * isso importa: um modelo que "corrige" um valor sozinho e pior do que um
 * leitor que admite nao ter entendido. Tudo que ficou duvidoso sai em
 * `naoLidos` e `faltando` para a tela mostrar antes de gravar qualquer coisa.
 */

export type FichaVenda = {
  nome: string | null;
  cpf: string | null;
  email: string | null;
  endereco: string | null;
  telefone: string | null;
  fechamentoEm: string | null;
  valorTotal: string | null;
  parcelas: number | null;
  entradaValor: string | null;
  entradaEm: string | null;
  intermediariaValor: string | null;
  intermediariaEm: string | null;
};

export type LeituraFicha = {
  dados: FichaVenda;
  /** Rotulos que apareceram mas cujo valor nao deu para entender. */
  naoLidos: string[];
  /** Rotulos obrigatorios que nao apareceram, ou vieram em branco. */
  faltando: string[];
};

type Campo = keyof FichaVenda;

/**
 * Os rotulos de cada campo. A ordem importa: "valor da entrada" tem de ser
 * testado antes de "valor", senao o rotulo curto engole o longo.
 */
const ROTULOS: Array<{ campo: Campo; termos: string[] }> = [
  {
    campo: "intermediariaEm",
    termos: [
      "data de pagamento da parcela intermediaria",
      "data da parcela intermediaria",
      "data do pagamento intermediario",
      "data da intermediaria",
    ],
  },
  {
    campo: "intermediariaValor",
    termos: [
      "valor da parcela intermediaria",
      "parcela intermediaria",
      "valor intermediario",
      "intermediaria",
    ],
  },
  {
    campo: "entradaEm",
    termos: ["data de pagamento da entrada", "data do pagamento da entrada", "data da entrada"],
  },
  { campo: "entradaValor", termos: ["valor da entrada", "entrada"] },
  { campo: "parcelas", termos: ["numero de parcelas", "quantidade de parcelas", "parcelas"] },
  {
    campo: "valorTotal",
    termos: ["valor total do servico", "valor total", "valor do servico", "valor"],
  },
  {
    campo: "fechamentoEm",
    termos: [
      "data de fechamento do servico",
      "data de fechamento",
      "data do fechamento",
      "fechamento",
    ],
  },
  { campo: "telefone", termos: ["telefone pessoal", "telefone", "celular", "whatsapp", "contato"] },
  { campo: "endereco", termos: ["endereco completo", "endereco"] },
  { campo: "email", termos: ["e-mail", "email"] },
  { campo: "cpf", termos: ["cpf"] },
  { campo: "nome", termos: ["nome completo", "nome"] },
];

const OBRIGATORIOS: Array<{ campo: Campo; rotulo: string }> = [
  { campo: "nome", rotulo: "Nome completo" },
  { campo: "valorTotal", rotulo: "Valor total do serviço" },
];

const MESES: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

/** Tira acento e caixa para comparar rotulo sem depender de como foi digitado. */
function semAcento(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** "nao informado", "-", "n/a" e companhia valem o mesmo que vazio. */
const VAZIOS = new Set([
  "",
  "-",
  "--",
  "n/a",
  "na",
  "nao",
  "nao tem",
  "nao houve",
  "nao informado",
  "sem",
  "nenhum",
  "nenhuma",
  "x",
]);

function estaVazio(valor: string): boolean {
  return VAZIOS.has(semAcento(valor).replace(/[.!]/g, "").trim());
}

/**
 * Converte dinheiro em pt-BR para o decimal com ponto.
 *
 * O ponto e ambiguo: em "1.500" ele separa milhar, em "1.50" separa centavos.
 * A regra usada e a que um humano aplicaria — tres casas depois do ponto e
 * milhar, uma ou duas e centavo — e havendo virgula ela manda.
 */
export function lerDinheiro(bruto: string): string | null {
  const limpo = bruto.replace(/r\$/gi, "").replace(/\s/g, "").trim();
  if (!limpo) return null;

  const corpo = limpo.match(/-?[\d.,]+/)?.[0];
  if (!corpo) return null;

  let normalizado: string;
  if (corpo.includes(",")) {
    normalizado = corpo.replace(/\./g, "").replace(",", ".");
  } else if (/\.\d{3}(\.\d{3})*$/.test(corpo)) {
    normalizado = corpo.replace(/\./g, "");
  } else {
    normalizado = corpo;
  }

  if (!/^-?\d+(\.\d{1,2})?$/.test(normalizado)) return null;
  const numero = Number(normalizado);
  if (!Number.isFinite(numero) || numero <= 0) return null;
  return numero.toFixed(2);
}

/**
 * Converte data em pt-BR para yyyy-mm-dd.
 *
 * Nao da para entregar "10/01/2026" ao `new Date` do JavaScript: ele le no
 * formato americano e devolve 1o de outubro. Nove meses de diferenca, em
 * silencio. Por isso o dia e o mes sao separados aqui na mao.
 */
export function lerData(bruto: string, hoje = new Date()): string | null {
  const texto = semAcento(bruto).trim();
  if (!texto) return null;

  const iso = texto.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return montarData(Number(iso[3]), Number(iso[2]), Number(iso[1]));

  const numerica = texto.match(/(\d{1,2})\s*[/\-.]\s*(\d{1,2})(?:\s*[/\-.]\s*(\d{2,4}))?/);
  if (numerica) {
    const dia = Number(numerica[1]);
    const mes = Number(numerica[2]);
    const ano = numerica[3] ? completarAno(Number(numerica[3])) : hoje.getFullYear();
    return montarData(dia, mes, ano);
  }

  const porExtenso = texto.match(/(\d{1,2})\s*de\s*([a-z]+)(?:\s*de\s*(\d{2,4}))?/);
  if (porExtenso) {
    const mes = MESES[porExtenso[2]];
    if (!mes) return null;
    const ano = porExtenso[3] ? completarAno(Number(porExtenso[3])) : hoje.getFullYear();
    return montarData(Number(porExtenso[1]), mes, ano);
  }

  return null;
}

function completarAno(ano: number): number {
  return ano < 100 ? 2000 + ano : ano;
}

function montarData(dia: number, mes: number, ano: number): string | null {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  // Rejeita 31/02 e afins: o Date rola para o mes seguinte em vez de recusar.
  if (data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return null;
  return data.toISOString().slice(0, 10);
}

function lerParcelas(bruto: string): number | null {
  const numero = semAcento(bruto).match(/\d+/);
  if (!numero) return null;
  const valor = Number(numero[0]);
  if (!Number.isInteger(valor) || valor < 1 || valor > 360) return null;
  return valor;
}

function lerTelefone(bruto: string): string | null {
  let digitos = bruto.replace(/\D/g, "");
  if (digitos.length > 11 && digitos.startsWith("55")) digitos = digitos.slice(2);
  return isValidPhone(digitos) ? digitos : null;
}

function lerCpf(bruto: string): string | null {
  const digitos = bruto.replace(/\D/g, "");
  return isValidCpf(digitos) ? digitos : null;
}

function lerEmail(bruto: string): string | null {
  const achado = bruto.trim().match(/[^\s<>()[\],;:]+@[^\s<>()[\],;:]+\.[a-z]{2,}/i);
  return achado ? achado[0].toLowerCase() : null;
}

/** Acha o rotulo que abre a linha, preferindo sempre o mais especifico. */
function rotuloDaLinha(linha: string): { campo: Campo; resto: string } | null {
  const normalizada = semAcento(linha).trimStart();

  for (const { campo, termos } of ROTULOS) {
    for (const termo of termos) {
      if (!normalizada.startsWith(termo)) continue;
      // O modelo traz "(se houver)" em dois campos, e o cliente devolve o
      // rotulo inteiro. O parentese entra aqui e nao no valor.
      const depois = normalizada.slice(termo.length).replace(/^\s*\([^)]*\)/, "").trimStart();
      // Exige o separador para "Valorizamos..." nao virar o campo "valor".
      if (!depois.startsWith(":") && !depois.startsWith("-") && !depois.startsWith("=")) continue;

      const corte = linha.length - linha.trimStart().length + termo.length;
      const resto = linha
        .slice(corte)
        .replace(/^\s*\([^)]*\)/, "")
        .replace(/^\s*[:\-=]\s*/, "");
      return { campo, resto };
    }
  }

  return null;
}

export function lerFichaVenda(texto: string, hoje = new Date()): LeituraFicha {
  const linhas = texto.replace(/\r\n?/g, "\n").split("\n");

  // Primeiro passo: separar o texto em blocos por rotulo. O valor de um campo
  // vai ate o proximo rotulo, e nao ate o fim da linha, porque endereco quase
  // sempre quebra em duas.
  const blocos = new Map<Campo, string>();
  let atual: Campo | null = null;

  for (const linha of linhas) {
    const achado = rotuloDaLinha(linha);
    if (achado) {
      atual = achado.campo;
      if (!blocos.has(atual)) blocos.set(atual, achado.resto.trim());
      else blocos.set(atual, `${blocos.get(atual)} ${achado.resto}`.trim());
      continue;
    }
    if (atual && linha.trim()) {
      blocos.set(atual, `${blocos.get(atual) ?? ""}\n${linha.trim()}`.trim());
    }
  }

  const dados: FichaVenda = {
    nome: null,
    cpf: null,
    email: null,
    endereco: null,
    telefone: null,
    fechamentoEm: null,
    valorTotal: null,
    parcelas: null,
    entradaValor: null,
    entradaEm: null,
    intermediariaValor: null,
    intermediariaEm: null,
  };

  const naoLidos: string[] = [];

  const aplicar = (campo: Campo, rotulo: string, ler: (bruto: string) => unknown) => {
    const bruto = blocos.get(campo);
    if (bruto === undefined) return;
    if (estaVazio(bruto)) return;

    const valor = ler(bruto);
    if (valor === null || valor === undefined) {
      naoLidos.push(`${rotulo}: "${bruto.replace(/\s+/g, " ").slice(0, 60)}"`);
      return;
    }
    (dados[campo] as unknown) = valor;
  };

  aplicar("nome", "Nome completo", (b) => b.replace(/\s+/g, " ").trim() || null);
  aplicar("cpf", "CPF", lerCpf);
  aplicar("email", "E-mail", lerEmail);
  aplicar("endereco", "Endereço", (b) => b.replace(/\s*\n\s*/g, ", ").trim() || null);
  aplicar("telefone", "Telefone", lerTelefone);
  aplicar("fechamentoEm", "Data de fechamento", (b) => lerData(b, hoje));
  aplicar("valorTotal", "Valor total", lerDinheiro);
  aplicar("parcelas", "Número de parcelas", lerParcelas);
  aplicar("entradaValor", "Valor da entrada", lerDinheiro);
  aplicar("entradaEm", "Data da entrada", (b) => lerData(b, hoje));
  aplicar("intermediariaValor", "Parcela intermediária", lerDinheiro);
  aplicar("intermediariaEm", "Data da intermediária", (b) => lerData(b, hoje));

  const faltando = OBRIGATORIOS.filter(({ campo }) => dados[campo] === null).map(
    ({ rotulo }) => rotulo,
  );

  return { dados, naoLidos, faltando };
}
