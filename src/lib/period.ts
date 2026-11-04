export type PeriodPreset =
  | "today"
  | "last7"
  | "last30"
  | "thisMonth"
  | "lastMonth"
  | "thisYear"
  | "custom";

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: "Hoje",
  last7: "Últimos 7 dias",
  last30: "Últimos 30 dias",
  thisMonth: "Este mês",
  lastMonth: "Mês anterior",
  thisYear: "Este ano",
  custom: "Período personalizado",
};

export type ResolvedPeriod = { from: Date; to: Date; preset: PeriodPreset };

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

export function resolvePeriod(params: {
  preset?: string | null;
  from?: string | null;
  to?: string | null;
}): ResolvedPeriod {
  const now = new Date();
  const preset = (params.preset ?? "last30") as PeriodPreset;

  if (preset === "custom" && params.from && params.to) {
    const from = new Date(params.from);
    const to = new Date(params.to);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
      return { from: startOfDay(from), to: endOfDay(to), preset: "custom" };
    }
  }

  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now), preset };
    case "last7":
      return { from: startOfDay(addDays(now, -6)), to: endOfDay(now), preset };
    case "thisMonth":
      return {
        from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
        preset,
      };
    case "lastMonth":
      return {
        from: startOfDay(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: endOfDay(new Date(now.getFullYear(), now.getMonth(), 0)),
        preset,
      };
    case "thisYear":
      return {
        from: startOfDay(new Date(now.getFullYear(), 0, 1)),
        to: endOfDay(new Date(now.getFullYear(), 11, 31)),
        preset,
      };
    case "last30":
    default:
      return { from: startOfDay(addDays(now, -29)), to: endOfDay(now), preset: "last30" };
  }
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function toInputDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}
