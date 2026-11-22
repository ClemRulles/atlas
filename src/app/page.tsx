'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Bot,
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
import { DEFAULT_INSTITUTIONS, INITIAL_HOLDINGS } from '@/data/initialPortfolio';
import {
  buildPortfolioSeries,
  enrichHoldings,
  fetchQuotesForHoldings,
} from '@/lib/marketClient';
import { MarketQuoteResult, PortfolioHolding, TimeframeKey } from '@/types/portfolio';

const HOLDINGS_STORAGE_KEY = 'wealthview_holdings_v4';
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
  const [quotes, setQuotes] = useState<Record<string, MarketQuoteResult>>({});
  const [eurUsdRate, setEurUsdRate] = useState<number>(1.0968);
  const [loadingQuotes, setLoadingQuotes] = useState<boolean>(false);
  const [hoverPoint, setHoverPoint] = useState<{ date: string; valueEur: number } | null>(null);
  const [rangeSelection, setRangeSelection] = useState<RangeSelection | null>(null);

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
    } catch {
      // Ignore storage error
    }
  };

  const persistHoldings = (next: PortfolioHolding[]) => {
    setHoldings(next);
    try {
      localStorage.setItem(HOLDINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage error
    }
  };

  const refreshQuotes = useCallback(
    async (items: PortfolioHolding[], tf: TimeframeKey) => {
      setLoadingQuotes(true);
      const { quotes: q, eurUsdRate: fxRate } = await fetchQuotesForHoldings(
        items,
        tf,
        clientNow
      );
      setQuotes(q);
      setEurUsdRate(fxRate);
      setLoadingQuotes(false);
    },
    [clientNow]
  );

  useEffect(() => {
    if (unlocked) {
      refreshQuotes(holdings, timeframe);
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

  const categorySlices = useMemo(() => {
    const map = new Map<string, number>();
    for (const h of enriched) {
      map.set(h.category, (map.get(h.category) || 0) + h.currentValueEur);
    }
    return Array.from(map.entries())
      .map(([label, valueEur]) => ({ label, valueEur }))
      .sort((a, b) => b.valueEur - a.valueEur);
  }, [enriched]);

  const institutionGroups = useMemo(() => {
    const map = new Map<string, number>();
    for (const h of enriched) {
      map.set(h.institution, (map.get(h.institution) || 0) + h.currentValueEur);
    }
    return Array.from(map.entries())
      .map(([institution, valueEur]) => ({ institution, valueEur }))
      .sort((a, b) => b.valueEur - a.valueEur);
  }, [enriched]);

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
          paddingTop: 'max(0.85rem, env(safe-area-inset-top))',
        }}
        className="sticky top-0 z-30 bg-slate-50/90 dark:bg-[#090C12]/90 backdrop-blur-md border-b border-slate-200/70 dark:border-slate-800/80 px-4 pb-3"
      >
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Paramètres et code PIN"
              className="p-2 rounded-xl bg-white dark:bg-[#131823] border border-slate-200/80 dark:border-slate-800 text-slate-600 dark:text-slate-300 active:scale-95 transition"
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
              onClick={() => refreshQuotes(holdings, timeframe)}
              aria-label="Actualiser les cours"
              className="p-2 rounded-xl bg-white dark:bg-[#131823] border border-slate-200/80 dark:border-slate-800 text-slate-600 dark:text-slate-300"
            >
              <RefreshCw className={`w-4 h-4 ${loadingQuotes ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => setUnlocked(false)}
              aria-label="Verrouiller"
              className="p-2 rounded-xl bg-white dark:bg-[#131823] border border-slate-200/80 dark:border-slate-800 text-slate-600 dark:text-slate-300"
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
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-950/10 dark:bg-sky-500/15 text-blue-900 dark:text-sky-400 font-semibold">
                  {holdings.length} actifs
                </span>
              </div>

              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold tracking-tight">
                  {displayedValue.toLocaleString('fr-FR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{' '}
                  €
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
                  {isDeltaPositive ? '+' : ''}
                  {activeDeltaEur.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} € (
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
                          ? 'bg-white dark:bg-[#1E2638] text-blue-900 dark:text-white shadow-xs'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {tf}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white dark:bg-[#131823] p-4 border border-slate-200/70 dark:border-slate-800/80">
                <span className="text-xs text-slate-400">Capital investi</span>
                <p className="text-lg font-bold mt-1">
                  {totalCostEur.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €
                </p>
              </div>
              <div className="rounded-2xl bg-white dark:bg-[#131823] p-4 border border-slate-200/70 dark:border-slate-800/80">
                <span className="text-xs text-slate-400">Plus-value latente</span>
                <p
                  className={`text-lg font-bold mt-1 ${
                    totalPnlEur >= 0 ? 'text-emerald-500' : 'text-rose-500'
                  }`}
                >
                  {totalPnlEur >= 0 ? '+' : ''}
                  {totalPnlEur.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} € (
                  {totalPnlPct >= 0 ? '+' : ''}
                  {totalPnlPct.toFixed(1)}%)
                </p>
              </div>
            </section>

            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold">Mes positions</h2>
                  <span className="inline-flex items-center gap-1 text-[10px] text-amber-500">
                    <Clock className="w-3 h-3" /> = valeur manuelle / hors Yahoo
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingHolding(null);
                    setModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-800 dark:text-sky-400"
                >
                  <Plus className="w-4 h-4" /> Ajouter
                </button>
              </div>

              {enriched.map((item) => {
                const pos = item.pnlEur >= 0;
                return (
                  <div
                    key={item.id}
                    className="rounded-2xl bg-white dark:bg-[#131823] p-3.5 border border-slate-200/70 dark:border-slate-800/80 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-bold truncate">{item.name}</span>
                        {item.liveSource === 'manual' && (
                          <span
                            title="Non trouvé sur Yahoo Finance — valeur de secours utilisée"
                            className="inline-flex items-center text-amber-500 shrink-0"
                          >
                            <Clock className="w-3.5 h-3.5" />
                          </span>
                        )}
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 font-semibold">
                          {item.currency}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 font-semibold">
                          {item.institution}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {item.category} • {item.quantity} ×{' '}
                        {item.currentPriceEur.toLocaleString('fr-FR', {
                          maximumFractionDigits: 2,
                        })}{' '}
                        €
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold">
                        {item.currentValueEur.toLocaleString('fr-FR', {
                          maximumFractionDigits: 2,
                        })}{' '}
                        €
                      </p>
                      <p
                        className={`text-xs font-semibold ${
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
            </section>

            {/* Taux de change utilisé en bas de la page Synthèse */}
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

            <section className="rounded-3xl bg-white dark:bg-[#131823] p-5 border border-slate-200/70 dark:border-slate-800/80 space-y-3">
              <h2 className="text-sm font-bold">Répartition par établissement</h2>
              {institutionGroups.map((g) => {
                const pct = totalValueEur > 0 ? (g.valueEur / totalValueEur) * 100 : 0;
                return (
                  <div key={g.institution} className="space-y-1">
                    <div className="flex justify-between text-xs font-medium">
                      <span>{g.institution}</span>
                      <span>
                        {g.valueEur.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} € (
                        {pct.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-[#1E3A8A] dark:bg-sky-500 rounded-full"
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </section>

            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold">Gérer mes investissements</h2>
                <button
                  type="button"
                  onClick={() => {
                    setEditingHolding(null);
                    setModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0A1628] text-white border border-blue-500/30 text-xs font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" /> Nouvel actif
                </button>
              </div>

              {enriched.map((item) => (
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
                      {item.category} • {item.institution} • PRU{' '}
                      {item.buyPriceEur.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-bold">
                      {item.currentValueEur.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €
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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0A1628] text-white border border-blue-500/30 text-xs font-semibold disabled:opacity-50"
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
                    <span className="font-bold text-blue-800 dark:text-sky-400">{n.asset}</span>
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
          <section className="flex flex-col h-[calc(100vh-12rem)]">
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {messages.map((m, idx) => (
                <div
                  key={idx}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-[#0A1628] text-white border border-blue-500/30'
                        : 'bg-white dark:bg-[#131823] border border-slate-200/70 dark:border-slate-800/80'
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {sendingChat && (
                <div className="text-xs text-slate-400 italic">Le conseiller analyse votre portefeuille...</div>
              )}
            </div>

            <form onSubmit={handleSendChat} className="mt-3 flex items-center gap-2">
              <input
                type="text"
                placeholder="Ex. Suis-je trop exposé à la tech US ?"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="flex-1 rounded-2xl px-4 py-3 text-xs bg-white dark:bg-[#131823] border border-slate-200/80 dark:border-slate-800 outline-none focus:border-blue-600"
              />
              <button
                type="submit"
                disabled={sendingChat}
                className="p-3 rounded-2xl bg-[#0A1628] text-white border border-blue-500/30 disabled:opacity-50"
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
        className="fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-[#0D111A]/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800 px-2 pt-2"
      >
        <div className="max-w-xl mx-auto grid grid-cols-4 gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('synthese')}
            className={`flex flex-col items-center py-1.5 text-[11px] font-semibold ${
              activeTab === 'synthese' ? 'text-blue-900 dark:text-sky-400' : 'text-slate-400'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span>Synthèse</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('portefeuille')}
            className={`flex flex-col items-center py-1.5 text-[11px] font-semibold ${
              activeTab === 'portefeuille' ? 'text-blue-900 dark:text-sky-400' : 'text-slate-400'
            }`}
          >
            <PieChart className="w-5 h-5" />
            <span>Portefeuille</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('actus')}
            className={`flex flex-col items-center py-1.5 text-[11px] font-semibold ${
              activeTab === 'actus' ? 'text-blue-900 dark:text-sky-400' : 'text-slate-400'
            }`}
          >
            <Newspaper className="w-5 h-5" />
            <span>Actus IA</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('conseiller')}
            className={`flex flex-col items-center py-1.5 text-[11px] font-semibold ${
              activeTab === 'conseiller' ? 'text-blue-900 dark:text-sky-400' : 'text-slate-400'
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
