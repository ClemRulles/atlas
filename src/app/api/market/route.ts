import { NextRequest, NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';

interface YahooQuoteShape {
  regularMarketPrice?: number;
  regularMarketPreviousClose?: number;
  currency?: string;
}

interface YahooChartPoint {
  close?: number | null;
  date?: Date | string | null;
}

interface YahooChartShape {
  quotes?: YahooChartPoint[];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const symbols: string[] = Array.isArray(body?.symbols) ? body.symbols : [];
    const timeframe: string = body?.timeframe || '1M';

    if (symbols.length === 0) {
      return NextResponse.json({ quotes: {} });
    }

    let eurUsdRate = 1.08;
    try {
      const fx = (await yahooFinance.quote('EURUSD=X')) as YahooQuoteShape | null;
      if (fx && typeof fx.regularMarketPrice === 'number' && fx.regularMarketPrice > 0) {
        eurUsdRate = fx.regularMarketPrice;
      }
    } catch {
      // Taux par défaut
    }

    const now = new Date();
    const period1 = new Date(now);
    switch (timeframe) {
      case '1J':
        period1.setDate(now.getDate() - 5);
        break;
      case '1S':
        period1.setDate(now.getDate() - 10);
        break;
      case '1M':
        period1.setMonth(now.getMonth() - 1);
        break;
      case 'YTD':
        period1.setFullYear(now.getFullYear(), 0, 1);
        break;
      case 'LTM':
        period1.setFullYear(now.getFullYear() - 1);
        break;
      case '2A':
        period1.setFullYear(now.getFullYear() - 2);
        break;
      case '5A':
        period1.setFullYear(now.getFullYear() - 5);
        break;
      case '10A':
        period1.setFullYear(now.getFullYear() - 10);
        break;
      case 'Tout':
      default:
        period1.setFullYear(now.getFullYear() - 25);
        break;
    }

    const interval = ['2A', '5A', '10A', 'Tout'].includes(timeframe) ? '1wk' : '1d';
    const quotes: Record<string, unknown> = {};

    await Promise.all(
      symbols.map(async (rawSym) => {
        const sym = rawSym.trim().toUpperCase();
        if (!sym) return;
        try {
          const quote = (await yahooFinance.quote(sym)) as YahooQuoteShape | null;
          if (!quote || typeof quote.regularMarketPrice !== 'number') return;

          const currency = (quote.currency || 'EUR').toUpperCase();
          const toEur = (val: number) => (currency === 'USD' ? val / eurUsdRate : val);

          const priceEur = Number(toEur(quote.regularMarketPrice).toFixed(4));
          const prevCloseRaw = quote.regularMarketPreviousClose ?? quote.regularMarketPrice;
          const previousCloseEur = Number(toEur(prevCloseRaw).toFixed(4));

          let history: { date: string; priceEur: number }[] = [];
          try {
            const chart = (await yahooFinance.chart(sym, {
              period1,
              period2: now,
              interval,
            })) as YahooChartShape | null;
            if (chart?.quotes?.length) {
              history = chart.quotes
                .filter((q: YahooChartPoint) => typeof q.close === 'number' && Boolean(q.date))
                .map((q: YahooChartPoint) => ({
                  date: new Date(q.date as Date | string).toISOString().slice(0, 10),
                  priceEur: Number(toEur(q.close as number).toFixed(4)),
                }));
            }
          } catch {
            // Historique optionnel
          }

          if (history.length === 0) {
            history = [{ date: now.toISOString().slice(0, 10), priceEur }];
          }

          quotes[sym] = {
            symbol: sym,
            priceEur,
            previousCloseEur,
            history,
            source: 'yahoo',
          };
        } catch {
          // Symbole introuvable
        }
      })
    );

    return NextResponse.json({ quotes });
  } catch {
    return NextResponse.json({ quotes: {} }, { status: 200 });
  }
}
