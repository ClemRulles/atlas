import { describe, expect, it } from "vitest";
import { lifeSlices } from "@/lib/domain/life-slices";
import { annualFees, breakdown, overlapPairs, realExposure } from "@/lib/domain/lookthrough";
import { tradingDates } from "@/lib/domain/market";
import { timeWeightedReturn } from "@/lib/domain/performance";
import { buildPositions, openPositions } from "@/lib/domain/positions";
import type { FundComposition } from "@/lib/domain/types";
import { dayChange, valuePositions, valueSeries } from "@/lib/domain/valuation";
import { buildDemoPortfolio, businessDays } from "./portfolio";

const AS_OF = "2026-11-13";
const demo = buildDemoPortfolio(AS_OF);
const sum = (values: number[]) => values.reduce((s, v) => s + v, 0);

describe("portefeuille de démonstration", () => {
  it("est déterministe : même date, mêmes données", () => {
    expect(buildDemoPortfolio(AS_OF)).toEqual(demo);
  });

  it("garde la même histoire quand la date d'arrêt avance", () => {
    const later = buildDemoPortfolio("2026-12-31");
    for (const [id, history] of Object.entries(demo.market.prices)) {
      expect(later.market.prices[id].slice(0, history.length)).toEqual(history);
    }
    expect(later.transactions.slice(0, 50)).toEqual(demo.transactions.slice(0, 50));
  });

  it("ne cote que les jours ouvrés", () => {
    expect(businessDays("2026-11-13", "2026-11-17")).toEqual(["2026-11-13", "2026-11-16", "2026-11-17"]);
    const days = tradingDates(demo.market, "2021-01-01", AS_OF);
    expect(days[0]).toBe("2021-01-04");
    expect(days[days.length - 1]).toBe(AS_OF);
  });

  it("a des cours strictement positifs et un euro-dollar plausible", () => {
    for (const history of Object.values(demo.market.prices)) {
      expect(history.every((p) => p.close > 0)).toBe(true);
    }
    expect(demo.market.fx.USD.every((p) => p.close > 0.85 && p.close < 1.45)).toBe(true);
  });

  it("se rejoue sans anomalie et laisse neuf lignes ouvertes", () => {
    const { positions, issues } = buildPositions(demo.transactions, demo.instruments, demo.market);
    expect(issues).toEqual([]);
    expect(openPositions(positions)).toHaveLength(9);
    expect(demo.transactions.some((t) => t.side === "sell")).toBe(true);
    expect(demo.transactions.filter((t) => t.note).length).toBeGreaterThanOrEqual(5);
  });

  it("vaut un montant crédible pour un particulier, entièrement valorisé", () => {
    const { positions } = buildPositions(demo.transactions, demo.instruments, demo.market);
    const valuation = valuePositions(openPositions(positions), demo.instruments, demo.market, AS_OF);
    expect(valuation.missingCount).toBe(0);
    expect(valuation.totalEUR).toBeGreaterThan(80_000);
    expect(valuation.totalEUR).toBeLessThan(400_000);
    const change = dayChange(openPositions(positions), demo.instruments, demo.market, AS_OF);
    expect(Math.abs(change.pct ?? 1)).toBeLessThan(0.06);
    expect(change.priceEffectEUR + change.fxEffectEUR).toBeCloseTo(change.changeEUR, 6);
  });

  it("donne une courbe d'évolution cohérente avec la valorisation du jour", () => {
    const { positions } = buildPositions(demo.transactions, demo.instruments, demo.market);
    const total = valuePositions(openPositions(positions), demo.instruments, demo.market, AS_OF).totalEUR;
    const series = valueSeries(demo.transactions, demo.instruments, demo.market, tradingDates(demo.market, "2021-01-01", AS_OF));
    const last = series[series.length - 1];
    expect(last.valueEUR).toBeCloseTo(total, 6);
    expect(series.every((p) => !p.estimated)).toBe(true);
    expect(last.investedEUR).toBeGreaterThan(60_000);
    const twr = timeWeightedReturn(series);
    expect(twr).not.toBeNull();
    expect(twr!).toBeGreaterThan(-0.5);
    expect(twr!).toBeLessThan(4);
  });

  it("a des compositions bien formées, et un fonds volontairement opaque", () => {
    const compositions = Object.values(demo.compositions) as FundComposition[];
    expect(compositions).toHaveLength(4);
    for (const c of compositions) {
      expect(demo.instruments[c.instrumentId]).toBeDefined();
      expect(sum(c.holdings.map((h) => h.weight))).toBeLessThanOrEqual(1);
      expect(sum(c.sectors!.map((w) => w.weight))).toBeCloseTo(1, 9);
      expect(sum(c.countries!.map((w) => w.weight))).toBeCloseTo(1, 9);
      expect(sum(c.currencies!.map((w) => w.weight))).toBeCloseTo(1, 9);
      expect(c.source).toBe("demo");
    }
    expect(demo.compositions["FR0010135103"]).toBeUndefined();
  });

  it("raconte quelque chose une fois les ETF traversés", () => {
    const { positions } = buildPositions(demo.transactions, demo.instruments, demo.market);
    const lines = valuePositions(openPositions(positions), demo.instruments, demo.market, AS_OF).lines;
    const exposure = realExposure(lines, demo.instruments, demo.compositions);
    const nvidia = exposure.companies.find((c) => c.name === "Nvidia")!;
    expect(nvidia.direct).toBe(true);
    expect(nvidia.via.length).toBe(4); // en direct + trois ETF
    expect(exposure.unavailable).toEqual(["FR0010135103"]);
    expect(exposure.minCompanies).toBe(3650);
    expect(exposure.detailedEUR + exposure.undetailedEUR + exposure.unavailableEUR).toBeCloseTo(exposure.totalEUR, 6);

    const sectors = breakdown(lines, demo.instruments, demo.compositions, "sector");
    expect(sectors.slices[0].key).toBe("Technologie");
    const pairs = overlapPairs(Object.values(demo.compositions) as FundComposition[]);
    expect(pairs[0].overlap).toBeGreaterThan(0.2);
    const fees = annualFees(lines, demo.instruments, demo.compositions);
    expect(fees.totalEUR).toBeGreaterThan(50);
    expect(fees.unknown).toEqual(["FR0010135103"]);

    const life = lifeSlices(exposure.totalEUR, demo.expectedReturn, demo.expenses);
    expect(life.coveredCount).toBeGreaterThanOrEqual(1);
  });
});
