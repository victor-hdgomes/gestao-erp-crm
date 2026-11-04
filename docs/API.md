# API de integração

Base: `{APP_URL}/api/v1`
Contrato OpenAPI: `GET /api/v1/openapi.json`

## Autenticação

Gere uma API key em **Configurações › Integrações**. O token aparece uma única vez;
o banco guarda apenas o hash SHA-256.

```
Authorization: Bearer lf_a1b2c3d4.<segredo>
```

Sem token válido a resposta é `401`. O limite é de 60 requisições por minuto por chave
(`429` ao exceder).

## Idempotência

Envie `Idempotency-Key` com um valor único por operação. Um reenvio com a mesma chave
devolve a resposta original, com `meta.idempotent: true`, sem duplicar nada. Se a
tentativa anterior falhou, o reenvio reprocessa e incrementa `attempts`.

Além disso, cada recurso tem sua própria proteção contra duplicidade:

| Recurso | Chave natural |
| --- | --- |
| Cliente | CPF; na falta dele, `externalId` |
| Venda | `externalId` |
| Contrato | `externalId` |
| Transação | `externalProvider` + `externalId` |
| Documento | `externalId` |

## Envelope de resposta

```json
{ "success": true, "data": { }, "meta": { "eventId": "..." } }
```

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": {} } }
```

Códigos: `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403),
`NOT_FOUND` (404), `CONFLICT` (409), `UNPROCESSABLE` (422), `RATE_LIMITED` (429),
`INTEGRATION_ERROR` (502), `INTERNAL_ERROR` (500).

## Endpoints

### `POST /integrations/leona/customers`

Cadastra ou atualiza um cliente. O CPF é validado pelos dígitos verificadores.

```json
{
  "name": "Ana Clara Souza",
  "document": "529.982.247-25",
  "phone": "11988887777",
  "city": "São Paulo",
  "state": "SP",
  "driveFolderUrl": "https://drive.google.com/drive/folders/abc",
  "externalId": "leona-1042"
}
```

`201` quando cria, `200` quando atualiza. Resposta: `{ "id": "...", "created": true }`.

### `POST /integrations/leona/sales`

Registra a venda e, quando há plano de parcelas ou o catálogo pede, cria contrato,
parcelas, execução do serviço e card no Kanban.

```json
{
  "customerDocument": "52998224725",
  "externalId": "leona-sale-77",
  "items": [
    { "productName": "Serviço de regularização", "quantity": 1, "unitPrice": "1400.00" }
  ],
  "installments": [
    { "label": "Entrada",     "dueDate": "2026-11-05", "amount": "700.00", "paymentMethod": "pix" },
    { "label": "Finalização", "dueDate": "2026-12-05", "amount": "700.00", "paymentMethod": "pix" }
  ]
}
```

O item aceita `productId` ou `productName`. A soma das parcelas precisa fechar com o
total da venda, senão a resposta é `422`.

Resposta: `{ "id", "code", "created", "contracts": [{ "id", "code" }] }`.

### `POST /integrations/leona/contracts`

Contrato avulso, sem venda associada. Mesma regra de fechamento das parcelas.

### `POST /integrations/leona/transactions`

Receita ou despesa. Informando `installmentId`, o valor abate aquela parcela.
Informando apenas `contractId`, o valor abate as parcelas mais antigas primeiro.

```json
{
  "type": "INCOME",
  "description": "Entrada do contrato",
  "customerDocument": "52998224725",
  "contractId": "ctr_...",
  "amount": "700.00",
  "paymentMethod": "pix",
  "externalId": "leona-pay-77"
}
```

Para despesas, `expenseCategory` é obrigatório e aceita as chaves `paid_traffic`,
`consultations`, `operational`, `others` ou outra categoria cadastrada.

Use `"settled": false` para lançar uma previsão sem movimentar caixa.

### `POST /integrations/leona/documents`

```json
{
  "customerDocument": "52998224725",
  "title": "Contrato assinado",
  "url": "https://drive.google.com/file/d/abc",
  "kind": "CONTRACT",
  "externalId": "leona-doc-12"
}
```

`kind`: `DRIVE_FOLDER`, `CONTRACT`, `RECEIPT` ou `OTHER`.

### `PATCH /integrations/leona/crm-cards/{id}`

```json
{ "stageName": "Cadastro Positivo + Open Finance", "note": "Documentos recebidos" }
```

Aceita `stageId` ou `stageName`. A movimentação entra no histórico do card e atualiza
o status da execução do serviço.

### `GET /integrations/leona/customers/{id}`

Aceita o id interno, o `externalId` ou o CPF. Devolve o cliente, os contratos com
situação financeira (total, recebido, pendente, parcelas vencidas, próximo vencimento),
as parcelas e os cards no CRM — tudo que o atendimento precisa para responder ao
cliente.

### `GET /integrations/leona/services`

Catálogo ativo com preço de referência, se o preço pode ser alterado na venda e se o
serviço gera card no CRM.

## Webhook do Mercado Pago

`POST /api/v1/webhooks/mercado-pago`

Configure essa URL no painel do Mercado Pago. O sistema:

1. valida o header `x-signature` quando há `webhookSecret` configurado;
2. registra o evento recebido;
3. reconsulta o pagamento na API oficial — nunca confia no corpo da notificação;
4. só registra a receita se o status for `approved`;
5. usa o `external_reference` como id da parcela para alocar automaticamente;
6. ignora reenvios do mesmo `payment_id`.

Para que a conciliação funcione, crie a cobrança com `external_reference` igual ao id
da parcela.

## Reprocessamento

Todo evento fica em `IntegrationEvent` com payload, resposta, status (`RECEIVED`,
`PROCESSED`, `FAILED`, `DUPLICATE`), mensagem de erro e número de tentativas. Reenviar
a requisição com a mesma `Idempotency-Key` reprocessa um evento que falhou.

## Exemplo completo

```bash
curl -X POST "$APP_URL/api/v1/integrations/leona/customers" \
  -H "Authorization: Bearer $LEONA_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: cliente-1042" \
  -d '{"name":"Ana Clara Souza","document":"52998224725","phone":"11988887777"}'
```
