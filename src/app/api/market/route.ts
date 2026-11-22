import { NextRequest, NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';

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

function getYahooPeriodStart(timeframe: string, now: Date): Date {
  const d = new Date(now);
  switch (timeframe) {
    case '1S':
      d.setDate(now.getDate() - 10);
      return d;
    case '1M':
      d.setMonth(now.getMonth() - 1);
      return d;
    case 'YTD':
      return new Date(now.getFullYear(), 0, 1);
    case 'LTM':
      d.setFullYear(now.getFullYear() - 1);
      return d;
    case '2A':
      d.setFullYear(now.getFullYear() - 2);
      return d;
    case '5A':
      d.setFullYear(now.getFullYear() - 5);
      return d;
    case '10A':
      d.setFullYear(now.getFullYear() - 10);
      return d;
    case 'Tout':
    default:
      d.setFullYear(now.getFullYear() - 25);
      return d;
  }
}

async function fetchFromTwelveData(
  origSym: string,
  timeframe: string,
  apiKey: string,
  eurUsdRate: number
): Promise<ResolvedQuote | null> {
  if (/^[A-Z]{2}[A-Z0-9]{10}$/.test(origSym)) return null;
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

async function fetchFromYahoo(
  origSym: string,
  timeframe: string,
  eurUsdRate: number
): Promise<ResolvedQuote | null> {
  try {
    const now = new Date();
    const period1 = getYahooPeriodStart(timeframe, now);
    const interval = ['2A', '5A', '10A', 'Tout'].includes(timeframe) ? '1wk' : '1d';

    const quote = (await yahooFinance.quote(origSym)) as {
      regularMarketPrice?: number;
      regularMarketPreviousClose?: number;
      currency?: string;
      shortName?: string;
      longName?: string;
    } | null;

    if (!quote || typeof quote.regularMarketPrice !== 'number' || quote.regularMarketPrice <= 0) {
      return null;
    }

    const currency: 'EUR' | 'USD' =
      (quote.currency || 'EUR').toUpperCase() === 'USD' ? 'USD' : 'EUR';
    const toEur = (val: number) => (currency === 'USD' ? val / eurUsdRate : val);

    const priceEur = Number(toEur(quote.regularMarketPrice).toFixed(4));
    const prevRaw = quote.regularMarketPreviousClose ?? quote.regularMarketPrice;
    const previousCloseEur = Number(toEur(prevRaw).toFixed(4));

    let history: MarketPoint[] = [];
    try {
      const chart = (await yahooFinance.chart(origSym, {
        period1,
        period2: now,
        interval,
      })) as {
        quotes?: Array<{ close?: number | null; date?: Date | string | null }>;
      } | null;

      if (chart?.quotes?.length) {
        history = chart.quotes
          .filter((q) => typeof q.close === 'number' && q.close > 0 && Boolean(q.date))
          .map((q) => ({
            date: new Date(q.date as Date | string).toISOString().slice(0, 10),
            priceEur: Number(toEur(q.close as number).toFixed(4)),
          }));
      }
    } catch {
      // Historique optionnel si seul le cours actuel répond
    }

    if (history.length === 0) {
      history = [{ date: now.toISOString().slice(0, 10), priceEur }];
    }

    return {
      symbol: origSym,
      name: quote.longName || quote.shortName || origSym,
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const symbols: string[] = Array.isArray(body?.symbols) ? body.symbols : [];
    const timeframe: string = body?.timeframe || 'LTM';
    const apiKey = process.env.TWELVEDATA_API_KEY?.trim();

    let eurUsdRate = 1.0968;

    // 1. Taux de change EUR/USD : Twelve Data puis secours Yahoo
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
        // Passe au secours Yahoo
      }
    }

    if (!fxResolved) {
      try {
        const fxYahoo = (await yahooFinance.quote('EURUSD=X')) as {
          regularMarketPrice?: number;
        } | null;
        if (fxYahoo && typeof fxYahoo.regularMarketPrice === 'number' && fxYahoo.regularMarketPrice > 0) {
          eurUsdRate = fxYahoo.regularMarketPrice;
        }
      } catch {
        // Garde 1.0968
      }
    }

    if (symbols.length === 0) {
      return NextResponse.json({ quotes: {}, eurUsdRate });
    }

    const quotes: Record<string, ResolvedQuote> = {};

    // 2. Cascade par position : Twelve Data -> Yahoo Finance -> (client fallback manuel)
    for (const rawSym of symbols) {
      const origSym = rawSym.trim().toUpperCase();
      if (!origSym) continue;

      let resolved: ResolvedQuote | null = null;

      if (apiKey) {
        resolved = await fetchFromTwelveData(origSym, timeframe, apiKey, eurUsdRate);
      }

      if (!resolved) {
        resolved = await fetchFromYahoo(origSym, timeframe, eurUsdRate);
      }

      if (resolved) {
        quotes[origSym] = resolved;
      }
    }

    return NextResponse.json({ quotes, eurUsdRate });
  } catch {
    return NextResponse.json({ quotes: {}, eurUsdRate: 1.0968 }, { status: 200 });
  }
}
