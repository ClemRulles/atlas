import "server-only";
import YahooFinance from "yahoo-finance2";
import type { FundComposition } from "@/lib/domain/types";
import {
  countryName,
  earningsYieldFrom,
  expenseRatioFrom,
  holdingsFrom,
  rawNumber,
  sectorName,
  weightsFrom,
} from "./normalize";

/**
 * Fournisseurs de composition d'ETF. Chacun traduit sa réponse en `FundComposition`,
 * sans jamais compléter au hasard : un champ absent reste absent.
 * Points d'accès et champs relus dans la documentation de chaque fournisseur (novembre 2026).
 */

export interface FundRef {
  instrumentId: string;
  /** Cotation Yahoo, ex. IWDA.AS. */
  symbol: string;
  isin?: string;
}

export interface HoldingsProvider {
  id: "yahoo" | "eulerpool" | "fmp" | "finnhub";
  label: string;
  /** Faux si la clé d'API manque. */
  available(): boolean;
  fetch(ref: FundRef): Promise<FundComposition | null>;
}

const TIMEOUT_MS = 8000;

async function getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: "application/json", ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${new URL(url).host} : HTTP ${res.status}`);
  return res.json();
}

const asArray = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
const asObject = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const today = () => new Date().toISOString().slice(0, 10);

/* ——— Yahoo : gratuit, sans clé. Top 10, secteurs, frais, rendement bénéficiaire. Pas de pays. ——— */

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export const yahooProvider: HoldingsProvider = {
  id: "yahoo",
  label: "Yahoo Finance",
  available: () => true,
  async fetch(ref) {
    const qs = await yf.quoteSummary(ref.symbol, { modules: ["topHoldings", "fundProfile", "summaryDetail"] }).catch(() => null);
    const top = qs?.topHoldings;
    if (!top) return null;
    const holdings = holdingsFrom((top.holdings ?? []).map((h) => ({ name: h.holdingName, symbol: h.symbol, weight: h.holdingPercent })));
    const sectors = weightsFrom(
      (top.sectorWeightings ?? []).flatMap((entry) => Object.entries(entry as Record<string, unknown>).map(([label, value]) => ({ label, value }))),
      sectorName,
    );
    if (holdings.length === 0 && sectors.length === 0) return null;
    // Pour les fonds, Yahoo donne les ratios de valorisation inversés (0,0458 au lieu d'un PER de 21,8).
    const pe = (top.equityHoldings as { priceToEarnings?: number } | undefined)?.priceToEarnings;
    const dividend = qs?.summaryDetail?.yield;
    return {
      instrumentId: ref.instrumentId,
      source: "yahoo",
      asOf: today(),
      holdings,
      sectors,
      expenseRatio: expenseRatioFrom(qs?.fundProfile?.feesExpensesInvestment?.annualReportExpenseRatio, "ratio"),
      earningsYield: earningsYieldFrom(pe),
      dividendYield: typeof dividend === "number" && dividend >= 0 && dividend < 0.2 ? dividend : undefined,
    };
  },
};

/* ——— Eulerpool : offre gratuite (100 000 requêtes par mois, usage non commercial). Lignes complètes et pays. ——— */

const EULERPOOL = "https://api.eulerpool.com/api/1/etf";

export const eulerpoolProvider: HoldingsProvider = {
  id: "eulerpool",
  label: "Eulerpool",
  available: () => !!process.env.EULERPOOL_API_KEY,
  async fetch(ref) {
    const id = encodeURIComponent(ref.isin ?? ref.symbol.split(".")[0]);
    const headers = { Authorization: `Bearer ${process.env.EULERPOOL_API_KEY}` };
    const [rawHoldings, rawSectors, rawCountries, rawProfile] = await Promise.all([
      getJson(`${EULERPOOL}/holdings/${id}`, headers),
      getJson(`${EULERPOOL}/sectors/${id}`, headers).catch(() => null),
      getJson(`${EULERPOOL}/countries/${id}`, headers).catch(() => null),
      getJson(`${EULERPOOL}/profile/${id}`, headers).catch(() => null),
    ]);
    const rows = asArray(rawHoldings).filter((h) => !h.assetType || String(h.assetType).toLowerCase().includes("equity") || String(h.assetType).toLowerCase().includes("stock"));
    const holdings = holdingsFrom(rows.map((h) => ({ name: h.name, symbol: h.symbol, isin: h.isin, weight: h.percent })));
    if (holdings.length === 0) return null;
    const profile = asObject(rawProfile);
    return {
      instrumentId: ref.instrumentId,
      source: "eulerpool",
      asOf: typeof rows[0]?.updated_at === "string" ? String(rows[0].updated_at).slice(0, 10) : today(),
      holdings,
      holdingsCount: asArray(rawHoldings).length,
      sectors: weightsFrom(asArray(rawSectors).map((s) => ({ label: String(s.industry ?? ""), value: s.exposure })), sectorName),
      countries: weightsFrom(asArray(rawCountries).map((c) => ({ label: String(c.country ?? ""), value: c.exposure })), countryName),
      // La documentation montre 0.2 pour un ETF à 0,20 % : la valeur est en pourcentage.
      expenseRatio: expenseRatioFrom(profile.expenseRatio, "percent"),
    };
  },
};

/* ——— FMP : plan Ultimate (payant). ——— */

const FMP = "https://financialmodelingprep.com/stable/etf";

export const fmpProvider: HoldingsProvider = {
  id: "fmp",
  label: "Financial Modeling Prep",
  available: () => !!process.env.FMP_API_KEY,
  async fetch(ref) {
    const key = encodeURIComponent(process.env.FMP_API_KEY ?? "");
    const symbol = encodeURIComponent(ref.symbol);
    const [rawHoldings, rawSectors, rawCountries, rawInfo] = await Promise.all([
      getJson(`${FMP}/holdings?symbol=${symbol}&apikey=${key}`),
      getJson(`${FMP}/sector-weightings?symbol=${symbol}&apikey=${key}`).catch(() => null),
      getJson(`${FMP}/country-weightings?symbol=${symbol}&apikey=${key}`).catch(() => null),
      getJson(`${FMP}/info?symbol=${symbol}&apikey=${key}`).catch(() => null),
    ]);
    const holdings = holdingsFrom(asArray(rawHoldings).map((h) => ({ name: h.name, symbol: h.asset, isin: h.isin, weight: h.weightPercentage })));
    if (holdings.length === 0) return null;
    const info = asArray(rawInfo)[0] ?? {};
    const count = rawNumber(info.holdingsCount);
    return {
      instrumentId: ref.instrumentId,
      source: "fmp",
      asOf: today(),
      holdings,
      ...(count ? { holdingsCount: count } : {}),
      sectors: weightsFrom(asArray(rawSectors).map((s) => ({ label: String(s.sector ?? ""), value: s.weightPercentage })), sectorName),
      countries: weightsFrom(asArray(rawCountries).map((c) => ({ label: String(c.country ?? ""), value: c.weightPercentage })), countryName),
      expenseRatio: expenseRatioFrom(info.expenseRatio, "percent"),
    };
  },
};

/* ——— Finnhub : ETF marqués Premium (payant). ——— */

const FINNHUB = "https://finnhub.io/api/v1/etf";

export const finnhubProvider: HoldingsProvider = {
  id: "finnhub",
  label: "Finnhub",
  available: () => !!process.env.FINNHUB_API_KEY,
  async fetch(ref) {
    const headers = { "X-Finnhub-Token": process.env.FINNHUB_API_KEY ?? "" };
    const query = ref.isin ? `isin=${encodeURIComponent(ref.isin)}` : `symbol=${encodeURIComponent(ref.symbol.split(".")[0])}`;
    const [rawHoldings, rawSectors, rawCountries, rawProfile] = await Promise.all([
      getJson(`${FINNHUB}/holdings?${query}`, headers),
      getJson(`${FINNHUB}/sector?${query}`, headers).catch(() => null),
      getJson(`${FINNHUB}/country?${query}`, headers).catch(() => null),
      getJson(`${FINNHUB}/profile?${query}`, headers).catch(() => null),
    ]);
    const body = asObject(rawHoldings);
    const rows = asArray(body.holdings).filter((h) => !h.assetType || h.assetType === "Equity");
    const holdings = holdingsFrom(rows.map((h) => ({ name: h.name, symbol: h.symbol, isin: h.isin, weight: h.percent })));
    if (holdings.length === 0) return null;
    const profile = asObject(asObject(rawProfile).profile);
    const count = rawNumber(body.numberOfHoldings);
    return {
      instrumentId: ref.instrumentId,
      source: "finnhub",
      asOf: typeof body.atDate === "string" ? body.atDate : today(),
      holdings,
      ...(count ? { holdingsCount: count } : {}),
      sectors: weightsFrom(asArray(asObject(rawSectors).sectorExposure).map((s) => ({ label: String(s.industry ?? ""), value: s.exposure })), sectorName),
      countries: weightsFrom(asArray(asObject(rawCountries).countryExposure).map((c) => ({ label: String(c.country ?? ""), value: c.exposure })), countryName),
      expenseRatio: expenseRatioFrom(profile.expenseRatio, "percent"),
      earningsYield: earningsYieldFrom(profile.priceToEarnings),
    };
  },
};

export const PROVIDERS: Record<HoldingsProvider["id"], HoldingsProvider> = {
  yahoo: yahooProvider,
  eulerpool: eulerpoolProvider,
  fmp: fmpProvider,
  finnhub: finnhubProvider,
};
