"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { issueApiKey, revokeApiKey } from "@/server/integrations/api-keys-service";
import {
  INTEGRATION_PROVIDERS,
  PROVIDER_FIELDS,
  recordConnectionTest,
  saveCredentials,
  type IntegrationProvider,
} from "@/server/integrations/credentials-service";
import { testMercadoPagoConnection } from "@/server/integrations/mercado-pago";
import { testOpenAiConnection } from "@/server/integrations/openai";
import { testN8nConnection } from "@/server/integrations/n8n";
import {
  saveFinanceSettings,
  saveGeneralSettings,
} from "@/server/settings/settings-service";
import { toActionResult, type ActionResult } from "@/server/shared/action-result";

const providerSchema = z.enum(
  Object.keys(INTEGRATION_PROVIDERS) as [IntegrationProvider, ...IntegrationProvider[]],
);

export async function saveCredentialsAction(
  provider: string,
  values: Record<string, string>,
  environment = "production",
): Promise<ActionResult<null>> {
  return toActionResult(async () => {
    const user = await requirePermission(PERMISSIONS.INTEGRATION_MANAGE);
    const parsed = providerSchema.parse(provider);

    const allowed = new Set(PROVIDER_FIELDS[parsed].map((field) => field.key));
    const filtered = Object.fromEntries(
      Object.entries(values).filter(([key]) => allowed.has(key)),
    );

    await saveCredentials(parsed, filtered, { environment, actorId: user.id });
    revalidatePath("/configuracoes/integracoes");
    return null;
  });
}

export async function testConnectionAction(
  provider: string,
  environment = "production",
): Promise<ActionResult<{ ok: boolean; message: string }>> {
  return toActionResult(async () => {
    await requirePermission(PERMISSIONS.INTEGRATION_MANAGE);
    const parsed = providerSchema.parse(provider);

    const result = await runTest(parsed, environment);
    await recordConnectionTest(parsed, result.ok, environment);
    revalidatePath("/configuracoes/integracoes");
    return result;
  });
}

async function runTest(
  provider: IntegrationProvider,
  environment: string,
): Promise<{ ok: boolean; message: string }> {
  switch (provider) {
    case "MERCADO_PAGO":
      return testMercadoPagoConnection(environment);
    case "OPENAI":
      return testOpenAiConnection();
    case "N8N":
      return testN8nConnection();
    case "LEONA_FLOW":
      return {
        ok: true,
        message: "O Leona Flow chama nossa API. Gere uma API key e teste um endpoint.",
      };
    default:
      return { ok: true, message: "Configuração salva. Esta integração não possui teste." };
  }
}

export async function issueApiKeyAction(
  name: string,
): Promise<ActionResult<{ token: string; prefix: string }>> {
  return toActionResult(async () => {
    const user = await requirePermission(PERMISSIONS.INTEGRATION_MANAGE);
    const issued = await issueApiKey({ name: name.trim() || "Leona Flow" }, { actorId: user.id });

    revalidatePath("/configuracoes/integracoes");
    return { token: issued.token, prefix: issued.prefix };
  });
}

export async function revokeApiKeyAction(id: string): Promise<ActionResult<null>> {
  return toActionResult(async () => {
    const user = await requirePermission(PERMISSIONS.INTEGRATION_MANAGE);
    await revokeApiKey(id, { actorId: user.id });
    revalidatePath("/configuracoes/integracoes");
    return null;
  });
}

const generalSchema = z.object({
  companyName: z.string().trim().min(2),
  currency: z.string().trim().min(3).max(3),
  timezone: z.string().trim().min(3),
  logoUrl: z.string().url().nullable().optional().or(z.literal("")),
});

export async function saveGeneralSettingsAction(
  payload: unknown,
): Promise<ActionResult<null>> {
  return toActionResult(async () => {
    const user = await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
    const input = generalSchema.parse(payload);

    await saveGeneralSettings(
      { ...input, logoUrl: input.logoUrl || null },
      { actorId: user.id },
    );

    revalidatePath("/configuracoes");
    revalidatePath("/dashboard");
    return null;
  });
}

const financeSchema = z.object({
  consultationCostMode: z.enum(["ON_SALE", "MANUAL"]),
  defaultInstallmentIntervalDays: z.coerce.number().int().min(1).max(365),
});

export async function saveFinanceSettingsAction(
  payload: unknown,
): Promise<ActionResult<null>> {
  return toActionResult(async () => {
    const user = await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
    const input = financeSchema.parse(payload);
    await saveFinanceSettings(input, { actorId: user.id });
    revalidatePath("/configuracoes");
    return null;
  });
}
