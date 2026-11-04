import "server-only";

import { prisma } from "@/lib/prisma";
import { buildMaskedHint, decryptSecret, encryptSecret } from "@/lib/crypto/secret-box";
import { recordAudit } from "@/server/shared/audit";

export const INTEGRATION_PROVIDERS = {
  LEONA_FLOW: "LEONA_FLOW",
  MERCADO_PAGO: "MERCADO_PAGO",
  OPENAI: "OPENAI",
  N8N: "N8N",
  GOOGLE_DRIVE: "GOOGLE_DRIVE",
} as const;

export type IntegrationProvider =
  (typeof INTEGRATION_PROVIDERS)[keyof typeof INTEGRATION_PROVIDERS];

export type CredentialField = {
  key: string;
  label: string;
  secret: boolean;
  placeholder?: string;
  helpText?: string;
};

export const PROVIDER_FIELDS: Record<IntegrationProvider, CredentialField[]> = {
  LEONA_FLOW: [
    {
      key: "webhookUrl",
      label: "URL de callback (opcional)",
      secret: false,
      placeholder: "https://sua-instancia.leonaflow.com/webhook",
      helpText: "Usada apenas se o sistema precisar notificar o Leona Flow.",
    },
  ],
  MERCADO_PAGO: [
    { key: "accessToken", label: "Access Token", secret: true, placeholder: "APP_USR-..." },
    { key: "publicKey", label: "Public Key", secret: false, placeholder: "APP_USR-..." },
    {
      key: "webhookSecret",
      label: "Assinatura do webhook",
      secret: true,
      helpText: "Chave secreta usada para validar notificações recebidas.",
    },
  ],
  OPENAI: [
    { key: "apiKey", label: "API Key", secret: true, placeholder: "sk-..." },
    { key: "model", label: "Modelo padrão", secret: false, placeholder: "gpt-4.1-mini" },
  ],
  N8N: [
    { key: "baseUrl", label: "URL da instância", secret: false, placeholder: "https://n8n.seudominio.com" },
    { key: "apiKey", label: "API Key", secret: true },
  ],
  GOOGLE_DRIVE: [
    { key: "rootFolderUrl", label: "Pasta raiz dos clientes", secret: false, placeholder: "https://drive.google.com/..." },
  ],
};

export type MaskedCredential = {
  key: string;
  label: string;
  secret: boolean;
  configured: boolean;
  maskedHint: string | null;
  /** Non-secret fields are returned in full; secrets never are. */
  value: string | null;
  updatedAt: string | null;
};

export type IntegrationStatus = {
  provider: IntegrationProvider;
  environment: string;
  configured: boolean;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  fields: MaskedCredential[];
};

export async function getIntegrationStatus(
  provider: IntegrationProvider,
  environment = "production",
): Promise<IntegrationStatus> {
  const rows = await prisma.integrationCredential.findMany({
    where: { provider, environment },
  });
  const byKey = new Map(rows.map((row) => [row.key, row]));

  const fields = PROVIDER_FIELDS[provider].map<MaskedCredential>((field) => {
    const row = byKey.get(field.key);
    return {
      key: field.key,
      label: field.label,
      secret: field.secret,
      configured: Boolean(row),
      maskedHint: row?.maskedHint ?? null,
      value: row && !field.secret ? decryptSecret(row.valueEncrypted) : null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  });

  const requiredSecret = PROVIDER_FIELDS[provider].filter((field) => field.secret);
  const configured =
    requiredSecret.length === 0
      ? fields.some((field) => field.configured)
      : requiredSecret.every((field) => byKey.has(field.key));

  const latest = rows.sort(
    (a, b) => (b.lastTestedAt?.getTime() ?? 0) - (a.lastTestedAt?.getTime() ?? 0),
  )[0];

  return {
    provider,
    environment,
    configured,
    lastTestedAt: latest?.lastTestedAt?.toISOString() ?? null,
    lastTestOk: latest?.lastTestOk ?? null,
    fields,
  };
}

export async function saveCredentials(
  provider: IntegrationProvider,
  values: Record<string, string>,
  options: { environment?: string; actorId?: string | null } = {},
): Promise<void> {
  const environment = options.environment ?? "production";
  const allowed = new Set(PROVIDER_FIELDS[provider].map((field) => field.key));

  for (const [key, rawValue] of Object.entries(values)) {
    if (!allowed.has(key)) continue;
    const value = rawValue.trim();

    if (value.length === 0) {
      await prisma.integrationCredential.deleteMany({ where: { provider, key, environment } });
      continue;
    }

    await prisma.integrationCredential.upsert({
      where: { provider_key_environment: { provider, key, environment } },
      create: {
        provider,
        key,
        environment,
        valueEncrypted: encryptSecret(value),
        maskedHint: buildMaskedHint(value),
      },
      update: {
        valueEncrypted: encryptSecret(value),
        maskedHint: buildMaskedHint(value),
        lastTestedAt: null,
        lastTestOk: null,
      },
    });
  }

  await recordAudit({
    userId: options.actorId ?? null,
    action: "integration.credentials.update",
    entity: "IntegrationCredential",
    entityId: provider,
    changes: { provider, keys: Object.keys(values) },
  });
}

/** Server-side only. Never expose the return value through an API response. */
export async function readCredential(
  provider: IntegrationProvider,
  key: string,
  environment = "production",
): Promise<string | null> {
  const row = await prisma.integrationCredential.findUnique({
    where: { provider_key_environment: { provider, key, environment } },
  });
  if (!row || !row.isActive) return null;
  return decryptSecret(row.valueEncrypted);
}

export async function recordConnectionTest(
  provider: IntegrationProvider,
  ok: boolean,
  environment = "production",
): Promise<void> {
  await prisma.integrationCredential.updateMany({
    where: { provider, environment },
    data: { lastTestedAt: new Date(), lastTestOk: ok },
  });
}
