import { describe, expect, it } from "vitest";
import { overlap } from "@/lib/domain/lookthrough";
import type { Compositions, FundComposition, Instrument, MarketData } from "@/lib/domain/types";
import { applyShock, benchmarkFor, blendIndices, CRISES, lazyTwin, PROFILES, replayCrisis, simulate, whatIfBuy } from "./lab";

const instruments: Record<string, Instrument> = {
  A: { id: "A", symbol: "A", name: "MSCI World", type: "etf", currency: "EUR" },
  US: { id: "US", symbol: "US", name: "Action US", type: "stock", currency: "USD", sector: "Technologie", country: "États-Unis" },
};
const compositions: Compositions = {
  A: { instrumentId: "A", source: "t", holdings: [{ name: "X", isin: "X", weight: 0.5 }, { name: "Y", isin: "Y", weight: 0.5 }], sectors: [{ key: "Technologie", weight: 0.3 }, { key: "Finance", weight: 0.7 }], countries: [{ key: "États-Unis", weight: 0.6 }, { key: "Japon", weight: 0.4 }] },
};

describe("simulateur du futur", () => {
  const sim = simulate({ start: 10_000, monthly: 500, years: 20, profile: PROFILES[1], paths: 3000, thresholds: [100_000, 10_000_000] });

  it("ordonne toujours pessimiste < médian < optimiste et part du capital actuel", () => {
    expect(sim.points[0]).toMatchObject({ year: 0, p10: 10_000, p50: 10_000, p90: 10_000, invested: 10_000 });
    for (const p of sim.points.slice(1)) {
      expect(p.p10).toBeLessThan(p.p50);
      expect(p.p50).toBeLessThan(p.p90);
    }
    expect(sim.points.at(-1)!.invested).toBe(10_000 + 500 * 12 * 20);
  });

  it("donne un médian proche du calcul sans hasard", () => {
    // 10 000 € + 500 €/mois à 5 %/an pendant 20 ans ≈ 233 000 € sans volatilité.
    const r = Math.pow(1.05, 1 / 12) - 1;
    const deterministic = 10_000 * 1.05 ** 20 + 500 * ((1 + r) ** 240 - 1) / r;
    expect(sim.points.at(-1)!.p50 / deterministic).toBeGreaterThan(0.9);
    expect(sim.points.at(-1)!.p50 / deterministic).toBeLessThan(1.1);
  });

  it("place les paliers sur la ligne du temps, et n'en invente pas d'inatteignables", () => {
    expect(sim.milestones[0].year).toBeGreaterThan(5);
    expect(sim.milestones[0].year).toBeLessThan(15);
    expect(sim.milestones[1].year).toBeNull();
  });

  it("est déterministe pour une même graine", () => {
    expect(simulate({ start: 1000, monthly: 100, years: 5, profile: PROFILES[2], paths: 200 })).toEqual(simulate({ start: 1000, monthly: 100, years: 5, profile: PROFILES[2], paths: 200 }));
  });
});

describe("jumeau paresseux", () => {
  const market: MarketData = { prices: {}, fx: { USD: [{ date: "2024-01-01", close: 1.25 }] } };
  const reference = [
    { date: "2024-01-01", close: 100 },
    { date: "2024-06-01", close: 120 },
    { date: "2025-01-01", close: 150 },
  ];
  it("investit chaque euro versé dans la référence, aux mêmes dates", () => {
    const twin = lazyTwin(
      [
        { id: "1", instrumentId: "US", side: "buy", date: "2024-01-01", quantity: 10, price: 125, fees: 0 }, // 1 000 €
        { id: "2", instrumentId: "A", side: "buy", date: "2024-06-01", quantity: 12, price: 100 }, // 1 200 €
      ],
      instruments,
      market,
      reference,
      [
        { date: "2024-01-01", valueEUR: 1000 },
        { date: "2025-01-01", valueEUR: 2500 },
      ],
    );
    // 10 parts à 100 puis 10 parts à 120 = 20 parts à 150 = 3 000 €.
    expect(twin.twinEUR).toBeCloseTo(3000, 9);
    expect(twin.actualEUR).toBe(2500);
    expect(twin.skipped).toBe(0);
  });

  it("retire le produit d'une vente", () => {
    const twin = lazyTwin(
      [
        { id: "1", instrumentId: "A", side: "buy", date: "2024-01-01", quantity: 10, price: 100 },
        { id: "2", instrumentId: "A", side: "sell", date: "2024-06-01", quantity: 6, price: 100 },
      ],
      instruments,
      market,
      reference,
      [{ date: "2025-01-01", valueEUR: 0 }],
    );
    expect(twin.twinEUR).toBeCloseTo(5 * 150, 9);
  });
});

describe("choc sur mesure", () => {
  const lines = [{ instrumentId: "A", valueEUR: 10_000 }, { instrumentId: "US", valueEUR: 2_000 }];
  it("applique la baisse à ce qui est vraiment exposé, ETF traversés", () => {
    const tech = applyShock(lines, instruments, compositions, { axis: "sector", key: "Technologie", drop: 0.3 });
    expect(tech.exposedEUR).toBeCloseTo(3000 + 2000, 9);
    expect(tech.lossEUR).toBeCloseTo(1500, 9);
    const dollar = applyShock(lines, instruments, compositions, { axis: "currency", key: "USD", drop: 0.1 });
    expect(dollar.exposedEUR).toBe(2000);
    expect(dollar.unknownEUR).toBe(10_000); // l'ETF ne publie pas ses devises
  });
});

describe("avant d'acheter", () => {
  it("compare l'avant et l'après, et mesure le recouvrement avec ce qui est détenu", () => {
    const candidate: Instrument = { id: "B", symbol: "B", name: "ETF Japon", type: "etf", currency: "EUR" };
    const comp: FundComposition = { instrumentId: "B", source: "t", holdings: [{ name: "Y", isin: "Y", weight: 0.5 }, { name: "Z", isin: "Z", weight: 0.5 }], countries: [{ key: "Japon", weight: 1 }] };
    const r = whatIfBuy([{ instrumentId: "A", valueEUR: 10_000 }], instruments, compositions, candidate, comp, 10_000, (a, b) => overlap(a, b).overlap);
    expect(r.before.countries.get("Japon")).toBeCloseTo(0.4, 9);
    expect(r.after.countries.get("Japon")).toBeCloseTo(0.7, 9);
    expect(r.overlaps).toEqual([{ instrumentId: "A", overlap: 0.5 }]);
    expect(r.after.topCompanies[0]).toEqual({ name: "Y", weight: 0.5 });
  });
});

describe("rejouer les crises", () => {
  const index = [
    { date: "2020-02-19", close: 100 },
    { date: "2020-03-23", close: 66 },
    { date: "2020-06-01", close: 90 },
    { date: "2020-08-18", close: 101 },
  ];
  const covid = CRISES.find((c) => c.id === "covid")!;

  it("donne la perte maximale en euros et le temps de retour", () => {
    const r = replayCrisis([{ instrumentId: "A", valueEUR: 10_000 }, { instrumentId: "Z", valueEUR: 1_000 }], (id) => (id === "A" ? "WORLD" : undefined), { WORLD: index }, covid);
    expect(r.startEUR).toBe(11_000);
    expect(r.maxLossEUR).toBeCloseTo(-3400, 9);
    expect(r.maxLossPct).toBeCloseTo(-3400 / 11_000, 9);
    expect(r.troughDate).toBe("2020-03-23");
    expect(r.recoveryDays).toBe(181);
    expect(r.unmapped).toEqual(["Z"]);
  });

  it("dit quand le portefeuille n'est pas revenu dans la fenêtre", () => {
    const r = replayCrisis([{ instrumentId: "A", valueEUR: 100 }], () => "I", { I: index.slice(0, 3) }, covid);
    expect(r.recoveryDays).toBeNull();
  });

  it("devine l'indice de référence d'une ligne", () => {
    expect(benchmarkFor({ id: "x", symbol: "CSPX.L", name: "iShares Core S&P 500", type: "etf", currency: "USD" })).toBe("^GSPC");
    expect(benchmarkFor({ id: "x", symbol: "EMIM", name: "iShares Core MSCI EM IMI", type: "etf", currency: "EUR" })).toBe("EEM");
    expect(benchmarkFor({ id: "x", symbol: "ASML.AS", name: "ASML", type: "stock", currency: "EUR", country: "Pays-Bas" })).toBe("^STOXX50E");
    expect(benchmarkFor({ id: "x", symbol: "IWDA.AS", name: "iShares Core MSCI World", type: "etf", currency: "EUR" })).toBe("WORLD");
  });

  it("compose un marché mondial de substitution ramené à 100", () => {
    const w = blendIndices([
      { history: [{ date: "2020-01-01", close: 10 }, { date: "2020-01-02", close: 20 }], weight: 0.75 },
      { history: [{ date: "2020-01-01", close: 50 }, { date: "2020-01-02", close: 50 }], weight: 0.25 },
    ]);
    expect(w).toEqual([{ date: "2020-01-01", close: 100 }, { date: "2020-01-02", close: 175 }]);
  });
});
