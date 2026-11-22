import { NextRequest, NextResponse } from 'next/server';

interface MarketPoint {
  date: string;
  priceEur: number;
}

interface ResolvedQuote {
  symbol: string;
  name: string;
  currency: 'EUR' | 'USD';
  priceEur: number;
  previousCloseEur: number;
  history: MarketPoint[];
  source: 'yahoo';
}

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json, text/html;q=0.9,*/*;q=0.8',
};

function isIsinCode(sym: string): boolean {
  return /^[A-Z]{2}[A-Z0-9]{10}$/.test(sym.trim().toUpperCase());
}

function toTwelveDataSymbol(rawSym: string): string {
  const sym = rawSym.trim().toUpperCase();
  if (sym.endsWith('.PA')) return `${sym.slice(0, -3)}:EPA`;
  if (sym.endsWith('.AS')) return `${sym.slice(0, -3)}:AMS`;
  if (sym.endsWith('.DE')) return `${sym.slice(0, -3)}:XETR`;
  if (sym.endsWith('.BR')) return `${sym.slice(0, -3)}:EBR`;
  if (sym.endsWith('.L')) return `${sym.slice(0, -2)}:LSE`;
  if (sym === 'BTC-EUR') return 'BTC/EUR';
  if (sym === 'ETH-EUR') return 'ETH/EUR';
  if (sym === 'GC=F') return 'XAU/USD';
  return sym;
}

function getTwelveDataParams(timeframe: string): { interval: string; outputsize: number } {
  switch (timeframe) {
    case '1S':
      return { interval: '1h', outputsize: 60 };
    case '1M':
      return { interval: '1day', outputsize: 30 };
    case 'YTD':
      return { interval: '1day', outputsize: 230 };
    case 'LTM':
      return { interval: '1day', outputsize: 252 };
    case '2A':
      return { interval: '1week', outputsize: 104 };
    case '5A':
      return { interval: '1week', outputsize: 260 };
    case '10A':
      return { interval: '1month', outputsize: 120 };
    case 'Tout':
    default:
      return { interval: '1month', outputsize: 180 };
  }
}

function getYahooRangeAndInterval(timeframe: string): { range: string; interval: string } {
  switch (timeframe) {
    case '1S':
      return { range: '5d', interval: '1h' };
    case '1M':
      return { range: '1mo', interval: '1d' };
    case 'YTD':
      return { range: 'ytd', interval: '1d' };
    case 'LTM':
      return { range: '1y', interval: '1d' };
    case '2A':
      return { range: '2y', interval: '1wk' };
    case '5A':
      return { range: '5y', interval: '1wk' };
    case '10A':
      return { range: '10y', interval: '1mo' };
    case 'Tout':
    default:
      return { range: 'max', interval: '1mo' };
  }
}

function getFtDaysBack(timeframe: string): number {
  switch (timeframe) {
    case '1S':
      return 14;
    case '1M':
      return 35;
    case 'YTD':
      return 330;
    case 'LTM':
      return 366;
    case '2A':
      return 730;
    case '5A':
      return 1825;
    case '10A':
      return 3650;
    case 'Tout':
    default:
      return 3650;
  }
}

async function fetchFromTwelveData(
  origSym: string,
  timeframe: string,
  apiKey: string,
  eurUsdRate: number
): Promise<ResolvedQuote | null> {
  if (isIsinCode(origSym)) return null;
  const tdSym = toTwelveDataSymbol(origSym);
  const { interval, outputsize } = getTwelveDataParams(timeframe);

  try {
    const tsUrl = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(
      tdSym
    )}&interval=${interval}&outputsize=${outputsize}&apikey=${encodeURIComponent(apiKey)}`;

    const res = await fetch(tsUrl, { cache: 'no-store' });
    if (!res.ok) return null;

    const data = await res.json();
    if (
      data?.status === 'error' ||
      !Array.isArray(data?.values) ||
      data.values.length === 0
    ) {
      return null;
    }

    const rawCurrency = (data?.meta?.currency || 'USD').toUpperCase();
    const currency: 'EUR' | 'USD' = rawCurrency === 'USD' ? 'USD' : 'EUR';
    const toEur = (val: number) => (currency === 'USD' ? val / eurUsdRate : val);

    const ordered = [...data.values].reverse();
    const history: MarketPoint[] = ordered
      .map((v: { datetime?: string; close?: string }) => {
        const closeNum = parseFloat(v.close || '');
        if (Number.isNaN(closeNum) || closeNum <= 0 || !v.datetime) return null;
        return {
          date: v.datetime.slice(0, 10),
          priceEur: Number(toEur(closeNum).toFixed(4)),
        };
      })
      .filter(Boolean) as MarketPoint[];

    if (history.length === 0) return null;

    const latest = history[history.length - 1];
    const prev = history.length > 1 ? history[history.length - 2] : latest;

    return {
      symbol: origSym,
      name: data?.meta?.name || origSym,
      currency,
      priceEur: latest.priceEur,
      previousCloseEur: prev.priceEur,
      history,
      source: 'yahoo',
    };
  } catch {
    return null;
  }
}

async function fetchFromYahooDirect(
  origSym: string,
  timeframe: string,
  eurUsdRate: number
): Promise<ResolvedQuote | null> {
  try {
    const { range, interval } = getYahooRangeAndInterval(timeframe);
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      origSym
    )}?range=${range}&interval=${interval}&includePrePost=false`;

    const res = await fetch(chartUrl, {
      headers: BROWSER_HEADERS,
      cache: 'no-store',
    });

    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta || {};
    const rawCurrency = String(meta.currency || 'USD').toUpperCase();
    const currency: 'EUR' | 'USD' = rawCurrency === 'USD' ? 'USD' : 'EUR';
    const toEur = (val: number) => (currency === 'USD' ? val / eurUsdRate : val);

    const timestamps: number[] = Array.isArray(result.timestamp) ? result.timestamp : [];
    const closes: Array<number | null> =
      result?.indicators?.quote?.[0]?.close || [];

    const history: MarketPoint[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const c = closes[i];
      if (typeof c === 'number' && c > 0 && typeof timestamps[i] === 'number') {
        const dt = new Date(timestamps[i] * 1000);
        history.push({
          date: dt.toISOString().slice(0, 10),
          priceEur: Number(toEur(c).toFixed(4)),
        });
      }
    }

    const marketPriceRaw =
      typeof meta.regularMarketPrice === 'number' && meta.regularMarketPrice > 0
        ? meta.regularMarketPrice
        : history.length > 0
        ? closes.filter((v): v is number => typeof v === 'number' && v > 0).pop() || 0
        : 0;

    if (marketPriceRaw <= 0) return null;

    const priceEur = Number(toEur(marketPriceRaw).toFixed(4));
    const prevRaw =
      typeof meta.chartPreviousClose === 'number' && meta.chartPreviousClose > 0
        ? meta.chartPreviousClose
        : marketPriceRaw;
    const previousCloseEur = Number(toEur(prevRaw).toFixed(4));

    if (history.length === 0) {
      history.push({
        date: new Date().toISOString().slice(0, 10),
        priceEur,
      });
    }

    return {
      symbol: origSym,
      name: String(meta.longName || meta.shortName || origSym),
      currency,
      priceEur,
      previousCloseEur,
      history,
      source: 'yahoo',
    };
  } catch {
    return null;
  }
}

async function fetchFromFinancialTimes(
  isin: string,
  timeframe: string,
  eurUsdRate: number
): Promise<ResolvedQuote | null> {
  if (!isIsinCode(isin)) return null;

  const currenciesToTry: Array<'EUR' | 'USD'> = ['EUR', 'USD'];
  const daysBack = getFtDaysBack(timeframe);

  for (const cur of currenciesToTry) {
    const ftSymbol = `${isin}:${cur}`;
    const toEur = (val: number) => (cur === 'USD' ? val / eurUsdRate : val);

    // 1. Appel à l'API graphique interne de Financial Times (série historique + VL)
    try {
      const chartRes = await fetch('https://markets.ft.com/data/chartapi/series', {
        method: 'POST',
        headers: {
          ...BROWSER_HEADERS,
          'Content-Type': 'application/json',
          Origin: 'https://markets.ft.com',
          Referer: `https://markets.ft.com/data/funds/tearsheet/charts?s=${encodeURIComponent(
            ftSymbol
          )}`,
        },
        body: JSON.stringify({
          days: daysBack,
          dataNormalized: false,
          dataPeriod: 'Day',
          dataInterval: 1,
          realtime: false,
          yFormat: '0.###',
          timeServiceFormat: 'JSON',
          returnDateType: 'ISO8601',
          elements: [
            {
              Label: ftSymbol,
              Type: 'price',
              Symbol: ftSymbol,
              OverlayIndicators: [],
              Params: {},
            },
          ],
        }),
        cache: 'no-store',
      });

      if (chartRes.ok) {
        const chartJson = await chartRes.json();
        const dates: string[] = Array.isArray(chartJson?.Dates) ? chartJson.Dates : [];
        const values: Array<number | null> =
          chartJson?.Elements?.[0]?.ComponentSeries?.[0]?.Values || [];
        const fundName = String(chartJson?.Elements?.[0]?.CompanyName || isin);

        const history: MarketPoint[] = [];
        for (let i = 0; i < Math.min(dates.length, values.length); i++) {
          const v = values[i];
          if (typeof v === 'number' && v > 0 && dates[i]) {
            history.push({
              date: String(dates[i]).slice(0, 10),
              priceEur: Number(toEur(v).toFixed(4)),
            });
          }
        }

        if (history.length > 0) {
          const latest = history[history.length - 1];
          const prev = history.length > 1 ? history[history.length - 2] : latest;
          return {
            symbol: isin,
            name: fundName,
            currency: cur,
            priceEur: latest.priceEur,
            previousCloseEur: prev.priceEur,
            history,
            source: 'yahoo',
          };
        }
      }
    } catch {
      // Passe à la lecture de la fiche résumé FT
    }

    // 2. Lecture de la valeur liquidative sur la fiche résumé Financial Times
    try {
      const summaryUrl = `https://markets.ft.com/data/funds/tearsheet/summary?s=${encodeURIComponent(
        ftSymbol
      )}`;
      const htmlRes = await fetch(summaryUrl, {
        headers: BROWSER_HEADERS,
        cache: 'no-store',
      });

      if (htmlRes.ok) {
        const html = await htmlRes.text();
        const priceMatch =
          html.match(/Price\s*\([A-Z]{3}\)<\/span>\s*<span[^>]*>([\d,]+(?:\.\d+)?)/i) ||
          html.match(/mod-ui-data-list__value">([\d,]+(?:\.\d+)?)<\/span>/i);

        if (priceMatch && priceMatch[1]) {
          const parsedPrice = parseFloat(priceMatch[1].replace(/,/g, ''));
          if (!Number.isNaN(parsedPrice) && parsedPrice > 0) {
            const priceEur = Number(toEur(parsedPrice).toFixed(4));
            const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
            const fundName = titleMatch ? titleMatch[1].trim() : isin;

            return {
              symbol: isin,
              name: fundName,
              currency: cur,
              priceEur,
              previousCloseEur: priceEur,
              history: [
                {
                  date: new Date().toISOString().slice(0, 10),
                  priceEur,
                },
              ],
              source: 'yahoo',
            };
          }
        }
      }
    } catch {
      // Essaie la devise suivante
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const symbols: string[] = Array.isArray(body?.symbols) ? body.symbols : [];
    const timeframe: string = body?.timeframe || 'LTM';
    const apiKey = process.env.TWELVEDATA_API_KEY?.trim();

    let eurUsdRate = 1.0968;

    // 1. Taux EUR/USD : Twelve Data puis Yahoo Chart direct
    let fxResolved = false;
    if (apiKey) {
      try {
        const fxRes = await fetch(
          `https://api.twelvedata.com/exchange_rate?symbol=EUR/USD&apikey=${encodeURIComponent(
            apiKey
          )}`,
          { cache: 'no-store' }
        );
        if (fxRes.ok) {
          const fxData = await fxRes.json();
          const rate = parseFloat(fxData?.rate);
          if (!Number.isNaN(rate) && rate > 0) {
            eurUsdRate = rate;
            fxResolved = true;
          }
        }
      } catch {
        // Passe à Yahoo
      }
    }

    if (!fxResolved) {
      try {
        const fxYahooRes = await fetch(
          'https://query1.finance.yahoo.com/v8/finance/chart/EURUSD=X?range=5d&interval=1d',
          { headers: BROWSER_HEADERS, cache: 'no-store' }
        );
        if (fxYahooRes.ok) {
          const fxJson = await fxYahooRes.json();
          const rate = fxJson?.chart?.result?.[0]?.meta?.regularMarketPrice;
          if (typeof rate === 'number' && rate > 0) {
            eurUsdRate = rate;
          }
        }
      } catch {
        // Garde 1.0968
      }
    }

    if (symbols.length === 0) {
      return NextResponse.json({ quotes: {}, eurUsdRate });
    }

    const quotes: Record<string, ResolvedQuote> = {};

    // 2. Cascade : Twelve Data -> Yahoo Chart direct -> Financial Times (ISIN fonds) -> Repli manuel
    await Promise.all(
      symbols.map(async (rawSym) => {
        const origSym = rawSym.trim().toUpperCase();
        if (!origSym) return;

        let resolved: ResolvedQuote | null = null;

        if (apiKey && !isIsinCode(origSym)) {
          resolved = await fetchFromTwelveData(origSym, timeframe, apiKey, eurUsdRate);
        }

        if (!resolved && !isIsinCode(origSym)) {
          resolved = await fetchFromYahooDirect(origSym, timeframe, eurUsdRate);
        }

        if (!resolved && isIsinCode(origSym)) {
          resolved = await fetchFromFinancialTimes(origSym, timeframe, eurUsdRate);
        }

        // Dernier essai Yahoo si un ISIN est reconnu par Yahoo
        if (!resolved) {
          resolved = await fetchFromYahooDirect(origSym, timeframe, eurUsdRate);
        }

        if (resolved) {
          quotes[origSym] = resolved;
        }
      })
    );

    return NextResponse.json({ quotes, eurUsdRate });
  } catch {
    return NextResponse.json({ quotes: {}, eurUsdRate: 1.0968 }, { status: 200 });
  }
}
