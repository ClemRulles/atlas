"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { analyze, localToday, type PortfolioData, type Snapshot } from "@/lib/analysis";
import { dbGet, dbSet } from "@/lib/db";
import { buildDemoPortfolio } from "@/lib/demo/portfolio";
import type { Instrument, Transaction } from "@/lib/domain/types";
import { refreshSeries } from "@/lib/market-client";
import {
  DEFAULT_SETTINGS,
  EMPTY_PORTFOLIO,
  marketFrom,
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
  const cacheRef = useRef(cache);
  useEffect(() => {
    cacheRef.current = cache;
  }, [cache]);

  // Démarrage côté navigateur : la date et les données locales n'existent pas au rendu serveur.
  useEffect(() => {
    let alive = true;
    (async () => {
      const [savedPortfolio, savedSettings, savedCache] = await Promise.all([
        dbGet<UserPortfolio>("portfolio"),
        dbGet<Settings>("settings"),
        dbGet<MarketCache>("market"),
      ]);
      if (!alive) return;
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

  const data = useMemo<PortfolioData | null>(() => {
    if (!loaded || !mode || !today) return null;
    if (mode === "demo") return { ...buildDemoPortfolio(today), expenses: settings.expenses, expectedReturn: settings.expectedReturn };
    return {
      instruments: portfolio.instruments,
      transactions: portfolio.transactions,
      market: marketFrom(portfolio, cache),
      compositions: {},
      expenses: settings.expenses,
      expectedReturn: settings.expectedReturn,
    };
  }, [loaded, mode, today, portfolio, cache, settings]);
  const snapshot = useMemo(() => (data && today ? analyze(data, today) : null), [data, today]);

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
