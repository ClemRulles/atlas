"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Sheet } from "@/components/shell/Sheet";
import { Field, PrimaryButton, Segmented, TextInput, TYPE_LABELS, inputClass } from "@/components/ui/fields";
import { IconCamera, IconFile, IconSearch } from "@/components/ui/icons";
import { closeAt } from "@/lib/domain/market";
import type { Instrument, PricePoint } from "@/lib/domain/types";
import { formatEUR, formatNumber } from "@/lib/format";
import { fetchHistory, fetchProfile, searchInstruments, type SearchResult } from "@/lib/market-client";
import { parseNumber } from "@/lib/csv";
import { useAtlas } from "@/lib/store";
import { haptic } from "@/lib/ui";
import { heldQuantity, instrumentFrom, newId } from "@/lib/user-data";
import { localToday } from "@/lib/analysis";

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
        <p className="mb-4 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13.5px] text-brume">
          Tu regardes la démo. Ce que tu ajoutes va dans ton vrai portefeuille, et l&apos;app basculera dessus.
        </p>
      )}
      <AnimatePresence mode="wait" initial={false}>
        {picked ? (
          <motion.div key="form" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25 }}>
            <TransactionForm listing={picked} known={addPreset.instrument} initialSide={addPreset.side ?? "buy"} onBack={addPreset.instrument ? undefined : () => setPicked(null)} />
          </motion.div>
        ) : (
          <motion.div key="search" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.25 }}>
            <SearchStep onPick={setPicked} onCsv={() => openSheet("csv")} />
          </motion.div>
        )}
      </AnimatePresence>
    </Sheet>
  );
}

function SearchStep({ onPick, onCsv }: { onPick: (l: Listing) => void; onCsv: () => void }) {
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
                className="touche grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-white/[0.07] py-3 text-left first:border-t-0"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[15px]">{r.name}</span>
                  <span className="repere mt-0.5 block truncate">
                    {r.symbol} · {r.exchange}
                  </span>
                </span>
                <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11.5px] text-brume">{TYPE_LABELS[r.type]}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-4">
        <button type="button" onClick={onCsv} className="touche flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3.5 text-left text-[14px]">
          <IconFile className="shrink-0 text-brume" />
          Importer un CSV
        </button>
        <div className="flex items-center gap-3 rounded-2xl border border-white/[0.06] p-3.5 text-[14px] text-ombre">
          <IconCamera className="shrink-0" />
          <span>
            Capture d&apos;écran <span className="block text-[11px] uppercase tracking-[0.08em]">Phase 5</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function minusDays(date: string, days: number) {
  return new Date(Date.parse(date) - days * 86_400_000).toISOString().slice(0, 10);
}

function TransactionForm({ listing, known, initialSide, onBack }: { listing: Listing; known?: Instrument; initialSide: "buy" | "sell"; onBack?: () => void }) {
  const { portfolio, addTransactions, openSheet } = useAtlas();
  const today = useMemo(() => localToday(), []);
  const [side, setSide] = useState<"buy" | "sell">(initialSide);
  const [date, setDate] = useState(today);
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [fees, setFees] = useState("");
  const [broker, setBroker] = useState("");
  const [note, setNote] = useState("");
  const [history, setHistory] = useState<{ from: string; currency: string | null; points: PricePoint[] } | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);

  const brokers = useMemo(() => [...new Set(portfolio.transactions.map((t) => t.broker).filter((b): b is string => !!b))], [portfolio]);

  // Cours de la ligne autour de la date choisie : il donne la devise et propose un prix.
  useEffect(() => {
    if (history && history.from <= minusDays(date, 7)) return;
    const controller = new AbortController();
    const from = minusDays(date, 10);
    fetchHistory(listing.symbol, from, controller.signal)
      .then((h) => {
        setHistory({ from, currency: h.currency, points: h.points });
        setHistoryError(false);
      })
      .catch(() => !controller.signal.aborted && setHistoryError(true));
    return () => controller.abort();
  }, [listing.symbol, date, history]);

  const currency = known?.currency ?? history?.currency ?? null;
  const close = history ? closeAt(history.points, date) : undefined;
  const q = parseNumber(quantity);
  const p = parseNumber(price);
  const f = parseNumber(fees);
  const held = known ? heldQuantity(portfolio, known.id, date) : 0;
  const errors = {
    date: !date || date > today ? "Choisis une date passée ou aujourd'hui." : null,
    quantity: !q || q <= 0 ? "Indique une quantité positive." : side === "sell" && q > held + 1e-9 ? `Tu n'en détiens que ${formatNumber(held, { decimals: held % 1 ? 3 : 0 })} à cette date.` : null,
    price: !p || p <= 0 ? "Indique le prix unitaire payé." : null,
    fees: fees && (f === null || f < 0) ? "Frais illisibles." : null,
    currency: !currency ? (historyError ? "Cours introuvable pour cette cotation : impossible de connaître sa devise." : "Lecture de la devise…") : null,
  };
  const valid = Object.values(errors).every((e) => !e);
  const approxEUR = q && p && currency === "EUR" ? q * p : null;

  async function save() {
    setTried(true);
    if (!valid || !currency || !q || !p) return;
    setSaving(true);
    const profile = known ? {} : await fetchProfile(listing.symbol);
    const instrument = known ?? instrumentFrom(listing, currency, profile);
    addTransactions(
      [instrument],
      [
        {
          id: newId(),
          instrumentId: instrument.id,
          side,
          date,
          quantity: q,
          price: p,
          ...(f ? { fees: f } : {}),
          ...(broker.trim() ? { broker: broker.trim() } : {}),
          ...(side === "buy" && note.trim() ? { note: note.trim() } : {}),
        },
      ],
    );
    haptic(14);
    setSaving(false);
    openSheet(null);
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="flex items-start gap-3">
        {onBack && (
          <button type="button" onClick={onBack} className="touche -ml-1 rounded-full px-2 py-1 text-[22px] leading-none text-brume" aria-label="Revenir à la recherche">
            ‹
          </button>
        )}
        <div className="min-w-0">
          <span className="repere block truncate">
            {[listing.symbol, listing.exchange, TYPE_LABELS[listing.type], currency].filter(Boolean).join(" · ")}
          </span>
          <h2 className="mt-1 font-serif text-[26px] leading-tight">{listing.name}</h2>
        </div>
      </div>

      <Segmented
        label="Sens de l'opération"
        value={side}
        onChange={setSide}
        options={[
          { value: "buy", label: "Achat" },
          { value: "sell", label: "Vente" },
        ]}
      />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" error={tried ? errors.date : null}>
          <TextInput id="saisie-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Quantité" error={tried ? errors.quantity : null}>
          <TextInput id="saisie-quantite" inputMode="decimal" placeholder="10" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </Field>
      </div>

      <Field
        label={`Prix unitaire${currency ? ` (${currency})` : ""}`}
        error={tried ? errors.price ?? errors.currency : historyError ? errors.currency : null}
        hint={
          close ? (
            <button type="button" className="text-left underline decoration-white/30 underline-offset-2" onClick={() => setPrice(formatNumber(close.close, { decimals: close.close < 10 ? 3 : 2 }).replace(/\s/g, ""))}>
              Clôture du {new Intl.DateTimeFormat("fr-BE", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(close.date))} : {formatNumber(close.close, { decimals: 2 })} {currency}. Utiliser ce prix
            </button>
          ) : (
            "Le prix réellement payé, hors frais."
          )
        }
      >
        <TextInput id="saisie-prix" inputMode="decimal" placeholder={close ? formatNumber(close.close, { decimals: 2 }) : "85,12"} value={price} onChange={(e) => setPrice(e.target.value)} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Frais (€)" error={tried ? errors.fees : null}>
          <TextInput id="saisie-frais" inputMode="decimal" placeholder="0" value={fees} onChange={(e) => setFees(e.target.value)} />
        </Field>
        <Field label="Courtier">
          <TextInput id="saisie-courtier" list="courtiers" placeholder="Bolero" value={broker} onChange={(e) => setBroker(e.target.value)} />
          <datalist id="courtiers">
            {brokers.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </Field>
      </div>

      {side === "buy" && (
        <Field label="Ta conviction, en une phrase" hint="Atlas te la ressortira dans six mois.">
          <textarea id="saisie-conviction" rows={2} maxLength={240} placeholder="Pourquoi tu achètes ?" value={note} onChange={(e) => setNote(e.target.value)} className={`${inputClass} resize-none`} />
        </Field>
      )}

      {approxEUR !== null && <p className="text-[13px] text-brume">Montant : {formatEUR(approxEUR + (f ?? 0), { decimals: 2 })}, frais compris.</p>}

      <PrimaryButton type="submit" disabled={saving || (tried && !valid)}>
        {saving ? "Enregistrement…" : side === "buy" ? "Ajouter l'achat" : "Ajouter la vente"}
      </PrimaryButton>
    </form>
  );
}
