import { describe, expect, it } from "vitest";
import { buildPositions } from "@/lib/domain/positions";
import type { Instrument } from "@/lib/domain/types";
import { valuePositions } from "@/lib/domain/valuation";
import { buyFromEuros, holdingFromEuros, quoteAt, sellFromEuros, type Quotes } from "./entry";

const nvda: Quotes = {
  currency: "USD",
  points: [
    { date: "2025-01-02", close: 140 },
    { date: "2025-06-02", close: 130 },
  ],
  fx: [
    { date: "2025-01-02", close: 1.04 },
    { date: "2025-06-02", close: 1.12 },
  ],
};
const instrument: Instrument = { id: "NVDA", symbol: "NVDA", name: "Nvidia", type: "stock", currency: "USD" };
const market = { prices: { NVDA: nvda.points }, fx: { USD: nvda.fx } };

describe("saisie en euros", () => {
  it("donne le cours du jour en euros, en reprenant la veille un week-end", () => {
    expect(quoteAt(nvda, "2025-01-04")).toEqual({ date: "2025-01-02", close: 140, fx: 1.04, closeEUR: 140 / 1.04 });
    expect(quoteAt(nvda, "2024-12-01")).toBeNull();
  });

  it("transforme « j'ai payé 1 000 € » en parts et en prix, frais compris", () => {
    const t = buyFromEuros(nvda, { id: "a", instrumentId: "NVDA", date: "2025-01-02", paidEUR: 1000, feesEUR: 1 })!;
    expect(t.quantity).toBeCloseTo(999 / (140 / 1.04), 9);
    expect(t.price).toBeCloseTo(140, 9);
    const { positions } = buildPositions([t], { NVDA: instrument }, market);
    expect(positions[0].costEUR).toBeCloseTo(1000, 9);
  });

  it("respecte le nombre de parts réellement obtenu", () => {
    const t = buyFromEuros(nvda, { id: "a", instrumentId: "NVDA", date: "2025-01-02", paidEUR: 1000, quantity: 7 })!;
    expect(t.quantity).toBe(7);
    expect(t.price).toBeCloseTo((1000 * 1.04) / 7, 9);
  });

  it("vend au montant reçu, ou au cours du jour", () => {
    expect(sellFromEuros(nvda, { id: "s", instrumentId: "NVDA", date: "2025-06-02", quantity: 2, receivedEUR: 230 })!.price).toBeCloseTo((230 * 1.12) / 2, 9);
    expect(sellFromEuros(nvda, { id: "s", instrumentId: "NVDA", date: "2025-06-02", quantity: 2 })!.price).toBeCloseTo(130, 9);
  });

  it("enregistre « je possède 1 200 € dont 900 € investis » avec la bonne plus-value", () => {
    const t = holdingFromEuros(nvda, { id: "h", instrumentId: "NVDA", date: "2025-01-02", today: "2025-06-02", valueEUR: 1200, investedEUR: 900 })!;
    const { positions } = buildPositions([t], { NVDA: instrument }, market);
    const v = valuePositions(positions, { NVDA: instrument }, market, "2025-06-02");
    expect(v.totalEUR).toBeCloseTo(1200, 6);
    expect(v.lines[0].gainEUR).toBeCloseTo(300, 6);
  });

  it("sans coût connu, part du cours du jour choisi", () => {
    const t = holdingFromEuros(nvda, { id: "h", instrumentId: "NVDA", date: "2025-06-02", today: "2025-06-02", quantity: 3 })!;
    expect(t.price).toBe(130);
  });
});
