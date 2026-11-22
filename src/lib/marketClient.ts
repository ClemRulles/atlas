import {
  AssetCurrency,
  EnrichedHolding,
  MarketQuoteResult,
  PortfolioHolding,
  TimeframeKey,
} from '@/types/portfolio';

function getStartDateForTimeframe(
  tf: TimeframeKey,
  earliestBuyDate: string,
  refDate: Date
): Date {
  const now = new Date(refDate);
  const d = new Date(now);
  switch (tf) {
    case '1J':
      d.setDate(now.getDate() - 1);
      return d;
    case '1S':
      d.setDate(now.getDate() - 7);
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
    default: {
      const parsed = new Date(earliestBuyDate);
      return Number.isNaN(parsed.getTime())
        ? new Date(now.getFullYear() - 10, 0, 1)
        : parsed;
    }
  }
}

function buildFallbackQuote(
  holding: PortfolioHolding,
  refDate: Date
): MarketQuoteResult {
  const basePrice =
    holding.manualCurrentPriceEur && holding.manualCurrentPriceEur > 0
      ? holding.manualCurrentPriceEur
      : holding.buyPriceEur > 0
      ? holding.buyPriceEur
      : 100;

  const isCash = holding.category === 'Cash';
  const points: { date: string; priceEur: number }[] = [];
  const steps = 120;
  const totalDays = 3650;
  const now = new Date(refDate);

  for (let i = steps; i >= 0; i--) {
    const dt = new Date(now);
    const daysBack = Math.round((i / steps) * totalDays);
    dt.setDate(now.getDate() - daysBack);
    const progress = (steps - i) / steps;
    const wave = isCash
      ? 1
      : 0.45 + progress * 0.55 + Math.sin(i / 5) * 0.03;
    const price = i === 0 ? basePrice : Number((basePrice * wave).toFixed(2));
    points.push({
      date: dt.toISOString().slice(0, 10),
      priceEur: Math.max(0.01, price),
    });
  }

  const prevPrice = points.length > 1 ? points[points.length - 2].priceEur : basePrice;

  return {
    symbol: holding.symbol || holding.name,
    currency: holding.currency || 'EUR',
    priceEur: basePrice,
    previousCloseEur: prevPrice,
    history: points,
    source: 'manual',
  };
}

export async function fetchQuotesForHoldings(
  holdings: PortfolioHolding[],
  timeframe: TimeframeKey,
  refDate: Date = new Date('2026-11-22T00:00:00Z')
): Promise<{ quotes: Record<string, MarketQuoteResult>; eurUsdRate: number }> {
  const symbols = Array.from(
    new Set(
      holdings
        .filter((h) => h.category !== 'Cash' && h.symbol && h.symbol.trim().length > 0)
        .map((h) => h.symbol!.trim())
    )
  );

  let serverMap: Record<string, MarketQuoteResult> = {};
  let eurUsdRate = 1.0968;

  if (symbols.length > 0) {
    try {
      const res = await fetch('/api/market', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols, timeframe }),
      });
      if (res.ok) {
        const data = await res.json();
        serverMap = data.quotes || {};
        if (typeof data.eurUsdRate === 'number' && data.eurUsdRate > 0) {
          eurUsdRate = data.eurUsdRate;
        }
      }
    } catch {
      // Fallback silencieux
    }
  }

  const result: Record<string, MarketQuoteResult> = {};
  const fallbackDateStr = refDate.toISOString().slice(0, 10);

  for (const h of holdings) {
    if (h.category === 'Cash') {
      const unitVal = h.buyPriceEur > 0 ? h.buyPriceEur : 1;
      result[h.id] = {
        symbol: 'CASH-EUR',
        currency: h.currency || 'EUR',
        priceEur: unitVal,
        previousCloseEur: unitVal,
        history: [
          { date: h.buyDate || fallbackDateStr, priceEur: unitVal },
          { date: fallbackDateStr, priceEur: unitVal },
        ],
        source: 'manual',
      };
      continue;
    }

    const symKey = (h.symbol || '').trim().toUpperCase();
    const live = serverMap[symKey] || serverMap[(h.symbol || '').trim()];
    if (live && live.priceEur > 0) {
      result[h.id] = {
        ...live,
        currency: (live.currency || h.currency || 'EUR') as AssetCurrency,
      };
    } else {
      result[h.id] = buildFallbackQuote(h, refDate);
    }
  }

  return { quotes: result, eurUsdRate };
}

export function enrichHoldings(
  holdings: PortfolioHolding[],
  quotes: Record<string, MarketQuoteResult>,
  timeframe: TimeframeKey,
  refDate: Date = new Date('2026-11-22T00:00:00Z')
): EnrichedHolding[] {
  const fallbackDateStr = refDate.toISOString().slice(0, 10);
  const earliestBuy =
    holdings.length > 0
      ? holdings.reduce((min, h) => (h.buyDate < min ? h.buyDate : min), holdings[0].buyDate)
      : fallbackDateStr;

  const startDate = getStartDateForTimeframe(timeframe, earliestBuy, refDate);

  return holdings.map((h) => {
    const q = quotes[h.id] || buildFallbackQuote(h, refDate);
    const currency: AssetCurrency = h.currency || q.currency || 'EUR';
    const currentPriceEur = q.priceEur;
    const currentValueEur = currentPriceEur * h.quantity;
    const costBasisEur = h.buyPriceEur * h.quantity;
    const pnlEur = currentValueEur - costBasisEur;
    const pnlPercent = costBasisEur > 0 ? (pnlEur / costBasisEur) * 100 : 0;

    const filteredHistory = q.history.filter((pt) => new Date(pt.date) >= startDate);
    const basePoint =
      filteredHistory.length > 0 ? filteredHistory[0].priceEur * h.quantity : currentValueEur;

    const periodChangeEur = currentValueEur - basePoint;
    const periodChangePercent = basePoint > 0 ? (periodChangeEur / basePoint) * 100 : 0;

    const history =
      filteredHistory.length > 0
        ? filteredHistory.map((pt) => ({
            date: pt.date,
            valueEur: Number((pt.priceEur * h.quantity).toFixed(2)),
          }))
        : [
            {
              date: startDate.toISOString().slice(0, 10),
              valueEur: Number(basePoint.toFixed(2)),
            },
            { date: fallbackDateStr, valueEur: Number(currentValueEur.toFixed(2)) },
          ];

    return {
      ...h,
      currency,
      currentPriceEur,
      currentValueEur,
      costBasisEur,
      pnlEur,
      pnlPercent,
      periodChangeEur,
      periodChangePercent,
      history,
      liveSource: q.source,
    };
  });
}

export function buildPortfolioSeries(enriched: EnrichedHolding[]) {
  const dateMap = new Map<string, number>();

  for (const item of enriched) {
    for (const pt of item.history) {
      dateMap.set(pt.date, (dateMap.get(pt.date) || 0) + pt.valueEur);
    }
  }

  const sortedDates = Array.from(dateMap.keys()).sort();
  if (sortedDates.length === 0) {
    const total = enriched.reduce((acc, item) => acc + item.currentValueEur, 0);
    return [{ date: '2026-11-22', valueEur: Number(total.toFixed(2)) }];
  }

  return sortedDates.map((date) => ({
    date,
    valueEur: Number((dateMap.get(date) || 0).toFixed(2)),
  }));
}
