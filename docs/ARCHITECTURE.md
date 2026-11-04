# Arquitetura

## Camadas

```
src/app/            rotas (páginas e route handlers) — apenas composição e autorização
src/features/       componentes de domínio, agrupados por funcionalidade
src/components/ui/  biblioteca shadcn/ui (Base UI)
src/components/     componentes transversais reutilizáveis (PageHeader, StatCard, ...)
src/server/         regras de negócio, consultas e server actions
src/lib/            utilidades puras: dinheiro, formatação, validação, schemas, auth
prisma/             schema, migrations e seed
tests/              unitários e de integração
```

Regras que valem em todo o projeto:

- Componentes React não contêm regra de negócio. Eles chamam server actions
  (`src/server/**/*-actions.ts`), que validam com Zod, verificam permissão e delegam
  para os serviços (`src/server/**/*-service.ts`).
- Toda server action devolve `ActionResult<T>` — sucesso com dados ou falha com
  mensagem e erros por campo. Nada vaza stack trace para o cliente.
- Autorização sempre no backend, via `requirePermission()`. A interface apenas esconde
  o que o usuário não pode alcançar.
- Nada de `any`. Dinheiro nunca é `number` em cálculo: é `Decimal` (decimal.js) e
  `Decimal(14,2)` no banco.

## Autenticação

Sessão própria com cookie `httpOnly`, `SameSite=Lax` e `Secure` em produção. O token
tem 32 bytes aleatórios; o banco guarda apenas o SHA-256. Trocar a senha ou desativar
um usuário revoga as sessões abertas.

`getCurrentUser()` é memoizado por requisição com `React.cache`, então uma página que
chama `requirePermission()` várias vezes faz uma única consulta.

## Modelo financeiro

O ponto central do sistema. Cinco entidades, cada uma com uma responsabilidade:

| Entidade | Responsabilidade |
| --- | --- |
| `Sale` | O que foi vendido e por quanto |
| `Contract` | O compromisso comercial |
| `Installment` | Cada obrigação com vencimento |
| `Transaction` | Movimento financeiro (receita ou despesa) |
| `TransactionAllocation` | Quanto de uma transação quita qual obrigação |

Isso permite que um pagamento de R$ 1.000 quite R$ 700 de uma parcela e R$ 300 de
outra, sem gambiarra.

### Invariantes

1. A soma das alocações nunca excede o valor liquidado da transação
   (`assertAllocationsFit`).
2. Uma alocação nunca excede o saldo da parcela (`assertInstallmentBalance`).
3. `Installment.paidAmount` é **sempre recalculado** a partir das alocações vivas, nunca
   incrementado por delta (`recalculateInstallment`). Um bug de concorrência não
   consegue inflar o valor recebido.
4. Estorno e cancelamento marcam `TransactionAllocation.reversedAt` em vez de apagar a
   linha. O histórico financeiro é imutável.
5. Operações financeiras rodam em `prisma.$transaction` com isolamento `Serializable`.

### Status derivados

`Installment.status` e `Contract.status` não são digitados pelo usuário: vêm de
`resolveInstallmentStatus()` e `summarizeContract()`, funções puras testadas em
`tests/unit/installments.test.ts`.

### Faturamento não é caixa

O dashboard separa deliberadamente:

- **Faturamento contratado** — soma das vendas do período (`Sale.total`).
- **Recebimentos** — soma de `Transaction.settledAmount` com `settledAt` no período.
- **Contas a receber** — saldo de todas as parcelas abertas, independentemente do
  filtro de período, porque é um saldo e não um fluxo.
- **Lucro operacional** — recebido menos despesas pagas, ou seja, regime de caixa.
  A metodologia está escrita na própria tela.

Parcelas futuras nunca entram em recebimentos.

## Catálogo e CRM

`ProductService` é o catálogo comercial; `ServiceExecution` é a execução de um serviço
contratado. O que é vendido e o que está sendo executado são coisas distintas.

Cada item do catálogo define `kind` e `createsCrmCard`. Consultas (`CONSULTATION`) são
vendidas, geram receita e **não** criam card no Kanban. Serviços (`SERVICE`) geram
contrato, execução e card.

O board lê `Contract` + `Installment` a cada carregamento e resume com
`summarizeContract()`. Não existe cópia de valor financeiro dentro de `CrmCard`.

## Integrações

O Leona Flow nunca toca o banco. Ele chama `/api/v1/integrations/leona/*` com uma API
key, e `withIntegration()` cuida de:

- autenticação por `Bearer` com comparação em tempo constante;
- rate limit de 60 requisições por minuto por chave;
- idempotência via header `Idempotency-Key`, com a resposta original devolvida em um
  reenvio e reaproveitamento da linha quando a tentativa anterior falhou;
- registro de cada evento em `IntegrationEvent`, com payload, resposta, status e número
  de tentativas, para reprocessamento;
- normalização de erros em um envelope único.

### Credenciais

`IntegrationCredential` guarda cada valor cifrado com AES-256-GCM
(`v1.<iv>.<authTag>.<ciphertext>`, tudo em base64url) usando `APP_ENCRYPTION_KEY`. A
interface mostra apenas os quatro últimos caracteres; nenhuma rota devolve o valor
completo; os logs de auditoria passam por uma lista de termos sensíveis antes de gravar.

O administrador configura tudo pela interface, sem deploy. Só a chave mestra é
variável de ambiente.

### Mercado Pago

O webhook nunca confia na notificação: valida a assinatura `x-signature` quando há
segredo configurado, reconsulta o pagamento na API oficial e só registra a receita se o
status for `approved`. A unicidade de `(externalProvider, externalId)` impede
contabilizar o mesmo `payment_id` duas vezes, mesmo com reenvio.

## Auditoria

`recordAudit()` grava ator, ação, entidade e o que mudou. Campos cujo nome lembra
credencial viram `[redacted]`. Visível em Configurações › Auditoria.

## Testes

- `tests/unit` — regras puras: plano de parcelas, status, resumo de contrato, alocação
  da mais antiga primeiro, guardas de integridade, validação de CPF e formatação.
- `tests/integration` — o caminho completo contra o banco real: venda de R$ 5.400 em
  três parcelas, recebimentos, alocação automática, recusa de alocação excedente,
  bloqueio de pagamento externo duplicado, estorno e movimentação no Kanban.

Os testes de integração limpam apenas o que criaram, pelo prefixo do nome.
