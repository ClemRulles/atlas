import { realExposure } from "./lookthrough";
import { closeAt, fxAt } from "./market";
import type { Position } from "./positions";
import type { Compositions, Instrument, MarketData } from "./types";
import { dayChange, type DayChange } from "./valuation";

/**
 * Qui a fait la journée, en traversant les ETF.
 *
 * Pour une entreprise dont on connaît le cours, sa contribution vaut ce que l'on en détenait
 * vraiment la veille (en direct et via les fonds) multiplié par sa variation du jour en euros.
 * Les entreprises sans cours connu ne sont pas estimées : elles n'apparaissent pas.
 */

export interface CompanyContribution {
  key: string;
  name: string;
  changeEUR: number;
  /** Variation du jour de l'entreprise, en euros (cours et devise compris). */
  pct: number;
  direct: boolean;
  /** Nombre de fonds par lesquels elle est détenue. */
  viaFunds: number;
  viaKind: "etf" | "fund" | "mixed" | null;
}

export interface DayStory {
  change: DayChange;
  companies: CompanyContribution[];
  /** Date de la dernière clôture (peut précéder la date demandée : week-end, jour férié). */
  closeDate: string | null;
}

export function dayStory(
  positions: Position[],
  instruments: Record<string, Instrument>,
  market: MarketData,
  compositions: Compositions,
  date: string,
): DayStory {
  const change = dayChange(positions, instruments, market, date);
  const previous = change.lines.map((l) => ({ instrumentId: l.instrumentId, valueEUR: l.previousEUR }));
  const exposure = realExposure(previous, instruments, compositions);
  const closeDate = change.lines.reduce<string | null>((max, l) => (l.date && (!max || l.date > max) ? l.date : max), null);

  const companies: CompanyContribution[] = [];
  for (const company of exposure.companies) {
    const instrument = instruments[company.key];
    if (!instrument || !closeDate) continue;
    const history = market.prices[instrument.id];
    const last = closeAt(history, closeDate);
    const before = last ? closeAt(history, last.date, true) : undefined;
    if (!last || !before) continue;
    const fxLast = fxAt(market, instrument.currency, last.date);
    const fxBefore = fxAt(market, instrument.currency, before.date);
    if (fxLast === undefined || fxBefore === undefined) continue;
    const pct = last.close / fxLast / (before.close / fxBefore) - 1;
    const funds = company.via.filter((v) => instruments[v.instrumentId]?.type !== "stock");
    const kinds = new Set(funds.map((v) => instruments[v.instrumentId].type));
    companies.push({
      key: company.key,
      name: company.name,
      changeEUR: company.valueEUR * pct,
      pct,
      direct: company.direct,
      viaFunds: funds.length,
      viaKind: kinds.size === 0 ? null : kinds.size > 1 ? "mixed" : kinds.has("etf") ? "etf" : "fund",
    });
  }
  companies.sort((a, b) => Math.abs(b.changeEUR) - Math.abs(a.changeEUR));
  return { change, companies, closeDate };
}
