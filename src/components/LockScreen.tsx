'use client';

import React, { useEffect, useState } from 'react';
import { Delete, Lock, ScanFace, ShieldCheck } from 'lucide-react';

interface LockScreenProps {
  onUnlock: () => void;
}

export const PIN_STORAGE_KEY = 'wealthview_pin_hash_v1';
export const BIOMETRIC_CRED_KEY = 'wealthview_webauthn_id_v1';

export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`wealthview:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export default function LockScreen({ onUnlock }: LockScreenProps) {
  const [hasSavedPin, setHasSavedPin] = useState<boolean>(false);
  const [hasBiometric, setHasBiometric] = useState<boolean>(false);
  const [pin, setPin] = useState<string>('');
  const [confirmPin, setConfirmPin] = useState<string>('');
  const [step, setStep] = useState<'create' | 'confirm' | 'verify'>('verify');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const saved = localStorage.getItem(PIN_STORAGE_KEY);
    const bio = localStorage.getItem(BIOMETRIC_CRED_KEY);
    setHasBiometric(Boolean(bio));
    if (saved) {
      setHasSavedPin(true);
      setStep('verify');
    } else {
      setHasSavedPin(false);
      setStep('create');
    }
  }, []);

  const handleDigit = async (digit: string) => {
    setError('');
    if (step === 'create') {
      const next = pin + digit;
      if (next.length < 4) {
        setPin(next);
      } else {
        setConfirmPin(next);
        setPin('');
        setStep('confirm');
      }
      return;
    }

    if (step === 'confirm') {
      const next = pin + digit;
      if (next.length < 4) {
        setPin(next);
      } else {
        if (next === confirmPin) {
          const hashed = await hashPin(next);
          localStorage.setItem(PIN_STORAGE_KEY, hashed);
          setHasSavedPin(true);
          setPin('');
          onUnlock();
        } else {
          setPin('');
          setConfirmPin('');
          setStep('create');
          setError('Les codes ne correspondent pas. Recommencez.');
        }
      }
      return;
    }

    const next = pin + digit;
    if (next.length < 4) {
      setPin(next);
    } else {
      const hashed = await hashPin(next);
      const saved = localStorage.getItem(PIN_STORAGE_KEY);
      if (saved && hashed === saved) {
        setPin('');
        onUnlock();
      } else {
        setPin('');
        setError('Code PIN incorrect.');
      }
    }
  };

  const handleBackspace = () => {
    setError('');
    setPin((prev) => prev.slice(0, -1));
  };

  const handleBiometricAuth = async () => {
    setError('');
    if (typeof window === 'undefined' || !window.PublicKeyCredential) {
      setError('Face ID non disponible sur ce navigateur.');
      return;
    }

    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const existingId = localStorage.getItem(BIOMETRIC_CRED_KEY);

      if (!existingId) {
        const userId = crypto.getRandomValues(new Uint8Array(16));
        const credential = (await navigator.credentials.create({
          publicKey: {
            challenge,
            rp: { name: 'WealthView' },
            user: {
              id: userId,
              name: 'investisseur@wealthview.app',
              displayName: 'WealthView',
            },
            pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
            authenticatorSelection: {
              authenticatorAttachment: 'platform',
              userVerification: 'required',
            },
            timeout: 60000,
          },
        })) as PublicKeyCredential | null;

        if (credential) {
          const rawBytes = new Uint8Array(credential.rawId);
          const b64 = btoa(String.fromCharCode(...rawBytes));
          localStorage.setItem(BIOMETRIC_CRED_KEY, b64);
          setHasBiometric(true);
          onUnlock();
        }
      } else {
        const binaryStr = atob(existingId);
        const credIdBytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          credIdBytes[i] = binaryStr.charCodeAt(i);
        }

        const assertion = await navigator.credentials.get({
          publicKey: {
            challenge,
            allowCredentials: [
              {
                id: credIdBytes,
                type: 'public-key',
              },
            ],
            userVerification: 'required',
            timeout: 60000,
          },
        });

        if (assertion) {
          onUnlock();
        }
      }
    } catch {
      setError('Face ID annulé ou indisponible. Utilisez le code PIN.');
    }
  };

  const titleText =
    step === 'create'
      ? 'Créer votre code à 4 chiffres'
      : step === 'confirm'
      ? 'Confirmez votre code PIN'
      : 'Déverrouiller WealthView';

  return (
    <div
      style={{
        paddingTop: 'max(2.75rem, env(safe-area-inset-top))',
        paddingBottom: 'max(2rem, env(safe-area-inset-bottom))',
      }}
      className="min-h-screen flex flex-col items-center justify-between px-6 bg-slate-50 dark:bg-[#090C12] text-slate-900 dark:text-white select-none"
    >
      <div className="flex flex-col items-center text-center mt-4">
        <div className="w-14 h-14 rounded-2xl bg-[#0A1628] border border-blue-500/30 flex items-center justify-center mb-4 shadow-md">
          {hasSavedPin ? (
            <Lock className="w-7 h-7 text-sky-400" />
          ) : (
            <ShieldCheck className="w-7 h-7 text-sky-400" />
          )}
        </div>
        <h1 className="text-xl font-bold tracking-tight">{titleText}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
          {step === 'create'
            ? 'Protégez l’accès à votre patrimoine multi-comptes sur cet appareil.'
            : step === 'confirm'
            ? 'Saisissez exactement le même code à 4 chiffres.'
            : 'Entrez votre code PIN ou utilisez Face ID.'}
        </p>

        <div className="flex gap-4 mt-7">
          {[0, 1, 2, 3].map((idx) => {
            const filled = idx < pin.length;
            return (
              <span
                key={idx}
                className={`w-4 h-4 rounded-full transition-all duration-150 ${
                  filled
                    ? 'bg-blue-600 dark:bg-sky-400 scale-110'
                    : 'border-2 border-slate-300 dark:border-slate-700'
                }`}
              />
            );
          })}
        </div>

        {error && (
          <p className="text-xs font-medium text-rose-500 mt-4">{error}</p>
        )}
      </div>

      <div className="w-full max-w-xs">
        <div className="grid grid-cols-3 gap-4">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              className="h-16 rounded-2xl bg-white dark:bg-[#131823] border border-slate-200/80 dark:border-slate-800 text-2xl font-semibold active:scale-95 transition"
            >
              {digit}
            </button>
          ))}

          <button
            type="button"
            onClick={handleBiometricAuth}
            aria-label="Face ID"
            className="h-16 rounded-2xl bg-blue-950/10 dark:bg-sky-500/15 text-blue-900 dark:text-sky-400 flex flex-col items-center justify-center active:scale-95 transition"
          >
            <ScanFace className="w-6 h-6" />
            <span className="text-[10px] font-semibold mt-0.5">
              {hasBiometric ? 'Face ID' : 'Face ID'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-16 rounded-2xl bg-white dark:bg-[#131823] border border-slate-200/80 dark:border-slate-800 text-2xl font-semibold active:scale-95 transition"
          >
            0
          </button>

          <button
            type="button"
            onClick={handleBackspace}
            aria-label="Effacer"
            className="h-16 rounded-2xl bg-white dark:bg-[#131823] border border-slate-200/80 dark:border-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 active:scale-95 transition"
          >
            <Delete className="w-6 h-6" />
          </button>
        </div>
      </div>

      <p className="text-[11px] text-slate-400 dark:text-slate-500">
        Données stockées localement sur votre iPhone
      </p>
    </div>
  );
}
