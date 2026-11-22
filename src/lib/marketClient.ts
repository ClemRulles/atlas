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
  const endPrice =
    holding.manualCurrentPriceEur && holding.manualCurrentPriceEur > 0
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
        currency: (h.currency || live.currency || 'EUR') as AssetCurrency,
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

// Grille temporelle unifiée pour une courbe précise sans sauts artificiels
export function buildPortfolioSeries(enriched: EnrichedHolding[]) {
  if (enriched.length === 0) {
    return [{ date: '2026-11-22', valueEur: 0 }];
  }

  const allDatesSet = new Set<string>();
  for (const item of enriched) {
    for (const pt of item.history) {
      allDatesSet.add(pt.date);
    }
  }

  const sortedDates = Array.from(allDatesSet).sort();
  if (sortedDates.length === 0) {
    const total = enriched.reduce((acc, item) => acc + item.currentValueEur, 0);
    return [{ date: '2026-11-22', valueEur: Number(total.toFixed(2)) }];
  }

  // Échantillonnage régulier sur maximum 120 points pour une courbe fluide et précise
  const maxPoints = 120;
  const sampledDates =
    sortedDates.length <= maxPoints
      ? sortedDates
      : Array.from({ length: maxPoints }, (_, i) => {
          const idx = Math.round((i / (maxPoints - 1)) * (sortedDates.length - 1));
          return sortedDates[idx];
        });

  return sampledDates.map((date) => {
    let totalOnDate = 0;
    for (const item of enriched) {
      if (item.history.length === 0) {
        totalOnDate += item.currentValueEur;
        continue;
      }
      // Dernière valeur connue à ou avant cette date
      let chosen = item.history[0].valueEur;
      for (let i = 0; i < item.history.length; i++) {
        if (item.history[i].date <= date) {
          chosen = item.history[i].valueEur;
        } else {
          break;
        }
      }
      totalOnDate += chosen;
    }
    return {
      date,
      valueEur: Number(totalOnDate.toFixed(2)),
    };
  });
}
