/**
 * What each screen is for, in the words the team uses. Kept in one place so the
 * help bubble, the onboarding docs and future tooltips never drift apart.
 */
export type PageHelp = {
  /** One sentence: what this screen *is*. */
  summary: string;
  /** What the user can see here. */
  see: readonly string[];
  /** What the user can do here. */
  doIt: readonly string[];
  /** The distinction people most often get wrong on this screen. */
  notice?: string;
};

export const PAGE_HELP = {
  dashboard: {
    summary:
      "Visão geral do negócio no período escolhido: quanto foi vendido, quanto entrou em caixa e quanto está previsto.",
    see: [
      "Faturamento contratado (valor das vendas) e recebimentos (dinheiro que entrou) lado a lado",
      "Contas a receber, despesas do período e resultado",
      "Gráficos de evolução mensal, despesas por categoria e funil do CRM",
    ],
    doIt: ["Trocar o período", "Clicar nos indicadores para abrir a tela correspondente"],
    notice:
      "Contratado e recebido são números diferentes: vender R$ 5.400 em 3 parcelas não coloca R$ 5.400 no caixa hoje.",
  },
  financeiro: {
    summary: "A carteira a receber: todas as parcelas em aberto, vencidas e quitadas.",
    see: [
      "Parcelas por vencimento, com valor previsto, valor já recebido e saldo",
      "Totais de a receber, vencido e recebido",
    ],
    doIt: ["Filtrar por período e situação", "Registrar o recebimento de uma parcela"],
    notice: "Aqui você olha o que *deveria* entrar. O que de fato entrou está em Transações.",
  },
  transacoes: {
    summary:
      "O livro-caixa: cada entrada e saída de dinheiro, com a data em que foi liquidada.",
    see: [
      "Receitas e despesas com valor previsto, valor liquidado e status",
      "A qual cliente, contrato e parcela cada recebimento foi aplicado",
    ],
    doIt: [
      "Registrar uma receita e abater automaticamente as parcelas mais antigas",
      "Registrar uma despesa, criando a categoria na hora se ela não existir",
      "Estornar uma transação sem apagar o histórico",
    ],
    notice:
      "Uma transação nunca é excluída: um erro vira estorno, e o histórico continua auditável.",
  },
  vendas: {
    summary:
      "O que foi vendido para cada cliente: serviços, valores e descontos de cada negociação.",
    see: ["Código, cliente, itens, total e quanto já foi recebido de cada venda"],
    doIt: [
      "Registrar uma nova venda",
      "Cadastrar o cliente e o serviço sem sair do formulário",
      "Montar o parcelamento e anexar o link do contrato assinado",
    ],
    notice:
      "A venda cria o contrato e as parcelas. O dinheiro só aparece quando você registra a transação.",
  },
  contratos: {
    summary:
      "O acordo financeiro de uma venda: valor fechado, plano de parcelas e andamento do pagamento.",
    see: [
      "Valor contratado, recebido e pendente por contrato",
      "Cada parcela com vencimento, valor e situação",
      "Documentos ligados ao contrato",
    ],
    doIt: ["Abrir o contrato e acompanhar a quitação parcela a parcela"],
    notice:
      "Cliente é a pessoa; contrato é um acordo dessa pessoa. O mesmo cliente pode ter vários contratos, e é no contrato que ficam o valor e as parcelas.",
  },
  clientes: {
    summary: "O cadastro das pessoas: dados pessoais, contato, endereço e histórico.",
    see: [
      "Nome, CPF, telefone, e-mail e endereço, com botão de copiar em cada campo",
      "Vendas, contratos, documentos e cards de CRM daquela pessoa",
    ],
    doIt: ["Cadastrar e editar clientes", "Copiar dados para usar em outro sistema"],
    notice:
      "Aqui não há valores a receber: a ficha mostra quem é a pessoa. O dinheiro dela está nos contratos.",
  },
  crm: {
    summary:
      "O andamento operacional dos serviços contratados, em quadro Kanban por etapa.",
    see: [
      "Um card por serviço em execução, na etapa em que ele está",
      "Dados do cliente e o resumo financeiro do contrato, lido do ERP",
    ],
    doIt: ["Arrastar o card para a próxima etapa", "Abrir o card e copiar dados do cliente"],
    notice:
      "O CRM não guarda dinheiro: ele apenas mostra o que o financeiro já registrou. Consultas avulsas não geram card.",
  },
  servicos: {
    summary: "O catálogo do que a empresa vende, com preço e custo de referência.",
    see: ["Nome, tipo, preço padrão, custo padrão e se o serviço está ativo"],
    doIt: [
      "Cadastrar serviços",
      "Definir se o serviço gera contrato e card no CRM e se aceita preço personalizado",
    ],
    notice:
      "O tipo decide o fluxo: Serviço gera contrato e card no CRM; Consulta não gera card.",
  },
  documentos: {
    summary: "Os links de contratos, comprovantes e pastas do Drive de cada cliente.",
    see: ["Título, cliente, tipo e data de cadastro de cada link"],
    doIt: ["Cadastrar um link novo", "Abrir o arquivo no Drive"],
    notice: "O sistema guarda o link, não o arquivo. Os arquivos continuam no Drive.",
  },
  relatorios: {
    summary: "Recortes dos dados para conferência e exportação.",
    see: [
      "Vendas, recebimentos, despesas, inadimplência, resultado e desempenho por serviço",
    ],
    doIt: ["Escolher o relatório e o período", "Exportar em CSV para abrir no Excel"],
  },
  usuarios: {
    summary: "Quem acessa o sistema e o que cada um pode fazer.",
    see: ["Usuários, perfis de acesso e situação"],
    doIt: ["Criar usuários", "Atribuir perfis", "Desativar o acesso de alguém"],
    notice: "As permissões são checadas no servidor, não apenas escondem botões na tela.",
  },
  cadastros: {
    summary:
      "As listas que aparecem dentro dos formulários: categorias de receita, de despesa e tipos de documento.",
    see: ["Cada cadastro com quantos lançamentos ou documentos dependem dele"],
    doIt: [
      "Criar, renomear e arquivar categorias e tipos",
      "Ver o que está em uso antes de arquivar",
    ],
    notice:
      "Arquivar nunca apaga: o cadastro some das escolhas novas e o histórico mantém o rótulo. Os marcados como “do sistema” alimentam indicadores do dashboard e não podem ser desativados.",
  },
  configuracoes: {
    summary: "Ajustes gerais da operação e das integrações.",
    see: ["Dados da empresa, regras financeiras padrão e estado das integrações"],
    doIt: [
      "Configurar Mercado Pago, Leona Flow e demais integrações sem mexer no código",
      "Gerar e revogar chaves de API",
      "Consultar a auditoria de alterações",
    ],
    notice:
      "Tokens nunca aparecem por inteiro depois de salvos: ficam criptografados e a tela mostra só os últimos dígitos.",
  },
} as const satisfies Record<string, PageHelp>;

export type PageHelpKey = keyof typeof PAGE_HELP;
