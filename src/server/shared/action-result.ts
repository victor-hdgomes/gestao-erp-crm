import { ZodError } from "zod";

import { AppError } from "@/lib/errors";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Server actions never throw at the client boundary: every failure comes back as
 * a message the form can render.
 */
export async function toActionResult<T>(handler: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { success: true, data: await handler() };
  } catch (error) {
    if (error instanceof ZodError) {
      const flattened = error.flatten();
      return {
        success: false,
        error: flattened.formErrors[0] ?? "Verifique os campos destacados.",
        fieldErrors: flattened.fieldErrors as Record<string, string[]>,
      };
    }

    if (error instanceof AppError) {
      return { success: false, error: error.message };
    }

    // A redirect inside an action is implemented as a thrown control-flow value.
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: unknown }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_")
    ) {
      throw error;
    }

    console.error("[action] unhandled error", error);
    return { success: false, error: "Erro inesperado. Tente novamente." };
  }
}
