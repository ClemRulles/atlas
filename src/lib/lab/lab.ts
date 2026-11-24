/**
 * Le laboratoire « Et si » : des expériences sur le portefeuille réel.
 * Tout est illustratif : ces calculs éclairent, ils ne prédisent pas et ne conseillent pas.
 * Fonctions pures, testées.
 */

import { breakdown, concentration, realExposure, type Axis, type LineValue } from "@/lib/domain/lookthrough";
import { closeAt, fxAt } from "@/lib/domain/market";
import type { Compositions, FundComposition, Instrument, MarketData, PriceHistory, Transaction } from "@/lib/domain/types";

/* ——— Hasard déterministe : même réglage, même cône ——— */

export function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(random: () => number): number {
  const u = Math.max(random(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

/* ——— 1. Simulateur du futur (Monte Carlo) ——— */

export interface ReturnProfile {
  id: "prudent" | "equilibre" | "dynamique";
  label: string;
  /** Rendement annuel médian et volatilité annuelle : hypothèses illustratives. */
  annualReturn: number;
  volatility: number;
}

export const PROFILES: ReturnProfile[] = [
  { id: "prudent", label: "Prudent", annualReturn: 0.03, volatility: 0.07 },
  { id: "equilibre", label: "Équilibré", annualReturn: 0.05, volatility: 0.12 },
  { id: "dynamique", label: "Dynamique", annualReturn: 0.07, volatility: 0.17 },
];

export interface ConePoint {
  year: number;
  /** 10e, 50e et 90e centiles de la valeur simulée, en euros d'aujourd'hui non corrigés de l'inflation. */
  p10: number;
  p50: number;
  p90: number;
  invested: number;
}

export interface Simulation {
  points: ConePoint[];
  /** Pour chaque seuil demandé, la première année où le scénario médian le franchit (ou `null`). */
  milestones: { capital: number; year: number | null }[];
}

/**
 * Trajectoires mensuelles : rendement mensuel log-normal tel que la croissance médiane sur un an
 * vaut le rendement annuel choisi ; versement en fin de mois.
 */
export function simulate(opts: {
  start: number;
  monthly: number;
  years: number;
  profile: ReturnProfile;
  paths?: number;
  seed?: number;
  thresholds?: number[];
  /** Versement de chaque mois à venir (index 0 = mois prochain) ; à défaut, `monthly` chaque mois. */
  schedule?: number[];
}): Simulation {
  const { start, monthly, years, profile, paths = 2000, seed = 42, thresholds = [], schedule } = opts;
  const deposit = (m: number) => schedule?.[m - 1] ?? monthly;
  const investedAt: number[] = [start];
  for (let m = 1, total = start; m <= years * 12; m++) {
    total += deposit(m);
    if (m % 12 === 0) investedAt.push(total);
  }
  const random = rng(seed);
  const mu = Math.log(1 + profile.annualReturn) / 12;
  const sigma = profile.volatility / Math.sqrt(12);
  const byYear: number[][] = Array.from({ length: years + 1 }, () => []);
  for (let p = 0; p < paths; p++) {
    let value = start;
    byYear[0].push(value);
    for (let m = 1; m <= years * 12; m++) {
      value = value * Math.exp(mu + sigma * normal(random)) + deposit(m);
      if (m % 12 === 0) byYear[m / 12].push(value);
    }
  }
  const pick = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const points = byYear.map((values, year) => {
    const sorted = [...values].sort((a, b) => a - b);
    return { year, p10: pick(sorted, 0.1), p50: pick(sorted, 0.5), p90: pick(sorted, 0.9), invested: investedAt[year] };
  });
  return {
    points,
    milestones: thresholds.map((capital) => ({ capital, year: points.find((pt) => pt.p50 >= capital)?.year ?? null })),
  };
}

/**
 * Calendrier des versements à venir d'après les plans d'épargne : chaque plan compte à partir de son
 * premier mois et jusqu'à son dernier mois s'il en a un. `extra` s'ajoute (ou se retire) chaque mois.
 */
export function planSchedule(
  plans: { amountEUR: number; start: string; end?: string }[],
  today: string,
  months: number,
  extra = 0,
): number[] {
  const base = new Date(`${today.slice(0, 7)}-01T12:00:00Z`);
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(base);
    d.setUTCMonth(d.getUTCMonth() + i + 1);
    const ym = d.toISOString().slice(0, 7);
    const fromPlans = plans.filter((p) => p.start.slice(0, 7) <= ym && (!p.end || p.end.slice(0, 7) >= ym)).reduce((sum, p) => sum + p.amountEUR, 0);
    return Math.max(0, fromPlans + extra);
  });
}

/* ——— 2. Le jumeau paresseux ——— */

export interface TwinResult {
  /** Valeur aujourd'hui si chaque euro versé était allé dans l'ETF monde, aux mêmes dates. */
  twinEUR: number;
  actualEUR: number;
  series: { date: string; actual: number; twin: number }[];
  /** Transactions ignorées faute de cours (taux de change ou ETF de référence). */
  skipped: number;
}

/**
 * Rejoue les flux de trésorerie dans un ETF de référence (en euros) : un achat de 1 000 € achète
 * 1 000 € de référence ce jour-là ; une vente en retire le produit.
 */
export function lazyTwin(
  transactions: Transaction[],
  instruments: Record<string, Instrument>,
  market: MarketData,
  reference: PriceHistory,
  actualSeries: { date: string; valueEUR: number }[],
): TwinResult {
  const ordered = [...transactions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let units = 0;
  let skipped = 0;
  let cursor = 0;
  const series = actualSeries.map(({ date, valueEUR }) => {
    while (cursor < ordered.length && ordered[cursor].date <= date) {
      const t = ordered[cursor++];
      const instrument = instruments[t.instrumentId];
      const fx = instrument ? (t.fxRate ?? fxAt(market, instrument.currency, t.date)) : undefined;
      const ref = closeAt(reference, t.date);
      if (!fx || !ref) {
        skipped++;
        continue;
      }
      const gross = (t.quantity * t.price) / fx;
      const cash = t.side === "buy" ? gross + (t.fees ?? 0) : -(gross - (t.fees ?? 0));
      units = Math.max(0, units + cash / ref.close);
    }
    const ref = closeAt(reference, date);
    return { date, actual: valueEUR, twin: ref ? units * ref.close : 0 };
  });
  const last = series[series.length - 1];
  return { twinEUR: last?.twin ?? 0, actualEUR: last?.actual ?? 0, series, skipped };
}

/* ——— 3. Choc sur mesure ——— */

export interface Shock {
  axis: Axis;
  key: string;
  /** Baisse en ratio (0,3 = −30 %). */
  drop: number;
}

export interface ShockResult {
  lossEUR: number;
  exposedEUR: number;
  totalEUR: number;
  /** Part du patrimoine dont on ignore l'exposition sur cet axe : la perte réelle peut être plus forte. */
  unknownEUR: number;
}

export function applyShock(lines: LineValue[], instruments: Record<string, Instrument>, compositions: Compositions, shock: Shock): ShockResult {
  const b = breakdown(lines, instruments, compositions, shock.axis);
  const exposedEUR = b.slices.find((s) => s.key === shock.key)?.valueEUR ?? 0;
  return { lossEUR: exposedEUR * shock.drop, exposedEUR, totalEUR: b.totalEUR, unknownEUR: b.undetailedEUR + b.unavailableEUR };
}

/* ——— 4. Avant d'acheter ——— */

export interface WhatIfBuy {
  before: { sectors: Map<string, number>; countries: Map<string, number>; top10: number; topCompanies: { name: string; weight: number }[] };
  after: { sectors: Map<string, number>; countries: Map<string, number>; top10: number; topCompanies: { name: string; weight: number }[] };
  /** Recouvrement du nouveau produit avec chacun des fonds détenus. */
  overlaps: { instrumentId: string; overlap: number }[];
}

function picture(lines: LineValue[], instruments: Record<string, Instrument>, compositions: Compositions) {
  const asMap = (axis: Axis) => new Map(breakdown(lines, instruments, compositions, axis).slices.map((s) => [s.key, s.weight]));
  const exposure = realExposure(lines, instruments, compositions);
  return {
    sectors: asMap("sector"),
    countries: asMap("country"),
    top10: concentration(exposure).top10Weight,
    topCompanies: exposure.companies.slice(0, 5).map((c) => ({ name: c.name, weight: c.weight })),
  };
}

export function whatIfBuy(
  lines: LineValue[],
  instruments: Record<string, Instrument>,
  compositions: Compositions,
  candidate: Instrument,
  candidateComposition: FundComposition | undefined,
  amountEUR: number,
  overlapWith: (a: FundComposition, b: FundComposition) => number,
): WhatIfBuy {
  const allInstruments = { ...instruments, [candidate.id]: candidate };
  const allCompositions = candidateComposition ? { ...compositions, [candidate.id]: candidateComposition } : compositions;
  const existing = lines.find((l) => l.instrumentId === candidate.id);
  const afterLines = existing
    ? lines.map((l) => (l.instrumentId === candidate.id ? { ...l, valueEUR: (l.valueEUR ?? 0) + amountEUR } : l))
    : [...lines, { instrumentId: candidate.id, valueEUR: amountEUR }];
  return {
    before: picture(lines, instruments, compositions),
    after: picture(afterLines, allInstruments, allCompositions),
    overlaps: candidateComposition
      ? Object.entries(compositions)
          .filter((entry): entry is [string, FundComposition] => !!entry[1] && entry[0] !== candidate.id && lines.some((l) => l.instrumentId === entry[0]))
          .map(([id, c]) => ({ instrumentId: id, overlap: overlapWith(candidateComposition, c) }))
          .sort((a, b) => b.overlap - a.overlap)
      : [],
  };
}

/* ——— 5. Rejouer les crises ——— */

export interface Crisis {
  id: "2008" | "covid" | "2022";
  label: string;
  /** Sommet d'avant crise et fin de la fenêtre observée. */
  start: string;
  end: string;
}

export const CRISES: Crisis[] = [
  { id: "2008", label: "Crise financière 2008", start: "2007-10-09", end: "2013-06-28" },
  { id: "covid", label: "Covid 2020", start: "2020-02-19", end: "2020-12-31" },
  { id: "2022", label: "Inflation 2022", start: "2022-01-03", end: "2024-06-28" },
];

export interface CrisisReplay {
  series: { date: string; valueEUR: number }[];
  startEUR: number;
  /** Perte maximale depuis le départ, en euros (négative) et en ratio. */
  maxLossEUR: number;
  maxLossPct: number;
  troughDate: string | null;
  /** Jours entre le départ et le retour au niveau de départ, `null` si pas revenu dans la fenêtre. */
  recoveryDays: number | null;
  /** Lignes sans indice de référence exploitable, laissées constantes. */
  unmapped: string[];
}

/**
 * Chaque ligne suit son indice de référence depuis le sommet d'avant crise : approximation assumée
 * (ni devises, ni dividendes, ni différences fines entre un ETF et son indice).
 */
export function replayCrisis(
  lines: { instrumentId: string; valueEUR: number }[],
  benchmarkOf: (instrumentId: string) => string | undefined,
  indices: Record<string, PriceHistory | undefined>,
  crisis: Crisis,
): CrisisReplay {
  const startEUR = lines.reduce((s, l) => s + l.valueEUR, 0);
  const unmapped: string[] = [];
  const legs = lines.map((l) => {
    const key = benchmarkOf(l.instrumentId);
    const history = key ? indices[key] : undefined;
    const base = history ? closeAt(history, crisis.start) : undefined;
    if (!history || !base) unmapped.push(l.instrumentId);
    return { value: l.valueEUR, history: base ? history : undefined, base: base?.close };
  });
  const dates = [...new Set(legs.flatMap((leg) => leg.history?.filter((p) => p.date >= crisis.start && p.date <= crisis.end).map((p) => p.date) ?? []))].sort();
  const series = dates.map((date) => ({
    date,
    valueEUR: legs.reduce((s, leg) => {
      if (!leg.history || !leg.base) return s + leg.value;
      const p = closeAt(leg.history, date);
      return s + (p ? leg.value * (p.close / leg.base) : leg.value);
    }, 0),
  }));
  let trough = series[0];
  for (const p of series) if (!trough || p.valueEUR < trough.valueEUR) trough = p;
  const after = trough ? series.find((p) => p.date > trough.date && p.valueEUR >= startEUR) : undefined;
  const maxLossEUR = trough ? Math.min(0, trough.valueEUR - startEUR) : 0;
  return {
    series,
    startEUR,
    maxLossEUR,
    maxLossPct: startEUR > 0 ? maxLossEUR / startEUR : 0,
    troughDate: trough && maxLossEUR < 0 ? trough.date : null,
    recoveryDays: after ? Math.round((Date.parse(after.date) - Date.parse(crisis.start)) / 86_400_000) : null,
    unmapped,
  };
}

/** Indice de référence d'une ligne : celui indiqué, sinon deviné à son nom, sinon le marché mondial. */
export function benchmarkFor(instrument: Instrument): string {
  const text = `${instrument.benchmark ?? ""} ${instrument.name}`.toLowerCase();
  if (/nasdaq/.test(text)) return "^NDX";
  if (/s&p ?500|sp500/.test(text)) return "^GSPC";
  if (/emerging|émergent|\bem\b|em imi/.test(text)) return "EEM";
  if (/euro ?stoxx|stoxx|europe/.test(text)) return "^STOXX50E";
  if (instrument.type === "stock") {
    return instrument.country && instrument.country !== "États-Unis" ? "^STOXX50E" : "^GSPC";
  }
  return "WORLD";
}

/**
 * « Marché mondial » de substitution pour rejouer les crises : 75 % S&P 500 et 25 % Euro Stoxx 50,
 * chacun ramené à 1 au départ. Les indices MSCI World ne sont pas disponibles gratuitement sur une si longue période.
 */
export function blendIndices(parts: { history: PriceHistory | undefined; weight: number }[]): PriceHistory {
  const usable = parts.filter((p): p is { history: PriceHistory; weight: number } => !!p.history && p.history.length > 0);
  if (usable.length === 0) return [];
  const total = usable.reduce((s, p) => s + p.weight, 0);
  const dates = [...new Set(usable.flatMap((p) => p.history.map((x) => x.date)))].sort();
  const first = dates[0];
  return dates.flatMap((date) => {
    let value = 0;
    for (const p of usable) {
      const base = p.history[0].close;
      const at = closeAt(p.history, date) ?? (date >= first ? p.history[0] : undefined);
      if (!at) return [];
      value += (p.weight / total) * (at.close / base);
    }
    return [{ date, close: value * 100 }];
  });
}

export const WORLD_PARTS = [
  { symbol: "^GSPC", weight: 0.75 },
  { symbol: "^STOXX50E", weight: 0.25 },
];
