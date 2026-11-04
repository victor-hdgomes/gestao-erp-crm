import "server-only";

import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { notFound, unprocessable } from "@/lib/errors";
import { moneyToString } from "@/lib/money";
import { onlyDigits } from "@/lib/format";
import { cpfSchema, dateSchema, phoneSchema, positiveMoneySchema } from "@/lib/schemas/common";
import { customerCreateSchema } from "@/lib/schemas/customer";
import { createCustomer, updateCustomer } from "@/server/customers/customers-service";
import { createSale } from "@/server/sales/sales-service";
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
    externalId: z.string().trim().optional().nullable(),
    source: z.string().trim().optional().nullable(),
  });

/** Upsert by CPF, then by externalId. Never creates a duplicate person. */
export async function upsertCustomerFromLeona(payload: unknown) {
  const input = leonaCustomerSchema.parse(payload);

  const existing = input.document
    ? await prisma.customer.findUnique({ where: { document: input.document } })
    : input.externalId
      ? await prisma.customer.findFirst({ where: { externalId: input.externalId } })
      : null;

  if (existing) {
    await updateCustomer(existing.id, input, { actorId: null });
    await prisma.customer.update({
      where: { id: existing.id },
      data: {
        externalId: input.externalId ?? existing.externalId,
        source: input.source ?? existing.source ?? ACTOR,
      },
    });
    return { id: existing.id, created: false };
  }

  const customer = await createCustomer(
    { ...input, status: input.status ?? "ACTIVE" },
    { actorLabel: ACTOR },
  );

  await prisma.customer.update({
    where: { id: customer.id },
    data: { externalId: input.externalId ?? null, source: input.source ?? ACTOR },
  });

  return { id: customer.id, created: true };
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

  if (input.externalId) {
    const duplicate = await prisma.sale.findFirst({ where: { externalId: input.externalId } });
    if (duplicate) {
      return { id: duplicate.id, code: duplicate.code, created: false };
    }
  }

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

  const sale = await createSale(
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
    { actorLabel: ACTOR, externalId: input.externalId ?? null },
  );

  return {
    id: sale.id,
    code: sale.code,
    created: true,
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
  expenseCategory: z.string().optional().nullable(),
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

  const category = input.expenseCategory
    ? await prisma.transactionCategory.findUnique({ where: { key: input.expenseCategory } })
    : null;

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
      origin: "LEONA_FLOW",
      externalId: input.externalId ?? null,
      externalProvider: input.externalId ? "LEONA_FLOW" : null,
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
