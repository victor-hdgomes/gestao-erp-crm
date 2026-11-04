import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@/generated/prisma/client";

import { AppError } from "@/lib/errors";

export type ApiSuccess<T> = { success: true; data: T; meta?: Record<string, unknown> };
export type ApiFailure = {
  success: false;
  error: { code: string; message: string; details?: unknown };
};

export function ok<T>(data: T, meta?: Record<string, unknown>, status = 200) {
  return NextResponse.json<ApiSuccess<T>>({ success: true, data, meta }, { status });
}

export function created<T>(data: T, meta?: Record<string, unknown>) {
  return ok(data, meta, 201);
}

export function fail(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json<ApiFailure>(
    { success: false, error: { code, message, details } },
    { status },
  );
}

/** Single place that turns any thrown value into a predictable API payload. */
export function handleApiError(error: unknown) {
  if (error instanceof AppError) {
    return fail(error.code, error.message, error.status, error.details);
  }

  if (error instanceof ZodError) {
    return fail("VALIDATION_ERROR", "Dados inválidos.", 400, error.flatten());
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return fail("CONFLICT", "Registro já existe com esses dados únicos.", 409, {
        target: error.meta?.target,
      });
    }
    if (error.code === "P2025") {
      return fail("NOT_FOUND", "Registro não encontrado.", 404);
    }
  }

  console.error("[api] unhandled error", error);
  return fail("INTERNAL_ERROR", "Erro interno do servidor.", 500);
}

export async function withApi<T>(handler: () => Promise<T>) {
  try {
    return await handler();
  } catch (error) {
    return handleApiError(error);
  }
}
