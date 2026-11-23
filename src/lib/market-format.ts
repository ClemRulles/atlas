/**
 * Mise en forme des données de marché brutes, partagée entre le serveur et les tests.
 * Aucune dépendance réseau ici.
 */

import type { AssetType, PricePoint } from "@/lib/domain/types";

/** Certaines places cotent en centimes : on ramène tout à l'unité de la devise. */
const MINOR_UNITS: Record<string, { currency: string; divisor: number }> = {
  GBp: { currency: "GBP", divisor: 100 },
  GBX: { currency: "GBP", divisor: 100 },
  ZAc: { currency: "ZAR", divisor: 100 },
  ILA: { currency: "ILS", divisor: 100 },
};

export function normalizeCurrency(currency: string | undefined): { currency: string | null; divisor: number } {
  if (!currency) return { currency: null, divisor: 1 };
  const minor = MINOR_UNITS[currency];
  return minor ?? { currency: currency.toUpperCase(), divisor: 1 };
}

/** Date calendaire (AAAA-MM-JJ) d'un instant, à l'heure de la place de cotation. */
export function exchangeDate(instant: Date, timeZone = "UTC"): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
  } catch {
    return instant.toISOString().slice(0, 10);
  }
}

export interface RawQuote {
  date: Date;
  close: number | null;
}

/** Clôtures propres : une par jour, triées, sans trou ni valeur nulle, en unité de devise. */
export function cleanCloses(quotes: RawQuote[], timeZone: string, divisor = 1): PricePoint[] {
  const byDate = new Map<string, number>();
  for (const q of quotes) {
    if (q.close === null || !Number.isFinite(q.close) || q.close <= 0) continue;
    byDate.set(exchangeDate(q.date, timeZone), q.close / divisor);
  }
  return [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([date, close]) => ({ date, close: Number(close.toPrecision(10)) }));
}

export function assetTypeOf(quoteType: string | undefined): AssetType | null {
  switch (quoteType) {
    case "EQUITY":
      return "stock";
    case "ETF":
      return "etf";
    case "MUTUALFUND":
      return "fund";
    default:
      return null;
  }
}

export const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

/** Vérifie la clé de contrôle d'un ISIN (algorithme de Luhn sur les chiffres). */
export function isValidIsin(value: string): boolean {
  const isin = value.trim().toUpperCase();
  if (!ISIN_PATTERN.test(isin)) return false;
  const digits = [...isin].map((c) => (/[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c)).join("");
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** Symbole accepté par nos routes : lettres, chiffres et quelques signes de Yahoo. */
export const SYMBOL_PATTERN = /^[A-Za-z0-9.\-=^]{1,24}$/;

/** Places préférées d'un investisseur belge, pour ordonner les cotations d'un même produit. */
const EXCHANGE_RANK: Record<string, number> = {
  BRU: 0, AMS: 1, PAR: 2, GER: 3, ETR: 3, FRA: 5, MIL: 4, LSE: 6, EBS: 7, NMS: 8, NYQ: 8, NGM: 8, NCM: 8, PCX: 9,
};
export function exchangeRank(code: string | undefined): number {
  return code === undefined ? 99 : (EXCHANGE_RANK[code] ?? 20);
}

const SECTORS: Record<string, string> = {
  Technology: "Technologie",
  "Financial Services": "Finance",
  Healthcare: "Santé",
  Industrials: "Industrie",
  "Consumer Cyclical": "Consommation discrétionnaire",
  "Consumer Defensive": "Consommation de base",
  "Communication Services": "Communication",
  Energy: "Énergie",
  "Basic Materials": "Matériaux",
  Utilities: "Services publics",
  "Real Estate": "Immobilier",
};
export const sectorFr = (s: string | undefined) => (s ? (SECTORS[s] ?? s) : undefined);

const COUNTRIES: Record<string, string> = {
  "United States": "États-Unis",
  Canada: "Canada",
  Brazil: "Brésil",
  Mexico: "Mexique",
  "United Kingdom": "Royaume-Uni",
  France: "France",
  Germany: "Allemagne",
  Netherlands: "Pays-Bas",
  Belgium: "Belgique",
  Switzerland: "Suisse",
  Denmark: "Danemark",
  Sweden: "Suède",
  Norway: "Norvège",
  Finland: "Finlande",
  Spain: "Espagne",
  Italy: "Italie",
  Ireland: "Irlande",
  Luxembourg: "Luxembourg",
  Japan: "Japon",
  China: "Chine",
  "Hong Kong": "Hong Kong",
  Taiwan: "Taïwan",
  "South Korea": "Corée du Sud",
  India: "Inde",
  Australia: "Australie",
  Singapore: "Singapour",
  Israel: "Israël",
  "Saudi Arabia": "Arabie saoudite",
  "South Africa": "Afrique du Sud",
  Austria: "Autriche",
  Portugal: "Portugal",
  Poland: "Pologne",
  Indonesia: "Indonésie",
  Thailand: "Thaïlande",
  Malaysia: "Malaisie",
  Philippines: "Philippines",
  "New Zealand": "Nouvelle-Zélande",
  Chile: "Chili",
  Turkey: "Turquie",
  "United Arab Emirates": "Émirats arabes unis",
  Qatar: "Qatar",
  Kuwait: "Koweït",
  Greece: "Grèce",
  Hungary: "Hongrie",
  "Czech Republic": "République tchèque",
  Bermuda: "Bermudes",
  Jersey: "Jersey",
  Uruguay: "Uruguay",
  Argentina: "Argentine",
  Peru: "Pérou",
  Colombia: "Colombie",
  Korea: "Corée du Sud",
  "Republic of Korea": "Corée du Sud",
  USA: "États-Unis",
  US: "États-Unis",
  UK: "Royaume-Uni",
};
export const countryFr = (c: string | undefined) => (c ? (COUNTRIES[c] ?? c) : undefined);

/**
 * Nom lisible d'un produit : sans le jargon réglementaire ni la classe de parts.
 * « iShares Core MSCI World UCITS ETF USD (Acc) » → « iShares Core MSCI World ».
 */
export function displayName(name: string): string {
  const cleaned = name
    .replace(/\((acc|dist|inc)\.?\)/gi, " ")
    .replace(/\bUCITS\b/gi, " ")
    .replace(/\bETFs?\b/g, " ")
    .replace(/\b(accumulating|accumulation|distributing|distribution|acc|dist|inc)\b\.?/gi, " ")
    .replace(/\s+-\s*$/, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(\s(USD|EUR|GBP|CHF|JPY))+$/i, "")
    .trim();
  return cleaned.length >= 3 ? cleaned : name.trim();
}
