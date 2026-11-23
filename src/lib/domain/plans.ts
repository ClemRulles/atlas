import { fxAt } from "./market";
import type { Instrument, MarketData, PriceHistory, SavingsPlan, Transaction } from "./types";

/**
 * Transforme les plans d'épargne en achats datés : chaque mois, au premier jour de cotation
 * à partir du jour visé, le montant (moins les frais) achète des parts au cours de clôture.
 * Approximation assumée : le courtier exécute à un cours proche, pas forcément la clôture.
 */

/** Premier point de cotation à partir d'une date (le jour même ou les suivants), dans la limite de 7 jours. */
function firstSessionFrom(history: PriceHistory, date: string): { date: string; close: number } | undefined {
  const limit = new Date(Date.parse(date) + 7 * 86_400_000).toISOString().slice(0, 10);
  return history.find((p) => p.date >= date && p.date <= limit);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Mois visés par un plan jusqu'à aujourd'hui inclus : dates « AAAA-MM-JJ » au jour choisi. */
export function planDates(plan: SavingsPlan, today: string): string[] {
  const day = Math.min(28, Math.max(1, Math.round(plan.dayOfMonth)));
  let y = Number(plan.start.slice(0, 4));
  let m = Number(plan.start.slice(5, 7));
  const out: string[] = [];
  const endMonth = plan.end ? plan.end.slice(0, 7) : null;
  for (let guard = 0; guard < 600; guard++) {
    const date = `${y}-${pad(m)}-${pad(day)}`;
    if (date > today || (endMonth && date.slice(0, 7) > endMonth)) break;
    if (date >= plan.start.slice(0, 8) + "01") out.push(date);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export interface PlanExpansion {
  transactions: Transaction[];
  /** Exécutions sans cours connu (données pas encore chargées ou titre non coté ce jour-là). */
  pending: number;
}

export function expandPlan(plan: SavingsPlan, instrument: Instrument | undefined, market: MarketData, today: string): PlanExpansion {
  if (!instrument) return { transactions: [], pending: 0 };
  const history = market.prices[instrument.id] ?? [];
  const transactions: Transaction[] = [];
  let pending = 0;
  for (const target of planDates(plan, today)) {
    const session = firstSessionFrom(history, target);
    const fx = session ? fxAt(market, instrument.currency, session.date) : undefined;
    if (!session || fx === undefined) {
      pending++;
      continue;
    }
    const fees = plan.fees ?? 0;
    const investedEUR = Math.max(0, plan.amountEUR - fees);
    transactions.push({
      id: `plan:${plan.id}:${target.slice(0, 7)}`,
      instrumentId: instrument.id,
      side: "buy",
      date: session.date,
      quantity: (investedEUR * fx) / session.close,
      price: session.close,
      fees,
      fxRate: fx,
      ...(plan.broker ? { broker: plan.broker } : {}),
    });
  }
  return { transactions, pending };
}

/** Toutes les transactions : celles saisies et celles produites par les plans d'épargne. */
export function withPlans(
  transactions: Transaction[],
  plans: SavingsPlan[],
  instruments: Record<string, Instrument>,
  market: MarketData,
  today: string,
): { transactions: Transaction[]; pending: number } {
  let pending = 0;
  const generated = plans.flatMap((p) => {
    const e = expandPlan(p, instruments[p.instrumentId], market, today);
    pending += e.pending;
    return e.transactions;
  });
  return { transactions: [...transactions, ...generated], pending };
}

/** Total versé par un plan jusqu'à aujourd'hui (selon le calendrier, cours connus ou non). */
export function planTotalEUR(plan: SavingsPlan, today: string): number {
  return planDates(plan, today).length * plan.amountEUR;
}
