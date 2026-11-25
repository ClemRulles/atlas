"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Sheet } from "@/components/shell/Sheet";
import { TYPE_LABELS, inputClass } from "@/components/ui/fields";
import { IconCamera, IconFile, IconSearch } from "@/components/ui/icons";
import { searchInstruments, type SearchResult } from "@/lib/market-client";
import { useAtlas } from "@/lib/store";
import { haptic } from "@/lib/ui";
import { EntryForm } from "./EntryForm";

type Listing = Pick<SearchResult, "symbol" | "name" | "type" | "exchange" | "isin">;

export function AddSheet() {
  const { sheet, openSheet, addPreset, mode } = useAtlas();
  const open = sheet === "add";
  const [picked, setPicked] = useState<Listing | null>(null);

  // À chaque ouverture : on repart de la recherche, ou de la ligne demandée (vendre, racheter).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- réinitialisation à l'ouverture de la feuille
    if (open) setPicked(addPreset.instrument ? { symbol: addPreset.instrument.symbol, name: addPreset.instrument.name, type: addPreset.instrument.type, exchange: addPreset.instrument.exchange ?? "", isin: addPreset.instrument.isin } : null);
  }, [open, addPreset]);

  return (
    <Sheet open={open} onClose={() => openSheet(null)} title="Ajouter une position">
      {mode === "demo" && (
        <p className="mb-4 rounded-2xl border border-voile/[0.08] bg-voile/[0.04] px-4 py-3 text-[13.5px] text-brume">
          Tu regardes la démo. Ce que tu ajoutes va dans ton vrai portefeuille, et l&apos;app basculera dessus.
        </p>
      )}
      <AnimatePresence mode="wait" initial={false}>
        {picked ? (
          <motion.div key="form" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25 }}>
            <EntryForm listing={picked} known={addPreset.instrument} initialKind={addPreset.kind ?? (addPreset.instrument ? "buy" : "plan")} onBack={addPreset.instrument ? undefined : () => setPicked(null)} />
          </motion.div>
        ) : (
          <motion.div key="search" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.25 }}>
            <SearchStep onPick={setPicked} onCsv={() => openSheet("csv")} onCapture={() => openSheet("capture")} />
          </motion.div>
        )}
      </AnimatePresence>
    </Sheet>
  );
}

function SearchStep({ onPick, onCsv, onCapture }: { onPick: (l: Listing) => void; onCsv: () => void; onCapture: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- requête trop courte : on vide les résultats
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState("loading");
      try {
        setResults(await searchInstruments(q, controller.signal));
        setState("idle");
      } catch {
        if (!controller.signal.aborted) setState("error");
      }
    }, 280);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <div className="flex flex-col gap-5">
      <h2 className="font-serif text-[28px] leading-tight">Ajouter une position</h2>
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ombre">
          <IconSearch />
        </span>
        <input
          id="recherche-titre"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nom, ticker ou ISIN"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className={`${inputClass} pl-12`}
          aria-label="Rechercher un titre par nom, ticker ou ISIN"
        />
      </div>
      <div className="min-h-[120px]">
        {state === "loading" && results.length === 0 && (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="silhouette h-14" />
            ))}
          </div>
        )}
        {state === "error" && <p className="text-[14px] text-braise">La recherche ne répond pas. Vérifie ta connexion et réessaie.</p>}
        {state === "idle" && query.trim().length >= 2 && results.length === 0 && <p className="text-[14px] text-brume">Aucun titre trouvé. Essaie l&apos;ISIN, souvent plus précis que le nom.</p>}
        <ul className="flex flex-col">
          {results.map((r) => (
            <li key={r.symbol}>
              <button
                type="button"
                onClick={() => (haptic(), onPick(r))}
                className="touche grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-voile/[0.07] py-3 text-left first:border-t-0"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[15px]">{r.name}</span>
                  <span className="repere mt-0.5 block truncate">
                    {r.symbol} · {r.exchange}
                  </span>
                </span>
                <span className="rounded-full border border-voile/10 px-2.5 py-1 text-[11.5px] text-brume">{TYPE_LABELS[r.type]}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-voile/10 pt-4">
        <button type="button" onClick={onCsv} className="touche flex items-center gap-3 rounded-2xl border border-voile/[0.08] bg-voile/[0.03] p-3.5 text-left text-[14px]">
          <IconFile className="shrink-0 text-brume" />
          Importer un CSV
        </button>
        <button type="button" onClick={onCapture} className="touche flex items-center gap-3 rounded-2xl border border-voile/[0.08] bg-voile/[0.03] p-3.5 text-left text-[14px]">
          <IconCamera className="shrink-0 text-brume" />
          Capture d&apos;écran
        </button>
      </div>
    </div>
  );
}

