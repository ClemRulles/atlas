import { PortfolioHolding } from '@/types/portfolio';

export const INITIAL_HOLDINGS: PortfolioHolding[] = [
  {
    id: 'holding-aapl-bgl',
    name: 'Apple Inc.',
    category: 'Actions',
    symbol: 'AAPL',
    quantity: 34,
    buyPriceEur: 1.5,
    buyDate: '2003-10-10',
    institution: 'BGL',
  },
  {
    id: 'holding-nvda-bgl',
    name: 'NVIDIA Corporation',
    category: 'Actions',
    symbol: 'NVDA',
    quantity: 3,
    buyPriceEur: 6.2,
    buyDate: '2020-02-03',
    institution: 'BGL',
  },
  {
    id: 'holding-msci-em-tr',
    name: 'MSCI Emerging Markets ETF',
    category: 'ETF',
    symbol: 'EEM',
    quantity: 12.5,
    buyPriceEur: 40,
    buyDate: '2026-11-11',
    institution: 'Trade Republic',
    manualCurrentPriceEur: 41.2,
  },
];

export const CATEGORY_COLORS: Record<string, string> = {
  Actions: '#2563EB',
  ETF: '#0EA5E9',
  Fonds: '#8B5CF6',
  Crypto: '#F59E0B',
  Cash: '#10B981',
  'Or / Matières premières': '#EAB308',
};
