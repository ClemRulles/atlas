"use client";

import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { ARRIVAL_KEY, LOCK_KEY, UNLOCKED_KEY } from "./lock-boot";

/**
 * Clés d'accès côté navigateur : Face ID sur iPhone, Touch ID sur Mac.
 * L'appareil garde la clé privée ; Atlas ne voit jamais ni le visage ni l'empreinte.
 */

const HIDDEN_KEY = "atlas:hidden-at";
/** Au-delà de ce temps hors de l'app, elle se reverrouille. */
export const RELOCK_AFTER_MS = 5 * 60_000;

export interface LockInfo {
  credentialId: string;
  name: string;
  userId: string;
}

export function biometricName(): string {
  if (typeof navigator === "undefined") return "Face ID";
  const ua = navigator.userAgent;
  if (/iPhone|iPod/.test(ua)) return "Face ID";
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "Face ID";
  if (/Macintosh/.test(ua)) return "Touch ID";
  if (/Android/.test(ua)) return "ton empreinte";
  return "ta clé d'accès";
}

export async function passkeySupported(): Promise<boolean> {
  try {
    if (!browserSupportsWebAuthn()) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export const readLock = (): LockInfo | null => safe(() => JSON.parse(localStorage.getItem(LOCK_KEY) ?? "null") as LockInfo | null, null);
export const writeLock = (info: LockInfo | null) =>
  safe(() => (info ? localStorage.setItem(LOCK_KEY, JSON.stringify(info)) : localStorage.removeItem(LOCK_KEY)), undefined);

export const markArrival = () => safe(() => sessionStorage.setItem(ARRIVAL_KEY, "1"), undefined);
/** Vrai une seule fois après la connexion. */
export const takeArrival = () => safe(() => { const v = !!sessionStorage.getItem(ARRIVAL_KEY); sessionStorage.removeItem(ARRIVAL_KEY); return v; }, false);
export const markUnlocked = () => safe(() => sessionStorage.setItem(UNLOCKED_KEY, String(Date.now())), undefined);
export const isUnlocked = () => safe(() => !!sessionStorage.getItem(UNLOCKED_KEY), false);
export const markHidden = () => safe(() => sessionStorage.setItem(HIDDEN_KEY, String(Date.now())), undefined);
/** Vrai si l'app est restée en arrière-plan assez longtemps pour se reverrouiller. */
export function hiddenTooLong(now = Date.now()): boolean {
  const at = safe(() => Number(sessionStorage.getItem(HIDDEN_KEY) ?? 0), 0);
  return at > 0 && now - at > RELOCK_AFTER_MS;
}
export const forgetUnlock = () => safe(() => (sessionStorage.removeItem(UNLOCKED_KEY), sessionStorage.removeItem(HIDDEN_KEY)), undefined);


async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? "Opération impossible.");
  return body as T;
}

/** Crée une clé d'accès sur cet appareil pour le compte connecté et mémorise le verrou. */
export async function enablePasskey(user: { id: string; name: string }): Promise<LockInfo> {
  const optionsJSON = await json<Parameters<typeof startRegistration>[0]["optionsJSON"]>(await fetch("/api/auth/passkey/register", { cache: "no-store" }));
  let response: Awaited<ReturnType<typeof startRegistration>>;
  try {
    response = await startRegistration({ optionsJSON });
  } catch (err) {
    // Une clé de ce compte existe déjà sur cet appareil (créée depuis Safari ou lors d'un essai) :
    // on la réutilise en la faisant signer, ce qui mémorise aussi le verrou ici.
    if ((err as { code?: string }).code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") {
      await unlockWithPasskey();
      const info = readLock();
      if (info) return info;
    }
    throw err;
  }
  const label = `${biometricName()} · ${new Intl.DateTimeFormat("fr-BE", { day: "numeric", month: "short", year: "numeric" }).format(new Date())}`;
  await json(await fetch("/api/auth/passkey/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ response, label }) }));
  const info = { credentialId: response.id, name: user.name, userId: user.id };
  writeLock(info);
  markUnlocked();
  return info;
}

/** Retire la clé de ce compte (si possible) et le verrou de cet appareil. */
export async function disablePasskey(): Promise<void> {
  const info = readLock();
  writeLock(null);
  if (info) await fetch("/api/auth/passkey", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: info.credentialId }) }).catch(() => {});
}

/** Demande Face ID / Touch ID, fait vérifier la signature et rouvre la session. */
export async function unlockWithPasskey(): Promise<{ id: string; name: string }> {
  const optionsJSON = await json<Parameters<typeof startAuthentication>[0]["optionsJSON"]>(await fetch("/api/auth/passkey/login", { cache: "no-store" }));
  const response = await startAuthentication({ optionsJSON });
  const { user } = await json<{ user: { id: string; name: string } }>(
    await fetch("/api/auth/passkey/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ response }) }),
  );
  writeLock({ credentialId: response.id, name: user.name, userId: user.id });
  markUnlocked();
  return user;
}

/** Message en français pour une erreur de clé d'accès. */
export function explain(err: unknown): string {
  const code = (err as { code?: string }).code;
  if (code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") return `${biometricName()} est déjà prêt sur cet appareil.`;
  if (err instanceof TypeError) return "Pas de connexion : réessaie quand tu as du réseau.";
  if (err instanceof Error && /^[A-Z]/.test(err.message) && /[a-z] [a-z]/.test(err.message) && !/[éèàç]/.test(err.message)) {
    return `${biometricName()} n'a pas pu aboutir. Réessaie.`;
  }
  return err instanceof Error ? err.message : "Opération impossible.";
}

/** L'utilisateur a fermé la fenêtre Face ID, ou le navigateur l'a refusée sans geste. */
export const cancelled = (err: unknown) => err instanceof Error && (err.name === "NotAllowedError" || err.name === "AbortError" || /cancel|annul/i.test(err.message));

export function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 5 ? "Bonne nuit" : h < 18 ? "Bonjour" : "Bonsoir";
}
