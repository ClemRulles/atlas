/** Mise en forme des montants et des pourcentages, à la belge francophone : « 184 320,45 € », « +0,12 % ». */

const NARROW = " "; // espace fine insécable entre les milliers
const NBSP = " "; // espace insécable avant € et %
const MINUS = "−";

export interface FormatOptions {
  decimals?: number;
  /** Affiche « + » devant les valeurs positives. */
  sign?: boolean;
}

export function formatNumber(value: number, { decimals = 0, sign = false }: FormatOptions = {}): string {
  const rounded = Number(Math.abs(value).toFixed(decimals));
  const body = new Intl.NumberFormat("fr-BE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
    .format(rounded)
    .replace(/\s/g, NARROW);
  if (rounded === 0) return body;
  return (value < 0 ? MINUS : sign ? "+" : "") + body;
}

export function formatEUR(value: number, options: FormatOptions = {}): string {
  return `${formatNumber(value, options)}${NBSP}€`;
}

/** `ratio` est un ratio : 0,0012 donne « 0,12 % ». */
export function formatPct(ratio: number, { decimals = 2, sign = false }: FormatOptions = {}): string {
  return `${formatNumber(ratio * 100, { decimals, sign })}${NBSP}%`;
}
