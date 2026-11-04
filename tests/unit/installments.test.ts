import { describe, expect, it } from "vitest";

import {
  allocateOldestFirst,
  assertAllocationsFit,
  assertInstallmentBalance,
  buildInstallmentPlan,
  planTotal,
  resolveInstallmentStatus,
  summarizeContract,
  type InstallmentLike,
} from "@/server/finance/calculations";

function installment(overrides: Partial<InstallmentLike> & { id: string }): InstallmentLike {
  return {
    number: 1,
    dueDate: new Date("2026-01-10T12:00:00Z"),
    expectedAmount: "100.00",
    paidAmount: "0.00",
    status: "PENDING",
    ...overrides,
  };
}

describe("buildInstallmentPlan", () => {
  it("splits a total evenly and never loses a cent", () => {
    const plan = buildInstallmentPlan({
      total: "1000.00",
      count: 3,
      firstDueDate: new Date("2026-01-10T12:00:00Z"),
    });

    expect(plan).toHaveLength(3);
    expect(planTotal(plan).toFixed(2)).toBe("1000.00");
    expect(plan.map((item) => item.amount.toFixed(2))).toEqual([
      "333.33",
      "333.33",
      "333.34",
    ]);
  });

  it("honours a down payment and splits the rest", () => {
    const plan = buildInstallmentPlan({
      total: "5400.00",
      count: 3,
      firstDueDate: new Date("2026-01-10T12:00:00Z"),
      downPayment: "2700.00",
    });

    expect(plan.map((item) => item.amount.toFixed(2))).toEqual([
      "2700.00",
      "1350.00",
      "1350.00",
    ]);
    expect(planTotal(plan).toFixed(2)).toBe("5400.00");
    expect(plan[0].label).toBe("Entrada");
    expect(plan[2].label).toBe("Finalização");
  });

  it("spaces the due dates by the chosen interval", () => {
    const plan = buildInstallmentPlan({
      total: "300.00",
      count: 3,
      firstDueDate: new Date("2026-01-10T12:00:00Z"),
      intervalDays: 15,
    });

    expect(plan.map((item) => item.dueDate.toISOString().slice(0, 10))).toEqual([
      "2026-01-10",
      "2026-01-25",
      "2026-02-09",
    ]);
  });

  it("rejects a down payment larger than the total", () => {
    expect(() =>
      buildInstallmentPlan({
        total: "1000.00",
        count: 2,
        firstDueDate: new Date(),
        downPayment: "1500.00",
      }),
    ).toThrow();
  });

  it("supports more than two installments", () => {
    const plan = buildInstallmentPlan({
      total: "1200.00",
      count: 12,
      firstDueDate: new Date("2026-01-10T12:00:00Z"),
    });

    expect(plan).toHaveLength(12);
    expect(planTotal(plan).toFixed(2)).toBe("1200.00");
  });
});

describe("resolveInstallmentStatus", () => {
  const now = new Date("2026-02-01T12:00:00Z");

  it("is PAID once the expected amount is covered", () => {
    expect(
      resolveInstallmentStatus(
        { expectedAmount: "100", paidAmount: "100", dueDate: new Date("2026-03-01"), status: "PENDING" },
        now,
      ),
    ).toBe("PAID");
  });

  it("is OVERDUE when nothing was paid and the date passed", () => {
    expect(
      resolveInstallmentStatus(
        { expectedAmount: "100", paidAmount: "0", dueDate: new Date("2026-01-01"), status: "PENDING" },
        now,
      ),
    ).toBe("OVERDUE");
  });

  it("is PARTIALLY_PAID before the due date", () => {
    expect(
      resolveInstallmentStatus(
        { expectedAmount: "100", paidAmount: "40", dueDate: new Date("2026-03-01"), status: "PENDING" },
        now,
      ),
    ).toBe("PARTIALLY_PAID");
  });

  it("keeps CANCELLED regardless of amounts", () => {
    expect(
      resolveInstallmentStatus(
        { expectedAmount: "100", paidAmount: "100", dueDate: new Date("2026-01-01"), status: "CANCELLED" },
        now,
      ),
    ).toBe("CANCELLED");
  });
});

describe("summarizeContract", () => {
  const now = new Date("2026-02-01T12:00:00Z");

  it("separates received from pending and finds the next due date", () => {
    const summary = summarizeContract(
      [
        installment({
          id: "a",
          number: 1,
          dueDate: new Date("2026-01-05T12:00:00Z"),
          expectedAmount: "2700.00",
          paidAmount: "2700.00",
          status: "PAID",
        }),
        installment({
          id: "b",
          number: 2,
          dueDate: new Date("2026-02-05T12:00:00Z"),
          expectedAmount: "1350.00",
        }),
        installment({
          id: "c",
          number: 3,
          dueDate: new Date("2026-03-05T12:00:00Z"),
          expectedAmount: "1350.00",
        }),
      ],
      now,
    );

    expect(summary.total.toFixed(2)).toBe("5400.00");
    expect(summary.received.toFixed(2)).toBe("2700.00");
    expect(summary.pending.toFixed(2)).toBe("2700.00");
    expect(summary.paidInstallmentCount).toBe(1);
    expect(summary.nextDueDate?.toISOString().slice(0, 10)).toBe("2026-02-05");
    expect(summary.nextDueAmount?.toFixed(2)).toBe("1350.00");
  });

  it("counts overdue balances", () => {
    const summary = summarizeContract(
      [
        installment({
          id: "a",
          dueDate: new Date("2026-01-05T12:00:00Z"),
          expectedAmount: "700.00",
          paidAmount: "200.00",
        }),
      ],
      now,
    );

    expect(summary.overdueCount).toBe(1);
    expect(summary.overdueAmount.toFixed(2)).toBe("500.00");
  });

  it("ignores cancelled installments", () => {
    const summary = summarizeContract(
      [
        installment({ id: "a", expectedAmount: "100.00" }),
        installment({ id: "b", expectedAmount: "900.00", status: "CANCELLED" }),
      ],
      now,
    );

    expect(summary.total.toFixed(2)).toBe("100.00");
    expect(summary.installmentCount).toBe(1);
  });
});

describe("allocateOldestFirst", () => {
  it("fills the oldest open installments first", () => {
    const { allocations, leftover } = allocateOldestFirst("1000.00", [
      installment({
        id: "b",
        dueDate: new Date("2026-03-01T12:00:00Z"),
        expectedAmount: "700.00",
      }),
      installment({
        id: "a",
        dueDate: new Date("2026-01-01T12:00:00Z"),
        expectedAmount: "700.00",
      }),
    ]);

    expect(allocations.map((item) => [item.installmentId, item.amount.toFixed(2)])).toEqual([
      ["a", "700.00"],
      ["b", "300.00"],
    ]);
    expect(leftover.toFixed(2)).toBe("0.00");
  });

  it("never allocates more than the open balance", () => {
    const { allocations, leftover } = allocateOldestFirst("1000.00", [
      installment({ id: "a", expectedAmount: "400.00", paidAmount: "100.00" }),
    ]);

    expect(allocations[0].amount.toFixed(2)).toBe("300.00");
    expect(leftover.toFixed(2)).toBe("700.00");
  });

  it("skips installments that are already settled", () => {
    const { allocations } = allocateOldestFirst("100.00", [
      installment({ id: "a", expectedAmount: "100.00", paidAmount: "100.00", status: "PAID" }),
    ]);

    expect(allocations).toHaveLength(0);
  });
});

describe("allocation guards", () => {
  it("rejects allocating more than the settled amount", () => {
    expect(() =>
      assertAllocationsFit("100.00", [{ amount: "60.00" }, { amount: "60.00" }]),
    ).toThrow(/excede o valor liquidado/);
  });

  it("accepts allocating exactly the settled amount", () => {
    expect(() =>
      assertAllocationsFit("100.00", [{ amount: "40.00" }, { amount: "60.00" }]),
    ).not.toThrow();
  });

  it("rejects paying an installment beyond its balance", () => {
    expect(() =>
      assertInstallmentBalance({ expectedAmount: "100.00", paidAmount: "80.00" }, "30.00"),
    ).toThrow(/excede o saldo da parcela/);
  });
});
