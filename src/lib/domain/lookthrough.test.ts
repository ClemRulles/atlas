import { describe, expect, it } from "vitest";
import { annualFees, breakdown, concentration, overlap, overlapPairs, realExposure } from "./lookthrough";
import type { Compositions, FundComposition, Instrument } from "./types";

const instruments: Record<string, Instrument> = {
  A: { id: "A", symbol: "AAA.AS", name: "ETF A", type: "etf", currency: "EUR" },
  B: { id: "B", symbol: "BBB.DE", name: "ETF B", type: "etf", currency: "EUR" },
  F: { id: "F", symbol: "FFF", name: "Fonds opaque", type: "fund", currency: "EUR" },
  X: { id: "X", isin: "ISIN-X", symbol: "XXX", name: "Société X", type: "stock", currency: "USD", sector: "Technologie", country: "États-Unis" },
  Q: { id: "Q", symbol: "QQQ.PA", name: "Société Q", type: "stock", currency: "EUR" },
};
const compA: FundComposition = {
  instrumentId: "A",
  source: "test",
  expenseRatio: 0.002,
  holdingsCount: 1500,
  holdings: [
    { name: "X Corp", isin: "ISIN-X", weight: 0.1, sector: "Technologie", country: "États-Unis", currency: "USD" },
    { name: "Y SA", isin: "ISIN-Y", weight: 0.05, sector: "Santé", country: "France", currency: "EUR" },
    { name: "Z plc", isin: "ISIN-Z", weight: 0.03 },
  ],
  sectors: [{ key: "Technologie", weight: 0.6 }, { key: "Santé", weight: 0.3 }],
};
const compB: FundComposition = {
  instrumentId: "B",
  source: "test",
  holdings: [
    { name: "X Corporation", isin: "ISIN-X", weight: 0.08 },
    { name: "Z plc", isin: "ISIN-Z", weight: 0.04 },
    { name: "W AG", isin: "ISIN-W", weight: 0.1 },
  ],
};
const compositions: Compositions = { A: compA, B: compB };

describe("realExposure", () => {
  const lines = [
    { instrumentId: "A", valueEUR: 1000 },
    { instrumentId: "X", valueEUR: 100 },
    { instrumentId: "F", valueEUR: 500 },
    { instrumentId: "Q", valueEUR: null },
  ];
  const exposure = realExposure(lines, instruments, compositions);

  it("fusionne une action détenue en direct et via un ETF", () => {
    const x = exposure.companies[0];
    expect(x.key).toBe("ISIN-X");
    expect(x.name).toBe("Société X");
    expect(x.valueEUR).toBeCloseTo(200, 9);
    expect(x.weight).toBeCloseTo(200 / 1600, 9);
    expect(x.direct).toBe(true);
    expect(x.via).toEqual([{ instrumentId: "A", valueEUR: 100 }, { instrumentId: "X", valueEUR: 100 }]);
  });

  it("classe les entreprises par valeur réelle décroissante", () => {
    expect(exposure.companies.map((c) => c.key)).toEqual(["ISIN-X", "ISIN-Y", "ISIN-Z"]);
    expect(exposure.companies[1].valueEUR).toBeCloseTo(50, 9);
    expect(exposure.companies[1].direct).toBe(false);
  });

  it("sépare ce qui est détaillé, non détaillé et indisponible, sans rien inventer", () => {
    expect(exposure.totalEUR).toBe(1600);
    expect(exposure.detailedEUR).toBeCloseTo(100 + 180, 9);
    expect(exposure.undetailedEUR).toBeCloseTo(820, 9);
    expect(exposure.unavailableEUR).toBe(500);
    expect(exposure.unavailable).toEqual(["F"]);
    expect(exposure.detailedEUR + exposure.undetailedEUR + exposure.unavailableEUR).toBeCloseTo(exposure.totalEUR, 9);
  });

  it("donne le nombre d'entreprises connues et une borne basse du nombre réel", () => {
    expect(exposure.knownCompanies).toBe(3);
    expect(exposure.minCompanies).toBe(1500);
  });

  it("rapproche par symbole quand l'ISIN manque d'un côté", () => {
    const stock: Instrument = { id: "N", symbol: "NVDA", name: "Nvidia", type: "stock", currency: "USD" };
    const etf: FundComposition = { instrumentId: "A", source: "test", holdings: [{ name: "NVIDIA Corp", isin: "US67066G1040", symbol: "NVDA", weight: 0.5 }] };
    const merged = realExposure(
      [{ instrumentId: "A", valueEUR: 100 }, { instrumentId: "N", valueEUR: 100 }],
      { ...instruments, N: stock },
      { A: etf },
    );
    expect(merged.companies).toHaveLength(1);
    expect(merged.companies[0].valueEUR).toBeCloseTo(150, 9);
  });

  it("ramène à 100 % une composition dont les poids dépassent 1", () => {
    const etf: FundComposition = { instrumentId: "A", source: "test", holdings: [{ name: "X", isin: "ISIN-X", weight: 0.9 }, { name: "Y", isin: "ISIN-Y", weight: 0.3 }] };
    const e = realExposure([{ instrumentId: "A", valueEUR: 1200 }], instruments, { A: etf });
    expect(e.detailedEUR).toBeCloseTo(1200, 9);
    expect(e.undetailedEUR).toBeCloseTo(0, 9);
    expect(e.companies[0].valueEUR).toBeCloseTo(900, 9);
  });
});

describe("breakdown", () => {
  const lines = [
    { instrumentId: "A", valueEUR: 1000 },
    { instrumentId: "B", valueEUR: 400 },
    { instrumentId: "X", valueEUR: 100 },
    { instrumentId: "F", valueEUR: 500 },
  ];

  it("utilise la répartition publiée par le fonds et garde le reste en non détaillé", () => {
    const b = breakdown(lines, instruments, compositions, "sector");
    const tech = b.slices.find((s) => s.key === "Technologie")!;
    expect(tech.valueEUR).toBeCloseTo(600 + 100, 9);
    expect(tech.weight).toBeCloseTo(700 / 2000, 9);
    expect(b.slices.find((s) => s.key === "Santé")!.valueEUR).toBeCloseTo(300, 9);
    expect(b.undetailedEUR).toBeCloseTo(100, 9); // 10 % de l'ETF A non répartis
    expect(b.unavailableEUR).toBe(900); // ETF B sans secteurs + fonds opaque
    expect(b.totalEUR).toBe(2000);
  });

  it("à défaut de répartition publiée, déduit ce qu'elle peut des lignes", () => {
    const b = breakdown(lines, instruments, compositions, "country");
    expect(b.slices.find((s) => s.key === "États-Unis")!.valueEUR).toBeCloseTo(100 + 100, 9);
    expect(b.slices.find((s) => s.key === "France")!.valueEUR).toBeCloseTo(50, 9);
    expect(b.undetailedEUR).toBeCloseTo(850, 9);
    expect(b.unavailableEUR).toBe(900);
  });

  it("compte une action en direct dans sa devise de cotation", () => {
    const b = breakdown([{ instrumentId: "X", valueEUR: 100 }], instruments, compositions, "currency");
    expect(b.slices).toEqual([{ key: "USD", valueEUR: 100, weight: 1 }]);
  });
});

describe("overlap", () => {
  it("additionne le plus petit des deux poids sur les lignes communes", () => {
    const o = overlap(compA, compB);
    expect(o.overlap).toBeCloseTo(0.08 + 0.03, 12);
    expect(o.common).toBe(2);
    expect(o.partial).toBe(true);
  });

  it("vaut 1 pour deux fonds identiques et complets, 0 pour deux fonds disjoints", () => {
    const full = (id: string, keys: string[]): FundComposition => ({
      instrumentId: id,
      source: "test",
      holdings: keys.map((k) => ({ name: k, isin: k, weight: 1 / keys.length })),
    });
    const same = overlap(full("A", ["P", "Q"]), full("B", ["P", "Q"]));
    expect(same.overlap).toBeCloseTo(1, 12);
    expect(same.partial).toBe(false);
    expect(overlap(full("A", ["P", "Q"]), full("B", ["R", "S"])).overlap).toBe(0);
  });

  it("classe les paires de la plus redondante à la moins redondante", () => {
    const c: FundComposition = { instrumentId: "C", source: "test", holdings: [{ name: "W AG", isin: "ISIN-W", weight: 0.5 }] };
    const pairs = overlapPairs([compA, compB, c]);
    expect(pairs.map((p) => `${p.a}-${p.b}`)).toEqual(["A-B", "B-C", "A-C"]);
    expect(pairs[1].overlap).toBeCloseTo(0.1, 12);
  });
});

describe("annualFees", () => {
  it("multiplie la valeur de chaque fonds par ses frais courants et signale les frais inconnus", () => {
    const fees = annualFees(
      [{ instrumentId: "A", valueEUR: 1000 }, { instrumentId: "B", valueEUR: 400 }, { instrumentId: "X", valueEUR: 100 }],
      instruments,
      compositions,
    );
    expect(fees.totalEUR).toBeCloseTo(2, 12);
    expect(fees.unknown).toEqual(["B"]);
    expect(fees.lines.find((l) => l.instrumentId === "X")).toEqual({ instrumentId: "X", expenseRatio: 0, feeEUR: 0 });
    expect(fees.lines.find((l) => l.instrumentId === "B")).toEqual({ instrumentId: "B", expenseRatio: null, feeEUR: null });
  });
});

describe("concentration", () => {
  it("repère les entreprises au-dessus du seuil et le poids des dix premières", () => {
    const exposure = realExposure([{ instrumentId: "A", valueEUR: 1000 }, { instrumentId: "X", valueEUR: 100 }], instruments, compositions);
    const c = concentration(exposure, 0.05);
    expect(c.above.map((x) => x.key)).toEqual(["ISIN-X"]);
    expect(c.top10Weight).toBeCloseTo((200 + 50 + 30) / 1100, 9);
  });
});
