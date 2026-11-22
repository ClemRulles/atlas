import { describe, expect, it } from "vitest";
import { dayStory } from "./contributors";
import { realEarnings } from "./earnings";
import { EXCHANGES, isOpen, localClock } from "./exchanges";
import { buildPositions } from "./positions";
import { dailySentence, frenchDay, sentenceText } from "./sentence";
import type { Compositions, Instrument, MarketData, Transaction } from "./types";

const instruments: Record<string, Instrument> = {
  ETF: { id: "ETF", symbol: "ETF", name: "ETF Monde", type: "etf", currency: "EUR" },
  ETF2: { id: "ETF2", symbol: "ETF2", name: "ETF US", type: "etf", currency: "EUR" },
  NV: { id: "NV", isin: "NV", symbol: "NVDA", name: "Nvidia", type: "stock", currency: "USD", earningsYield: 0.02, dividendYield: 0.001 },
  EU: { id: "EU", symbol: "EU", name: "Action européenne", type: "stock", currency: "EUR" },
};
const compositions: Compositions = {
  ETF: { instrumentId: "ETF", source: "test", holdings: [{ name: "NVIDIA Corp", isin: "NV", weight: 0.1 }], earningsYield: 0.05, dividendYield: 0.02 },
  ETF2: { instrumentId: "ETF2", source: "test", holdings: [{ name: "NVIDIA Corp", isin: "NV", weight: 0.2 }] },
};
// Jeudi 13 et vendredi 14 novembre 2025.
const market = (nvClose: number, usdClose: number, etfClose = 100): MarketData => ({
  prices: {
    ETF: [{ date: "2025-11-13", close: 100 }, { date: "2025-11-14", close: etfClose }],
    ETF2: [{ date: "2025-11-13", close: 100 }, { date: "2025-11-14", close: 100 }],
    NV: [{ date: "2025-11-13", close: 100 }, { date: "2025-11-14", close: nvClose }],
    EU: [{ date: "2025-11-13", close: 50 }, { date: "2025-11-14", close: 50 }],
  },
  fx: { USD: [{ date: "2025-11-13", close: 1 }, { date: "2025-11-14", close: usdClose }] },
});
const buy = (id: string, instrumentId: string, quantity: number, price: number): Transaction => ({
  id,
  instrumentId,
  side: "buy",
  date: "2025-11-13",
  quantity,
  price,
});
const txs = [buy("1", "ETF", 100, 100), buy("2", "ETF2", 50, 100), buy("3", "NV", 10, 100)];

function story(m: MarketData, date = "2025-11-14") {
  const { positions } = buildPositions(txs, instruments, m, date);
  return dayStory(positions, instruments, m, compositions, date);
}

describe("dayStory", () => {
  it("additionne ce que l'on détient d'une entreprise en direct et via les ETF, multiplié par sa variation", () => {
    const s = story(market(110, 1));
    const nv = s.companies[0];
    // Veille : 1 000 € en direct + 10 % de 10 000 € + 20 % de 5 000 € = 3 000 € ; +10 % → +300 €.
    expect(nv.key).toBe("NV");
    expect(nv.changeEUR).toBeCloseTo(300, 9);
    expect(nv.pct).toBeCloseTo(0.1, 12);
    expect(nv).toMatchObject({ direct: true, viaFunds: 2, viaKind: "etf" });
    expect(s.closeDate).toBe("2025-11-14");
  });

  it("compte la devise dans la variation de l'entreprise", () => {
    const s = story(market(100, 1.25));
    expect(s.companies[0].pct).toBeCloseTo(-0.2, 12);
  });

  it("n'estime rien pour une entreprise dont on ne connaît pas le cours", () => {
    const s = story({ ...market(110, 1), prices: { ...market(110, 1).prices, NV: [] } });
    expect(s.companies).toEqual([]);
  });
});

describe("dailySentence", () => {
  const opts = { instruments, today: "2025-11-14" };

  it("raconte une hausse : le chiffre, le contributeur à travers les ETF, puis l'effet du dollar", () => {
    // Nvidia +20 % en dollars, le dollar perd 10 % : +8 % en euros. Seule la ligne en direct bouge (les ETF sont à plat) : +80 €.
    const tokens = dailySentence(story(market(120, 1.111111111)), opts);
    const text = sentenceText(tokens);
    expect(text).toMatch(/^\+\d+ € aujourd'hui\. Merci Nvidia, que tu détiens en direct et via 2 ETF\. Le dollar t'en a repris \d+ €\.$/);
    expect(tokens.find((t) => t.kind === "key")?.text).toBe("+80 €");
    expect(tokens.filter((t) => t.kind === "amount")).toHaveLength(1);
  });

  it("raconte une baisse avec ce qu'elle a coûté", () => {
    const text = sentenceText(dailySentence(story(market(90, 1)), opts));
    expect(text).toBe("−100 € aujourd'hui. Nvidia, que tu détiens en direct et via 2 ETF, t'a coûté 300 €.");
  });

  it("dit quand les marchés sont fermés", () => {
    const text = sentenceText(dailySentence(story(market(110, 1)), { ...opts, today: "2025-11-16" }));
    expect(text.startsWith("Marchés fermés. Vendredi 14 novembre : +100 €. Merci Nvidia")).toBe(true);
  });

  it("reconnaît une journée calme", () => {
    const text = sentenceText(dailySentence(story(market(100, 1)), opts));
    expect(text).toBe("Journée calme : 0 €.");
  });

  it("ne raconte rien sans deux clôtures", () => {
    const text = sentenceText(dailySentence(story(market(110, 1), "2025-11-13"), { ...opts, today: "2025-11-13" }));
    expect(text).toMatch(/^Pas encore de quoi raconter/);
  });

  it("écrit les jours en français", () => {
    expect(frenchDay("2026-11-17")).toBe("mardi 17 novembre");
  });
});

describe("realEarnings", () => {
  it("sépare dividendes versés et bénéfices réinvestis, et signale les rendements inconnus", () => {
    const e = realEarnings(
      [{ instrumentId: "ETF", valueEUR: 10_000 }, { instrumentId: "NV", valueEUR: 1_000 }, { instrumentId: "ETF2", valueEUR: 5_000 }],
      instruments,
      compositions,
    );
    expect(e.profitsEUR).toBeCloseTo(500 + 20, 9);
    expect(e.dividendsEUR).toBeCloseTo(200 + 1, 9);
    expect(e.reinvestedEUR).toBeCloseTo(319, 9);
    expect(e.coveredEUR).toBe(11_000);
    expect(e.totalEUR).toBe(16_000);
    expect(e.unknown).toEqual(["ETF2"]);
    expect(e.lines[0].instrumentId).toBe("ETF");
  });
});

describe("places boursières", () => {
  const brussels = EXCHANGES.find((x) => x.id === "xbru")!;
  const newYork = EXCHANGES.find((x) => x.id === "xnys")!;

  it("lit l'heure locale de chaque fuseau", () => {
    expect(localClock(new Date("2026-11-17T14:40:00Z"), "Europe/Brussels")).toEqual({ weekday: 2, minutes: 15 * 60 + 40 });
  });

  it("ouvre Bruxelles et New York un mardi à 15 h 40, heure de Bruxelles", () => {
    const tuesday = new Date("2026-11-17T14:40:00Z");
    expect(isOpen(brussels, tuesday)).toBe(true);
    expect(isOpen(newYork, tuesday)).toBe(true);
    expect(isOpen(EXCHANGES.find((x) => x.id === "xtks")!, tuesday)).toBe(false);
  });

  it("ferme tout le week-end et après la clôture", () => {
    expect(isOpen(brussels, new Date("2026-11-22T10:00:00Z"))).toBe(false);
    expect(isOpen(brussels, new Date("2026-11-17T16:30:00Z"))).toBe(false); // 17 h 30 à Bruxelles
  });
});
