import type { Expense } from "./types";

/**
 * « Morceaux de vie » : le rendement annuel attendu du patrimoine, converti en dépenses
 * mensuelles couvertes. Les dépenses sont couvertes dans l'ordre fourni.
 * Le rendement attendu est une hypothèse choisie par l'utilisateur, pas une prévision.
 */

export interface LifeSlice {
  expense: Expense;
  /** Part de cette dépense payée par le rendement attendu, en euros par mois. */
  coveredMonthly: number;
  /** Entre 0 et 1. */
  ratio: number;
  /** Patrimoine à partir duquel cette dépense (et les précédentes) est entièrement couverte. `null` si le rendement attendu est nul. */
  capitalNeededEUR: number | null;
}

export interface LifeSlices {
  monthlyIncomeEUR: number;
  slices: LifeSlice[];
  coveredCount: number;
  /** La première dépense pas encore entièrement couverte. `null` si tout l'est. */
  next: { expense: Expense; capitalNeededEUR: number | null; missingEUR: number | null } | null;
}

export function lifeSlices(valueEUR: number, expectedReturn: number, expenses: Expense[]): LifeSlices {
  const rate = Math.max(0, expectedReturn);
  const monthlyIncomeEUR = (Math.max(0, valueEUR) * rate) / 12;
  let remaining = monthlyIncomeEUR;
  let cumulative = 0;
  const slices = expenses
    .filter((e) => e.monthly > 0)
    .map((expense): LifeSlice => {
      const coveredMonthly = Math.min(remaining, expense.monthly);
      remaining -= coveredMonthly;
      cumulative += expense.monthly;
      return {
        expense,
        coveredMonthly,
        ratio: coveredMonthly / expense.monthly,
        capitalNeededEUR: rate > 0 ? (cumulative * 12) / rate : null,
      };
    });
  const pending = slices.find((s) => s.ratio < 1 - 1e-9);
  return {
    monthlyIncomeEUR,
    slices,
    coveredCount: slices.filter((s) => s.ratio >= 1 - 1e-9).length,
    next: pending
      ? {
          expense: pending.expense,
          capitalNeededEUR: pending.capitalNeededEUR,
          missingEUR: pending.capitalNeededEUR === null ? null : pending.capitalNeededEUR - valueEUR,
        }
      : null,
  };
}
