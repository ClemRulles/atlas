import type { Compositions, FundComposition, Holding, Instrument, Weight } from "./types";

/**
 * Regarder à travers les ETF et les fonds : ce que l'on possède vraiment.
 *
 * Trois cas pour chaque euro investi, jamais confondus :
 * - détaillé : rattaché à une entreprise (ou à un secteur, un pays, une devise) identifiée ;
 * - non détaillé : dans un fonds dont la composition publiée ne couvre pas 100 % ;
 * - indisponible : dans un fonds dont on ne connaît pas la composition.
 */

export interface LineValue {
  instrumentId: string;
  valueEUR: number | null;
}

export interface ExposureVia {
  instrumentId: string;
  valueEUR: number;
}

export interface CompanyExposure {
  key: string;
  name: string;
  /** Un ticker connu pour cette entreprise (pour aller chercher son cours, ses actualités). */
  symbol?: string;
  isin?: string;
  valueEUR: number;
  /** Part du portefeuille total. */
  weight: number;
  /** Par quels produits elle est détenue, du plus gros au plus petit. */
  via: ExposureVia[];
  /** Vrai si elle est aussi détenue en direct. */
  direct: boolean;
}

export interface RealExposure {
  companies: CompanyExposure[];
  totalEUR: number;
  detailedEUR: number;
  undetailedEUR: number;
  unavailableEUR: number;
  /** Fonds dont la composition est inconnue. */
  unavailable: string[];
  /** Entreprises distinctes identifiées. */
  knownCompanies: number;
  /** Borne basse du nombre réel d'entreprises (les émetteurs annoncent plus de lignes qu'ils n'en détaillent). */
  minCompanies: number;
}

const symbolRoot = (symbol: string) => symbol.toUpperCase().split(".")[0];
/**
 * Nom d'entreprise réduit à l'essentiel, pour rapprocher « Alphabet Inc Class A » et « Alphabet Inc Class C »,
 * ou « NVIDIA Corp » et « NVIDIA Corporation ».
 */
export const nameKey = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\.com\b/g, "")
    .replace(/\bclass [a-z]\b|\bser(ies)? [a-z]\b|\b(adr|reg|registered|shs|ordinary shares?)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|sa|nv|n v|ag|se|spa|ab|as|asa|holding|holdings|group|the|and)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Poids utilisables d'une composition : positifs, ramenés à 100 % si leur somme dépasse 1. */
function usableHoldings(composition: FundComposition): Holding[] {
  const positive = composition.holdings.filter((h) => h.weight > 0);
  const sum = positive.reduce((s, h) => s + h.weight, 0);
  return sum > 1 ? positive.map((h) => ({ ...h, weight: h.weight / sum })) : positive;
}

/** Associe à chaque symbole l'ISIN vu ailleurs, pour fusionner « NVDA » en direct et « US67066G1040 » dans un ETF. */
function buildAliases(instruments: Instrument[], compositions: FundComposition[]): Map<string, string> {
  const aliases = new Map<string, string>();
  const learn = (isin?: string, symbol?: string) => {
    if (isin && symbol && !aliases.has(symbolRoot(symbol))) aliases.set(symbolRoot(symbol), isin);
  };
  for (const i of instruments) if (i.type === "stock") learn(i.isin, i.symbol);
  for (const c of compositions) for (const h of c.holdings) learn(h.isin, h.symbol);
  return aliases;
}

function keyOf(aliases: Map<string, string>, isin?: string, symbol?: string, name?: string): string {
  if (isin) return isin;
  const alias = symbol ? aliases.get(symbolRoot(symbol)) : undefined;
  if (alias) return alias;
  // Sans ISIN connu, le nom rapproche mieux que le ticker (deux classes d'actions, deux places).
  const byName = nameKey(name ?? "");
  if (byName) return `name:${byName}`;
  return symbol ? `symbol:${symbolRoot(symbol)}` : "name:";
}

/** « Alphabet Inc Class A » → « Alphabet Inc » : la classe d'actions n'aide pas à lire. */
function cleanName(name: string): string {
  return name.replace(/\s+class\s+[a-z]\b/gi, "").trim();
}

export function realExposure(
  lines: LineValue[],
  instruments: Record<string, Instrument>,
  compositions: Compositions,
): RealExposure {
  const held = lines.filter((l) => l.valueEUR !== null && l.valueEUR > 0 && instruments[l.instrumentId]);
  const aliases = buildAliases(
    held.map((l) => instruments[l.instrumentId]),
    held.map((l) => compositions[l.instrumentId]).filter((c): c is FundComposition => !!c),
  );
  const companies = new Map<string, CompanyExposure>();
  const add = (key: string, name: string, valueEUR: number, instrumentId: string, direct: boolean, symbol?: string, isin?: string) => {
    let c = companies.get(key);
    if (!c) {
      c = { key, name: cleanName(name), valueEUR: 0, weight: 0, via: [], direct: false };
      companies.set(key, c);
    }
    c.valueEUR += valueEUR;
    c.direct ||= direct;
    if (direct) c.name = name;
    if (symbol && (!c.symbol || direct)) c.symbol = symbol;
    if (isin && !c.isin) c.isin = isin;
    const via = c.via.find((v) => v.instrumentId === instrumentId);
    if (via) via.valueEUR += valueEUR;
    else c.via.push({ instrumentId, valueEUR });
  };

  let totalEUR = 0;
  let detailedEUR = 0;
  let undetailedEUR = 0;
  let unavailableEUR = 0;
  let largestFund = 0;
  const unavailable: string[] = [];

  for (const line of held) {
    const value = line.valueEUR as number;
    const instrument = instruments[line.instrumentId];
    totalEUR += value;
    if (instrument.type === "stock") {
      add(keyOf(aliases, instrument.isin, instrument.symbol, instrument.name), instrument.name, value, instrument.id, true, instrument.symbol, instrument.isin);
      detailedEUR += value;
      continue;
    }
    const composition = compositions[line.instrumentId];
    if (!composition || composition.holdings.length === 0) {
      unavailableEUR += value;
      unavailable.push(line.instrumentId);
      continue;
    }
    largestFund = Math.max(largestFund, composition.holdingsCount ?? 0);
    let covered = 0;
    for (const h of usableHoldings(composition)) {
      add(keyOf(aliases, h.isin, h.symbol, h.name), h.name, value * h.weight, instrument.id, false, h.symbol, h.isin);
      covered += h.weight;
    }
    detailedEUR += value * covered;
    undetailedEUR += value * (1 - covered);
  }

  const list = [...companies.values()]
    .map((c) => ({
      ...c,
      weight: totalEUR > 0 ? c.valueEUR / totalEUR : 0,
      via: c.via.sort((a, b) => b.valueEUR - a.valueEUR),
    }))
    .sort((a, b) => b.valueEUR - a.valueEUR);

  return {
    companies: list,
    totalEUR,
    detailedEUR,
    undetailedEUR,
    unavailableEUR,
    unavailable,
    knownCompanies: list.length,
    minCompanies: Math.max(list.length, largestFund),
  };
}

export type Axis = "sector" | "country" | "currency";

export interface BreakdownSlice {
  key: string;
  valueEUR: number;
  weight: number;
}

export interface Breakdown {
  slices: BreakdownSlice[];
  totalEUR: number;
  undetailedEUR: number;
  unavailableEUR: number;
}

const AXIS_WEIGHTS: Record<Axis, "sectors" | "countries" | "currencies"> = {
  sector: "sectors",
  country: "countries",
  currency: "currencies",
};

/** Poids d'un fonds sur un axe : la répartition publiée si elle existe, sinon ce que disent ses lignes. */
function fundWeights(composition: FundComposition, axis: Axis): Weight[] {
  const published = composition[AXIS_WEIGHTS[axis]];
  if (published && published.length > 0) return published.filter((w) => w.weight > 0);
  const byKey = new Map<string, number>();
  for (const h of usableHoldings(composition)) {
    const key = h[axis];
    if (key) byKey.set(key, (byKey.get(key) ?? 0) + h.weight);
  }
  return [...byKey.entries()].map(([key, weight]) => ({ key, weight }));
}

/** Répartition réelle du portefeuille par secteur, pays ou devise, ETF traversés. */
export function breakdown(
  lines: LineValue[],
  instruments: Record<string, Instrument>,
  compositions: Compositions,
  axis: Axis,
): Breakdown {
  const slices = new Map<string, number>();
  let totalEUR = 0;
  let undetailedEUR = 0;
  let unavailableEUR = 0;
  const add = (key: string, value: number) => slices.set(key, (slices.get(key) ?? 0) + value);

  for (const line of lines) {
    const instrument = instruments[line.instrumentId];
    if (!instrument || line.valueEUR === null || line.valueEUR <= 0) continue;
    const value = line.valueEUR;
    totalEUR += value;
    if (instrument.type === "stock") {
      const key = instrument[axis];
      if (key) add(key, value);
      else unavailableEUR += value;
      continue;
    }
    const composition = compositions[line.instrumentId];
    const weights = composition ? fundWeights(composition, axis) : [];
    if (weights.length === 0) {
      unavailableEUR += value;
      continue;
    }
    const sum = weights.reduce((s, w) => s + w.weight, 0);
    const scale = sum > 1 ? 1 / sum : 1;
    for (const w of weights) add(w.key, value * w.weight * scale);
    undetailedEUR += value * Math.max(0, 1 - sum);
  }

  return {
    slices: [...slices.entries()]
      .map(([key, valueEUR]) => ({ key, valueEUR, weight: totalEUR > 0 ? valueEUR / totalEUR : 0 }))
      .sort((a, b) => b.valueEUR - a.valueEUR),
    totalEUR,
    undetailedEUR,
    unavailableEUR,
  };
}

export interface Overlap {
  a: string;
  b: string;
  /** Somme, sur les lignes communes, du plus petit des deux poids. */
  overlap: number;
  common: number;
  /** Vrai si l'une des compositions est incomplète : le recouvrement réel est alors au moins égal à cette valeur. */
  partial: boolean;
}

/** Taux de recouvrement entre deux fonds. */
export function overlap(a: FundComposition, b: FundComposition): Overlap {
  const aliases = buildAliases([], [a, b]);
  const weightsOf = (c: FundComposition) => {
    const map = new Map<string, number>();
    for (const h of usableHoldings(c)) {
      const key = keyOf(aliases, h.isin, h.symbol, h.name);
      map.set(key, (map.get(key) ?? 0) + h.weight);
    }
    return map;
  };
  const wa = weightsOf(a);
  const wb = weightsOf(b);
  let shared = 0;
  let common = 0;
  for (const [key, weight] of wa) {
    const other = wb.get(key);
    if (other !== undefined) {
      shared += Math.min(weight, other);
      common += 1;
    }
  }
  const covered = (m: Map<string, number>) => [...m.values()].reduce((s, w) => s + w, 0);
  return {
    a: a.instrumentId,
    b: b.instrumentId,
    overlap: shared,
    common,
    partial: covered(wa) < 0.98 || covered(wb) < 0.98,
  };
}

/** Recouvrement de chaque paire de fonds, du plus fort au plus faible. */
export function overlapPairs(compositions: FundComposition[]): Overlap[] {
  const pairs: Overlap[] = [];
  for (let i = 0; i < compositions.length; i++) {
    for (let j = i + 1; j < compositions.length; j++) pairs.push(overlap(compositions[i], compositions[j]));
  }
  return pairs.sort((x, y) => y.overlap - x.overlap);
}

export interface FeeLine {
  instrumentId: string;
  expenseRatio: number | null;
  feeEUR: number | null;
}

export interface AnnualFees {
  lines: FeeLine[];
  /** Somme des frais connus. */
  totalEUR: number;
  /** Fonds dont les frais courants sont inconnus. */
  unknown: string[];
}

/** Frais annuels en euros : valeur de chaque fonds × ses frais courants. Une action en direct n'en a pas. */
export function annualFees(
  lines: LineValue[],
  instruments: Record<string, Instrument>,
  compositions: Compositions,
): AnnualFees {
  let totalEUR = 0;
  const unknown: string[] = [];
  const out: FeeLine[] = [];
  for (const line of lines) {
    const instrument = instruments[line.instrumentId];
    if (!instrument || line.valueEUR === null || line.valueEUR <= 0) continue;
    if (instrument.type === "stock") {
      out.push({ instrumentId: instrument.id, expenseRatio: 0, feeEUR: 0 });
      continue;
    }
    const ratio = compositions[line.instrumentId]?.expenseRatio ?? instrument.expenseRatio;
    if (ratio === undefined) {
      unknown.push(instrument.id);
      out.push({ instrumentId: instrument.id, expenseRatio: null, feeEUR: null });
      continue;
    }
    totalEUR += line.valueEUR * ratio;
    out.push({ instrumentId: instrument.id, expenseRatio: ratio, feeEUR: line.valueEUR * ratio });
  }
  return { lines: out, totalEUR, unknown };
}

export interface Concentration {
  /** Poids cumulé des dix premières entreprises. */
  top10Weight: number;
  /** Entreprises qui pèsent plus que le seuil. */
  above: CompanyExposure[];
}

export function concentration(exposure: RealExposure, threshold = 0.05): Concentration {
  return {
    top10Weight: exposure.companies.slice(0, 10).reduce((s, c) => s + c.weight, 0),
    above: exposure.companies.filter((c) => c.weight > threshold),
  };
}
