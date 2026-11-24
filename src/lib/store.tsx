"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { analyze, localToday, type PortfolioData, type Snapshot } from "@/lib/analysis";
import { dbGet, dbSet } from "@/lib/db";
import { buildDemoPortfolio } from "@/lib/demo/portfolio";
import type { FundComposition, Instrument, SavingsPlan, Transaction } from "@/lib/domain/types";
import { withPlans } from "@/lib/domain/plans";
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
  mergePortfolios,
  samePortfolio,
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
export type SheetName = "add" | "csv" | "capture" | "chat" | "mode" | "expenses" | null;

export type EntryKind = "plan" | "own" | "buy" | "sell";

export interface AddPreset {
  instrument?: Instrument;
  kind?: EntryKind;
}

export interface MarketStatus {
  loading: boolean;
  /** Plus ancienne mise à jour des cours affichés (ms). */
  updatedAt: number | null;
  /** Séries que le serveur n'a pas pu fournir. */
  failed: string[];
}

export interface Account {
  enabled: boolean;
  user: { id: string; name: string } | null;
  /** Vrai quand les données du compte sont enregistrées sur le serveur. */
  sync: boolean;
  status: "idle" | "saving" | "saved" | "error";
}

interface AtlasState {
  account: Account | null;
  logout: () => void;
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
  savePlan: (instrument: Instrument, plan: SavingsPlan) => void;
  deletePlan: (id: string) => void;
  /** Exécutions de plans dont le cours n'est pas encore chargé. */
  planPending: number;
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
  const [account, setAccount] = useState<Account | null>(null);
  const syncReady = useRef(false);
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
      // Compte connecté : les données du serveur passent devant celles de l'appareil si elles sont plus récentes.
      const me = await fetch("/api/auth/me").then((r) => r.json()).catch(() => null);
      let portfolioNow: UserPortfolio = savedPortfolio ?? EMPTY_PORTFOLIO;
      let settingsNow: Settings = savedSettings ?? DEFAULT_SETTINGS;
      let fromServer = false;
      if (me?.sync) {
        // Compte connecté : on fusionne l'appareil et le compte, sans jamais rien perdre de part et d'autre.
        const remote = await fetch("/api/data").then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (remote) {
          const localStamp = (await dbGet<number>("updatedAt")) ?? 0;
          const doc = remote.data as { portfolio?: UserPortfolio; settings?: Settings; updatedAt?: number } | null;
          let needPush = true;
          if (doc?.portfolio) {
            const remoteNewer = (doc.updatedAt ?? 0) > localStamp;
            const merged = remoteNewer ? mergePortfolios(doc.portfolio, portfolioNow) : mergePortfolios(portfolioNow, doc.portfolio);
            if (remoteNewer && doc.settings) settingsNow = doc.settings;
            needPush = !samePortfolio(merged, doc.portfolio) || (!remoteNewer && JSON.stringify(settingsNow) !== JSON.stringify(doc.settings));
            portfolioNow = merged;
          }
          fromServer = portfolioNow.transactions.length > 0 || (portfolioNow.plans?.length ?? 0) > 0;
          void dbSet("portfolio", portfolioNow);
          void dbSet("settings", settingsNow);
          if (needPush) {
            const updatedAt = Date.now();
            void dbSet("updatedAt", updatedAt);
            void fetch("/api/data", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ portfolio: portfolioNow, settings: settingsNow, updatedAt }) }).catch(() => {});
          }
        }
      }
      if (!alive) return;
      setAccount(me ? { enabled: !!me.enabled, user: me.user ?? null, sync: !!me.sync, status: "idle" } : null);
      setPortfolio(portfolioNow);
      setSettings(settingsNow);
      if (savedCache) setCache(savedCache);
      setToday(localToday());
      setModeState(fromServer || read(MODE_KEY) === "real" ? "real" : "demo");
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

  // Synchronisation : chaque changement de positions, plans ou réglages part sur le compte, regroupé.
  useEffect(() => {
    if (!loaded || !account?.sync) return;
    if (!syncReady.current) {
      // Le premier passage suit le chargement : rien à renvoyer.
      syncReady.current = true;
      return;
    }
    const timer = setTimeout(async () => {
      const updatedAt = Date.now();
      void dbSet("updatedAt", updatedAt);
      setAccount((a) => (a ? { ...a, status: "saving" } : a));
      const result = await fetch("/api/data", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ portfolio, settings, updatedAt }) })
        .then((r) => (r.ok ? (r.json() as Promise<{ portfolio?: UserPortfolio }>) : null))
        .catch(() => null);
      setAccount((a) => (a ? { ...a, status: result ? "saved" : "error" } : a));
      // Le serveur a pu fusionner des ajouts faits ailleurs : on les récupère.
      if (result?.portfolio && !samePortfolio(result.portfolio, portfolio)) {
        setPortfolio(result.portfolio);
        void dbSet("portfolio", result.portfolio);
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [loaded, account?.sync, portfolio, settings]);

  const logout = useCallback(() => {
    void fetch("/api/auth/logout", { method: "POST" }).finally(() => {
      // Rechargement complet voulu : on repart d'un état vide sur la page de connexion.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/login";
    });
  }, []);

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
    const market = withCompanyFx(marketFrom(portfolio, cache), companyQuotes, cache);
    return {
      instruments: portfolio.instruments,
      transactions: withPlans(portfolio.transactions, portfolio.plans ?? [], portfolio.instruments, market, today).transactions,
      market,
      compositions: compositionsFrom(compositionCache),
      companyQuotes,
      expenses: settings.expenses,
      expectedReturn: settings.expectedReturn,
    };
  }, [loaded, mode, today, portfolio, cache, settings, compositionCache, quoteTargets]);
  const snapshot = useMemo(() => (data && today ? analyze(data, today) : null), [data, today]);
  const planPending = useMemo(
    () => (data && today && mode === "real" ? withPlans([], portfolio.plans ?? [], portfolio.instruments, data.market, today).pending : 0),
    [data, today, mode, portfolio],
  );

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
  /** Applique un changement au portefeuille, retire les lignes devenues inutiles et enregistre. */
  const updatePortfolio = useCallback((change: (current: UserPortfolio) => UserPortfolio) => {
    setPortfolio((current) => {
      const changed = change(current);
      const used = new Set([...changed.transactions.map((t) => t.instrumentId), ...(changed.plans ?? []).map((p) => p.instrumentId)]);
      const next = { ...changed, instruments: Object.fromEntries(Object.entries(changed.instruments).filter(([key]) => used.has(key))) };
      void dbSet("portfolio", next);
      void dbSet("updatedAt", Date.now());
      return next;
    });
  }, []);
  const mergeInstruments = (current: UserPortfolio, instruments: Instrument[]) => ({
    ...current.instruments,
    ...Object.fromEntries(instruments.map((i) => [i.id, { ...current.instruments[i.id], ...i }])),
  });
  const addTransactions = useCallback(
    (instruments: Instrument[], transactions: Transaction[]) => {
      updatePortfolio((current) => ({ ...current, instruments: mergeInstruments(current, instruments), transactions: [...current.transactions, ...transactions] }));
      setMode("real");
    },
    [setMode, updatePortfolio],
  );
  const deleteTransaction = useCallback(
    (id: string) => updatePortfolio((current) => ({ ...current, transactions: current.transactions.filter((t) => t.id !== id), deleted: [...(current.deleted ?? []), id] })),
    [updatePortfolio],
  );
  const savePlan = useCallback(
    (instrument: Instrument, plan: SavingsPlan) => {
      updatePortfolio((current) => ({
        ...current,
        instruments: mergeInstruments(current, [instrument]),
        plans: [...(current.plans ?? []).filter((p) => p.id !== plan.id), plan],
      }));
      setMode("real");
    },
    [setMode, updatePortfolio],
  );
  const deletePlan = useCallback(
    (id: string) => updatePortfolio((current) => ({ ...current, plans: (current.plans ?? []).filter((p) => p.id !== id), deleted: [...(current.deleted ?? []), id] })),
    [updatePortfolio],
  );
  const saveSettings = useCallback((next: Settings) => {
    setSettings(next);
    void dbSet("settings", next);
    void dbSet("updatedAt", Date.now());
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
      account,
      logout,
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
      savePlan,
      deletePlan,
      planPending,
      saveSettings,
      restore,
      refreshMarket: (force?: boolean) => void refreshMarket(force),
    }),
    [account, logout, mode, data, snapshot, portfolio, settings, market, setMode, discreet, toggleDiscreet, sheet, addPreset, openSheet, addTransactions, deleteTransaction, savePlan, deletePlan, planPending, saveSettings, restore, refreshMarket],
  );
  return <AtlasContext.Provider value={value}>{children}</AtlasContext.Provider>;
}

export function useAtlas(): AtlasState {
  const ctx = useContext(AtlasContext);
  if (!ctx) throw new Error("useAtlas doit être utilisé dans <AtlasProvider>");
  return ctx;
}
