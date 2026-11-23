"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { EmptyPortfolio, PageSkeleton } from "@/components/shell/states";
import { Field, Segmented, TextInput, TYPE_LABELS, inputClass } from "@/components/ui/fields";
import { IconSearch } from "@/components/ui/icons";
import { Card, Money, Pct, Reveal } from "@/components/ui/primitives";
import { convictions, type PortfolioData, type Snapshot } from "@/lib/analysis";
import { parseNumber } from "@/lib/csv";
import { overlap, type Axis } from "@/lib/domain/lookthrough";
import type { FundComposition, Instrument, PriceHistory } from "@/lib/domain/types";
import { formatEUR, formatPct } from "@/lib/format";
import { applyShock, benchmarkFor, blendIndices, CRISES, lazyTwin, PROFILES, replayCrisis, simulate, whatIfBuy, WORLD_PARTS, type Crisis } from "@/lib/lab/lab";
import { fetchComposition, fetchHistory, fetchProfile, searchInstruments, type SearchResult } from "@/lib/market-client";
import { useAtlas } from "@/lib/store";
import { haptic } from "@/lib/ui";
import { instrumentFrom } from "@/lib/user-data";
import { LabChart, Legend } from "./LabChart";

type ToolId = "futur" | "crises" | "jumeau" | "avant" | "choc" | "convictions";

const TOOLS: { id: ToolId; label: string }[] = [
  { id: "futur", label: "Le futur" },
  { id: "crises", label: "Les crises" },
  { id: "jumeau", label: "Le jumeau" },
  { id: "avant", label: "Avant d'acheter" },
  { id: "choc", label: "Un choc" },
  { id: "convictions", label: "Convictions" },
];

export function LabView() {
  const { snapshot, mode, data, portfolio } = useAtlas();
  const [tool, setTool] = useState<ToolId>("futur");
  // Les plans d'épargne en cours donnent le versement mensuel de départ du simulateur.
  const plansMonthly = mode === "real" ? (portfolio.plans ?? []).filter((p) => !p.end || p.end >= (snapshot?.today ?? "")).reduce((s, p) => s + p.amountEUR, 0) : 0;
  if (!snapshot || !data) return <PageSkeleton />;
  if (mode === "real" && snapshot.lines.length === 0) return <EmptyPortfolio question="Et si… ?" />;

  return (
    <div className="flex flex-col gap-8">
      <Reveal>
        <div className="flex max-w-3xl flex-col gap-4">
          <span className="repere">Le laboratoire</span>
          <h1 className="font-serif text-[clamp(36px,9vw,60px)] leading-[1.02] font-light tracking-[-0.02em] text-balance">
            Et si… <em className="text-brume">Essaie des futurs sans toucher à rien.</em>
          </h1>
          <p className="max-w-xl text-[15.5px] leading-relaxed text-brume">Des expériences sur ton portefeuille. Elles éclairent, elles ne prédisent pas et ne conseillent pas : chaque résultat est illustratif.</p>
        </div>
      </Reveal>
      <Reveal i={1}>
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="tablist" aria-label="Expériences">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tool === t.id}
              onClick={() => (haptic(), setTool(t.id))}
              className={`touche shrink-0 rounded-full px-4 py-2.5 text-[14px] ${tool === t.id ? "bg-white text-nuit" : "verre text-brume"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Reveal>
      <AnimatePresence mode="wait">
        <motion.div key={tool} initial={{ opacity: 0, y: 14, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
          {tool === "futur" && <FutureTool snapshot={snapshot} expectedReturn={data.expectedReturn} plansMonthly={plansMonthly} />}
          {tool === "crises" && <CrisesTool snapshot={snapshot} />}
          {tool === "jumeau" && <TwinTool snapshot={snapshot} data={data} />}
          {tool === "avant" && <BeforeBuyTool snapshot={snapshot} data={data} />}
          {tool === "choc" && <ShockTool snapshot={snapshot} data={data} />}
          {tool === "convictions" && <ConvictionsTool data={data} today={snapshot.today} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Headline({ children }: { children: React.ReactNode }) {
  return <p className="font-serif text-[clamp(23px,5.5vw,30px)] leading-[1.18] font-[350] text-balance">{children}</p>;
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-[12.5px] leading-relaxed text-ombre">{children}</p>;
}

/* ——— Le futur ——— */

function FutureTool({ snapshot, expectedReturn, plansMonthly }: { snapshot: Snapshot; expectedReturn: number; plansMonthly: number }) {
  const [monthly, setMonthly] = useState(plansMonthly > 0 ? Math.round(plansMonthly / 50) * 50 || 50 : 500);
  const [years, setYears] = useState(15);
  const [profileId, setProfileId] = useState<(typeof PROFILES)[number]["id"]>("equilibre");
  const profile = PROFILES.find((p) => p.id === profileId)!;
  const thisYear = Number(snapshot.today.slice(0, 4));
  // Paliers : le capital à partir duquel le rendement attendu paie chaque dépense (cumulée).
  const thresholdsKey = snapshot.life.slices.map((s) => s.capitalNeededEUR).filter((c): c is number => c !== null).join(",");
  const start = snapshot.totalEUR;
  const sim = useMemo(
    () => simulate({ start, monthly, years, profile, paths: 1500, thresholds: thresholdsKey ? thresholdsKey.split(",").map(Number) : [] }),
    [start, monthly, years, profile, thresholdsKey],
  );
  const last = sim.points[sim.points.length - 1];
  const reached = sim.milestones.map((m, i) => ({ ...m, label: snapshot.life.slices[i]?.expense.label })).filter((m) => m.year !== null && m.year > 0);

  return (
    <Card className="flex flex-col gap-5">
      <Headline>
        Dans {years} ans, en {thisYear + years}, le scénario médian donne <Money value={last.p50} className="font-sans text-[0.85em] font-medium" />.{" "}
        <span className="text-brume">
          Dans 8 cas sur 10, entre <Money value={last.p10} /> et <Money value={last.p90} />.
        </span>
      </Headline>
      <LabChart
        animationKey={`${monthly}-${years}-${profileId}`}
        xLabels={sim.points.map((p) => String(thisYear + p.year))}
        band={{ low: sim.points.map((p) => p.p10), high: sim.points.map((p) => p.p90) }}
        lines={[
          { values: sim.points.map((p) => p.p50), style: "main", label: "Scénario médian" },
          { values: sim.points.map((p) => p.invested), style: "dashed", label: "Argent versé" },
        ]}
        markers={reached.map((m) => ({ index: m.year as number, label: m.label ?? "" }))}
      />
      <Legend items={[{ label: "Médian", style: "main" }, { label: "8 cas sur 10", style: "band" }, { label: "Versé", style: "dashed" }, { label: "Palier", style: "marker" }]} />
      {reached.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {reached.map((m) => (
            <li key={m.capital} className="text-[14.5px]">
              <span className="font-medium tabular">{thisYear + (m.year as number)}</span> : avec {formatPct(expectedReturn, { decimals: 1 })} par an, ton patrimoine paierait aussi « {m.label} » chaque mois.
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={`Versement : ${formatEUR(monthly)} par mois`} hint={plansMonthly > 0 ? `Tes plans d'épargne : ${formatEUR(plansMonthly)} par mois` : undefined}>
          <input id="futur-versement" type="range" min={0} max={3000} step={50} value={monthly} onChange={(e) => setMonthly(Number(e.target.value))} className="w-full accent-white" />
        </Field>
        <Field label={`Horizon : ${years} ans`}>
          <input id="futur-horizon" type="range" min={1} max={40} step={1} value={years} onChange={(e) => setYears(Number(e.target.value))} className="w-full accent-white" />
        </Field>
        <Field label="Profil de rendement">
          <Segmented label="Profil de rendement" value={profileId} onChange={setProfileId} options={PROFILES.map((p) => ({ value: p.id, label: p.label }))} />
        </Field>
      </div>
      <Note>
        Illustratif. {PROFILES.map((p) => `${p.label} : ${formatPct(p.annualReturn, { decimals: 0 })} par an en médiane, volatilité ${formatPct(p.volatility, { decimals: 0 })}`).join(" ; ")}. 1 500 trajectoires tirées au hasard, sans inflation, frais ni impôts. Les paliers utilisent le scénario médian et le rendement attendu de tes morceaux de vie.
      </Note>
    </Card>
  );
}

/* ——— Les crises ——— */

const INDEX_SYMBOLS = ["^GSPC", "^STOXX50E", "EEM", "^NDX"];

function useIndices(from: string) {
  const [indices, setIndices] = useState<Record<string, PriceHistory> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    Promise.all(INDEX_SYMBOLS.map((s) => fetchHistory(s, from).then((h) => [s, h.points] as const).catch(() => [s, [] as PriceHistory] as const)))
      .then((pairs) => {
        if (!alive) return;
        const map: Record<string, PriceHistory> = Object.fromEntries(pairs);
        if (Object.values(map).every((p) => p.length === 0)) setFailed(true);
        map.WORLD = blendIndices(WORLD_PARTS.map((w) => ({ history: map[w.symbol], weight: w.weight })));
        setIndices(map);
      });
    return () => {
      alive = false;
    };
  }, [from]);
  return { indices, failed };
}

function CrisesTool({ snapshot }: { snapshot: Snapshot }) {
  const [crisisId, setCrisisId] = useState<Crisis["id"]>("covid");
  const { indices, failed } = useIndices("2007-09-01");
  const crisis = CRISES.find((c) => c.id === crisisId)!;
  const byId = Object.fromEntries(snapshot.lines.map((l) => [l.instrument.id, l.instrument]));
  const replay = useMemo(() => {
    if (!indices) return null;
    const lines = snapshot.lines.filter((l) => l.valued.valueEUR !== null).map((l) => ({ instrumentId: l.instrument.id, valueEUR: l.valued.valueEUR as number }));
    const instrumentOf = Object.fromEntries(snapshot.lines.map((l) => [l.instrument.id, l.instrument]));
    // Le marché mondial de substitution est rebasé au début de chaque crise.
    const crisisIndices = { ...indices, WORLD: blendIndices(WORLD_PARTS.map((w) => ({ history: indices[w.symbol]?.filter((p) => p.date >= crisis.start), weight: w.weight }))) };
    return replayCrisis(lines, (id) => (instrumentOf[id] ? benchmarkFor(instrumentOf[id]) : undefined), crisisIndices, crisis);
  }, [indices, crisis, snapshot]);
  const monthsLabel = (days: number) => (days < 60 ? `${days} jours` : `${Math.round(days / 30.4)} mois`);

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        {CRISES.map((c) => (
          <button key={c.id} type="button" onClick={() => (haptic(), setCrisisId(c.id))} className={`touche rounded-full px-3.5 py-2 text-[13.5px] ${c.id === crisisId ? "bg-white/[0.14] text-craie" : "bg-white/[0.04] text-brume"}`}>
            {c.label}
          </button>
        ))}
      </div>
      {failed ? (
        <p className="text-[14px] text-braise">Historique des indices indisponible pour le moment. Réessaie plus tard.</p>
      ) : !replay ? (
        <div className="flex flex-col gap-3">
          <div className="silhouette h-16" />
          <div className="silhouette h-[220px]" />
        </div>
      ) : (
        <>
          <Headline>
            Ton portefeuille d&apos;aujourd&apos;hui aurait perdu jusqu&apos;à <Money value={-replay.maxLossEUR} className="font-sans text-[0.85em] font-medium text-braise" />{" "}
            <span className="text-brume">({formatPct(replay.maxLossPct, { decimals: 0, sign: true })})</span>.{" "}
            <span className="text-brume">
              {replay.recoveryDays !== null ? `Retour au niveau de départ après ${monthsLabel(replay.recoveryDays)}.` : `Pas revenu à son niveau de départ fin ${new Intl.DateTimeFormat("fr-BE", { month: "long", year: "numeric" }).format(new Date(crisis.end))}.`}
            </span>
          </Headline>
          <LabChart
            animationKey={crisisId}
            zeroBased={false}
            xLabels={replay.series.map((p) => new Intl.DateTimeFormat("fr-BE", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(p.date)))}
            lines={[
              { values: replay.series.map((p) => p.valueEUR), style: "main", label: "Valeur pendant la crise" },
              { values: replay.series.map(() => replay.startEUR), style: "dashed", label: "Niveau de départ" },
            ]}
          />
          <Legend items={[{ label: "Ton portefeuille", style: "main" }, { label: "Niveau de départ", style: "dashed" }]} />
          {replay.unmapped.length > 0 && <Note>Sans indice exploitable, laissées constantes : {replay.unmapped.map((id) => byId[id]?.name ?? id).join(", ")}.</Note>}
        </>
      )}
      <Note>
        Approximation assumée : chaque ligne suit un indice de référence depuis le sommet d&apos;avant crise (S&amp;P 500, Nasdaq 100, Euro Stoxx 50, marchés émergents, ou un « marché mondial » fait de 75 % S&amp;P 500 et 25 % Euro Stoxx 50). Sans devises ni dividendes. Le passé ne dit pas ce que fera la prochaine crise.
      </Note>
    </Card>
  );
}

/* ——— Le jumeau paresseux ——— */

const WORLD_ETF = { symbol: "IWDA.AS", name: "iShares Core MSCI World" };

function TwinTool({ snapshot, data }: { snapshot: Snapshot; data: PortfolioData }) {
  const { mode } = useAtlas();
  const first = snapshot.series[0]?.date;
  const [reference, setReference] = useState<PriceHistory | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!first) return;
    if (mode === "demo") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- en démo, la référence est l'ETF monde fictif de la démo
      setReference(data.market.prices["IE00B4L5Y983"] ?? []);
      return;
    }
    let alive = true;
    // Dix jours de marge : un premier achat daté d'un week-end prend la clôture de la veille.
    fetchHistory(WORLD_ETF.symbol, new Date(Date.parse(first) - 10 * 86_400_000).toISOString().slice(0, 10))
      .then((h) => alive && setReference(h.points))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [first, mode, data.market.prices]);

  const twin = useMemo(() => (reference ? lazyTwin(data.transactions, data.instruments, data.market, reference, snapshot.series) : null), [reference, data, snapshot.series]);
  const sampled = useMemo(() => {
    if (!twin) return [];
    const step = Math.max(1, Math.ceil(twin.series.length / 160));
    return twin.series.filter((_, i) => i % step === 0 || i === twin.series.length - 1);
  }, [twin]);
  const gap = twin ? twin.actualEUR - twin.twinEUR : 0;

  return (
    <Card className="flex flex-col gap-5">
      {failed ? (
        <p className="text-[14px] text-braise">Cours de l&apos;ETF monde indisponible pour le moment.</p>
      ) : twin && twin.twinEUR === 0 && twin.skipped > 0 ? (
        <p className="text-[14px] text-braise">Impossible de rejouer tes achats : cours de l&apos;ETF monde manquants à leurs dates.</p>
      ) : !twin ? (
        <div className="flex flex-col gap-3">
          <div className="silhouette h-16" />
          <div className="silhouette h-[220px]" />
        </div>
      ) : (
        <>
          <Headline>
            Ton jumeau paresseux aurait <Money value={twin.twinEUR} className="font-sans text-[0.85em] font-medium" /> aujourd&apos;hui, contre <Money value={twin.actualEUR} className="font-sans text-[0.85em] font-medium" /> pour toi.{" "}
            <span className="text-brume">
              {Math.abs(gap) < twin.actualEUR * 0.005 ? "Presque à égalité." : gap > 0 ? <>Tes choix t&apos;ont rapporté <Money value={gap} /> de plus.</> : <>Il aurait fait <Money value={-gap} /> de mieux.</>}
            </span>
          </Headline>
          <LabChart
            animationKey="jumeau"
            zeroBased={false}
            xLabels={sampled.map((p) => new Intl.DateTimeFormat("fr-BE", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(p.date)))}
            lines={[
              { values: sampled.map((p) => p.actual), style: "main", label: "Ton portefeuille" },
              { values: sampled.map((p) => p.twin), style: "ghost", label: "Le jumeau" },
            ]}
          />
          <Legend items={[{ label: "Toi", style: "main" }, { label: `Le jumeau, tout en ${WORLD_ETF.name}`, style: "ghost" }]} />
          {twin.skipped > 0 && <Note>{twin.skipped} transactions ignorées faute de cours ce jour-là.</Note>}
        </>
      )}
      <Note>Chaque euro que tu as versé ou retiré, aux mêmes dates et pour les mêmes montants (frais compris), placé dans {WORLD_ETF.name}{mode === "demo" ? " (cours fictifs de la démo)" : ""}. Le jumeau ne paie pas d&apos;autres frais que les tiens.</Note>
    </Card>
  );
}

/* ——— Avant d'acheter ——— */

function BeforeBuyTool({ snapshot, data }: { snapshot: Snapshot; data: PortfolioData }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [picked, setPicked] = useState<{ instrument: Instrument; composition?: FundComposition } | null>(null);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("5000");

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || picked) return;
    const controller = new AbortController();
    const t = setTimeout(() => searchInstruments(q, controller.signal).then(setResults).catch(() => {}), 280);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query, picked]);

  async function pick(r: SearchResult) {
    haptic();
    setLoading(true);
    setResults([]);
    const [history, profile] = await Promise.all([fetchHistory(r.symbol, new Date(Date.parse(snapshot.today) - 10 * 86_400_000).toISOString().slice(0, 10)).catch(() => null), fetchProfile(r.symbol)]);
    const instrument = { ...instrumentFrom(r, history?.currency ?? "EUR", profile), id: `essai:${r.symbol}` };
    const composition = r.type === "stock" ? undefined : ((await fetchComposition({ ...instrument, id: instrument.id }).catch(() => null)) ?? undefined);
    setPicked({ instrument, composition: composition ? { ...composition, instrumentId: instrument.id } : undefined });
    setLoading(false);
  }

  const value = parseNumber(amount) ?? 0;
  const result = useMemo(() => {
    if (!picked || value <= 0) return null;
    const lines = snapshot.lines.map((l) => ({ instrumentId: l.instrument.id, valueEUR: l.valued.valueEUR }));
    return whatIfBuy(lines, data.instruments, data.compositions, picked.instrument, picked.composition, value, (a, b) => overlap(a, b).overlap);
  }, [picked, value, data, snapshot]);

  return (
    <Card className="flex flex-col gap-5">
      {!picked ? (
        <>
          <Headline>Qu&apos;est-ce que cet achat changerait à ce que tu possèdes ?</Headline>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ombre"><IconSearch /></span>
            <input id="avant-recherche" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom, ticker ou ISIN" autoComplete="off" spellCheck={false} className={`${inputClass} pl-12`} aria-label="Rechercher le titre envisagé" />
          </div>
          {loading && <div className="silhouette h-14" />}
          <ul className="flex flex-col">
            {results.map((r) => (
              <li key={r.symbol}>
                <button type="button" onClick={() => void pick(r)} className="touche grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-white/[0.07] py-3 text-left first:border-t-0">
                  <span className="min-w-0">
                    <span className="block truncate text-[15px]">{r.name}</span>
                    <span className="repere mt-0.5 block truncate">{r.symbol} · {r.exchange}</span>
                  </span>
                  <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11.5px] text-brume">{TYPE_LABELS[r.type]}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="repere">{[picked.instrument.symbol, TYPE_LABELS[picked.instrument.type]].join(" · ")}</span>
              <h3 className="mt-1 font-serif text-[24px] leading-tight">{picked.instrument.name}</h3>
            </div>
            <button type="button" onClick={() => (setPicked(null), setQuery(""))} className="touche shrink-0 rounded-full bg-white/[0.07] px-3.5 py-2 text-[13px]">Changer</button>
          </div>
          <Field label="Montant envisagé (€)">
            <TextInput id="avant-montant" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          {picked.instrument.type !== "stock" && !picked.composition && <Note>Composition indisponible pour ce fonds : l&apos;avant/après ne peut pas traverser ce qu&apos;il contient.</Note>}
          {result && <BeforeAfter result={result} instruments={data.instruments} />}
        </>
      )}
      <Note>Une simulation, pas une recommandation : Atlas montre ce qui changerait, il ne dit pas s&apos;il faut acheter.</Note>
    </Card>
  );
}

function BeforeAfter({ result, instruments }: { result: ReturnType<typeof whatIfBuy>; instruments: Record<string, Instrument> }) {
  const rows = (before: Map<string, number>, after: Map<string, number>) =>
    [...new Set([...before.keys(), ...after.keys()])]
      .map((key) => ({ key, before: before.get(key) ?? 0, after: after.get(key) ?? 0 }))
      .sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before))
      .slice(0, 4);
  const block = (title: string, list: { key: string; before: number; after: number }[]) => (
    <div className="flex flex-col gap-2.5">
      <span className="repere">{title}</span>
      {list.map((r) => (
        <div key={r.key} className="flex flex-col gap-1">
          <div className="flex justify-between gap-3 text-[14px]">
            <span className="truncate">{r.key}</span>
            <span className="tabular text-brume">
              {formatPct(r.before, { decimals: 1 })} → <span className="text-craie">{formatPct(r.after, { decimals: 1 })}</span>
            </span>
          </div>
          <div className="relative h-[5px] overflow-hidden rounded-full bg-white/[0.07]">
            <i className="absolute inset-y-0 left-0 rounded-full bg-white/30" style={{ width: `${r.before * 100}%` }} />
            <motion.i className="absolute inset-y-0 left-0 origin-left rounded-full bg-lavande" style={{ width: `${r.after * 100}%` }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }} />
          </div>
        </div>
      ))}
    </div>
  );
  return (
    <div className="flex flex-col gap-6">
      <p className="text-[15px]">
        Les dix premières entreprises pèseraient {formatPct(result.after.top10, { decimals: 0 })} de ton patrimoine, contre {formatPct(result.before.top10, { decimals: 0 })} aujourd&apos;hui.
        {result.overlaps[0] && result.overlaps[0].overlap > 0.05 && (
          <> Ce produit recouvre {instruments[result.overlaps[0].instrumentId]?.name} à au moins {formatPct(result.overlaps[0].overlap, { decimals: 0 })}.</>
        )}
      </p>
      <div className="grid gap-6 sm:grid-cols-2">
        {block("Secteurs qui bougent le plus", rows(result.before.sectors, result.after.sectors))}
        {block("Pays qui bougent le plus", rows(result.before.countries, result.after.countries))}
      </div>
      <Legend items={[{ label: "Avant", style: "ghost" }, { label: "Après", style: "marker" }]} />
    </div>
  );
}

/* ——— Choc sur mesure ——— */

const PRESETS: { label: string; axis: Axis; key: string; drop: number }[] = [
  { label: "La tech perd 30 %", axis: "sector", key: "Technologie", drop: 0.3 },
  { label: "Les États-Unis perdent 20 %", axis: "country", key: "États-Unis", drop: 0.2 },
  { label: "Le dollar perd 10 %", axis: "currency", key: "USD", drop: 0.1 },
  { label: "La finance perd 25 %", axis: "sector", key: "Finance", drop: 0.25 },
];

const CURRENCY_NAMES: Record<string, string> = { USD: "le dollar", GBP: "la livre", JPY: "le yen", CHF: "le franc suisse", HKD: "le dollar de Hong Kong", CAD: "le dollar canadien" };

const AXIS_LABELS: Record<Axis, string> = { sector: "Secteur", country: "Pays", currency: "Devise" };

function ShockTool({ snapshot, data }: { snapshot: Snapshot; data: PortfolioData }) {
  const [axis, setAxis] = useState<Axis>("sector");
  const [key, setKey] = useState("Technologie");
  const [drop, setDrop] = useState(0.3);
  const keys = snapshot.breakdowns[axis].slices.map((s) => s.key).filter((k) => k !== "Autres");
  const lines = snapshot.lines.map((l) => ({ instrumentId: l.instrument.id, valueEUR: l.valued.valueEUR }));
  const r = applyShock(lines, data.instruments, data.compositions, { axis, key, drop });
  const share = r.totalEUR > 0 ? r.lossEUR / r.totalEUR : 0;

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => {
              haptic();
              setAxis(p.axis);
              setKey(p.key);
              setDrop(p.drop);
            }}
            className={`touche rounded-full px-3.5 py-2 text-[13.5px] ${axis === p.axis && key === p.key && drop === p.drop ? "bg-white/[0.14] text-craie" : "bg-white/[0.04] text-brume"}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <Headline>
        {key ? (
          <>
            Si {axis === "currency" ? (CURRENCY_NAMES[key] ?? `la devise ${key}`) : `« ${key} »`} perdait {formatPct(drop, { decimals: 0 })}, tu perdrais environ <Money value={r.lossEUR} className="font-sans text-[0.85em] font-medium text-braise" />{" "}
            <span className="text-brume">({formatPct(share, { decimals: 1 })} de ton patrimoine).</span>
          </>
        ) : (
          "Choisis ce qui chute."
        )}
      </Headline>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full" role="img" aria-label="Part exposée et perte">
        <motion.i className="block h-full rounded-[3px] bg-braise" style={{ flexBasis: 0 }} animate={{ flexGrow: r.lossEUR }} transition={{ duration: 0.6 }} />
        <motion.i className="block h-full rounded-[3px] bg-braise/35" style={{ flexBasis: 0 }} animate={{ flexGrow: Math.max(0, r.exposedEUR - r.lossEUR) }} transition={{ duration: 0.6 }} />
        <motion.i className="block h-full rounded-[3px] bg-white/[0.12]" style={{ flexBasis: 0 }} animate={{ flexGrow: Math.max(0, r.totalEUR - r.exposedEUR - r.unknownEUR) }} transition={{ duration: 0.6 }} />
        {r.unknownEUR > 0 && <motion.i className="hachures block h-full rounded-[3px]" style={{ flexBasis: 0 }} animate={{ flexGrow: r.unknownEUR }} transition={{ duration: 0.6 }} />}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-brume">
        <li className="flex items-center gap-2"><i className="block h-2.5 w-2.5 rounded-[3px] bg-braise" />Perte</li>
        <li className="flex items-center gap-2"><i className="block h-2.5 w-2.5 rounded-[3px] bg-braise/35" />Reste de la part exposée (<Money value={r.exposedEUR} />)</li>
        <li className="flex items-center gap-2"><i className="block h-2.5 w-2.5 rounded-[3px] bg-white/[0.12]" />Non exposé</li>
        {r.unknownEUR > 0 && <li className="flex items-center gap-2"><i className="hachures block h-2.5 w-2.5 rounded-[3px]" />Exposition inconnue</li>}
      </ul>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Ce qui chute">
          <Segmented label="Axe" value={axis} onChange={(a) => { setAxis(a); setKey(snapshot.breakdowns[a].slices[0]?.key ?? ""); }} options={(["sector", "country", "currency"] as Axis[]).map((a) => ({ value: a, label: AXIS_LABELS[a] }))} />
        </Field>
        <Field label={AXIS_LABELS[axis]}>
          <select id="choc-cle" value={key} onChange={(e) => setKey(e.target.value)} className={`${inputClass} text-[15px]`}>
            {keys.length === 0 && <option value="">Aucune donnée</option>}
            {keys.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </Field>
        <Field label={`Baisse : ${formatPct(drop, { decimals: 0 })}`}>
          <input id="choc-baisse" type="range" min={0.05} max={0.6} step={0.05} value={drop} onChange={(e) => setDrop(Number(e.target.value))} className="w-full accent-white" />
        </Field>
      </div>
      <Note>
        Effet direct seulement : la part exposée perd exactement la baisse choisie, le reste ne bouge pas. Dans une vraie crise, tout baisse ensemble.
        {r.unknownEUR > 0 && ` Exposition inconnue pour ${formatEUR(r.unknownEUR)} (fonds sans détail sur cet axe) : la perte réelle peut être plus forte.`}
      </Note>
    </Card>
  );
}

/* ——— Journal de convictions ——— */

function ConvictionsTool({ data, today }: { data: PortfolioData; today: string }) {
  const notes = convictions(data, today);
  const age = (days: number) => (days >= 730 ? `${Math.floor(days / 365)} ans` : days >= 365 ? "un an" : days >= 60 ? `${Math.round(days / 30.4)} mois` : `${days} jours`);
  if (notes.length === 0) {
    return (
      <Card className="flex flex-col gap-3">
        <Headline>Ton journal est vide.</Headline>
        <p className="text-[14.5px] text-brume">À chaque achat, écris en une phrase pourquoi tu achètes. Six mois plus tard, Atlas te la ressort ici.</p>
      </Card>
    );
  }
  const due = notes.filter((n) => n.ageDays >= 182);
  return (
    <Card className="flex flex-col gap-5">
      <Headline>
        {due.length > 0 ? `${due.length} ${due.length > 1 ? "convictions ont" : "conviction a"} plus de six mois. Tu les penses toujours ?` : "Aucune conviction n'a encore six mois : elles reviendront ici le moment venu."}
      </Headline>
      <ul className="flex flex-col">
        {notes.map((n) => (
          <li key={`${n.date}-${n.instrument.id}`} className="flex flex-col gap-2 border-t border-white/[0.07] py-4 first:border-t-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[14px]">{n.instrument.name}</span>
              <span className="repere">il y a {age(n.ageDays)}</span>
            </div>
            <blockquote className={`font-serif text-[20px] leading-snug italic ${n.ageDays >= 182 ? "" : "text-brume"}`}>« {n.note} »</blockquote>
            <span className="text-[13px] text-brume">
              Depuis, son cours en euros a fait <Pct value={n.sincePct} decimals={0} />.
            </span>
          </li>
        ))}
      </ul>
      <Note>L&apos;évolution du cours ne dit pas si l&apos;idée était bonne : elle aide juste à te relire.</Note>
    </Card>
  );
}
