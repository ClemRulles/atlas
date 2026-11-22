/** Appels de l'app vers nos routes serveur (jamais directement vers les fournisseurs). */

import type { AssetType, FundComposition, Instrument, PricePoint } from "@/lib/domain/types";
import type { CachedSeries, MarketCache, SeriesNeed } from "@/lib/user-data";

export interface SearchResult {
  symbol: string;
  name: string;
  type: AssetType;
  exchange: string;
  exchangeCode?: string;
  isin?: string;
}

export interface HistoryResponse {
  symbol: string;
  name: string | null;
  currency: string | null;
  exchange: string | null;
  type: AssetType | null;
  points: PricePoint[];
}

export interface ProfileResponse {
  symbol: string;
  type?: AssetType | null;
  currency?: string | null;
  sector?: string;
  country?: string;
  earningsYield?: number;
  dividendYield?: number;
  expenseRatio?: number;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? "Le service ne répond pas.");
  return body as T;
}

export async function searchInstruments(q: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const { results } = await getJson<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(q)}`, signal);
  return results;
}

export function fetchHistory(symbol: string, from: string, signal?: AbortSignal): Promise<HistoryResponse> {
  return getJson<HistoryResponse>(`/api/history?symbol=${encodeURIComponent(symbol)}&from=${from}`, signal);
}

export async function fetchProfile(symbol: string): Promise<ProfileResponse> {
  try {
    return await getJson<ProfileResponse>(`/api/profile?symbol=${encodeURIComponent(symbol)}`);
  } catch {
    return { symbol };
  }
}

/**
 * Charge les séries demandées, quatre à la fois. Une série en échec garde son ancienne
 * version du cache et son symbole est renvoyé dans `failed`.
 */
export async function refreshSeries(needs: SeriesNeed[], cache: MarketCache): Promise<{ cache: MarketCache; failed: string[] }> {
  const next: MarketCache = { ...cache };
  const failed: string[] = [];
  const queue = [...needs];
  const worker = async () => {
    for (let need = queue.shift(); need; need = queue.shift()) {
      try {
        const h = await fetchHistory(need.key, need.from);
        const series: CachedSeries = { from: need.from, fetchedAt: Date.now(), currency: h.currency, points: h.points };
        next[need.key] = series;
      } catch {
        failed.push(need.key);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, needs.length) }, worker));
  return { cache: next, failed };
}

/** Composition d'un fonds, ou `null` si aucun fournisseur ne la connaît. Lève une erreur si le réseau échoue. */
export async function fetchComposition(instrument: Instrument): Promise<FundComposition | null> {
  const params = new URLSearchParams({ symbol: instrument.symbol, id: instrument.id });
  if (instrument.isin) params.set("isin", instrument.isin);
  const { composition } = await getJson<{ composition: FundComposition | null }>(`/api/composition?${params}`);
  return composition;
}

export interface CompanyInfo {
  symbol: string;
  news: { title: string; publisher: string | null; publishedAt: string | null; link: string | null }[];
  nextEarnings: string | null;
  lastEarnings: string | null;
  earningsEstimated: boolean;
}

export function fetchCompanyInfo(symbol: string, signal?: AbortSignal): Promise<CompanyInfo> {
  return getJson<CompanyInfo>(`/api/company?symbol=${encodeURIComponent(symbol)}`, signal);
}
