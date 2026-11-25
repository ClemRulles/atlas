"use client";

import Link from "next/link";
import { animate, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/ui";
import {
  biometricName,
  cancelled,
  forgetUnlock,
  greeting,
  hiddenTooLong,
  isUnlocked,
  markHidden,
  readLock,
  takeArrival,
  unlockWithPasskey,
} from "@/lib/passkey-client";
import { AtlasOrb, type OrbState } from "./AtlasOrb";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function IconFaceId({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M3 8V6a3 3 0 0 1 3-3h2M16 3h2a3 3 0 0 1 3 3v2M21 16v2a3 3 0 0 1-3 3h-2M8 21H6a3 3 0 0 1-3-3v-2" />
      <path d="M9 9v1.5M15 9v1.5M12 9.5v3.5h-1M9 16c1.6 1.3 4.4 1.3 6 0" />
    </svg>
  );
}

/**
 * Verrou d'Atlas. Il apparaît à l'ouverture de l'app (et après cinq minutes en arrière-plan) quand
 * Face ID est activé sur cet appareil. La réussite ouvre l'app en iris, depuis l'orbe, avec un
 * liseré d'aurore ; l'app floue derrière se pose en même temps.
 */
export function LockScreen() {
  const [phase, setPhase] = useState<"off" | "locked" | "opening">("off");
  const [orb, setOrb] = useState<OrbState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [who, setWho] = useState({ name: "", hello: "Bonjour", bio: "Face ID" });
  const overlay = useRef<HTMLDivElement>(null);
  const orbBox = useRef<HTMLDivElement>(null);
  const rim = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const autoTried = useRef(false);

  const lockNow = useCallback(() => {
    const info = readLock();
    if (!info) return;
    document.documentElement.dataset.reveal = "start";
    setWho({ name: info.name, hello: greeting(), bio: biometricName() });
    setOrb("idle");
    setMessage(null);
    autoTried.current = false;
    setPhase("locked");
  }, []);

  useEffect(() => {
    const arriving = takeArrival();
    const frame = readLock() && !isUnlocked() ? window.setTimeout(lockNow, 0) : 0;
    if (!frame) {
      // Rien à verrouiller : le voile éventuel s'efface.
      delete document.documentElement.dataset.lock;
      // Arrivée depuis la connexion : l'app, floue au démarrage, se pose doucement.
      if (arriving) window.setTimeout(() => delete document.documentElement.dataset.reveal, 40);
    }
    const onVisibility = () => {
      if (document.hidden) markHidden();
      else if (readLock() && hiddenTooLong()) {
        forgetUnlock();
        lockNow();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(frame);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [lockNow]);

  // Le verrou est affiché : le voile posé avant l'affichage peut partir.
  useEffect(() => {
    if (phase === "locked") delete document.documentElement.dataset.lock;
  }, [phase]);

  const open = useCallback(async () => {
    const el = overlay.current;
    const box = orbBox.current?.getBoundingClientRect();
    if (!el || !box) return setPhase("off");
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const far = Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy));
    const soft = 150;
    setPhase("opening");
    delete document.documentElement.dataset.reveal;
    await animate(-soft, far + soft, {
      duration: 1.15,
      ease: [0.7, 0, 0.2, 1],
      onUpdate: (r) => {
        const mask = `radial-gradient(circle at ${cx}px ${cy}px, transparent ${Math.max(0, r)}px, #000 ${r + soft}px)`;
        el.style.maskImage = mask;
        el.style.webkitMaskImage = mask;
        const ring = rim.current;
        if (ring) {
          const d = Math.max(0, 2 * (r + soft * 0.55));
          ring.style.width = ring.style.height = `${d}px`;
          ring.style.left = `${cx - d / 2}px`;
          ring.style.top = `${cy - d / 2}px`;
          ring.style.opacity = String(Math.max(0, 1 - Math.max(0, r) / (far * 0.9)));
        }
      },
    });
    el.style.maskImage = "";
    el.style.webkitMaskImage = "";
    setPhase("off");
  }, []);

  const attempt = useCallback(
    async (auto = false) => {
      if (busy.current) return;
      busy.current = true;
      setOrb("scanning");
      setMessage(null);
      try {
        await unlockWithPasskey();
        setOrb("success");
        haptic(18);
        await wait(560);
        await open();
      } catch (err) {
        if (auto && cancelled(err)) {
          // Le navigateur attend un geste : on attend simplement que tu touches l'écran.
          setOrb("idle");
        } else {
          setOrb("error");
          if (!auto) haptic(30);
          setMessage(
            cancelled(err)
              ? "Annulé. Touche l'orbe pour réessayer."
              : err instanceof TypeError
                ? "Pas de connexion : Atlas ne peut pas vérifier ta clé pour l'instant."
                : err instanceof Error
                  ? err.message
                  : "Déverrouillage impossible.",
          );
        }
      } finally {
        busy.current = false;
      }
    },
    [open],
  );

  // Face ID se lance tout seul à l'ouverture quand le navigateur le permet.
  useEffect(() => {
    if (phase !== "locked" || autoTried.current) return;
    autoTried.current = true;
    const t = setTimeout(() => void attempt(true), 450);
    return () => clearTimeout(t);
  }, [phase, attempt]);

  if (phase === "off") return null;
  const opening = phase === "opening";
  const idleText = "Ton patrimoine est à l'abri.";

  return (
    <div
      ref={overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Atlas est verrouillé"
      className="fixed inset-0 z-[100] overflow-hidden bg-nuit"
      onClick={() => phase === "locked" && void attempt()}
    >
      <div className="aurore" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
        animate={opening ? { opacity: 0, scale: 1.14, filter: "blur(10px)" } : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
        transition={opening ? { duration: 0.7, ease: [0.4, 0, 1, 1] } : { duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 flex h-full flex-col items-center justify-center gap-10 px-6 pt-[env(safe-area-inset-top)] pb-[calc(40px+env(safe-area-inset-bottom))] text-center"
      >
        <span className="repere">Atlas · verrouillé</span>
        <div ref={orbBox}>
          <AtlasOrb state={orb} />
        </div>
        <div className="flex max-w-xs flex-col gap-2.5">
          <h1 className="font-serif text-[clamp(32px,9vw,42px)] leading-[1.04] font-light tracking-[-0.02em]">
            {who.hello}, <em className="text-brume">{who.name}.</em>
          </h1>
          <p aria-live="polite" className={`min-h-[2.8em] text-[15px] leading-snug transition-colors duration-300 ${orb === "error" ? "text-braise" : "text-brume"}`}>
            {message ?? (orb === "scanning" ? `${who.bio} en cours…` : orb === "success" ? "Bienvenue." : idleText)}
          </p>
        </div>
        <button
          type="button"
          onClick={(e) => (e.stopPropagation(), void attempt())}
          disabled={orb === "scanning" || orb === "success"}
          className="touche verre flex items-center gap-2.5 rounded-full px-6 py-3.5 text-[15px] disabled:opacity-60"
        >
          <IconFaceId />
          Déverrouiller avec {who.bio}
        </button>
      </motion.div>
      <Link
        href="/login"
        onClick={(e) => e.stopPropagation()}
        className={`absolute inset-x-0 bottom-[calc(18px+env(safe-area-inset-bottom))] z-10 mx-auto w-max text-[13px] text-ombre underline decoration-white/15 underline-offset-4 transition-opacity ${opening ? "opacity-0" : ""}`}
      >
        Utiliser mon mot de passe
      </Link>
      <div ref={rim} className="iris-lisere pointer-events-none fixed rounded-full" aria-hidden="true" />
    </div>
  );
}
