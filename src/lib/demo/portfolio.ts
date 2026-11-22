import { closeAt, fxAt } from "@/lib/domain/market";
import type {
  Compositions,
  Expense,
  FundComposition,
  Holding,
  Instrument,
  MarketData,
  PriceHistory,
  Transaction,
  Weight,
} from "@/lib/domain/types";

/**
 * Portefeuille de démonstration : un investisseur belge fictif, trois courtiers, neuf lignes.
 * Les noms sont réels pour que l'écran soit parlant ; tout le reste (cours, transactions,
 * compositions) est FICTIF et généré de façon déterministe. Rien ici ne décrit un marché réel.
 */

export interface DemoPortfolio {
  instruments: Record<string, Instrument>;
  transactions: Transaction[];
  market: MarketData;
  compositions: Compositions;
  expenses: Expense[];
  /** Hypothèse de rendement annuel pour les « morceaux de vie ». */
  expectedReturn: number;
  asOf: string;
}

const START = "2021-01-04";

/* ——— Hasard déterministe ——— */

/** Nombre pseudo-aléatoire dans [0, 1[ qui ne dépend que de (flux, jour, tirage). */
function hash01(stream: number, day: number, draw: number): number {
  let h = Math.imul(stream ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(day + 1, 0xc2b2ae35) ^ Math.imul(draw + 7, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Tirage gaussien indexé par jour : ajouter des jours à la fin ne change jamais le passé,
 * donc la démo garde la même histoire d'un jour à l'autre.
 */
function gaussian(stream: number, day: number): number {
  const u = Math.max(hash01(stream, day, 0), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * hash01(stream, day, 1));
}

/** Indice de jour stable (jours depuis le 1er janvier 2021), indépendant de la date d'arrêt. */
const dayIndex = (date: string) => Math.round((Date.parse(date) - Date.parse("2021-01-01")) / 86_400_000);

/** Jours ouvrés (lundi à vendredi) entre deux dates incluses. */
export function businessDays(from: string, to: string): string[] {
  const days: string[] = [];
  const end = Date.parse(to);
  for (let t = Date.parse(from); t <= end; t += 86_400_000) {
    const weekday = new Date(t).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
}

/* ——— Instruments ——— */

interface Spec {
  instrument: Instrument;
  start: number;
  /** Sensibilité au marché, dérive propre et volatilité propre (par jour). */
  beta: number;
  alpha: number;
  vol: number;
}

const SPECS: Spec[] = [
  { instrument: { id: "IE00B4L5Y983", isin: "IE00B4L5Y983", symbol: "IWDA.AS", name: "iShares Core MSCI World", type: "etf", currency: "EUR", exchange: "Amsterdam", benchmark: "MSCI World" }, start: 61.2, beta: 1, alpha: 0, vol: 0.002 },
  { instrument: { id: "IE00BK5BQT80", isin: "IE00BK5BQT80", symbol: "VWCE.DE", name: "Vanguard FTSE All-World", type: "etf", currency: "EUR", exchange: "Xetra", benchmark: "MSCI World" }, start: 86.4, beta: 0.97, alpha: 0, vol: 0.002 },
  { instrument: { id: "IE00BKM4GZ66", isin: "IE00BKM4GZ66", symbol: "EMIM.AS", name: "iShares Core MSCI EM IMI", type: "etf", currency: "EUR", exchange: "Amsterdam", benchmark: "MSCI Emerging Markets" }, start: 31.5, beta: 0.8, alpha: -0.00025, vol: 0.006 },
  { instrument: { id: "IE00B5BMR087", isin: "IE00B5BMR087", symbol: "CSPX.L", name: "iShares Core S&P 500", type: "etf", currency: "USD", exchange: "Londres", benchmark: "S&P 500" }, start: 372, beta: 1.06, alpha: 0.00005, vol: 0.003 },
  { instrument: { id: "NL0010273215", isin: "NL0010273215", symbol: "ASML.AS", name: "ASML", type: "stock", currency: "EUR", exchange: "Amsterdam", sector: "Technologie", country: "Pays-Bas", benchmark: "MSCI World", earningsYield: 0.028, dividendYield: 0.009 }, start: 418, beta: 1.45, alpha: 0.0001, vol: 0.015 },
  { instrument: { id: "US67066G1040", isin: "US67066G1040", symbol: "NVDA", name: "Nvidia", type: "stock", currency: "USD", exchange: "Nasdaq", sector: "Technologie", country: "États-Unis", benchmark: "Nasdaq 100", earningsYield: 0.022, dividendYield: 0.0003 }, start: 13.1, beta: 1.8, alpha: 0.0011, vol: 0.022 },
  { instrument: { id: "US5949181045", isin: "US5949181045", symbol: "MSFT", name: "Microsoft", type: "stock", currency: "USD", exchange: "Nasdaq", sector: "Technologie", country: "États-Unis", benchmark: "Nasdaq 100", earningsYield: 0.03, dividendYield: 0.007 }, start: 217, beta: 1.12, alpha: 0.0001, vol: 0.011 },
  { instrument: { id: "BE0974293251", isin: "BE0974293251", symbol: "ABI.BR", name: "AB InBev", type: "stock", currency: "EUR", exchange: "Bruxelles", sector: "Consommation de base", country: "Belgique", benchmark: "MSCI World", earningsYield: 0.055, dividendYield: 0.018 }, start: 57.4, beta: 0.7, alpha: -0.0003, vol: 0.012 },
  { instrument: { id: "FR0010135103", isin: "FR0010135103", symbol: "0P00000FB2.F", name: "Carmignac Patrimoine A", type: "fund", currency: "EUR", exchange: "Fonds", benchmark: "MSCI World" }, start: 688, beta: 0.38, alpha: -0.00012, vol: 0.0025 },
];

/* ——— Compositions (ordres de grandeur plausibles, fictifs) ——— */

const COMPANY = {
  nvidia: { name: "Nvidia", isin: "US67066G1040", symbol: "NVDA", sector: "Technologie", country: "États-Unis", currency: "USD" },
  apple: { name: "Apple", isin: "US0378331005", symbol: "AAPL", sector: "Technologie", country: "États-Unis", currency: "USD" },
  microsoft: { name: "Microsoft", isin: "US5949181045", symbol: "MSFT", sector: "Technologie", country: "États-Unis", currency: "USD" },
  amazon: { name: "Amazon", isin: "US0231351067", symbol: "AMZN", sector: "Consommation discrétionnaire", country: "États-Unis", currency: "USD" },
  alphabet: { name: "Alphabet", isin: "US02079K3059", symbol: "GOOGL", sector: "Communication", country: "États-Unis", currency: "USD" },
  meta: { name: "Meta", isin: "US30303M1027", symbol: "META", sector: "Communication", country: "États-Unis", currency: "USD" },
  broadcom: { name: "Broadcom", isin: "US11135F1012", symbol: "AVGO", sector: "Technologie", country: "États-Unis", currency: "USD" },
  tesla: { name: "Tesla", isin: "US88160R1014", symbol: "TSLA", sector: "Consommation discrétionnaire", country: "États-Unis", currency: "USD" },
  berkshire: { name: "Berkshire Hathaway", isin: "US0846707026", symbol: "BRK-B", sector: "Finance", country: "États-Unis", currency: "USD" },
  jpmorgan: { name: "JPMorgan Chase", isin: "US46625H1005", symbol: "JPM", sector: "Finance", country: "États-Unis", currency: "USD" },
  lilly: { name: "Eli Lilly", isin: "US5324571083", symbol: "LLY", sector: "Santé", country: "États-Unis", currency: "USD" },
  asml: { name: "ASML", isin: "NL0010273215", symbol: "ASML.AS", sector: "Technologie", country: "Pays-Bas", currency: "EUR" },
  novo: { name: "Novo Nordisk", isin: "DK0062498333", symbol: "NOVO-B.CO", sector: "Santé", country: "Danemark", currency: "DKK" },
  lvmh: { name: "LVMH", isin: "FR0000121014", symbol: "MC.PA", sector: "Consommation discrétionnaire", country: "France", currency: "EUR" },
  abinbev: { name: "AB InBev", isin: "BE0974293251", symbol: "ABI.BR", sector: "Consommation de base", country: "Belgique", currency: "EUR" },
  tsmc: { name: "TSMC", isin: "TW0002330008", symbol: "2330.TW", sector: "Technologie", country: "Taïwan", currency: "TWD" },
  tencent: { name: "Tencent", isin: "KYG875721634", symbol: "0700.HK", sector: "Communication", country: "Chine", currency: "HKD" },
  samsung: { name: "Samsung Electronics", isin: "KR7005930003", symbol: "005930.KS", sector: "Technologie", country: "Corée du Sud", currency: "KRW" },
  alibaba: { name: "Alibaba", isin: "KYG017191142", symbol: "9988.HK", sector: "Consommation discrétionnaire", country: "Chine", currency: "HKD" },
  reliance: { name: "Reliance Industries", isin: "INE002A01018", symbol: "RELIANCE.NS", sector: "Énergie", country: "Inde", currency: "INR" },
  hdfc: { name: "HDFC Bank", isin: "INE040A01034", symbol: "HDFCBANK.NS", sector: "Finance", country: "Inde", currency: "INR" },
} satisfies Record<string, Omit<Holding, "weight">>;

type CompanyId = keyof typeof COMPANY;

const holdings = (weights: Partial<Record<CompanyId, number>>): Holding[] =>
  (Object.entries(weights) as [CompanyId, number][]).map(([id, pct]) => ({ ...COMPANY[id], weight: pct / 100 }));

const weights = (pcts: Record<string, number>): Weight[] =>
  Object.entries(pcts).map(([key, pct]) => ({ key, weight: pct / 100 }));

function compositions(asOf: string): FundComposition[] {
  const base = { source: "demo", asOf };
  return [
    {
      ...base,
      instrumentId: "IE00B4L5Y983",
      expenseRatio: 0.002,
      holdingsCount: 1320,
      earningsYield: 0.046,
      dividendYield: 0.016,
      holdings: holdings({ nvidia: 5.3, apple: 4.6, microsoft: 4.2, amazon: 2.7, alphabet: 2.9, meta: 1.9, broadcom: 1.6, tesla: 1.4, jpmorgan: 1.0, lilly: 0.9, berkshire: 0.8, asml: 0.6, novo: 0.4, lvmh: 0.3, abinbev: 0.06 }),
      sectors: weights({ Technologie: 27, Finance: 16, Santé: 11, Industrie: 11, "Consommation discrétionnaire": 10, Communication: 8, "Consommation de base": 6, Énergie: 4, Matériaux: 3, "Services publics": 2.5, Immobilier: 1.5 }),
      countries: weights({ "États-Unis": 72, Japon: 5.5, "Royaume-Uni": 3.6, Canada: 3.1, France: 2.7, Suisse: 2.4, Allemagne: 2.3, Australie: 1.7, "Pays-Bas": 1.2, Autres: 5.5 }),
      currencies: weights({ USD: 72.5, EUR: 8.5, JPY: 5.5, GBP: 3.6, CAD: 3.1, CHF: 2.4, AUD: 1.7, Autres: 2.7 }),
    },
    {
      ...base,
      instrumentId: "IE00BK5BQT80",
      expenseRatio: 0.0022,
      holdingsCount: 3650,
      earningsYield: 0.049,
      dividendYield: 0.019,
      holdings: holdings({ nvidia: 4.6, apple: 4.0, microsoft: 3.7, amazon: 2.4, alphabet: 2.5, meta: 1.7, broadcom: 1.4, tesla: 1.2, tsmc: 1.1, jpmorgan: 0.9, lilly: 0.8, berkshire: 0.7, tencent: 0.5, asml: 0.5, samsung: 0.3, novo: 0.3, lvmh: 0.25, alibaba: 0.25, abinbev: 0.05 }),
      sectors: weights({ Technologie: 26, Finance: 17, Industrie: 11, Santé: 10, "Consommation discrétionnaire": 10.5, Communication: 8.5, "Consommation de base": 5.5, Énergie: 4, Matériaux: 3.5, "Services publics": 2.5, Immobilier: 1.5 }),
      countries: weights({ "États-Unis": 63, Japon: 5.6, "Royaume-Uni": 3.4, Chine: 3.1, Canada: 2.8, France: 2.3, Taïwan: 2.2, Suisse: 2.1, Allemagne: 2.0, Inde: 1.9, Autres: 11.6 }),
      currencies: weights({ USD: 63.5, EUR: 7.8, JPY: 5.6, GBP: 3.4, HKD: 2.9, CAD: 2.8, TWD: 2.2, CHF: 2.1, INR: 1.9, Autres: 7.8 }),
    },
    {
      ...base,
      instrumentId: "IE00BKM4GZ66",
      expenseRatio: 0.0018,
      holdingsCount: 3100,
      earningsYield: 0.074,
      dividendYield: 0.028,
      holdings: holdings({ tsmc: 9.5, tencent: 4.2, samsung: 3.1, alibaba: 2.6, reliance: 1.2, hdfc: 1.1 }),
      sectors: weights({ Technologie: 24, Finance: 22, "Consommation discrétionnaire": 13, Communication: 9.5, Industrie: 8, Matériaux: 7, "Consommation de base": 5, Énergie: 4.5, Santé: 3.5, "Services publics": 2, Immobilier: 1.5 }),
      countries: weights({ Chine: 26, Taïwan: 19, Inde: 18, "Corée du Sud": 11, Brésil: 4.5, "Arabie saoudite": 3.5, "Afrique du Sud": 3, Mexique: 2, Autres: 13 }),
      currencies: weights({ HKD: 20, TWD: 19, INR: 18, KRW: 11, CNY: 6, BRL: 4.5, SAR: 3.5, ZAR: 3, Autres: 15 }),
    },
    {
      ...base,
      instrumentId: "IE00B5BMR087",
      expenseRatio: 0.0007,
      holdingsCount: 503,
      earningsYield: 0.04,
      dividendYield: 0.012,
      holdings: holdings({ nvidia: 7.4, apple: 6.5, microsoft: 5.9, alphabet: 4.1, amazon: 3.8, meta: 2.7, broadcom: 2.3, tesla: 2.0, berkshire: 1.6, jpmorgan: 1.4, lilly: 1.3 }),
      sectors: weights({ Technologie: 33, Finance: 13, "Consommation discrétionnaire": 10.5, Santé: 10, Communication: 9.5, Industrie: 8, "Consommation de base": 5.5, Énergie: 3.5, "Services publics": 2.5, Matériaux: 2.5, Immobilier: 2 }),
      countries: weights({ "États-Unis": 100 }),
      currencies: weights({ USD: 100 }),
    },
    // Carmignac Patrimoine : volontairement sans composition, pour montrer « composition indisponible ».
  ];
}

/* ——— Cours fictifs ——— */

function buildMarket(days: string[]): MarketData {
  // Un facteur de marché commun, avec une année 2022 difficile, donne des courbes crédibles.
  const factor = days.map((date) => {
    const drift = date >= "2022-01-03" && date <= "2022-10-14" ? -0.0011 : 0.00052;
    return drift + 0.0083 * gaussian(1, dayIndex(date));
  });
  const prices: Record<string, PriceHistory> = {};
  SPECS.forEach((spec, s) => {
    let price = spec.start;
    prices[spec.instrument.id] = days.map((date, i) => {
      if (i > 0) price *= Math.exp(spec.beta * factor[i] + spec.alpha + spec.vol * gaussian(10 + s, dayIndex(date)));
      return { date, close: Number(price.toFixed(price < 100 ? 3 : 2)) };
    });
  });
  let eurusd = 1.22;
  const usd: PriceHistory = days.map((date, i) => {
    if (i > 0) eurusd += 0.003 * (1.1 - eurusd) + 0.0042 * gaussian(2, dayIndex(date));
    return { date, close: Number(eurusd.toFixed(4)) };
  });
  return { prices, fx: { USD: usd } };
}

/* ——— Transactions ——— */

function buildTransactions(days: string[], market: MarketData, instruments: Record<string, Instrument>): Transaction[] {
  const out: Transaction[] = [];
  const last = days[days.length - 1];
  /** Premier jour ouvré à partir de la date donnée, ou `null` s'il tombe après la fin. */
  const sessionOn = (date: string) => days.find((d) => d >= date) ?? null;
  const add = (id: string, side: "buy" | "sell", wanted: string, quantity: number, broker: string, note?: string) => {
    const date = sessionOn(wanted);
    const point = date && closeAt(market.prices[id], date);
    if (!date || !point || quantity <= 0) return;
    out.push({ id: `demo-${out.length + 1}`, instrumentId: id, side, date, quantity, price: point.close, fees: side === "buy" ? 2 : 3, broker, ...(note ? { note } : {}) });
  };
  /** Achat d'un nombre entier de parts pour un budget en euros. */
  const invest = (id: string, wanted: string, budgetEUR: number, broker: string, note?: string) => {
    const date = sessionOn(wanted);
    const point = date && closeAt(market.prices[id], date);
    const fx = date ? fxAt(market, instruments[id].currency, date) : undefined;
    if (!date || !point || !fx) return;
    add(id, "buy", date, Math.max(1, Math.round(budgetEUR / (point.close / fx))), broker, note);
  };

  const [iwda, vwce, emim, cspx, asml, nvda, msft, abi, fund] = SPECS.map((s) => s.instrument.id);

  invest(fund, "2021-01-11", 15000, "Banque", "Le conseil de ma banque à l'époque.");
  add(abi, "buy", "2021-02-10", 60, "Bolero", "Une valeur belge que je connais.");
  add(msft, "buy", "2021-03-15", 12, "DEGIRO");
  invest(cspx, "2021-06-07", 5000, "DEGIRO");
  add(asml, "buy", "2021-09-20", 6, "Bolero", "Personne d'autre ne sait fabriquer ces machines.");
  add(asml, "buy", "2022-10-12", 4, "Bolero", "Je renforce pendant la baisse.");
  add(nvda, "buy", "2022-11-08", 120, "DEGIRO", "L'IA aura besoin de puces, quoi qu'il arrive.");
  invest(cspx, "2023-02-06", 4000, "DEGIRO");
  add(msft, "buy", "2023-05-22", 8, "DEGIRO");
  add(nvda, "sell", "2024-07-15", 30, "DEGIRO");

  // Versements programmés : monde chaque mois, tous pays à partir de 2022, émergents chaque trimestre.
  for (let year = 2021; year <= Number(last.slice(0, 4)); year++) {
    for (let month = 1; month <= 12; month++) {
      const date = `${year}-${String(month).padStart(2, "0")}-05`;
      if (date > last) break;
      invest(iwda, date, 600, "Bolero");
      if (date >= "2022-03-01") invest(vwce, date, 400, "Trade Republic");
      if (month % 3 === 1) invest(emim, date, 150, "Bolero");
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export const DEMO_EXPENSES: Expense[] = [
  { id: "abonnements", label: "Abonnements", monthly: 64 },
  { id: "courses", label: "Courses", monthly: 420 },
  { id: "loyer", label: "Loyer", monthly: 950 },
];

/** Construit le portefeuille de démonstration arrêté à la date donnée. Même date, mêmes données. */
export function buildDemoPortfolio(asOf: string): DemoPortfolio {
  const days = businessDays(START, asOf);
  const instruments = Object.fromEntries(SPECS.map((s) => [s.instrument.id, s.instrument]));
  const market = buildMarket(days);
  return {
    instruments,
    market,
    transactions: buildTransactions(days, market, instruments),
    compositions: Object.fromEntries(compositions(asOf).map((c) => [c.instrumentId, c])),
    expenses: DEMO_EXPENSES,
    expectedReturn: 0.05,
    asOf,
  };
}
