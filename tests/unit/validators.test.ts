import { describe, expect, it } from "vitest";

import { isValidCpf, isValidPhone, isValidUrl } from "@/lib/validators/document";
import { formatCpf, formatCurrency, formatPhone, parseCurrencyInput } from "@/lib/format";
import { moneyToString, sumMoney, toCents } from "@/lib/money";

describe("isValidCpf", () => {
  it("accepts valid numbers with and without mask", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
  });

  it("rejects wrong check digits, repeated digits and short values", () => {
    expect(isValidCpf("52998224724")).toBe(false);
    expect(isValidCpf("11111111111")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
    expect(isValidCpf(null)).toBe(false);
  });
});

describe("isValidPhone", () => {
  it("accepts landlines and mobiles", () => {
    expect(isValidPhone("1133334444")).toBe(true);
    expect(isValidPhone("(11) 98888-7777")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isValidPhone("123")).toBe(false);
    expect(isValidPhone("")).toBe(false);
  });
});

describe("isValidUrl", () => {
  it("only accepts http and https", () => {
    expect(isValidUrl("https://drive.google.com/x")).toBe(true);
    expect(isValidUrl("javascript:alert(1)")).toBe(false);
    expect(isValidUrl("not a url")).toBe(false);
  });
});

describe("money", () => {
  it("rounds half up to cents", () => {
    expect(toCents("10.005").toFixed(2)).toBe("10.01");
    expect(moneyToString(1400)).toBe("1400.00");
  });

  it("sums without floating point drift", () => {
    expect(sumMoney(["0.10", "0.20"]).toFixed(2)).toBe("0.30");
  });
});

describe("formatting", () => {
  it("formats Brazilian values", () => {
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
    expect(formatPhone("11988887777")).toBe("(11) 98888-7777");
    expect(formatCurrency("1400.00").replace(/ /g, " ")).toBe("R$ 1.400,00");
  });

  it("parses typed currency back into a decimal string", () => {
    expect(parseCurrencyInput("R$ 1.400,50")).toBe("1400.50");
    expect(parseCurrencyInput("1400.50")).toBe("1400.50");
  });
});
