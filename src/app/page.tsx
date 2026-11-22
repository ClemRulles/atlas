'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bot,
  Lock,
  Newspaper,
  Pencil,
  PieChart,
  Plus,
  RefreshCw,
  Send,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import LockScreen from '@/components/LockScreen';
import InteractiveChart from '@/components/InteractiveChart';
import DonutAllocation from '@/components/DonutAllocation';
import HoldingFormModal from '@/components/HoldingFormModal';
import { INITIAL_HOLDINGS } from '@/data/initialPortfolio';
import {
  buildPortfolioSeries,
  enrichHoldings,
  fetchQuotesForHoldings,
} from '@/lib/marketClient';
import {
  AssetCategory,
  MarketQuoteResult,
  PortfolioHolding,
  TimeframeKey,
} from '@/types/portfolio';

const PORTFOLIO_STORAGE_KEY = 'wealthview_holdings_v1';
const TIMEFRAMES: TimeframeKey[] = ['1J', '1S', '1M', 'YTD', 'LTM', 'Tout'];

type TabKey = 'synthesis' | 'portfolio' | 'news' | 'advisor';

export default function WealthViewPage() {
  const [unlocked, setUnlocked] = useState<boolean>(false);
  const [clientNow, setClientNow] = useState<Date>(() => new Date("2026-11-22T00:00:00Z"));

  useEffect(() => {
    setClientNow(new Date());
  }, []);
  const [activeTab, setActiveTab] = useState<TabKey>('synthesis');
  const [timeframe, setTimeframe] = useState<TimeframeKey>('Tout');
  const [holdings, setHoldings] = useState<PortfolioHolding[]>(INITIAL_HOLDINGS);
  const [quotes, setQuotes] = useState<Record<string, MarketQuoteResult>>({});
  const [loadingQuotes, setLoadingQuotes] = useState<boolean>(false);
  const [hoveredPoint, setHoveredPoint] = useState<{ date: string; valueEur: number } | null>(
    null
  );

  // Édition / Ajout
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingHolding, setEditingHolding] = useState<PortfolioHolding | null>(null);

  // Page 3 : Actus IA
  const [newsText, setNewsText] = useState<string>('');
  const [newsError, setNewsError] = useState<string>('');
  const [loadingNews, setLoadingNews] = useState<boolean>(false);

  // Page 4 : Conseiller IA
  const [chatInput, setChatInput] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<
    { role: 'user' | 'assistant'; content: string }[]
  >([
    {
      role: 'assistant',
      content:
        'Bonjour ! J’ai accès à la répartition de votre portefeuille. Posez-moi vos questions sur votre diversification, vos positions ou une future allocation.',
    },
  ]);
  const [advisorError, setAdvisorError] = useState<string>('');
  const [loadingAdvisor, setLoadingAdvisor] = useState<boolean>(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PORTFOLIO_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setHoldings(parsed);
        }
      }
    } catch {
      // Garde les positions initiales
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PORTFOLIO_STORAGE_KEY, JSON.stringify(holdings));
    } catch {
      // Ignoré
    }
  }, [holdings]);

  const refreshQuotes = useCallback(
    async (items: PortfolioHolding[], tf: TimeframeKey) => {
      setLoadingQuotes(true);
      try {
        const q = await fetchQuotesForHoldings(items, tf, clientNow);
        setQuotes(q);
      } finally {
        setLoadingQuotes(false);
      }
    },
    []
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
    () => enriched.reduce((sum, item) => sum + item.currentValueEur, 0),
    [enriched]
  );

  const displayedValueEur = hoveredPoint ? hoveredPoint.valueEur : totalValueEur;

  const periodStartValueEur = series.length > 0 ? series[0].valueEur : totalValueEur;
  const periodDeltaEur = displayedValueEur - periodStartValueEur;
  const periodDeltaPct =
    periodStartValueEur > 0 ? (periodDeltaEur / periodStartValueEur) * 100 : 0;

  const groupedByCategory = useMemo(() => {
    const map = new Map<AssetCategory, typeof enriched>();
    for (const item of enriched) {
      const list = map.get(item.category) || [];
      list.push(item);
      map.set(item.category, list);
    }
    return Array.from(map.entries());
  }, [enriched]);

  const categorySlices = useMemo(() => {
    return groupedByCategory.map(([label, items]) => ({
      label,
      valueEur: items.reduce((s, x) => s + x.currentValueEur, 0),
    }));
  }, [groupedByCategory]);

  const institutionBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of enriched) {
      map.set(item.institution, (map.get(item.institution) || 0) + item.currentValueEur);
    }
    return Array.from(map.entries())
      .map(([institution, valueEur]) => ({ institution, valueEur }))
      .sort((a, b) => b.valueEur - a.valueEur);
  }, [enriched]);

  const topAndFlop = useMemo(() => {
    if (enriched.length === 0) return { best: null, worst: null };
    const sorted = [...enriched].sort((a, b) => b.pnlPercent - a.pnlPercent);
    return { best: sorted[0], worst: sorted[sorted.length - 1] };
  }, [enriched]);

  const portfolioSummaryText = useMemo(() => {
    const lines = enriched.map(
      (h) =>
        `- ${h.name} (${h.category}${h.symbol ? `, ${h.symbol}` : ''}) sur ${
          h.institution
        } : valeur actuelle ${h.currentValueEur.toFixed(2)} €, PnL ${
          h.pnlEur >= 0 ? '+' : ''
        }${h.pnlEur.toFixed(2)} € (${h.pnlPercent.toFixed(1)}%), acheté le ${h.buyDate}`
    );
    return `Valeur totale : ${totalValueEur.toFixed(2)} €\nPositions :\n${lines.join('\n')}`;
  }, [enriched, totalValueEur]);

  const handleSaveHolding = (item: PortfolioHolding) => {
    setHoldings((prev) => {
      const exists = prev.some((p) => p.id === item.id);
      if (exists) {
        return prev.map((p) => (p.id === item.id ? item : p));
      }
      return [...prev, item];
    });
  };

  const handleDeleteHolding = (id: string) => {
    setHoldings((prev) => prev.filter((p) => p.id !== id));
  };

  const generateNewsDigest = async () => {
    setLoadingNews(true);
    setNewsError('');
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'news',
          portfolioSummary: portfolioSummaryText,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setNewsError(data.error || "Erreur lors de la génération de l'actualité.");
      } else {
        setNewsText(data.text || '');
      }
    } catch {
      setNewsError('Impossible de joindre le service IA.');
    } finally {
      setLoadingNews(false);
    }
  };

  const sendAdvisorPrompt = async () => {
    const trimmed = chatInput.trim();
    if (!trimmed || loadingAdvisor) return;

    setChatInput('');
    setAdvisorError('');
    setChatMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    setLoadingAdvisor(true);

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'advisor',
          portfolioSummary: portfolioSummaryText,
          prompt: trimmed,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setAdvisorError(data.error || "Erreur de l'agent IA.");
      } else {
        setChatMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.text || '' },
        ]);
      }
    } catch {
      setAdvisorError('Impossible de joindre le conseiller IA.');
    } finally {
      setLoadingAdvisor(false);
    }
  };

  if (!unlocked) {
    return <LockScreen onUnlock={() => setUnlocked(true)} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#090C12] text-slate-900 dark:text-white pb-28">
      {/* Barre supérieure iOS */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-slate-50/85 dark:bg-[#090C12]/85 border-b border-slate-200/70 dark:border-slate-800/80 px-4 py-3 flex items-center justify-between">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            WealthView
          </span>
          <h1 className="text-base font-bold leading-tight">
            {activeTab === 'synthesis' && 'Synthèse'}
            {activeTab === 'portfolio' && 'Portefeuille & Stats'}
            {activeTab === 'news' && 'Actus IA'}
            {activeTab === 'advisor' && 'Conseiller IA'}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refreshQuotes(holdings, timeframe)}
            className="p-2 rounded-full bg-white dark:bg-[#131823] border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 active:scale-95 transition"
            aria-label="Actualiser les cours"
          >
            <RefreshCw className={`w-4 h-4 ${loadingQuotes ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingHolding(null);
              setModalOpen(true);
            }}
            className="px-3 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1 active:scale-95 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Ajouter</span>
          </button>

          <button
            type="button"
            onClick={() => setUnlocked(false)}
            className="p-2 rounded-full bg-white dark:bg-[#131823] border border-slate-200 dark:border-slate-800 text-slate-500 active:scale-95 transition"
            aria-label="Verrouiller"
          >
            <Lock className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Contenu principal */}
      <main className="max-w-2xl mx-auto px-4 pt-4 space-y-5">
        {/* ONGLET 1 : SYNTHÈSE */}
        {activeTab === 'synthesis' && (
          <>
            <section className="rounded-3xl bg-white dark:bg-[#131823] border border-slate-200/70 dark:border-slate-800/80 p-4 shadow-xs">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {hoveredPoint ? `Valeur au ${hoveredPoint.date}` : 'Valeur totale du portefeuille'}
              </p>
              <div className="text-3xl font-extrabold tracking-tight mt-1">
                {displayedValueEur.toLocaleString('fr-FR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                €
              </div>

              <div
                className={`inline-flex items-center gap-1 text-xs font-semibold mt-1 ${
                  periodDeltaEur >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {periodDeltaEur >= 0 ? (
                  <TrendingUp className="w-3.5 h-3.5" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5" />
                )}
                <span>
                  {periodDeltaEur >= 0 ? '+' : ''}
                  {periodDeltaEur.toLocaleString('fr-FR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{' '}
                  € ({periodDeltaPct >= 0 ? '+' : ''}
                  {periodDeltaPct.toFixed(2)} %) · {timeframe}
                </span>
              </div>

              <div className="mt-3">
                <InteractiveChart data={series} onHoverPoint={setHoveredPoint} />
              </div>

              {/* Sélecteur de période : 1J, 1S, 1M, YTD, LTM, Tout */}
              <div className="grid grid-cols-6 gap-1.5 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                {TIMEFRAMES.map((tf) => {
                  const active = timeframe === tf;
                  return (
                    <button
                      key={tf}
                      type="button"
                      onClick={() => setTimeframe(tf)}
                      className={`py-1.5 rounded-lg text-xs font-bold transition ${
                        active
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {tf}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Liste par catégorie avec perf en € et % sur la période choisie */}
            <section className="space-y-4">
              {groupedByCategory.map(([category, items]) => {
                const catVal = items.reduce((s, i) => s + i.currentValueEur, 0);
                const catDeltaEur = items.reduce((s, i) => s + i.periodChangeEur, 0);
                const catBase = catVal - catDeltaEur;
                const catDeltaPct = catBase > 0 ? (catDeltaEur / catBase) * 100 : 0;

                return (
                  <div
                    key={category}
                    className="rounded-2xl bg-white dark:bg-[#131823] border border-slate-200/70 dark:border-slate-800/80 overflow-hidden"
                  >
                    <div className="px-4 py-3 bg-slate-50/70 dark:bg-[#0E131C] border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                        {category}
                      </span>
                      <div className="text-right">
                        <span className="text-xs font-bold">
                          {catVal.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €
                        </span>
                        <span
                          className={`ml-2 text-xs font-semibold ${
                            catDeltaEur >= 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          ({catDeltaEur >= 0 ? '+' : ''}
                          {catDeltaPct.toFixed(2)}%)
                        </span>
                      </div>
                    </div>

                    <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {items.map((item) => (
                        <div
                          key={item.id}
                          className="px-4 py-3 flex items-center justify-between"
                        >
                          <div>
                            <div className="text-sm font-semibold">{item.name}</div>
                            <div className="text-[11px] text-slate-400">
                              {item.symbol ? `${item.symbol} · ` : ''}
                              {item.institution}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-bold">
                              {item.currentValueEur.toLocaleString('fr-FR', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}{' '}
                              €
                            </div>
                            <div
                              className={`text-xs font-semibold ${
                                item.periodChangeEur >= 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              {item.periodChangeEur >= 0 ? '+' : ''}
                              {item.periodChangeEur.toFixed(2)} € (
                              {item.periodChangePercent >= 0 ? '+' : ''}
                              {item.periodChangePercent.toFixed(2)}%)
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>
          </>
        )}

        {/* ONGLET 2 : PORTEFEUILLE & STATS */}
        {activeTab === 'portfolio' && (
          <>
            <section className="rounded-3xl bg-white dark:bg-[#131823] border border-slate-200/70 dark:border-slate-800/80 p-4">
              <h2 className="text-sm font-bold mb-3">Répartition par catégorie</h2>
              <DonutAllocation slices={categorySlices} />
            </section>

            {/* Statistiques complémentaires : Établissements + Top/Flop */}
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white dark:bg-[#131823] border border-slate-200/70 dark:border-slate-800/80 p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">
                  Par véhicule / banque
                </h3>
                <div className="space-y-2">
                  {institutionBreakdown.map((b) => {
                    const pct = totalValueEur > 0 ? (b.valueEur / totalValueEur) * 100 : 0;
                    return (
                      <div key={b.institution} className="flex items-center justify-between text-xs">
                        <span className="font-semibold">{b.institution}</span>
                        <span className="text-slate-500 dark:text-slate-400">
                          {b.valueEur.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} € (
                          {pct.toFixed(0)}%)
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl bg-white dark:bg-[#131823] border border-slate-200/70 dark:border-slate-800/80 p-4 flex flex-col justify-between space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Meilleure / Moins bonne ligne
                </h3>
                {topAndFlop.best && (
                  <div className="text-xs">
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                      Top : {topAndFlop.best.name} (
                      {topAndFlop.best.pnlPercent >= 0 ? '+' : ''}
                      {topAndFlop.best.pnlPercent.toFixed(1)}%)
                    </span>
                  </div>
                )}
                {topAndFlop.worst && (
                  <div className="text-xs">
                    <span className="text-rose-600 dark:text-rose-400 font-bold">
                      À surveiller : {topAndFlop.worst.name} (
                      {topAndFlop.worst.pnlPercent >= 0 ? '+' : ''}
                      {topAndFlop.worst.pnlPercent.toFixed(1)}%)
                    </span>
                  </div>
                )}
              </div>
            </section>

            {/* Liste détaillée modifiable avec bouton crayon */}
            <section className="space-y-4">
              {groupedByCategory.map(([category, items]) => (
                <div
                  key={category}
                  className="rounded-2xl bg-white dark:bg-[#131823] border border-slate-200/70 dark:border-slate-800/80 overflow-hidden"
                >
                  <div className="px-4 py-2.5 bg-slate-50/70 dark:bg-[#0E131C] border-b border-slate-100 dark:border-slate-800/80 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {category}
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="px-4 py-3 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">{item.name}</div>
                          <div className="text-[11px] text-slate-400">
                            {item.symbol ? `Code : ${item.symbol} · ` : ''}
                            Achat : {item.buyPriceEur.toFixed(2)} € le {item.buyDate} ·{' '}
                            {item.institution}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <div className="text-sm font-bold">
                              {item.currentValueEur.toLocaleString('fr-FR', {
                                maximumFractionDigits: 2,
                              })}{' '}
                              €
                            </div>
                            <div
                              className={`text-[11px] font-semibold ${
                                item.pnlEur >= 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              {item.pnlEur >= 0 ? '+' : ''}
                              {item.pnlEur.toFixed(0)} € ({item.pnlPercent.toFixed(1)}%)
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingHolding(item);
                              setModalOpen(true);
                            }}
                            aria-label="Modifier la ligne"
                            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-blue-600 hover:text-white transition"
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

        {/* ONGLET 3 : ACTUS IA */}
        {activeTab === 'news' && (
          <section className="rounded-3xl bg-white dark:bg-[#131823] border border-slate-200/70 dark:border-slate-800/80 p-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold">Newsletter personnalisée</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Synthèse IA des actualités impactant vos positions actuelles.
                </p>
              </div>
              <button
                type="button"
                onClick={generateNewsDigest}
                disabled={loadingNews}
                className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold transition"
              >
                {loadingNews ? 'Analyse...' : 'Générer'}
              </button>
            </div>

            {newsError && (
              <div className="rounded-2xl p-3.5 bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs leading-relaxed">
                {newsError}
              </div>
            )}

            {newsText ? (
              <div className="whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                {newsText}
              </div>
            ) : (
              !newsError && (
                <p className="text-xs text-slate-400 py-6 text-center">
                  Appuyez sur « Générer » pour produire votre revue d’actualités ciblée.
                </p>
              )
            )}
          </section>
        )}

        {/* ONGLET 4 : CONSEILLER IA */}
        {activeTab === 'advisor' && (
          <section className="rounded-3xl bg-white dark:bg-[#131823] border border-slate-200/70 dark:border-slate-800/80 p-4 flex flex-col space-y-3">
            <div className="space-y-2.5 max-h-[55vh] overflow-y-auto pr-1">
              {chatMessages.map((m, i) => (
                <div
                  key={i}
                  className={`rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-line leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-blue-600 text-white ml-8'
                      : 'bg-slate-100 dark:bg-[#0D111A] text-slate-800 dark:text-slate-200 mr-6'
                  }`}
                >
                  {m.content}
                </div>
              ))}
              {loadingAdvisor && (
                <div className="text-xs text-slate-400 px-2">Réflexion de l’agent IA...</div>
              )}
              {advisorError && (
                <div className="rounded-2xl p-3 bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs">
                  {advisorError}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <input
                type="text"
                placeholder="Posez une question sur votre stratégie ou budget..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') sendAdvisorPrompt();
                }}
                className="flex-1 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-[#0D111A] border border-slate-200 dark:border-slate-800 outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={sendAdvisorPrompt}
                disabled={loadingAdvisor}
                aria-label="Envoyer"
                className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </section>
        )}
      </main>

      {/* Barre de navigation fixe tout en bas (style app iOS) */}
      <nav
        aria-label="Navigation principale"
        className="fixed bottom-0 inset-x-0 z-40 backdrop-blur-xl bg-white/90 dark:bg-[#0D111A]/90 border-t border-slate-200/80 dark:border-slate-800/80 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="max-w-2xl mx-auto grid grid-cols-4 h-16">
          <button
            type="button"
            onClick={() => setActiveTab('synthesis')}
            className={`flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition ${
              activeTab === 'synthesis'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-400'
            }`}
          >
            <Activity className="w-5 h-5" />
            <span>Synthèse</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('portfolio')}
            className={`flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition ${
              activeTab === 'portfolio'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-400'
            }`}
          >
            <PieChart className="w-5 h-5" />
            <span>Portefeuille</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('news')}
            className={`flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition ${
              activeTab === 'news'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-400'
            }`}
          >
            <Newspaper className="w-5 h-5" />
            <span>Actus IA</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('advisor')}
            className={`flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition ${
              activeTab === 'advisor'
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
        onClose={() => {
          setModalOpen(false);
          setEditingHolding(null);
        }}
        onSave={handleSaveHolding}
        onDelete={handleDeleteHolding}
      />
    </div>
  );
}
