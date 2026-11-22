import { describe, expect, it } from "vitest";
import type { FundComposition } from "@/lib/domain/types";
import {
  completeWith,
  countryName,
  currenciesFromCountries,
  earningsYieldFrom,
  expenseRatioFrom,
  holdingsFrom,
  rawNumber,
  sectorName,
  toRatios,
  weightsFrom,
  withDerivedCurrencies,
} from "./normalize";

describe("normalisation des compositions", () => {
  it("lit les poids en ratio comme en pourcentage", () => {
    expect(toRatios([0.056, 0.052])).toEqual([0.056, 0.052]);
    expect(toRatios([5.6, 5.2])).toEqual([0.056, 0.052]);
    expect(toRatios([60, 30, 10])).toEqual([0.6, 0.3, 0.1]);
    expect([rawNumber("97.26%"), rawNumber("12,5"), rawNumber(3), rawNumber("abc"), rawNumber(null)]).toEqual([97.26, 12.5, 3, null, null]);
  });

  it("traduit et fusionne les secteurs de chaque fournisseur", () => {
    const yahoo = weightsFrom(
      [
        { label: "technology", value: 0.306 },
        { label: "financial_services", value: 0.16 },
        { label: "realestate", value: 0.0161 },
      ],
      sectorName,
    );
    expect(yahoo.map((w) => w.key)).toEqual(["Technologie", "Finance", "Immobilier"]);
    const gics = weightsFrom(
      [
        { label: "Information Technology", value: "25%" },
        { label: "Technology", value: "5%" },
        { label: "Health Care", value: 10 },
        { label: "Nouveau secteur", value: 2 },
        { label: "Vide", value: 0 },
      ],
      sectorName,
    );
    expect(gics).toEqual([
      { key: "Technologie", weight: 0.3 },
      { key: "Santé", weight: 0.1 },
      { key: "Nouveau secteur", weight: 0.02 },
    ]);
    expect(countryName("United States")).toBe("États-Unis");
  });

  it("nettoie les lignes : poids en ratio, ISIN valide seulement, tri décroissant", () => {
    const rows = holdingsFrom([
      { name: "NVIDIA Corp", symbol: "NVDA", isin: "US67066G1040", weight: 5.2 },
      { name: "Apple Inc", symbol: "AAPL", isin: "pas-un-isin", weight: 5.6 },
      { name: "", weight: 3 },
      { name: "Cash", weight: -1 },
    ]);
    expect(rows).toEqual([
      { name: "Apple Inc", weight: 0.056, symbol: "AAPL" },
      { name: "NVIDIA Corp", weight: 0.052, isin: "US67066G1040", symbol: "NVDA" },
    ]);
  });

  it("lit les frais et les rendements selon l'échelle du fournisseur", () => {
    expect(expenseRatioFrom(0.2, "percent")).toBeCloseTo(0.002, 12);
    expect(expenseRatioFrom(0.002, "ratio")).toBe(0.002);
    expect(expenseRatioFrom(20, "percent")).toBeUndefined();
    expect(earningsYieldFrom(0.04583)).toBe(0.04583);
    expect(earningsYieldFrom(25)).toBeCloseTo(0.04, 12);
    expect(earningsYieldFrom(-3)).toBeUndefined();
  });

  it("déduit les devises des pays, en regroupant la zone euro", () => {
    expect(
      currenciesFromCountries([
        { key: "États-Unis", weight: 0.7 },
        { key: "France", weight: 0.03 },
        { key: "Allemagne", weight: 0.02 },
        { key: "Atlantide", weight: 0.01 },
      ]),
    ).toEqual([
      { key: "USD", weight: 0.7 },
      { key: "EUR", weight: 0.05 },
      { key: "Autres", weight: 0.01 },
    ]);
  });

  it("complète une source par une autre sans rien écraser", () => {
    const primary: FundComposition = { instrumentId: "X", source: "eulerpool", holdings: [{ name: "A", weight: 0.5 }], countries: [{ key: "France", weight: 1 }], holdingsCount: 1500 };
    const yahoo: FundComposition = { instrumentId: "X", source: "yahoo", holdings: [{ name: "B", weight: 0.1 }], sectors: [{ key: "Finance", weight: 1 }], countries: [{ key: "Japon", weight: 1 }], expenseRatio: 0.002, earningsYield: 0.05 };
    const merged = completeWith(primary, yahoo)!;
    expect(merged.holdings).toEqual(primary.holdings);
    expect(merged.countries).toEqual(primary.countries);
    expect(merged.sectors).toEqual(yahoo.sectors);
    expect(merged).toMatchObject({ expenseRatio: 0.002, earningsYield: 0.05, holdingsCount: 1500, source: "eulerpool" });
    expect(completeWith(null, yahoo)).toBe(yahoo);
    expect(withDerivedCurrencies(merged).currencies).toEqual([{ key: "EUR", weight: 1 }]);
  });
});
