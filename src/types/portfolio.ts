export type AssetCategory =
  | 'Actions'
  | 'ETF'
  | 'Fonds'
  | 'Crypto'
  | 'Cash'
  | 'Or / Matières premières';

export type AssetCurrency = 'EUR' | 'USD';

export type TimeframeKey = '1J' | '1S' | '1M' | 'YTD' | 'LTM' | '2A' | '5A' | '10A' | 'Tout';

export interface PortfolioHolding {
  id: string;
  name: string;
  category: AssetCategory;
  symbol?: string;
  currency?: AssetCurrency;
  quantity: number;
  buyPriceEur: number;
  buyDate: string;
  institution: string;
  manualCurrentPriceEur?: number;
}

export interface EnrichedHolding extends PortfolioHolding {
  currency: AssetCurrency;
  currentPriceEur: number;
  currentValueEur: number;
  costBasisEur: number;
  pnlEur: number;
  pnlPercent: number;
  periodChangeEur: number;
  periodChangePercent: number;
  history: { date: string; valueEur: number }[];
  liveSource: 'yahoo' | 'manual';
}

export interface MarketQuoteResult {
  symbol: string;
  name?: string;
  currency?: AssetCurrency;
  priceEur: number;
  previousCloseEur: number;
  history: { date: string; priceEur: number }[];
  source: 'yahoo' | 'manual';
}
