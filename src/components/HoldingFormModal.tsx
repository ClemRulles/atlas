'use client';

import React, { useEffect, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { AssetCategory, PortfolioHolding } from '@/types/portfolio';

interface HoldingFormModalProps {
  isOpen: boolean;
  initialHolding?: PortfolioHolding | null;
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

const INSTITUTIONS = ['Trade Republic', 'Revolut', 'BGL', 'Banque classique', 'Autre'];

export default function HoldingFormModal({
  isOpen,
  initialHolding,
  onClose,
  onSave,
  onDelete,
}: HoldingFormModalProps) {
  const [category, setCategory] = useState<AssetCategory>('Actions');
  const [name, setName] = useState<string>('');
  const [symbol, setSymbol] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('1');
  const [buyPriceEur, setBuyPriceEur] = useState<string>('100');
  const [buyDate, setBuyDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [institution, setInstitution] = useState<string>('Trade Republic');
  const [manualCurrentPriceEur, setManualCurrentPriceEur] = useState<string>('');

  useEffect(() => {
    if (initialHolding) {
      setCategory(initialHolding.category);
      setName(initialHolding.name);
      setSymbol(initialHolding.symbol || '');
      setQuantity(String(initialHolding.quantity));
      setBuyPriceEur(String(initialHolding.buyPriceEur));
      setBuyDate(initialHolding.buyDate);
      setInstitution(initialHolding.institution);
      setManualCurrentPriceEur(
        initialHolding.manualCurrentPriceEur !== undefined
          ? String(initialHolding.manualCurrentPriceEur)
          : ''
      );
    } else {
      setCategory('Actions');
      setName('');
      setSymbol('');
      setQuantity('1');
      setBuyPriceEur('100');
      setBuyDate(new Date().toISOString().slice(0, 10));
      setInstitution('Trade Republic');
      setManualCurrentPriceEur('');
    }
  }, [initialHolding, isOpen]);

  if (!isOpen) return null;

  const handleCategoryChange = (nextCat: AssetCategory) => {
    setCategory(nextCat);
    if (nextCat === 'Cash') {
      setSymbol('CASH');
      setQuantity('1');
    }
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
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#131823] text-slate-900 dark:text-white p-5 pb-8 shadow-2xl border border-slate-200/80 dark:border-slate-800">
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
                    className={`px-3 py-2.5 rounded-xl text-xs font-semibold text-left border transition ${
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

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Nom ou libellé
            </label>
            <input
              type="text"
              required
              placeholder={
                category === 'Cash'
                  ? 'Ex. Compte épargne / Liquidités EUR'
                  : category === 'Fonds'
                  ? 'Ex. Fonds BNP / Amundi'
                  : 'Ex. Apple, NVIDIA, MSCI World, Bitcoin...'
              }
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-[#0D111A] border border-slate-200 dark:border-slate-800 outline-none focus:border-blue-500"
            />
          </div>

          {category !== 'Cash' && (
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                {category === 'Fonds'
                  ? 'Code ISIN ou Ticker (optionnel)'
                  : category === 'Crypto'
                  ? 'Symbole Yahoo (ex. BTC-EUR, ETH-EUR)'
                  : category === 'Or / Matières premières'
                  ? 'Ticker (ex. GC=F, GLD, XAUUSD=X)'
                  : 'Ticker boursier (ex. AAPL, NVDA, CW8.PA)'}
              </label>
              <input
                type="text"
                placeholder={
                  category === 'Fonds'
                    ? 'Ex. LU1681043599 (laisser vide si non coté)'
                    : 'Ex. AAPL'
                }
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-[#0D111A] border border-slate-200 dark:border-slate-800 outline-none focus:border-blue-500 uppercase"
              />
            </div>
          )}

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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Quantité détenue
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-[#0D111A] border border-slate-200 dark:border-slate-800 outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Prix d’achat unitaire (€)
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={buyPriceEur}
                  onChange={(e) => setBuyPriceEur(e.target.value)}
                  className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-[#0D111A] border border-slate-200 dark:border-slate-800 outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}

          {category !== 'Cash' && (
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Valeur actuelle unitaire en € (optionnel — utilisé si Yahoo ne trouve pas le code)
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Date d’achat
              </label>
              <input
                type="date"
                required
                value={buyDate}
                onChange={(e) => setBuyDate(e.target.value)}
                className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-[#0D111A] border border-slate-200 dark:border-slate-800 outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Véhicule / Établissement
              </label>
              <select
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-[#0D111A] border border-slate-200 dark:border-slate-800 outline-none focus:border-blue-500"
              >
                {INSTITUTIONS.map((inst) => (
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
