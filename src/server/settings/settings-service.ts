import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/server/shared/audit";

export type GeneralSettings = {
  companyName: string;
  currency: string;
  timezone: string;
  logoUrl: string | null;
};

const GENERAL_KEY = "general";

const DEFAULTS: GeneralSettings = {
  companyName: "Painel de Gestão",
  currency: "BRL",
  timezone: "America/Sao_Paulo",
  logoUrl: null,
};

export async function getGeneralSettings(): Promise<GeneralSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: GENERAL_KEY } });
  if (!row) return DEFAULTS;

  const value = row.value as Partial<GeneralSettings> | null;
  return { ...DEFAULTS, ...(value ?? {}) };
}

export async function saveGeneralSettings(
  input: Partial<GeneralSettings>,
  options: { actorId?: string | null } = {},
): Promise<GeneralSettings> {
  const current = await getGeneralSettings();
  const next: GeneralSettings = { ...current, ...input };

  await prisma.appSetting.upsert({
    where: { key: GENERAL_KEY },
    create: { key: GENERAL_KEY, value: next },
    update: { value: next },
  });

  await recordAudit({
    userId: options.actorId ?? null,
    action: "settings.general.update",
    entity: "AppSetting",
    entityId: GENERAL_KEY,
    changes: input as Record<string, unknown>,
  });

  return next;
}

export type FinanceSettings = {
  /** When the consultation cost becomes an expense. */
  consultationCostMode: "ON_SALE" | "MANUAL";
  defaultInstallmentIntervalDays: number;
};

const FINANCE_KEY = "finance";

const FINANCE_DEFAULTS: FinanceSettings = {
  consultationCostMode: "MANUAL",
  defaultInstallmentIntervalDays: 30,
};

export async function getFinanceSettings(): Promise<FinanceSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: FINANCE_KEY } });
  if (!row) return FINANCE_DEFAULTS;
  return { ...FINANCE_DEFAULTS, ...((row.value as Partial<FinanceSettings>) ?? {}) };
}

export async function saveFinanceSettings(
  input: Partial<FinanceSettings>,
  options: { actorId?: string | null } = {},
): Promise<FinanceSettings> {
  const next = { ...(await getFinanceSettings()), ...input };

  await prisma.appSetting.upsert({
    where: { key: FINANCE_KEY },
    create: { key: FINANCE_KEY, value: next },
    update: { value: next },
  });

  await recordAudit({
    userId: options.actorId ?? null,
    action: "settings.finance.update",
    entity: "AppSetting",
    entityId: FINANCE_KEY,
    changes: input as Record<string, unknown>,
  });

  return next;
}
