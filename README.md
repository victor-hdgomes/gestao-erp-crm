# Painel de Gestão — ERP + CRM

Sistema de gestão empresarial com ERP (financeiro, vendas, serviços), CRM com Kanban e
uma API REST para o Leona Flow. Uma autenticação, uma base de dados, módulos integrados.

A regra que organiza o sistema: **o ERP é a fonte da verdade financeira**. O CRM lê os
números dos contratos e parcelas, nunca mantém uma segunda contabilidade.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Frontend / backend | Next.js 16 (App Router, Server Actions, Route Handlers) |
| Linguagem | TypeScript estrito, sem `any` |
| UI | shadcn/ui (Base UI) + Tailwind CSS 4 + Lucide |
| Banco | PostgreSQL + Prisma 7 (driver adapter `@prisma/adapter-pg`) |
| Kanban | dnd-kit |
| Gráficos | Recharts |
| Validação | Zod |
| Testes | Vitest (unitários + integração contra o banco) |

Nomes de código, arquivos e comentários em inglês. Interface inteiramente em
português brasileiro.

## Começando

```bash
npm install
```

### 1. Banco de dados

Para desenvolvimento, o projeto sobe um cluster PostgreSQL próprio em `.localdb/`,
isolado de qualquer Postgres já instalado na máquina (porta 55433, apenas 127.0.0.1):

```bash
npm run db:start
```

Para usar o Supabase (ou qualquer outro Postgres gerenciado), troque apenas as duas
variáveis do `.env` — nenhuma linha de código muda. Veja
[docs/SUPABASE.md](docs/SUPABASE.md).

### 2. Variáveis de ambiente

Copie `.env.example` para `.env` e gere os segredos:

```bash
node -e "console.log('AUTH_SECRET=' + require('crypto').randomBytes(32).toString('base64'))"
```

```bash
node -e "console.log('APP_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('base64'))"
```

| Variável | Para que serve |
| --- | --- |
| `DATABASE_URL` | Conexão usada pela aplicação (no Supabase, o pooler na porta 6543) |
| `DIRECT_URL` | Conexão direta usada pelas migrations (porta 5432) |
| `AUTH_SECRET` | Assina os cookies de sessão |
| `APP_ENCRYPTION_KEY` | Chave mestra que criptografa as credenciais de integração (32 bytes em base64) |
| `APP_URL` | URL pública da aplicação |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Credenciais do seed de desenvolvimento |

`APP_ENCRYPTION_KEY` é infraestrutura, não configuração de cliente: trocá-la invalida
todas as credenciais já guardadas.

### 3. Migrations e dados de exemplo

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

O seed cria perfis, permissões, formas de pagamento, categorias de despesa, as seis
etapas do Kanban, o catálogo inicial e uma operação fictícia (contrato de R$ 5.400 em
três parcelas, contrato de R$ 1.400 em duas, consultas pagas à vista e despesas).

**Credenciais de desenvolvimento** — troque antes de qualquer uso real:

| Usuário | E-mail | Senha |
| --- | --- | --- |
| Administrador | `admin@local.test` | `Admin@123456` |
| Financeiro | `financeiro@local.test` | `Admin@123456` |
| Operacional | `operacional@local.test` | `Admin@123456` |

### 4. Rodar

```bash
npm run dev
```

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Gera o Prisma Client e compila para produção |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest (unitários + integração) |
| `npm run db:start` / `db:stop` / `db:status` | Cluster PostgreSQL local do projeto |
| `npm run db:migrate` | Cria e aplica migration |
| `npm run db:deploy` | Aplica migrations em produção |
| `npm run db:seed` | Popula dados de desenvolvimento |
| `npm run db:studio` | Prisma Studio |
| `npm run db:reset` | Recria o banco do zero |

## Módulos

- **Dashboard** — faturamento contratado, recebimentos, contas a receber, despesas,
  tráfego pago, custo de consultas, lucro operacional, consultas vendidas e contratos
  fechados, com gráficos e filtro por período.
- **Financeiro** — contas a receber geradas pelas parcelas, com saldo, vencidos e
  próximos 30 dias.
- **Transações** — receitas e despesas independentes, com alocação em parcelas,
  estorno e cancelamento sem apagar histórico.
- **Vendas** — itens, descontos, plano de parcelamento com N parcelas, criação
  automática de contrato, execução de serviço e card no CRM.
- **Serviços** — catálogo com preço e custo de referência, preço editável na venda e
  controle de quais serviços geram card no CRM.
- **Clientes** — cadastro com CPF validado, endereço, link do Drive e campos copiáveis.
- **CRM / Kanban** — seis etapas configuráveis, drag and drop, histórico de movimentação
  e ficha financeira lida do ERP.
- **Contratos e Documentos** — visão consolidada e links externos.
- **Relatórios** — sete relatórios com exportação CSV.
- **Usuários e permissões** — perfis Administrador, Financeiro e Operacional, com
  verificação no backend.
- **Configurações e integrações** — credenciais criptografadas, API keys do Leona Flow,
  Mercado Pago, OpenAI, n8n e Google Drive.

## Experiência de uso

- **Ajuda por tela** — cada título tem um "i" que explica o que a tela é, o que ela
  mostra e o que dá para fazer nela. O texto fica em um lugar só:
  [`src/lib/page-help.ts`](src/lib/page-help.ts).
- **Cadastro sem sair do formulário** — o seletor de cliente cadastra um cliente novo,
  e os seletores de categoria de despesa, forma de pagamento e serviço criam a opção
  na hora. Componentes: `CustomerPicker` e `CreatableSelect`.
- **Link do contrato assinado** — informado na venda e salvo como documento do cliente,
  já vinculado ao contrato.
- **Status das parcelas** — "vencida" depende da data, não de um evento, então toda tela
  resolve o status na leitura (`withResolvedStatus`), nunca confia só na coluna gravada.

## Documentação

- [Exercícios](docs/EXERCICIOS.md) — roteiro guiado sobre os dados de exemplo.
- [Demandas práticas](docs/PRATICA.md) — doze tarefas para digitar no app, com o
  resultado esperado de cada uma.
- [Integrações](docs/INTEGRACOES.md) — o que cada integração faz e como ligar.
- [Arquitetura](docs/ARCHITECTURE.md) — camadas, modelo de dados e decisões.
- [API de integração](docs/API.md) — endpoints do Leona Flow e webhook do Mercado Pago.
- [Supabase](docs/SUPABASE.md) — como apontar para o banco gerenciado.
- [Deploy](docs/DEPLOY.md) — publicação na Vercel.

O contrato da API também é servido em `/api/v1/openapi.json`.
