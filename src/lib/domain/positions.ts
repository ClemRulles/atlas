import { fxAt } from "./market";
import type { Instrument, MarketData, Transaction } from "./types";

export interface Position {
  instrumentId: string;
  quantity: number;
  /** Prix de revient des titres encore détenus, frais d'achat inclus. `null` si un taux de change manque. */
  costEUR: number | null;
  /** Prix moyen d'achat dans la devise de cotation. */
  avgPrice: number;
  /** Plus-values déjà encaissées sur les ventes. `null` si un taux de change manque. */
  realizedEUR: number | null;
  firstBuy: string | null;
}

export interface PositionIssue {
  transactionId: string;
  kind: "unknown-instrument" | "missing-fx" | "oversell";
}

export interface PositionsResult {
  /** Toutes les lignes, y compris celles entièrement vendues (quantité 0). */
  positions: Position[];
  issues: PositionIssue[];
}

const EPSILON = 1e-9;

interface Running {
  quantity: number;
  costEUR: number;
  costCurrency: number;
  realizedEUR: number;
  costKnown: boolean;
  realizedKnown: boolean;
  firstBuy: string | null;
}

/**
 * Reconstruit les positions à partir des transactions, au prix de revient moyen pondéré.
 * Une vente retire sa part proportionnelle du prix de revient ; l'écart avec le produit
 * de la vente devient une plus-value réalisée.
 */
export function buildPositions(
  transactions: Transaction[],
  instruments: Record<string, Instrument>,
  market: MarketData,
  upTo?: string,
): PositionsResult {
  const ordered = transactions
    .filter((t) => !upTo || t.date <= upTo)
    .map((t, index) => ({ t, index }))
    .sort((a, b) => (a.t.date < b.t.date ? -1 : a.t.date > b.t.date ? 1 : a.index - b.index));

  const running = new Map<string, Running>();
  const issues: PositionIssue[] = [];

  for (const { t } of ordered) {
    const instrument = instruments[t.instrumentId];
    if (!instrument) {
      issues.push({ transactionId: t.id, kind: "unknown-instrument" });
      continue;
    }
    let p = running.get(t.instrumentId);
    if (!p) {
      p = {
        quantity: 0,
        costEUR: 0,
        costCurrency: 0,
        realizedEUR: 0,
        costKnown: true,
        realizedKnown: true,
        firstBuy: null,
      };
      running.set(t.instrumentId, p);
    }
    const fx = t.fxRate ?? fxAt(market, instrument.currency, t.date);
    const gross = t.quantity * t.price;
    const fees = t.fees ?? 0;

    if (t.side === "buy") {
      p.quantity += t.quantity;
      p.costCurrency += gross;
      p.firstBuy ??= t.date;
      if (fx === undefined) {
        p.costKnown = false;
        issues.push({ transactionId: t.id, kind: "missing-fx" });
      } else {
        p.costEUR += gross / fx + fees;
      }
      continue;
    }

    let sold = t.quantity;
    if (sold > p.quantity + EPSILON) {
      issues.push({ transactionId: t.id, kind: "oversell" });
      sold = p.quantity;
    }
    if (p.quantity <= EPSILON) continue;
    const share = sold / p.quantity;
    const costOut = p.costEUR * share;
    if (fx === undefined) {
      p.realizedKnown = false;
      issues.push({ transactionId: t.id, kind: "missing-fx" });
    } else {
      p.realizedEUR += (sold * t.price) / fx - fees - costOut;
    }
    p.costEUR -= costOut;
    p.costCurrency -= p.costCurrency * share;
    p.quantity -= sold;
    if (p.quantity < EPSILON) {
      p.quantity = 0;
      p.costEUR = 0;
      p.costCurrency = 0;
    }
  }

  const positions: Position[] = [...running.entries()].map(([instrumentId, p]) => ({
    instrumentId,
    quantity: p.quantity,
    costEUR: p.costKnown ? p.costEUR : null,
    avgPrice: p.quantity > 0 ? p.costCurrency / p.quantity : 0,
    realizedEUR: p.realizedKnown ? p.realizedEUR : null,
    firstBuy: p.firstBuy,
  }));
  return { positions, issues };
}

/** Les lignes encore détenues. */
export function openPositions(positions: Position[]): Position[] {
  return positions.filter((p) => p.quantity > 0);
}
