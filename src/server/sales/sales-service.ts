import { prisma, type PrismaTransactionClient } from "@/lib/prisma";
import { Decimal, sumMoney, toCents } from "@/lib/money";
import { notFound, unprocessable } from "@/lib/errors";
import { generateCode } from "@/server/shared/codes";
import { recordAudit } from "@/server/shared/audit";
import { recalculateSale } from "@/server/finance/transactions";
import type { SaleCreateInput, SaleUpdateInput } from "@/lib/schemas/sale";

export type CreateSaleOptions = {
  actorId?: string | null;
  actorLabel?: string | null;
  /** Used by the integration API so a retried webhook does not duplicate a sale. */
  externalId?: string | null;
};

/**
 * Creates a sale with its items and, when the catalog says so, the matching
 * contract, installment plan, service execution and CRM card.
 */
export async function createSale(input: SaleCreateInput, options: CreateSaleOptions = {}) {
  return prisma.$transaction(
    async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
      if (!customer || customer.deletedAt) throw notFound("Cliente");

      const { items, productById } = await buildSaleItems(tx, input.items);

      const subtotal = sumMoney(items.map((item) => item.total));
      const discount = toCents(input.discount ?? "0");
      const total = subtotal.minus(discount);

      if (total.isNegative()) {
        throw unprocessable("O desconto da venda não pode superar o subtotal.");
      }

      const code = await generateCode(tx, "sale");

      const sale = await tx.sale.create({
        data: {
          code,
          customerId: customer.id,
          soldAt: input.soldAt ?? new Date(),
          subtotal: subtotal.toFixed(2),
          discount: discount.toFixed(2),
          total: total.toFixed(2),
          status: "OPEN",
          notes: input.notes ?? null,
          createdById: options.actorId ?? null,
          externalId: options.externalId ?? null,
          items: {
            create: items.map((item) => ({
              productId: item.productId,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice.toFixed(2),
              unitCost: item.unitCost.toFixed(2),
              discount: item.discount.toFixed(2),
              total: item.total.toFixed(2),
            })),
          },
        },
      });

      const needsContract = items.some((item) => {
        const product = productById.get(item.productId);
        return product?.kind === "SERVICE";
      });

      let contractId: string | null = null;

      if (input.contract || needsContract) {
        contractId = await createContractForSale(tx, {
          saleId: sale.id,
          customerId: customer.id,
          title:
            input.contract?.title ??
            items.map((item) => item.description).join(" + ").slice(0, 120),
          total,
          startDate: input.contract?.startDate ?? input.soldAt ?? new Date(),
          installments:
            input.contract?.installments?.map((installment) => ({
              label: installment.label ?? null,
              dueDate: installment.dueDate,
              amount: toCents(installment.amount),
              paymentMethodId: installment.paymentMethodId ?? null,
              notes: installment.notes ?? null,
            })) ?? [
              {
                label: "Pagamento único",
                dueDate: input.soldAt ?? new Date(),
                amount: total,
                paymentMethodId: null,
                notes: null,
              },
            ],
        });
      }

      const contractUrl = input.contract?.documentUrl?.trim();
      if (contractId && contractUrl) {
        // The signed contract lives in Drive; here we only keep the link, next to
        // the customer and the contract it belongs to.
        await tx.document.create({
          data: {
            customerId: customer.id,
            contractId,
            title: "Contrato assinado",
            url: contractUrl,
            typeId: await contractTypeId(tx),
          },
        });
      }

      // Service executions and CRM cards only for catalog items that ask for them.
      for (const item of items) {
        const product = productById.get(item.productId);
        if (!product) continue;

        const service = await tx.serviceExecution.create({
          data: {
            customerId: customer.id,
            productId: product.id,
            contractId,
            saleId: sale.id,
            status: "NOT_STARTED",
          },
        });

        if (product.createsCrmCard) {
          await createCardForService(tx, {
            customerId: customer.id,
            contractId,
            serviceId: service.id,
            title: `${customer.name} — ${product.name}`,
          });
        }
      }

      await recalculateSale(tx, sale.id);

      await recordAudit(
        {
          userId: options.actorId ?? null,
          actorLabel: options.actorLabel ?? null,
          action: "sale.create",
          entity: "Sale",
          entityId: sale.id,
          changes: { code, total: total.toFixed(2), customerId: customer.id },
        },
        tx,
      );

      return tx.sale.findUniqueOrThrow({
        where: { id: sale.id },
        include: {
          items: { include: { product: true } },
          customer: true,
          contracts: { include: { installments: { orderBy: { number: "asc" } } } },
        },
      });
    },
    { isolationLevel: "Serializable", timeout: 25000 },
  );
}

type SaleItemInput = SaleCreateInput["items"][number];

/**
 * Prices the sold items against the catalog. Shared by creation and editing so a
 * sale cannot be rewritten under rules the original did not have to obey.
 */
async function buildSaleItems(tx: PrismaTransactionClient, input: SaleItemInput[]) {
  const productIds = Array.from(new Set(input.map((item) => item.productId)));
  const products = await tx.productService.findMany({ where: { id: { in: productIds } } });

  if (products.length !== productIds.length) {
    throw notFound("Serviço do catálogo");
  }

  const productById = new Map(products.map((product) => [product.id, product]));

  const items = input.map((item) => {
    const product = productById.get(item.productId);
    if (!product) throw notFound("Serviço do catálogo");
    if (!product.isActive) {
      throw unprocessable(`O serviço "${product.name}" está inativo.`);
    }
    if (!product.allowCustomPrice && !toCents(item.unitPrice).equals(toCents(product.defaultPrice))) {
      throw unprocessable(`O serviço "${product.name}" não permite preço personalizado.`);
    }

    const gross = toCents(item.unitPrice).times(item.quantity);
    const total = gross.minus(toCents(item.discount ?? "0"));
    if (total.isNegative()) {
      throw unprocessable("O desconto do item não pode superar o valor do item.");
    }

    return {
      productId: product.id,
      description: product.name,
      quantity: item.quantity,
      unitPrice: toCents(item.unitPrice),
      unitCost: toCents(item.unitCost ?? product.defaultCost),
      discount: toCents(item.discount ?? "0"),
      total,
    };
  });

  return { items, productById };
}

/** O tipo "Contrato" é de sistema: existe desde o seed e não é removível. */
async function contractTypeId(tx: PrismaTransactionClient): Promise<string | null> {
  const type = await tx.documentType.findUnique({ where: { key: "contract" } });
  return type?.id ?? null;
}

async function createContractForSale(
  tx: PrismaTransactionClient,
  params: {
    saleId: string;
    customerId: string;
    title: string;
    total: Decimal;
    startDate: Date;
    installments: {
      label: string | null;
      dueDate: Date;
      amount: Decimal;
      paymentMethodId: string | null;
      notes: string | null;
    }[];
  },
): Promise<string> {
  const planned = sumMoney(params.installments.map((installment) => installment.amount));
  if (!planned.equals(params.total)) {
    throw unprocessable(
      `A soma das parcelas (${planned.toFixed(2)}) difere do valor contratado (${params.total.toFixed(2)}).`,
    );
  }

  const code = await generateCode(tx, "contract");

  const contract = await tx.contract.create({
    data: {
      code,
      customerId: params.customerId,
      saleId: params.saleId,
      title: params.title,
      totalAmount: params.total.toFixed(2),
      startDate: params.startDate,
      status: "ACTIVE",
      installments: {
        create: params.installments.map((installment, index) => ({
          number: index + 1,
          label: installment.label,
          dueDate: installment.dueDate,
          expectedAmount: installment.amount.toFixed(2),
          paidAmount: "0",
          status: "PENDING",
          paymentMethodId: installment.paymentMethodId,
          notes: installment.notes,
        })),
      },
    },
  });

  return contract.id;
}

async function createCardForService(
  tx: PrismaTransactionClient,
  params: {
    customerId: string;
    contractId: string | null;
    serviceId: string;
    title: string;
  },
): Promise<void> {
  const stage = await tx.crmStage.findFirst({
    where: { isActive: true },
    orderBy: { position: "asc" },
  });
  if (!stage) return;

  const last = await tx.crmCard.findFirst({
    where: { stageId: stage.id },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const card = await tx.crmCard.create({
    data: {
      customerId: params.customerId,
      contractId: params.contractId,
      serviceId: params.serviceId,
      stageId: stage.id,
      title: params.title,
      position: (last?.position ?? 0) + 1,
    },
  });

  await tx.crmStageHistory.create({
    data: { cardId: card.id, toStageId: stage.id, note: "Card criado pela venda." },
  });
}

export async function cancelSale(
  saleId: string,
  options: { actorId?: string | null; reason?: string | null } = {},
) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({
      where: { id: saleId },
      include: { contracts: { include: { installments: true } } },
    });
    if (!sale) throw notFound("Venda");
    if (sale.status === "CANCELLED") return sale;

    const received = sumMoney(
      sale.contracts.flatMap((contract) =>
        contract.installments.map((installment) => installment.paidAmount),
      ),
    );
    if (received.greaterThan(0)) {
      throw unprocessable(
        "A venda possui recebimentos. Estorne as transações antes de cancelar.",
      );
    }

    const now = new Date();
    await tx.sale.update({
      where: { id: saleId },
      data: { status: "CANCELLED", cancelledAt: now, notes: options.reason ?? sale.notes },
    });

    await tx.contract.updateMany({
      where: { saleId },
      data: { status: "CANCELLED" },
    });
    await tx.installment.updateMany({
      where: { contract: { saleId } },
      data: { status: "CANCELLED" },
    });
    await tx.crmCard.updateMany({
      where: { contract: { saleId } },
      data: { status: "ARCHIVED" },
    });

    await recordAudit(
      {
        userId: options.actorId ?? null,
        action: "sale.cancel",
        entity: "Sale",
        entityId: saleId,
        changes: { reason: options.reason ?? null },
      },
      tx,
    );

    return tx.sale.findUniqueOrThrow({ where: { id: saleId } });
  });
}

/**
 * Rewrites a sale that has not received a cent yet: its items, discount, date,
 * notes and the whole installment plan. Anything already paid is out of scope on
 * purpose — money that moved has to be reversed in Transações first, so the two
 * sides of the ledger never disagree.
 */
export async function updateSale(
  saleId: string,
  input: SaleUpdateInput,
  options: CreateSaleOptions = {},
) {
  return prisma.$transaction(
    async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id: saleId },
        include: {
          customer: true,
          contracts: { include: { installments: { orderBy: { number: "asc" } } } },
          allocations: { where: { reversedAt: null } },
          services: true,
        },
      });
      if (!sale || sale.deletedAt) throw notFound("Venda");
      if (sale.status === "CANCELLED") {
        throw unprocessable("Uma venda cancelada não pode ser editada.");
      }
      if (sale.contracts.length > 1) {
        throw unprocessable("Vendas com mais de um contrato não podem ser editadas por aqui.");
      }

      const received = sumMoney([
        ...sale.contracts.flatMap((contract) =>
          contract.installments.map((installment) => installment.paidAmount),
        ),
        ...sale.allocations.map((allocation) => allocation.amount),
      ]);
      if (received.greaterThan(0)) {
        throw unprocessable(
          "Esta venda já tem recebimentos. Estorne as transações em Transações antes de editar.",
        );
      }

      const { items, productById } = await buildSaleItems(tx, input.items);
      const subtotal = sumMoney(items.map((item) => item.total));
      const discount = toCents(input.discount ?? "0");
      const total = subtotal.minus(discount);
      if (total.isNegative()) {
        throw unprocessable("O desconto da venda não pode superar o subtotal.");
      }

      const soldAt = input.soldAt ?? sale.soldAt;
      const fallbackTitle = items
        .map((item) => item.description)
        .join(" + ")
        .slice(0, 120);

      await tx.saleItem.deleteMany({ where: { saleId } });
      await tx.sale.update({
        where: { id: saleId },
        data: {
          soldAt,
          subtotal: subtotal.toFixed(2),
          discount: discount.toFixed(2),
          total: total.toFixed(2),
          notes: input.notes ?? null,
          items: {
            create: items.map((item) => ({
              productId: item.productId,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice.toFixed(2),
              unitCost: item.unitCost.toFixed(2),
              discount: item.discount.toFixed(2),
              total: item.total.toFixed(2),
            })),
          },
        },
      });

      const needsContract = items.some(
        (item) => productById.get(item.productId)?.kind === "SERVICE",
      );
      const existing = sale.contracts[0] ?? null;
      let contractId: string | null = existing?.id ?? null;

      if (input.contract || needsContract) {
        const planned =
          input.contract?.installments?.map((installment) => ({
            label: installment.label ?? null,
            dueDate: installment.dueDate,
            amount: toCents(installment.amount),
            paymentMethodId: installment.paymentMethodId ?? null,
            notes: installment.notes ?? null,
          })) ?? [
            {
              label: "Pagamento único",
              dueDate: soldAt,
              amount: total,
              paymentMethodId: null,
              notes: null,
            },
          ];

        if (existing) {
          const plannedTotal = sumMoney(planned.map((installment) => installment.amount));
          if (!plannedTotal.equals(total)) {
            throw unprocessable(
              `A soma das parcelas (${plannedTotal.toFixed(2)}) difere do valor contratado (${total.toFixed(2)}).`,
            );
          }

          await tx.contract.update({
            where: { id: existing.id },
            data: {
              title: input.contract?.title ?? fallbackTitle,
              totalAmount: total.toFixed(2),
              startDate: input.contract?.startDate ?? soldAt,
              status: "ACTIVE",
            },
          });

          await replaceInstallments(tx, existing.id, planned);
        } else {
          contractId = await createContractForSale(tx, {
            saleId,
            customerId: sale.customerId,
            title: input.contract?.title ?? fallbackTitle,
            total,
            startDate: input.contract?.startDate ?? soldAt,
            installments: planned,
          });
        }
      } else if (existing) {
        // The sale no longer sells anything that needs a contract, and nothing was
        // ever received against it, so the contract has nothing left to represent.
        await dropReversedAllocations(tx, {
          installmentIds: existing.installments.map((installment) => installment.id),
          contractId: existing.id,
        });
        await tx.installment.deleteMany({ where: { contractId: existing.id } });
        await tx.document.updateMany({
          where: { contractId: existing.id },
          data: { contractId: null },
        });
        await tx.crmCard.updateMany({
          where: { contractId: existing.id },
          data: { contractId: null },
        });
        await tx.serviceExecution.updateMany({
          where: { contractId: existing.id },
          data: { contractId: null },
        });
        await tx.contract.delete({ where: { id: existing.id } });
        contractId = null;
      }

      await syncServicesAndCards(tx, {
        saleId,
        customerId: sale.customerId,
        customerName: sale.customer.name,
        contractId,
        existingServices: sale.services,
        productIds: items.map((item) => item.productId),
        productById,
      });

      const contractUrl = input.contract?.documentUrl?.trim();
      if (contractId && contractUrl) {
        const current = await tx.document.findFirst({
          where: { contractId, type: { key: "contract" }, deletedAt: null },
        });
        if (current) {
          await tx.document.update({ where: { id: current.id }, data: { url: contractUrl } });
        } else {
          await tx.document.create({
            data: {
              customerId: sale.customerId,
              contractId,
              title: "Contrato assinado",
              url: contractUrl,
              typeId: await contractTypeId(tx),
            },
          });
        }
      }

      await recalculateSale(tx, saleId);

      await recordAudit(
        {
          userId: options.actorId ?? null,
          actorLabel: options.actorLabel ?? null,
          action: "sale.update",
          entity: "Sale",
          entityId: saleId,
          changes: {
            code: sale.code,
            totalBefore: sale.total.toFixed(2),
            totalAfter: total.toFixed(2),
          },
        },
        tx,
      );

      return tx.sale.findUniqueOrThrow({
        where: { id: saleId },
        include: {
          items: { include: { product: true } },
          customer: true,
          contracts: { include: { installments: { orderBy: { number: "asc" } } } },
        },
      });
    },
    { isolationLevel: "Serializable", timeout: 25000 },
  );
}

/**
 * Reversed allocations point at rows that are about to disappear. The transaction
 * they belong to stays, with its reversal reason and its audit entry, so the
 * financial history survives; only the dangling pointer goes.
 */
async function dropReversedAllocations(
  tx: PrismaTransactionClient,
  target: { installmentIds?: string[]; contractId?: string | null },
): Promise<void> {
  const or: { installmentId?: { in: string[] }; contractId?: string }[] = [];
  if (target.installmentIds?.length) or.push({ installmentId: { in: target.installmentIds } });
  if (target.contractId) or.push({ contractId: target.contractId });
  if (or.length === 0) return;

  await tx.transactionAllocation.deleteMany({
    where: { reversedAt: { not: null }, OR: or },
  });
}

/** Rewrites a contract's plan in place, reusing rows so numbering stays dense. */
async function replaceInstallments(
  tx: PrismaTransactionClient,
  contractId: string,
  planned: {
    label: string | null;
    dueDate: Date;
    amount: Decimal;
    paymentMethodId: string | null;
    notes: string | null;
  }[],
): Promise<void> {
  const current = await tx.installment.findMany({
    where: { contractId },
    orderBy: { number: "asc" },
  });

  const surplus = current.slice(planned.length);
  if (surplus.length > 0) {
    await dropReversedAllocations(tx, { installmentIds: surplus.map((row) => row.id) });
    await tx.installment.deleteMany({ where: { id: { in: surplus.map((row) => row.id) } } });
  }

  for (const [index, installment] of planned.entries()) {
    const existing = current[index];
    const data = {
      number: index + 1,
      label: installment.label,
      dueDate: installment.dueDate,
      expectedAmount: installment.amount.toFixed(2),
      paidAmount: "0",
      status: "PENDING" as const,
      paymentMethodId: installment.paymentMethodId,
      notes: installment.notes,
    };

    if (existing) {
      await tx.installment.update({ where: { id: existing.id }, data });
    } else {
      await tx.installment.create({ data: { ...data, contractId } });
    }
  }
}

/**
 * Keeps one service execution per sold item: drops what left the sale, creates
 * what arrived, and re-points what stayed at the current contract.
 */
async function syncServicesAndCards(
  tx: PrismaTransactionClient,
  params: {
    saleId: string;
    customerId: string;
    customerName: string;
    contractId: string | null;
    existingServices: { id: string; productId: string }[];
    productIds: string[];
    productById: Map<string, { id: string; name: string; createsCrmCard: boolean }>;
  },
): Promise<void> {
  const wanted = new Set(params.productIds);
  const kept = new Set<string>();

  for (const service of params.existingServices) {
    if (wanted.has(service.productId) && !kept.has(service.productId)) {
      kept.add(service.productId);
      continue;
    }

    const cards = await tx.crmCard.findMany({ where: { serviceId: service.id } });
    if (cards.length > 0) {
      const cardIds = cards.map((card) => card.id);
      await tx.crmStageHistory.deleteMany({ where: { cardId: { in: cardIds } } });
      await tx.crmCard.deleteMany({ where: { id: { in: cardIds } } });
    }
    await tx.serviceExecution.delete({ where: { id: service.id } });
  }

  await tx.serviceExecution.updateMany({
    where: { saleId: params.saleId },
    data: { contractId: params.contractId },
  });
  await tx.crmCard.updateMany({
    where: { service: { saleId: params.saleId } },
    data: { contractId: params.contractId },
  });

  for (const productId of params.productIds) {
    if (kept.has(productId)) continue;
    kept.add(productId);

    const product = params.productById.get(productId);
    if (!product) continue;

    const service = await tx.serviceExecution.create({
      data: {
        customerId: params.customerId,
        productId,
        contractId: params.contractId,
        saleId: params.saleId,
        status: "NOT_STARTED",
      },
    });

    if (product.createsCrmCard) {
      await createCardForService(tx, {
        customerId: params.customerId,
        contractId: params.contractId,
        serviceId: service.id,
        title: `${params.customerName} — ${product.name}`,
      });
    }
  }
}
