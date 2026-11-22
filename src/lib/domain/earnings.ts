import type { LineValue } from "./lookthrough";
import type { Compositions, Instrument } from "./types";

/**
 * Bénéfices réels : la part des profits annuels des entreprises détenues qui revient à l'utilisateur.
 *   bénéfices = valeur de la ligne × rendement bénéficiaire (inverse du PER)
 *   dividendes = valeur de la ligne × rendement en dividendes
 *   réinvestis = bénéfices − dividendes (gardés par les entreprises pour grandir)
 * Une ligne sans rendement connu est listée à part, jamais estimée.
 */

export interface EarningsLine {
  instrumentId: string;
  valueEUR: number;
  profitsEUR: number;
  dividendsEUR: number;
}

export interface Earnings {
  lines: EarningsLine[];
  profitsEUR: number;
  dividendsEUR: number;
  reinvestedEUR: number;
  /** Valeur couverte par un rendement connu. */
  coveredEUR: number;
  totalEUR: number;
  unknown: string[];
}

export function realEarnings(
  lines: LineValue[],
  instruments: Record<string, Instrument>,
  compositions: Compositions,
): Earnings {
  const out: EarningsLine[] = [];
  const unknown: string[] = [];
  let totalEUR = 0;
  for (const line of lines) {
    const instrument = instruments[line.instrumentId];
    if (!instrument || line.valueEUR === null || line.valueEUR <= 0) continue;
    totalEUR += line.valueEUR;
    const source = instrument.type === "stock" ? instrument : compositions[line.instrumentId];
    const earningsYield = source?.earningsYield;
    if (earningsYield === undefined) {
      unknown.push(instrument.id);
      continue;
    }
    out.push({
      instrumentId: instrument.id,
      valueEUR: line.valueEUR,
      profitsEUR: line.valueEUR * earningsYield,
      dividendsEUR: line.valueEUR * (source?.dividendYield ?? 0),
    });
  }
  const profitsEUR = out.reduce((s, l) => s + l.profitsEUR, 0);
  const dividendsEUR = out.reduce((s, l) => s + l.dividendsEUR, 0);
  return {
    lines: out.sort((a, b) => b.profitsEUR - a.profitsEUR),
    profitsEUR,
    dividendsEUR,
    reinvestedEUR: profitsEUR - dividendsEUR,
    coveredEUR: out.reduce((s, l) => s + l.valueEUR, 0),
    totalEUR,
    unknown,
  };
}
