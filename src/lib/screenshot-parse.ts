/**
 * Lecture d'une capture d'écran de portefeuille (Trade Republic et apps semblables) après
 * reconnaissance de texte : chaque ligne devient un nom, une valeur en euros et, si elle
 * est affichée, la performance. L'utilisateur valide tout avant l'import.
 */

export interface ScreenshotLine {
  name: string;
  valueEUR: number;
  /** Performance affichée (ratio, 0,12 = +12 %), si elle figure sur la capture. */
  gainPct: number | null;
  /** Plus-value affichée en euros, si elle figure. */
  gainEUR: number | null;
}

const EURO = /([+−-]?\s?\d{1,3}(?:[ .  ]\d{3})*(?:,\d{1,2})?|[+−-]?\d+(?:[.,]\d{1,2})?)\s?€/g;
const PCT = /([+−-]\s?\d{1,3}(?:[.,]\d{1,2})?)\s?%/;

function toNumber(raw: string): number {
  const s = raw.replace(/[\s  ]/g, "").replace("−", "-");
  // « 1.234,56 » ou « 1 234,56 » : le point sépare les milliers quand une virgule suit.
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  return Number(normalized);
}

/** Mots qui ne sont jamais un nom de titre sur ces écrans. */
const NOISE = /^(portefeuille|portfolio|depot|dépôt|investissements?|actions?|etfs?|crypto|cash|espèces|especes|disponible|valeur|value|aujourd'?hui|today|depuis|since|total|rendement|performance|plan d'épargne|savings plan|\d+[jmyw]|max|\W*)$/i;

function cleanName(raw: string): string {
  return raw
    .replace(EURO, " ")
    .replace(PCT, " ")
    .replace(/[|•·>›»]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const hasLetters = (s: string) => (s.match(/[a-zA-ZÀ-ÿ]/g) ?? []).length >= 3;

export function parseScreenshotText(text: string): ScreenshotLine[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: ScreenshotLine[] = [];
  let pendingName: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const euros = [...line.matchAll(EURO)].map((m) => ({ value: toNumber(m[1]), signed: /^[+−-]/.test(m[1].trim()) }));
    const name = cleanName(line);
    const nameOk = hasLetters(name) && !NOISE.test(name);
    if (euros.length === 0) {
      if (nameOk) pendingName = name;
      continue;
    }
    // La valeur d'une ligne n'est jamais signée ; une somme signée est une plus-value.
    const value = euros.find((e) => !e.signed && e.value > 0);
    const gain = euros.find((e) => e.signed);
    const owner = nameOk ? name : pendingName;
    if (!value || !owner || !Number.isFinite(value.value)) {
      // Une plus-value seule sur sa ligne complète la ligne précédente.
      if (gain && out.length && out[out.length - 1].gainEUR === null) out[out.length - 1].gainEUR = gain.value;
      continue;
    }
    const pctMatch = line.match(PCT) ?? lines[i + 1]?.match(PCT) ?? null;
    out.push({
      name: owner,
      valueEUR: value.value,
      gainPct: pctMatch ? toNumber(pctMatch[1]) / 100 : null,
      gainEUR: gain ? gain.value : null,
    });
    pendingName = null;
  }
  // Les gros totaux (« Portefeuille 12 345 € ») ne sont pas des lignes : on retire une ligne égale à la somme des autres.
  const sum = out.reduce((s, l) => s + l.valueEUR, 0);
  return out.filter((l) => out.length < 3 || Math.abs(l.valueEUR - (sum - l.valueEUR)) > 1);
}

/** Total investi déduit de la performance affichée : valeur ÷ (1 + perf), ou valeur − plus-value. */
export function investedFrom(line: ScreenshotLine): number | null {
  if (line.gainEUR !== null) return line.valueEUR - line.gainEUR;
  if (line.gainPct !== null && line.gainPct > -1) return line.valueEUR / (1 + line.gainPct);
  return null;
}
