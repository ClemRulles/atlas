"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { formatEUR, formatNumber, formatPct } from "@/lib/format";

/** Montant en euros, flouté en mode discret. */
export function Money({ value, decimals = 0, sign = false, className = "" }: { value: number; decimals?: number; sign?: boolean; className?: string }) {
  return <span className={`amt tabular ${className}`}>{formatEUR(value, { decimals, sign })}</span>;
}

/** Pourcentage coloré selon le sens, jamais flouté. */
export function Pct({ value, decimals = 2, arrow = false, className = "" }: { value: number | null; decimals?: number; arrow?: boolean; className?: string }) {
  if (value === null) return <span className={`text-ombre ${className}`}>—</span>;
  const tone = value > 0.00005 ? "text-menthe" : value < -0.00005 ? "text-braise" : "text-brume";
  return (
    <span className={`tabular ${tone} ${className}`}>
      {arrow && <span className="mr-0.5 text-[0.72em]">{value < 0 ? "▼" : "▲"}</span>}
      {formatPct(value, { decimals, sign: true })}
    </span>
  );
}

/** Chiffres qui roulent : chaque chiffre défile sur sa colonne, largeur fixe, sans saut. */
export function Odometer({ text, className = "" }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const built = useRef<string | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (built.current === null || built.current.length !== text.length) {
      el.textContent = "";
      [...text].forEach((ch, i) => {
        const s = document.createElement("span");
        if (/\d/.test(ch)) {
          s.className = "odo-d";
          const col = document.createElement("span");
          col.className = "odo-col";
          col.style.transitionDelay = `${i * 40}ms`;
          for (let d = 0; d < 10; d++) {
            const c = document.createElement("span");
            c.textContent = String(d);
            col.appendChild(c);
          }
          s.appendChild(col);
        } else {
          s.className = "odo-s";
          s.textContent = ch;
        }
        el.appendChild(s);
      });
      el.getBoundingClientRect();
    }
    built.current = text;
    // La mise en page vient d'être forcée : la transition CSS part donc de la position précédente.
    [...text].forEach((ch, i) => {
      const col = el.children[i]?.firstChild as HTMLElement | null;
      if (/\d/.test(ch) && col) col.style.transform = `translateY(${-Number(ch) * 10}%)`;
    });
  }, [text]);

  return <span ref={ref} className={`odo ${className}`} aria-hidden="true" />;
}

/** Total en euros avec centimes plus petits, en chiffres qui roulent. */
export function BigTotal({ value, className = "" }: { value: number; className?: string }) {
  const [whole, cents] = formatNumber(value, { decimals: 2 }).split(",");
  return (
    <div className={`amt flex items-end font-medium tracking-[-0.045em] tabular ${className}`} aria-label={formatEUR(value, { decimals: 2 })}>
      <Odometer text={whole} />
      <Odometer text={`,${cents} €`} className="mb-[0.24em] ml-[0.12em] text-[0.46em] font-normal tracking-[-0.02em] text-brume" />
    </div>
  );
}

/** Entrée en ressort avec un léger flou qui se dissipe, en cascade. */
export function Reveal({ children, i = 0, className = "" }: { children: ReactNode; i?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 18, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: i * 0.07 }}
    >
      {children}
    </motion.div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`verre rounded-[28px] p-5 sm:p-6 ${className}`}>{children}</section>;
}

export function Eyebrow({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="repere">{children}</span>
      {right && <span className="repere">{right}</span>}
    </div>
  );
}

/** Jauge qui se remplit à l'apparition. */
export function Gauge({ ratio, tone = "lumiere", delay = 0.4 }: { ratio: number; tone?: "lumiere" | "lavande" | "mood"; delay?: number }) {
  const color = tone === "lavande" ? "var(--color-lavande)" : tone === "mood" ? "var(--mood)" : "#fff";
  return (
    <div className="h-[5px] overflow-hidden rounded-full bg-white/[0.09]">
      <motion.i
        className="block h-full origin-left rounded-full"
        style={{ background: color, width: `${Math.max(0, Math.min(1, ratio)) * 100}%` }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 1.3, ease: [0.16, 1, 0.3, 1], delay }}
      />
    </div>
  );
}

/** Ferme une feuille avec Échap. */
export function useEscape(onEscape: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onEscape();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onEscape, active]);
}
