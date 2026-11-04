import { describe, expect, it } from "vitest";

import { resolvePeriod, toInputDate } from "@/lib/period";

/**
 * The custom range is the only preset whose dates come from the user, one input
 * at a time. It has to survive being half-filled, or picking it in the dropdown
 * would bounce straight back to the default period.
 */
describe("resolvePeriod", () => {
  it("keeps the custom preset when no dates were chosen yet", () => {
    const period = resolvePeriod({ preset: "custom" });

    expect(period.preset).toBe("custom");
    expect(period.from.getTime()).toBeLessThan(period.to.getTime());
  });

  it("keeps the custom preset with only one of the two dates", () => {
    const onlyFrom = resolvePeriod({ preset: "custom", from: "2026-03-10" });
    expect(onlyFrom.preset).toBe("custom");
    expect(toInputDate(onlyFrom.from)).toBe("2026-03-10");

    const onlyTo = resolvePeriod({ preset: "custom", to: "2026-03-20" });
    expect(onlyTo.preset).toBe("custom");
    expect(toInputDate(onlyTo.to)).toBe("2026-03-20");
  });

  it("reads the typed dates as the days the user actually picked", () => {
    const period = resolvePeriod({
      preset: "custom",
      from: "2026-03-10",
      to: "2026-03-20",
    });

    // Parsed as UTC midnight, these would drift to the previous day west of Greenwich.
    expect(toInputDate(period.from)).toBe("2026-03-10");
    expect(toInputDate(period.to)).toBe("2026-03-20");
    expect(period.from.getHours()).toBe(0);
    expect(period.to.getHours()).toBe(23);
  });

  it("reads a backwards range as the same interval", () => {
    const period = resolvePeriod({
      preset: "custom",
      from: "2026-03-20",
      to: "2026-03-10",
    });

    expect(toInputDate(period.from)).toBe("2026-03-10");
    expect(toInputDate(period.to)).toBe("2026-03-20");
  });

  it("ignores a date that is not a date", () => {
    const period = resolvePeriod({ preset: "custom", from: "ontem", to: "2026-03-20" });

    expect(period.preset).toBe("custom");
    expect(toInputDate(period.to)).toBe("2026-03-20");
  });

  it("falls back to the last 30 days when the preset is unknown", () => {
    expect(resolvePeriod({ preset: "qualquer-coisa" }).preset).toBe("last30");
    expect(resolvePeriod({}).preset).toBe("last30");
  });

  it("covers the whole day on both ends of a single-day range", () => {
    const period = resolvePeriod({ preset: "today" });

    expect(period.from.getHours()).toBe(0);
    expect(period.to.getHours()).toBe(23);
    expect(toInputDate(period.from)).toBe(toInputDate(period.to));
  });
});
