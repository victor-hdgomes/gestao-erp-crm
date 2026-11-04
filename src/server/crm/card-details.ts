import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/errors";
import { moneyToString } from "@/lib/money";
import { summarizeContract, resolveInstallmentStatus } from "@/server/finance/calculations";
import { toInstallmentLike } from "@/server/finance/transactions";

export type CardInstallment = {
  id: string;
  number: number;
  label: string | null;
  dueDate: string;
  expectedAmount: string;
  paidAmount: string;
  status: string;
  paymentMethod: string | null;
};

export type CardDetailsDto = {
  id: string;
  title: string;
  stage: { id: string; name: string };
  enteredStageAt: string;
  customer: {
    id: string;
    name: string;
    document: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    driveFolderUrl: string | null;
    notes: string | null;
  };
  contract: {
    id: string;
    code: string;
    title: string;
    startDate: string;
    total: string;
    received: string;
    pending: string;
    overdueCount: number;
    nextDueDate: string | null;
    nextDueAmount: string | null;
    installments: CardInstallment[];
  } | null;
  service: { name: string; status: string } | null;
  documents: { id: string; title: string; url: string }[];
  history: { id: string; createdAt: string; from: string | null; to: string; by: string | null }[];
};

/** Serialized shape so the drawer can be a client component. */
export async function getCardDetailsDto(cardId: string): Promise<CardDetailsDto> {
  const card = await prisma.crmCard.findUnique({
    where: { id: cardId },
    include: {
      customer: { include: { documents: { where: { deletedAt: null } } } },
      stage: true,
      service: { include: { product: true } },
      contract: {
        include: {
          installments: { orderBy: { number: "asc" }, include: { paymentMethod: true } },
          documents: { where: { deletedAt: null } },
        },
      },
      history: {
        orderBy: { createdAt: "desc" },
        include: { fromStage: true, toStage: true, movedBy: { select: { name: true } } },
      },
    },
  });

  if (!card || card.deletedAt) throw notFound("Card");

  const summary = card.contract
    ? summarizeContract(card.contract.installments.map(toInstallmentLike))
    : null;

  const address = [
    card.customer.street,
    card.customer.number,
    card.customer.district,
    card.customer.city && card.customer.state
      ? `${card.customer.city}/${card.customer.state}`
      : card.customer.city,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    id: card.id,
    title: card.title,
    stage: { id: card.stage.id, name: card.stage.name },
    enteredStageAt: card.enteredStageAt.toISOString(),
    customer: {
      id: card.customer.id,
      name: card.customer.name,
      document: card.customer.document,
      phone: card.customer.phone,
      email: card.customer.email,
      address: address || null,
      driveFolderUrl: card.customer.driveFolderUrl,
      notes: card.customer.notes,
    },
    contract:
      card.contract && summary
        ? {
            id: card.contract.id,
            code: card.contract.code,
            title: card.contract.title,
            startDate: card.contract.startDate.toISOString(),
            total: moneyToString(summary.total),
            received: moneyToString(summary.received),
            pending: moneyToString(summary.pending),
            overdueCount: summary.overdueCount,
            nextDueDate: summary.nextDueDate?.toISOString() ?? null,
            nextDueAmount: summary.nextDueAmount ? moneyToString(summary.nextDueAmount) : null,
            installments: card.contract.installments.map((installment) => ({
              id: installment.id,
              number: installment.number,
              label: installment.label,
              dueDate: installment.dueDate.toISOString(),
              expectedAmount: moneyToString(installment.expectedAmount),
              paidAmount: moneyToString(installment.paidAmount),
              status: resolveInstallmentStatus(installment),
              paymentMethod: installment.paymentMethod?.name ?? null,
            })),
          }
        : null,
    service: card.service
      ? { name: card.service.product.name, status: card.service.status }
      : null,
    documents: [
      ...card.customer.documents.map((document) => ({
        id: document.id,
        title: document.title,
        url: document.url,
      })),
      ...(card.contract?.documents ?? []).map((document) => ({
        id: document.id,
        title: document.title,
        url: document.url,
      })),
    ],
    history: card.history.map((entry) => ({
      id: entry.id,
      createdAt: entry.createdAt.toISOString(),
      from: entry.fromStage?.name ?? null,
      to: entry.toStage.name,
      by: entry.movedBy?.name ?? null,
    })),
  };
}
