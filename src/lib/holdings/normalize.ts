/**
 * Mise au propre des compositions, quel que soit le fournisseur : poids en ratios,
 * noms de secteurs et de pays en français, devises déduites des pays.
 * Fonctions pures, testées.
 */

import type { FundComposition, Holding, Weight } from "@/lib/domain/types";
import { countryFr } from "@/lib/market-format";

/** « 97,26 % », "97.26%", 97.26 ou 0.9726 → nombre brut (sans décider de l'échelle). */
export function rawNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const n = Number(value.replace("%", "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Ramène une série de poids à des ratios. Les fournisseurs donnent tantôt 0,056, tantôt 5,6 :
 * si la somme dépasse 1,5 ou qu'un poids dépasse 1, la série est en pourcentage.
 */
export function toRatios(values: number[]): number[] {
  const sum = values.reduce((s, v) => s + v, 0);
  const max = Math.max(0, ...values);
  const percent = sum > 1.5 || max > 1;
  // Arrondi à 12 chiffres significatifs : 5,6 / 100 doit donner 0,056, pas 0,0559999…
  return values.map((v) => (percent ? Number((v / 100).toPrecision(12)) : v));
}

const SECTORS_FR: Record<string, string> = {
  // Yahoo (clés) et Morningstar
  realestate: "Immobilier",
  consumer_cyclical: "Consommation discrétionnaire",
  basic_materials: "Matériaux",
  consumer_defensive: "Consommation de base",
  technology: "Technologie",
  communication_services: "Communication",
  financial_services: "Finance",
  utilities: "Services publics",
  industrials: "Industrie",
  energy: "Énergie",
  healthcare: "Santé",
  // Libellés anglais courants (FMP, Finnhub, Eulerpool, GICS)
  "real estate": "Immobilier",
  "consumer cyclical": "Consommation discrétionnaire",
  "consumer discretionary": "Consommation discrétionnaire",
  "basic materials": "Matériaux",
  materials: "Matériaux",
  "consumer defensive": "Consommation de base",
  "consumer staples": "Consommation de base",
  "information technology": "Technologie",
  "communication services": "Communication",
  telecommunications: "Communication",
  "financial services": "Finance",
  financials: "Finance",
  financial: "Finance",
  "health care": "Santé",
  "cash & others": "Liquidités et autres",
  "cash and/or derivatives": "Liquidités et autres",
  cash: "Liquidités et autres",
  other: "Autres",
  others: "Autres",
};

export function sectorName(raw: string): string {
  const key = raw.trim().toLowerCase();
  return SECTORS_FR[key] ?? SECTORS_FR[key.replace(/\s+/g, "_")] ?? raw.trim();
}

export function countryName(raw: string): string {
  return countryFr(raw.trim()) ?? raw.trim();
}

/** Devise principale des entreprises d'un pays : approximation assumée pour la répartition par devise. */
const COUNTRY_CURRENCY: Record<string, string> = {
  "États-Unis": "USD",
  Canada: "CAD",
  Brésil: "BRL",
  Mexique: "MXN",
  "Royaume-Uni": "GBP",
  Suisse: "CHF",
  Danemark: "DKK",
  Suède: "SEK",
  Norvège: "NOK",
  Japon: "JPY",
  Chine: "HKD",
  "Hong Kong": "HKD",
  Taïwan: "TWD",
  "Corée du Sud": "KRW",
  Inde: "INR",
  Australie: "AUD",
  Singapour: "SGD",
  Israël: "ILS",
  "Arabie saoudite": "SAR",
  "Afrique du Sud": "ZAR",
  France: "EUR",
  Allemagne: "EUR",
  "Pays-Bas": "EUR",
  Belgique: "EUR",
  Espagne: "EUR",
  Italie: "EUR",
  Irlande: "EUR",
  Finlande: "EUR",
  Luxembourg: "EUR",
  Autriche: "EUR",
  Portugal: "EUR",
};

/** Répartition par devise déduite des pays. Les pays inconnus tombent dans « Autres ». */
export function currenciesFromCountries(countries: Weight[]): Weight[] {
  const byCurrency = new Map<string, number>();
  for (const c of countries) {
    const currency = COUNTRY_CURRENCY[c.key] ?? "Autres";
    byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + c.weight);
  }
  return [...byCurrency.entries()].map(([key, weight]) => ({ key, weight })).sort((a, b) => b.weight - a.weight);
}

/** Fusionne des poids de même clé (deux libellés qui donnent le même secteur français). */
export function mergeWeights(weights: Weight[]): Weight[] {
  const map = new Map<string, number>();
  for (const w of weights) if (w.weight > 0) map.set(w.key, (map.get(w.key) ?? 0) + w.weight);
  return [...map.entries()].map(([key, weight]) => ({ key, weight })).sort((a, b) => b.weight - a.weight);
}

/** Construit des poids propres à partir de couples (libellé, valeur brute). */
export function weightsFrom(pairs: { label: string; value: unknown }[], rename: (s: string) => string): Weight[] {
  const clean = pairs.flatMap((p) => {
    const v = rawNumber(p.value);
    return v !== null && v > 0 && p.label ? [{ label: p.label, v }] : [];
  });
  const ratios = toRatios(clean.map((c) => c.v));
  return mergeWeights(clean.map((c, i) => ({ key: rename(c.label), weight: ratios[i] })));
}

/** Lignes propres : poids en ratios, sans doublon ni ligne vide. */
export function holdingsFrom(rows: { name?: unknown; symbol?: unknown; isin?: unknown; weight: unknown }[]): Holding[] {
  const clean = rows.flatMap((r) => {
    const w = rawNumber(r.weight);
    const name = typeof r.name === "string" ? r.name.trim() : "";
    if (w === null || w <= 0 || !name) return [];
    const isin = typeof r.isin === "string" && /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(r.isin.trim()) ? r.isin.trim() : undefined;
    const symbol = typeof r.symbol === "string" && r.symbol.trim() ? r.symbol.trim() : undefined;
    return [{ name, isin, symbol, w }];
  });
  const ratios = toRatios(clean.map((c) => c.w));
  return clean
    .map((c, i) => ({ name: c.name, weight: ratios[i], ...(c.isin ? { isin: c.isin } : {}), ...(c.symbol ? { symbol: c.symbol } : {}) }))
    .sort((a, b) => b.weight - a.weight);
}

/** Frais courants : les fournisseurs les donnent en pourcentage (0,2 = 0,20 %) ou en ratio (0,002). */
export function expenseRatioFrom(value: unknown, scale: "percent" | "ratio"): number | undefined {
  const v = rawNumber(value);
  if (v === null || v < 0) return undefined;
  const ratio = scale === "percent" ? v / 100 : v;
  return ratio < 0.05 ? ratio : undefined; // au-delà de 5 % par an, la donnée est sûrement mal comprise
}

/** Rendement bénéficiaire à partir d'un PER (21,8) ou d'un rendement déjà inversé (0,0458). */
export function earningsYieldFrom(value: unknown): number | undefined {
  const v = rawNumber(value);
  if (v === null || v <= 0) return undefined;
  return v < 1 ? v : 1 / v;
}

/**
 * Complète une composition avec une autre, sans jamais écraser : la source principale garde
 * ses lignes ; la seconde ne remplit que les trous (secteurs, pays, frais, rendements).
 */
export function completeWith(primary: FundComposition | null, secondary: FundComposition | null): FundComposition | null {
  if (!primary) return secondary;
  if (!secondary) return primary;
  return {
    ...primary,
    holdings: primary.holdings.length ? primary.holdings : secondary.holdings,
    sectors: primary.sectors?.length ? primary.sectors : secondary.sectors,
    countries: primary.countries?.length ? primary.countries : secondary.countries,
    currencies: primary.currencies?.length ? primary.currencies : secondary.currencies,
    expenseRatio: primary.expenseRatio ?? secondary.expenseRatio,
    holdingsCount: primary.holdingsCount ?? secondary.holdingsCount,
    earningsYield: primary.earningsYield ?? secondary.earningsYield,
    dividendYield: primary.dividendYield ?? secondary.dividendYield,
    source: primary.holdings.length ? primary.source : `${primary.source}+${secondary.source}`,
  };
}

/** Ajoute la répartition par devise déduite des pays quand elle manque. */
export function withDerivedCurrencies(c: FundComposition): FundComposition {
  if (c.currencies?.length || !c.countries?.length) return c;
  return { ...c, currencies: currenciesFromCountries(c.countries) };
}
