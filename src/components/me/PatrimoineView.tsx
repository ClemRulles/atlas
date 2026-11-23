"use client";

import Link from "next/link";
import { useState } from "react";
import { PageSkeleton } from "@/components/shell/states";
import { EXPENSES_EXPLAINED, ExpensesEditor } from "@/components/shell/sheets";
import { Card, Money, Reveal } from "@/components/ui/primitives";
import { planDates } from "@/lib/domain/plans";
import { formatEUR, formatNumber, formatPct } from "@/lib/format";
import { useAtlas } from "@/lib/store";
import { haptic } from "@/lib/ui";

const monthYear = (d: string) => new Intl.DateTimeFormat("fr-BE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d.slice(0, 7)}-15T12:00:00Z`));

/**
 * « Mon patrimoine » : tout ce que l'utilisateur renseigne, au même endroit, avec ce que chaque
 * chose change dans l'app. Plans d'épargne, lignes, dépenses, données.
 */
export function PatrimoineView() {
  const { snapshot, data, mode, portfolio, openSheet, deletePlan, planPending, settings } = useAtlas();
  const [confirm, setConfirm] = useState<string | null>(null);
  if (!snapshot || !data) return <PageSkeleton />;
  const demo = mode === "demo";
  const plans = demo ? [] : (portfolio.plans ?? []);
  const today = snapshot.today;
  const monthlyPlans = plans.filter((p) => !p.end || p.end >= today).reduce((s, p) => s + p.amountEUR, 0);

  const planValue = (planId: string, instrumentId: string) => {
    const parts = data.transactions.filter((t) => t.id.startsWith(`plan:${planId}:`)).reduce((s, t) => s + t.quantity, 0);
    const line = snapshot.lines.find((l) => l.instrument.id === instrumentId);
    if (!line || line.valued.valueEUR === null || line.position.quantity <= 0) return { parts, value: null };
    return { parts, value: (line.valued.valueEUR * parts) / line.position.quantity };
  };

  return (
    <div className="flex flex-col gap-10">
      <Reveal>
        <div className="flex max-w-3xl flex-col gap-4">
          <span className="repere">Mon patrimoine</span>
          <h1 className="font-serif text-[clamp(34px,8vw,56px)] leading-[1.04] font-light tracking-[-0.02em] text-balance">
            Ce que tu investis, <em className="text-brume">ce que tu dépenses.</em>
          </h1>
          <p className="max-w-xl text-[15.5px] leading-relaxed text-brume">
            Tout ce qu&apos;Atlas sait de toi est ici. Tes plans d&apos;épargne et tes lignes font tes chiffres du jour, ce que tu possèdes et le laboratoire. Tes dépenses donnent les morceaux de vie et les paliers du simulateur.
          </p>
          {demo && (
            <button type="button" onClick={() => openSheet("mode")} className="touche self-start rounded-full bg-white px-5 py-3 text-[14.5px] font-medium text-nuit">
              Tu regardes la démo · passer à mon vrai portefeuille
            </button>
          )}
        </div>
      </Reveal>

      <Reveal i={1}>
        <Card className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="repere">Mes plans d&apos;épargne</span>
            {monthlyPlans > 0 && <span className="repere">{formatEUR(monthlyPlans)} / mois</span>}
          </div>
          {plans.length === 0 ? (
            <p className="text-[14.5px] text-brume">
              Tu investis chaque mois, par exemple le 2 sur Trade Republic ? Ajoute ton plan une fois : Atlas recrée chaque versement depuis le début, au bon cours, et continue tout seul les mois suivants.
            </p>
          ) : (
            <ul className="flex flex-col">
              {plans.map((p) => {
                const instrument = portfolio.instruments[p.instrumentId];
                const { parts, value } = planValue(p.id, p.instrumentId);
                const paid = planDates(p, today).length * p.amountEUR;
                return (
                  <li key={p.id} className="flex flex-col gap-1.5 border-t border-white/[0.07] py-3.5 first:border-t-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-[15px]">{instrument?.name ?? p.instrumentId}</span>
                      <span className="shrink-0 text-[15px] tabular">{value === null ? "—" : <Money value={value} />}</span>
                    </div>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[12.5px] text-brume">
                      <span>
                        <Money value={p.amountEUR} /> le {p.dayOfMonth} de chaque mois, depuis {monthYear(p.start)}
                        {p.end ? `, arrêté en ${monthYear(p.end)}` : ""}
                        {p.broker ? ` · ${p.broker}` : ""}
                      </span>
                      <span className="tabular">
                        <Money value={paid} /> versés · {formatNumber(parts, { decimals: 2 })} parts
                        {value !== null && paid > 0 && <> · {formatPct(value / paid - 1, { decimals: 1, sign: true })}</>}
                      </span>
                    </div>
                    <div className="flex justify-end">
                      {confirm === p.id ? (
                        <span className="flex gap-1">
                          <button type="button" onClick={() => setConfirm(null)} className="touche rounded-full px-3 py-1 text-[12.5px] text-brume">Garder</button>
                          <button type="button" onClick={() => (deletePlan(p.id), setConfirm(null), haptic(12))} className="touche rounded-full bg-braise/90 px-3 py-1 text-[12.5px] text-nuit">Supprimer le plan</button>
                        </span>
                      ) : (
                        <button type="button" onClick={() => setConfirm(p.id)} className="touche rounded-full px-3 py-1 text-[12.5px] text-ombre hover:text-craie">Supprimer</button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {planPending > 0 && <p className="text-[12.5px] text-ombre">{planPending} versements en attente de cours : ils apparaîtront dès que les cours seront chargés.</p>}
          <button type="button" onClick={() => (haptic(), openSheet("add", { kind: "plan" }))} className="touche self-start rounded-full bg-white px-5 py-2.5 text-[14px] font-medium text-nuit">
            Ajouter un plan d&apos;épargne
          </button>
        </Card>
      </Reveal>

      <Reveal i={2}>
        <Card className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="repere">Mes lignes</span>
            <span className="repere"><Money value={snapshot.totalEUR} /></span>
          </div>
          {snapshot.lines.length === 0 ? (
            <p className="text-[14.5px] text-brume">Aucune ligne pour l&apos;instant. Ajoute ce que tu possèdes, un achat, ou importe une capture d&apos;écran de ton courtier.</p>
          ) : (
            <ul className="flex flex-col">
              {snapshot.lines.map((l) => (
                <li key={l.instrument.id} className="flex items-baseline justify-between gap-3 border-t border-white/[0.07] py-2.5 text-[14.5px] first:border-t-0">
                  <span className="min-w-0 truncate">{l.instrument.name}</span>
                  <span className="shrink-0 tabular">{l.valued.valueEUR === null ? <span className="text-ombre">cours indisponible</span> : <Money value={l.valued.valueEUR} />}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => (haptic(), openSheet("add", { kind: "own" }))} className="touche rounded-full bg-white px-4 py-2.5 text-[14px] font-medium text-nuit">Ajouter une ligne</button>
            <button type="button" onClick={() => openSheet("capture")} className="touche verre rounded-full px-4 py-2.5 text-[14px]">Capture d&apos;écran</button>
            <button type="button" onClick={() => openSheet("csv")} className="touche verre rounded-full px-4 py-2.5 text-[14px]">Fichier CSV</button>
            <Link href="/" className="touche rounded-full px-4 py-2.5 text-[14px] text-brume underline decoration-white/20 underline-offset-2">Voir le détail</Link>
          </div>
        </Card>
      </Reveal>

      <Reveal i={3}>
        <Card className="flex flex-col gap-4" >
          <span id="depenses" className="repere">Mes dépenses mensuelles</span>
          <p className="text-[14px] leading-relaxed text-brume">{EXPENSES_EXPLAINED}</p>
          <p className="text-[14px]">
            Aujourd&apos;hui : ton patrimoine rapporterait environ <Money value={snapshot.life.monthlyIncomeEUR} /> par mois à {formatPct(settings.expectedReturn, { decimals: 1 })} par an
            {snapshot.life.next ? (
              <>, il couvre {snapshot.life.coveredCount} dépense{snapshot.life.coveredCount > 1 ? "s" : ""} sur {snapshot.life.slices.length}.</>
            ) : (
              ", et couvre toutes tes dépenses."
            )}
          </p>
          <ExpensesEditor key={settings.expenses.map((e) => e.id + e.monthly).join() + settings.expectedReturn} />
        </Card>
      </Reveal>

      <Reveal i={4}>
        <Card className="flex flex-col gap-3">
          <span className="repere">Mes données</span>
          <p className="text-[14px] text-brume">Sauvegarde, import, démo.</p>
          <button type="button" onClick={() => openSheet("mode")} className="touche verre self-start rounded-full px-4 py-2.5 text-[14px]">Ouvrir</button>
        </Card>
      </Reveal>
    </div>
  );
}
