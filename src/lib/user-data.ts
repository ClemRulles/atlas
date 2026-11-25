import { isPalette, isTheme, type PaletteId, type ThemeChoice } from "./appearance";
/**
 * Données de l'utilisateur : ce qu'il saisit (positions, dépenses) et le cache des cours.
 * Fonctions pures : la persistance est dans db.ts, le réseau dans market-client.ts.
 */

import type { CompanyQuotes } from "@/lib/domain/contributors";
import type { Compositions, Expense, FundComposition, Instrument, MarketData, PricePoint, SavingsPlan, Transaction } from "@/lib/domain/types";
import { displayName } from "@/lib/market-format";

export interface UserPortfolio {
  instruments: Record<string, Instrument>;
  transactions: Transaction[];
  /** Plans d'épargne : leurs achats sont recalculés à partir des cours, jamais stockés. */
  plans?: SavingsPlan[];
  /** Identifiants supprimés volontairement (transactions et plans), pour que la fusion entre appareils ne les ressuscite pas. */
  deleted?: string[];
}

export interface Settings {
  expenses: Expense[];
  /** Hypothèse de rendement annuel pour les « morceaux de vie » (ratio). */
  expectedReturn: number;
  /** Thème choisi (sombre par défaut). */
  theme?: ThemeChoice;
  /** Palette de l'aurore (« vivante » par défaut : elle suit la journée). */
  palette?: PaletteId;
}

export interface CachedSeries {
  /** Première date demandée : l'historique couvre au moins depuis cette date. */
  from: string;
  fetchedAt: number;
  currency: string | null;
  points: PricePoint[];
}

export type MarketCache = Record<string, CachedSeries>;

export const EMPTY_PORTFOLIO: UserPortfolio = { instruments: {}, transactions: [], plans: [] };

export const DEFAULT_SETTINGS: Settings = {
  expenses: [
    { id: "abonnements", label: "Abonnements", monthly: 64 },
    { id: "courses", label: "Courses", monthly: 420 },
    { id: "loyer", label: "Loyer", monthly: 950 },
  ],
  expectedReturn: 0.05,
};

/** Clé de cache d'un taux de change : Yahoo donne EURUSD=X en dollars pour 1 euro, notre convention. */
export const fxKey = (currency: string) => `EUR${currency}=X`;

export interface SeriesNeed {
  key: string;
  from: string;
}

/** Quelques jours de marge avant le premier achat, pour avoir une clôture de veille. */
function minusDays(date: string, days: number): string {
  return new Date(Date.parse(date) - days * 86_400_000).toISOString().slice(0, 10);
}

/** Séries de cours à charger : chaque ligne et chaque devise étrangère, depuis le premier achat. */
export function seriesNeeded(portfolio: UserPortfolio, today: string): SeriesNeed[] {
  const first = new Map<string, string>();
  for (const t of [...portfolio.transactions, ...(portfolio.plans ?? []).map((p) => ({ instrumentId: p.instrumentId, date: p.start }))]) {
    const current = first.get(t.instrumentId);
    if (!current || t.date < current) first.set(t.instrumentId, t.date);
  }
  const needs = new Map<string, string>();
  const want = (key: string, from: string) => {
    const current = needs.get(key);
    if (!current || from < current) needs.set(key, from);
  };
  for (const [id, date] of first) {
    const instrument = portfolio.instruments[id];
    if (!instrument) continue;
    // Au moins 45 jours d'historique, pour les mini-courbes et la variation du jour.
    const from = minusDays(date < minusDays(today, 45) ? date : minusDays(today, 45), 7);
    want(instrument.symbol, from);
    if (instrument.currency !== "EUR") want(fxKey(instrument.currency), from);
  }
  return [...needs.entries()].map(([key, from]) => ({ key, from }));
}

/** Séries à (re)charger : absentes, trop courtes, ou plus vieilles que `maxAgeMs`. */
export function staleSeries(needs: SeriesNeed[], cache: MarketCache, now: number, maxAgeMs: number): SeriesNeed[] {
  return needs.filter((n) => {
    const c = cache[n.key];
    return !c || c.from > n.from || now - c.fetchedAt > maxAgeMs;
  });
}

/** Assemble le cache en données de marché, au format du moteur de calcul. */
export function marketFrom(portfolio: UserPortfolio, cache: MarketCache): MarketData {
  const prices: MarketData["prices"] = {};
  const fx: MarketData["fx"] = {};
  for (const instrument of Object.values(portfolio.instruments)) {
    const series = cache[instrument.symbol];
    if (series) prices[instrument.id] = series.points;
    if (instrument.currency !== "EUR") {
      const rate = cache[fxKey(instrument.currency)];
      if (rate) fx[instrument.currency] = rate.points;
    }
  }
  return { prices, fx };
}

/** Plus ancienne mise à jour parmi les séries utiles (ce que l'app affiche comme fraîcheur). */
export function oldestFetch(needs: SeriesNeed[], cache: MarketCache): number | null {
  const times = needs.map((n) => cache[n.key]?.fetchedAt).filter((t): t is number => t !== undefined);
  return times.length ? Math.min(...times) : null;
}

/* ——— Export et import ——— */

export interface Backup {
  app: "atlas";
  version: 1;
  exportedAt: string;
  portfolio: UserPortfolio;
  settings: Settings;
}

export function makeBackup(portfolio: UserPortfolio, settings: Settings, now = new Date()): Backup {
  return { app: "atlas", version: 1, exportedAt: now.toISOString(), portfolio, settings };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const positive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/** Lit une sauvegarde. Renvoie une erreur lisible plutôt que d'importer des données douteuses. */
export function readBackup(raw: unknown): { ok: true; backup: Backup } | { ok: false; error: string } {
  if (!isObject(raw) || raw.app !== "atlas") return { ok: false, error: "Ce fichier n'est pas une sauvegarde Atlas." };
  if (raw.version !== 1) return { ok: false, error: "Cette sauvegarde vient d'une version d'Atlas que cette app ne connaît pas." };
  const portfolio = raw.portfolio;
  if (!isObject(portfolio) || !isObject(portfolio.instruments) || !Array.isArray(portfolio.transactions)) {
    return { ok: false, error: "La sauvegarde est incomplète : positions introuvables." };
  }
  for (const [id, i] of Object.entries(portfolio.instruments)) {
    if (!isObject(i) || i.id !== id || typeof i.symbol !== "string" || typeof i.name !== "string" || typeof i.currency !== "string" || !["stock", "etf", "fund"].includes(i.type as string)) {
      return { ok: false, error: `Ligne illisible dans la sauvegarde : ${id}.` };
    }
  }
  for (const t of portfolio.transactions) {
    if (
      !isObject(t) ||
      typeof t.id !== "string" ||
      typeof t.instrumentId !== "string" ||
      !(t.instrumentId in portfolio.instruments) ||
      (t.side !== "buy" && t.side !== "sell") ||
      typeof t.date !== "string" ||
      !DATE.test(t.date) ||
      !positive(t.quantity) ||
      !positive(t.price)
    ) {
      return { ok: false, error: "Une transaction de la sauvegarde est illisible." };
    }
  }
  const plans = Array.isArray(portfolio.plans) ? portfolio.plans : [];
  for (const p of plans) {
    if (!isObject(p) || typeof p.id !== "string" || typeof p.instrumentId !== "string" || !(p.instrumentId in portfolio.instruments) || !positive(p.amountEUR) || typeof p.start !== "string" || !DATE.test(p.start) || typeof p.dayOfMonth !== "number") {
      return { ok: false, error: "Un plan d'épargne de la sauvegarde est illisible." };
    }
  }
  const settings = isObject(raw.settings) ? raw.settings : {};
  const expenses = Array.isArray(settings.expenses)
    ? settings.expenses.filter((e): e is Expense => isObject(e) && typeof e.id === "string" && typeof e.label === "string" && typeof e.monthly === "number" && e.monthly >= 0)
    : DEFAULT_SETTINGS.expenses;
  const expectedReturn = typeof settings.expectedReturn === "number" && settings.expectedReturn >= 0 && settings.expectedReturn <= 0.2 ? settings.expectedReturn : DEFAULT_SETTINGS.expectedReturn;
  return {
    ok: true,
    backup: {
      app: "atlas",
      version: 1,
      exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : new Date(0).toISOString(),
      portfolio: { ...(portfolio as unknown as UserPortfolio), plans: plans as unknown as SavingsPlan[] },
      settings: { expenses, expectedReturn, ...(isTheme(settings.theme) ? { theme: settings.theme } : {}), ...(isPalette(settings.palette) ? { palette: settings.palette } : {}) },
    },
  };
}

/** Identifiant aléatoire court pour une transaction. */
export function newId(prefix = "t"): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

/* ——— Création d'une ligne à partir des réponses du serveur ——— */

interface ListingInfo {
  symbol: string;
  name: string;
  type: Instrument["type"];
  exchange?: string;
  isin?: string;
}
interface ProfileInfo {
  sector?: string;
  country?: string;
  earningsYield?: number;
  dividendYield?: number;
  expenseRatio?: number;
}

/**
 * Une ligne Atlas : identifiée par sa cotation (le même ISIN peut coter en euros à Amsterdam
 * et en dollars à Londres), avec ce que le profil Yahoo nous apprend. Rien n'est complété au hasard.
 */
export function instrumentFrom(listing: ListingInfo, currency: string, profile: ProfileInfo = {}): Instrument {
  const base: Instrument = {
    id: listing.symbol,
    symbol: listing.symbol,
    name: displayName(listing.name),
    type: listing.type,
    currency,
    ...(listing.isin ? { isin: listing.isin } : {}),
    ...(listing.exchange ? { exchange: listing.exchange } : {}),
  };
  if (listing.type === "stock") {
    return {
      ...base,
      ...(profile.sector ? { sector: profile.sector } : {}),
      ...(profile.country ? { country: profile.country } : {}),
      ...(profile.earningsYield !== undefined ? { earningsYield: profile.earningsYield } : {}),
      ...(profile.dividendYield !== undefined ? { dividendYield: profile.dividendYield } : {}),
    };
  }
  return { ...base, ...(profile.expenseRatio !== undefined ? { expenseRatio: profile.expenseRatio } : {}) };
}

/** Quantité détenue d'une ligne à une date (pour vérifier une vente). */
export function heldQuantity(transactions: Transaction[], instrumentId: string, upTo: string): number {
  return transactions
    .filter((t) => t.instrumentId === instrumentId && t.date <= upTo)
    .reduce((q, t) => q + (t.side === "buy" ? t.quantity : -t.quantity), 0);
}

/* ——— Compositions des fonds et cours des entreprises qu'ils contiennent ——— */

export interface CachedComposition {
  fetchedAt: number;
  composition: FundComposition | null;
}
export type CompositionCache = Record<string, CachedComposition>;

/** Une composition change peu : une fois par semaine suffit. Une absence est retentée chaque jour. */
const COMPOSITION_MAX_AGE = 7 * 24 * 3600_000;
const MISSING_RETRY = 24 * 3600_000;

export function compositionsNeeded(portfolio: UserPortfolio, cache: CompositionCache, now: number): Instrument[] {
  return Object.values(portfolio.instruments).filter((i) => {
    if (i.type === "stock") return false;
    const c = cache[i.id];
    if (!c) return true;
    return now - c.fetchedAt > (c.composition ? COMPOSITION_MAX_AGE : MISSING_RETRY);
  });
}

export function compositionsFrom(cache: CompositionCache): Compositions {
  return Object.fromEntries(Object.entries(cache).map(([id, c]) => [id, c.composition ?? undefined]));
}

interface CompanyLike {
  key: string;
  symbol?: string;
  direct: boolean;
}

/** Les grandes entreprises tenues via des fonds dont on veut le cours (pour raconter la journée). */
export function companiesToQuote(companies: CompanyLike[], limit = 12): { key: string; symbol: string }[] {
  return companies
    .filter((c) => !c.direct && c.symbol)
    .slice(0, limit)
    .map((c) => ({ key: c.key, symbol: c.symbol as string }));
}

/** Cours d'entreprises au format du moteur, à partir du cache des séries. */
export function companyQuotesFrom(targets: { key: string; symbol: string }[], cache: MarketCache): CompanyQuotes {
  const out: CompanyQuotes = {};
  for (const t of targets) {
    const series = cache[t.symbol];
    if (series?.currency) out[t.key] = { currency: series.currency, points: series.points };
  }
  return out;
}

/** Ajoute aux données de marché les taux des devises des entreprises citées. */
export function withCompanyFx(market: MarketData, quotes: CompanyQuotes, cache: MarketCache): MarketData {
  const fx = { ...market.fx };
  for (const q of Object.values(quotes)) {
    if (!q || q.currency === "EUR" || fx[q.currency]) continue;
    const rate = cache[fxKey(q.currency)];
    if (rate) fx[q.currency] = rate.points;
  }
  return { ...market, fx };
}


/* ——— Fusion entre appareils ——— */

/**
 * Réunit deux versions d'un portefeuille (cet appareil et le compte) sans rien perdre :
 * transactions et plans sont réunis par identifiant, les suppressions volontaires sont respectées,
 * et pour un même identifiant la version de `preferred` gagne (modification la plus récente).
 */
export function mergePortfolios(preferred: UserPortfolio, other: UserPortfolio): UserPortfolio {
  const deleted = [...new Set([...(preferred.deleted ?? []), ...(other.deleted ?? [])])];
  const gone = new Set(deleted);
  const byId = <T extends { id: string }>(a: T[] = [], b: T[] = []) => {
    const map = new Map<string, T>();
    for (const x of b) if (!gone.has(x.id)) map.set(x.id, x);
    for (const x of a) if (!gone.has(x.id)) map.set(x.id, x);
    return [...map.values()];
  };
  const transactions = byId(preferred.transactions, other.transactions).sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
  const plans = byId(preferred.plans, other.plans);
  const used = new Set([...transactions.map((t) => t.instrumentId), ...plans.map((p) => p.instrumentId)]);
  const instruments = Object.fromEntries(
    Object.entries({ ...other.instruments, ...preferred.instruments }).filter(([id]) => used.has(id)),
  );
  return { instruments, transactions, plans, deleted };
}

/** Vrai si deux portefeuilles contiennent les mêmes transactions, plans et suppressions. */
export function samePortfolio(a: UserPortfolio, b: UserPortfolio): boolean {
  const key = (p: UserPortfolio) =>
    JSON.stringify([p.transactions.map((t) => t.id).sort(), (p.plans ?? []).map((x) => `${x.id}:${x.amountEUR}:${x.start}:${x.end ?? ""}:${x.dayOfMonth}`).sort(), [...(p.deleted ?? [])].sort()]);
  return key(a) === key(b);
}
