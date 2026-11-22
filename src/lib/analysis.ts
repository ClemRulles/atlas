import { dayStory, type DayStory } from "@/lib/domain/contributors";
import { realEarnings, type Earnings } from "@/lib/domain/earnings";
import { lifeSlices, type LifeSlices } from "@/lib/domain/life-slices";
import {
  annualFees,
  breakdown,
  concentration,
  overlapPairs,
  realExposure,
  type AnnualFees,
  type Axis,
  type Breakdown,
  type Concentration,
  type Overlap,
  type RealExposure,
} from "@/lib/domain/lookthrough";
import { closeAt, fxAt, tradingDates } from "@/lib/domain/market";
import { annualize, daysBetween, timeWeightedReturn } from "@/lib/domain/performance";
import { buildPositions, openPositions, type Position } from "@/lib/domain/positions";
import { dailySentence, type Token } from "@/lib/domain/sentence";
import type { AssetType, Compositions, Expense, FundComposition, Instrument, MarketData, Transaction } from "@/lib/domain/types";
import { valuePositions, valueSeries, type SeriesPoint, type ValuedLine } from "@/lib/domain/valuation";

/** Tout ce qu'il faut pour décrire un portefeuille. Les données de démo et les vraies ont la même forme. */
export interface PortfolioData {
  instruments: Record<string, Instrument>;
  transactions: Transaction[];
  market: MarketData;
  compositions: Compositions;
  expenses: Expense[];
  expectedReturn: number;
}

export interface LineView {
  instrument: Instrument;
  position: Position;
  valued: ValuedLine;
  dayPct: number | null;
  dayChangeEUR: number | null;
  /** Derniers cours en euros, pour la mini-courbe. */
  spark: number[];
}

export interface Snapshot {
  today: string;
  totalEUR: number;
  costEUR: number;
  gainEUR: number;
  story: DayStory;
  sentence: Token[];
  /** Variation du jour en ratio, pour teinter l'aurore. */
  dayPct: number;
  series: SeriesPoint[];
  twr: number | null;
  twrAnnual: number | null;
  lines: LineView[];
  groups: { type: AssetType; label: string; lines: LineView[]; totalEUR: number }[];
  life: LifeSlices;
  exposure: RealExposure;
  breakdowns: Record<Axis, Breakdown>;
  overlaps: Overlap[];
  fees: AnnualFees;
  concentration: Concentration;
  earnings: Earnings;
  missingPrices: number;
}

const GROUP_LABELS: Record<AssetType, string> = { stock: "Actions", etf: "ETF", fund: "Fonds" };

function sparkline(instrument: Instrument, market: MarketData, date: string, sessions = 30): number[] {
  const history = market.prices[instrument.id] ?? [];
  const end = history.findLastIndex((p) => p.date <= date);
  if (end < 0) return [];
  return history.slice(Math.max(0, end - sessions + 1), end + 1).flatMap((p) => {
    const fx = fxAt(market, instrument.currency, p.date);
    return fx === undefined ? [] : [p.close / fx];
  });
}

export function analyze(data: PortfolioData, today: string): Snapshot {
  const { instruments, transactions, market, compositions } = data;
  const { positions } = buildPositions(transactions, instruments, market, today);
  const open = openPositions(positions);
  const valuation = valuePositions(open, instruments, market, today);
  const story = dayStory(open, instruments, market, compositions, today);
  const first = transactions.reduce<string | null>((min, t) => (!min || t.date < min ? t.date : min), null);
  const series = first ? valueSeries(transactions, instruments, market, tradingDates(market, first, today)) : [];
  const twr = timeWeightedReturn(series);

  const lines: LineView[] = open
    .map((position, i) => {
      const instrument = instruments[position.instrumentId];
      const day = story.change.lines[i];
      return {
        instrument,
        position,
        valued: valuation.lines[i],
        dayPct: day?.pct ?? null,
        dayChangeEUR: day?.changeEUR ?? null,
        spark: sparkline(instrument, market, today),
      };
    })
    .sort((a, b) => (b.valued.valueEUR ?? 0) - (a.valued.valueEUR ?? 0));

  const groups = (["etf", "stock", "fund"] as AssetType[])
    .map((type) => {
      const groupLines = lines.filter((l) => l.instrument.type === type);
      return { type, label: GROUP_LABELS[type], lines: groupLines, totalEUR: groupLines.reduce((s, l) => s + (l.valued.valueEUR ?? 0), 0) };
    })
    .filter((g) => g.lines.length > 0);

  const lineValues = valuation.lines;
  const exposure = realExposure(lineValues, instruments, compositions);
  const costEUR = valuation.lines.reduce((s, l) => s + (l.costEUR ?? 0), 0);
  return {
    today,
    totalEUR: valuation.totalEUR,
    costEUR,
    gainEUR: valuation.totalEUR - costEUR,
    story,
    sentence: dailySentence(story, { today, instruments }),
    dayPct: story.change.pct ?? 0,
    series,
    twr,
    twrAnnual: twr !== null && series.length > 1 ? annualize(twr, daysBetween(series[0].date, today)) : null,
    lines,
    groups,
    life: lifeSlices(valuation.totalEUR, data.expectedReturn, data.expenses),
    exposure,
    breakdowns: {
      sector: breakdown(lineValues, instruments, compositions, "sector"),
      country: breakdown(lineValues, instruments, compositions, "country"),
      currency: breakdown(lineValues, instruments, compositions, "currency"),
    },
    overlaps: overlapPairs(
      open.map((p) => compositions[p.instrumentId]).filter((c): c is FundComposition => !!c && c.holdings.length > 0),
    ),
    fees: annualFees(lineValues, instruments, compositions),
    concentration: concentration(exposure, 0.05),
    earnings: realEarnings(lineValues, instruments, compositions),
    missingPrices: valuation.missingCount,
  };
}

/** Date locale du jour au format AAAA-MM-JJ. */
export function localToday(now = new Date()): string {
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export type Period = "1S" | "1M" | "1A" | "Tout";

const PERIOD_DAYS: Record<Exclude<Period, "Tout">, number> = { "1S": 7, "1M": 31, "1A": 365 };

/** Points de la courbe sur une période, réduits à `max` points pour rester fluides. */
export function periodSeries(series: SeriesPoint[], period: Period, today: string, max = 160): SeriesPoint[] {
  let points = series;
  if (period !== "Tout") {
    const from = new Date(Date.parse(today) - PERIOD_DAYS[period] * 86_400_000).toISOString().slice(0, 10);
    const start = series.findIndex((p) => p.date >= from);
    points = start < 0 ? [] : series.slice(Math.max(0, start - 1));
  }
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

/** Performance de la période, hors versements, en ratio. */
export function periodReturn(points: SeriesPoint[]): number | null {
  return timeWeightedReturn(points);
}

/** Conviction notée à l'achat, avec l'âge en jours. */
export interface Conviction {
  instrument: Instrument;
  date: string;
  note: string;
  ageDays: number;
  /** Variation du cours en euros depuis l'achat. */
  sincePct: number | null;
}

export function convictions(data: PortfolioData, today: string): Conviction[] {
  return data.transactions
    .filter((t) => t.side === "buy" && t.note)
    .map((t) => {
      const instrument = data.instruments[t.instrumentId];
      const now = closeAt(data.market.prices[t.instrumentId], today);
      const fxThen = t.fxRate ?? fxAt(data.market, instrument.currency, t.date);
      const fxNow = fxAt(data.market, instrument.currency, today);
      return {
        instrument,
        date: t.date,
        note: t.note as string,
        ageDays: daysBetween(t.date, today),
        sincePct: now && fxThen && fxNow ? now.close / fxNow / (t.price / fxThen) - 1 : null,
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}
