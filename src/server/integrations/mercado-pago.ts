import "server-only";

import { prisma } from "@/lib/prisma";
import { moneyToString, toCents } from "@/lib/money";
import { AppError } from "@/lib/errors";
import { readCredential } from "@/server/integrations/credentials-service";
import { createTransaction } from "@/server/finance/transactions";

const API_BASE = "https://api.mercadopago.com";

export type MercadoPagoPayment = {
  id: number;
  status: string;
  status_detail?: string;
  transaction_amount: number;
  date_approved: string | null;
  external_reference: string | null;
  payment_method_id?: string;
  payer?: { email?: string };
};

async function accessToken(environment: string): Promise<string> {
  const token = await readCredential("MERCADO_PAGO", "accessToken", environment);
  if (!token) {
    throw new AppError(
      "INTEGRATION_ERROR",
      "Mercado Pago não configurado. Informe o Access Token em Configurações › Integrações.",
    );
  }
  return token;
}

async function request<T>(
  path: string,
  init: RequestInit & { environment?: string } = {},
): Promise<T> {
  const token = await accessToken(init.environment ?? "production");

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new AppError(
      "INTEGRATION_ERROR",
      `Mercado Pago respondeu ${response.status}.`,
      body.slice(0, 500),
    );
  }

  return (await response.json()) as T;
}

export async function testMercadoPagoConnection(
  environment: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const me = await request<{ id: number; nickname?: string }>("/users/me", { environment });
    return { ok: true, message: `Conectado como ${me.nickname ?? me.id}.` };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof AppError ? error.message : "Falha ao conectar.",
    };
  }
}

export async function fetchPayment(
  paymentId: string,
  environment = "production",
): Promise<MercadoPagoPayment> {
  return request<MercadoPagoPayment>(`/v1/payments/${paymentId}`, { environment });
}

export type CreatePreferenceInput = {
  title: string;
  amount: string;
  externalReference: string;
  payerEmail?: string | null;
  environment?: string;
};

export async function createPaymentPreference(input: CreatePreferenceInput) {
  return request<{ id: string; init_point: string; sandbox_init_point: string }>(
    "/checkout/preferences",
    {
      method: "POST",
      environment: input.environment,
      body: JSON.stringify({
        items: [
          {
            title: input.title,
            quantity: 1,
            currency_id: "BRL",
            unit_price: Number(toCents(input.amount).toFixed(2)),
          },
        ],
        external_reference: input.externalReference,
        payer: input.payerEmail ? { email: input.payerEmail } : undefined,
      }),
    },
  );
}

/**
 * Applies an approved payment to the system. The webhook only carries an id:
 * the amount and status are always read back from Mercado Pago, and the
 * `external_reference` is expected to be an installment id.
 */
export async function applyApprovedPayment(
  paymentId: string,
  environment = "production",
): Promise<{ applied: boolean; reason?: string; transactionId?: string }> {
  const existing = await prisma.transaction.findFirst({
    where: { externalProvider: "MERCADO_PAGO", externalId: paymentId },
  });
  if (existing) return { applied: false, reason: "Pagamento já registrado." };

  const payment = await fetchPayment(paymentId, environment);
  if (payment.status !== "approved") {
    return { applied: false, reason: `Pagamento com status ${payment.status}.` };
  }

  const installment = payment.external_reference
    ? await prisma.installment.findUnique({
        where: { id: payment.external_reference },
        include: { contract: true },
      })
    : null;

  const amount = moneyToString(payment.transaction_amount);

  const transaction = await createTransaction(
    {
      type: "INCOME",
      description: installment
        ? `Mercado Pago — ${installment.contract.code}`
        : `Mercado Pago — pagamento ${paymentId}`,
      customerId: installment?.contract.customerId ?? null,
      expenseCategoryId: null,
      paymentMethodId: null,
      expectedAmount: amount,
      settledAmount: amount,
      dueDate: installment?.dueDate ?? null,
      settledAt: payment.date_approved ? new Date(payment.date_approved) : new Date(),
      competenceDate: payment.date_approved ? new Date(payment.date_approved) : new Date(),
      notes: `Método: ${payment.payment_method_id ?? "desconhecido"}`,
      origin: "MERCADO_PAGO",
      externalId: paymentId,
      externalProvider: "MERCADO_PAGO",
      allocations: installment
        ? [
            {
              targetType: "INSTALLMENT",
              installmentId: installment.id,
              contractId: installment.contractId,
              saleId: null,
              amount,
            },
          ]
        : [],
    },
    { actorLabel: "Mercado Pago" },
  );

  return { applied: true, transactionId: transaction.id };
}
