/**
 * « Demande à ton patrimoine », sans IA : la question est rapprochée d'un sujet connu,
 * la réponse est écrite à partir des chiffres déjà calculés. Jamais de conseil d'achat ou de vente.
 */

import type { Snapshot } from "@/lib/analysis";
import { sentenceText } from "@/lib/domain/sentence";
import type { SavingsPlan } from "@/lib/domain/types";
import { formatEUR, formatPct } from "@/lib/format";

export interface ChatContext {
  snapshot: Snapshot;
  plans: SavingsPlan[];
  expectedReturn: number;
}

export interface ChatAnswer {
  topic: string;
  text: string;
  /** Page où creuser, le cas échéant. */
  link?: { href: string; label: string };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9%€ ]+/g, " ");

const eur = (v: number) => formatEUR(v);
const pct = (v: number, d = 0) => formatPct(v, { decimals: d });

type Topic = { id: string; match: RegExp; answer: (c: ChatContext) => ChatAnswer };

const TOPICS: Topic[] = [
  {
    id: "conseil",
    match: /\b(dois je|devrais je|faut il|conseil|acheter|vendre|vend|achete|investir dans|bon moment|que faire)\b/,
    answer: () => ({
      topic: "conseil",
      text: "Je ne te dirai jamais quoi acheter ou vendre : je ne suis pas conseiller. Je peux en revanche te montrer ce qu'un achat changerait à ce que tu possèdes, dans le laboratoire, onglet « Avant d'acheter ».",
      link: { href: "/et-si", label: "Ouvrir le laboratoire" },
    }),
  },
  {
    id: "jour",
    match: /\b(aujourd hui|hier|journee|ce matin|perdu|gagne aujourd|baisse|hausse|pourquoi)\b/,
    answer: ({ snapshot }) => ({ topic: "jour", text: sentenceText(snapshot.sentence) }),
  },
  {
    id: "devise",
    match: /\b(dollars?|usd|devises?|change|euros?|yen|livres?)\b/,
    answer: ({ snapshot }) => {
      const b = snapshot.breakdowns.currency;
      const known = b.slices.filter((s) => s.key !== "Autres");
      if (known.length === 0) return { topic: "devise", text: "Je ne connais pas encore la répartition par devise de ce que tu possèdes : il faut la composition de tes fonds, pays compris." };
      const usd = b.slices.find((s) => s.key === "USD");
      const unknown = b.totalEUR > 0 ? (b.undetailedEUR + b.unavailableEUR) / b.totalEUR : 0;
      return {
        topic: "devise",
        text: `${usd ? `${pct(usd.weight)} de ton argent travaille en dollars (${eur(usd.valueEUR)}). ` : ""}Détail : ${known.slice(0, 4).map((s) => `${s.key} ${pct(s.weight)}`).join(", ")}.${unknown > 0.05 ? ` Inconnu pour ${pct(unknown)} de ton patrimoine.` : ""} Quand le dollar baisse face à l'euro, cette part perd de la valeur en euros, même si les entreprises ne bougent pas.`,
        link: { href: "/possessions", label: "Voir la répartition" },
      };
    },
  },
  {
    id: "plans",
    match: /\b(plans?|epargne|verse|verses|versements?|chaque mois|mensuel|programme)\b/,
    answer: ({ plans, snapshot }) => {
      const active = plans.filter((p) => !p.end || p.end >= snapshot.today);
      if (plans.length === 0) return { topic: "plans", text: "Tu n'as pas encore de plan d'épargne dans Atlas. Ajoute-le dans « Mon patrimoine » : je recalcule chaque versement depuis le début.", link: { href: "/patrimoine", label: "Mon patrimoine" } };
      const monthly = active.reduce((s, p) => s + p.amountEUR, 0);
      return {
        topic: "plans",
        text: `Tu as ${active.length} plan${active.length > 1 ? "s" : ""} en cours, pour ${eur(monthly)} par mois, soit ${eur(monthly * 12)} par an. Sur 15 ans au même rythme, ça fait ${eur(monthly * 12 * 15)} versés, avant tout rendement.`,
        link: { href: "/et-si", label: "Simuler le futur" },
      };
    },
  },
  {
    id: "frais",
    match: /\b(frais|ter|cout|coute|couts)\b/,
    answer: ({ snapshot }) => ({
      topic: "frais",
      text: `Tes fonds te coûtent environ ${eur(snapshot.fees.totalEUR)} par an en frais courants.${snapshot.fees.unknown.length ? ` Frais inconnus pour ${snapshot.fees.unknown.length} fonds, non comptés.` : ""} Ces frais sont prélevés dans le cours des fonds : tu ne les vois jamais passer.`,
    }),
  },
  {
    id: "benefices",
    match: /\b(dividende|dividendes|benefice|benefices|profit|profits|rapporte|par an|revenu|revenus)\b/,
    answer: ({ snapshot, expectedReturn }) => {
      const e = snapshot.earnings;
      const profits = e.coveredEUR > 0 ? `Les entreprises que tu possèdes gagnent environ ${eur(e.profitsEUR)} par an pour toi${e.splitProfitsEUR > 0 ? `, dont ${eur(e.dividendsEUR)} versés en dividendes` : ""}. ` : "";
      return { topic: "benefices", text: `${profits}Avec un rendement attendu de ${pct(expectedReturn, 1)} par an, ton patrimoine rapporterait en théorie ${eur(snapshot.life.monthlyIncomeEUR)} par mois.` };
    },
  },
  {
    id: "risque",
    match: /\b(risque|risques|angle mort|angles morts|concentration|concentre|doublon|doublons|recouvrement|diversif)\w*/,
    answer: ({ snapshot }) => {
      const heavy = snapshot.concentration.above;
      const pair = snapshot.overlaps[0];
      const tech = snapshot.breakdowns.sector.slices[0];
      const parts = [
        heavy.length ? `${heavy.map((c) => c.name).join(", ")} ${heavy.length > 1 ? "pèsent chacune" : "pèse"} plus de 5 % de ton patrimoine` : "aucune entreprise ne dépasse 5 % de ton patrimoine",
        tech ? `le premier secteur, ${tech.key.toLowerCase()}, représente ${pct(tech.weight)}` : null,
        pair && pair.overlap > 0.1 ? `deux de tes fonds se recouvrent à au moins ${pct(pair.overlap)}` : null,
      ].filter(Boolean);
      return { topic: "risque", text: `Ce qui ressort : ${parts.join(" ; ")}.`, link: { href: "/possessions", label: "Voir les angles morts" } };
    },
  },
  {
    id: "secteur",
    match: /\b(secteur|secteurs|tech|technologie|sante|finance|industrie)\b/,
    answer: ({ snapshot }) => {
      const s = snapshot.breakdowns.sector.slices.slice(0, 4);
      return s.length ? { topic: "secteur", text: `Tes premiers secteurs, fonds traversés : ${s.map((x) => `${x.key.toLowerCase()} ${pct(x.weight)}`).join(", ")}.`, link: { href: "/possessions", label: "Voir le détail" } } : { topic: "secteur", text: "Je ne connais pas encore tes secteurs : la composition de tes fonds n'est pas chargée." };
    },
  },
  {
    id: "pays",
    match: /\b(pays|etats unis|amerique|europe|chine|japon|monde|geograph)\w*/,
    answer: ({ snapshot }) => {
      const s = snapshot.breakdowns.country.slices.slice(0, 4);
      return s.length ? { topic: "pays", text: `Tes premiers pays : ${s.map((x) => `${x.key} ${pct(x.weight)}`).join(", ")}.` } : { topic: "pays", text: "Je ne connais pas les pays de tes fonds avec la source gratuite actuelle. Une clé Eulerpool gratuite les ajoute." };
    },
  },
  {
    id: "top",
    match: /\b(plus grosse|plus grosses|principale|principales|top|entreprise|entreprises|possede|detiens|nvidia|apple|microsoft)\w*/,
    answer: ({ snapshot }) => {
      const top = snapshot.exposure.companies.slice(0, 5);
      return top.length
        ? { topic: "top", text: `Tes plus grosses entreprises, fonds compris : ${top.map((c) => `${c.name} ${pct(c.weight, 1)}`).join(", ")}.`, link: { href: "/possessions", label: "Ce que tu possèdes" } }
        : { topic: "top", text: "Je ne vois pas encore d'entreprise : ajoute tes lignes ou attends que la composition de tes fonds se charge." };
    },
  },
  {
    id: "performance",
    match: /\b(performance|rendement|perf|combien|total|patrimoine|vaut|valeur|plus value|gain|gains)\b/,
    answer: ({ snapshot }) => ({
      topic: "performance",
      text: `Ton patrimoine vaut ${eur(snapshot.totalEUR)}, pour ${eur(snapshot.costEUR)} investis : ${snapshot.gainEUR >= 0 ? "+" : ""}${eur(snapshot.gainEUR)} de plus-value latente.${snapshot.twrAnnual !== null ? ` Hors versements, tes placements ont fait ${formatPct(snapshot.twrAnnual, { decimals: 1, sign: true })} par an en moyenne.` : ""}`,
    }),
  },
  {
    id: "depenses",
    match: /\b(depense|depenses|loyer|courses|morceaux|vivre|rente|liberte)\w*/,
    answer: ({ snapshot }) => {
      const l = snapshot.life;
      return {
        topic: "depenses",
        text: `En théorie, ton patrimoine paierait ${eur(l.monthlyIncomeEUR)} de dépenses par mois. ${l.next ? `Prochain palier : ${l.next.expense.label.toLowerCase()} entièrement couvert à ${eur(l.next.capitalNeededEUR ?? 0)} de patrimoine.` : "Toutes tes dépenses renseignées sont couvertes."}`,
        link: { href: "/patrimoine#depenses", label: "Mes dépenses" },
      };
    },
  },
  {
    id: "crise",
    match: /\b(crise|krach|crash|chute|2008|covid|recession)\b/,
    answer: () => ({ topic: "crise", text: "Le laboratoire rejoue 2008, le Covid et 2022 sur ton portefeuille d'aujourd'hui : perte maximale en euros et temps pour revenir.", link: { href: "/et-si", label: "Rejouer une crise" } }),
  },
];

export const SUGGESTIONS = [
  "Combien vaut mon patrimoine ?",
  "Que s'est-il passé aujourd'hui ?",
  "Quelle part de mon argent est en dollars ?",
  "Quel est mon plus gros angle mort ?",
  "Combien je verse chaque mois ?",
  "Combien me coûtent mes frais ?",
];

export function answer(question: string, context: ChatContext): ChatAnswer {
  const q = norm(question);
  const topic = TOPICS.find((t) => t.match.test(q));
  if (topic) return topic.answer(context);
  return {
    topic: "inconnu",
    text: "Je ne sais pas encore répondre à ça. Je peux te parler de ta journée, de ta valeur et ta performance, de tes plans d'épargne, de tes dollars, de tes secteurs et pays, de tes frais, de tes bénéfices, de tes angles morts et de tes dépenses.",
  };
}
