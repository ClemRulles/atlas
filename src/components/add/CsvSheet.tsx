"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet } from "@/components/shell/Sheet";
import { PrimaryButton, TYPE_LABELS, inputClass } from "@/components/ui/fields";
import { parseCsv, type CsvParse, type CsvRow } from "@/lib/csv";
import type { Instrument, Transaction } from "@/lib/domain/types";
import { fetchHistory, fetchProfile, searchInstruments, type SearchResult } from "@/lib/market-client";
import { useAtlas } from "@/lib/store";
import { haptic } from "@/lib/ui";
import { instrumentFrom, newId } from "@/lib/user-data";

const FIELD_LABELS = { date: "date", quantity: "quantité", price: "prix", isin: "ISIN ou ticker" } as const;

/** Identifiant d'une ligne CSV : l'ISIN s'il existe, sinon le ticker. */
const keyOf = (row: CsvRow) => row.isin ?? row.symbol ?? "";

interface Resolution {
  status: "loading" | "found" | "missing";
  options: SearchResult[];
  chosen: string | null;
}

export function CsvSheet() {
  const { sheet, openSheet, addTransactions, portfolio } = useAtlas();
  const open = sheet === "csv";
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<CsvParse | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>({});
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requested = useRef(new Set<string>());

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- feuille rouverte : on repart de zéro
    setText("");
    setParsed(null);
    setResolutions({});
    setError(null);
    requested.current = new Set();
  }, [open]);

  const usable = useMemo(() => parsed?.rows.filter((r) => r.problems.length === 0) ?? [], [parsed]);
  const keys = useMemo(() => [...new Set(usable.map(keyOf))], [usable]);

  // Chaque identifiant est cherché une seule fois ; la cotation la mieux placée est proposée par défaut.
  useEffect(() => {
    const todo = keys.filter((k) => !requested.current.has(k));
    if (todo.length === 0) return;
    todo.forEach((k) => requested.current.add(k));
    setResolutions((r) => ({ ...r, ...Object.fromEntries(todo.map((k) => [k, { status: "loading" as const, options: [], chosen: null }])) }));
    (async () => {
      for (const key of todo) {
        const known = Object.values(portfolio.instruments).find((i) => i.isin === key || i.symbol === key);
        const options = known
          ? [{ symbol: known.symbol, name: known.name, type: known.type, exchange: known.exchange ?? "", isin: known.isin }]
          : await searchInstruments(key).catch(() => []);
        if (!requested.current.has(key)) return; // nouveau fichier entre-temps
        setResolutions((r) => ({ ...r, [key]: { status: options.length ? "found" : "missing", options, chosen: options[0]?.symbol ?? null } }));
      }
    })();
  }, [keys, portfolio.instruments]);

  async function readFile(file: File) {
    const content = await file.text();
    setText(content);
    analyse(content);
  }
  function analyse(content: string) {
    const result = parseCsv(content);
    setParsed(result);
    setResolutions({});
    requested.current = new Set();
    setError(result.missing.length ? `Colonnes introuvables : ${result.missing.map((m) => FIELD_LABELS[m as keyof typeof FIELD_LABELS] ?? m).join(", ")}. Vérifie la première ligne du fichier.` : null);
  }

  const ready = usable.filter((r) => resolutions[keyOf(r)]?.chosen);

  async function importRows() {
    setImporting(true);
    setError(null);
    const instruments: Instrument[] = [];
    const transactions: Transaction[] = [];
    const byKey = new Map<string, Instrument | null>();
    try {
      for (const key of new Set(ready.map(keyOf))) {
        const res = resolutions[key];
        const listing = res.options.find((o) => o.symbol === res.chosen);
        if (!listing) continue;
        const existing = portfolio.instruments[listing.symbol];
        if (existing) {
          byKey.set(key, existing);
          continue;
        }
        const first = ready.filter((r) => keyOf(r) === key).map((r) => r.date as string).sort()[0];
        const history = await fetchHistory(listing.symbol, first).catch(() => null);
        if (!history?.currency) {
          byKey.set(key, null);
          continue;
        }
        const profile = await fetchProfile(listing.symbol);
        const instrument = instrumentFrom({ ...listing, isin: listing.isin ?? (key.length === 12 ? key : undefined) }, history.currency, profile);
        instruments.push(instrument);
        byKey.set(key, instrument);
      }
      for (const row of ready) {
        const instrument = byKey.get(keyOf(row));
        if (!instrument) continue;
        transactions.push({
          id: newId(),
          instrumentId: instrument.id,
          side: row.side,
          date: row.date as string,
          quantity: row.quantity as number,
          price: row.price as number,
          ...(row.fees ? { fees: row.fees } : {}),
          ...(row.broker ? { broker: row.broker } : {}),
        });
      }
      const skipped = ready.length - transactions.length;
      if (transactions.length === 0) {
        setError("Aucune ligne n'a pu être importée : cours introuvables pour ces titres.");
        return;
      }
      addTransactions(instruments, transactions);
      haptic(14);
      if (skipped > 0) setError(`${transactions.length} lignes importées. ${skipped} ignorées : cours introuvable.`);
      else openSheet(null);
    } finally {
      setImporting(false);
    }
  }

  return (
    <Sheet open={open} onClose={() => openSheet(null)} title="Importer un CSV">
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="font-serif text-[28px] leading-tight">Importer un CSV</h2>
          <p className="mt-2 text-[14.5px] text-brume">L&apos;export de transactions de ton courtier. Il faut au moins une date, un ISIN ou un ticker, une quantité et un prix. Le fichier reste sur ton téléphone.</p>
        </div>

        {!parsed && (
          <>
            <label className="touche flex cursor-pointer flex-col items-center gap-1 rounded-[22px] border border-dashed border-white/20 bg-white/[0.03] px-4 py-7 text-center">
              <span className="text-[15px]">Choisir un fichier</span>
              <span className="text-[12.5px] text-ombre">.csv ou .txt, séparé par ; , ou tabulation</span>
              <input id="csv-fichier" type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" onChange={(e) => e.target.files?.[0] && void readFile(e.target.files[0])} />
            </label>
            <details className="text-[14px] text-brume">
              <summary className="cursor-pointer">Ou coller le contenu</summary>
              <textarea id="csv-texte" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Date;ISIN;Quantité;Cours;Frais\n05/03/2024;IE00B4L5Y983;10;85,12;2"} className={`${inputClass} mt-3 font-mono text-[13px]`} />
              <button type="button" onClick={() => analyse(text)} disabled={!text.trim()} className="touche mt-3 rounded-full bg-white/10 px-5 py-2.5 text-[14px] text-craie disabled:opacity-40">
                Lire
              </button>
            </details>
          </>
        )}

        {error && <p className="rounded-2xl border border-braise/30 bg-braise/10 px-4 py-3 text-[13.5px] text-craie">{error}</p>}

        {parsed && parsed.missing.length === 0 && (
          <>
            <p className="text-[14px] text-brume">
              {usable.length} {usable.length > 1 ? "lignes lisibles" : "ligne lisible"} sur {parsed.rows.length}
              {parsed.rows.length > usable.length && ", les autres sont listées plus bas"}.
            </p>
            <ul className="flex flex-col">
              {keys.map((key) => {
                const res = resolutions[key];
                const count = usable.filter((r) => keyOf(r) === key).length;
                return (
                  <li key={key} className="flex flex-col gap-2 border-t border-white/[0.07] py-3 first:border-t-0">
                    <div className="flex justify-between gap-3 text-[13px]">
                      <span className="repere">{key}</span>
                      <span className="text-ombre">
                        {count} {count > 1 ? "transactions" : "transaction"}
                      </span>
                    </div>
                    {!res || res.status === "loading" ? (
                      <div className="silhouette h-11" />
                    ) : res.status === "missing" ? (
                      <p className="text-[13.5px] text-braise">Titre introuvable : ces lignes seront ignorées.</p>
                    ) : (
                      <select
                        id={`csv-cotation-${key}`}
                        value={res.chosen ?? ""}
                        onChange={(e) => setResolutions((r) => ({ ...r, [key]: { ...res, chosen: e.target.value || null } }))}
                        className={`${inputClass} text-[14.5px]`}
                        aria-label={`Cotation pour ${key}`}
                      >
                        {res.options.map((o) => (
                          <option key={o.symbol} value={o.symbol}>
                            {o.name} · {o.symbol} · {o.exchange} · {TYPE_LABELS[o.type]}
                          </option>
                        ))}
                        <option value="">Ne pas importer</option>
                      </select>
                    )}
                  </li>
                );
              })}
            </ul>
            {parsed.rows.some((r) => r.problems.length) && (
              <details className="text-[13px] text-ombre">
                <summary className="cursor-pointer">{parsed.rows.filter((r) => r.problems.length).length} lignes ignorées</summary>
                <ul className="mt-2 flex flex-col gap-1">
                  {parsed.rows
                    .filter((r) => r.problems.length)
                    .slice(0, 30)
                    .map((r) => (
                      <li key={r.line}>
                        Ligne {r.line} : {r.problems.join(", ")}
                      </li>
                    ))}
                </ul>
              </details>
            )}
            <PrimaryButton disabled={importing || ready.length === 0} onClick={() => void importRows()}>
              {importing ? "Import en cours…" : `Importer ${ready.length} ${ready.length > 1 ? "transactions" : "transaction"}`}
            </PrimaryButton>
            <button type="button" onClick={() => setParsed(null)} className="touche text-[14px] text-brume">
              Choisir un autre fichier
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}
