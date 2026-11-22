'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  ChevronRight,
  Clock,
  LayoutDashboard,
  Lock,
  Newspaper,
  Pencil,
  PieChart,
  Plus,
  RefreshCw,
  Send,
  Settings,
  Sparkles,
} from 'lucide-react';
import LockScreen from '@/components/LockScreen';
import InteractiveChart, { RangeSelection } from '@/components/InteractiveChart';
import DonutAllocation from '@/components/DonutAllocation';
import HoldingFormModal from '@/components/HoldingFormModal';
import SettingsModal from '@/components/SettingsModal';
import {
  CATEGORY_COLORS,
  DEFAULT_INSTITUTIONS,
  INITIAL_HOLDINGS,
} from '@/data/initialPortfolio';
import { formatMoney, formatNumber, formatSignedMoney } from '@/lib/formatters';
import {
  buildPortfolioSeries,
  enrichHoldings,
  fetchQuotesForHoldings,
} from '@/lib/marketClient';
import {
  AssetCategory,
  EnrichedHolding,
  MarketQuoteResult,
  PortfolioHolding,
  TimeframeKey,
} from '@/types/portfolio';

const HOLDINGS_STORAGE_KEY = 'wealthview_holdings_v5';
const INSTITUTIONS_STORAGE_KEY = 'wealthview_institutions_v1';
const TIMEFRAMES: TimeframeKey[] = ['1J', '1S', '1M', 'YTD', 'LTM', '2A', '5A', '10A', 'Tout'];

type TabKey = 'synthese' | 'portefeuille' | 'actus' | 'conseiller';

interface NewsItem {
  title: string;
  impact: 'Positif' | 'Neutre' | 'Vigilance';
  asset: string;
  summary: string;
  time: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function WealthAppPage() {
  const [unlocked, setUnlocked] = useState<boolean>(false);
  const [clientNow, setClientNow] = useState<Date>(() => new Date('2026-11-22T00:00:00Z'));
  const [activeTab, setActiveTab] = useState<TabKey>('synthese');
  const [timeframe, setTimeframe] = useState<TimeframeKey>('LTM');
  const [holdings, setHoldings] = useState<PortfolioHolding[]>(INITIAL_HOLDINGS);
  const [institutions, setInstitutions] = useState<string[]>(DEFAULT_INSTITUTIONS);

  const quotesCacheRef = useRef<Partial<Record<TimeframeKey, Record<string, MarketQuoteResult>>>>({});
  const [quotes, setQuotes] = useState<Record<string, MarketQuoteResult>>({});
  const [eurUsdRate, setEurUsdRate] = useState<number>(1.0968);
  const [loadingQuotes, setLoadingQuotes] = useState<boolean>(false);
  const [hoverPoint, setHoverPoint] = useState<{ date: string; valueEur: number } | null>(null);
  const [rangeSelection, setRangeSelection] = useState<RangeSelection | null>(null);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [editingHolding, setEditingHolding] = useState<PortfolioHolding | null>(null);

  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [loadingNews, setLoadingNews] = useState<boolean>(false);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        'Bonjour ! Je suis votre conseiller financier IA. Posez-moi une question sur votre répartition, vos plus-values ou votre stratégie d’investissement.',
    },
  ]);
  const [chatInput, setChatInput] = useState<string>('');
  const [sendingChat, setSendingChat] = useState<boolean>(false);

  useEffect(() => {
    setClientNow(new Date());
    try {
      const saved = localStorage.getItem(HOLDINGS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setHoldings(parsed);
        }
      }
      const savedInst = localStorage.getItem(INSTITUTIONS_STORAGE_KEY);
      if (savedInst) {
        const parsedInst = JSON.parse(savedInst);
        if (Array.isArray(parsedInst) && parsedInst.length > 0) {
          setInstitutions(parsedInst);
        }
      }
    } catch {
      // Ignore storage error
    }
  }, []);

  const persistInstitutions = (next: string[]) => {
    setInstitutions(next);
    try {
      localStorage.setItem(INSTITUTIONS_STORAGE_KEY, JSON.stringify(next));
    } catch {}
  };

  const persistHoldings = (next: PortfolioHolding[]) => {
    quotesCacheRef.current = {};
    setHoldings(next);
    try {
      localStorage.setItem(HOLDINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {}
  };

  const refreshQuotes = useCallback(
    async (items: PortfolioHolding[], tf: TimeframeKey, force = false) => {
      if (!force && quotesCacheRef.current[tf]) {
        setQuotes(quotesCacheRef.current[tf]!);
        return;
      }

      setLoadingQuotes(true);
      const { quotes: q, eurUsdRate: fxRate } = await fetchQuotesForHoldings(
        items,
        tf,
        clientNow
      );
      quotesCacheRef.current[tf] = q;
      setQuotes(q);
      setEurUsdRate(fxRate);
      setLoadingQuotes(false);
    },
    [clientNow]
  );

  useEffect(() => {
    if (unlocked) {
      refreshQuotes(holdings, timeframe, false);
    }
  }, [unlocked, holdings, timeframe, refreshQuotes]);

  const enriched = useMemo(
    () => enrichHoldings(holdings, quotes, timeframe, clientNow),
    [holdings, quotes, timeframe, clientNow]
  );

  const series = useMemo(() => buildPortfolioSeries(enriched), [enriched]);

  const totalValueEur = useMemo(
    () => enriched.reduce((sum, h) => sum + h.currentValueEur, 0),
    [enriched]
  );

  const totalCostEur = useMemo(
    () => enriched.reduce((sum, h) => sum + h.costBasisEur, 0),
    [enriched]
  );

  const totalPnlEur = totalValueEur - totalCostEur;
  const totalPnlPct = totalCostEur > 0 ? (totalPnlEur / totalCostEur) * 100 : 0;

  const periodDeltaEur = useMemo(() => {
    if (series.length < 2) return 0;
    return series[series.length - 1].valueEur - series[0].valueEur;
  }, [series]);

  const periodDeltaPct = useMemo(() => {
    if (series.length < 2 || series[0].valueEur <= 0) return 0;
    return (periodDeltaEur / series[0].valueEur) * 100;
  }, [series, periodDeltaEur]);

  const groupedByCategory = useMemo(() => {
    const categoryOrder: AssetCategory[] = [
      'Actions',
      'ETF',
      'Fonds',
      'Or / Matières premières',
      'Cash',
      'Crypto',
    ];

    const map = new Map<
      AssetCategory,
      {
        category: AssetCategory;
        items: EnrichedHolding[];
        totalValueEur: number;
        totalCostEur: number;
        pnlEur: number;
        pnlPct: number;
      }
    >();

    for (const h of enriched) {
      const existing = map.get(h.category);
      if (!existing) {
        map.set(h.category, {
          category: h.category,
          items: [h],
          totalValueEur: h.currentValueEur,
          totalCostEur: h.costBasisEur,
          pnlEur: h.pnlEur,
          pnlPct: 0,
        });
      } else {
        existing.items.push(h);
        existing.totalValueEur += h.currentValueEur;
        existing.totalCostEur += h.costBasisEur;
        existing.pnlEur += h.pnlEur;
      }
    }

    return Array.from(map.values())
      .map((group) => ({
        ...group,
        items: [...group.items].sort((a, b) => b.currentValueEur - a.currentValueEur),
        pnlPct: group.totalCostEur > 0 ? (group.pnlEur / group.totalCostEur) * 100 : 0,
      }))
      .sort((a, b) => {
        const ia = categoryOrder.indexOf(a.category);
        const ib = categoryOrder.indexOf(b.category);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });
  }, [enriched]);

  const categorySlices = useMemo(
    () =>
      groupedByCategory.map((g) => ({
        label: g.category,
        valueEur: g.totalValueEur,
        displayValue: g.totalValueEur,
        currency: 'EUR' as const,
      })),
    [groupedByCategory]
  );

  const currencySlices = useMemo(() => {
    const map = new Map<'EUR' | 'USD', number>();
    for (const h of enriched) {
      map.set(h.currency, (map.get(h.currency) || 0) + h.currentValueEur);
    }
    return Array.from(map.entries())
      .map(([cur, valueEur]) => ({
        label: cur,
        valueEur,
        displayValue: cur === 'USD' ? valueEur * eurUsdRate : valueEur,
        currency: cur,
      }))
      .sort((a, b) => b.valueEur - a.valueEur);
  }, [enriched, eurUsdRate]);

  const institutionGroups = useMemo(() => {
    const map = new Map<string, number>();
    for (const h of enriched) {
      map.set(h.institution, (map.get(h.institution) || 0) + h.currentValueEur);
    }
    return Array.from(map.entries())
      .map(([institution, valueEur]) => ({ institution, valueEur }))
      .sort((a, b) => b.valueEur - a.valueEur);
  }, [enriched]);

  const toggleCategory = (cat: string) => {
    setOpenCategories((prev) => ({
      ...prev,
      [cat]: !prev[cat],
    }));
  };

  const handleSaveHolding = (item: PortfolioHolding) => {
    const exists = holdings.some((h) => h.id === item.id);
    const next = exists
      ? holdings.map((h) => (h.id === item.id ? item : h))
      : [...holdings, item];
    persistHoldings(next);
  };

  const handleDeleteHolding = (id: string) => {
    const next = holdings.filter((h) => h.id !== id);
    persistHoldings(next);
  };

  const loadAiNews = useCallback(async () => {
    setLoadingNews(true);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'news',
          portfolio: enriched.map((h) => ({
            name: h.name,
            symbol: h.symbol,
            currency: h.currency,
            category: h.category,
            valueEur: Math.round(h.currentValueEur),
            pnlPct: Number(h.pnlPercent.toFixed(1)),
          })),
        }),
      });
      const data = await res.json();
      if (Array.isArray(data.news)) {
        setNewsItems(data.news);
      }
    } catch {
      // Fallback silencieux
    } finally {
      setLoadingNews(false);
    }
  }, [enriched]);

  useEffect(() => {
    if (unlocked && activeTab === 'actus' && newsItems.length === 0) {
      loadAiNews();
    }
  }, [unlocked, activeTab, newsItems.length, loadAiNews]);

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || sendingChat) return;

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setChatInput('');
    setSendingChat(true);

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'advisor',
          messages: nextMessages,
          portfolio: enriched.map((h) => ({
            name: h.name,
            symbol: h.symbol,
            currency: h.currency,
            category: h.category,
            institution: h.institution,
            valueEur: Math.round(h.currentValueEur),
            pnlPct: Number(h.pnlPercent.toFixed(1)),
          })),
        }),
      });
      const data = await res.json();
      setMessages([
        ...nextMessages,
        {
          role: 'assistant',
          content: data.reply || 'Analyse terminée. Souhaitez-vous approfondir un actif ?',
        },
      ]);
    } catch {
      setMessages([
        ...nextMessages,
        {
          role: 'assistant',
          content: 'Impossible de joindre le conseiller IA pour le moment.',
        },
      ]);
    } finally {
      setSendingChat(false);
    }
  };

  if (!unlocked) {
    return <LockScreen onUnlock={() => setUnlocked(true)} />;
  }

  const displayedValue = rangeSelection
    ? rangeSelection.end.valueEur
    : hoverPoint
    ? hoverPoint.valueEur
    : totalValueEur;

  const activeDeltaEur = rangeSelection ? rangeSelection.diffEur : periodDeltaEur;
  const activeDeltaPct = rangeSelection ? rangeSelection.diffPercent : periodDeltaPct;
  const isDeltaPositive = activeDeltaEur >= 0;

  return (
    <div
      style={{
        paddingBottom: 'calc(6.5rem + env(safe-area-inset-bottom))',
      }}
      className="min-h-screen bg-slate-50 dark:bg-[#090C12] text-slate-900 dark:text-white"
    >
      <header
        style={{
          paddingTop: 'max(3rem, calc(env(safe-area-inset-top) + 0.75rem))',
        }}
        className="sticky top-0 z-30 bg-slate-50 dark:bg-[#090C12] border-b border-slate-200/80 dark:border-slate-800 px-4 pb-3"
      >
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Paramètres et code PIN"
              className="p-2.5 rounded-xl bg-white dark:bg-[#131823] border border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-200 active:scale-95 transition"
            >
              <Settings className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-base font-bold tracking-tight">WealthView</h1>
              <p className="text-[11px] text-slate-400">Patrimoine consolidé • EUR</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => refreshQuotes(holdings, timeframe, true)}
              aria-label="Actualiser les cours"
              className="p-2.5 rounded-xl bg-white dark:bg-[#131823] border border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-200"
            >
              <RefreshCw className={`w-4 h-4 ${loadingQuotes ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => setUnlocked(false)}
              aria-label="Verrouiller"
              className="p-2.5 rounded-xl bg-white dark:bg-[#131823] border border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-200"
            >
              <Lock className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 pt-4 space-y-5">
        {activeTab === 'synthese' && (
          <>
            <section className="rounded-3xl bg-white dark:bg-[#131823] p-5 border border-slate-200/70 dark:border-slate-800/80 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">
                  {rangeSelection
                    ? `${rangeSelection.start.date} → ${rangeSelection.end.date}`
                    : hoverPoint
                    ? `Valeur au ${hoverPoint.date}`
                    : 'Valeur totale du portefeuille'}
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-600/15 text-blue-700 dark:text-blue-400 font-semibold">
                  {holdings.length} actifs
                </span>
              </div>

              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold tracking-tight">
                  {formatMoney(displayedValue, 'EUR', 2)}
                </span>
              </div>

              <div className="mt-1.5 flex items-center gap-2 text-xs font-semibold">
                <span
                  className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg ${
                    isDeltaPositive
                      ? 'bg-emerald-500/10 text-emerald-500'
                      : 'bg-rose-500/10 text-rose-500'
                  }`}
                >
                  {isDeltaPositive ? (
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  ) : (
                    <ArrowDownRight className="w-3.5 h-3.5" />
                  )}
                  {formatSignedMoney(activeDeltaEur, 'EUR', 2)} (
                  {isDeltaPositive ? '+' : ''}
                  {activeDeltaPct.toFixed(2)}%)
                </span>
                <span className="text-slate-400 font-normal">
                  {rangeSelection ? 'entre 2 doigts' : `sur ${timeframe}`}
                </span>
              </div>

              <div className="mt-4">
                <InteractiveChart
                  data={series}
                  onHoverPoint={setHoverPoint}
                  onRangeSelect={setRangeSelection}
                />
              </div>

              <div className="mt-3 flex items-center justify-between gap-1 bg-slate-100 dark:bg-[#0D111A] p-1 rounded-2xl overflow-x-auto">
                {TIMEFRAMES.map((tf) => {
                  const active = timeframe === tf;
                  return (
                    <button
                      key={tf}
                      type="button"
                      onClick={() => setTimeframe(tf)}
                      className={`flex-1 min-w-[34px] py-1.5 rounded-xl text-[11px] font-bold transition ${
                        active
                          ? 'bg-white dark:bg-[#1E2638] text-blue-600 dark:text-blue-400 shadow-xs'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {tf}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Case Capital investi réduite (4 cols) et Plus-value latente élargie (8 cols) sur une seule ligne */}
            <section className="grid grid-cols-12 gap-2.5">
              <div className="col-span-4 rounded-2xl bg-white dark:bg-[#131823] px-3 py-3.5 border border-slate-200/70 dark:border-slate-800/80 min-w-0">
                <span className="block text-[11px] text-slate-400 truncate">Capital investi</span>
                <p className="text-sm font-bold mt-1 truncate">
                  {formatMoney(totalCostEur, 'EUR', 2)}
                </p>
              </div>
              <div className="col-span-8 rounded-2xl bg-white dark:bg-[#131823] px-3.5 py-3.5 border border-slate-200/70 dark:border-slate-800/80 min-w-0">
                <span className="block text-[11px] text-slate-400 truncate">Plus-value latente</span>
                <div className="mt-1 flex items-baseline gap-1.5 whitespace-nowrap overflow-hidden">
                  <span
                    className={`text-sm font-bold ${
                      totalPnlEur >= 0 ? 'text-emerald-500' : 'text-rose-500'
                    }`}
                  >
                    {formatSignedMoney(totalPnlEur, 'EUR', 2)}
                  </span>
                  <span
                    className={`text-xs font-semibold ${
                      totalPnlEur >= 0 ? 'text-emerald-500' : 'text-rose-500'
                    }`}
                  >
                    ({totalPnlPct >= 0 ? '+' : ''}
                    {totalPnlPct.toFixed(1)}%)
                  </span>
                </div>
              </div>
            </section>

            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold">Mes positions par catégorie</h2>
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-500">
                  <Clock className="w-3 h-3" /> = valeur manuelle
                </span>
              </div>

              {groupedByCategory.map((group) => {
                const isOpen = Boolean(openCategories[group.category]);
                const groupPos = group.pnlEur >= 0;
                const dotColor = CATEGORY_COLORS[group.category] || '#2563EB';

                return (
                  <div
                    key={group.category}
                    className="rounded-2xl bg-white dark:bg-[#131823] border border-slate-200/70 dark:border-slate-800/80 overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => toggleCategory(group.category)}
                      className="w-full p-3.5 flex items-center justify-between text-left active:bg-slate-50 dark:active:bg-slate-800/40 transition"
                    >
                      <div className="flex items-center gap-2.5">
                        <ChevronRight
                          className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                            isOpen ? 'rotate-90' : ''
                          }`}
                        />
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: dotColor }}
                        />
                        <div>
                          <p className="text-sm font-bold">{group.category}</p>
                          <p className="text-[11px] text-slate-400">
                            {group.items.length}{' '}
                            {group.items.length > 1 ? 'positions' : 'position'}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="text-sm font-bold">
                          {formatMoney(group.totalValueEur, 'EUR', 2)}
                        </p>
                        <p
                          className={`text-xs font-semibold ${
                            groupPos ? 'text-emerald-500' : 'text-rose-500'
                          }`}
                        >
                          {groupPos ? '+' : ''}
                          {group.pnlPct.toFixed(1)}%
                        </p>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-slate-100 dark:border-slate-800/80 divide-y divide-slate-100 dark:divide-slate-800/60 bg-slate-50/60 dark:bg-[#0D111A]/60">
                        {group.items.map((item) => {
                          const pos = item.pnlEur >= 0;
                          return (
                            <div
                              key={item.id}
                              className="px-4 py-3 flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-bold truncate">{item.name}</span>
                                  {item.liveSource === 'manual' && (
                                    <span
                                      title="Valeur manuelle / hors flux live"
                                      className="inline-flex items-center text-amber-500 shrink-0"
                                    >
                                      <Clock className="w-3.5 h-3.5" />
                                    </span>
                                  )}
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-800 text-slate-500 font-semibold border border-slate-200/60 dark:border-slate-700/60">
                                    {item.currency}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-400 mt-0.5">
                                  {formatNumber(item.quantity, 4)} ×{' '}
                                  {formatMoney(item.currentPriceEur, 'EUR', 2)}
                                </p>
                              </div>

                              <div className="text-right shrink-0">
                                <p className="text-xs font-bold">
                                  {formatMoney(item.currentValueEur, 'EUR', 2)}
                                </p>
                                <p
                                  className={`text-[11px] font-semibold ${
                                    pos ? 'text-emerald-500' : 'text-rose-500'
                                  }`}
                                >
                                  {pos ? '+' : ''}
                                  {item.pnlPercent.toFixed(1)}%
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>

            <footer className="pt-1 pb-2 text-center">
              <p className="text-[11px] text-slate-400">
                Taux de change utilisé :{' '}
                <span className="font-semibold text-slate-600 dark:text-slate-300">
                  1 EUR = {eurUsdRate.toFixed(4)} USD
                </span>
              </p>
            </footer>
          </>
        )}

        {activeTab === 'portefeuille' && (
          <>
            <section className="rounded-3xl bg-white dark:bg-[#131823] p-5 border border-slate-200/70 dark:border-slate-800/80">
              <h2 className="text-sm font-bold mb-4">Répartition par classe d’actifs</h2>
              <DonutAllocation slices={categorySlices} />
            </section>

            <section className="rounded-3xl bg-white dark:bg-[#131823] p-5 border border-slate-200/70 dark:border-slate-800/80">
              <h2 className="text-sm font-bold mb-4">Répartition par devise</h2>
              <DonutAllocation slices={currencySlices} />
            </section>

            <section className="rounded-3xl bg-white dark:bg-[#131823] p-5 border border-slate-200/70 dark:border-slate-800/80 space-y-3">
              <h2 className="text-sm font-bold">Répartition par établissement</h2>
              {institutionGroups.map((g) => {
                const pct = totalValueEur > 0 ? (g.valueEur / totalValueEur) * 100 : 0;
                return (
                  <div key={g.institution} className="space-y-1">
                    <div className="flex justify-between text-xs font-medium">
                      <span>{g.institution}</span>
                      <span>
                        {formatMoney(g.valueEur, 'EUR', 2)} ({pct.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-blue-600 dark:bg-blue-500 rounded-full"
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </section>

            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold">Gérer mes investissements</h2>
                <button
                  type="button"
                  onClick={() => {
                    setEditingHolding(null);
                    setModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" /> Nouvel actif
                </button>
              </div>

              {groupedByCategory.map((group) => (
                <div key={group.category} className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1 pt-1">
                    {group.category}
                  </h3>
                  <div className="space-y-2">
                    {group.items.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-2xl bg-white dark:bg-[#131823] p-3.5 border border-slate-200/70 dark:border-slate-800/80 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-bold truncate">{item.name}</p>
                            {item.liveSource === 'manual' && (
                              <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            )}
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-semibold">
                              {item.currency}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400">
                            {item.institution} • PRU {formatMoney(item.buyPriceEur, 'EUR', 2)}
                          </p>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-sm font-bold">
                            {formatMoney(item.currentValueEur, 'EUR', 2)}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingHolding(item);
                              setModalOpen(true);
                            }}
                            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                            aria-label="Modifier"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          </>
        )}

        {activeTab === 'actus' && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold">Actualités sur mesure</h2>
                <p className="text-xs text-slate-400">
                  Filtrées selon vos positions actuelles
                </p>
              </div>
              <button
                type="button"
                onClick={loadAiNews}
                disabled={loadingNews}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {loadingNews ? 'Analyse...' : 'Actualiser'}
              </button>
            </div>

            {newsItems.length === 0 && !loadingNews ? (
              <div className="rounded-2xl bg-white dark:bg-[#131823] p-6 text-center text-xs text-slate-400 border border-slate-200/70 dark:border-slate-800/80">
                Cliquez sur Actualiser pour générer votre briefing IA personnalisé.
              </div>
            ) : (
              newsItems.map((n, idx) => (
                <article
                  key={idx}
                  className="rounded-2xl bg-white dark:bg-[#131823] p-4 border border-slate-200/70 dark:border-slate-800/80 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-blue-600 dark:text-blue-400">
                      {n.asset}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full font-semibold ${
                        n.impact === 'Positif'
                          ? 'bg-emerald-500/10 text-emerald-500'
                          : n.impact === 'Vigilance'
                          ? 'bg-amber-500/10 text-amber-500'
                          : 'bg-slate-500/10 text-slate-400'
                      }`}
                    >
                      {n.impact}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold leading-snug">{n.title}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {n.summary}
                  </p>
                </article>
              ))
            )}
          </section>
        )}

        {activeTab === 'conseiller' && (
          <section
            style={{
              height: 'calc(100dvh - 11.5rem - env(safe-area-inset-bottom))',
            }}
            className="flex flex-col justify-between"
          >
            <div className="overflow-y-auto space-y-2.5 pr-1">
              {messages.map((m, idx) => (
                <div
                  key={idx}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white dark:bg-[#131823] border border-slate-200/70 dark:border-slate-800/80'
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {sendingChat && (
                <div className="text-xs text-slate-400 italic">
                  Le conseiller analyse votre portefeuille...
                </div>
              )}
            </div>

            <form onSubmit={handleSendChat} className="pt-2.5 flex items-center gap-2 shrink-0">
              <input
                type="text"
                placeholder="Ex. Suis-je trop exposé à la tech US ?"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="flex-1 rounded-2xl px-4 py-2.5 text-xs bg-white dark:bg-[#131823] border border-slate-200/80 dark:border-slate-800 outline-none focus:border-blue-600"
              />
              <button
                type="submit"
                disabled={sendingChat}
                className="p-2.5 rounded-2xl bg-blue-600 text-white disabled:opacity-50"
                aria-label="Envoyer"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </section>
        )}
      </main>

      <nav
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
        className="fixed bottom-0 inset-x-0 z-30 bg-white dark:bg-[#0D111A] border-t border-slate-200/80 dark:border-slate-800 px-2 pt-2"
      >
        <div className="max-w-xl mx-auto grid grid-cols-4 gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('synthese')}
            className={`flex flex-col items-center py-1.5 text-[11px] font-semibold ${
              activeTab === 'synthese' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span>Synthèse</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('portefeuille')}
            className={`flex flex-col items-center py-1.5 text-[11px] font-semibold ${
              activeTab === 'portefeuille'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-400'
            }`}
          >
            <PieChart className="w-5 h-5" />
            <span>Portefeuille</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('actus')}
            className={`flex flex-col items-center py-1.5 text-[11px] font-semibold ${
              activeTab === 'actus' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'
            }`}
          >
            <Newspaper className="w-5 h-5" />
            <span>Actus IA</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('conseiller')}
            className={`flex flex-col items-center py-1.5 text-[11px] font-semibold ${
              activeTab === 'conseiller'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-400'
            }`}
          >
            <Bot className="w-5 h-5" />
            <span>Conseiller</span>
          </button>
        </div>
      </nav>

      <HoldingFormModal
        isOpen={modalOpen}
        initialHolding={editingHolding}
        institutions={institutions}
        onClose={() => {
          setModalOpen(false);
          setEditingHolding(null);
        }}
        onSave={handleSaveHolding}
        onDelete={handleDeleteHolding}
      />

      <SettingsModal
        isOpen={settingsOpen}
        institutions={institutions}
        onUpdateInstitutions={persistInstitutions}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
