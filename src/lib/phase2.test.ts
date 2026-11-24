import { describe, expect, it } from "vitest";
import { parseCsv, parseDate, parseNumber, parseSide, splitLine } from "./csv";
import { analyze } from "./analysis";
import { assetTypeOf, cleanCloses, displayName, exchangeDate, exchangeRank, isValidIsin, normalizeCurrency } from "./market-format";
import { elide } from "./domain/sentence";
import { companiesToQuote, companyQuotesFrom, compositionsFrom, compositionsNeeded, heldQuantity, instrumentFrom, mergePortfolios, samePortfolio, withCompanyFx } from "./user-data";
import { DEFAULT_SETTINGS, fxKey, makeBackup, marketFrom, oldestFetch, readBackup, seriesNeeded, staleSeries, type UserPortfolio } from "./user-data";

const portfolio: UserPortfolio = {
  instruments: {
    "IWDA.AS": { id: "IWDA.AS", isin: "IE00B4L5Y983", symbol: "IWDA.AS", name: "iShares Core MSCI World", type: "etf", currency: "EUR" },
    NVDA: { id: "NVDA", isin: "US67066G1040", symbol: "NVDA", name: "Nvidia", type: "stock", currency: "USD" },
  },
  transactions: [
    { id: "a", instrumentId: "IWDA.AS", side: "buy", date: "2024-03-05", quantity: 10, price: 85 },
    { id: "b", instrumentId: "NVDA", side: "buy", date: "2026-11-10", quantity: 2, price: 180 },
    { id: "c", instrumentId: "IWDA.AS", side: "buy", date: "2023-01-10", quantity: 5, price: 70 },
  ],
};

describe("données de marché", () => {
  it("ramène les cotations en pence à la livre", () => {
    expect(normalizeCurrency("GBp")).toEqual({ currency: "GBP", divisor: 100 });
    expect(normalizeCurrency("ZAc")).toEqual({ currency: "ZAR", divisor: 100 });
    expect(normalizeCurrency("usd")).toEqual({ currency: "USD", divisor: 1 });
    expect(normalizeCurrency(undefined)).toEqual({ currency: null, divisor: 1 });
  });

  it("date chaque clôture à l'heure de sa place et retire les valeurs nulles", () => {
    // 23 h 30 à New York le 19 = 04 h 30 UTC le 20.
    expect(exchangeDate(new Date("2026-11-20T04:30:00Z"), "America/New_York")).toBe("2026-11-19");
    const points = cleanCloses(
      [
        { date: new Date("2026-11-20T08:00:00Z"), close: 10230 },
        { date: new Date("2026-11-19T08:00:00Z"), close: 10100 },
        { date: new Date("2026-11-18T08:00:00Z"), close: null },
        { date: new Date("2026-11-17T08:00:00Z"), close: 0 },
      ],
      "Europe/London",
      100,
    );
    expect(points).toEqual([
      { date: "2026-11-19", close: 101 },
      { date: "2026-11-20", close: 102.3 },
    ]);
  });

  it("reconnaît les types de Yahoo et ignore le reste", () => {
    expect([assetTypeOf("EQUITY"), assetTypeOf("ETF"), assetTypeOf("MUTUALFUND"), assetTypeOf("FUTURE")]).toEqual(["stock", "etf", "fund", null]);
  });

  it("valide la clé de contrôle d'un ISIN", () => {
    expect(isValidIsin("IE00B4L5Y983")).toBe(true);
    expect(isValidIsin("US67066G1040")).toBe(true);
    expect(isValidIsin("BE0974293251")).toBe(true);
    expect(isValidIsin("IE00B4L5Y984")).toBe(false);
    expect(isValidIsin("NVDA")).toBe(false);
  });

  it("préfère Bruxelles et Amsterdam à Londres pour un même produit", () => {
    expect(exchangeRank("AMS")).toBeLessThan(exchangeRank("LSE"));
    expect(exchangeRank("BRU")).toBeLessThan(exchangeRank("AMS"));
    expect(exchangeRank("XYZ")).toBeLessThan(exchangeRank(undefined));
  });
});

describe("cache des cours", () => {
  const today = "2026-11-22";

  it("charge les cours d'un titre suivi seulement par un plan d'épargne, depuis le début du plan", () => {
    const withPlan: UserPortfolio = { ...portfolio, plans: [{ id: "p", instrumentId: "NVDA", amountEUR: 100, dayOfMonth: 2, start: "2024-01-01" }] };
    expect(seriesNeeded(withPlan, today)).toEqual(expect.arrayContaining([{ key: "NVDA", from: "2023-12-25" }, { key: fxKey("USD"), from: "2023-12-25" }]));
  });

  it("demande chaque ligne et chaque devise depuis le premier achat, avec une marge", () => {
    const needs = seriesNeeded(portfolio, today);
    expect(needs).toEqual(
      expect.arrayContaining([
        { key: "IWDA.AS", from: "2023-01-03" },
        { key: "NVDA", from: "2026-10-01" }, // 45 jours d'historique minimum, + 7 de marge
        { key: fxKey("USD"), from: "2026-10-01" },
      ]),
    );
    expect(needs).toHaveLength(3);
  });

  it("recharge ce qui manque, ce qui est trop court et ce qui est trop vieux", () => {
    const needs = seriesNeeded(portfolio, today);
    const now = Date.parse("2026-11-22T12:00:00Z");
    const cache = {
      "IWDA.AS": { from: "2023-01-03", fetchedAt: now - 60_000, currency: "EUR", points: [] },
      NVDA: { from: "2026-11-01", fetchedAt: now - 60_000, currency: "USD", points: [] },
      "EURUSD=X": { from: "2026-10-01", fetchedAt: now - 3 * 3600_000, currency: "USD", points: [] },
    };
    expect(staleSeries(needs, cache, now, 15 * 60_000).map((n) => n.key).sort()).toEqual(["EURUSD=X", "NVDA"]);
    expect(oldestFetch(needs, cache)).toBe(now - 3 * 3600_000);
  });

  it("assemble cours et taux de change au format du moteur", () => {
    const cache = {
      "IWDA.AS": { from: "x", fetchedAt: 0, currency: "EUR", points: [{ date: "2026-11-20", close: 100 }] },
      NVDA: { from: "x", fetchedAt: 0, currency: "USD", points: [{ date: "2026-11-20", close: 180 }] },
      "EURUSD=X": { from: "x", fetchedAt: 0, currency: "USD", points: [{ date: "2026-11-20", close: 1.1 }] },
    };
    const market = marketFrom(portfolio, cache);
    expect(Object.keys(market.prices).sort()).toEqual(["IWDA.AS", "NVDA"]);
    expect(market.fx.USD).toEqual([{ date: "2026-11-20", close: 1.1 }]);
    const snap = analyze({ ...portfolio, market, compositions: {}, ...DEFAULT_SETTINGS }, today);
    expect(snap.totalEUR).toBeCloseTo(15 * 100 + (2 * 180) / 1.1, 6);
  });
});

describe("sauvegarde", () => {
  it("relit ce qu'elle a exporté", () => {
    const backup = makeBackup(portfolio, DEFAULT_SETTINGS, new Date("2026-11-22T10:00:00Z"));
    const read = readBackup(JSON.parse(JSON.stringify(backup)));
    expect(read).toEqual({ ok: true, backup: { ...backup, portfolio: { ...backup.portfolio, plans: [] } } });
  });

  it("refuse un fichier qui n'est pas une sauvegarde Atlas ou une transaction bancale", () => {
    expect(readBackup({ foo: 1 })).toEqual({ ok: false, error: "Ce fichier n'est pas une sauvegarde Atlas." });
    const broken = makeBackup({ ...portfolio, transactions: [{ ...portfolio.transactions[0], quantity: -1 }] }, DEFAULT_SETTINGS);
    expect(readBackup(broken).ok).toBe(false);
    const orphan = makeBackup({ ...portfolio, transactions: [{ ...portfolio.transactions[0], instrumentId: "??" }] }, DEFAULT_SETTINGS);
    expect(readBackup(orphan).ok).toBe(false);
  });

  it("garde des réglages par défaut si les siens sont absents ou absurdes", () => {
    const raw = { ...makeBackup(portfolio, DEFAULT_SETTINGS), settings: { expectedReturn: 3 } };
    const read = readBackup(raw);
    expect(read.ok && read.backup.settings.expectedReturn).toBe(0.05);
  });
});

describe("import CSV", () => {
  it("lit un export européen : point-virgule, virgule décimale, date jour d'abord", () => {
    const csv = [
      "Date;Produit;ISIN;Quantité;Cours;Frais;Type;Courtier",
      '05/03/2024;"iShares Core MSCI World";IE00B4L5Y983;10;85,12;2,00;Achat;Bolero',
      "10/11/2026;Nvidia;US67066G1040;-2;180,5;1;Vente;DEGIRO",
      "31/02/2024;Faux;IE00B4L5Y984;1;;;Achat;",
    ].join("\n");
    const parsed = parseCsv(csv);
    expect(parsed.missing).toEqual([]);
    expect(parsed.rows[0]).toMatchObject({ date: "2024-03-05", isin: "IE00B4L5Y983", name: "iShares Core MSCI World", quantity: 10, price: 85.12, fees: 2, side: "buy", broker: "Bolero", problems: [] });
    expect(parsed.rows[1]).toMatchObject({ side: "sell", quantity: 2, price: 180.5 });
    expect(parsed.rows[2].problems).toEqual(["date illisible", "prix ou montant manquant", "ISIN invalide"]);
  });

  it("accepte le format simple : date, ISIN et montant en euros", () => {
    const parsed = parseCsv("Date;ISIN;Montant\n02/03/2025;IE00B4L5Y983;200\n");
    expect(parsed.missing).toEqual([]);
    expect(parsed.rows[0]).toMatchObject({ date: "2025-03-02", isin: "IE00B4L5Y983", amount: 200, quantity: null, price: null, side: "buy", problems: [] });
  });

  it("lit un export anglais à virgules avec ticker", () => {
    const parsed = parseCsv("Trade Date,Ticker,Quantity,Price,Fees\n2024-03-05,ASML.AS,3,\"1,012.50\",0\n");
    expect(parsed.rows[0]).toMatchObject({ date: "2024-03-05", symbol: "ASML.AS", quantity: 3, price: 1012.5, side: "buy" });
  });

  it("signale les colonnes indispensables absentes", () => {
    expect(parseCsv("Nom;Valeurs\nX;12").missing).toEqual(["date", "quantity", "isin"]);
  });

  it("lit les nombres et les dates dans tous les formats courants", () => {
    expect([parseNumber("1 234,56"), parseNumber("1,234.56"), parseNumber("1234.5"), parseNumber("(12,5)"), parseNumber("abc")]).toEqual([1234.56, 1234.56, 1234.5, -12.5, null]);
    expect([parseDate("2024-3-5"), parseDate("5.3.2024"), parseDate("29/02/2023"), parseDate("hier")]).toEqual(["2024-03-05", "2024-03-05", null, null]);
    expect([parseSide("Verkoop", 1), parseSide("", -3), parseSide("BUY", -1)]).toEqual(["sell", "sell", "buy"]);
    expect(splitLine('a,"b, c",d', ",")).toEqual(["a", "b, c", "d"]);
  });
});

describe("noms et création de ligne", () => {
  it("raccourcit les noms d'ETF sans perdre ce qui les distingue", () => {
    expect(displayName("iShares Core MSCI World UCITS ETF USD (Acc)")).toBe("iShares Core MSCI World");
    expect(displayName("Vanguard FTSE All-World UCITS ETF USD Accumulation")).toBe("Vanguard FTSE All-World");
    expect(displayName("Amundi MSCI World Swap UCITS ETF EUR Acc")).toBe("Amundi MSCI World Swap");
    expect(displayName("ASML Holding N.V.")).toBe("ASML Holding N.V.");
    expect(displayName("ETF")).toBe("ETF");
  });

  it("élide « de » devant une voyelle", () => {
    expect(elide("de", "iShares")).toBe("d'");
    expect(elide("de", "Nvidia")).toBe("de ");
  });

  it("crée une ligne identifiée par sa cotation, avec le profil utile à son type", () => {
    const stock = instrumentFrom({ symbol: "ASML.AS", name: "ASML Holding N.V.", type: "stock", exchange: "Amsterdam", isin: "NL0010273215" }, "EUR", { sector: "Technologie", country: "Pays-Bas", earningsYield: 0.03, expenseRatio: 0.5 });
    expect(stock).toEqual({ id: "ASML.AS", symbol: "ASML.AS", name: "ASML Holding N.V.", type: "stock", currency: "EUR", isin: "NL0010273215", exchange: "Amsterdam", sector: "Technologie", country: "Pays-Bas", earningsYield: 0.03 });
    const etf = instrumentFrom({ symbol: "IWDA.AS", name: "iShares Core MSCI World UCITS ETF USD (Acc)", type: "etf" }, "EUR", { expenseRatio: 0.002, sector: "x" });
    expect(etf).toEqual({ id: "IWDA.AS", symbol: "IWDA.AS", name: "iShares Core MSCI World", type: "etf", currency: "EUR", expenseRatio: 0.002 });
  });

  it("compte la quantité détenue à une date", () => {
    expect(heldQuantity(portfolio.transactions, "IWDA.AS", "2024-12-31")).toBe(15);
    expect(heldQuantity(portfolio.transactions, "IWDA.AS", "2023-06-01")).toBe(5);
  });
});

describe("compositions et cours des entreprises", () => {
  const now = Date.parse("2026-11-22T12:00:00Z");
  const withFund: UserPortfolio = {
    ...portfolio,
    instruments: { ...portfolio.instruments, "VWCE.DE": { id: "VWCE.DE", symbol: "VWCE.DE", name: "Vanguard FTSE All-World", type: "etf", currency: "EUR" } },
  };

  it("redemande une composition chaque semaine, et une absence chaque jour", () => {
    const cache = {
      "IWDA.AS": { fetchedAt: now - 2 * 86_400_000, composition: { instrumentId: "IWDA.AS", source: "yahoo", holdings: [] } },
      "VWCE.DE": { fetchedAt: now - 2 * 86_400_000, composition: null },
    };
    expect(compositionsNeeded(withFund, cache, now).map((i) => i.id)).toEqual(["VWCE.DE"]);
    expect(compositionsNeeded(withFund, {}, now).map((i) => i.id).sort()).toEqual(["IWDA.AS", "VWCE.DE"]);
    expect(compositionsFrom(cache)).toEqual({ "IWDA.AS": cache["IWDA.AS"].composition, "VWCE.DE": undefined });
  });

  it("cote les grandes entreprises tenues via les fonds, pas celles détenues en direct", () => {
    const targets = companiesToQuote(
      [
        { key: "US67066G1040", symbol: "NVDA", direct: true },
        { key: "name:apple", symbol: "AAPL", direct: false },
        { key: "name:sans ticker", direct: false },
      ],
      12,
    );
    expect(targets).toEqual([{ key: "name:apple", symbol: "AAPL" }]);
    const cache = {
      AAPL: { from: "x", fetchedAt: now, currency: "USD", points: [{ date: "2026-11-20", close: 230 }] },
      "EURUSD=X": { from: "x", fetchedAt: now, currency: "USD", points: [{ date: "2026-11-20", close: 1.1 }] },
    };
    const quotes = companyQuotesFrom(targets, cache);
    expect(quotes).toEqual({ "name:apple": { currency: "USD", points: cache.AAPL.points } });
    expect(withCompanyFx({ prices: {}, fx: {} }, quotes, cache).fx.USD).toEqual(cache["EURUSD=X"].points);
  });
});

describe("fusion entre appareils", () => {
  const vwce = { id: "VWCE.DE", symbol: "VWCE.DE", name: "Vanguard FTSE All-World", type: "etf" as const, currency: "EUR" };
  const plan = { id: "p1", instrumentId: "VWCE.DE", amountEUR: 1700, dayOfMonth: 2, start: "2026-12-01" };
  const phone: UserPortfolio = { instruments: { ...portfolio.instruments, "VWCE.DE": vwce }, transactions: portfolio.transactions, plans: [plan] };
  const computer: UserPortfolio = { instruments: portfolio.instruments, transactions: [...portfolio.transactions, { id: "d", instrumentId: "NVDA", side: "buy", date: "2026-11-20", quantity: 1, price: 150 }], plans: [] };

  it("ne perd pas un plan créé sur un autre appareil", () => {
    const merged = mergePortfolios(computer, phone);
    expect(merged.plans).toEqual([plan]);
    expect(merged.transactions.map((t) => t.id).sort()).toEqual(["a", "b", "c", "d"]);
    expect(merged.instruments["VWCE.DE"]).toEqual(vwce);
  });

  it("respecte une suppression volontaire, d'où qu'elle vienne", () => {
    const withoutPlan: UserPortfolio = { ...phone, plans: [], deleted: ["p1", "a"] };
    const merged = mergePortfolios(computer, withoutPlan);
    expect(merged.plans).toEqual([]);
    expect(merged.transactions.map((t) => t.id).sort()).toEqual(["b", "c", "d"]);
    expect(merged.instruments["VWCE.DE"]).toBeUndefined();
  });

  it("garde la version préférée d'un plan modifié des deux côtés", () => {
    const merged = mergePortfolios({ ...phone, plans: [{ ...plan, amountEUR: 2000 }] }, phone);
    expect(merged.plans?.[0].amountEUR).toBe(2000);
    expect(samePortfolio(merged, phone)).toBe(false);
    expect(samePortfolio(mergePortfolios(phone, phone), phone)).toBe(true);
  });
});
