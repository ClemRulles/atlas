'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles, Trash2, X } from 'lucide-react';
import { DEFAULT_INSTITUTIONS } from '@/data/initialPortfolio';
import { AssetCategory, AssetCurrency, PortfolioHolding } from '@/types/portfolio';

interface SearchSuggestion {
  symbol: string;
  name: string;
  category: AssetCategory;
  currency: AssetCurrency;
  exchange?: string;
}

interface HoldingFormModalProps {
  isOpen: boolean;
  initialHolding?: PortfolioHolding | null;
  institutions?: string[];
  onClose: () => void;
  onSave: (holding: PortfolioHolding) => void;
  onDelete?: (id: string) => void;
}

const CATEGORIES: AssetCategory[] = [
  'Actions',
  'ETF',
  'Fonds',
  'Crypto',
  'Cash',
  'Or / Matières premières',
];

export default function HoldingFormModal({
  isOpen,
  initialHolding,
  institutions = DEFAULT_INSTITUTIONS,
  onClose,
  onSave,
  onDelete,
}: HoldingFormModalProps) {
  const [category, setCategory] = useState<AssetCategory>('Actions');
  const [name, setName] = useState<string>('');
  const [symbol, setSymbol] = useState<string>('');
  const [currency, setCurrency] = useState<AssetCurrency>('EUR');
  const [quantity, setQuantity] = useState<string>('1');
  const [buyPriceEur, setBuyPriceEur] = useState<string>('100');
  const [buyDate, setBuyDate] = useState<string>('2026-11-22');
  const [institution, setInstitution] = useState<string>(institutions[0] || 'Trade Republic');
  const [manualCurrentPriceEur, setManualCurrentPriceEur] = useState<string>('');
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [searching, setSearching] = useState<boolean>(false);

  const availableInstitutions = useMemo(() => {
    const base = institutions.length > 0 ? institutions : DEFAULT_INSTITUTIONS;
    if (initialHolding?.institution && !base.includes(initialHolding.institution)) {
      return [initialHolding.institution, ...base];
    }
    return base;
  }, [institutions, initialHolding]);

  useEffect(() => {
    if (initialHolding) {
      setCategory(initialHolding.category);
      setName(initialHolding.name);
      setSymbol(initialHolding.symbol || '');
      setCurrency(initialHolding.currency || 'EUR');
      setQuantity(String(initialHolding.quantity));
      setBuyPriceEur(String(initialHolding.buyPriceEur));
      setBuyDate(initialHolding.buyDate);
      setInstitution(initialHolding.institution);
      setManualCurrentPriceEur(
        initialHolding.manualCurrentPriceEur !== undefined
          ? String(initialHolding.manualCurrentPriceEur)
          : ''
      );
      setShowSuggestions(false);
      setSuggestions([]);
    } else {
      setCategory('Actions');
      setName('');
      setSymbol('');
      setCurrency('EUR');
      setQuantity('1');
      setBuyPriceEur('100');
      setBuyDate(new Date().toISOString().slice(0, 10));
      setInstitution(availableInstitutions[0] || 'Trade Republic');
      setManualCurrentPriceEur('');
      setShowSuggestions(false);
      setSuggestions([]);
    }
  }, [initialHolding, isOpen, availableInstitutions]);

  useEffect(() => {
    if (!isOpen || category === 'Cash') return;
    const query = symbol.trim();
    if (query.length < 1) {
      setSuggestions([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/market/search?q=${encodeURIComponent(query)}`);
        if (!cancelled && res.ok) {
          const data = await res.json();
          setSuggestions(Array.isArray(data.results) ? data.results : []);
        }
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [symbol, category, isOpen]);

  if (!isOpen) return null;

  const handleCategoryChange = (nextCat: AssetCategory) => {
    setCategory(nextCat);
    if (nextCat === 'Cash') {
      setSymbol('');
      setQuantity('1');
      setCurrency('EUR');
      setShowSuggestions(false);
      setSuggestions([]);
    }
  };

  const handleSelectSuggestion = (item: SearchSuggestion) => {
    setSymbol(item.symbol);
    setName(item.name);
    setCategory(item.category);
    setCurrency(item.currency);
    setShowSuggestions(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedQty =
      category === 'Cash' ? 1 : Math.max(0.000001, parseFloat(quantity) || 1);
    const parsedBuy = Math.max(0, parseFloat(buyPriceEur) || 0);
    const parsedManual =
      manualCurrentPriceEur.trim().length > 0
        ? Math.max(0, parseFloat(manualCurrentPriceEur) || 0)
        : undefined;

    onSave({
      id: initialHolding?.id || `holding-${Date.now()}`,
      name:
        name.trim() ||
        (symbol.trim() ? symbol.trim().toUpperCase() : `${category} (${institution})`),
      category,
      symbol: category === 'Cash' ? undefined : symbol.trim().toUpperCase() || undefined,
      currency,
      quantity: parsedQty,
      buyPriceEur: category === 'Cash' ? parseFloat(quantity) || parsedBuy : parsedBuy,
      buyDate,
      institution,
      manualCurrentPriceEur: parsedManual,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs">
      <div
        style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
        className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#131823] text-slate-900 dark:text-white p-5 shadow-2xl border border-slate-200/80 dark:border-slate-800"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">
            {initialHolding ? 'Modifier la ligne' : 'Nouvel investissement'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              1. Catégorie d’actif
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {CATEGORIES.map((cat) => {
                const active = category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => handleCategoryChange(cat)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold text-left border transition ${
                      active
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-slate-50 dark:bg-[#0D111A] border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          {category !== 'Cash' && (
            <div className="relative">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Ticker, nom d’entreprise ou ISIN (recherche mondiale)
                </label>
                {searching && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />}
              </div>
              <input
                type="text"
                placeholder="Tapez VISA, LVMH, AAPL, IWDA, Bitcoin..."
                value={symbol}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 180)}
                onChange={(e) => {
                  setSymbol(e.target.value);
                  setShowSuggestions(true);
                }}
                className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-[#0D111A] border border-slate-200 dark:border-slate-800 outline-none focus:border-blue-500"
              />

              {showSuggestions && suggestions.length > 0 && (
                <div className="mt-1.5 rounded-2xl bg-white dark:bg-[#0D111A] border border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                  {suggestions.map((sug) => (
                    <button
                      key={`${sug.symbol}-${sug.exchange || ''}`}
                      type="button"
                      onMouseDown={() => handleSelectSuggestion(sug)}
                      className="w-full px-3.5 py-2.5 text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/70 transition"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-blue-700 dark:text-sky-400">
                            {sug.symbol}
                          </span>
                          <span className="text-xs font-medium truncate">{sug.name}</span>
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {sug.category}
                          {sug.exchange ? ` • ${sug.exchange}` : ''}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                        {sug.currency}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Libellé / Nom de l’actif
              </label>
              {category !== 'Cash' && (
                <span className="inline-flex items-center gap-1 text-[10px] text-sky-500">
                  <Sparkles className="w-3 h-3" /> Auto-rempli via recherche
                </span>
              )}
            </div>
            <input
              type="text"
              required
              placeholder={
                category === 'Cash'
                  ? 'Ex. Compte épargne / Liquidités EUR'
                  : 'Rempli automatiquement ou saisissez le nom'
              }
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-[#0D111A] border border-slate-200 dark:border-slate-800 outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
              Devise de cotation / référence
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {(['EUR', 'USD'] as AssetCurrency[]).map((cur) => {
                const active = currency === cur;
                return (
                  <button
                    key={cur}
                    type="button"
                    onClick={() => setCurrency(cur)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                      active
                        ? 'bg-[#0A1628] text-white border-blue-500/40'
                        : 'bg-slate-50 dark:bg-[#0D111A] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {cur === 'EUR' ? 'Euro (€ / EUR)' : 'Dollar ($ / USD)'}
                  </button>
                );
              })}
            </div>
          </div>

          {category === 'Cash' ? (
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Montant disponible (€)
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-[#0D111A] border border-slate-200 dark:border-slate-800 outline-none focus:border-blue-500"
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="min-w-0">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Quantité détenue
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full min-w-0 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-[#0D111A] border border-slate-200 dark:border-slate-800 outline-none focus:border-blue-500"
                />
              </div>
              <div className="min-w-0">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Prix d’achat unitaire (€)
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={buyPriceEur}
                  onChange={(e) => setBuyPriceEur(e.target.value)}
                  className="w-full min-w-0 rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-[#0D111A] border border-slate-200 dark:border-slate-800 outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}

          {category !== 'Cash' && (
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Valeur actuelle unitaire en € (secours si absent sur Twelve Data & Yahoo)
              </label>
              <input
                type="number"
                step="any"
                placeholder="Laisser vide pour mise à jour auto"
                value={manualCurrentPriceEur}
                onChange={(e) => setManualCurrentPriceEur(e.target.value)}
                className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-[#0D111A] border border-slate-200 dark:border-slate-800 outline-none focus:border-blue-500"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="min-w-0">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Date d’achat
              </label>
              <input
                type="date"
                required
                value={buyDate}
                onChange={(e) => setBuyDate(e.target.value)}
                className="w-full min-w-0 max-w-full appearance-none rounded-xl px-3 py-2.5 text-sm bg-slate-50 dark:bg-[#0D111A] border border-slate-200 dark:border-slate-800 outline-none focus:border-blue-500"
              />
            </div>

            <div className="min-w-0">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Véhicule / Établissement
              </label>
              <select
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                className="w-full min-w-0 rounded-xl px-3 py-2.5 text-sm bg-slate-50 dark:bg-[#0D111A] border border-slate-200 dark:border-slate-800 outline-none focus:border-blue-500"
              >
                {availableInstitutions.map((inst) => (
                  <option key={inst} value={inst}>
                    {inst}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            {initialHolding && onDelete && (
              <button
                type="button"
                onClick={() => {
                  onDelete(initialHolding.id);
                  onClose();
                }}
                className="p-3 rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition"
                aria-label="Supprimer"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
            <button
              type="submit"
              className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition"
            >
              Enregistrer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
