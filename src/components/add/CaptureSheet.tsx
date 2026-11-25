"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/shell/Sheet";
import { Field, PrimaryButton, TextInput, TYPE_LABELS, inputClass } from "@/components/ui/fields";
import { localToday } from "@/lib/analysis";
import { parseNumber } from "@/lib/csv";
import type { Instrument, Transaction } from "@/lib/domain/types";
import { holdingFromEuros } from "@/lib/entry";
import { formatEUR } from "@/lib/format";
import { fetchHistory, fetchProfile, searchInstruments, type SearchResult } from "@/lib/market-client";
import { investedFrom, parseScreenshotText } from "@/lib/screenshot-parse";
import { useAtlas } from "@/lib/store";
import { haptic } from "@/lib/ui";
import { fxKey, instrumentFrom, newId } from "@/lib/user-data";

interface Row {
  id: string;
  include: boolean;
  name: string;
  value: string;
  invested: string;
  options: SearchResult[];
  chosen: string | null;
  searching: boolean;
}

const minusDays = (date: string, days: number) => new Date(Date.parse(date) - days * 86_400_000).toISOString().slice(0, 10);
const toInput = (n: number | null) => (n === null ? "" : n.toFixed(2).replace(".", ","));

/** Raccourcit un nom d'écran (« Core MSCI World USD (Acc) ») pour une recherche plus large. */
const searchable = (name: string) => name.replace(/\((acc|dist)\)/gi, "").replace(/\b(USD|EUR|UCITS|ETF|Acc|Dist)\b/gi, "").replace(/\s+/g, " ").trim();

/**
 * Import par capture d'écran : la reconnaissance de texte tourne dans le navigateur (Tesseract.js),
 * l'image ne quitte pas l'appareil. Chaque ligne lue est rapprochée d'un titre, puis validée.
 */
export function CaptureSheet() {
  const { sheet, openSheet, addTransactions, portfolio } = useAtlas();
  const open = sheet === "capture";
  // La date n'existe qu'au navigateur : elle est posée à l'ouverture de la feuille.
  const [today, setToday] = useState("");
  const [stage, setStage] = useState<"choose" | "reading" | "review">("choose");
  const [progress, setProgress] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [since, setSince] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const now = localToday();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- feuille rouverte : on repart de zéro
    setToday(now);
    setSince(minusDays(now, 365));
    setStage("choose");
    setRows([]);
    setMessage(null);
  }, [open]);

  async function lookup(id: string, query: string) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, searching: true } : r)));
    const options = await searchInstruments(searchable(query) || query).catch(() => []);
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, options, chosen: options[0]?.symbol ?? null, searching: false } : r)));
  }

  async function read(file: File) {
    setStage("reading");
    setProgress(0);
    setMessage(null);
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("fra", 1, { logger: (m: { status: string; progress: number }) => m.status === "recognizing text" && setProgress(m.progress) });
      const { data } = await worker.recognize(file);
      await worker.terminate();
      const lines = parseScreenshotText(data.text);
      if (lines.length === 0) {
        setMessage("Aucune ligne avec un montant en euros n'a été lue. Essaie une capture plus nette de l'écran Portefeuille, sans le graphique.");
        setStage("choose");
        return;
      }
      const next = lines.map((l) => ({ id: newId("c"), include: true, name: l.name, value: toInput(l.valueEUR), invested: toInput(investedFrom(l)), options: [], chosen: null, searching: true }));
      setRows(next);
      setStage("review");
      for (const r of next) await lookup(r.id, r.name);
    } catch {
      setMessage("La lecture de l'image a échoué. Vérifie ta connexion (le moteur de lecture se télécharge la première fois) et réessaie.");
      setStage("choose");
    }
  }

  async function importRows() {
    setImporting(true);
    setMessage(null);
    const instruments: Instrument[] = [];
    const transactions: Transaction[] = [];
    let skipped = 0;
    for (const r of rows.filter((x) => x.include)) {
      const listing = r.options.find((o) => o.symbol === r.chosen);
      const value = parseNumber(r.value);
      if (!listing || !value) {
        skipped++;
        continue;
      }
      try {
        const from = minusDays(since < today ? since : today, 10);
        const h = await fetchHistory(listing.symbol, from);
        const existing = portfolio.instruments[listing.symbol];
        const currency = existing?.currency ?? h.currency;
        if (!currency) throw new Error("devise");
        const fx = currency === "EUR" ? [] : (await fetchHistory(fxKey(currency), from)).points;
        const instrument = existing ?? instrumentFrom(listing, currency, await fetchProfile(listing.symbol));
        const t = holdingFromEuros({ currency, points: h.points, fx }, { id: newId(), instrumentId: instrument.id, date: since, today, valueEUR: value, investedEUR: parseNumber(r.invested) ?? undefined, broker: "Trade Republic" });
        if (!t) throw new Error("cours");
        if (!existing) instruments.push(instrument);
        transactions.push(t);
      } catch {
        skipped++;
      }
    }
    setImporting(false);
    if (transactions.length === 0) {
      setMessage("Rien n'a pu être importé : vérifie les titres choisis.");
      return;
    }
    addTransactions(instruments, transactions);
    haptic(14);
    if (skipped) setMessage(`${transactions.length} lignes importées, ${skipped} ignorées (titre ou cours introuvable).`);
    else openSheet(null);
  }

  return (
    <Sheet open={open} onClose={() => openSheet(null)} title="Importer une capture d'écran">
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="font-serif text-[28px] leading-tight">Importer une capture</h2>
          <p className="mt-2 text-[14.5px] text-brume">
            Dans Trade Republic, ouvre ton portefeuille et fais une capture d&apos;écran de la liste de tes titres. Atlas lit les noms et les montants sur ton téléphone : l&apos;image n&apos;est envoyée nulle part.
          </p>
        </div>

        {stage === "choose" && (
          <label className="touche flex cursor-pointer flex-col items-center gap-1 rounded-[22px] border border-dashed border-voile/20 bg-voile/[0.03] px-4 py-7 text-center">
            <span className="text-[15px]">Choisir une capture</span>
            <span className="text-[12.5px] text-ombre">Une capture à la fois ; recommence pour la suite de la liste</span>
            <input id="capture-fichier" type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && void read(e.target.files[0])} />
          </label>
        )}

        {stage === "reading" && (
          <div className="flex flex-col gap-2">
            <p className="text-[14px] text-brume">Lecture de l&apos;image… {Math.round(progress * 100)} %</p>
            <div className="h-1.5 overflow-hidden rounded-full bg-voile/10">
              <i className="block h-full rounded-full bg-craie transition-[width] duration-300" style={{ width: `${Math.max(4, progress * 100)}%` }} />
            </div>
          </div>
        )}

        {stage === "review" && (
          <>
            <p className="text-[14px] text-brume">Vérifie chaque ligne : le titre reconnu, sa valeur et ce que tu y as investi (déduit de la performance affichée, si elle était visible).</p>
            <ul className="flex flex-col gap-3">
              {rows.map((r) => (
                <li key={r.id} className={`flex flex-col gap-2 rounded-[18px] border border-voile/[0.08] p-3.5 ${r.include ? "bg-voile/[0.04]" : "opacity-50"}`}>
                  <div className="flex items-center gap-2">
                    <input id={`capture-inclure-${r.id}`} type="checkbox" checked={r.include} onChange={(e) => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, include: e.target.checked } : x)))} className="h-4 w-4 accent-white" aria-label={`Importer ${r.name}`} />
                    <TextInput id={`capture-nom-${r.id}`} aria-label="Nom lu" value={r.name} onChange={(e) => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)))} className="!py-2 text-[14.5px]" />
                    <button type="button" onClick={() => void lookup(r.id, r.name)} className="touche shrink-0 rounded-full bg-voile/[0.08] px-3 py-2 text-[12.5px]">Chercher</button>
                  </div>
                  {r.searching ? (
                    <div className="silhouette h-10" />
                  ) : r.options.length === 0 ? (
                    <p className="text-[13px] text-braise">Titre introuvable : corrige le nom puis « Chercher ».</p>
                  ) : (
                    <select id={`capture-titre-${r.id}`} value={r.chosen ?? ""} onChange={(e) => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, chosen: e.target.value } : x)))} className={`${inputClass} !py-2 text-[14px]`} aria-label={`Titre pour ${r.name}`}>
                      {r.options.map((o) => (
                        <option key={o.symbol} value={o.symbol}>
                          {o.name} · {o.symbol} · {o.exchange} · {TYPE_LABELS[o.type]}
                        </option>
                      ))}
                    </select>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Valeur (€)">
                      <TextInput id={`capture-valeur-${r.id}`} inputMode="decimal" value={r.value} onChange={(e) => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, value: e.target.value } : x)))} className="!py-2" />
                    </Field>
                    <Field label="Investi (€)">
                      <TextInput id={`capture-investi-${r.id}`} inputMode="decimal" placeholder="inconnu" value={r.invested} onChange={(e) => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, invested: e.target.value } : x)))} className="!py-2" />
                    </Field>
                  </div>
                </li>
              ))}
            </ul>
            <Field label="Tu as commencé à investir vers" hint="Sert seulement à dessiner ta courbe ; la plus-value vient du montant investi.">
              <TextInput id="capture-depuis" type="date" value={since} max={today} onChange={(e) => setSince(e.target.value)} />
            </Field>
            <PrimaryButton disabled={importing || !rows.some((r) => r.include && r.chosen)} onClick={() => void importRows()}>
              {importing ? "Import en cours…" : `Importer ${rows.filter((r) => r.include && r.chosen).length} lignes (${formatEUR(rows.filter((r) => r.include).reduce((s, r) => s + (parseNumber(r.value) ?? 0), 0))})`}
            </PrimaryButton>
            <p className="text-[12.5px] text-ombre">Tes versements mensuels ? Ajoute ensuite tes plans d&apos;épargne dans « Mon patrimoine » plutôt que de les compter ici deux fois.</p>
          </>
        )}

        {message && <p className="rounded-2xl border border-voile/10 bg-voile/[0.04] px-4 py-3 text-[13.5px]">{message}</p>}
      </div>
    </Sheet>
  );
}
