import {
  AssetCurrency,
  EnrichedHolding,
  MarketQuoteResult,
  PortfolioHolding,
  TimeframeKey,
} from '@/types/portfolio';

export function getStartDateForTimeframe(
  tf: TimeframeKey,
  earliestBuyDate: string,
  refDate: Date
): Date {
  const now = new Date(refDate);
  const d = new Date(now);
  switch (tf) {
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
  refDate: Date,
  forcedSource: 'yahoo' | 'manual' = 'manual',
  overrideEndPrice?: number
): MarketQuoteResult {
  const endPrice =
    overrideEndPrice && overrideEndPrice > 0
      ? overrideEndPrice
      : holding.manualCurrentPriceEur && holding.manualCurrentPriceEur > 0
      ? holding.manualCurrentPriceEur
      : holding.buyPriceEur > 0
      ? holding.buyPriceEur
      : 100;

  const startPrice = holding.buyPriceEur > 0 ? holding.buyPriceEur : endPrice;
  const isCash = holding.category === 'Cash';
  const points: { date: string; priceEur: number }[] = [];
  const steps = 160;
  const now = new Date(refDate);

  const buyDt = new Date(holding.buyDate);
  const originDt = Number.isNaN(buyDt.getTime())
    ? new Date(now.getFullYear() - 5, 0, 1)
    : buyDt;
  const totalMs = Math.max(24 * 3600 * 1000, now.getTime() - originDt.getTime());

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const dt = new Date(originDt.getTime() + t * totalMs);
    let price = endPrice;
    if (!isCash) {
      const trend = startPrice + (endPrice - startPrice) * t;
      const oscillation = Math.sin(t * Math.PI * 10) * (endPrice * 0.015) * (1 - t);
      price = i === steps ? endPrice : Math.max(0.01, trend + oscillation);
    }
    points.push({
      date: dt.toISOString().slice(0, 10),
      priceEur: Number(price.toFixed(4)),
    });
  }

  const prevPrice = points.length > 1 ? points[points.length - 2].priceEur : endPrice;

  return {
    symbol: holding.symbol || holding.name,
    currency: holding.currency || 'EUR',
    priceEur: endPrice,
    previousCloseEur: prevPrice,
    history: points,
    source: forcedSource,
  };
}

export async function fetchQuotesForHoldings(
  holdings: PortfolioHolding[],
  timeframe: TimeframeKey,
  refDate: Date = new Date('2026-11-22T00:00:00Z'),
  knownLiveStatus: Record<string, { isLive: boolean; lastPriceEur?: number }> = {}
): Promise<{
  quotes: Record<string, MarketQuoteResult>;
  eurUsdRate: number;
  updatedLiveStatus: Record<string, { isLive: boolean; lastPriceEur?: number }>;
}> {
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
  const updatedLiveStatus = { ...knownLiveStatus };

  for (const h of holdings) {
    if (h.category === 'Cash') {
      result[h.id] = buildFallbackQuote(h, refDate, 'manual');
      continue;
    }

    const symKey = (h.symbol || '').trim().toUpperCase();
    const live = serverMap[symKey] || serverMap[(h.symbol || '').trim()];
    const prevKnown = updatedLiveStatus[h.id];

    if (live && live.priceEur > 0) {
      updatedLiveStatus[h.id] = { isLive: true, lastPriceEur: live.priceEur };
      if (live.history && live.history.length >= 2) {
        result[h.id] = {
          ...live,
          currency: (h.currency || live.currency || 'EUR') as AssetCurrency,
          source: 'yahoo',
        };
      } else {
        result[h.id] = buildFallbackQuote(h, refDate, 'yahoo', live.priceEur);
      }
    } else if (prevKnown?.isLive) {
      result[h.id] = buildFallbackQuote(
        h,
        refDate,
        'yahoo',
        prevKnown.lastPriceEur
      );
    } else {
      result[h.id] = buildFallbackQuote(h, refDate, 'manual');
    }
  }

  return { quotes: result, eurUsdRate, updatedLiveStatus };
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
    const q = quotes[h.id] || buildFallbackQuote(h, refDate, 'manual');
    const currency: AssetCurrency = h.currency || q.currency || 'EUR';
    const currentPriceEur = q.priceEur;
    const currentValueEur = currentPriceEur * h.quantity;
    const costBasisEur = h.buyPriceEur * h.quantity;
    const pnlEur = currentValueEur - costBasisEur;
    const pnlPercent = costBasisEur > 0 ? (pnlEur / costBasisEur) * 100 : 0;

    const filteredHistory = q.history.filter((pt) => new Date(pt.date) >= startDate);
    const effectiveHistory = filteredHistory.length >= 2 ? filteredHistory : q.history;
    const basePoint =
      effectiveHistory.length > 0 ? effectiveHistory[0].priceEur * h.quantity : currentValueEur;

    const periodChangeEur = currentValueEur - basePoint;
    const periodChangePercent = basePoint > 0 ? (periodChangeEur / basePoint) * 100 : 0;

    const history =
      effectiveHistory.length >= 2
        ? effectiveHistory.map((pt) => ({
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

function interpolateValueAtTimestamp(
  parsedPoints: { ts: number; valueEur: number }[],
  targetTs: number,
  fallbackVal: number
): number {
  if (parsedPoints.length === 0) return fallbackVal;
  if (targetTs <= parsedPoints[0].ts) return parsedPoints[0].valueEur;
  const last = parsedPoints[parsedPoints.length - 1];
  if (targetTs >= last.ts) return last.valueEur;

  for (let i = 0; i < parsedPoints.length - 1; i++) {
    const p0 = parsedPoints[i];
    const p1 = parsedPoints[i + 1];
    if (targetTs >= p0.ts && targetTs <= p1.ts) {
      const span = p1.ts - p0.ts;
      if (span <= 0) return p1.valueEur;
      const ratio = (targetTs - p0.ts) / span;
      return p0.valueEur + (p1.valueEur - p0.valueEur) * ratio;
    }
  }
  return last.valueEur;
}

export function buildPortfolioSeries(
  enriched: EnrichedHolding[],
  timeframe: TimeframeKey = 'LTM',
  refDate: Date = new Date('2026-11-22T00:00:00Z')
) {
  if (enriched.length === 0) {
    return [{ date: '2026-11-22', valueEur: 0 }];
  }

  const fallbackDateStr = refDate.toISOString().slice(0, 10);
  const earliestBuy = enriched.reduce(
    (min, h) => (h.buyDate < min ? h.buyDate : min),
    enriched[0].buyDate || fallbackDateStr
  );

  const startDt = getStartDateForTimeframe(timeframe, earliestBuy, refDate);
  const endDt = new Date(refDate);
  const startTs = startDt.getTime();
  const endTs = Math.max(startTs + 3600 * 1000, endDt.getTime());

  const steps = 90;

  const preparedHoldings = enriched.map((item) => {
    const parsed = item.history
      .map((pt) => {
        const ts = new Date(pt.date.slice(0, 10) + 'T00:00:00Z').getTime();
        return Number.isNaN(ts) ? null : { ts, valueEur: pt.valueEur };
      })
      .filter(Boolean) as { ts: number; valueEur: number }[];
    parsed.sort((a, b) => a.ts - b.ts);
    return { item, parsed };
  });

  const series: { date: string; valueEur: number }[] = [];

  for (let i = 0; i <= steps; i++) {
    const ratio = i / steps;
    const ts = startTs + ratio * (endTs - startTs);
    const dt = new Date(ts);
    const label = dt.toISOString().slice(0, 10);

    let total = 0;
    for (const { item, parsed } of preparedHoldings) {
      if (i === steps) {
        total += item.currentValueEur;
      } else {
        total += interpolateValueAtTimestamp(parsed, ts, item.currentValueEur);
      }
    }

    series.push({
      date: label,
      valueEur: Number(total.toFixed(2)),
    });
  }

  return series;
}
