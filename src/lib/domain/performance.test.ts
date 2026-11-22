import { describe, expect, it } from "vitest";
import { annualize, cashFlows, daysBetween, timeWeightedReturn, xirr } from "./performance";
import type { Instrument, MarketData } from "./types";
import type { SeriesPoint } from "./valuation";

const point = (date: string, valueEUR: number, investedEUR: number): SeriesPoint => ({ date, valueEUR, investedEUR, estimated: false });

describe("timeWeightedReturn", () => {
  it("n'est pas faussée par un versement", () => {
    const series = [
      point("2025-01-01", 100, 100),
      point("2025-01-02", 110, 100), // +10 %
      point("2025-01-03", 220, 210), // versement de 110, marché à plat
      point("2025-01-04", 242, 210), // +10 %
    ];
    expect(timeWeightedReturn(series)).toBeCloseTo(0.21, 12);
  });

  it("n'est pas faussée par un retrait", () => {
    const series = [point("2025-01-01", 200, 200), point("2025-01-02", 100, 100), point("2025-01-03", 110, 100)];
    expect(timeWeightedReturn(series)).toBeCloseTo(0.1, 12);
  });

  it("renvoie null quand il n'y a rien à mesurer", () => {
    expect(timeWeightedReturn([])).toBeNull();
    expect(timeWeightedReturn([point("2025-01-01", 100, 100)])).toBeNull();
    expect(timeWeightedReturn([point("2025-01-01", 0, 0), point("2025-01-02", 100, 100)])).toBeNull();
  });
});

describe("annualize", () => {
  it("ramène une performance à un an", () => {
    expect(annualize(0.21, 730)).toBeCloseTo(0.1, 12);
    expect(annualize(0.1, 365)).toBeCloseTo(0.1, 12);
    expect(annualize(0.1, 0)).toBeNull();
    expect(daysBetween("2025-01-01", "2026-01-01")).toBe(365);
  });
});

describe("xirr", () => {
  it("retrouve 10 % pour 1 000 € devenus 1 100 € en un an", () => {
    const rate = xirr([{ date: "2025-01-01", amountEUR: -1000 }, { date: "2026-01-01", amountEUR: 1100 }]);
    expect(rate).toBeCloseTo(0.1, 8);
  });

  it("tient compte de la date de chaque versement", () => {
    // 1 000 € au départ, 1 000 € six mois plus tard, 2 100 € à la fin : le second versement a travaillé moitié moins longtemps.
    const rate = xirr([
      { date: "2025-01-01", amountEUR: -1000 },
      { date: "2025-07-02", amountEUR: -1000 },
      { date: "2026-01-01", amountEUR: 2100 },
    ])!;
    const npv = -1000 - 1000 / (1 + rate) ** (182 / 365) + 2100 / (1 + rate);
    expect(npv).toBeCloseTo(0, 6);
    expect(rate).toBeGreaterThan(0.06);
    expect(rate).toBeLessThan(0.07);
  });

  it("sait dire une perte", () => {
    expect(xirr([{ date: "2025-01-01", amountEUR: -1000 }, { date: "2026-01-01", amountEUR: 800 }])).toBeCloseTo(-0.2, 8);
  });

  it("renvoie null quand les flux ne changent pas de signe", () => {
    expect(xirr([{ date: "2025-01-01", amountEUR: -1000 }, { date: "2026-01-01", amountEUR: -50 }])).toBeNull();
    expect(xirr([{ date: "2025-01-01", amountEUR: -1000 }])).toBeNull();
  });
});

describe("cashFlows", () => {
  it("compte les achats en négatif, frais inclus, et les ventes en positif, frais déduits", () => {
    const instruments: Record<string, Instrument> = {
      US: { id: "US", symbol: "US", name: "Action en dollars", type: "stock", currency: "USD" },
    };
    const market: MarketData = { prices: {}, fx: { USD: [{ date: "2025-01-02", close: 1.25 }] } };
    const flows = cashFlows(
      [
        { id: "2", instrumentId: "US", side: "sell", date: "2025-03-03", quantity: 5, price: 100, fees: 3 },
        { id: "1", instrumentId: "US", side: "buy", date: "2025-01-02", quantity: 10, price: 100, fees: 2 },
      ],
      instruments,
      market,
    );
    expect(flows).toEqual([
      { date: "2025-01-02", amountEUR: -802 },
      { date: "2025-03-03", amountEUR: 397 },
    ]);
  });
});
