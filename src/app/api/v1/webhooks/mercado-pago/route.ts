import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/api/response";
import { readCredential } from "@/server/integrations/credentials-service";
import { applyApprovedPayment } from "@/server/integrations/mercado-pago";

/**
 * Mercado Pago retries a webhook until it gets a 2xx, so this endpoint always
 * answers 200 once the event is stored. The payment itself is re-read from the
 * provider before any money is recorded.
 */
export async function POST(request: NextRequest) {
  try {
    const raw = await request.text();
    const signatureOk = await verifySignature(request, raw);

    const payload = safeParse(raw);
    const paymentId = extractPaymentId(payload);

    const event = await prisma.integrationEvent.create({
      data: {
        provider: "MERCADO_PAGO",
        eventType: "payment.notification",
        idempotencyKey: paymentId ? `payment:${paymentId}` : null,
        payload: (payload ?? { raw }) as Prisma.InputJsonValue,
        status: "RECEIVED",
        attempts: 1,
      },
    });

    if (!signatureOk) {
      await prisma.integrationEvent.update({
        where: { id: event.id },
        data: { status: "FAILED", errorMessage: "Assinatura do webhook inválida." },
      });
      return NextResponse.json({ success: false, error: "invalid signature" }, { status: 401 });
    }

    if (!paymentId) {
      await prisma.integrationEvent.update({
        where: { id: event.id },
        data: { status: "FAILED", errorMessage: "Notificação sem payment id." },
      });
      return NextResponse.json({ success: true, ignored: true });
    }

    const result = await applyApprovedPayment(paymentId);

    await prisma.integrationEvent.update({
      where: { id: event.id },
      data: {
        status: result.applied ? "PROCESSED" : "DUPLICATE",
        response: result as Prisma.InputJsonValue,
        processedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Validates the `x-signature` header described in the Mercado Pago docs:
 * `ts=<timestamp>,v1=<hmac>` over `id:<data.id>;request-id:<id>;ts:<ts>;`.
 * When no secret is configured the webhook is accepted but every payment is
 * still re-read from the provider before it becomes a receipt.
 */
async function verifySignature(request: NextRequest, raw: string): Promise<boolean> {
  const secret = await readCredential("MERCADO_PAGO", "webhookSecret");
  if (!secret) return true;

  const header = request.headers.get("x-signature");
  const requestId = request.headers.get("x-request-id") ?? "";
  if (!header) return false;

  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key?.trim(), value?.trim()];
    }),
  );

  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  const dataId =
    request.nextUrl.searchParams.get("data.id") ??
    request.nextUrl.searchParams.get("id") ??
    extractPaymentId(safeParse(raw)) ??
    "";

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");

  const expectedBuffer = Buffer.from(expected, "hex");
  const providedBuffer = Buffer.from(v1, "hex");

  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

function safeParse(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractPaymentId(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;

  const data = payload.data as { id?: string | number } | undefined;
  if (data?.id) return String(data.id);

  if (payload.type === "payment" && payload.id) return String(payload.id);
  if (payload.topic === "payment" && payload.resource) {
    return String(payload.resource).split("/").pop() ?? null;
  }

  return null;
}
