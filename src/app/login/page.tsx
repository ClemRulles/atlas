"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { PrimaryButton, TextInput } from "@/components/ui/fields";
import { AtlasOrb, type OrbState } from "@/components/lock/AtlasOrb";
import { IconFaceId } from "@/components/lock/LockScreen";
import { biometricName, cancelled, enablePasskey, markArrival, markUnlocked, passkeySupported, readLock, unlockWithPasskey } from "@/lib/passkey-client";
import { haptic } from "@/lib/ui";

const ease = [0.16, 1, 0.3, 1] as const;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Rechargement complet voulu : l'app relit les données du compte au démarrage. */
function goHome() {
  markArrival();
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = "/";
}

/**
 * Connexion : Face ID (ou Touch ID) quand cet appareil a une clé d'accès, sinon identifiant et mot
 * de passe. Après un mot de passe, Atlas propose d'activer Face ID pour la prochaine fois.
 */
export default function LoginPage() {
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [supported, setSupported] = useState(false);
  const [bio, setBio] = useState("Face ID");
  const [stage, setStage] = useState<"form" | "offer">("form");
  const [account, setAccount] = useState<{ id: string; name: string } | null>(null);
  const [orb, setOrb] = useState<OrbState>("idle");

  useEffect(() => {
    let alive = true;
    void passkeySupported().then((ok) => {
      if (!alive) return;
      setSupported(ok);
      setBio(biometricName());
    });
    return () => {
      alive = false;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user, password }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Connexion impossible.");
      markUnlocked();
      const lock = readLock();
      if (supported && (!lock || lock.userId !== body.user.id)) {
        setAccount(body.user);
        setStage("offer");
        setBusy(false);
        return;
      }
      goHome();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible.");
      setBusy(false);
    }
  }

  async function withPasskey() {
    setBusy(true);
    setError(null);
    setOrb("scanning");
    try {
      await unlockWithPasskey();
      setOrb("success");
      haptic(18);
      await wait(650);
      goHome();
    } catch (err) {
      setOrb(cancelled(err) ? "idle" : "error");
      setError(cancelled(err) ? null : err instanceof Error ? `${err.message} Utilise ton mot de passe une fois pour activer ${biometricName()} sur cet appareil.` : "Connexion impossible.");
      setBusy(false);
    }
  }

  async function activate() {
    if (!account) return;
    setBusy(true);
    setError(null);
    setOrb("scanning");
    try {
      await enablePasskey(account);
      setOrb("success");
      haptic(18);
      await wait(800);
      goHome();
    } catch (err) {
      setOrb(cancelled(err) ? "idle" : "error");
      setError(cancelled(err) ? null : err instanceof Error ? err.message : "Activation impossible.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[78dvh] max-w-sm flex-col justify-center gap-8">
      <AnimatePresence mode="wait" initial={false}>
        {stage === "form" ? (
          <motion.div key="form" exit={{ opacity: 0, y: -12, filter: "blur(6px)" }} transition={{ duration: 0.35, ease }} className="flex flex-col gap-8">
            <div className="flex flex-col gap-3">
              <span className="repere">Atlas</span>
              <h1 className="font-serif text-[44px] leading-[1.02] font-light tracking-[-0.02em]">
                Bon retour. <em className="text-brume">Ton patrimoine t&apos;attend.</em>
              </h1>
            </div>

            {supported && (
              <div className="flex flex-col items-center gap-5">
                <button type="button" onClick={withPasskey} disabled={busy} className="touche group flex flex-col items-center gap-4 disabled:cursor-default" aria-label={`Se connecter avec ${bio}`}>
                  <AtlasOrb state={orb} size={132} />
                </button>
                <PrimaryButton onClick={withPasskey} disabled={busy}>
                  <span className="inline-flex items-center gap-2.5">
                    <IconFaceId />
                    {orb === "scanning" ? `${bio} en cours…` : orb === "success" ? "Bienvenue." : `Continuer avec ${bio}`}
                  </span>
                </PrimaryButton>
                <div className="flex w-full items-center gap-3 text-ombre">
                  <span className="h-px flex-1 bg-voile/10" />
                  <span className="repere">ou ton mot de passe</span>
                  <span className="h-px flex-1 bg-voile/10" />
                </div>
              </div>
            )}

            <form onSubmit={submit} className="verre flex flex-col gap-4 rounded-[28px] p-5">
              <label className="flex flex-col gap-1.5">
                <span className="repere">Identifiant</span>
                <TextInput id="login-user" autoComplete="username webauthn" autoCapitalize="none" value={user} onChange={(e) => setUser(e.target.value)} placeholder="clement" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="repere">Mot de passe</span>
                <TextInput id="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
              {error && <p className="text-[13.5px] text-braise">{error}</p>}
              <button type="submit" disabled={busy || !user || !password} className={`touche w-full rounded-full py-4 text-[15.5px] font-medium disabled:opacity-40 ${supported ? "verre" : "bg-craie text-nuit"}`}>
                {busy && orb === "idle" ? "Connexion…" : "Se connecter"}
              </button>
            </form>
            <p className="text-[12.5px] text-ombre">Tes positions, tes plans et tes dépenses sont rangés dans ton compte et suivent ton téléphone comme ton ordinateur.</p>
          </motion.div>
        ) : (
          <motion.div
            key="offer"
            initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.7, ease }}
            className="flex flex-col items-center gap-9 text-center"
          >
            <span className="repere">Bienvenue, {account?.name}</span>
            <AtlasOrb state={orb} />
            <div className="flex flex-col gap-3">
              <h1 className="font-serif text-[38px] leading-[1.04] font-light tracking-[-0.02em]">
                La prochaine fois, <em className="text-brume">un regard suffit.</em>
              </h1>
              <p className="text-[14.5px] leading-relaxed text-brume">
                Active {bio} sur cet appareil : Atlas s&apos;ouvrira sans mot de passe et se reverrouillera quand tu le quittes plus de cinq minutes. Ton visage ne quitte jamais ton téléphone.
              </p>
            </div>
            {error && <p className="text-[13.5px] text-braise">{error}</p>}
            <div className="flex w-full flex-col gap-2">
              <PrimaryButton onClick={activate} disabled={busy}>
                <span className="inline-flex items-center gap-2.5">
                  <IconFaceId />
                  {orb === "success" ? `${bio} activé` : orb === "scanning" ? "Un instant…" : `Activer ${bio}`}
                </span>
              </PrimaryButton>
              <button type="button" onClick={goHome} disabled={busy} className="touche rounded-full py-3 text-[14px] text-brume">
                Plus tard
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
