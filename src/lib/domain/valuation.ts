import { closeAt, fxAt } from "./market";
import type { Position } from "./positions";
import type { Instrument, MarketData, Transaction } from "./types";

export interface ValuedLine {
  instrumentId: string;
  quantity: number;
  price: number | null;
  /** Date du cours utilisé (peut être antérieure à la date demandée). */
  priceDate: string | null;
  valueEUR: number | null;
  costEUR: number | null;
  /** Plus-value latente. */
  gainEUR: number | null;
  /** Ce qui empêche de valoriser la ligne, le cas échéant. */
  missing: "price" | "fx" | null;
}

export interface Valuation {
  lines: ValuedLine[];
  /** Somme des lignes valorisables uniquement. */
  totalEUR: number;
  missingCount: number;
}

/** Valorise les positions en euros à une date. Une ligne sans cours reste à `null` et est comptée à part. */
export function valuePositions(
  positions: Position[],
  instruments: Record<string, Instrument>,
  market: MarketData,
  date: string,
): Valuation {
  let totalEUR = 0;
  let missingCount = 0;
  const lines = positions.map((p): ValuedLine => {
    const instrument = instruments[p.instrumentId];
    const point = closeAt(market.prices[p.instrumentId], date);
    const fx = instrument ? fxAt(market, instrument.currency, date) : undefined;
    const base = { instrumentId: p.instrumentId, quantity: p.quantity, costEUR: p.costEUR };
    if (!point || fx === undefined) {
      missingCount += 1;
      return {
        ...base,
        price: point?.close ?? null,
        priceDate: point?.date ?? null,
        valueEUR: null,
        gainEUR: null,
        missing: point ? "fx" : "price",
      };
    }
    const valueEUR = (p.quantity * point.close) / fx;
    totalEUR += valueEUR;
    return {
      ...base,
      price: point.close,
      priceDate: point.date,
      valueEUR,
      gainEUR: p.costEUR === null ? null : valueEUR - p.costEUR,
      missing: null,
    };
  });
  return { lines, totalEUR, missingCount };
}

export interface DayChangeLine {
  instrumentId: string;
  changeEUR: number | null;
  /** Part due au mouvement du cours, à change constant. */
  priceEffectEUR: number | null;
  /** Part due au mouvement de la devise de cotation face à l'euro. */
  fxEffectEUR: number | null;
  /** Valeur de la ligne à la clôture précédente. */
  previousEUR: number | null;
  pct: number | null;
  /** Dates des deux clôtures comparées. */
  date: string | null;
  previousDate: string | null;
}

export interface DayChange {
  lines: DayChangeLine[];
  changeEUR: number;
  priceEffectEUR: number;
  fxEffectEUR: number;
  /** Valeur de la veille des lignes prises en compte. */
  previousEUR: number;
  pct: number | null;
}

/**
 * Variation entre la dernière clôture et la précédente, décomposée en effet cours et effet devise :
 *   effet cours  = q × (P1 − P0) / F0
 *   effet devise = q × P1 × (1/F1 − 1/F0)
 * La somme des deux vaut exactement la variation en euros.
 *
 * Limite assumée : les titres achetés le jour même sont comptés comme détenus la veille.
 */
export function dayChange(
  positions: Position[],
  instruments: Record<string, Instrument>,
  market: MarketData,
  date: string,
): DayChange {
  let changeEUR = 0;
  let priceEffectEUR = 0;
  let fxEffectEUR = 0;
  let previousEUR = 0;
  const lines = positions.map((p): DayChangeLine => {
    const none = {
      instrumentId: p.instrumentId,
      changeEUR: null,
      priceEffectEUR: null,
      fxEffectEUR: null,
      previousEUR: null,
      pct: null,
      date: null,
      previousDate: null,
    };
    const instrument = instruments[p.instrumentId];
    const history = market.prices[p.instrumentId];
    const last = closeAt(history, date);
    const before = last ? closeAt(history, last.date, true) : undefined;
    if (!instrument || !last || !before) return none;
    const fxLast = fxAt(market, instrument.currency, last.date);
    const fxBefore = fxAt(market, instrument.currency, before.date);
    if (fxLast === undefined || fxBefore === undefined) return none;

    const priceEffect = (p.quantity * (last.close - before.close)) / fxBefore;
    const fxEffect = p.quantity * last.close * (1 / fxLast - 1 / fxBefore);
    const previous = (p.quantity * before.close) / fxBefore;
    changeEUR += priceEffect + fxEffect;
    priceEffectEUR += priceEffect;
    fxEffectEUR += fxEffect;
    previousEUR += previous;
    return {
      instrumentId: p.instrumentId,
      changeEUR: priceEffect + fxEffect,
      priceEffectEUR: priceEffect,
      fxEffectEUR: fxEffect,
      previousEUR: previous,
      pct: previous > 0 ? (priceEffect + fxEffect) / previous : null,
      date: last.date,
      previousDate: before.date,
    };
  });
  return {
    lines,
    changeEUR,
    priceEffectEUR,
    fxEffectEUR,
    previousEUR,
    pct: previousEUR > 0 ? changeEUR / previousEUR : null,
  };
}

export interface SeriesPoint {
  date: string;
  valueEUR: number;
  /** Argent net apporté jusqu'à cette date : achats (frais inclus) moins produits des ventes. */
  investedEUR: number;
  /** Vrai si une ligne a dû être valorisée à son dernier prix de transaction, faute de cours. */
  estimated: boolean;
}

/**
 * Valeur du portefeuille à chaque date demandée, en rejouant les transactions.
 * Faute de cours à une date, une ligne est tenue à son dernier prix de transaction
 * et le point est marqué `estimated`.
 */
export function valueSeries(
  transactions: Transaction[],
  instruments: Record<string, Instrument>,
  market: MarketData,
  dates: string[],
): SeriesPoint[] {
  const ordered = transactions
    .filter((t) => instruments[t.instrumentId])
    .map((t, index) => ({ t, index }))
    .sort((a, b) => (a.t.date < b.t.date ? -1 : a.t.date > b.t.date ? 1 : a.index - b.index))
    .map(({ t }) => t);
  const quantities = new Map<string, number>();
  const lastTradePrice = new Map<string, number>();
  let invested = 0;
  let investedEstimated = false;
  let cursor = 0;

  return [...dates].sort().map((date) => {
    while (cursor < ordered.length && ordered[cursor].date <= date) {
      const t = ordered[cursor++];
      const fx = t.fxRate ?? fxAt(market, instruments[t.instrumentId].currency, t.date);
      const held = quantities.get(t.instrumentId) ?? 0;
      const quantity = t.side === "buy" ? t.quantity : Math.min(t.quantity, held);
      quantities.set(t.instrumentId, t.side === "buy" ? held + quantity : held - quantity);
      lastTradePrice.set(t.instrumentId, t.price);
      if (fx === undefined) {
        investedEstimated = true;
      } else {
        const gross = (quantity * t.price) / fx;
        invested += t.side === "buy" ? gross + (t.fees ?? 0) : -(gross - (t.fees ?? 0));
      }
    }
    let valueEUR = 0;
    let estimated = investedEstimated;
    for (const [instrumentId, quantity] of quantities) {
      if (quantity <= 0) continue;
      const fx = fxAt(market, instruments[instrumentId].currency, date);
      const point = closeAt(market.prices[instrumentId], date);
      if (fx === undefined) {
        estimated = true;
        continue;
      }
      if (!point) estimated = true;
      valueEUR += (quantity * (point?.close ?? lastTradePrice.get(instrumentId) ?? 0)) / fx;
    }
    return { date, valueEUR, investedEUR: invested, estimated };
  });
}
