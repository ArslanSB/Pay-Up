import { describe, expect, it } from "vitest";
import { amountToInput, formatMoney, isCurrency, parseAmount } from "./money";

const nbsp = (s: string) => s.replace(/ /g, " ");

describe("parseAmount", () => {
  it.each([
    ["1", 100],
    ["1,5", 150],
    ["1.50", 150],
    [" 2 ", 200],
    ["0,05", 5],
    ["12,50", 1250],
  ])("parses %s to %i minor units", (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });
  it.each(["0", "0,00", "abc", "1.234", "-1", "1,000.50", "", "1,", "€1"])("rejects %s", (input) => {
    expect(parseAmount(input)).toBeNull();
  });
  it("rejects absurd amounts above 1,000,000.00", () => {
    expect(parseAmount("1000000,01")).toBeNull();
  });
});

describe("formatMoney", () => {
  it("formats in es-ES", () => {
    expect(nbsp(formatMoney(1250, "EUR", "es-ES"))).toBe("12,50 €");
  });
  it("formats in en-US", () => {
    expect(formatMoney(1250, "EUR", "en-US")).toBe("€12.50");
  });
});

describe("helpers", () => {
  it("amountToInput renders two decimals", () => {
    expect(amountToInput(150)).toBe("1.50");
  });
  it("isCurrency", () => {
    expect(isCurrency("EUR")).toBe(true);
    expect(isCurrency("XXX")).toBe(false);
  });
});
