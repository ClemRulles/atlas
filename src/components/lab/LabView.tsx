"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { EmptyPortfolio, PageSkeleton } from "@/components/shell/states";
import { Card, Pct, Reveal } from "@/components/ui/primitives";
import { convictions } from "@/lib/analysis";
import { useAtlas } from "@/lib/store";

const ease = [0.16, 1, 0.3, 1] as const;

/** Petit tracé qui se dessine : illustration, pas une donnée. */
function Trace({ d, dashed = false, delay = 0, opacity = 1 }: { d: string; dashed?: boolean; delay?: number; opacity?: number }) {
  return (
    <motion.path
      d={d}
      fill="none"
      stroke="#fff"
      strokeOpacity={opacity}
      strokeWidth={dashed ? 1.25 : 1.75}
      strokeDasharray={dashed ? "3 5" : undefined}
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={{ pathLength: 0 }}
      whileInView={{ pathLength: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 1.3, ease, delay }}
    />
  );
}

const ILLUSTRATIONS: Record<string, ReactNode> = {
  futur: (
    <svg viewBox="0 0 200 80" className="h-auto w-full max-w-[340px]" aria-hidden="true">
      <path d="M8 62 C70 54 120 30 192 6 L192 52 C120 58 70 62 8 66 Z" fill="var(--mood)" fillOpacity=".16" />
      <Trace d="M8 64 C70 58 120 42 192 28" />
      <Trace d="M8 62 C70 54 120 30 192 6" opacity={0.35} delay={0.15} />
      <Trace d="M8 66 C70 62 120 58 192 52" opacity={0.35} delay={0.25} />
      <circle cx="132" cy="38" r="3" fill="var(--color-lavande)" />
    </svg>
  ),
  crises: (
    <svg viewBox="0 0 200 80" className="h-auto w-full max-w-[340px]" aria-hidden="true">
      <Trace d="M8 22 L40 18 L58 30 L74 62 L90 58 L112 44 L140 34 L168 24 L192 16" />
      <line x1="74" y1="10" x2="74" y2="72" stroke="var(--color-braise)" strokeOpacity=".5" strokeDasharray="2 4" />
    </svg>
  ),
  jumeau: (
    <svg viewBox="0 0 200 80" className="h-auto w-full max-w-[340px]" aria-hidden="true">
      <Trace d="M8 66 C50 60 80 48 110 42 S160 24 192 14" />
      <Trace d="M8 66 C50 62 80 54 110 50 S160 34 192 26" dashed delay={0.2} opacity={0.6} />
    </svg>
  ),
  avant: (
    <svg viewBox="0 0 200 80" className="h-auto w-full max-w-[340px]" aria-hidden="true">
      {[52, 34, 22, 14].map((w, i) => (
        <g key={i}>
          <rect x="8" y={10 + i * 16} width={w * 1.4} height="5" rx="2.5" fill="#fff" fillOpacity=".25" />
          <motion.rect x="8" y={17 + i * 16} height="5" rx="2.5" fill="var(--color-lavande)" initial={{ width: w * 1.4 }} whileInView={{ width: (w + [6, 2, 18, 1][i]) * 1.4 }} viewport={{ once: true }} transition={{ duration: 1, ease, delay: 0.3 + i * 0.08 }} />
        </g>
      ))}
    </svg>
  ),
  choc: (
    <svg viewBox="0 0 200 80" className="h-auto w-full max-w-[340px]" aria-hidden="true">
      <rect x="8" y="14" width="184" height="16" rx="5" fill="#fff" fillOpacity=".12" />
      <motion.rect x="8" y="14" height="16" rx="5" fill="var(--color-braise)" fillOpacity=".7" initial={{ width: 0 }} whileInView={{ width: 62 }} viewport={{ once: true }} transition={{ duration: 1, ease, delay: 0.3 }} />
      <rect x="8" y="44" width="184" height="16" rx="5" fill="#fff" fillOpacity=".12" />
      <motion.rect x="8" y="44" height="16" rx="5" fill="var(--color-lavande)" fillOpacity=".7" initial={{ width: 0 }} whileInView={{ width: 30 }} viewport={{ once: true }} transition={{ duration: 1, ease, delay: 0.4 }} />
    </svg>
  ),
};

const EXPERIMENTS = [
  { id: "futur", title: "Simulateur du futur", question: "Où en serai-je dans 15 ans, si je verse 500 € par mois ?", text: "Des milliers de futurs possibles tirés au hasard, en cône : pessimiste, médian, optimiste. Les morceaux de vie posés sur la ligne du temps." },
  { id: "crises", title: "Rejouer les crises", question: "Et si 2008 arrivait à mon portefeuille d'aujourd'hui ?", text: "2008, Covid 2020, 2022 rejoués sur tes lignes : perte maximale en euros et temps pour revenir." },
  { id: "jumeau", title: "Le jumeau paresseux", question: "Aurais-je fait mieux en mettant tout dans un ETF monde ?", text: "Tes achats, aux mêmes dates et pour les mêmes montants, placés dans un seul ETF monde." },
  { id: "avant", title: "Avant d'acheter", question: "Qu'est-ce que cet achat change à ce que je possède ?", text: "Un ISIN et un montant : l'avant et l'après sur tes secteurs, tes pays et ta concentration." },
  { id: "choc", title: "Choc sur mesure", question: "Et si la tech américaine perdait 30 % ?", text: "Un secteur, un pays ou une devise qui chute : ce que tu perdrais en euros, ETF traversés." },
];

export function LabView() {
  const { snapshot, mode, data } = useAtlas();
  if (!snapshot || !data) return <PageSkeleton />;
  if (mode === "real" && snapshot.lines.length === 0) return <EmptyPortfolio question="Et si… ?" />;
  const notes = convictions(data, snapshot.today);
  const old = notes.filter((n) => n.ageDays >= 182);
  const memory = old[old.length - 1] ?? notes[notes.length - 1];

  return (
    <div className="flex flex-col gap-10">
      <Reveal>
        <div className="flex max-w-3xl flex-col gap-4">
          <span className="repere">Le laboratoire</span>
          <h1 className="font-serif text-[clamp(36px,9vw,64px)] leading-[1.02] font-light tracking-[-0.02em] text-balance">
            Et si… <em className="text-brume">Essaie des futurs sans toucher à rien.</em>
          </h1>
          <p className="max-w-xl text-[16px] leading-relaxed text-brume">
            Des expériences sur ton portefeuille réel. Elles éclairent, elles ne prédisent pas : chaque résultat est illustratif.
          </p>
        </div>
      </Reveal>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {EXPERIMENTS.map((x, i) => (
          <Reveal key={x.id} i={i + 1}>
            <Card className="flex h-full flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <span className="repere">{x.title}</span>
                <span className="repere rounded-full border border-white/10 px-2 py-1 !text-[10px]">Phase 4</span>
              </div>
              {ILLUSTRATIONS[x.id]}
              <p className="font-serif text-[21px] leading-snug font-[350] text-balance">{x.question}</p>
              <p className="text-[14px] leading-relaxed text-brume">{x.text}</p>
            </Card>
          </Reveal>
        ))}

        {memory && (
          <Reveal i={EXPERIMENTS.length + 1}>
            <Card className="flex h-full flex-col gap-4 md:col-span-2 xl:col-span-1">
              <div className="flex items-center justify-between gap-3">
                <span className="repere">Journal de convictions</span>
                <span className="repere">{notes.length} notes</span>
              </div>
              <p className="text-[14px] text-brume">
                Il y a {memory.ageDays >= 730 ? `${Math.floor(memory.ageDays / 365)} ans` : memory.ageDays >= 365 ? "un an" : `${Math.round(memory.ageDays / 30)} mois`}, en achetant {memory.instrument.name}, tu écrivais :
              </p>
              <blockquote className="font-serif text-[23px] leading-snug italic">« {memory.note} »</blockquote>
              <p className="text-[14px] text-brume">
                Depuis, son cours en euros a fait <Pct value={memory.sincePct} decimals={0} />. Tu le penses toujours ?
              </p>
              <ul className="mt-auto flex flex-col border-t border-white/10 pt-3 text-[13px] text-ombre">
                {notes.slice(0, 3).map((n) => (
                  <li key={`${n.date}-${n.instrument.id}`} className="flex justify-between gap-3 py-1">
                    <span className="truncate">{n.instrument.name}</span>
                    <span className="tabular">{new Intl.DateTimeFormat("fr-BE", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(n.date))}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </Reveal>
        )}
      </div>
    </div>
  );
}
