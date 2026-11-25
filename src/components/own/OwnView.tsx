"use client";

import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Globe, openExchanges } from "@/components/charts/Globe";
import { Sheet } from "@/components/shell/Sheet";
import { EmptyPortfolio, PageSkeleton } from "@/components/shell/states";
import { Card, Eyebrow, Money, Reveal } from "@/components/ui/primitives";
import type { Snapshot } from "@/lib/analysis";
import type { Axis, Breakdown, CompanyExposure } from "@/lib/domain/lookthrough";
import type { Instrument } from "@/lib/domain/types";
import { formatEUR, formatNumber, formatPct } from "@/lib/format";
import { fetchCompanyInfo, type CompanyInfo } from "@/lib/market-client";
import { useAtlas } from "@/lib/store";
import { haptic, SERIES_COLORS } from "@/lib/ui";

const ease = [0.16, 1, 0.3, 1] as const;

export function OwnView() {
  const { snapshot, mode, data, market } = useAtlas();
  const [company, setCompany] = useState<CompanyExposure | null>(null);
  if (!snapshot || !data) return <PageSkeleton />;
  if (mode === "real" && snapshot.lines.length === 0) return <EmptyPortfolio question="Qu'est-ce que je possède vraiment ?" />;
  if (mode === "real" && market.loading && snapshot.lines.every((l) => l.valued.valueEUR === null)) return <PageSkeleton label="Récupération des cours…" />;
  const { instruments } = data;

  return (
    <div className="flex flex-col gap-12">
      <Reveal>
        <Hero snapshot={snapshot} instruments={instruments} counted={Object.values(data.compositions).some((c) => c?.holdingsCount)} />
      </Reveal>
      <div className="grid gap-8 lg:grid-cols-2">
        <Reveal i={1}>
          <TopCompanies snapshot={snapshot} instruments={instruments} onSelect={setCompany} />
        </Reveal>
        <div className="flex flex-col gap-8">
          <Reveal i={2}>
            <ProfitsCard snapshot={snapshot} instruments={instruments} />
          </Reveal>
          <Reveal i={3}>
            <GlobeCard snapshot={snapshot} />
          </Reveal>
        </div>
      </div>
      <Reveal i={4}>
        <Breakdowns snapshot={snapshot} />
      </Reveal>
      <Reveal i={5}>
        <BlindSpots snapshot={snapshot} instruments={instruments} />
      </Reveal>
      <CompanySheet company={company} instruments={instruments} onClose={() => setCompany(null)} />
    </div>
  );
}

function Hero({ snapshot, instruments, counted }: { snapshot: Snapshot; instruments: Record<string, Instrument>; counted: boolean }) {
  const e = snapshot.exposure;
  const share = (v: number) => (e.totalEUR > 0 ? v / e.totalEUR : 0);
  const parts = [
    { label: "Détaillé", value: e.detailedEUR, cls: "bg-craie" },
    { label: "Non publié par l'émetteur", value: e.undetailedEUR, cls: "hachures" },
    { label: "Composition indisponible", value: e.unavailableEUR, cls: "bg-voile/[0.12]" },
  ].filter((p) => p.value > 0);
  // Tant qu'aucune composition de fonds n'est connue, on ne prétend pas compter les entreprises.
  const blind = e.totalEUR > 0 && e.unavailableEUR / e.totalEUR > 0.5;
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <span className="repere">Ce que tu possèdes vraiment</span>
      <h1 className="font-serif text-[clamp(36px,9vw,64px)] leading-[1.02] font-light tracking-[-0.02em] text-balance">
        Tu crois avoir {snapshot.lines.length} {snapshot.lines.length > 1 ? "lignes" : "ligne"}.{" "}
        <em className="text-brume">
          {blind ? (
            "Ce qu'elles contiennent arrive bientôt."
          ) : (
            <>
              Tu possèdes au moins <span className="font-sans not-italic font-medium tracking-[-0.04em] text-craie tabular">{formatNumber(e.minCompanies)}</span> entreprises{counted ? "" : " identifiées"}.
            </>
          )}
        </em>
      </h1>
      <div className="flex flex-col gap-3">
        <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full" role="img" aria-label="Part du patrimoine dont on connaît le détail">
          {parts.map((p, i) => (
            <motion.i
              key={p.label}
              className={`block h-full rounded-[3px] ${p.cls}`}
              initial={{ flexGrow: 0 }}
              animate={{ flexGrow: share(p.value) }}
              transition={{ duration: 1.2, ease, delay: 0.3 + i * 0.1 }}
              style={{ flexBasis: 0 }}
            />
          ))}
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-[13.5px] text-brume">
          {parts.map((p) => (
            <li key={p.label} className="flex items-center gap-2">
              <i className={`block h-2.5 w-2.5 rounded-[3px] ${p.cls}`} />
              {p.label} <span className="text-craie tabular">{formatPct(share(p.value), { decimals: 0 })}</span>
            </li>
          ))}
        </ul>
        {!counted && !blind && (
          <p className="text-[13.5px] text-ombre">La source gratuite actuelle ne publie que les dix premières lignes de chaque fonds : le vrai nombre d&apos;entreprises est bien plus grand, et la part « non publiée » le montre.</p>
        )}
        {e.unavailable.length > 0 && (
          <p className="text-[13.5px] text-ombre">
            {e.unavailable.map((id) => instruments[id]?.name).join(", ")} : composition indisponible. Ces montants ne sont pas répartis, ils ne sont pas devinés non plus.
          </p>
        )}
      </div>
    </div>
  );
}

function viaLabel(c: CompanyExposure, instruments: Record<string, Instrument>) {
  const count = (type: Instrument["type"]) => c.via.filter((v) => instruments[v.instrumentId]?.type === type).length;
  const etfs = count("etf");
  const funds = count("fund");
  const parts = [c.direct ? "en direct" : null, etfs ? `${etfs} ETF` : null, funds ? `${funds} fonds` : null].filter(Boolean);
  return parts.join(" + ");
}

function TopCompanies({ snapshot, instruments, onSelect }: { snapshot: Snapshot; instruments: Record<string, Instrument>; onSelect: (c: CompanyExposure) => void }) {
  const top = snapshot.exposure.companies.slice(0, 10);
  const max = top[0]?.weight ?? 1;
  if (top.length === 0) {
    return (
      <Card className="flex flex-col gap-3">
        <Eyebrow>Top 10, ETF fusionnés</Eyebrow>
        <p className="font-serif text-[21px] leading-snug">Les entreprises cachées dans tes fonds apparaîtront ici.</p>
        <p className="text-[13.5px] text-brume">La composition des ETF arrive avec la phase 3. En attendant, Atlas ne devine rien.</p>
      </Card>
    );
  }
  return (
    <Card className="flex flex-col gap-3">
      <Eyebrow right="Poids réel">Top 10, ETF fusionnés</Eyebrow>
      <ol className="flex flex-col">
        {top.map((c, i) => (
          <li key={c.key}>
            <button
              type="button"
              onClick={() => (haptic(), onSelect(c))}
              className="touche grid w-full grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-t border-voile/[0.07] py-3 text-left first:border-t-0"
            >
              <span className="font-mono text-[12px] text-ombre tabular">{String(i + 1).padStart(2, "0")}</span>
              <span className="min-w-0">
                <span className="block truncate text-[15px]">{c.name}</span>
                <span className="block truncate text-[12.5px] text-ombre">{viaLabel(c, instruments)}</span>
              </span>
              <span className="text-right">
                <span className="block text-[15px] tabular">{formatPct(c.weight, { decimals: 1 })}</span>
                <Money value={c.valueEUR} className="block text-[12.5px] text-ombre" />
              </span>
              <span />
              <span className="col-span-2 h-[3px] overflow-hidden rounded-full bg-voile/[0.07]">
                <motion.i
                  className="block h-full origin-left rounded-full bg-voile/80"
                  style={{ width: `${(c.weight / max) * 100}%` }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 1.1, ease, delay: 0.3 + i * 0.05 }}
                />
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="text-[13px] text-ombre">Les dix premières pèsent {formatPct(snapshot.concentration.top10Weight, { decimals: 0 })} de ce que tu possèdes. Touche une entreprise pour voir comment tu la détiens.</p>
    </Card>
  );
}

function ProfitsCard({ snapshot, instruments }: { snapshot: Snapshot; instruments: Record<string, Instrument> }) {
  const e = snapshot.earnings;
  const divShare = e.splitProfitsEUR > 0 ? Math.max(0, e.dividendsEUR / e.splitProfitsEUR) : 0;
  const splitKnown = e.splitProfitsEUR > 0;
  const partialSplit = splitKnown && e.splitProfitsEUR < e.profitsEUR - 0.5;
  if (e.coveredEUR === 0) {
    return (
      <Card className="flex flex-col gap-3">
        <Eyebrow right="par an">Bénéfices réels</Eyebrow>
        <p className="font-serif text-[21px] leading-snug">Ta part des profits des entreprises que tu possèdes s&apos;affichera ici.</p>
        <p className="text-[13.5px] text-brume">Il faut le rendement bénéficiaire de chaque ligne : connu pour les actions en direct, il arrive pour les fonds avec leur composition.</p>
      </Card>
    );
  }
  return (
    <Card className="flex flex-col gap-4">
      <Eyebrow right="par an">Bénéfices réels</Eyebrow>
      <p className="font-serif text-[23px] leading-[1.22] font-[350] text-balance">
        Les entreprises que tu possèdes gagnent <Money value={e.profitsEUR} className="font-sans text-[0.9em] font-medium tracking-[-0.02em]" /> pour toi chaque année.
      </p>
      {splitKnown ? (
      <>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full" role="img" aria-label="Part versée en dividendes et part réinvestie">
        <motion.i className="block h-full rounded-[3px] bg-craie" initial={{ flexGrow: 0 }} animate={{ flexGrow: divShare }} style={{ flexBasis: 0 }} transition={{ duration: 1.1, ease, delay: 0.4 }} />
        <motion.i className="block h-full rounded-[3px] bg-lavande" initial={{ flexGrow: 0 }} animate={{ flexGrow: 1 - divShare }} style={{ flexBasis: 0 }} transition={{ duration: 1.1, ease, delay: 0.5 }} />
      </div>
      <dl className="grid grid-cols-2 gap-4 text-[14px]">
        <div>
          <dt className="flex items-center gap-2 text-brume"><i className="block h-2.5 w-2.5 rounded-[3px] bg-craie" />Versés en dividendes</dt>
          <dd className="mt-1 text-[17px]"><Money value={e.dividendsEUR} /></dd>
        </div>
        <div>
          <dt className="flex items-center gap-2 text-brume"><i className="block h-2.5 w-2.5 rounded-[3px] bg-lavande" />Réinvestis pour grandir</dt>
          <dd className="mt-1 text-[17px]"><Money value={e.reinvestedEUR} /></dd>
        </div>
      </dl>
      {partialSplit && <p className="text-[13px] text-brume">Séparation connue pour <Money value={e.splitProfitsEUR} /> de ces bénéfices ; le rendement en dividendes des autres lignes est inconnu.</p>}
      </>
      ) : (
        <p className="text-[14px] text-brume">La part versée en dividendes est inconnue pour ces lignes : Atlas ne la devine pas.</p>
      )}
      <p className="text-[13px] text-ombre">
        Ta part des profits : valeur de chaque ligne × son rendement bénéficiaire.
        {e.unknown.length > 0 && ` Inconnu pour ${e.unknown.map((id) => instruments[id]?.name).join(", ")}, non compté.`}
      </p>
    </Card>
  );
}

function GlobeCard({ snapshot }: { snapshot: Snapshot }) {
  const countries = useMemo(() => snapshot.breakdowns.country.slices.map((s) => ({ key: s.key, weight: s.weight })), [snapshot]);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- l'heure n'existe qu'au navigateur
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const open = now ? openExchanges(now) : [];
  const known = snapshot.breakdowns.country.slices.reduce((s, c) => s + c.weight, 0);
  return (
    <Card className="flex flex-col gap-4">
      <Eyebrow right={open.length ? `${open.length} places ouvertes` : "Places fermées"}>Où travaille ton argent</Eyebrow>
      <Globe countries={countries} size={300} />
      {known < 0.5 && (
        <p className="text-[13px] text-brume">
          Pays connus pour {formatPct(known, { decimals: 0 })} de ton patrimoine seulement. Yahoo ne donne pas les pays des ETF ; une clé Eulerpool gratuite les ajoute.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-brume">
        <span className="flex items-center gap-2"><i className="block h-2 w-2 rounded-full bg-[var(--globe-pays)]" />Ton argent, par pays</span>
        <span className="flex items-center gap-2"><i className="block h-2 w-2 rounded-full bg-[var(--globe-place)]" />Place ouverte</span>
      </div>
      <p className="text-[13px] text-ombre">
        {open.length ? `Ouvertes maintenant : ${open.map((x) => x.city).join(", ")}.` : "Toutes les places suivies sont fermées en ce moment."} Horaires indicatifs, sans les jours fériés.
      </p>
    </Card>
  );
}

const AXES: { axis: Axis; label: string }[] = [
  { axis: "sector", label: "Secteurs" },
  { axis: "country", label: "Pays" },
  { axis: "currency", label: "Devises" },
];

/** Garde les 7 premières tranches et replie le reste dans « Autres ». */
function fold(b: Breakdown) {
  const named = b.slices.filter((s) => s.key !== "Autres");
  const others = b.slices.filter((s) => s.key === "Autres").reduce((s, x) => s + x.valueEUR, 0) + named.slice(7).reduce((s, x) => s + x.valueEUR, 0);
  const slices = named.slice(0, 7).map((s) => ({ key: s.key, valueEUR: s.valueEUR }));
  if (others > 0) slices.push({ key: "Autres", valueEUR: others });
  return slices;
}

function Breakdowns({ snapshot }: { snapshot: Snapshot }) {
  const [axis, setAxis] = useState<Axis>("sector");
  const b = snapshot.breakdowns[axis];
  const slices = fold(b);
  const unknown = b.undetailedEUR + b.unavailableEUR;
  const total = b.totalEUR || 1;
  const index = AXES.findIndex((a) => a.axis === axis);
  return (
    <section className="flex flex-col gap-5" aria-label="Répartition">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="repere">Répartition réelle</span>
          <h2 className="mt-1 font-serif text-[clamp(28px,6vw,40px)] leading-tight font-[350]">Où est vraiment ton argent</h2>
        </div>
        <div className="verre relative grid w-full grid-cols-3 rounded-full p-1 sm:w-80" role="group" aria-label="Axe de répartition">
          <motion.span
            aria-hidden="true"
            className="absolute top-1 bottom-1 left-1 rounded-full bg-voile/10"
            style={{ width: "calc((100% - 8px) / 3)" }}
            animate={{ x: `${index * 100}%` }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
          />
          {AXES.map((a) => (
            <button key={a.axis} type="button" aria-pressed={a.axis === axis} onClick={() => (haptic(), setAxis(a.axis))} className={`touche relative z-10 rounded-full py-2 text-[13.5px] ${a.axis === axis ? "text-craie" : "text-brume"}`}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex h-12 gap-[2px] overflow-hidden rounded-[14px]" role="img" aria-label={`Répartition par ${AXES[index].label.toLowerCase()}`}>
        {slices.map((s, i) => (
          <motion.i
            key={`${axis}-${s.key}`}
            className="block h-full rounded-[4px]"
            style={{ background: SERIES_COLORS[i], flexBasis: 0 }}
            initial={{ flexGrow: 0, opacity: 0 }}
            animate={{ flexGrow: s.valueEUR / total, opacity: 1 }}
            transition={{ duration: 0.9, ease, delay: i * 0.05 }}
          />
        ))}
        {unknown > 0 && <motion.i key={`${axis}-inconnu`} className="hachures block h-full rounded-[4px]" style={{ flexBasis: 0 }} initial={{ flexGrow: 0 }} animate={{ flexGrow: unknown / total }} transition={{ duration: 0.9, ease, delay: 0.4 }} />}
      </div>
      <ul className="grid gap-x-10 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {slices.map((s, i) => (
          <li key={`${axis}-${s.key}`} className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-3 text-[14.5px]">
            <i className="block h-2.5 w-2.5 rounded-[3px]" style={{ background: SERIES_COLORS[i] }} />
            <span className="truncate">{s.key}</span>
            <span className="tabular">{formatPct(s.valueEUR / total, { decimals: 1 })}</span>
          </li>
        ))}
        {unknown > 0 && (
          <li className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-3 text-[14.5px] text-brume">
            <i className="hachures block h-2.5 w-2.5 rounded-[3px]" />
            <span className="truncate">Non détaillé</span>
            <span className="tabular">{formatPct(unknown / total, { decimals: 1 })}</span>
          </li>
        )}
      </ul>
    </section>
  );
}

function BlindSpots({ snapshot, instruments }: { snapshot: Snapshot; instruments: Record<string, Instrument> }) {
  // Les fonds n'ont souvent qu'un code technique en guise de symbole : on garde leur nom.
  const short = (id: string) => {
    const i = instruments[id];
    if (!i) return id;
    return i.type === "fund" ? i.name : i.symbol.split(".")[0];
  };
  const pairs = snapshot.overlaps.filter((p) => p.overlap > 0.05).slice(0, 3);
  const heavy = snapshot.concentration.above;
  const fees = snapshot.fees;
  const tech = snapshot.breakdowns.sector.slices.find((s) => s.key === "Technologie");
  const e = snapshot.exposure;
  const blind = e.totalEUR > 0 && e.unavailableEUR / e.totalEUR > 0.5;
  return (
    <section className="flex flex-col gap-5" aria-label="Angles morts">
      <div>
        <span className="repere">Angles morts</span>
        <h2 className="mt-1 font-serif text-[clamp(28px,6vw,40px)] leading-tight font-[350]">Ce qu&apos;on ne voit pas en regardant ses lignes</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="flex flex-col gap-3">
          <Eyebrow>Doublons</Eyebrow>
          {pairs.length ? (
            <>
              <p className="font-serif text-[21px] leading-snug">
                {short(pairs[0].a)} et {short(pairs[0].b)} se recouvrent à {pairs[0].partial ? "au moins " : ""}
                <span className="font-sans font-medium tabular">{formatPct(pairs[0].overlap, { decimals: 0 })}</span>.
              </p>
              <ul className="flex flex-col gap-1.5 text-[13.5px] text-brume">
                {pairs.map((p) => (
                  <li key={`${p.a}-${p.b}`} className="flex justify-between gap-3">
                    <span>{short(p.a)} · {short(p.b)}</span>
                    <span className="tabular">{p.partial ? "≥ " : ""}{formatPct(p.overlap, { decimals: 0 })}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[12.5px] text-ombre">Part commune des deux fonds, calculée sur les lignes publiées.</p>
            </>
          ) : (
            <p className="text-[14px] text-brume">Pas de recouvrement notable entre tes fonds.</p>
          )}
        </Card>
        <Card className="flex flex-col gap-3">
          <Eyebrow>Concentration</Eyebrow>
          <p className="font-serif text-[21px] leading-snug">
            {blind ? (
              "Impossible à mesurer tant que la composition de tes fonds est inconnue."
            ) : heavy.length ? (
              <>
                {heavy.map((c) => c.name).join(", ")} {heavy.length > 1 ? "pèsent chacune" : "pèse"} plus de 5 % de ton patrimoine.
              </>
            ) : (
              "Aucune entreprise ne dépasse 5 % de ton patrimoine."
            )}
          </p>
          {tech && (
            <p className="text-[13.5px] text-brume">
              La technologie représente <span className="text-craie tabular">{formatPct(tech.weight, { decimals: 0 })}</span> de ce que tu possèdes.
            </p>
          )}
        </Card>
        <Card className="flex flex-col gap-3">
          <Eyebrow>Frais</Eyebrow>
          <p className="font-serif text-[21px] leading-snug">
            Tes fonds te coûtent <Money value={fees.totalEUR} className="font-sans font-medium" /> par an.
          </p>
          <ul className="flex flex-col gap-1.5 text-[13.5px] text-brume">
            {fees.lines
              .filter((l) => instruments[l.instrumentId]?.type !== "stock")
              .map((l) => (
                <li key={l.instrumentId} className="flex justify-between gap-3">
                  <span className="truncate">{short(l.instrumentId)}</span>
                  <span className="tabular">{l.feeEUR === null ? "frais inconnus" : <Money value={l.feeEUR} />}</span>
                </li>
              ))}
          </ul>
          <p className="text-[12.5px] text-ombre">Valeur de chaque fonds × ses frais courants annuels.</p>
        </Card>
      </div>
    </section>
  );
}

function CompanySheet({ company, instruments, onClose }: { company: CompanyExposure | null; instruments: Record<string, Instrument>; onClose: () => void }) {
  return (
    <Sheet open={!!company} onClose={onClose} title={company?.name ?? "Entreprise"}>
      {company && (
        <div className="flex flex-col gap-6">
          <div>
            <span className="repere">{[company.isin, company.symbol].filter(Boolean).join(" · ") || "Entreprise"}</span>
            <h2 className="mt-1 font-serif text-[32px] leading-tight">{company.name}</h2>
          </div>
          <div className="flex items-end gap-6">
            <div>
              <span className="repere">Poids réel</span>
              <p className="mt-1 text-[40px] leading-none font-medium tracking-[-0.04em] tabular">{formatPct(company.weight, { decimals: 1 })}</p>
            </div>
            <div className="pb-1">
              <span className="repere">Montant</span>
              <p className="mt-1 text-[18px]"><Money value={company.valueEUR} /></p>
            </div>
          </div>
          <div className="flex flex-col gap-2.5">
            <span className="repere">Comment tu la détiens</span>
            {company.via.map((v) => (
              <div key={v.instrumentId} className="flex flex-col gap-1.5">
                <div className="flex justify-between gap-3 text-[14.5px]">
                  <span className="truncate">{instruments[v.instrumentId]?.type === "stock" ? "En direct" : instruments[v.instrumentId]?.name}</span>
                  <Money value={v.valueEUR} className="text-brume" />
                </div>
                <div className="h-[3px] overflow-hidden rounded-full bg-voile/[0.07]">
                  <motion.i className="block h-full origin-left rounded-full bg-voile/80" style={{ width: `${(v.valueEUR / company.valueEUR) * 100}%` }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.9, ease, delay: 0.2 }} />
                </div>
              </div>
            ))}
          </div>
          <CompanyNews key={company.key} symbol={company.symbol} name={company.name} />
          <p className="text-[12.5px] text-ombre">{formatEUR(company.valueEUR)} au total : chaque produit × le poids de l&apos;entreprise dans ce produit.</p>
        </div>
      )}
    </Sheet>
  );
}

const longDate = (d: string) => new Intl.DateTimeFormat("fr-BE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

function ago(iso: string): string {
  const hours = Math.round((Date.now() - Date.parse(iso)) / 3_600_000);
  if (hours < 1) return "à l'instant";
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "hier" : `il y a ${days} jours`;
}

/** Actualités récentes (titre et source, deux lignes au plus) et dates de résultats, depuis Yahoo. */
function CompanyNews({ symbol, name }: { symbol?: string; name: string }) {
  const [info, setInfo] = useState<CompanyInfo | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!symbol) return;
    const controller = new AbortController();
    fetchCompanyInfo(symbol, controller.signal)
      .then(setInfo)
      .catch(() => !controller.signal.aborted && setFailed(true));
    return () => controller.abort();
  }, [symbol]);

  if (!symbol) {
    return <p className="rounded-[18px] border border-voile/[0.07] bg-voile/[0.03] p-4 text-[13.5px] text-brume">Pas de ticker connu pour {name} : actualités et résultats indisponibles.</p>;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-3 rounded-[18px] border border-voile/[0.07] bg-voile/[0.03] p-4">
        <span className="repere">Actualités récentes</span>
        {!info && !failed && [0, 1].map((i) => <div key={i} className="silhouette h-10" />)}
        {failed && <p className="text-[13.5px] text-brume">Actualités indisponibles pour le moment.</p>}
        {info && info.news.length === 0 && <p className="text-[13.5px] text-brume">Pas d&apos;actualité récente centrée sur {name}.</p>}
        {info?.news.map((n) => (
          <a key={n.title} href={n.link ?? undefined} target="_blank" rel="noopener noreferrer" className="group flex flex-col gap-1">
            <span className="line-clamp-2 text-[14px] leading-snug group-hover:underline">{n.title}</span>
            <span className="text-[12px] text-ombre">{[n.publisher, n.publishedAt && ago(n.publishedAt)].filter(Boolean).join(" · ")}</span>
          </a>
        ))}
      </div>
      <div className="flex flex-col gap-2 rounded-[18px] border border-voile/[0.07] bg-voile/[0.03] p-4">
        <span className="repere">Prochains résultats</span>
        {!info && !failed && <div className="silhouette h-10" />}
        {info && (
          <p className="text-[14px] leading-snug">
            {info.nextEarnings ? (
              <>
                {longDate(info.nextEarnings)}
                {info.earningsEstimated && <span className="text-ombre"> (date estimée)</span>}
              </>
            ) : (
              <span className="text-brume">
                Pas encore annoncés.{info.lastEarnings && ` Dernière publication le ${longDate(info.lastEarnings)}.`}
              </span>
            )}
          </p>
        )}
        {failed && <p className="text-[13.5px] text-brume">Date indisponible.</p>}
      </div>
    </div>
  );
}
