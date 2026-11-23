import { describe, expect, it } from "vitest";
import { investedFrom, parseScreenshotText } from "./screenshot-parse";

describe("lecture d'une capture de portefeuille", () => {
  it("lit un écran type Trade Republic : nom, valeur, performance", () => {
    const text = [
      "Portefeuille",
      "18.452,10 €",
      "Core MSCI World USD (Acc)",
      "12.345,67 € +18,20 %",
      "NVIDIA",
      "4.210,00 €",
      "+1.020,50 € +32,00 %",
      "Core MSCI EM IMI USD (Acc) 1.896,43 € -2,10 %",
    ].join("\n");
    const lines = parseScreenshotText(text);
    expect(lines).toEqual([
      { name: "Core MSCI World USD (Acc)", valueEUR: 12345.67, gainPct: 0.182, gainEUR: null },
      { name: "NVIDIA", valueEUR: 4210, gainPct: 0.32, gainEUR: 1020.5 },
      { name: "Core MSCI EM IMI USD (Acc)", valueEUR: 1896.43, gainPct: -0.021, gainEUR: null },
    ]);
  });

  it("déduit le total investi de la plus-value ou de la performance", () => {
    expect(investedFrom({ name: "x", valueEUR: 4210, gainPct: 0.32, gainEUR: 1020.5 })).toBeCloseTo(3189.5, 9);
    expect(investedFrom({ name: "x", valueEUR: 1100, gainPct: 0.1, gainEUR: null })).toBeCloseTo(1000, 9);
    expect(investedFrom({ name: "x", valueEUR: 1100, gainPct: null, gainEUR: null })).toBeNull();
  });

  it("lit les montants à espace fine et sans centimes", () => {
    expect(parseScreenshotText("Apple\n2 500 €\nASML Holding 980,5 €")).toEqual([
      { name: "Apple", valueEUR: 2500, gainPct: null, gainEUR: null },
      { name: "ASML Holding", valueEUR: 980.5, gainPct: null, gainEUR: null },
    ]);
  });
});
