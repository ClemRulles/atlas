'use client';

import React, { useState } from 'react';
import { Building2, CheckCircle2, KeyRound, Plus, ScanFace, Trash2, X } from 'lucide-react';
import { DEFAULT_INSTITUTIONS } from '@/data/initialPortfolio';
import { BIOMETRIC_CRED_KEY, PIN_STORAGE_KEY, hashPin } from './LockScreen';

interface SettingsModalProps {
  isOpen: boolean;
  institutions: string[];
  onUpdateInstitutions: (next: string[]) => void;
  onClose: () => void;
}

export default function SettingsModal({
  isOpen,
  institutions,
  onUpdateInstitutions,
  onClose,
}: SettingsModalProps) {
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [newInstitution, setNewInstitution] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  if (!isOpen) return null;

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);

    if (!/^\d{4}$/.test(newPin)) {
      setStatusMsg({ type: 'err', text: 'Le nouveau code doit contenir exactement 4 chiffres.' });
      return;
    }

    if (newPin !== confirmPin) {
      setStatusMsg({ type: 'err', text: 'La confirmation ne correspond pas au nouveau code.' });
      return;
    }

    const savedHash = localStorage.getItem(PIN_STORAGE_KEY);
    if (savedHash) {
      const currentHash = await hashPin(currentPin);
      if (currentHash !== savedHash) {
        setStatusMsg({ type: 'err', text: 'Le code PIN actuel est incorrect.' });
        return;
      }
    }

    const nextHash = await hashPin(newPin);
    localStorage.setItem(PIN_STORAGE_KEY, nextHash);
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setStatusMsg({ type: 'ok', text: 'Votre code PIN a bien été mis à jour.' });
  };

  const handleResetFaceId = () => {
    localStorage.removeItem(BIOMETRIC_CRED_KEY);
    setStatusMsg({
      type: 'ok',
      text: 'Face ID réinitialisé. Vous pourrez le réactiver au prochain déverrouillage.',
    });
  };

  const handleAddInstitution = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newInstitution.trim();
    if (!cleaned) return;
    if (institutions.some((i) => i.toLowerCase() === cleaned.toLowerCase())) {
      setStatusMsg({ type: 'err', text: 'Cet établissement est déjà dans la liste.' });
      return;
    }
    onUpdateInstitutions([...institutions, cleaned]);
    setNewInstitution('');
    setStatusMsg({ type: 'ok', text: `« ${cleaned} » ajouté au menu déroulant.` });
  };

  const handleRemoveInstitution = (name: string) => {
    if (institutions.length <= 1) return;
    onUpdateInstitutions(institutions.filter((i) => i !== name));
  };

  const handleResetInstitutions = () => {
    onUpdateInstitutions(DEFAULT_INSTITUTIONS);
    setStatusMsg({ type: 'ok', text: 'Liste des établissements restaurée par défaut.' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs">
      <div
        style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#131823] text-slate-900 dark:text-white p-5 shadow-2xl border border-slate-200/80 dark:border-slate-800 space-y-5"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Paramètres & Sécurité</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {statusMsg && (
          <div
            className={`flex items-center gap-2 text-xs p-2.5 rounded-xl ${
              statusMsg.type === 'ok'
                ? 'bg-emerald-500/10 text-emerald-500'
                : 'bg-rose-500/10 text-rose-500'
            }`}
          >
            {statusMsg.type === 'ok' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            <span>{statusMsg.text}</span>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <Building2 className="w-3.5 h-3.5" />
              <span>Véhicules / Établissements</span>
            </div>
            <button
              type="button"
              onClick={handleResetInstitutions}
              className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              Réinitialiser
            </button>
          </div>

          <form onSubmit={handleAddInstitution} className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Ajouter (ex. Bolero, Keytrade, PEA...)"
              value={newInstitution}
              onChange={(e) => setNewInstitution(e.target.value)}
              className="flex-1 rounded-xl px-3.5 py-2 text-xs bg-slate-50 dark:bg-[#0D111A] border border-slate-200 dark:border-slate-800 outline-none focus:border-blue-600"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-[#0A1628] text-white border border-blue-500/30 text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5" /> Ajouter
            </button>
          </form>

          <div className="flex flex-wrap gap-1.5">
            {institutions.map((inst) => (
              <span
                key={inst}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium bg-slate-100 dark:bg-[#0D111A] border border-slate-200/80 dark:border-slate-800"
              >
                <span>{inst}</span>
                {institutions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveInstitution(inst)}
                    aria-label={`Supprimer ${inst}`}
                    className="text-slate-400 hover:text-rose-500"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>

        <form onSubmit={handleChangePin} className="pt-4 border-t border-slate-200/70 dark:border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <KeyRound className="w-3.5 h-3.5" />
            <span>Modifier le code PIN (4 chiffres)</span>
          </div>

          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Code PIN actuel
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="••••"
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="w-full rounded-xl px-3.5 py-2.5 text-sm tracking-widest bg-slate-50 dark:bg-[#0D111A] border border-slate-200 dark:border-slate-800 outline-none focus:border-blue-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Nouveau PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                required
                placeholder="••••"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="w-full rounded-xl px-3.5 py-2.5 text-sm tracking-widest bg-slate-50 dark:bg-[#0D111A] border border-slate-200 dark:border-slate-800 outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Confirmer
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                required
                placeholder="••••"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="w-full rounded-xl px-3.5 py-2.5 text-sm tracking-widest bg-slate-50 dark:bg-[#0D111A] border border-slate-200 dark:border-slate-800 outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-[#0A1628] hover:bg-blue-950 text-white border border-blue-500/30 font-semibold text-sm transition"
          >
            Enregistrer le nouveau code PIN
          </button>
        </form>

        <div className="pt-4 border-t border-slate-200/70 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ScanFace className="w-5 h-5 text-sky-500" />
            <div>
              <p className="text-xs font-semibold">Reconnaissance Face ID</p>
              <p className="text-[11px] text-slate-400">Réinitialiser le jeton biométrique</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleResetFaceId}
            className="px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
          >
            Réinitialiser
          </button>
        </div>
      </div>
    </div>
  );
}
