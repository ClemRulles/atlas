import { describe, expect, it } from "vitest";
import { buildPositions, openPositions } from "./positions";
import type { Instrument, MarketData, Transaction } from "./types";

const instruments: Record<string, Instrument> = {
  EU: { id: "EU", symbol: "EU", name: "Action en euros", type: "stock", currency: "EUR" },
  US: { id: "US", symbol: "US", name: "Action en dollars", type: "stock", currency: "USD" },
};
const market: MarketData = {
  prices: {},
  fx: { USD: [{ date: "2025-01-02", close: 1.25 }, { date: "2025-06-02", close: 1.1 }] },
};
const tx = (t: Partial<Transaction> & Pick<Transaction, "id" | "date" | "quantity" | "price">): Transaction => ({
  instrumentId: "EU",
  side: "buy",
  ...t,
});

describe("buildPositions", () => {
  it("calcule le prix de revient moyen sur plusieurs achats", () => {
    const { positions, issues } = buildPositions(
      [tx({ id: "1", date: "2025-01-02", quantity: 10, price: 100 }), tx({ id: "2", date: "2025-02-03", quantity: 10, price: 120 })],
      instruments,
      market,
    );
    expect(issues).toEqual([]);
    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({ quantity: 20, costEUR: 2200, avgPrice: 110, realizedEUR: 0, firstBuy: "2025-01-02" });
  });

  it("une vente retire sa part du prix de revient et réalise la plus-value", () => {
    const { positions } = buildPositions(
      [
        tx({ id: "1", date: "2025-01-02", quantity: 10, price: 100 }),
        tx({ id: "2", date: "2025-02-03", quantity: 10, price: 120 }),
        tx({ id: "3", date: "2025-03-03", quantity: 5, price: 150, side: "sell" }),
      ],
      instruments,
      market,
    );
    // 5 titres sortent à 110 de revient : 750 − 550 = 200 de plus-value.
    expect(positions[0].quantity).toBe(15);
    expect(positions[0].costEUR).toBeCloseTo(1650, 9);
    expect(positions[0].realizedEUR).toBeCloseTo(200, 9);
    expect(positions[0].avgPrice).toBeCloseTo(110, 9);
  });

  it("convertit en euros au taux du jour et ajoute les frais", () => {
    const { positions } = buildPositions(
      [tx({ id: "1", instrumentId: "US", date: "2025-01-02", quantity: 10, price: 100, fees: 2 })],
      instruments,
      market,
    );
    expect(positions[0].costEUR).toBeCloseTo(1000 / 1.25 + 2, 9);
    expect(positions[0].avgPrice).toBe(100);
  });

  it("préfère le taux de change saisi au taux de marché", () => {
    const { positions } = buildPositions(
      [tx({ id: "1", instrumentId: "US", date: "2025-01-02", quantity: 10, price: 100, fxRate: 1 })],
      instruments,
      market,
    );
    expect(positions[0].costEUR).toBe(1000);
  });

  it("signale un taux de change manquant au lieu d'inventer un prix de revient", () => {
    const { positions, issues } = buildPositions(
      [tx({ id: "1", instrumentId: "US", date: "2024-01-02", quantity: 10, price: 100 })],
      instruments,
      market,
    );
    expect(positions[0].quantity).toBe(10);
    expect(positions[0].costEUR).toBeNull();
    expect(issues).toEqual([{ transactionId: "1", kind: "missing-fx" }]);
  });

  it("plafonne une vente supérieure à la quantité détenue et la signale", () => {
    const { positions, issues } = buildPositions(
      [tx({ id: "1", date: "2025-01-02", quantity: 4, price: 100 }), tx({ id: "2", date: "2025-02-03", quantity: 9, price: 110, side: "sell" })],
      instruments,
      market,
    );
    expect(positions[0].quantity).toBe(0);
    expect(positions[0].realizedEUR).toBeCloseTo(40, 9);
    expect(issues).toEqual([{ transactionId: "2", kind: "oversell" }]);
    expect(openPositions(positions)).toEqual([]);
  });

  it("ignore les transactions postérieures à la date demandée et les instruments inconnus", () => {
    const { positions, issues } = buildPositions(
      [
        tx({ id: "1", date: "2025-01-02", quantity: 10, price: 100 }),
        tx({ id: "2", date: "2025-09-01", quantity: 10, price: 100 }),
        tx({ id: "3", instrumentId: "??", date: "2025-01-02", quantity: 1, price: 1 }),
      ],
      instruments,
      market,
      "2025-06-30",
    );
    expect(positions[0].quantity).toBe(10);
    expect(issues).toEqual([{ transactionId: "3", kind: "unknown-instrument" }]);
  });

  it("rejoue les transactions dans l'ordre des dates, quel que soit l'ordre de saisie", () => {
    const { positions, issues } = buildPositions(
      [tx({ id: "2", date: "2025-02-03", quantity: 5, price: 150, side: "sell" }), tx({ id: "1", date: "2025-01-02", quantity: 10, price: 100 })],
      instruments,
      market,
    );
    expect(issues).toEqual([]);
    expect(positions[0].quantity).toBe(5);
  });
});
