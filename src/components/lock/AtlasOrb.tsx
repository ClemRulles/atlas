"use client";

import { motion, useAnimationControls } from "motion/react";
import { useEffect } from "react";

export type OrbState = "idle" | "scanning" | "success" | "error";

/**
 * L'orbe d'Atlas : un globe en fils de lumière qui tourne lentement, cerné d'un anneau d'aurore.
 * Pendant Face ID l'anneau accélère ; à la réussite il se referme en un cercle menthe ;
 * à l'échec le globe secoue la tête.
 */
export function AtlasOrb({ state, size = 176 }: { state: OrbState; size?: number }) {
  const shake = useAnimationControls();
  useEffect(() => {
    if (state === "error") void shake.start({ x: [0, -11, 10, -7, 6, -3, 0], transition: { duration: 0.55, ease: "easeOut" } });
  }, [state, shake]);

  const scanning = state === "scanning";
  const success = state === "success";
  const meridians = [0, 1, 2, 3, 4, 5];

  return (
    <motion.div animate={shake} className="orbe relative grid place-items-center" style={{ width: size, height: size }} data-state={state}>
      {/* Halo d'aurore, flou, qui respire */}
      <div className="orbe-halo absolute inset-[-28%] rounded-full" aria-hidden="true" />
      {/* Anneau d'aurore en rotation */}
      <div className="orbe-anneau absolute inset-0 rounded-full" aria-hidden="true" />
      {/* Globe */}
      <svg viewBox="0 0 200 200" className="relative h-[78%] w-[78%] overflow-visible" aria-hidden="true">
        <defs>
          <radialGradient id="orbe-coeur" cx="38%" cy="32%" r="75%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.20)" />
            <stop offset="45%" stopColor="rgba(180,184,255,0.07)" />
            <stop offset="100%" stopColor="rgba(6,7,11,0)" />
          </radialGradient>
          <clipPath id="orbe-sphere">
            <circle cx="100" cy="100" r="80" />
          </clipPath>
        </defs>
        <circle cx="100" cy="100" r="80" fill="url(#orbe-coeur)" />
        <g clipPath="url(#orbe-sphere)" stroke="rgba(243,244,248,0.22)" strokeWidth="0.9" fill="none">
          {/* Parallèles */}
          {[-52, -26, 0, 26, 52].map((y) => (
            <ellipse key={y} cx="100" cy={100 + y} rx={Math.sqrt(80 * 80 - y * y)} ry={Math.max(2, 9 - Math.abs(y) / 8)} />
          ))}
          {/* Méridiens : chacun s'aplatit puis s'élargit, décalés, ce qui fait tourner le globe */}
          {meridians.map((i) => (
            <ellipse key={i} cx="100" cy="100" rx="80" ry="80" className="orbe-meridien" style={{ animationDelay: `${(-i * 12) / meridians.length}s` }} />
          ))}
        </g>
        <circle cx="100" cy="100" r="80" fill="none" stroke="rgba(243,244,248,0.32)" strokeWidth="1" />
        {/* Réussite : un cercle menthe se trace autour du globe */}
        <motion.circle
          cx="100"
          cy="100"
          r="92"
          fill="none"
          stroke="var(--color-menthe)"
          strokeWidth="2.2"
          strokeLinecap="round"
          initial={false}
          animate={{ pathLength: success ? 1 : 0, opacity: success ? 1 : 0 }}
          transition={{ duration: success ? 0.55 : 0.2, ease: [0.16, 1, 0.3, 1] }}
          style={{ rotate: -90, transformOrigin: "100px 100px" }}
        />
      </svg>
      {/* Ligne de lecture : un trait d'aurore descend et remonte sur le globe pendant Face ID */}
      <div className={`orbe-lecture pointer-events-none absolute left-[18%] right-[18%] h-px ${scanning ? "opacity-100" : "opacity-0"}`} aria-hidden="true" />
    </motion.div>
  );
}
