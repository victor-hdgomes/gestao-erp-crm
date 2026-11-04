import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { AppError, unauthorized } from "@/lib/errors";
import { handleApiError } from "@/lib/api/response";
import {
  authenticateApiKey,
  type AuthenticatedApiKey,
} from "@/server/integrations/api-keys-service";

export type IntegrationContext = {
  apiKey: AuthenticatedApiKey;
  eventId: string;
  idempotencyKey: string | null;
};

type HandlerResult = { status?: number; body: unknown };

/** 60 requests per minute per API key, enough for a chat-driven automation. */
const RATE_LIMIT = { windowMs: 60_000, max: 60 };
const hits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string): void {
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || entry.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return;
  }

  entry.count += 1;
  if (entry.count > RATE_LIMIT.max) {
    throw new AppError("RATE_LIMITED", "Limite de requisições excedido. Tente novamente em 1 minuto.");
  }
}

/**
 * Wraps every Leona Flow endpoint: authenticates the API key, enforces
 * idempotency, logs the event and normalises errors.
 */
export async function withIntegration(
  request: NextRequest,
  eventType: string,
  handler: (payload: unknown, context: IntegrationContext) => Promise<HandlerResult>,
): Promise<NextResponse> {
  let eventId: string | null = null;

  try {
    const apiKey = await authenticateApiKey(request.headers.get("authorization"));
    if (!apiKey) throw unauthorized("API key inválida ou revogada.");

    checkRateLimit(apiKey.id);

    const idempotencyKey = request.headers.get("idempotency-key");
    const payload = await readJson(request);

    const previous = idempotencyKey
      ? await prisma.integrationEvent.findFirst({
          where: { provider: apiKey.provider, idempotencyKey },
        })
      : null;

    if (previous?.status === "PROCESSED") {
      return NextResponse.json(
        {
          success: true,
          data: previous.response,
          meta: { idempotent: true, eventId: previous.id },
        },
        { status: 200 },
      );
    }

    // A previous attempt with the same key failed: reuse its row so the
    // retry is traceable instead of colliding with the unique constraint.
    const event = previous
      ? await prisma.integrationEvent.update({
          where: { id: previous.id },
          data: {
            eventType,
            payload: toJson(payload),
            status: "RECEIVED",
            errorMessage: null,
            attempts: { increment: 1 },
          },
        })
      : await prisma.integrationEvent.create({
          data: {
            provider: apiKey.provider,
            eventType,
            idempotencyKey,
            apiKeyId: apiKey.id,
            payload: toJson(payload),
            status: "RECEIVED",
            attempts: 1,
          },
        });

    eventId = event.id;

    const result = await handler(payload, { apiKey, eventId: event.id, idempotencyKey });

    await prisma.integrationEvent.update({
      where: { id: event.id },
      data: {
        status: "PROCESSED",
        response: toJson(result.body),
        processedAt: new Date(),
      },
    });

    return NextResponse.json(
      { success: true, data: result.body, meta: { eventId: event.id } },
      { status: result.status ?? 200 },
    );
  } catch (error) {
    if (eventId) {
      await prisma.integrationEvent
        .update({
          where: { id: eventId },
          data: {
            status: "FAILED",
            errorMessage: error instanceof Error ? error.message : "Erro desconhecido",
          },
        })
        .catch(() => undefined);
    }

    return handleApiError(error);
  }
}

/** Read-only endpoints need authentication but no event trail. */
export async function withIntegrationRead(
  request: NextRequest,
  handler: (context: IntegrationContext) => Promise<HandlerResult>,
): Promise<NextResponse> {
  try {
    const apiKey = await authenticateApiKey(request.headers.get("authorization"));
    if (!apiKey) throw unauthorized("API key inválida ou revogada.");

    checkRateLimit(apiKey.id);

    const result = await handler({ apiKey, eventId: "", idempotencyKey: null });
    return NextResponse.json({ success: true, data: result.body }, { status: result.status ?? 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError("VALIDATION_ERROR", "Corpo da requisição precisa ser JSON válido.");
  }
}

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null));
}
