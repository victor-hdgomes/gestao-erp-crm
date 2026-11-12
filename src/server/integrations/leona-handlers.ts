import "server-only";

import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { notFound, unprocessable } from "@/lib/errors";
import { moneyToString } from "@/lib/money";
import { onlyDigits } from "@/lib/format";
import { cpfSchema, dateSchema, phoneSchema, positiveMoneySchema } from "@/lib/schemas/common";
import { customerCreateSchema } from "@/lib/schemas/customer";
import { recordAudit } from "@/server/shared/audit";
import { withWriteConflictRetry } from "@/server/shared/retry";
import { createSaleIdempotente } from "@/server/sales/sales-service";
import { createTransaction } from "@/server/finance/transactions";
import { createDocument, documentCreateSchema } from "@/server/documents/documents-service";
import { moveCard } from "@/server/crm/crm-service";
import {
  resolveInstallmentStatus,
  summarizeContract,
} from "@/server/finance/calculations";
import { toInstallmentLike } from "@/server/finance/transactions";
import { generateCode } from "@/server/shared/codes";

const ACTOR = "Leona Flow";

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export const leonaCustomerSchema = customerCreateSchema
  .partial({ status: true })
  .extend({
    // O nome aqui e o do perfil do WhatsApp, nao um campo preenchido: "DR",
    // "Ze" e "Jo" sao nomes de verdade. A tela continua pedindo nome completo
    // (tres letras); nesta rota, recusar a pessoa por causa de duas custou a
    // venda, o lancamento e a mensagem de confirmacao que ela esperava —
    // aconteceu em 11/11 com um pagamento de R$ 58,50. O nome completo chega
    // depois: a propria mensagem de confirmacao pede nome e CPF.
    name: z.string().trim().optional().nullable(),
    externalId: z.string().trim().optional().nullable(),
    source: z.string().trim().optional().nullable(),
  })
  .transform((input) => ({
    ...input,
    // Sem nome nenhum, o telefone identifica melhor que um registro vazio.
    name: input.name || input.phone || "Sem nome",
  }));

/** Campos do cliente que a Leona pode mandar, sem os que ela nunca manda. */
const CUSTOMER_FIELDS = [
  "name",
  "document",
  "phone",
  "email",
  "zipCode",
  "street",
  "number",
  "complement",
  "district",
  "city",
  "state",
  "driveFolderUrl",
  "notes",
] as const;

function customerFields(input: z.infer<typeof leonaCustomerSchema>) {
  const data: Record<string, unknown> = {};
  for (const field of CUSTOMER_FIELDS) {
    const value = input[field as keyof typeof input];
    if (value !== undefined) data[field] = value === "" ? null : value;
  }
  return data;
}

/**
 * Upsert by CPF, then by externalId. Never creates a duplicate person.
 *
 * A busca e a gravacao ficam na mesma transacao serializavel de proposito. O
 * Mercado Pago avisa o mesmo pagamento duas vezes quase ao mesmo tempo, e com
 * as consultas soltas as duas chamadas liam "nao existe" antes de qualquer uma
 * gravar — nasciam dois clientes identicos. Serializavel faz o banco recusar a
 * segunda, e o retry a traz de volta ja enxergando o cliente da primeira.
 */
export async function upsertCustomerFromLeona(payload: unknown) {
  const input = leonaCustomerSchema.parse(payload);

  return withWriteConflictRetry(() =>
    prisma.$transaction(
      async (tx) => {
        // Tres chaves, nesta ordem. O telefone entrou por ultimo porque e o
        // unico elo entre quem chega pelo WhatsApp (nasce so com externalId)
        // e quem chega pela ficha preenchida (nasce com CPF). Sem ele, a
        // mesma pessoa virava dois cadastros dependendo de por onde entrou.
        const existing =
          (input.document
            ? await tx.customer.findUnique({ where: { document: input.document } })
            : null) ??
          (input.externalId
            ? await tx.customer.findFirst({ where: { externalId: input.externalId } })
            : null) ??
          (input.phone
            ? await tx.customer.findFirst({
                where: { phone: input.phone, deletedAt: null },
                orderBy: { createdAt: "asc" },
              })
            : null);

        if (existing) {
          await tx.customer.update({
            where: { id: existing.id },
            data: {
              ...customerFields(input),
              ...(input.status ? { status: input.status } : {}),
              externalId: input.externalId ?? existing.externalId,
              source: input.source ?? existing.source ?? ACTOR,
            },
          });

          await recordAudit(
            {
              userId: null,
              actorLabel: ACTOR,
              action: "customer.update",
              entity: "Customer",
              entityId: existing.id,
              changes: { name: input.name },
            },
            tx,
          );

          return { id: existing.id, created: false };
        }

        // O externalId nasce junto com o cliente. Gravado depois, como era
        // antes, ele deixava uma janela em que a chamada paralela procurava
        // por ele e nao achava nada para reaproveitar.
        const customer = await tx.customer.create({
          data: {
            ...customerFields(input),
            name: input.name,
            status: input.status ?? "ACTIVE",
            externalId: input.externalId ?? null,
            source: input.source ?? ACTOR,
          },
        });

        await recordAudit(
          {
            userId: null,
            actorLabel: ACTOR,
            action: "customer.create",
            entity: "Customer",
            entityId: customer.id,
            changes: { name: customer.name },
          },
          tx,
        );

        return { id: customer.id, created: true };
      },
      { isolationLevel: "Serializable", timeout: 20000 },
    ),
  );
}

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

export const leonaSaleSchema = z.object({
  customerId: z.string().optional(),
  customerDocument: cpfSchema.optional(),
  soldAt: dateSchema.optional(),
  discount: z.string().optional(),
  notes: z.string().optional().nullable(),
  externalId: z.string().optional().nullable(),
  items: z
    .array(
      z.object({
        productId: z.string().optional(),
        productName: z.string().optional(),
        quantity: z.coerce.number().int().min(1).default(1),
        unitPrice: positiveMoneySchema.optional(),
        discount: z.string().optional(),
      }),
    )
    .min(1),
  installments: z
    .array(
      z.object({
        label: z.string().optional().nullable(),
        dueDate: dateSchema,
        amount: positiveMoneySchema,
        paymentMethod: z.string().optional().nullable(),
      }),
    )
    .optional(),
});

export async function createSaleFromLeona(payload: unknown) {
  const input = leonaSaleSchema.parse(payload);

  const customer = await resolveCustomer(input.customerId, input.customerDocument);

  const items = await Promise.all(
    input.items.map(async (item) => {
      const product = await resolveProduct(item.productId, item.productName);
      return {
        productId: product.id,
        quantity: item.quantity,
        unitPrice: item.unitPrice ?? moneyToString(product.defaultPrice),
        unitCost: moneyToString(product.defaultCost),
        discount: item.discount ?? "0",
      };
    }),
  );

  const paymentMethods = await prisma.paymentMethod.findMany();
  const methodByKey = new Map(paymentMethods.map((method) => [method.key, method.id]));

  // A dedupe pela chave externa roda dentro da transacao da venda, nao aqui.
  // Fora dela, duas notificacoes do mesmo pagamento chegando no mesmo segundo
  // liam "nao existe" antes de qualquer uma gravar e criavam duas vendas.
  const { sale, created } = await createSaleIdempotente(
    {
      customerId: customer.id,
      soldAt: input.soldAt ?? new Date(),
      discount: input.discount ?? "0",
      notes: input.notes ?? null,
      items,
      contract: input.installments
        ? {
            startDate: input.soldAt ?? new Date(),
            installments: input.installments.map((installment) => ({
              label: installment.label ?? null,
              dueDate: installment.dueDate,
              amount: installment.amount,
              paymentMethodId: installment.paymentMethod
                ? (methodByKey.get(installment.paymentMethod) ?? null)
                : null,
              notes: null,
            })),
          }
        : undefined,
    },
    {
      actorLabel: ACTOR,
      externalId: input.externalId ?? null,
      reuseOpenExternalId: true,
    },
  );

  // Os contratos vao junto mesmo quando a venda ja existia. A consulta e
  // vendida uma vez e paga em duas partes: a segunda parte chega numa chamada
  // separada e precisa do contrato para alocar o pagamento na parcela certa.
  return {
    id: sale.id,
    code: sale.code,
    created,
    contracts: sale.contracts.map((contract) => ({ id: contract.id, code: contract.code })),
  };
}

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

export const leonaContractSchema = z.object({
  customerId: z.string().optional(),
  customerDocument: cpfSchema.optional(),
  title: z.string().trim().min(3),
  totalAmount: positiveMoneySchema,
  startDate: dateSchema.optional(),
  externalId: z.string().optional().nullable(),
  installments: z
    .array(
      z.object({
        label: z.string().optional().nullable(),
        dueDate: dateSchema,
        amount: positiveMoneySchema,
      }),
    )
    .min(1),
});

export async function createContractFromLeona(payload: unknown) {
  const input = leonaContractSchema.parse(payload);
  const customer = await resolveCustomer(input.customerId, input.customerDocument);

  if (input.externalId) {
    const duplicate = await prisma.contract.findFirst({
      where: { externalId: input.externalId },
    });
    if (duplicate) return { id: duplicate.id, code: duplicate.code, created: false };
  }

  const planned = input.installments.reduce((acc, item) => acc + Number(item.amount), 0);
  if (Math.abs(planned - Number(input.totalAmount)) >= 0.005) {
    throw unprocessable("A soma das parcelas difere do valor total do contrato.");
  }

  const contract = await prisma.$transaction(async (tx) => {
    const code = await generateCode(tx, "contract");
    return tx.contract.create({
      data: {
        code,
        customerId: customer.id,
        title: input.title,
        totalAmount: input.totalAmount,
        startDate: input.startDate ?? new Date(),
        externalId: input.externalId ?? null,
        installments: {
          create: input.installments.map((installment, index) => ({
            number: index + 1,
            label: installment.label ?? null,
            dueDate: installment.dueDate,
            expectedAmount: installment.amount,
            paidAmount: "0",
          })),
        },
      },
    });
  });

  return { id: contract.id, code: contract.code, created: true };
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export const leonaTransactionSchema = z.object({
  type: z.enum(["INCOME", "EXPENSE"]),
  description: z.string().trim().min(3),
  customerId: z.string().optional(),
  customerDocument: cpfSchema.optional(),
  contractId: z.string().optional().nullable(),
  installmentId: z.string().optional().nullable(),
  /** Chave da categoria, de receita ou de despesa. */
  category: z.string().trim().optional().nullable(),
  /** Nome antigo do campo acima, mantido para nao quebrar chamadas existentes. */
  expenseCategory: z.string().optional().nullable(),
  /** Quem originou o dinheiro, ex. "MERCADO_PAGO". Define a chave de deduplicacao. */
  externalProvider: z.string().trim().optional().nullable(),
  amount: positiveMoneySchema,
  settled: z.boolean().default(true),
  dueDate: dateSchema.optional().nullable(),
  settledAt: dateSchema.optional().nullable(),
  paymentMethod: z.string().optional().nullable(),
  externalId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function createTransactionFromLeona(payload: unknown) {
  const input = leonaTransactionSchema.parse(payload);

  const customer =
    input.customerId || input.customerDocument
      ? await resolveCustomer(input.customerId, input.customerDocument)
      : null;

  const paymentMethod = input.paymentMethod
    ? await prisma.paymentMethod.findUnique({ where: { key: input.paymentMethod } })
    : null;

  const categoryKey = input.category ?? input.expenseCategory ?? null;
  const found = categoryKey
    ? await prisma.transactionCategory.findUnique({ where: { key: categoryKey } })
    : null;
  const category = found && found.kind === input.type ? found : null;

  // Despesa sem categoria nao entra: o grafico do dashboard depende dela.
  // Receita entra mesmo assim: uma confirmacao de pagamento nao pode falhar
  // porque uma linha da tabela de categorias ainda nao existe no ambiente.
  if (input.type === "EXPENSE" && !category) {
    throw unprocessable("Categoria de despesa desconhecida.");
  }

  const transaction = await createTransaction(
    {
      type: input.type,
      description: input.description,
      customerId: customer?.id ?? null,
      categoryId: category?.id ?? null,
      paymentMethodId: paymentMethod?.id ?? null,
      expectedAmount: input.amount,
      settledAmount: input.settled ? input.amount : "0",
      dueDate: input.dueDate ?? null,
      settledAt: input.settled ? (input.settledAt ?? new Date()) : null,
      competenceDate: input.settledAt ?? new Date(),
      notes: input.notes ?? null,
      origin: input.externalProvider ?? "LEONA_FLOW",
      externalId: input.externalId ?? null,
      externalProvider: input.externalId
        ? (input.externalProvider ?? "LEONA_FLOW")
        : null,
      allocations: input.installmentId
        ? [
            {
              targetType: "INSTALLMENT",
              installmentId: input.installmentId,
              contractId: input.contractId ?? null,
              saleId: null,
              amount: input.amount,
            },
          ]
        : [],
    },
    {
      actorLabel: ACTOR,
      autoAllocateContractId:
        !input.installmentId && input.contractId ? input.contractId : null,
    },
  );

  return { id: transaction.id, code: transaction.code, status: transaction.status };
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export const leonaDocumentSchema = documentCreateSchema.extend({
  customerDocument: cpfSchema.optional(),
  externalId: z.string().optional().nullable(),
  /** Chave do tipo de documento, como "contract". Desconhecida vira sem tipo. */
  type: z.string().optional().nullable(),
});

export async function createDocumentFromLeona(payload: unknown) {
  const input = leonaDocumentSchema.parse(payload);

  const customer =
    input.customerId || input.customerDocument
      ? await resolveCustomer(input.customerId ?? undefined, input.customerDocument)
      : null;

  if (input.externalId) {
    const duplicate = await prisma.document.findFirst({
      where: { externalId: input.externalId },
    });
    if (duplicate) return { id: duplicate.id, created: false };
  }

  const type = input.type
    ? await prisma.documentType.findUnique({ where: { key: input.type } })
    : null;

  const document = await createDocument(
    { ...input, customerId: customer?.id ?? null, typeId: input.typeId ?? type?.id ?? null },
    { externalId: input.externalId ?? null },
  );

  return { id: document.id, created: true };
}

// ---------------------------------------------------------------------------
// CRM cards
// ---------------------------------------------------------------------------

export const leonaCardUpdateSchema = z.object({
  stageName: z.string().trim().optional(),
  stageId: z.string().optional(),
  note: z.string().optional().nullable(),
});

export async function updateCardFromLeona(cardId: string, payload: unknown) {
  const input = leonaCardUpdateSchema.parse(payload);

  const stage = input.stageId
    ? await prisma.crmStage.findUnique({ where: { id: input.stageId } })
    : input.stageName
      ? await prisma.crmStage.findFirst({
          where: { name: { equals: input.stageName, mode: "insensitive" } },
        })
      : null;

  if (!stage) throw notFound("Etapa do Kanban");

  await moveCard(cardId, { toStageId: stage.id, note: input.note ?? null }, { actorLabel: ACTOR });

  return { id: cardId, stage: { id: stage.id, name: stage.name } };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getCustomerForLeona(identifier: string) {
  const digits = onlyDigits(identifier);

  const customer = await prisma.customer.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { id: identifier },
        { externalId: identifier },
        ...(digits.length === 11 ? [{ document: digits }] : []),
      ],
    },
    include: {
      contracts: {
        where: { deletedAt: null },
        include: { installments: { orderBy: { number: "asc" } } },
      },
      crmCards: { where: { deletedAt: null }, include: { stage: true } },
    },
  });

  if (!customer) throw notFound("Cliente");

  return {
    id: customer.id,
    name: customer.name,
    document: customer.document,
    phone: customer.phone,
    email: customer.email,
    status: customer.status,
    driveFolderUrl: customer.driveFolderUrl,
    contracts: customer.contracts.map((contract) => {
      const summary = summarizeContract(contract.installments.map(toInstallmentLike));
      return {
        id: contract.id,
        code: contract.code,
        title: contract.title,
        status: contract.status,
        total: moneyToString(summary.total),
        received: moneyToString(summary.received),
        pending: moneyToString(summary.pending),
        overdueCount: summary.overdueCount,
        nextDueDate: summary.nextDueDate?.toISOString() ?? null,
        installments: contract.installments.map((installment) => ({
          id: installment.id,
          number: installment.number,
          label: installment.label,
          dueDate: installment.dueDate.toISOString(),
          expectedAmount: moneyToString(installment.expectedAmount),
          paidAmount: moneyToString(installment.paidAmount),
          status: resolveInstallmentStatus(installment),
        })),
      };
    }),
    crmCards: customer.crmCards.map((card) => ({
      id: card.id,
      title: card.title,
      stage: { id: card.stage.id, name: card.stage.name },
    })),
  };
}

export async function listServicesForLeona() {
  const products = await prisma.productService.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { name: "asc" },
  });

  return products.map((product) => ({
    id: product.id,
    name: product.name,
    description: product.description,
    kind: product.kind,
    price: moneyToString(product.defaultPrice),
    allowCustomPrice: product.allowCustomPrice,
    createsCrmCard: product.createsCrmCard,
  }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveCustomer(customerId?: string, document?: string) {
  const customer = customerId
    ? await prisma.customer.findUnique({ where: { id: customerId } })
    : document
      ? await prisma.customer.findUnique({ where: { document } })
      : null;

  if (!customer || customer.deletedAt) throw notFound("Cliente");
  return customer;
}

async function resolveProduct(productId?: string, productName?: string) {
  const product = productId
    ? await prisma.productService.findUnique({ where: { id: productId } })
    : productName
      ? await prisma.productService.findFirst({
          where: { name: { equals: productName, mode: "insensitive" }, deletedAt: null },
        })
      : null;

  if (!product) throw notFound("Serviço do catálogo");
  return product;
}

export const phoneOnlySchema = phoneSchema;
