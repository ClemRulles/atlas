"use client";

import { useEffect, useState } from "react";
import { IconFaceId } from "@/components/lock/LockScreen";
import { biometricName, cancelled, disablePasskey, explain, enablePasskey, forgetUnlock, passkeySupported, readLock, type LockInfo } from "@/lib/passkey-client";
import { haptic } from "@/lib/ui";

/** Réglage Face ID (ou Touch ID) de cet appareil, dans « Mes données ». */
export function FaceIdSetting({ user }: { user: { id: string; name: string } }) {
  const [ready, setReady] = useState<{ supported: boolean; bio: string } | null>(null);
  const [lock, setLock] = useState<LockInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  useEffect(() => {
    let alive = true;
    void passkeySupported().then((supported) => {
      if (!alive) return;
      setReady({ supported, bio: biometricName() });
      setLock(readLock());
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!ready?.supported) return null;
  const { bio } = ready;
  const active = lock?.userId === user.id;

  async function activate() {
    setBusy(true);
    setMessage(null);
    try {
      setLock(await enablePasskey(user));
      haptic(18);
      setMessage({ text: `${bio} est activé. La prochaine ouverture se fera d'un regard.`, tone: "ok" });
    } catch (err) {
      if (!cancelled(err)) setMessage({ text: explain(err), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function deactivate() {
    setBusy(true);
    await disablePasskey();
    setLock(null);
    setBusy(false);
    setMessage({ text: `${bio} est désactivé sur cet appareil.`, tone: "ok" });
  }

  function lockNow() {
    forgetUnlock();
    window.location.reload();
  }

  return (
    <div className="flex flex-col gap-3 border-t border-voile/[0.07] pt-4">
      <div className="flex items-center gap-2.5">
        <IconFaceId className="h-5 w-5 text-lavande" />
        <span className="text-[14.5px]">{bio}</span>
        <span className={`ml-auto rounded-full px-2.5 py-0.5 text-[11.5px] ${active ? "bg-menthe/15 text-menthe" : "bg-voile/[0.06] text-ombre"}`}>{active ? "activé" : "désactivé"}</span>
      </div>
      <p className="text-[13.5px] leading-relaxed text-brume">
        {active
          ? `Atlas se verrouille à l'ouverture et quand tu le quittes plus de cinq minutes. ${bio} le rouvre, ton visage ne quitte jamais l'appareil.`
          : `Ouvre Atlas d'un regard, sans mot de passe, et garde-le verrouillé quand ton téléphone traîne. Une clé d'accès est créée sur cet appareil.`}
      </p>
      {message && <p className={`text-[13px] ${message.tone === "ok" ? "text-menthe" : "text-braise"}`}>{message.text}</p>}
      <div className="flex flex-wrap gap-2">
        {active ? (
          <>
            <button type="button" onClick={lockNow} className="touche rounded-full bg-craie px-4 py-2.5 text-[14px] font-medium text-nuit">Verrouiller maintenant</button>
            <button type="button" onClick={deactivate} disabled={busy} className="touche rounded-full px-4 py-2.5 text-[14px] text-brume underline decoration-voile/20 underline-offset-2">Désactiver</button>
          </>
        ) : (
          <button type="button" onClick={activate} disabled={busy} className="touche flex items-center gap-2 rounded-full bg-craie px-4 py-2.5 text-[14px] font-medium text-nuit disabled:opacity-50">
            <IconFaceId className="h-4 w-4" />
            {busy ? "Un instant…" : `Activer ${bio}`}
          </button>
        )}
      </div>
    </div>
  );
}
