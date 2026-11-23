"use client";

import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Sheet } from "@/components/shell/Sheet";
import { EmptyPortfolio, PageSkeleton } from "@/components/shell/states";
import { Sparkline, WealthChart } from "@/components/charts/WealthChart";
import { BigTotal, Card, Eyebrow, Gauge, Money, Pct, Reveal } from "@/components/ui/primitives";
import { periodReturn, periodSeries, type LineView, type Period, type Snapshot } from "@/lib/analysis";
import { frenchDay, sentenceText, type Token } from "@/lib/domain/sentence";
import type { SeriesPoint } from "@/lib/domain/valuation";
import type { Transaction } from "@/lib/domain/types";
import { formatEUR, formatNumber, formatPct } from "@/lib/format";
import { useAtlas } from "@/lib/store";
import { haptic } from "@/lib/ui";

export function TodayView() {
  const { snapshot, mode, data, market } = useAtlas();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (!snapshot || !data) return <PageSkeleton />;
  if (mode === "real" && snapshot.lines.length === 0) return <EmptyPortfolio question="Qu'est-ce qui s'est passé aujourd'hui ?" />;
  // Premier chargement des cours : rien à raconter tant qu'aucune ligne n'est valorisée.
  if (mode === "real" && market.loading && snapshot.lines.every((l) => l.valued.valueEUR === null)) return <PageSkeleton label="Récupération des cours…" />;
  const selected = snapshot.lines.find((l) => l.instrument.id === selectedId) ?? null;

  return (
    <div className="grid gap-x-14 gap-y-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-8 lg:sticky lg:top-6 lg:self-start">
        <DailySentence tokens={snapshot.sentence} />
        <Reveal i={2}>
          <TotalBlock snapshot={snapshot} />
        </Reveal>
        <Reveal i={3}>
          <EvolutionBlock snapshot={snapshot} />
        </Reveal>
      </div>
      <div className="flex min-w-0 flex-col gap-8 lg:pt-2">
        <Reveal i={4}>
          <LifeSlicesCard snapshot={snapshot} expectedReturn={data.expectedReturn} />
        </Reveal>
        <Reveal i={5}>
          <Positions snapshot={snapshot} onSelect={(l) => setSelectedId(l.instrument.id)} />
        </Reveal>
      </div>
      <PositionSheet line={selected} onClose={() => setSelectedId(null)} transactions={data.transactions} editable={mode === "real"} />
    </div>
  );
}

/** La phrase du jour s'écrit mot à mot. */
function DailySentence({ tokens }: { tokens: Token[] }) {
  const reduce = useReducedMotion();
  const words = useMemo(() => {
    const out: { prefix: string; text: string; kind: Token["kind"]; suffix: string; space: boolean }[] = [];
    for (const t of tokens) {
      // Les montants et les noms restent d'un seul tenant.
      const parts = t.kind === "text" ? t.text.split(/(?<= )/) : [t.text];
      for (const p of parts) {
        if (!p) continue;
        const last = out[out.length - 1];
        // Une espace seule n'est pas un mot : elle marque juste la fin du précédent.
        if (!p.trim()) {
          if (last) last.space = true;
          continue;
        }
        // La ponctuation reste collée au mot précédent : jamais de point seul en début de ligne.
        if (t.kind === "text" && last && !last.space && /^[.,;:!?)]/.test(p)) {
          last.suffix += p.trimEnd();
          last.space = p.endsWith(" ");
          continue;
        }
        // Une élision (« d' ») reste collée au mot suivant.
        if (last && !last.space && last.kind === "text" && last.text.endsWith("'")) {
          out.pop();
          out.push({ prefix: last.text, text: p.trimEnd(), kind: t.kind, suffix: "", space: p.endsWith(" ") });
          continue;
        }
        out.push({ prefix: "", text: p.trimEnd(), kind: t.kind, suffix: "", space: p.endsWith(" ") });
      }
    }
    return out;
  }, [tokens]);
  return (
    <h1 className="max-w-[22ch] font-serif text-[clamp(30px,8vw,46px)] leading-[1.13] font-[350] tracking-[-0.012em] text-pretty" aria-label={sentenceText(tokens)}>
      {words.map((w, i) => (
        <motion.span
          key={`${i}-${w.text}`}
          aria-hidden="true"
          className={`inline-block ${w.kind === "key" ? "font-medium text-mood italic" : w.kind === "name" ? "italic" : ""}`}
          initial={reduce ? false : { opacity: 0, y: 10, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.12 + i * 0.036 }}
        >
          {/* Le flou du mode discret va sur un enfant : l'animation pose son propre filtre sur ce span. */}
          {w.prefix && <span className="not-italic">{w.prefix}</span>}
          {w.kind === "key" || w.kind === "amount" ? <span className="amt">{w.text}</span> : w.text}
          {w.suffix && <span className="font-[350] text-craie not-italic">{w.suffix}</span>}
          {w.space && " "}
        </motion.span>
      ))}
    </h1>
  );
}

function TotalBlock({ snapshot }: { snapshot: Snapshot }) {
  const { toggleDiscreet } = useAtlas();
  const lastTap = useRef(0);
  const { change, closeDate } = snapshot.story;
  const closed = closeDate !== null && closeDate < snapshot.today;
  return (
    <div className="flex flex-col gap-2">
      <Eyebrow>Patrimoine</Eyebrow>
      <button
        type="button"
        className="w-fit text-left"
        aria-label="Patrimoine. Toucher deux fois pour flouter les montants."
        onClick={() => {
          const now = Date.now();
          if (now - lastTap.current < 320) {
            haptic(12);
            toggleDiscreet();
          }
          lastTap.current = now;
        }}
      >
        <BigTotal value={snapshot.totalEUR} className="text-[clamp(46px,14vw,68px)]" />
      </button>
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-[15px]">
        <span className={change.changeEUR >= 0 ? "text-menthe" : "text-braise"}>
          <span className="mr-0.5 text-[0.72em]">{change.changeEUR >= 0 ? "▲" : "▼"}</span>
          <Money value={change.changeEUR} decimals={2} sign />
        </span>
        <Pct value={change.pct} />
        <span className="text-ombre">{closed && closeDate ? frenchDay(closeDate) : "aujourd'hui"}</span>
      </div>
      <MarketFreshness />
    </div>
  );
}

const PERIODS: Period[] = ["1S", "1M", "1A", "Tout"];

function EvolutionBlock({ snapshot }: { snapshot: Snapshot }) {
  const [period, setPeriod] = useState<Period>("1A");
  const [scrub, setScrub] = useState<SeriesPoint | null>(null);
  const points = useMemo(() => periodSeries(snapshot.series, period, snapshot.today), [snapshot, period]);
  const perf = periodReturn(points);
  const label = period === "Tout" ? `depuis ${new Intl.DateTimeFormat("fr-BE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(points[0]?.date ?? snapshot.today))}` : { "1S": "sur 7 jours", "1M": "sur 1 mois", "1A": "sur 1 an" }[period];
  const index = PERIODS.indexOf(period);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-[18px] items-baseline justify-between gap-3 font-mono text-[12px] tracking-[0.02em] text-brume tabular">
        {scrub ? (
          <>
            <span>{new Intl.DateTimeFormat("fr-BE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(scrub.date))}</span>
            <span className="amt">{formatEUR(scrub.valueEUR)}</span>
          </>
        ) : (
          <>
            <span>
              {perf === null ? "Pas assez de recul" : `${formatPct(perf, { decimals: 1, sign: true })} ${label}`}
              <span className="text-ombre"> · hors versements</span>
            </span>
            <span className="flex items-center gap-3 text-ombre">
              <span className="flex items-center gap-1.5"><i className="block h-[2px] w-3 rounded bg-white" />valeur</span>
              <span className="flex items-center gap-1.5"><i className="block h-0 w-3 border-t border-dashed border-white/40" />versé</span>
            </span>
          </>
        )}
      </div>
      <WealthChart points={points} animationKey={period} onScrub={setScrub} />
      <div className="verre relative grid grid-cols-4 rounded-full p-1" role="group" aria-label="Période">
        <motion.span
          aria-hidden="true"
          className="absolute top-1 bottom-1 left-1 rounded-full bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,.12)]"
          style={{ width: "calc((100% - 8px) / 4)" }}
          animate={{ x: `${index * 100}%` }}
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
        />
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={p === period}
            onClick={() => {
              haptic();
              setPeriod(p);
            }}
            className={`touche relative z-10 rounded-full py-2 text-[13px] ${p === period ? "text-craie" : "text-brume"}`}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

function LifeSlicesCard({ snapshot, expectedReturn }: { snapshot: Snapshot; expectedReturn: number }) {
  const { life } = snapshot;
  const router = useRouter();
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="repere">Morceaux de vie</span>
        <button type="button" onClick={() => (haptic(), router.push("/patrimoine#depenses"))} className="touche repere rounded-full border border-white/10 px-2.5 py-1 hover:text-brume">
          {formatPct(expectedReturn, { decimals: 1 })} / an · modifier
        </button>
      </div>
      <p className="font-serif text-[23px] leading-[1.2] font-[350] text-balance">
        Tes placements paient déjà <Money value={life.monthlyIncomeEUR} className="font-sans text-[0.88em] font-medium tracking-[-0.02em]" /> de ta vie chaque mois.
      </p>
      <ul className="flex flex-col">
        {life.slices.map((s, i) => (
          <li key={s.expense.id} className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-1.5 py-2 text-[14.5px]">
            <span>{s.expense.label}</span>
            <small className="text-[13px] text-brume tabular">
              <Money value={s.expense.monthly} /> · {s.ratio >= 0.999 ? "couvert" : formatPct(s.ratio, { decimals: 0 })}
            </small>
            <div className="col-span-2">
              <Gauge ratio={s.ratio} tone={s.ratio >= 0.999 ? "lumiere" : "lavande"} delay={0.45 + i * 0.12} />
            </div>
          </li>
        ))}
      </ul>
      <p className="border-t border-white/10 pt-3.5 text-[13.5px] text-brume">
        {life.next ? (
          <>
            Prochain palier : {life.next.expense.label.toLowerCase()} en entier, à <Money value={life.next.capitalNeededEUR ?? 0} /> de patrimoine.
          </>
        ) : (
          "Toutes tes dépenses renseignées sont couvertes."
        )}
        <span className="block text-ombre">Revenu théorique : ton patrimoine × {formatPct(expectedReturn, { decimals: 1 })} ÷ 12. Tes dépenses ne sont pas déduites, elles servent de repère.</span>
      </p>
    </Card>
  );
}

function Positions({ snapshot, onSelect }: { snapshot: Snapshot; onSelect: (l: LineView) => void }) {
  return (
    <section className="flex flex-col gap-7" aria-label="Positions">
      {snapshot.groups.map((g) => (
        <div key={g.type}>
          <Eyebrow right={<Money value={g.totalEUR} />}>{`${g.label} · ${g.lines.length} ${g.lines.length > 1 ? "lignes" : "ligne"}`}</Eyebrow>
          <ul className="mt-2.5">
            {g.lines.map((l) => (
              <li key={l.instrument.id}>
                <button
                  type="button"
                  onClick={() => {
                    haptic();
                    onSelect(l);
                  }}
                  className="touche grid w-full grid-cols-[minmax(0,1fr)_64px_auto] items-center gap-3 border-t border-white/[0.07] py-3.5 text-left"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[15px]">{l.instrument.name}</span>
                    <span className="repere mt-0.5 block truncate">{[l.instrument.symbol.split(".")[0], l.instrument.exchange].filter(Boolean).join(" · ")}</span>
                  </span>
                  <Sparkline values={l.spark} />
                  <span className="text-right text-[15px]">
                    {l.valued.valueEUR === null ? <span className="text-ombre">cours indisponible</span> : <Money value={l.valued.valueEUR} />}
                    <Pct value={l.dayPct} arrow className="mt-0.5 block text-[12.5px]" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function PositionSheet({ line, onClose, transactions, editable }: { line: LineView | null; onClose: () => void; transactions: Transaction[]; editable: boolean }) {
  const { openSheet, deleteTransaction } = useAtlas();
  const [confirming, setConfirming] = useState<string | null>(null);
  const own = line ? transactions.filter((t) => t.instrumentId === line.instrument.id).sort((a, b) => (a.date < b.date ? 1 : -1)) : [];
  const brokers = [...new Set(own.map((t) => t.broker).filter(Boolean))];
  const convictions = own.filter((t) => t.note);
  const gainPct = line && line.valued.gainEUR !== null && line.position.costEUR ? line.valued.gainEUR / line.position.costEUR : null;
  const longDate = (d: string) => new Intl.DateTimeFormat("fr-BE", { dateStyle: "long", timeZone: "UTC" }).format(new Date(d));
  return (
    <Sheet open={!!line} onClose={onClose} title={line?.instrument.name ?? "Position"}>
      {line && (
        <div className="flex flex-col gap-6">
          <div>
            <span className="repere">{[line.instrument.isin, line.instrument.symbol, line.instrument.exchange].filter(Boolean).join(" · ")}</span>
            <h2 className="mt-1 font-serif text-[30px] leading-tight">{line.instrument.name}</h2>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-[14.5px]">
            <Stat label="Valeur">{line.valued.valueEUR === null ? <span className="text-ombre">cours indisponible</span> : <Money value={line.valued.valueEUR} decimals={2} />}</Stat>
            <Stat label="Plus-value latente">
              {line.valued.gainEUR === null ? "—" : (
                <span className={line.valued.gainEUR >= 0 ? "text-menthe" : "text-braise"}>
                  <Money value={line.valued.gainEUR} sign /> <Pct value={gainPct} decimals={1} className="!text-inherit" />
                </span>
              )}
            </Stat>
            <Stat label="Quantité"><span className="tabular">{formatNumber(line.position.quantity, { decimals: line.position.quantity % 1 ? 3 : 0 })}</span></Stat>
            <Stat label="Prix moyen d'achat"><span className="tabular">{formatNumber(line.position.avgPrice, { decimals: 2 })} {line.instrument.currency}</span></Stat>
            <Stat label="Premier achat"><span className="tabular">{line.position.firstBuy ? longDate(line.position.firstBuy) : "—"}</span></Stat>
            <Stat label={brokers.length > 1 ? "Courtiers" : "Courtier"}>{brokers.join(", ") || "—"}</Stat>
          </dl>
          {convictions.length > 0 && (
            <div className="flex flex-col gap-3">
              <span className="repere">Ce que tu pensais en achetant</span>
              {convictions.map((c) => (
                <blockquote key={c.id} className="border-l border-white/20 pl-4 font-serif text-[18px] leading-snug italic">
                  « {c.note} »
                  <footer className="mt-1 font-sans text-[12.5px] text-ombre not-italic">{longDate(c.date)}</footer>
                </blockquote>
              ))}
            </div>
          )}
          {editable && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => openSheet("add", { instrument: line.instrument, kind: "buy" })} className="touche verre rounded-full py-3 text-[14px]">
                  Acheter encore
                </button>
                <button type="button" onClick={() => openSheet("add", { instrument: line.instrument, kind: "sell" })} className="touche verre rounded-full py-3 text-[14px]">
                  Vendre
                </button>
              </div>
              <span className="repere mt-2">Transactions</span>
              <ul className="flex flex-col">
                {own.map((t) => (
                  <li key={t.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-white/[0.07] py-2.5 text-[14px] first:border-t-0">
                    <span className="min-w-0">
                      <span className={t.side === "buy" ? "" : "text-braise"}>{t.side === "buy" ? "Achat" : "Vente"}</span> de {formatNumber(t.quantity, { decimals: t.quantity % 1 ? 3 : 0 })} à {formatNumber(t.price, { decimals: 2 })} {line.instrument.currency}
                      <span className="block text-[12.5px] text-ombre">{[longDate(t.date), t.broker].filter(Boolean).join(" · ")}</span>
                    </span>
                    {confirming === t.id ? (
                      <span className="flex gap-1">
                        <button type="button" onClick={() => setConfirming(null)} className="touche rounded-full px-3 py-1.5 text-[13px] text-brume">Garder</button>
                        <button type="button" onClick={() => (deleteTransaction(t.id), setConfirming(null), haptic(12))} className="touche rounded-full bg-braise/90 px-3 py-1.5 text-[13px] text-nuit">Supprimer</button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setConfirming(t.id)} className="touche rounded-full px-3 py-1.5 text-[13px] text-ombre hover:text-craie" aria-label={`Supprimer la transaction du ${longDate(t.date)}`}>
                        Supprimer
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

/** Fraîcheur des cours : différés d'environ 15 minutes, jamais présentés comme du temps réel. */
function MarketFreshness() {
  const { mode, market, data, refreshMarket } = useAtlas();
  if (mode !== "real") return <p className="text-[12.5px] text-ombre">Données fictives de démonstration.</p>;
  const failed = market.failed.map((key) => Object.values(data?.instruments ?? {}).find((i) => i.symbol === key)?.name ?? key);
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-[12.5px] text-ombre">
      {market.loading ? (
        <span>Mise à jour des cours…</span>
      ) : market.updatedAt ? (
        <>
          <span>Cours différés · mis à jour à {new Intl.DateTimeFormat("fr-BE", { hour: "2-digit", minute: "2-digit" }).format(new Date(market.updatedAt))}</span>
          <button type="button" onClick={() => refreshMarket(true)} className="touche underline decoration-white/20 underline-offset-2 hover:text-brume">
            actualiser
          </button>
        </>
      ) : null}
      {failed.length > 0 && <span className="basis-full text-braise/90">Cours indisponible pour {failed.join(", ")}.</span>}
    </p>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="repere">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}
