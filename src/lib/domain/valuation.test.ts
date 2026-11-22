import { describe, expect, it } from "vitest";
import { closeAt, fxAt, tradingDates } from "./market";
import { buildPositions } from "./positions";
import type { Instrument, MarketData, Transaction } from "./types";
import { dayChange, valuePositions, valueSeries } from "./valuation";

const instruments: Record<string, Instrument> = {
  EU: { id: "EU", symbol: "EU", name: "Action en euros", type: "stock", currency: "EUR" },
  US: { id: "US", symbol: "US", name: "Action en dollars", type: "stock", currency: "USD" },
  NOPRICE: { id: "NOPRICE", symbol: "NP", name: "Sans cours", type: "fund", currency: "EUR" },
};
// Jeudi 2, vendredi 3, lundi 6 janvier 2025.
const market: MarketData = {
  prices: {
    EU: [{ date: "2025-01-02", close: 50 }, { date: "2025-01-03", close: 52 }, { date: "2025-01-06", close: 51 }],
    US: [{ date: "2025-01-02", close: 100 }, { date: "2025-01-03", close: 100 }, { date: "2025-01-06", close: 110 }],
  },
  fx: { USD: [{ date: "2025-01-02", close: 1.25 }, { date: "2025-01-03", close: 1.25 }, { date: "2025-01-06", close: 1.1 }] },
};
const buy = (id: string, instrumentId: string, date: string, quantity: number, price: number): Transaction => ({
  id,
  instrumentId,
  side: "buy",
  date,
  quantity,
  price,
});

describe("closeAt / fxAt", () => {
  it("renvoie la dernière clôture connue, y compris le week-end", () => {
    expect(closeAt(market.prices.EU, "2025-01-05")).toEqual({ date: "2025-01-03", close: 52 });
    expect(closeAt(market.prices.EU, "2025-01-03", true)).toEqual({ date: "2025-01-02", close: 50 });
    expect(closeAt(market.prices.EU, "2025-01-01")).toBeUndefined();
    expect(closeAt(undefined, "2025-01-03")).toBeUndefined();
  });

  it("vaut toujours 1 pour l'euro et reste indéfini pour une devise inconnue", () => {
    expect(fxAt(market, "EUR", "1999-01-01")).toBe(1);
    expect(fxAt(market, "USD", "2025-01-06")).toBe(1.1);
    expect(fxAt(market, "JPY", "2025-01-06")).toBeUndefined();
  });

  it("liste les jours de cotation entre deux dates", () => {
    expect(tradingDates(market, "2025-01-03", "2025-01-31")).toEqual(["2025-01-03", "2025-01-06"]);
  });
});

describe("valuePositions", () => {
  const { positions } = buildPositions(
    [buy("1", "EU", "2025-01-02", 10, 50), buy("2", "US", "2025-01-02", 10, 100), buy("3", "NOPRICE", "2025-01-02", 1, 1000)],
    instruments,
    market,
  );

  it("convertit en euros au taux du jour et calcule la plus-value latente", () => {
    const v = valuePositions(positions, instruments, market, "2025-01-06");
    const us = v.lines.find((l) => l.instrumentId === "US")!;
    expect(us.valueEUR).toBeCloseTo(1000, 9); // 10 × 110 $ / 1,10
    expect(us.gainEUR).toBeCloseTo(1000 - 800, 9); // acheté 1 000 $ à 1,25
    expect(us.priceDate).toBe("2025-01-06");
  });

  it("ne valorise pas une ligne sans cours et l'exclut du total", () => {
    const v = valuePositions(positions, instruments, market, "2025-01-06");
    const missing = v.lines.find((l) => l.instrumentId === "NOPRICE")!;
    expect(missing).toMatchObject({ valueEUR: null, gainEUR: null, missing: "price" });
    expect(v.missingCount).toBe(1);
    expect(v.totalEUR).toBeCloseTo(510 + 1000, 9);
  });
});

describe("dayChange", () => {
  const { positions } = buildPositions(
    [buy("1", "EU", "2025-01-02", 10, 50), buy("2", "US", "2025-01-02", 10, 100)],
    instruments,
    market,
  );

  it("sépare l'effet du cours de l'effet de la devise, et leur somme fait la variation", () => {
    const change = dayChange(positions, instruments, market, "2025-01-06");
    const us = change.lines.find((l) => l.instrumentId === "US")!;
    // Veille : 10 × 100 / 1,25 = 800 €. Jour : 10 × 110 / 1,10 = 1 000 €.
    expect(us.priceEffectEUR).toBeCloseTo(80, 9); // 10 × 10 $ / 1,25
    expect(us.fxEffectEUR).toBeCloseTo(120, 9); // 1 100 $ × (1/1,10 − 1/1,25)
    expect(us.changeEUR).toBeCloseTo(200, 9);
    expect(us.pct).toBeCloseTo(0.25, 9);

    const eu = change.lines.find((l) => l.instrumentId === "EU")!;
    expect(eu.changeEUR).toBeCloseTo(-10, 9);
    expect(eu.fxEffectEUR).toBe(0);

    expect(change.changeEUR).toBeCloseTo(190, 9);
    expect(change.priceEffectEUR + change.fxEffectEUR).toBeCloseTo(change.changeEUR, 9);
    expect(change.previousEUR).toBeCloseTo(520 + 800, 9);
    expect(change.pct).toBeCloseTo(190 / 1320, 9);
  });

  it("compare vendredi à jeudi quand on regarde le week-end", () => {
    const change = dayChange(positions, instruments, market, "2025-01-05");
    expect(change.changeEUR).toBeCloseTo(20, 9); // seule l'action en euros a bougé : +2 × 10
  });

  it("laisse à null une ligne sans cours de la veille", () => {
    const change = dayChange(positions, instruments, market, "2025-01-02");
    expect(change.lines.every((l) => l.changeEUR === null)).toBe(true);
    expect(change.pct).toBeNull();
  });
});

describe("valueSeries", () => {
  it("rejoue les transactions : la valeur et l'argent apporté évoluent à leurs dates", () => {
    const series = valueSeries(
      [buy("1", "EU", "2025-01-02", 10, 50), { ...buy("2", "US", "2025-01-06", 10, 110), fees: 5 }],
      instruments,
      market,
      ["2025-01-02", "2025-01-03", "2025-01-06"],
    );
    expect(series.map((p) => p.valueEUR)).toEqual([500, 520, 510 + 1000]);
    expect(series.map((p) => p.investedEUR)).toEqual([500, 500, 500 + 1000 + 5]);
    expect(series.every((p) => !p.estimated)).toBe(true);
  });

  it("retire le produit d'une vente de l'argent apporté", () => {
    const series = valueSeries(
      [buy("1", "EU", "2025-01-02", 10, 50), { ...buy("2", "EU", "2025-01-03", 4, 52), side: "sell" }],
      instruments,
      market,
      ["2025-01-03"],
    );
    expect(series[0].valueEUR).toBeCloseTo(6 * 52, 9);
    expect(series[0].investedEUR).toBeCloseTo(500 - 208, 9);
  });

  it("tient une ligne sans cours à son prix de transaction et le signale", () => {
    const series = valueSeries([buy("1", "NOPRICE", "2025-01-02", 2, 1000)], instruments, market, ["2025-01-03"]);
    expect(series[0]).toMatchObject({ valueEUR: 2000, investedEUR: 2000, estimated: true });
  });
});
