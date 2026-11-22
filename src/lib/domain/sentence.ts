import { formatEUR } from "@/lib/format";
import type { DayStory } from "./contributors";
import type { Instrument } from "./types";

/**
 * La phrase du jour, construite sans IA à partir des vrais chiffres.
 * Elle est rendue en morceaux typés pour que l'interface puisse souligner les montants
 * (et les flouter en mode discret) sans analyser du texte.
 */

export type Token =
  | { kind: "text"; text: string }
  | { kind: "key"; text: string } // le chiffre du jour, mis en lumière
  | { kind: "amount"; text: string } // un montant secondaire, flouté en mode discret
  | { kind: "name"; text: string }; // une entreprise ou un produit

export interface SentenceOptions {
  /** Date du jour pour l'utilisateur (AAAA-MM-JJ). */
  today: string;
  instruments: Record<string, Instrument>;
}

const CURRENCY_NAMES: Record<string, string> = {
  USD: "Le dollar",
  GBP: "La livre",
  JPY: "Le yen",
  CHF: "Le franc suisse",
};

const text = (t: string): Token => ({ kind: "text", text: t });
const eur = (v: number) => formatEUR(Math.abs(v));

/** « mardi 17 novembre », en heure UTC pour une date ISO. */
export function frenchDay(date: string): string {
  return new Intl.DateTimeFormat("fr-BE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

function viaPhrase(c: DayStory["companies"][number]): string {
  if (c.viaFunds === 0) return "";
  const kind = c.viaKind === "etf" ? (c.viaFunds > 1 ? "ETF" : "ETF") : c.viaKind === "fund" ? (c.viaFunds > 1 ? "fonds" : "fonds") : "produits";
  const count = c.viaFunds === 1 ? `un ${kind === "produits" ? "produit" : kind}` : `${c.viaFunds} ${kind}`;
  return c.direct ? `, que tu détiens en direct et via ${count}` : `, que tu détiens via ${count}`;
}

export function dailySentence(story: DayStory, { today, instruments }: SentenceOptions): Token[] {
  const { change, companies, closeDate } = story;
  if (!closeDate || change.pct === null) {
    return [text("Pas encore de quoi raconter ta journée : il faut au moins deux clôtures pour mesurer une variation.")];
  }
  const tokens: Token[] = [];
  const delta = change.changeEUR;
  const closed = closeDate < today;
  const calm = Math.abs(change.pct) < 0.0005;
  const signed = formatEUR(delta, { sign: true });

  if (calm) {
    tokens.push(text(closed ? `Marchés fermés. ${capitalize(frenchDay(closeDate))}, journée calme : ` : "Journée calme : "));
    tokens.push({ kind: "key", text: signed }, text("."));
  } else {
    if (closed) tokens.push(text(`Marchés fermés. ${capitalize(frenchDay(closeDate))} : `));
    tokens.push({ kind: "key", text: signed }, text(closed ? "." : " aujourd'hui."));
  }

  // L'entreprise qui a le plus poussé dans le sens de la journée.
  const lead = companies.find((c) => Math.sign(c.changeEUR) === Math.sign(delta) && Math.abs(c.changeEUR) >= Math.abs(delta) * 0.15);
  if (lead && !calm) {
    if (delta > 0) {
      tokens.push(text(" Merci "), { kind: "name", text: lead.name }, text(`${viaPhrase(lead)}.`));
    } else {
      tokens.push(text(" "), { kind: "name", text: lead.name }, text(`${viaPhrase(lead)}, t'a coûté `), { kind: "amount", text: eur(lead.changeEUR) }, text("."));
    }
  } else if (!calm) {
    // À défaut d'entreprise identifiable, la ligne qui a le plus bougé.
    const line = [...change.lines]
      .filter((l) => l.changeEUR !== null && Math.sign(l.changeEUR) === Math.sign(delta))
      .sort((a, b) => Math.abs(b.changeEUR!) - Math.abs(a.changeEUR!))[0];
    const name = line && instruments[line.instrumentId]?.name;
    if (name) tokens.push(text(delta > 0 ? " Surtout grâce à " : " Surtout à cause de "), { kind: "name", text: name }, text("."));
  }

  // L'effet des devises, quand il compte.
  const fx = change.fxEffectEUR;
  if (Math.abs(fx) >= 10 && Math.abs(fx) >= Math.abs(delta) * 0.12) {
    const currencies = new Set(
      change.lines.filter((l) => l.fxEffectEUR && Math.abs(l.fxEffectEUR) > 0.01).map((l) => instruments[l.instrumentId]?.currency),
    );
    const only = currencies.size === 1 ? [...currencies][0] : undefined;
    const who = (only && CURRENCY_NAMES[only]) ?? "Les devises";
    const plural = who === "Les devises";
    const amount: Token = { kind: "amount", text: eur(fx) };
    if (delta >= 0 && fx < 0) tokens.push(text(` ${who} ${plural ? "t'en ont" : "t'en a"} repris `), amount, text("."));
    else if (delta >= 0) tokens.push(text(` ${who} ${plural ? "ont" : "a"} ajouté `), amount, text("."));
    else if (fx > 0) tokens.push(text(` ${who} ${plural ? "ont" : "a"} amorti `), amount, text("."));
    else tokens.push(text(` ${who} ${plural ? "ont" : "a"} creusé la baisse de `), amount, text("."));
  }
  return tokens;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** La phrase en texte brut (lecteurs d'écran, partage). */
export function sentenceText(tokens: Token[]): string {
  return tokens.map((t) => t.text).join("");
}
