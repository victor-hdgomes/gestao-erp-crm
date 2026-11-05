# Credenciais a pedir ao cliente — Mercado Pago (teste) e OpenAI

Documento para enviar ao cliente. Ele faz tudo no painel dele; nada aqui exige
acesso ao sistema nem conhecimento técnico.

**Antes de começar:** credencial é senha. Peça para mandar pelo canal combinado
(cofre de senhas, ou pelo menos uma mensagem apagada depois), nunca em grupo de
WhatsApp, e-mail com várias pessoas em cópia ou planilha compartilhada. Quem
guarda a credencial no sistema é só o administrador, e ela é criptografada no
banco — mas o caminho até lá também precisa ser cuidado.

---

## Parte 1 — Mercado Pago, ambiente de teste

No ambiente de teste nenhum dinheiro real se move. Os pagamentos são simulados
com cartões fictícios, e servem para validar o fluxo inteiro: gerar a cobrança,
pagar, o sistema receber o aviso e lançar o recebimento na parcela certa.

### 1.1 Criar (ou escolher) a aplicação

1. Entrar em **https://www.mercadopago.com.br/developers/panel** com a conta
   Mercado Pago da empresa.
2. Abrir **Suas integrações** (menu "Integrações").
3. Se já existir uma aplicação para o sistema, selecionar essa. Se não:
   **Criar aplicação** → nome (ex.: `ERP Gestão`) → produto **Pagamentos
   online** / Checkout Pro → criar.

### 1.2 Copiar as credenciais de teste

1. Dentro da aplicação, no **seletor de ambiente no topo da tela**, trocar para
   **Teste**.
2. Ir em **Credenciais** (bloco na página Início, ou item no menu lateral).
3. Conferir de novo que o seletor está em **Teste** e copiar:
   - **Public Key**
   - **Access Token**

> **Atenção:** hoje as duas credenciais — teste e produção — começam com
> `APP_USR`. O prefixo não diferencia mais uma da outra. O que diferencia é o
> seletor de ambiente estar em **Teste** na hora de copiar. Por isso vale o
> cliente anotar, ao enviar, que são as **de teste**.

### 1.3 Configurar o webhook e pegar a assinatura secreta

1. Ainda na aplicação, menu lateral → **Webhooks** → **Configurar notificações**.
2. No campo **URL modo teste**, colar:

   ```
   https://gestao-erp-crm.vercel.app/api/v1/webhooks/mercado-pago
   ```

3. Marcar o evento **Pagamentos** (`payment`).
4. Clicar em **Salvar**. Nesse momento o Mercado Pago gera a **assinatura
   secreta** da aplicação.
5. Revelar a assinatura secreta e copiar. (Dá para vê-la de novo depois pelo
   mesmo caminho; se for redefinida, a antiga para de valer na hora.)

### 1.4 Criar contas de teste (opcional, mas ajuda muito)

Serve para simular um comprador de verdade.

1. Menu **Integrações** → **Contas de teste**.
2. **Criar conta de teste** → país **Brasil** → apelido para reconhecer
   (ex.: `comprador-teste`) → tipo de conta → saldo fictício → aceitar os termos
   → criar.
3. Criar pelo menos uma conta de **comprador**. Pode criar até 15 no total.

### 1.5 O que o cliente precisa me mandar

| Item | Onde estava | Enviar? |
|---|---|---|
| Access Token (teste) | Credenciais, ambiente **Teste** | Sim — é o essencial |
| Public Key (teste) | Credenciais, ambiente **Teste** | Sim |
| Assinatura secreta do webhook | Webhooks › Configurar notificações | Sim |
| Usuário/senha da conta de teste comprador | Contas de teste | Se tiver criado |

Nada mais. Senha da conta Mercado Pago da empresa, dados bancários ou
certificado digital **não** são necessários e não devem ser enviados.

---

## Parte 2 — OpenAI

A IA no sistema é opcional: sem essa chave, o ERP funciona inteiro, só não
aparecem os recursos de apoio (resumo de histórico, sugestão de texto). Nenhum
valor financeiro passa por modelo de linguagem — conta é cálculo, não palpite.

Importante combinar antes: **a chave é cobrada na conta de quem a cria**. O uso
da API é pré-pago e independente de assinatura do ChatGPT — ter ChatGPT Plus não
dá crédito de API.

### 2.1 Criar a conta e colocar crédito

1. Entrar em **https://platform.openai.com** (conta da empresa, não a pessoal de
   alguém do time).
2. Menu de configurações → **Billing** → **Add payment method** → adicionar
   cartão.
3. **Add credits** — o mínimo costuma ser **US$ 5**, que é mais que suficiente
   para validações.
4. Recomendado: em **Limits**, definir um **limite mensal baixo** (ex.: US$ 10)
   enquanto estamos testando. Isso é o freio de mão.

### 2.2 Criar a chave

1. Ir em **https://platform.openai.com/api-keys** (ou menu → **API keys**).
2. **Create new secret key**.
3. Nome: algo reconhecível, ex.: `ERP Gestao`.
4. Projeto: pode deixar o **Default project**.
5. Permissão: **All** (ou **Restricted** com leitura de modelos + uso de
   chat/completions, se quiser apertar).
6. **Create secret key** → **copiar na hora**.

> A chave aparece **uma única vez**. Fechou a janela, não dá para ver de novo —
> só criar outra. Copiar e guardar antes de fechar.

### 2.3 O que o cliente precisa me mandar

| Item | Formato |
|---|---|
| API Key | começa com `sk-...` |

Só isso. Se quiser fixar um modelo específico, pode dizer qual; senão, eu
configuro um padrão econômico.

---

## Parte 3 — O que eu faço depois de receber

1. Cadastro tudo em **Configurações › Integrações**, no próprio sistema. Os
   valores são criptografados no banco (AES-256-GCM) e a tela passa a mostrar só
   os quatro últimos caracteres.
2. Uso o botão **Testar conexão** de cada integração para confirmar na hora.
3. Simulo uma cobrança de teste e confirmo que o recebimento entra sozinho na
   parcela certa.

### Ponto de atenção para a virada

A tela de integrações tem **um campo só** para o Access Token — não há seletor
de teste/produção na interface. Enquanto validamos, fica ali o token de
**teste**. No dia de ir para produção eu troco pelo token de **produção** e o
cliente cadastra a mesma URL no campo **URL modo produção** do webhook. Vale
avisar o cliente dessa segunda etapa agora, para ele não achar que já está
cobrando de verdade.
