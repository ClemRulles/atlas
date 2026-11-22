import { NextRequest, NextResponse } from 'next/server';

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

function getIntervalAndOutputSize(timeframe: string): { interval: string; outputsize: number } {
  switch (timeframe) {
    case '1J':
      return { interval: '15min', outputsize: 40 };
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const symbols: string[] = Array.isArray(body?.symbols) ? body.symbols : [];
    const timeframe: string = body?.timeframe || '1M';
    const apiKey = process.env.TWELVEDATA_API_KEY;

    let eurUsdRate = 1.0968;

    if (!apiKey) {
      return NextResponse.json({ quotes: {}, eurUsdRate, missingKey: true });
    }

    try {
      const fxRes = await fetch(
        `https://api.twelvedata.com/exchange_rate?symbol=EUR/USD&apikey=${encodeURIComponent(apiKey)}`,
        { cache: 'no-store' }
      );
      if (fxRes.ok) {
        const fxData = await fxRes.json();
        const rate = parseFloat(fxData?.rate);
        if (!Number.isNaN(rate) && rate > 0) {
          eurUsdRate = rate;
        }
      }
    } catch {
      // Garde le taux de secours
    }

    if (symbols.length === 0) {
      return NextResponse.json({ quotes: {}, eurUsdRate });
    }

    const { interval, outputsize } = getIntervalAndOutputSize(timeframe);
    const quotes: Record<string, unknown> = {};

    await Promise.all(
      symbols.map(async (rawSym) => {
        const origSym = rawSym.trim().toUpperCase();
        if (!origSym) return;

        // Les ISIN purs (ex. BE0167243154) ne sont pas des tickers cotés sur Twelve Data
        if (/^[A-Z]{2}[A-Z0-9]{10}$/.test(origSym)) {
          return;
        }

        const tdSym = toTwelveDataSymbol(origSym);

        try {
          const tsUrl = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(
            tdSym
          )}&interval=${interval}&outputsize=${outputsize}&apikey=${encodeURIComponent(apiKey)}`;

          const res = await fetch(tsUrl, { cache: 'no-store' });
          if (!res.ok) return;

          const data = await res.json();
          if (data?.status === 'error' || !Array.isArray(data?.values) || data.values.length === 0) {
            return;
          }

          const rawCurrency = (data?.meta?.currency || 'USD').toUpperCase();
          const currency = rawCurrency === 'USD' ? 'USD' : 'EUR';
          const toEur = (val: number) => (currency === 'USD' ? val / eurUsdRate : val);

          const ordered = [...data.values].reverse();
          const history: { date: string; priceEur: number }[] = ordered
            .map((v: { datetime?: string; close?: string }) => {
              const closeNum = parseFloat(v.close || '');
              if (Number.isNaN(closeNum) || closeNum <= 0 || !v.datetime) return null;
              return {
                date: v.datetime.slice(0, 10),
                priceEur: Number(toEur(closeNum).toFixed(4)),
              };
            })
            .filter(Boolean) as { date: string; priceEur: number }[];

          if (history.length === 0) return;

          const latest = history[history.length - 1];
          const prev = history.length > 1 ? history[history.length - 2] : latest;

          quotes[origSym] = {
            symbol: origSym,
            name: data?.meta?.name || origSym,
            currency,
            priceEur: latest.priceEur,
            previousCloseEur: prev.priceEur,
            history,
            source: 'yahoo',
          };
        } catch {
          // Bascule sur valeur manuelle côté client
        }
      })
    );

    return NextResponse.json({ quotes, eurUsdRate });
  } catch {
    return NextResponse.json({ quotes: {}, eurUsdRate: 1.0968 }, { status: 200 });
  }
}
