"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SeriesPoint } from "@/lib/domain/valuation";
import { formatEUR } from "@/lib/format";

const fmtDate = new Intl.DateTimeFormat("fr-BE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * Courbe d'évolution du patrimoine. Le trait se dessine, l'aire monte ensuite,
 * le doigt fait glisser un repère et la valeur suit. En pointillé : l'argent versé.
 */
export function WealthChart({ points, height = 170, animationKey, onScrub }: {
  points: SeriesPoint[];
  height?: number;
  animationKey: string;
  onScrub?: (point: SeriesPoint | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    if (points.length < 2 || width === 0) return null;
    const pad = 14;
    const right = width - 8;
    const values = points.flatMap((p) => [p.valueEUR, p.investedEUR]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const x = (i: number) => (i / (points.length - 1)) * right;
    const y = (v: number) => height - pad - ((v - min) / span) * (height - 2 * pad);
    const xy = points.map((p, i) => ({ x: x(i), y: y(p.valueEUR), yi: y(p.investedEUR) }));
    const line = xy.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("");
    const invested = xy.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.yi.toFixed(1)}`).join("");
    return { xy, line, invested, area: `${line}L${right} ${height}L0 ${height}Z`, right };
  }, [points, width, height]);

  const pick = (clientX: number) => {
    if (!geo || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const i = Math.max(0, Math.min(points.length - 1, Math.round(((clientX - r.left) / geo.right) * (points.length - 1))));
    setActive(i);
    onScrub?.(points[i]);
  };
  const release = () => {
    setActive(null);
    onScrub?.(null);
  };

  const marker = geo ? geo.xy[active ?? geo.xy.length - 1] : null;
  const activePoint = active !== null ? points[active] : null;

  return (
    <div
      ref={box}
      className="relative cursor-crosshair touch-pan-y select-none"
      style={{ height }}
      onPointerDown={(e) => pick(e.clientX)}
      onPointerMove={(e) => pick(e.clientX)}
      onPointerLeave={release}
      onPointerCancel={release}
      onPointerUp={(e) => e.pointerType !== "mouse" && release()}
      role="img"
      aria-label={
        points.length > 1
          ? `Évolution du patrimoine du ${fmtDate.format(new Date(points[0].date))} au ${fmtDate.format(new Date(points[points.length - 1].date))} : de ${formatEUR(points[0].valueEUR)} à ${formatEUR(points[points.length - 1].valueEUR)}`
          : "Pas encore assez de données pour une courbe"
      }
    >
      {geo && (
        <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
          <defs>
            <linearGradient id="fondu-courbe" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: "var(--mood)", stopOpacity: 0.28 }} />
              <stop offset="1" style={{ stopColor: "var(--mood)", stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <motion.path
            key={`a-${animationKey}`}
            d={geo.area}
            fill="url(#fondu-courbe)"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.9, delay: 0.35 }}
          />
          <path d={geo.invested} fill="none" stroke="rgba(255,255,255,.28)" strokeWidth={1.25} strokeDasharray="3 5" strokeLinecap="round" />
          <motion.path
            key={`l-${animationKey}`}
            d={geo.line}
            fill="none"
            stroke="#fff"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: "drop-shadow(0 0 10px color-mix(in oklab, var(--mood) 70%, transparent))" }}
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.25, ease: [0.16, 1, 0.3, 1] }}
          />
        </svg>
      )}
      {marker && (
        <>
          <div
            className="pointer-events-none absolute top-0 bottom-0 w-px transition-opacity duration-200"
            style={{ left: marker.x, opacity: active !== null ? 1 : 0, background: "linear-gradient(180deg, transparent, rgba(255,255,255,.35) 20%, rgba(255,255,255,.35) 80%, transparent)" }}
          />
          <div
            className={`pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white ${active === null ? "pouls" : ""}`}
            style={{ left: marker.x, top: marker.y, boxShadow: "0 0 0 2px var(--color-nuit), 0 0 16px 2px var(--mood)" }}
          />
        </>
      )}
      {activePoint && <span className="sr-only">{`${fmtDate.format(new Date(activePoint.date))} : ${formatEUR(activePoint.valueEUR)}`}</span>}
    </div>
  );
}

/** Mini-courbe d'une ligne : trait discret, point final coloré selon le sens. */
export function Sparkline({ values, width = 64, height = 26 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <svg width={width} height={height} aria-hidden="true" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const xy = values.map((v, i) => [1 + (i / (values.length - 1)) * (width - 6), height - 3 - ((v - min) / (max - min || 1)) * (height - 6)]);
  const up = values[values.length - 1] >= values[values.length - 2];
  const [lx, ly] = xy[xy.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible" aria-hidden="true">
      <polyline points={xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")} fill="none" stroke="var(--color-brume)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={2.6} fill={up ? "var(--color-menthe)" : "var(--color-braise)"} stroke="var(--color-nuit)" strokeWidth={1.5} />
    </svg>
  );
}
