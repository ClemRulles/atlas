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

// Repli sans historique synthétique : uniquement valeur actuelle connue (pas de courbe inventée)
function buildManualQuoteWithoutHistory(
  holding: PortfolioHolding,
  refDate: Date,
  forcedSource: 'yahoo' | 'manual' = 'manual',
  overridePriceEur?: number
): MarketQuoteResult {
  const priceEur =
    overridePriceEur && overridePriceEur > 0
      ? overridePriceEur
      : holding.manualCurrentPriceEur && holding.manualCurrentPriceEur > 0
      ? holding.manualCurrentPriceEur
      : holding.buyPriceEur > 0
      ? holding.buyPriceEur
      : 0;

  return {
    symbol: holding.symbol || holding.name,
    currency: holding.currency || 'EUR',
    priceEur,
    previousCloseEur: priceEur,
    history:
      priceEur > 0
        ? [{ date: refDate.toISOString().slice(0, 10), priceEur }]
        : [],
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
      result[h.id] = buildManualQuoteWithoutHistory(h, refDate, 'manual');
      continue;
    }

    const symKey = (h.symbol || '').trim().toUpperCase();
    const live = serverMap[symKey] || serverMap[(h.symbol || '').trim()];
    const prevKnown = updatedLiveStatus[h.id];

    if (live && live.priceEur > 0) {
      const hasRealHistory = Array.isArray(live.history) && live.history.length >= 2;
      updatedLiveStatus[h.id] = { isLive: hasRealHistory, lastPriceEur: live.priceEur };
      result[h.id] = {
        ...live,
        currency: (h.currency || live.currency || 'EUR') as AssetCurrency,
        history: hasRealHistory ? live.history : [],
        source: hasRealHistory ? 'yahoo' : 'manual',
      };
    } else if (prevKnown?.isLive && prevKnown.lastPriceEur) {
      result[h.id] = buildManualQuoteWithoutHistory(
        h,
        refDate,
        'yahoo',
        prevKnown.lastPriceEur
      );
    } else {
      result[h.id] = buildManualQuoteWithoutHistory(h, refDate, 'manual');
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
    const q = quotes[h.id] || buildManualQuoteWithoutHistory(h, refDate, 'manual');
    const currency: AssetCurrency = h.currency || q.currency || 'EUR';
    const currentPriceEur = q.priceEur;
    const currentValueEur = currentPriceEur * h.quantity;
    const costBasisEur = h.buyPriceEur * h.quantity;
    const pnlEur = currentValueEur - costBasisEur;
    const pnlPercent = costBasisEur > 0 ? (pnlEur / costBasisEur) * 100 : 0;

    const rawHistory = q.source === 'yahoo' && Array.isArray(q.history) ? q.history : [];
    const filteredHistory = rawHistory.filter((pt) => new Date(pt.date) >= startDate);
    const activeHistory = filteredHistory.length >= 2 ? filteredHistory : rawHistory;

    const history =
      activeHistory.length >= 2
        ? activeHistory.map((pt) => ({
            date: pt.date,
            valueEur: Number((pt.priceEur * h.quantity).toFixed(2)),
          }))
        : [];

    const basePoint = history.length >= 2 ? history[0].valueEur : currentValueEur;
    const periodChangeEur = history.length >= 2 ? currentValueEur - basePoint : 0;
    const periodChangePercent =
      history.length >= 2 && basePoint > 0 ? (periodChangeEur / basePoint) * 100 : 0;

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
      liveSource: history.length >= 2 && q.source === 'yahoo' ? 'yahoo' : 'manual',
    };
  });
}

// Construit la courbe uniquement à partir de la somme des données historiques réelles disponibles
export function buildPortfolioSeries(enriched: EnrichedHolding[]) {
  const holdingsWithHistory = enriched.filter(
    (item) => item.liveSource === 'yahoo' && Array.isArray(item.history) && item.history.length >= 2
  );

  if (holdingsWithHistory.length === 0) {
    return [];
  }

  const allDatesSet = new Set<string>();
  for (const item of holdingsWithHistory) {
    for (const pt of item.history) {
      allDatesSet.add(pt.date);
    }
  }

  const sortedDates = Array.from(allDatesSet).sort();
  if (sortedDates.length < 2) {
    return [];
  }

  // Grille commune basée uniquement sur les dates historiques existantes
  const lastKnownByHolding = new Map<string, number>();

  return sortedDates.map((date) => {
    let totalOnDate = 0;
    for (const item of holdingsWithHistory) {
      const exactOrEarlier = item.history.filter((p) => p.date <= date);
      if (exactOrEarlier.length > 0) {
        const val = exactOrEarlier[exactOrEarlier.length - 1].valueEur;
        lastKnownByHolding.set(item.id, val);
        totalOnDate += val;
      } else if (lastKnownByHolding.has(item.id)) {
        totalOnDate += lastKnownByHolding.get(item.id)!;
      }
    }
    return {
      date,
      valueEur: Number(totalOnDate.toFixed(2)),
    };
  });
}
