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

/**
 * `2026-11-03` parsed by `new Date` lands on UTC midnight, which in Brazil is
 * still the previous evening — and the day would silently shift. Noon keeps the
 * date intact in every timezone the app is used from.
 */
function parseInputDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  const parsed = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)
    : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function resolvePeriod(params: {
  preset?: string | null;
  from?: string | null;
  to?: string | null;
}): ResolvedPeriod {
  const now = new Date();
  const preset = (params.preset ?? "last30") as PeriodPreset;

  if (preset === "custom") {
    // The dates arrive one at a time, as the user fills each input, and the
    // preset has to survive having none of them — otherwise picking "Período
    // personalizado" would bounce straight back to the default range.
    const from = params.from ? parseInputDate(params.from) : null;
    const to = params.to ? parseInputDate(params.to) : null;
    const custom = (first: Date, last: Date): ResolvedPeriod => ({
      from: startOfDay(first),
      to: endOfDay(last),
      preset: "custom",
    });

    if (from && to) {
      // A range typed backwards would return nothing at all; reading it as the
      // same interval is closer to what the person meant.
      return from <= to ? custom(from, to) : custom(to, from);
    }
    // With a single end given, the missing one is measured from it, never from
    // today — otherwise an old start date would stretch the range to this week.
    if (from) return custom(from, from > now ? from : now);
    if (to) return custom(addDays(to, -29), to);
    return custom(addDays(now, -29), now);
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
