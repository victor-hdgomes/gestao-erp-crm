# Integrações — o que cada uma faz e por quê

Todas são configuradas em **Configurações › Integrações**, pela interface, sem mexer
no código e sem novo deploy. Só administradores enxergam a tela, toda alteração vai
para a auditoria.

## Como as credenciais são guardadas

Um segredo salvo aqui **nunca mais é exibido por inteiro**. O que acontece:

1. O valor é criptografado no backend com AES-256-GCM, usando a chave mestra que
   vive em `APP_ENCRYPTION_KEY` — variável de ambiente da infraestrutura, não um
   campo da tela.
2. No banco fica só o texto cifrado, no formato `v1.<iv>.<authTag>.<ciphertext>`.
3. A tela mostra uma dica mascarada com os últimos 4 caracteres.
4. A API nunca devolve o valor completo; nada vai para `localStorage`.
5. A auditoria registra *que* a credencial mudou, nunca o conteúdo.

Trocar a chave mestra torna os segredos ilegíveis — é preciso cadastrá-los de novo.
Isso é proposital: a chave é da infraestrutura, não do usuário.

---

## 1. Leona Flow — automação sem acesso ao banco

**A ideia.** O Leona Flow é quem conversa com o cliente no WhatsApp. Ele precisa
consultar e registrar coisas aqui, mas **não pode tocar no banco**. Se tocasse, as
regras de negócio existiriam em dois lugares e um dia divergiriam.

**Como funciona.** O Leona chama a nossa API REST autenticada. Toda requisição passa
pelas mesmas validações que a interface usa: soma de parcelas, saldo da alocação,
status do contrato. Se a regra recusa na tela, recusa na API.

**O que ele consegue fazer** (`/api/v1/integrations/leona/*`):
consultar e criar clientes, consultar o catálogo, criar venda com contrato e
parcelas, registrar transação com alocação automática, cadastrar documento e mover
card no Kanban.

**Proteções:** Bearer token com comparação em tempo constante, limite de 60
requisições por minuto, idempotência por header (reenvio não duplica nada) e
registro de cada chamada em `IntegrationEvent`, com payload, resposta e tentativas.

**Para ligar:** gere a API key em Configurações › Integrações. O token aparece
**uma vez só** — copie na hora. Entregue junto a [docs/API.md](API.md) e o
`/api/v1/openapi.json`.

**O que este sistema NÃO faz:** não envia mensagem no WhatsApp, não tem chatbot,
não integra com Meta Ads e não cria pasta no Drive automaticamente. Isso é trabalho
do Leona Flow; aqui ficam os dados e as regras.

---

## 2. Mercado Pago — cobrar e confirmar

**A ideia.** Gerar link de pagamento para as parcelas e transformar pagamento
aprovado em receita, sem digitação manual.

**A regra que importa.** Um pagamento só vira receita depois que o **backend
reconsulta o pagamento na API do Mercado Pago** e vê `approved`. Nunca porque o
cliente voltou para uma URL de sucesso, nunca porque chegou uma notificação. URL de
retorno e webhook são apenas avisos de que vale a pena ir conferir.

**Contra duplicidade.** O webhook valida a assinatura `x-signature` por HMAC.
Depois, a transação tem índice único em `(externalProvider, externalId)`: se o
Mercado Pago reenviar a mesma notificação dez vezes, a receita entra uma vez.
O `external_reference` carrega o id da parcela, então o dinheiro cai na parcela certa.

**Campos:** Access Token (secreto), Public Key, Assinatura do webhook (secreta).

**Para ligar:** cole o Access Token, use *Testar conexão*, e cadastre no painel do
Mercado Pago a URL `https://SEU-DOMINIO/api/v1/webhooks/mercado-pago`.

---

## 3. Google Drive — o link, não o arquivo

**A ideia.** Os contratos assinados e comprovantes continuam no Drive, onde a equipe
já trabalha. O sistema guarda **o endereço**, amarrado ao cliente e ao contrato, para
ninguém procurar pasta no meio do atendimento.

**O que é configurado:** a URL da pasta raiz dos clientes, usada como referência ao
cadastrar links novos.

**Por que é só isso:** criar pasta automaticamente exigiria credencial de escrita no
Drive da empresa. O ganho não paga o risco — e a pasta já é criada no processo atual.

---

## 4. n8n — automações que não podem derrubar nada

**A ideia.** Espaço para automações internas: avisar o time quando uma parcela vence,
montar relatório semanal, disparar rotina depois de uma venda.

**A regra.** n8n é **complementar**. Nenhum fluxo essencial depende dele estar no ar.
Se a instância cair, vender, receber e mover card continuam funcionando.

**Campos:** URL da instância e API Key (secreta).

---

## 5. OpenAI — opcional, e desligado por padrão

**A ideia.** Recursos de apoio, como resumir o histórico de um cliente ou sugerir
texto. Nada financeiro passa por aqui: número que vira dinheiro é calculado por
regra determinística, nunca por modelo de linguagem.

**A regra.** Sem a API Key configurada, as funções de IA simplesmente não aparecem.
O ERP funciona inteiro sem isso.

**Campos:** API Key (secreta) e modelo padrão.

---

## Resumo

| Integração | Para quê | Essencial? |
|---|---|---|
| Leona Flow | Automação externa lê e escreve pela API, com as regras do ERP | Sim, se você usa o Leona |
| Mercado Pago | Cobrança online com confirmação validada na fonte | Sim, se cobra online |
| Google Drive | Link dos documentos do cliente | Não, mas facilita muito |
| n8n | Automações internas de apoio | Não |
| OpenAI | Recursos de IA opcionais | Não |
