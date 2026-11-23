import { describe, expect, it } from "vitest";
import { buildPositions } from "./positions";
import { expandPlan, planDates, planTotalEUR, withPlans } from "./plans";
import type { Instrument, MarketData, SavingsPlan } from "./types";

const etf: Instrument = { id: "IWDA.AS", symbol: "IWDA.AS", name: "MSCI World", type: "etf", currency: "EUR" };
const us: Instrument = { id: "NVDA", symbol: "NVDA", name: "Nvidia", type: "stock", currency: "USD" };
// Le 2 février 2025 est un dimanche : l'exécution glisse au lundi 3.
const market: MarketData = {
  prices: {
    "IWDA.AS": [
      { date: "2025-01-02", close: 100 },
      { date: "2025-02-03", close: 104 },
      { date: "2025-03-03", close: 98 },
    ],
    NVDA: [{ date: "2025-01-02", close: 140 }],
  },
  fx: { USD: [{ date: "2025-01-02", close: 1.04 }] },
};
const plan: SavingsPlan = { id: "p1", instrumentId: "IWDA.AS", amountEUR: 500, dayOfMonth: 2, start: "2025-01-01", broker: "Trade Republic" };

describe("plans d'épargne", () => {
  it("liste les mois visés jusqu'à aujourd'hui, et s'arrête à la fin du plan", () => {
    expect(planDates(plan, "2025-03-10")).toEqual(["2025-01-02", "2025-02-02", "2025-03-02"]);
    expect(planDates(plan, "2025-03-01")).toEqual(["2025-01-02", "2025-02-02"]);
    expect(planDates({ ...plan, end: "2025-02-28" }, "2025-12-31")).toEqual(["2025-01-02", "2025-02-02"]);
    expect(planDates({ ...plan, start: "2024-12-15" }, "2025-01-05")).toEqual(["2024-12-02", "2025-01-02"]);
    expect(planTotalEUR(plan, "2025-03-10")).toBe(1500);
  });

  it("achète au premier jour de cotation, en parts fractionnaires", () => {
    const { transactions, pending } = expandPlan(plan, etf, market, "2025-03-10");
    expect(pending).toBe(0);
    expect(transactions.map((t) => [t.date, Number(t.quantity.toFixed(4))])).toEqual([
      ["2025-01-02", 5],
      ["2025-02-03", 4.8077],
      ["2025-03-03", 5.102],
    ]);
    expect(transactions[0]).toMatchObject({ id: "plan:p1:2025-01", side: "buy", price: 100, fxRate: 1, broker: "Trade Republic" });
  });

  it("convertit les euros dans la devise du titre et déduit les frais", () => {
    const { transactions } = expandPlan({ ...plan, instrumentId: "NVDA", fees: 1, start: "2025-01-01", end: "2025-01-31" }, us, market, "2025-03-10");
    expect(transactions[0].quantity).toBeCloseTo((499 * 1.04) / 140, 12);
    const { positions } = buildPositions(transactions, { NVDA: us }, market);
    expect(positions[0].costEUR).toBeCloseTo(500, 9); // 499 investis + 1 de frais
  });

  it("met de côté les exécutions dont le cours n'est pas encore connu", () => {
    const { transactions, pending } = expandPlan(plan, etf, market, "2025-05-10");
    expect(transactions).toHaveLength(3);
    expect(pending).toBe(2);
  });

  it("ajoute les achats des plans aux transactions saisies", () => {
    const r = withPlans([{ id: "m", instrumentId: "IWDA.AS", side: "buy", date: "2025-01-02", quantity: 1, price: 100 }], [plan], { "IWDA.AS": etf }, market, "2025-03-10");
    expect(r.transactions).toHaveLength(4);
    const { positions } = buildPositions(r.transactions, { "IWDA.AS": etf }, market);
    expect(positions[0].costEUR).toBeCloseTo(1600, 9);
  });
});
