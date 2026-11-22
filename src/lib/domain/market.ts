import type { MarketData, PriceHistory, PricePoint } from "./types";

/**
 * Dernier cours connu à la date donnée (ou strictement avant si `strict`).
 * Un week-end renvoie donc la clôture du vendredi. `undefined` si rien n'est connu.
 */
export function closeAt(
  history: PriceHistory | undefined,
  date: string,
  strict = false,
): PricePoint | undefined {
  if (!history || history.length === 0) return undefined;
  let lo = 0;
  let hi = history.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const d = history[mid].date;
    if (d < date || (!strict && d === date)) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found >= 0 ? history[found] : undefined;
}

/** Unités de `currency` pour 1 euro à la date donnée. Toujours 1 pour l'euro. */
export function fxAt(
  market: MarketData,
  currency: string,
  date: string,
  strict = false,
): number | undefined {
  if (currency === "EUR") return 1;
  return closeAt(market.fx[currency], date, strict)?.close;
}

/** Toutes les dates de cotation connues entre deux bornes incluses, triées. */
export function tradingDates(market: MarketData, from: string, to: string): string[] {
  const dates = new Set<string>();
  for (const history of Object.values(market.prices)) {
    for (const point of history) {
      if (point.date >= from && point.date <= to) dates.add(point.date);
    }
  }
  return [...dates].sort();
}
