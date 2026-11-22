export type AssetCategory =
  | 'Actions'
  | 'ETF'
  | 'Fonds'
  | 'Crypto'
  | 'Cash'
  | 'Or / Matières premières';

export type TimeframeKey = '1J' | '1S' | '1M' | 'YTD' | 'LTM' | 'Tout';

export interface PortfolioHolding {
  id: string;
  name: string;
  category: AssetCategory;
  symbol?: string;
  quantity: number;
  buyPriceEur: number;
  buyDate: string;
  institution: string;
  manualCurrentPriceEur?: number;
}

export interface EnrichedHolding extends PortfolioHolding {
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
  priceEur: number;
  previousCloseEur: number;
  history: { date: string; priceEur: number }[];
  source: 'yahoo' | 'manual';
}
