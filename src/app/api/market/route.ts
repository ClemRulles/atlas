import { NextRequest, NextResponse } from 'next/server';
import { TimeframeKey } from '@/types/portfolio';

function getPeriod1(tf: TimeframeKey): string {
  const now = new Date();
  const d = new Date(now);
  switch (tf) {
    case '1J':
      d.setDate(now.getDate() - 3);
      break;
    case '1S':
      d.setDate(now.getDate() - 10);
      break;
    case '1M':
      d.setMonth(now.getMonth() - 1);
      break;
    case 'YTD':
      return `${now.getFullYear()}-01-01`;
    case 'LTM':
      d.setFullYear(now.getFullYear() - 1);
      break;
    case 'Tout':
    default:
      d.setFullYear(now.getFullYear() - 10);
      break;
  }
  return d.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const symbols: string[] = Array.isArray(body?.symbols) ? body.symbols : [];
    const timeframe: TimeframeKey = body?.timeframe || 'Tout';

    if (symbols.length === 0) {
      return NextResponse.json({ quotes: {} });
    }

    // Chargement dynamique de yahoo-finance2 pour compatibilité v2/v3
    const yfModule = await import('yahoo-finance2');
    const YahooFinanceConstructor =
      (yfModule as unknown as { default?: unknown }).default || yfModule;
    const yf =
      typeof YahooFinanceConstructor === 'function'
        ? new (YahooFinanceConstructor as new () => Record<string, unknown>)()
        : (YahooFinanceConstructor as Record<string, unknown>);

    // Taux USD -> EUR
    let usdToEur = 0.92;
    try {
      const fxQuote = await (
        yf.quote as (sym: string) => Promise<{ regularMarketPrice?: number }>
      )('EURUSD=X');
      if (fxQuote?.regularMarketPrice && fxQuote.regularMarketPrice > 0) {
        usdToEur = 1 / fxQuote.regularMarketPrice;
      }
    } catch {
      // Garde le taux de repli
    }

    const period1 = getPeriod1(timeframe);
    const interval = timeframe === '1J' ? '15m' : timeframe === '1S' ? '1h' : '1d';
    const quotes: Record<string, unknown> = {};

    await Promise.all(
      symbols.map(async (rawSym) => {
        const sym = rawSym.trim();
        if (!sym) return;
        try {
          const quoteData = await (
            yf.quote as (sym: string) => Promise<{
              regularMarketPrice?: number;
              regularMarketPreviousClose?: number;
              currency?: string;
            }>
          )(sym);

          const rawPrice = quoteData?.regularMarketPrice;
          if (!rawPrice || rawPrice <= 0) return;

          const currency = (quoteData?.currency || 'USD').toUpperCase();
          const fx = currency === 'EUR' ? 1 : currency === 'USD' ? usdToEur : usdToEur;
          const priceEur = Number((rawPrice * fx).toFixed(2));
          const prevCloseEur = Number(
            ((quoteData?.regularMarketPreviousClose || rawPrice) * fx).toFixed(2)
          );

          let history: { date: string; priceEur: number }[] = [];
          try {
            const chartData = await (
              yf.chart as (
                sym: string,
                opts: { period1: string; interval: string }
              ) => Promise<{ quotes?: { date: Date | string; close?: number | null }[] }>
            )(sym, { period1, interval });

            history = (chartData?.quotes || [])
              .filter((pt) => typeof pt.close === 'number' && pt.close > 0)
              .map((pt) => ({
                date: new Date(pt.date).toISOString().slice(0, 10),
                priceEur: Number(((pt.close as number) * fx).toFixed(2)),
              }));
          } catch {
            history = [];
          }

          if (history.length === 0) {
            const today = new Date().toISOString().slice(0, 10);
            history = [{ date: today, priceEur }];
          }

          quotes[sym.toUpperCase()] = {
            symbol: sym.toUpperCase(),
            priceEur,
            previousCloseEur: prevCloseEur,
            history,
            source: 'yahoo',
          };
        } catch {
          // Ignoré : le client utilisera le repli manuel
        }
      })
    );

    return NextResponse.json({ quotes });
  } catch (err) {
    return NextResponse.json(
      { quotes: {}, error: err instanceof Error ? err.message : 'Erreur marché' },
      { status: 200 }
    );
  }
}
