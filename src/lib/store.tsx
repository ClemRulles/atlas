"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { analyze, localToday, type PortfolioData, type Snapshot } from "@/lib/analysis";
import { buildDemoPortfolio, DEMO_EXPENSES } from "@/lib/demo/portfolio";

export type Mode = "demo" | "real";
export type SheetName = "add" | "chat" | "mode" | null;

interface AtlasState {
  /** `null` tant que l'app n'a pas démarré côté navigateur. */
  mode: Mode | null;
  data: PortfolioData | null;
  snapshot: Snapshot | null;
  setMode: (mode: Mode) => void;
  discreet: boolean;
  toggleDiscreet: () => void;
  sheet: SheetName;
  openSheet: (sheet: SheetName) => void;
}

const AtlasContext = createContext<AtlasState | null>(null);
const MODE_KEY = "atlas:mode";
const DISCREET_KEY = "atlas:discret";

/** Portefeuille réel vide : la saisie arrive en phase 2. */
const EMPTY: PortfolioData = {
  instruments: {},
  transactions: [],
  market: { prices: {}, fx: {} },
  compositions: {},
  expenses: DEMO_EXPENSES,
  expectedReturn: 0.05,
};

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
  const [today, setToday] = useState<string | null>(null);

  // Démarrage côté navigateur : la date et les réglages n'existent pas au rendu serveur.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture unique des réglages au montage
    setToday(localToday());
    setModeState(read(MODE_KEY) === "real" ? "real" : "demo");
    setDiscreet(read(DISCREET_KEY) === "1");
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("discret", discreet);
  }, [discreet]);

  const data = useMemo(() => {
    if (!mode || !today) return null;
    return mode === "demo" ? buildDemoPortfolio(today) : EMPTY;
  }, [mode, today]);
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

  const value = useMemo(
    () => ({ mode, data, snapshot, setMode, discreet, toggleDiscreet, sheet, openSheet: setSheet }),
    [mode, data, snapshot, setMode, discreet, toggleDiscreet, sheet],
  );
  return <AtlasContext.Provider value={value}>{children}</AtlasContext.Provider>;
}

export function useAtlas(): AtlasState {
  const ctx = useContext(AtlasContext);
  if (!ctx) throw new Error("useAtlas doit être utilisé dans <AtlasProvider>");
  return ctx;
}
