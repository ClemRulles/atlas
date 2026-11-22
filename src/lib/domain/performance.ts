import { fxAt } from "./market";
import type { Instrument, MarketData, Transaction } from "./types";
import type { SeriesPoint } from "./valuation";

const DAY_MS = 86_400_000;

/**
 * Performance pondérée par le temps : ce qu'ont fait les placements, indépendamment
 * du moment et du montant des versements. Les apports sont supposés arriver en fin de journée.
 * Renvoie un ratio (0,21 = +21 %) ou `null` si la série ne permet pas le calcul.
 */
export function timeWeightedReturn(series: SeriesPoint[]): number | null {
  let growth = 1;
  let started = false;
  for (let i = 1; i < series.length; i++) {
    const previous = series[i - 1];
    const current = series[i];
    if (previous.valueEUR <= 0) continue;
    const flow = current.investedEUR - previous.investedEUR;
    growth *= (current.valueEUR - flow) / previous.valueEUR;
    started = true;
  }
  return started ? growth - 1 : null;
}

/** Ramène une performance totale à un rythme annuel. */
export function annualize(totalReturn: number, days: number): number | null {
  if (days <= 0 || totalReturn <= -1) return null;
  return (1 + totalReturn) ** (365 / days) - 1;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

export interface CashFlow {
  date: string;
  /** Négatif quand l'investisseur verse, positif quand il reçoit. */
  amountEUR: number;
}

/** Flux de trésorerie en euros des transactions (achats négatifs, ventes positives). */
export function cashFlows(
  transactions: Transaction[],
  instruments: Record<string, Instrument>,
  market: MarketData,
): CashFlow[] {
  const flows: CashFlow[] = [];
  for (const t of transactions) {
    const instrument = instruments[t.instrumentId];
    if (!instrument) continue;
    const fx = t.fxRate ?? fxAt(market, instrument.currency, t.date);
    if (fx === undefined) continue;
    const gross = (t.quantity * t.price) / fx;
    const fees = t.fees ?? 0;
    flows.push({ date: t.date, amountEUR: t.side === "buy" ? -(gross + fees) : gross - fees });
  }
  return flows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Taux de rendement interne annualisé (pondéré par l'argent) d'une suite de flux datés.
 * La valeur finale du portefeuille doit figurer comme dernier flux positif.
 * Résolu par dichotomie ; `null` si les flux ne changent pas de signe.
 */
export function xirr(flows: CashFlow[]): number | null {
  if (flows.length < 2) return null;
  const start = Math.min(...flows.map((f) => Date.parse(f.date)));
  const npv = (rate: number) =>
    flows.reduce(
      (sum, f) => sum + f.amountEUR / (1 + rate) ** ((Date.parse(f.date) - start) / (365 * DAY_MS)),
      0,
    );
  let lo = -0.9999;
  let hi = 100;
  let npvLo = npv(lo);
  const npvHi = npv(hi);
  if (!Number.isFinite(npvLo) || !Number.isFinite(npvHi) || npvLo * npvHi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const npvMid = npv(mid);
    if (Math.abs(npvMid) < 1e-9 || hi - lo < 1e-12) return mid;
    if (npvLo * npvMid <= 0) {
      hi = mid;
    } else {
      lo = mid;
      npvLo = npvMid;
    }
  }
  return (lo + hi) / 2;
}
