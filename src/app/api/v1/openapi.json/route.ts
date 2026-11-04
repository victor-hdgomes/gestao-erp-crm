import { NextResponse } from "next/server";

import { getEnv } from "@/lib/env";

/**
 * Hand-written contract for the integration API. Kept in the codebase so the
 * Leona Flow team always reads the same version that is deployed.
 */
export function GET() {
  const baseUrl = (() => {
    try {
      return getEnv().APP_URL;
    } catch {
      return "http://localhost:3000";
    }
  })();

  const money = { type: "string", example: "1400.00" } as const;

  const spec = {
    openapi: "3.0.3",
    info: {
      title: "Painel de Gestão — API de integração",
      version: "1.0.0",
      description:
        "Endpoints usados pelo Leona Flow para cadastrar clientes, registrar vendas, lançar transações e atualizar o CRM. Toda operação passa pelas regras de negócio do sistema; o banco nunca é acessado diretamente.",
    },
    servers: [{ url: `${baseUrl}/api/v1` }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", description: "API key gerada em Configurações › Integrações." },
      },
      parameters: {
        IdempotencyKey: {
          name: "Idempotency-Key",
          in: "header",
          required: false,
          schema: { type: "string" },
          description:
            "Chave única por operação. Reenvios com a mesma chave devolvem a resposta original sem duplicar registros.",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            error: {
              type: "object",
              properties: {
                code: { type: "string", example: "VALIDATION_ERROR" },
                message: { type: "string" },
                details: {},
              },
            },
          },
        },
        Customer: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string" },
            document: { type: "string", description: "CPF, com ou sem máscara. Validado." },
            phone: { type: "string" },
            email: { type: "string", format: "email" },
            zipCode: { type: "string" },
            street: { type: "string" },
            number: { type: "string" },
            district: { type: "string" },
            city: { type: "string" },
            state: { type: "string", maxLength: 2 },
            driveFolderUrl: { type: "string", format: "uri" },
            notes: { type: "string" },
            externalId: { type: "string", description: "Identificador do cliente no Leona Flow." },
          },
        },
        Sale: {
          type: "object",
          required: ["items"],
          properties: {
            customerId: { type: "string" },
            customerDocument: { type: "string" },
            soldAt: { type: "string", format: "date-time" },
            discount: money,
            notes: { type: "string" },
            externalId: { type: "string" },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  productId: { type: "string" },
                  productName: { type: "string" },
                  quantity: { type: "integer", default: 1 },
                  unitPrice: money,
                  discount: money,
                },
              },
            },
            installments: {
              type: "array",
              description: "Plano de pagamento. A soma precisa fechar com o total da venda.",
              items: {
                type: "object",
                required: ["dueDate", "amount"],
                properties: {
                  label: { type: "string" },
                  dueDate: { type: "string", format: "date" },
                  amount: money,
                  paymentMethod: { type: "string", example: "pix" },
                },
              },
            },
          },
        },
        Transaction: {
          type: "object",
          required: ["type", "description", "amount"],
          properties: {
            type: { type: "string", enum: ["INCOME", "EXPENSE"] },
            description: { type: "string" },
            customerId: { type: "string" },
            customerDocument: { type: "string" },
            contractId: { type: "string" },
            installmentId: {
              type: "string",
              description: "Sem informar, o valor abate as parcelas mais antigas do contrato.",
            },
            expenseCategory: { type: "string", example: "paid_traffic" },
            amount: money,
            settled: { type: "boolean", default: true },
            dueDate: { type: "string", format: "date" },
            settledAt: { type: "string", format: "date-time" },
            paymentMethod: { type: "string", example: "pix" },
            externalId: { type: "string" },
            notes: { type: "string" },
          },
        },
      },
    },
    paths: {
      "/integrations/leona/customers": {
        post: {
          summary: "Cadastra ou atualiza um cliente",
          description: "Identifica duplicidade por CPF e, na falta dele, por externalId.",
          parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/Customer" } } },
          },
          responses: {
            "200": { description: "Cliente atualizado" },
            "201": { description: "Cliente criado" },
            "400": { description: "Payload inválido", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            "401": { description: "API key inválida" },
            "429": { description: "Limite de requisições excedido" },
          },
        },
      },
      "/integrations/leona/customers/{id}": {
        get: {
          summary: "Consulta um cliente",
          description: "Aceita o id interno, o externalId ou o CPF.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Cliente com contratos e situação financeira" }, "404": { description: "Não encontrado" } },
        },
      },
      "/integrations/leona/sales": {
        post: {
          summary: "Registra uma venda",
          description:
            "Cria a venda, o contrato, as parcelas, a execução do serviço e o card no CRM quando o catálogo pedir.",
          parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/Sale" } } },
          },
          responses: { "201": { description: "Venda criada" }, "200": { description: "Venda já existia (externalId repetido)" }, "422": { description: "Plano de parcelas não fecha com o total" } },
        },
      },
      "/integrations/leona/contracts": {
        post: {
          summary: "Registra um contrato avulso",
          parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }],
          responses: { "201": { description: "Contrato criado" } },
        },
      },
      "/integrations/leona/transactions": {
        post: {
          summary: "Registra uma receita ou despesa",
          parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/Transaction" } } },
          },
          responses: { "201": { description: "Transação criada" }, "409": { description: "externalId já registrado" } },
        },
      },
      "/integrations/leona/documents": {
        post: {
          summary: "Registra um documento ou link",
          parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }],
          responses: { "201": { description: "Documento criado" } },
        },
      },
      "/integrations/leona/crm-cards/{id}": {
        patch: {
          summary: "Move o card para outra etapa",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
            { $ref: "#/components/parameters/IdempotencyKey" },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    stageId: { type: "string" },
                    stageName: { type: "string", example: "Cadastro Positivo + Open Finance" },
                    note: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Card movido" }, "404": { description: "Card ou etapa não encontrados" } },
        },
      },
      "/integrations/leona/services": {
        get: {
          summary: "Lista os serviços disponíveis",
          responses: { "200": { description: "Catálogo ativo com preços de referência" } },
        },
      },
      "/webhooks/mercado-pago": {
        post: {
          summary: "Recebe notificações de pagamento do Mercado Pago",
          description:
            "Valida a assinatura quando configurada, reconsulta o pagamento na API oficial e só então registra o recebimento. O mesmo payment_id nunca entra duas vezes.",
          security: [],
          responses: { "200": { description: "Notificação processada" }, "401": { description: "Assinatura inválida" } },
        },
      },
    },
  };

  return NextResponse.json(spec, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
