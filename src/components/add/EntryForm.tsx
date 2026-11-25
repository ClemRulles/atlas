"use client";

import { useEffect, useMemo, useState } from "react";
import { Field, PrimaryButton, TextInput, TYPE_LABELS, inputClass } from "@/components/ui/fields";
import { localToday } from "@/lib/analysis";
import { parseNumber } from "@/lib/csv";
import { expandPlan, planDates } from "@/lib/domain/plans";
import type { Instrument, SavingsPlan } from "@/lib/domain/types";
import { buyFromEuros, holdingFromEuros, quoteAt, sellFromEuros, type Quotes } from "@/lib/entry";
import { formatEUR, formatNumber } from "@/lib/format";
import { fetchHistory, fetchProfile, type SearchResult } from "@/lib/market-client";
import { useAtlas, type EntryKind } from "@/lib/store";
import { haptic } from "@/lib/ui";
import { fxKey, heldQuantity, instrumentFrom, newId } from "@/lib/user-data";

type Listing = Pick<SearchResult, "symbol" | "name" | "type" | "exchange" | "isin">;

const KINDS: { value: EntryKind; label: string; hint: string }[] = [
  { value: "plan", label: "Plan d'épargne", hint: "Un montant chaque mois" },
  { value: "own", label: "Je possède", hint: "Ce que j'ai aujourd'hui" },
  { value: "buy", label: "Un achat", hint: "Une date, un montant" },
  { value: "sell", label: "Une vente", hint: "Des parts vendues" },
];

const monthInput = (date: string) => date.slice(0, 7);
/** Même jour, `n` mois plus tard (AAAA-MM-JJ, jour ramené à 28 au plus). */
const monthAhead = (date: string, n: number) => {
  const d = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return `${d.toISOString().slice(0, 7)}-28`;
};
const firstExecution = (plan: SavingsPlan) =>
  new Intl.DateTimeFormat("fr-BE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${plan.start.slice(0, 7)}-${String(plan.dayOfMonth).padStart(2, "0")}T12:00:00Z`));
const minusDays = (date: string, days: number) => new Date(Date.parse(date) - days * 86_400_000).toISOString().slice(0, 10);
const longDate = (d: string) => new Intl.DateTimeFormat("fr-BE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

/** Charge les cours d'un titre (et de sa devise) depuis une date : de quoi tout exprimer en euros. */
function useQuotes(symbol: string, from: string, knownCurrency?: string) {
  const [quotes, setQuotes] = useState<(Quotes & { from: string }) | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (quotes && quotes.from <= from) return;
    const controller = new AbortController();
    (async () => {
      try {
        const h = await fetchHistory(symbol, from, controller.signal);
        const currency = knownCurrency ?? h.currency;
        if (!currency) throw new Error("devise inconnue");
        const fx = currency === "EUR" ? [] : (await fetchHistory(fxKey(currency), from, controller.signal)).points;
        setQuotes({ currency, points: h.points, fx, from });
        setError(false);
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    })();
    return () => controller.abort();
  }, [symbol, from, knownCurrency, quotes]);
  return { quotes, error };
}

export function EntryForm({ listing, known, initialKind, onBack }: { listing: Listing; known?: Instrument; initialKind: EntryKind; onBack?: () => void }) {
  const { addTransactions, savePlan, openSheet, data, portfolio } = useAtlas();
  const today = useMemo(() => localToday(), []);
  const [kind, setKind] = useState<EntryKind>(initialKind);
  const [date, setDate] = useState(today);
  const [start, setStart] = useState(monthInput(minusDays(today, 365)));
  const [day, setDay] = useState("2");
  const [stopped, setStopped] = useState(false);
  const [end, setEnd] = useState(monthInput(today));
  const [amount, setAmount] = useState("");
  const [fees, setFees] = useState("");
  const [quantity, setQuantity] = useState("");
  const [invested, setInvested] = useState("");
  const [ownBy, setOwnBy] = useState<"value" | "parts">("value");
  const [knowParts, setKnowParts] = useState(false);
  const [broker, setBroker] = useState(kind === "plan" ? "Trade Republic" : "");
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);

  const earliest = kind === "plan" ? `${start}-01` : date;
  const { quotes, error } = useQuotes(listing.symbol, minusDays(earliest < today ? earliest : today, 10), known?.currency);
  const brokers = useMemo(() => [...new Set(portfolio.transactions.map((t) => t.broker).filter((b): b is string => !!b).concat(["Trade Republic"]))], [portfolio]);

  const a = parseNumber(amount);
  const f = parseNumber(fees) ?? 0;
  const q = parseNumber(quantity);
  const inv = parseNumber(invested);
  const instrumentId = known?.id ?? listing.symbol;
  const at = quotes ? quoteAt(quotes, kind === "own" ? today : date) : null;
  const held = known && data ? heldQuantity(data.transactions, known.id, date) : 0;

  // Aperçu de ce que l'app va enregistrer, calculé avec les vrais cours.
  const plan: SavingsPlan | null =
    a && a > 0 ? { id: newId("plan"), instrumentId, amountEUR: a, dayOfMonth: Math.min(28, Math.max(1, Number(day) || 2)), start: `${start}-01`, ...(stopped && start <= monthInput(today) ? { end: `${end < start ? start : end}-28` } : {}), ...(f ? { fees: f } : {}), ...(broker.trim() ? { broker: broker.trim() } : {}) } : null;
  const preview = useMemo(() => {
    if (!quotes) return null;
    const instrument: Instrument = known ?? { id: instrumentId, symbol: listing.symbol, name: listing.name, type: listing.type, currency: quotes.currency };
    const market = { prices: { [instrumentId]: quotes.points }, fx: quotes.currency === "EUR" ? {} : { [quotes.currency]: quotes.fx } };
    const now = quoteAt(quotes, today);
    if (kind === "plan" && plan) {
      const e = expandPlan(plan, instrument, market, today);
      const parts = e.transactions.reduce((s, t) => s + t.quantity, 0);
      return { months: planDates(plan, today).length, parts, valueEUR: now ? parts * now.closeEUR : null, paidEUR: planDates(plan, today).length * plan.amountEUR };
    }
    return null;
  }, [quotes, kind, plan?.amountEUR, plan?.dayOfMonth, plan?.start, plan?.end, plan?.fees, today]); // eslint-disable-line react-hooks/exhaustive-deps

  function problem(): string | null {
    if (error) return "Cours introuvables pour ce titre : impossible de calculer en euros.";
    if (!quotes) return "Lecture des cours…";
    if (kind === "plan") {
      if (!a || a <= 0) return "Indique le montant investi chaque mois.";
      if (`${start}-01` > monthAhead(today, 12)) return "Le premier versement doit tomber dans les douze prochains mois.";
      return null;
    }
    if (date > today) return "Choisis une date passée ou aujourd'hui.";
    if (!at) return "Pas de cours connu à cette date.";
    if (kind === "buy" && (!a || a <= f)) return "Indique le montant payé, frais compris.";
    if (kind === "sell" && (!q || q <= 0)) return "Indique le nombre de parts vendues.";
    if (kind === "sell" && q && q > held + 1e-9) return `Tu n'en détiens que ${formatNumber(held, { decimals: held % 1 ? 4 : 0 })} à cette date.`;
    if (kind === "own" && ownBy === "value" && (!a || a <= 0)) return "Indique la valeur actuelle de la ligne.";
    if (kind === "own" && ownBy === "parts" && (!q || q <= 0)) return "Indique le nombre de parts.";
    return null;
  }
  const issue = problem();

  async function save() {
    setTried(true);
    if (issue || !quotes) return;
    setSaving(true);
    const instrument = known ?? instrumentFrom(listing, quotes.currency, await fetchProfile(listing.symbol));
    const base = { id: newId(), instrumentId: instrument.id, ...(broker.trim() ? { broker: broker.trim() } : {}) };
    if (kind === "plan" && plan) {
      savePlan(instrument, { ...plan, instrumentId: instrument.id });
    } else {
      const t =
        kind === "buy"
          ? buyFromEuros(quotes, { ...base, date, paidEUR: a ?? 0, feesEUR: f, quantity: knowParts ? (q ?? undefined) : undefined, note: note.trim() || undefined })
          : kind === "sell"
            ? sellFromEuros(quotes, { ...base, date, quantity: q ?? 0, receivedEUR: a ?? undefined, feesEUR: f })
            : holdingFromEuros(quotes, { ...base, date, today, quantity: ownBy === "parts" ? (q ?? undefined) : undefined, valueEUR: ownBy === "value" ? (a ?? undefined) : undefined, investedEUR: inv ?? undefined, note: note.trim() || undefined });
      if (!t) {
        setSaving(false);
        return;
      }
      addTransactions([instrument], [t]);
    }
    haptic(14);
    setSaving(false);
    openSheet(null);
  }

  const euros = (label: string, value: string, set: (v: string) => void, id: string, placeholder: string, hint?: React.ReactNode) => (
    <Field label={label} hint={hint}>
      <div className="relative">
        <TextInput id={id} inputMode="decimal" placeholder={placeholder} value={value} onChange={(e) => set(e.target.value)} className="pr-10" />
        <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-ombre">€</span>
      </div>
    </Field>
  );

  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => (e.preventDefault(), void save())}>
      <div className="flex items-start gap-3">
        {onBack && (
          <button type="button" onClick={onBack} className="touche -ml-1 rounded-full px-2 py-1 text-[22px] leading-none text-brume" aria-label="Revenir à la recherche">
            ‹
          </button>
        )}
        <div className="min-w-0">
          <span className="repere block truncate">{[listing.symbol, listing.exchange, TYPE_LABELS[listing.type]].filter(Boolean).join(" · ")}</span>
          <h2 className="mt-1 font-serif text-[26px] leading-tight">{known?.name ?? listing.name}</h2>
          {at && <p className="mt-1 text-[13px] text-brume">Cours du {longDate(at.date)} : {formatEUR(at.closeEUR, { decimals: 2 })}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Que veux-tu ajouter ?">
        {KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            aria-pressed={kind === k.value}
            onClick={() => (haptic(), setKind(k.value), k.value === "plan" && !broker && setBroker("Trade Republic"))}
            className={`touche rounded-2xl border px-3.5 py-3 text-left ${kind === k.value ? "border-voile/30 bg-voile/[0.1]" : "border-voile/[0.07] bg-voile/[0.03]"}`}
          >
            <span className="block text-[14.5px]">{k.label}</span>
            <span className="block text-[12px] text-ombre">{k.hint}</span>
          </button>
        ))}
      </div>

      {kind === "plan" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {euros("Montant par mois", amount, setAmount, "plan-montant", "200")}
            <Field label="Jour du mois">
              <TextInput id="plan-jour" inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value)} />
            </Field>
            <Field label="Depuis" hint={<button type="button" className="underline" onClick={() => setStart(monthInput(monthAhead(today, 1)))}>Il commence le mois prochain</button>}>
              <TextInput id="plan-debut" type="month" value={start} max={monthInput(monthAhead(today, 12))} onChange={(e) => setStart(e.target.value)} />
            </Field>
            {start <= monthInput(today) && <Field label="Toujours en cours ?">
              <button type="button" onClick={() => setStopped(!stopped)} className={`${inputClass} text-left`}>
                {stopped ? "Non, arrêté" : "Oui"}
              </button>
            </Field>}
            {stopped && start <= monthInput(today) && (
              <Field label="Dernier mois">
                <TextInput id="plan-fin" type="month" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
              </Field>
            )}
          </div>
          {plan && preview && preview.months === 0 && (
            <p className="rounded-2xl bg-voile/[0.04] px-4 py-3 text-[14px] leading-relaxed">
              Premier versement le {firstExecution(plan)} : {formatEUR(plan.amountEUR)} par mois ensuite. Le plan compte déjà dans le simulateur du futur.
            </p>
          )}
          {preview && preview.months > 0 && (
            <p className="rounded-2xl bg-voile/[0.04] px-4 py-3 text-[14px] leading-relaxed">
              {preview.months} versements, {formatEUR(preview.paidEUR)} au total, soit environ {formatNumber(preview.parts, { decimals: 2 })} parts
              {preview.valueEUR !== null && <> qui valent {formatEUR(preview.valueEUR)} aujourd&apos;hui</>}.
              <span className="block text-[12.5px] text-ombre">Chaque mois, l&apos;app achète au cours de clôture du jour d&apos;exécution : c&apos;est très proche du prix réel.</span>
            </p>
          )}
        </>
      )}

      {kind === "buy" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <TextInput id="achat-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            </Field>
            {euros("Montant payé", amount, setAmount, "achat-montant", "1000", "Frais compris")}
          </div>
          <button type="button" onClick={() => setKnowParts(!knowParts)} className="touche self-start text-[13px] text-brume underline decoration-voile/20 underline-offset-2">
            {knowParts ? "Je ne connais pas le nombre de parts" : "Je connais le nombre exact de parts"}
          </button>
          {knowParts && (
            <Field label="Parts obtenues">
              <TextInput id="achat-parts" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </Field>
          )}
          {!knowParts && at && a && a > f && <p className="text-[13px] text-brume">≈ {formatNumber((a - f) / at.closeEUR, { decimals: 4 })} parts au cours du {longDate(at.date)}.</p>}
        </>
      )}

      {kind === "sell" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <TextInput id="vente-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Parts vendues" hint={held > 0 ? <button type="button" className="underline" onClick={() => setQuantity(String(held))}>Tout vendre ({formatNumber(held, { decimals: held % 1 ? 4 : 0 })})</button> : undefined}>
            <TextInput id="vente-parts" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </Field>
          {euros("Montant reçu (facultatif)", amount, setAmount, "vente-montant", at && q ? formatNumber(q * at.closeEUR, { decimals: 0 }) : "", "Sinon, cours de clôture du jour")}
        </div>
      )}

      {kind === "own" && (
        <>
          <div className="flex gap-2 text-[13px]">
            <button type="button" onClick={() => setOwnBy("value")} className={`touche rounded-full px-3.5 py-1.5 ${ownBy === "value" ? "bg-voile/[0.12]" : "text-brume"}`}>Je connais sa valeur</button>
            <button type="button" onClick={() => setOwnBy("parts")} className={`touche rounded-full px-3.5 py-1.5 ${ownBy === "parts" ? "bg-voile/[0.12]" : "text-brume"}`}>Je connais le nombre de parts</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {ownBy === "value" ? (
              euros("Valeur aujourd'hui", amount, setAmount, "possede-valeur", "2500", "Comme affiché chez ton courtier")
            ) : (
              <Field label="Nombre de parts">
                <TextInput id="possede-parts" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </Field>
            )}
            {euros("Total investi (facultatif)", invested, setInvested, "possede-investi", "2000", "Pour calculer ta plus-value")}
            <Field label="Depuis (environ)">
              <TextInput id="possede-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        {kind !== "plan" && euros("Frais", fees, setFees, "saisie-frais", "0")}
        <Field label="Courtier">
          <TextInput id="saisie-courtier" list="courtiers" placeholder="Trade Republic" value={broker} onChange={(e) => setBroker(e.target.value)} />
          <datalist id="courtiers">{brokers.map((b) => <option key={b} value={b} />)}</datalist>
        </Field>
      </div>

      {(kind === "buy" || kind === "own") && (
        <Field label="Ta conviction, en une phrase" hint="Atlas te la ressortira dans six mois.">
          <textarea id="saisie-conviction" rows={2} maxLength={240} placeholder="Pourquoi tu as investi ?" value={note} onChange={(e) => setNote(e.target.value)} className={`${inputClass} resize-none`} />
        </Field>
      )}

      {tried && issue && <p className="text-[13.5px] text-braise">{issue}</p>}
      {!tried && error && <p className="text-[13.5px] text-braise">{issue}</p>}

      <PrimaryButton type="submit" disabled={saving || (tried && !!issue)}>
        {saving ? "Enregistrement…" : kind === "plan" ? "Ajouter le plan d'épargne" : kind === "sell" ? "Ajouter la vente" : "Ajouter"}
      </PrimaryButton>
    </form>
  );
}
