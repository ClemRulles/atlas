import { describe, expect, it } from "vitest";
import { formatEUR, formatNumber, formatPct } from "./format";

describe("mise en forme", () => {
  it("écrit les montants à la belge francophone", () => {
    expect(formatEUR(184320.45, { decimals: 2 })).toBe("184 320,45 €");
    expect(formatEUR(1612)).toBe("1 612 €");
    expect(formatEUR(40)).toBe("40 €");
  });

  it("affiche le signe sur demande, avec un vrai signe moins", () => {
    expect(formatEUR(212.4, { sign: true })).toBe("+212 €");
    expect(formatEUR(-1148, { sign: true })).toBe("−1 148 €");
    expect(formatEUR(-1148)).toBe("−1 148 €");
  });

  it("écrit les pourcentages à partir d'un ratio", () => {
    expect(formatPct(0.0012, { sign: true })).toBe("+0,12 %");
    expect(formatPct(-0.0062, { sign: true })).toBe("−0,62 %");
    expect(formatPct(0.112, { decimals: 1 })).toBe("11,2 %");
  });

  it("n'affiche jamais de signe devant un zéro arrondi", () => {
    expect(formatPct(-0.00001, { sign: true })).toBe("0,00 %");
    expect(formatNumber(0.4, { sign: true })).toBe("0");
  });
});
