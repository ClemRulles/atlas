/** Petits utilitaires d'interface. */

/** Vibration légère. Android seulement : iOS ne l'autorise pas aux apps web, le retour y reste visuel. */
export function haptic(ms = 8) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* sans effet */
  }
}

type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const toHex = (c: RGB) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
const mix = (a: string, b: string, t: number) => {
  const [x, y] = [hex(a), hex(b)];
  return toHex(x.map((v, i) => v + (y[i] - v) * t) as RGB);
};

const CALME = ["#5b6bff", "#9a6bff", "#2b8cff", "#9aa0ff"];
const HAUSSE = ["#19e6a6", "#2bb5ff", "#7a5cff", "#4de5b2"];
const BAISSE = ["#ff5e7a", "#ff9a5c", "#a04cff", "#ff7a6b"];

/**
 * Teintes de l'aurore pour une variation du jour (ratio). La teinte glisse en continu
 * de la baisse au calme puis à la hausse, saturée à ±2 %.
 */
export function auroraFor(dayPct: number): { a1: string; a2: string; a3: string; mood: string } {
  const t = Math.max(-1, Math.min(1, dayPct / 0.02));
  const eased = Math.sign(t) * Math.sqrt(Math.abs(t));
  const target = eased >= 0 ? HAUSSE : BAISSE;
  const [a1, a2, a3, mood] = CALME.map((c, i) => mix(c, target[i], Math.abs(eased)));
  return { a1, a2, a3, mood };
}

export const SERIES_COLORS = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)", "var(--s7)", "var(--s8)"];
