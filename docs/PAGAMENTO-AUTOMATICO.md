# Pagamento confirmado sem ficar perguntando

Como ligar Mercado Pago → n8n → ERP → Leona, no ambiente de teste. O que o fluxo
da Leona faz hoje com um laço de 5 minutos passa a acontecer no segundo em que o
cliente paga.

## O desenho

```
Leona gera o link  ──→  cliente paga no Mercado Pago
                                   │
                        webhook (uma vez, ou várias)
                                   ↓
                                  n8n
                   1. confere na fonte se foi mesmo aprovado
                   2. ERP: cliente + transação de entrada
                   3. só se foi a primeira vez → avisa a Leona
                                   ↓
                   Leona manda "recebi seu pagamento"
```

**A ordem importa.** O ERP é chamado **antes** da Leona de propósito: é ele que
sabe dizer se aquele pagamento já tinha sido tratado, e a resposta dele é o que
decide se a mensagem sai. Chamar os dois em paralelo mandaria a mensagem duas
vezes num reenvio.

### Como o reenvio é barrado

O Mercado Pago reenvia a mesma notificação até receber um 2xx, e às vezes
reenvia mesmo depois. São **duas redes independentes**:

1. **Cabeçalho `Idempotency-Key`.** O n8n manda `mp-payment-<id do pagamento>`.
   Se o ERP já processou essa chave, ele devolve a resposta guardada com
   `meta.idempotent: true` e **não cria nada**.
2. **Índice único no banco.** A tabela de transações tem unicidade em
   (provedor, id externo). Se um reenvio chegar com outra chave de idempotência,
   o ERP responde **409**.

Qualquer um dos dois significa "já tratamos este pagamento" — e o fluxo **para
antes de chamar a Leona**. A mensagem sai uma vez só.

---

## O que mudou no sistema

Três mudanças pequenas em `src/server/integrations/leona-handlers.ts`:

| O quê | Por quê |
|---|---|
| O campo `category` passa a aceitar categoria de **receita**, não só de despesa | sem isso o lançamento entrava sem categoria e o relatório não separava nada |
| Campo novo `externalProvider` | deixa a transação nascer como `MERCADO_PAGO`, que é a chave da deduplicação |
| Receita com categoria desconhecida **não falha** | uma confirmação de pagamento não pode quebrar porque falta uma linha na tabela de categorias. Despesa continua exigindo |

Seis testes novos cobrem isso, inclusive o reenvio. Suíte em 74 testes passando.

---

## Passo a passo — o que você cria à mão

### 1. Access Token de teste do Mercado Pago

1. Entre em **mercadopago.com.br/developers/panel** e abra a aplicação
   **ERP Gestao**.
2. No seletor de ambiente **no topo da tela**, escolha **Teste**.
3. Vá em **Credenciais** e copie o **Access Token**.

> Teste e produção hoje começam os dois com `APP_USR`. O que diferencia é o
> seletor estar em **Teste** na hora de copiar.

### 2. Colocar o token na variável global da Leona

O bloco que gera o link já usa `Bearer {g_mp_token}` no header — a variável só
precisa existir e estar preenchida.

1. Na Leona, **Configurações** → procure **Variáveis** (globais).
2. Crie ou edite **`g_mp_token`** com o valor `APP_USR-...` do passo 1.

Se o menu estiver com outro nome, me manda um print que eu te aponto.

### 3. API key do ERP

1. Em **gestao-erp-crm.vercel.app** → **Configurações › Integrações**.
2. No painel do Leona Flow, gere uma API key chamada `n8n`.
3. **Copie na hora** — o token aparece uma única vez.

### 4. Conferir a categoria de receita

Em **Cadastros › Categorias de receita**, confirme que existe **Consultas**. O
fluxo manda a chave `consultation_revenue`. Se não existir, o lançamento entra
do mesmo jeito, só sem categoria — e aí me avisa que eu ajusto a chave.

### 5. Credenciais no n8n

Em **Credentials → New → Header Auth**, crie duas:

| Nome | Name | Value |
|---|---|---|
| `Mercado Pago (teste)` | `Authorization` | `Bearer APP_USR-...` (o do passo 1) |
| `ERP Gestao` | `Authorization` | `Bearer ...` (a API key do passo 3) |

### 6. Importar o fluxo

1. Pegue `docs/n8n/pagamento-mercado-pago.json`.
2. No n8n: **Workflows → ⋮ → Import from File**.
3. Abra cada nó que pede credencial e selecione:
   - **Buscar pagamento** → `Mercado Pago (teste)`
   - **Cliente no ERP** → `ERP Gestao`
   - **Transacao no ERP** → `ERP Gestao`
4. **Não ative ainda.** Falta a URL da Leona, no passo 7.

### 7. Webhook de entrada na Leona

1. Leona → **Configurações › Webhooks de entrada** → **Novo webhook**.
2. Aponte para o fluxo **"Pagamento confirmado - MP"**.
3. No mapeamento, o campo que identifica o contato é **`telefone`**. O n8n envia
   este corpo:

```json
{ "telefone": "5561999999999", "nome": "Fulano", "valor": "117.00", "pagamento_id": "123456789" }
```

4. Copie a **URL do webhook** que a Leona gerar.
5. No n8n, no nó **Avisar a Leona**, troque
   `COLE_AQUI_A_URL_DO_WEBHOOK_DE_ENTRADA_DA_LEONA` por essa URL.
6. **Salve e ative** o workflow.

### 8. Apontar o Mercado Pago para o n8n

A URL de produção do seu webhook no n8n é:

```
https://n8n.vhtecnologia.tech/webhook/mercado-pago
```

> Enquanto você estiver testando **com o editor aberto**, o n8n usa outra URL:
> `.../webhook-test/mercado-pago`, e ela vale para **uma** chamada só, depois de
> clicar em "Listen for test event". A URL sem `-test` é a que funciona sempre, e
> só existe com o workflow **ativo**.

1. Painel do Mercado Pago → aplicação **ERP Gestao** → **Webhooks** →
   **Configurar notificações**.
2. Em **URL modo teste**, cole a URL acima.
3. Marque o evento **Pagamentos**.
4. **Salvar**. Copie a **assinatura secreta** que ele gerar.

### 9. Opcional — ligar a conferência de assinatura

O fluxo já reconsulta cada pagamento na API do Mercado Pago antes de registrar
qualquer coisa. É isso que impede uma notificação forjada de virar receita; a
assinatura é camada extra.

Para ligar, adicione no `docker-compose` do n8n:

```yaml
environment:
  - MP_WEBHOOK_SECRET=a_assinatura_secreta_do_passo_8
```

Sem essa variável o fluxo roda normalmente e pula a conferência.

### 10. Limpar o fluxo da Leona

No fluxo **"Venda de consulta - Link MP automatico"**, apague:

- **Intervalo Inteligente — 05 minutos**
- **Integração GET** `merchant_orders/search`
- **Condicional** `mp_status_pedido igual paid`
- **Conexão de Fluxo → Pagamento confirmado - MP** (quem chama agora é o webhook)
- As esperas de **90 minutos** e **04 horas** que existiam só para o laço

**Mantenha:**

- A **Integração POST** que gera o link. O `external_reference` continua sendo
  `{phone_number}`, que é o que amarra tudo.
- A notificação **"Nao pagou em 24h"**, ligada direto depois da mensagem com o
  link. Ela continua útil: agora significa "recebeu o link e sumiu".
- O fluxo **"Pagamento confirmado - MP"** inteiro, sem tocar em nada.

---

## Testar

1. Rode o fluxo da Leona com um contato de teste até receber o link.
2. Pague com uma **conta de teste compradora** ou cartão de teste do Mercado Pago.
3. Confira, nesta ordem:
   - **n8n → Executions:** uma execução, os 8 nós verdes.
   - **ERP → Transações:** uma entrada de R$ 117,00, com o cliente e com a forma
     de pagamento preenchida.
   - **WhatsApp:** a confirmação chegou **uma vez**.
4. **Teste o reenvio:** reenvie a mesma notificação pelo painel do Mercado Pago.
   O esperado é a execução parar no nó **Primeira vez**, sem segunda mensagem.

### Se o link abrir pedindo pagamento de verdade

O bloco da Leona mapeia `link_pagamento` de `#body.init_point`, que é a URL de
produção. Com credenciais de teste pode ser preciso usar
`#body.sandbox_init_point`. É a primeira coisa a trocar se isso acontecer.

---

## Quando for para produção

1. Access Token de **produção** na variável `g_mp_token`.
2. Credencial `Mercado Pago (produção)` no n8n, trocada no nó **Buscar pagamento**.
3. No Mercado Pago, preencher **URL modo produção** com a mesma URL do n8n.
4. Conferir que a categoria **Consultas** de receita existe no ambiente.

---

## Histórico do bug na Leona (resolvido em 05/11/2026)

Durante a implantação, o webhook de entrada **"Pagamento confirmado - Mercado
Pago (n8n)", ID 4071** falhou em 100% das requisições:

```
undefined method `name_locked?' for nil
```

Registros: #1370480, #1370505, #1370508, #1370513, #1373215. A Leona respondia
**HTTP 200** e falhava depois, de forma assíncrona, então o n8n não tinha como
detectar — o cliente pagava, a transação entrava no ERP, e a confirmação no
WhatsApp não saía.

Descartado do nosso lado: telefone com e sem DDI, número sem contato cadastrado,
e o campo *Número que dispara* (estava com `{telefone}`, o número do cliente;
corrigido para a instância `556291176861` — VR FINANCE. O erro continuou, então
essa config estava errada mas não era a causa).

**Era bug deles.** O suporte corrigiu em 05/11 às 09:49 e ajustou o mapeamento
junto: hoje os campos são `nome` e `telefone` (sem o prefixo `body.`), com um
chip `+` no Telefone e `valor` como campo customizado. Primeiro registro
processado: **#1374069, 09:49:35**. Mensagem confirmada no WhatsApp.

O acesso de administrador dado ao suporte (suporte@leonaflow.com) **foi
revogado** no mesmo dia, logo após a validação. Em *Acesso de suporte* também
não há ninguém.

Para conferir o webhook no futuro: Webhooks de entrada › o webhook › aba
**Histórico** — procurar requisição **Processada** em vez de *Falhou*.
