/**
 * Saisie en euros : l'utilisateur dit ce qu'il a payé ou possède, l'app retrouve le cours
 * et en déduit la transaction dans la devise du titre. Fonctions pures, testées.
 */

import { closeAt } from "@/lib/domain/market";
import type { PriceHistory, Transaction } from "@/lib/domain/types";

export interface Quotes {
  currency: string;
  points: PriceHistory;
  /** Unités de devise pour 1 euro ; vide pour un titre en euros. */
  fx: PriceHistory;
}

/** Cours et taux du dernier jour de cotation à la date (ou avant). */
export function quoteAt(q: Quotes, date: string): { date: string; close: number; fx: number; closeEUR: number } | null {
  const p = closeAt(q.points, date);
  if (!p) return null;
  const fx = q.currency === "EUR" ? 1 : closeAt(q.fx, p.date)?.close;
  if (!fx) return null;
  return { date: p.date, close: p.close, fx, closeEUR: p.close / fx };
}

interface Base {
  id: string;
  instrumentId: string;
  broker?: string;
  note?: string;
}

/**
 * Achat décrit par le montant payé en euros (frais compris). Sans nombre de parts connu,
 * il est déduit du cours de clôture du jour ; avec, le prix payé en est déduit.
 */
export function buyFromEuros(q: Quotes, input: Base & { date: string; paidEUR: number; feesEUR?: number; quantity?: number }): Transaction | null {
  const at = quoteAt(q, input.date);
  if (!at || input.paidEUR <= 0) return null;
  const fees = Math.max(0, input.feesEUR ?? 0);
  const investedEUR = input.paidEUR - fees;
  if (investedEUR <= 0) return null;
  const quantity = input.quantity && input.quantity > 0 ? input.quantity : investedEUR / at.closeEUR;
  return {
    id: input.id,
    instrumentId: input.instrumentId,
    side: "buy",
    date: input.date,
    quantity,
    price: (investedEUR * at.fx) / quantity,
    fees,
    fxRate: at.fx,
    ...(input.broker ? { broker: input.broker } : {}),
    ...(input.note ? { note: input.note } : {}),
  };
}

/** Vente de parts : au montant reçu s'il est donné, sinon au cours de clôture du jour. */
export function sellFromEuros(q: Quotes, input: Base & { date: string; quantity: number; receivedEUR?: number; feesEUR?: number }): Transaction | null {
  const at = quoteAt(q, input.date);
  if (!at || input.quantity <= 0) return null;
  const fees = Math.max(0, input.feesEUR ?? 0);
  const grossEUR = input.receivedEUR && input.receivedEUR > 0 ? input.receivedEUR + fees : input.quantity * at.closeEUR;
  return {
    id: input.id,
    instrumentId: input.instrumentId,
    side: "sell",
    date: input.date,
    quantity: input.quantity,
    price: (grossEUR * at.fx) / input.quantity,
    fees,
    fxRate: at.fx,
    ...(input.broker ? { broker: input.broker } : {}),
  };
}

/**
 * « Ce que je possède » : des parts (ou une valeur actuelle en euros) et, si on le sait,
 * ce que ça a coûté en tout. Sans coût connu, le prix de revient est le cours du jour choisi.
 */
export function holdingFromEuros(
  q: Quotes,
  input: Base & { date: string; today: string; quantity?: number; valueEUR?: number; investedEUR?: number },
): Transaction | null {
  const at = quoteAt(q, input.date);
  const now = quoteAt(q, input.today);
  if (!at || !now) return null;
  const quantity = input.quantity && input.quantity > 0 ? input.quantity : input.valueEUR && input.valueEUR > 0 ? input.valueEUR / now.closeEUR : 0;
  if (quantity <= 0) return null;
  const costEUR = input.investedEUR && input.investedEUR > 0 ? input.investedEUR : quantity * at.closeEUR;
  return {
    id: input.id,
    instrumentId: input.instrumentId,
    side: "buy",
    date: input.date,
    quantity,
    price: (costEUR * at.fx) / quantity,
    fees: 0,
    fxRate: at.fx,
    ...(input.broker ? { broker: input.broker } : {}),
    ...(input.note ? { note: input.note } : {}),
  };
}
