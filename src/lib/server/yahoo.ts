import "server-only";
import YahooFinance from "yahoo-finance2";
import type { AssetType, PricePoint } from "@/lib/domain/types";
import { assetTypeOf, cleanCloses, countryFr, displayName, exchangeRank, isValidIsin, normalizeCurrency, sectorFr } from "@/lib/market-format";

/**
 * Accès à Yahoo Finance côté serveur, avec un cache mémoire par instance.
 * Les routes ajoutent un cache CDN (Cache-Control) par-dessus.
 */

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const memory = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = memory.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  memory.set(key, { at: Date.now(), value });
  if (memory.size > 500) memory.delete(memory.keys().next().value as string);
  return value;
}

export interface SearchResult {
  symbol: string;
  name: string;
  type: AssetType;
  exchange: string;
  exchangeCode?: string;
  /** Renseigné quand la recherche portait sur un ISIN et que la cotation lui appartient. */
  isin?: string;
}

interface YahooQuote {
  symbol?: string;
  shortname?: string;
  longname?: string;
  quoteType?: string;
  exchange?: string;
  exchDisp?: string;
}

function toResult(q: YahooQuote, isin?: string): SearchResult | null {
  const type = assetTypeOf(q.quoteType);
  const name = q.longname ?? q.shortname;
  // Sans vrai nom (Yahoo renvoie parfois le symbole), la cotation n'aide pas à choisir.
  if (!q.symbol || !type || !name || name === q.symbol) return null;
  return { symbol: q.symbol, name: name.replace(/\s+/g, " ").trim(), type, exchange: q.exchDisp ?? q.exchange ?? "", exchangeCode: q.exchange, ...(isin ? { isin } : {}) };
}

async function rawSearch(query: string): Promise<YahooQuote[]> {
  const res = await yf.search(query, { quotesCount: 10, newsCount: 0 });
  return res.quotes as YahooQuote[];
}

/**
 * Recherche par nom, ticker ou ISIN. Pour un ISIN, Yahoo ne renvoie souvent qu'une cotation :
 * on cherche aussi les autres places du même produit (même racine de ticker).
 */
export function search(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  return cached(`search:${q.toUpperCase()}`, 24 * 3600_000, async () => {
    const isin = isValidIsin(q) ? q.toUpperCase() : undefined;
    const direct = (await rawSearch(q)).map((x) => toResult(x, isin)).filter((x): x is SearchResult => !!x);
    let results = direct;
    if (isin && direct.length > 0) {
      const roots = [...new Set(direct.map((r) => r.symbol.split(".")[0]))].slice(0, 2);
      const siblings = (await Promise.all(roots.map((root) => rawSearch(root).catch(() => []))))
        .flat()
        .filter((x) => x.symbol && roots.includes(x.symbol.split(".")[0]))
        .map((x) => toResult(x, isin))
        .filter((x): x is SearchResult => !!x);
      // Les autres places portent souvent un autre ticker (VWRA à Londres, VWCE à Francfort) : on cherche
      // aussi par nom, et on ne garde que les cotations au nom strictement identique (même classe de parts).
      const exact = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const names = new Set(direct.map((r) => exact(r.name)));
      const byName = (await rawSearch(displayName(direct[0].name)).catch(() => []))
        .map((x) => toResult(x, isin))
        .filter((x): x is SearchResult => !!x && names.has(exact(x.name)));
      results = [...direct, ...siblings, ...byName];
    }
    const unique = new Map<string, SearchResult>();
    for (const r of results) if (!unique.has(r.symbol)) unique.set(r.symbol, r);
    // Pour un même produit, la cotation en euros d'une place européenne passe d'abord (un investisseur belge paie en euros).
    const list = [...unique.values()];
    const family = (r: SearchResult) => r.name.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(" ").slice(0, 2).join(" ");
    const order = [...new Set(list.map(family))];
    return order.flatMap((f) => list.filter((r) => family(r) === f).sort((a, b) => exchangeRank(a.exchangeCode) - exchangeRank(b.exchangeCode))).slice(0, 12);
  });
}

export interface History {
  symbol: string;
  name: string | null;
  currency: string | null;
  exchange: string | null;
  type: AssetType | null;
  points: PricePoint[];
}

/** Clôtures quotidiennes depuis une date, dans l'unité de la devise (pence ramenés en livres). */
export function history(symbol: string, from: string): Promise<History> {
  const recent = Date.now() - Date.parse(from) < 10 * 86_400_000;
  return cached(`history:${symbol}:${from}`, recent ? 10 * 60_000 : 30 * 60_000, async () => {
    const chart = await yf.chart(symbol, { period1: from, interval: "1d" });
    const meta = chart.meta as { currency?: string; longName?: string; shortName?: string; fullExchangeName?: string; instrumentType?: string; exchangeTimezoneName?: string };
    const { currency, divisor } = normalizeCurrency(meta.currency);
    return {
      symbol,
      name: meta.longName ?? meta.shortName ?? null,
      currency,
      exchange: meta.fullExchangeName ?? null,
      type: assetTypeOf(meta.instrumentType),
      points: cleanCloses(chart.quotes as { date: Date; close: number | null }[], meta.exchangeTimezoneName ?? "UTC", divisor),
    };
  });
}

export interface Profile {
  symbol: string;
  type: AssetType | null;
  currency: string | null;
  sector?: string;
  country?: string;
  earningsYield?: number;
  dividendYield?: number;
  expenseRatio?: number;
}

/** Ce que Yahoo sait d'une ligne : secteur et pays d'une action, rendements, frais d'un fonds. */
export function profile(symbol: string): Promise<Profile> {
  return cached(`profile:${symbol}`, 7 * 24 * 3600_000, async () => {
    const qs = await yf.quoteSummary(symbol, { modules: ["price", "assetProfile", "summaryDetail", "fundProfile"] });
    const pe = qs.summaryDetail?.trailingPE;
    const expense = qs.fundProfile?.feesExpensesInvestment?.annualReportExpenseRatio;
    const dividend = qs.summaryDetail?.dividendYield ?? qs.summaryDetail?.yield;
    return {
      symbol,
      type: assetTypeOf(qs.price?.quoteType),
      currency: normalizeCurrency(qs.price?.currency ?? undefined).currency,
      sector: sectorFr(qs.assetProfile?.sector ?? undefined),
      country: countryFr(qs.assetProfile?.country ?? undefined),
      ...(typeof pe === "number" && pe > 0 ? { earningsYield: 1 / pe } : {}),
      ...(typeof dividend === "number" && dividend >= 0 ? { dividendYield: dividend } : {}),
      ...(typeof expense === "number" && expense >= 0 ? { expenseRatio: expense } : {}),
    };
  });
}

export interface NewsItem {
  title: string;
  publisher: string | null;
  publishedAt: string | null;
  link: string | null;
}

export interface CompanyInfo {
  symbol: string;
  news: NewsItem[];
  /** Prochaine publication de résultats annoncée (AAAA-MM-JJ), sinon la dernière connue. */
  nextEarnings: string | null;
  lastEarnings: string | null;
  earningsEstimated: boolean;
}

interface YahooNews {
  title?: string;
  publisher?: string;
  providerPublishTime?: Date | number | string;
  link?: string;
  relatedTickers?: string[];
}

/** Actualités propres à l'entreprise (citée dans l'article) et dates de résultats. */
export function companyInfo(symbol: string, today: string): Promise<CompanyInfo> {
  return cached(`company:${symbol}:${today}`, 3 * 3600_000, async () => {
    const [search, summary] = await Promise.all([
      // Les actualités sont rattachées à l'entreprise, pas à une place : on cherche par la racine du ticker.
      yf.search(symbol.split(".")[0], { quotesCount: 0, newsCount: 12 }).catch(() => ({ news: [] as YahooNews[] })),
      yf.quoteSummary(symbol, { modules: ["calendarEvents"] }).catch(() => null),
    ]);
    const root = symbol.split(".")[0].toUpperCase();
    const matches = (t: string) => t.toUpperCase() === symbol.toUpperCase() || t.toUpperCase().split(".")[0] === root;
    const news = (search.news as YahooNews[])
      // Yahoo mêle des actualités de marché : on garde celles où l'entreprise fait partie des trois titres cités en premier,
      // les plus centrées sur elle d'abord (moins de titres cités).
      .filter((n) => n.title && (n.relatedTickers ?? []).slice(0, 3).some(matches))
      .sort((a, b) => (a.relatedTickers?.length ?? 99) - (b.relatedTickers?.length ?? 99))
      .slice(0, 3)
      .map((n) => ({
        title: n.title as string,
        publisher: n.publisher ?? null,
        publishedAt: n.providerPublishTime ? new Date(n.providerPublishTime).toISOString() : null,
        link: n.link ?? null,
      }));
    const earnings = summary?.calendarEvents?.earnings;
    const dates = ((earnings?.earningsDate ?? []) as Date[]).map((d) => new Date(d).toISOString().slice(0, 10)).sort();
    const next = dates.find((d) => d >= today) ?? null;
    const last = [...dates].reverse().find((d) => d < today) ?? null;
    return { symbol, news, nextEarnings: next, lastEarnings: last, earningsEstimated: !!earnings?.isEarningsDateEstimate };
  });
}
