"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { analyze, localToday, type PortfolioData, type Snapshot } from "@/lib/analysis";
import { dbGet, dbSet } from "@/lib/db";
import { buildDemoPortfolio } from "@/lib/demo/portfolio";
import type { FundComposition, Instrument, Transaction } from "@/lib/domain/types";
import { fetchComposition, refreshSeries } from "@/lib/market-client";
import {
  companiesToQuote,
  companyQuotesFrom,
  compositionsFrom,
  compositionsNeeded,
  DEFAULT_SETTINGS,
  EMPTY_PORTFOLIO,
  fxKey,
  marketFrom,
  withCompanyFx,
  type CompositionCache,
  oldestFetch,
  seriesNeeded,
  staleSeries,
  type Backup,
  type MarketCache,
  type Settings,
  type UserPortfolio,
} from "@/lib/user-data";

export type Mode = "demo" | "real";
export type SheetName = "add" | "csv" | "chat" | "mode" | "expenses" | null;

export interface AddPreset {
  instrument?: Instrument;
  side?: "buy" | "sell";
}

export interface MarketStatus {
  loading: boolean;
  /** Plus ancienne mise à jour des cours affichés (ms). */
  updatedAt: number | null;
  /** Séries que le serveur n'a pas pu fournir. */
  failed: string[];
}

interface AtlasState {
  /** `null` tant que l'app n'a pas démarré côté navigateur. */
  mode: Mode | null;
  data: PortfolioData | null;
  snapshot: Snapshot | null;
  portfolio: UserPortfolio;
  settings: Settings;
  market: MarketStatus;
  setMode: (mode: Mode) => void;
  discreet: boolean;
  toggleDiscreet: () => void;
  sheet: SheetName;
  addPreset: AddPreset;
  openSheet: (sheet: SheetName, preset?: AddPreset) => void;
  addTransactions: (instruments: Instrument[], transactions: Transaction[]) => void;
  deleteTransaction: (id: string) => void;
  saveSettings: (settings: Settings) => void;
  restore: (backup: Backup) => void;
  refreshMarket: (force?: boolean) => void;
}

const AtlasContext = createContext<AtlasState | null>(null);
const MODE_KEY = "atlas:mode";
const DISCREET_KEY = "atlas:discret";
/** Les cours sont différés d'environ 15 minutes : inutile de les redemander plus souvent. */
const MAX_AGE_MS = 15 * 60_000;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* stockage indisponible : le réglage vaut pour la session */
  }
}

export function AtlasProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode | null>(null);
  const [discreet, setDiscreet] = useState(false);
  const [sheet, setSheet] = useState<SheetName>(null);
  const [addPreset, setAddPreset] = useState<AddPreset>({});
  const [today, setToday] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [portfolio, setPortfolio] = useState<UserPortfolio>(EMPTY_PORTFOLIO);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [cache, setCache] = useState<MarketCache>({});
  const [market, setMarket] = useState<MarketStatus>({ loading: false, updatedAt: null, failed: [] });
  const [compositionCache, setCompositionCache] = useState<CompositionCache>({});
  const [quoteTargets, setQuoteTargets] = useState<{ key: string; symbol: string }[]>([]);
  const cacheRef = useRef(cache);
  useEffect(() => {
    cacheRef.current = cache;
  }, [cache]);

  // Démarrage côté navigateur : la date et les données locales n'existent pas au rendu serveur.
  useEffect(() => {
    let alive = true;
    (async () => {
      const [savedPortfolio, savedSettings, savedCache, savedCompositions] = await Promise.all([
        dbGet<UserPortfolio>("portfolio"),
        dbGet<Settings>("settings"),
        dbGet<MarketCache>("market"),
        dbGet<CompositionCache>("compositions"),
      ]);
      if (!alive) return;
      if (savedCompositions) setCompositionCache(savedCompositions);
      if (savedPortfolio) setPortfolio(savedPortfolio);
      if (savedSettings) setSettings(savedSettings);
      if (savedCache) setCache(savedCache);
      setToday(localToday());
      setModeState(read(MODE_KEY) === "real" ? "real" : "demo");
      setDiscreet(read(DISCREET_KEY) === "1");
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("discret", discreet);
  }, [discreet]);

  const refreshMarket = useCallback(
    async (force = false) => {
      if (!today) return;
      const needs = seriesNeeded(portfolio, today);
      const todo = force ? needs : staleSeries(needs, cacheRef.current, Date.now(), MAX_AGE_MS);
      if (todo.length === 0) {
        setMarket((m) => ({ ...m, loading: false, updatedAt: oldestFetch(needs, cacheRef.current) }));
        return;
      }
      setMarket((m) => ({ ...m, loading: true }));
      const { cache: next, failed } = await refreshSeries(todo, cacheRef.current);
      setCache(next);
      void dbSet("market", next);
      setMarket({ loading: false, updatedAt: oldestFetch(needs, next), failed });
    },
    [portfolio, today],
  );

  // Cours réels : au démarrage, à chaque changement de positions, et au retour dans l'app.
  useEffect(() => {
    if (!loaded || mode !== "real") return;
    void refreshMarket();
    const onVisible = () => document.visibilityState === "visible" && void refreshMarket();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loaded, mode, refreshMarket]);

  // Compositions des fonds : chargées une fois par semaine, gardées sur l'appareil.
  useEffect(() => {
    if (!loaded || mode !== "real") return;
    const todo = compositionsNeeded(portfolio, compositionCache, Date.now());
    if (todo.length === 0) return;
    let alive = true;
    (async () => {
      const fetched = await Promise.all(todo.map(async (i) => [i.id, { fetchedAt: Date.now(), composition: await fetchComposition(i).catch(() => undefined) }] as const));
      if (!alive) return;
      // Une erreur réseau (undefined) n'est pas mise en cache : on réessaiera.
      const ok = fetched.filter(([, c]) => c.composition !== undefined) as [string, { fetchedAt: number; composition: FundComposition | null }][];
      if (ok.length === 0) return;
      setCompositionCache((current) => {
        const next = { ...current, ...Object.fromEntries(ok) };
        void dbSet("compositions", next);
        return next;
      });
    })();
    return () => {
      alive = false;
    };
  }, [loaded, mode, portfolio, compositionCache]);

  const data = useMemo<PortfolioData | null>(() => {
    if (!loaded || !mode || !today) return null;
    if (mode === "demo") return { ...buildDemoPortfolio(today), expenses: settings.expenses, expectedReturn: settings.expectedReturn };
    const companyQuotes = companyQuotesFrom(quoteTargets, cache);
    return {
      instruments: portfolio.instruments,
      transactions: portfolio.transactions,
      market: withCompanyFx(marketFrom(portfolio, cache), companyQuotes, cache),
      compositions: compositionsFrom(compositionCache),
      companyQuotes,
      expenses: settings.expenses,
      expectedReturn: settings.expectedReturn,
    };
  }, [loaded, mode, today, portfolio, cache, settings, compositionCache, quoteTargets]);
  const snapshot = useMemo(() => (data && today ? analyze(data, today) : null), [data, today]);

  // Cours des grandes entreprises tenues via les fonds : c'est ce qui permet de dire « merci Nvidia ».
  const targetsKey = snapshot && mode === "real" ? JSON.stringify(companiesToQuote(snapshot.exposure.companies)) : "[]";
  useEffect(() => {
    const targets = JSON.parse(targetsKey) as { key: string; symbol: string }[];
    // eslint-disable-next-line react-hooks/set-state-in-effect -- dérivé de l'instantané, mis en état pour éviter une boucle de calcul
    setQuoteTargets(targets);
    if (!today || targets.length === 0) return;
    const from = new Date(Date.parse(today) - 14 * 86_400_000).toISOString().slice(0, 10);
    let alive = true;
    (async () => {
      const stale = (key: string) => {
        const c = cacheRef.current[key];
        return !c || c.from > from || Date.now() - c.fetchedAt > MAX_AGE_MS;
      };
      const first = targets.filter((t) => stale(t.symbol)).map((t) => ({ key: t.symbol, from }));
      let next = cacheRef.current;
      if (first.length) next = (await refreshSeries(first, next)).cache;
      const currencies = [...new Set(targets.map((t) => next[t.symbol]?.currency).filter((c): c is string => !!c && c !== "EUR"))];
      const fx = currencies.filter((c) => stale(fxKey(c)) && !next[fxKey(c)]).map((c) => ({ key: fxKey(c), from }));
      if (fx.length) next = (await refreshSeries(fx, next)).cache;
      if (!alive || next === cacheRef.current) return;
      setCache(next);
      void dbSet("market", next);
    })();
    return () => {
      alive = false;
    };
  }, [targetsKey, today]);

  const setMode = useCallback((next: Mode) => {
    setModeState(next);
    write(MODE_KEY, next);
  }, []);
  const toggleDiscreet = useCallback(() => {
    setDiscreet((d) => {
      write(DISCREET_KEY, d ? "0" : "1");
      return !d;
    });
  }, []);
  const openSheet = useCallback((next: SheetName, preset: AddPreset = {}) => {
    setAddPreset(preset);
    setSheet(next);
  }, []);

  const savePortfolio = useCallback((next: UserPortfolio) => {
    setPortfolio(next);
    void dbSet("portfolio", next);
  }, []);
  const addTransactions = useCallback(
    (instruments: Instrument[], transactions: Transaction[]) => {
      setPortfolio((current) => {
        const next: UserPortfolio = {
          instruments: { ...current.instruments, ...Object.fromEntries(instruments.map((i) => [i.id, { ...current.instruments[i.id], ...i }])) },
          transactions: [...current.transactions, ...transactions],
        };
        void dbSet("portfolio", next);
        return next;
      });
      setMode("real");
    },
    [setMode],
  );
  const deleteTransaction = useCallback((id: string) => {
    setPortfolio((current) => {
      const transactions = current.transactions.filter((t) => t.id !== id);
      const used = new Set(transactions.map((t) => t.instrumentId));
      const instruments = Object.fromEntries(Object.entries(current.instruments).filter(([key]) => used.has(key)));
      const next = { instruments, transactions };
      void dbSet("portfolio", next);
      return next;
    });
  }, []);
  const saveSettings = useCallback((next: Settings) => {
    setSettings(next);
    void dbSet("settings", next);
  }, []);
  const restore = useCallback(
    (backup: Backup) => {
      savePortfolio(backup.portfolio);
      saveSettings(backup.settings);
      setMode("real");
    },
    [savePortfolio, saveSettings, setMode],
  );

  const value = useMemo(
    () => ({
      mode,
      data,
      snapshot,
      portfolio,
      settings,
      market,
      setMode,
      discreet,
      toggleDiscreet,
      sheet,
      addPreset,
      openSheet,
      addTransactions,
      deleteTransaction,
      saveSettings,
      restore,
      refreshMarket: (force?: boolean) => void refreshMarket(force),
    }),
    [mode, data, snapshot, portfolio, settings, market, setMode, discreet, toggleDiscreet, sheet, addPreset, openSheet, addTransactions, deleteTransaction, saveSettings, restore, refreshMarket],
  );
  return <AtlasContext.Provider value={value}>{children}</AtlasContext.Provider>;
}

export function useAtlas(): AtlasState {
  const ctx = useContext(AtlasContext);
  if (!ctx) throw new Error("useAtlas doit être utilisé dans <AtlasProvider>");
  return ctx;
}
