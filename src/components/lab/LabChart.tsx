"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { formatNumber } from "@/lib/format";

export interface ChartLine {
  values: number[];
  style: "main" | "ghost" | "dashed";
  label: string;
}

export interface ChartMarker {
  index: number;
  label: string;
}

/**
 * Graphe du laboratoire : une bande (cône), des lignes, des repères verticaux,
 * une échelle unique et des étiquettes d'axe sobres. Le trait principal se dessine.
 */
export function LabChart({ xLabels, lines, band, markers = [], height = 220, animationKey, yFormat, zeroBased = true }: {
  xLabels: string[];
  lines: ChartLine[];
  band?: { low: number[]; high: number[] };
  markers?: ChartMarker[];
  height?: number;
  animationKey: string;
  yFormat?: (v: number) => string;
  /** Faux pour zoomer sur la zone utile (crises, jumeau) au lieu de partir de zéro. */
  zeroBased?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = xLabels.length;
  const all = [...lines.flatMap((l) => l.values), ...(band ? [...band.low, ...band.high] : [])].filter(Number.isFinite);
  const dataMin = Math.min(...all);
  const dataMax = Math.max(...all, 1);
  const pad = (dataMax - dataMin) * 0.08;
  const min = zeroBased ? Math.min(0, dataMin) : Math.max(0, dataMin - pad);
  const max = zeroBased ? dataMax : dataMax + pad;
  const left = 4;
  const right = Math.max(10, width - 56);
  const top = 12;
  const bottom = height - 26;
  const x = (i: number) => left + (n <= 1 ? 0 : (i / (n - 1)) * (right - left));
  const y = (v: number) => bottom - ((v - min) / (max - min || 1)) * (bottom - top);
  const path = (values: number[]) => values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("");
  const fmt = yFormat ?? ((v: number) => `${formatNumber(v / 1000, { decimals: 0 })} k€`);
  const ticks = [min, (min + max) / 2, max];
  const xTicks = n > 1 ? [0, Math.floor((n - 1) / 2), n - 1] : [0];

  return (
    <div ref={box} className="relative w-full" style={{ height }}>
      {width > 0 && n > 0 && (
        <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={lines.map((l) => l.label).join(", ")}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={left} x2={right} y1={y(t)} y2={y(t)} style={{ stroke: "color-mix(in oklab, var(--color-craie) 8%, transparent)" }} />
              <text x={right + 8} y={y(t) + 4} fontSize="11" fill="var(--color-ombre)" className="amt tabular">
                {fmt(t)}
              </text>
            </g>
          ))}
          {xTicks.map((i) => (
            <text key={i} x={x(i)} y={height - 6} fontSize="11" fill="var(--color-ombre)" textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="tabular">
              {xLabels[i]}
            </text>
          ))}
          {band && (
            <motion.path
              key={`b-${animationKey}`}
              d={`${path(band.high)}${band.low.map((v, i) => `L${x(band.low.length - 1 - i).toFixed(1)} ${y(band.low[band.low.length - 1 - i]).toFixed(1)}`).join("")}Z`}
              fill="var(--mood)"
              fillOpacity={0.16}
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.3 }}
            />
          )}
          {markers.map((m) => (
            <g key={`${m.index}-${m.label}`}>
              <line x1={x(m.index)} x2={x(m.index)} y1={top} y2={bottom} stroke="var(--color-lavande)" strokeOpacity={0.6} strokeDasharray="2 4" />
              <circle cx={x(m.index)} cy={top} r={3} fill="var(--color-lavande)" />
            </g>
          ))}
          {lines.map((l, idx) => (
            <motion.path
              key={`${animationKey}-${idx}`}
              d={path(l.values)}
              fill="none"
              stroke="var(--color-craie)"
              strokeOpacity={l.style === "main" ? 1 : l.style === "ghost" ? 0.55 : 0.35}
              strokeWidth={l.style === "main" ? 2 : 1.5}
              strokeDasharray={l.style === "dashed" ? "3 5" : undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={l.style === "main" ? { filter: "drop-shadow(0 0 8px color-mix(in oklab, var(--mood) 60%, transparent))" } : undefined}
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: idx * 0.1 }}
            />
          ))}
        </svg>
      )}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; style: "main" | "ghost" | "dashed" | "band" | "marker" }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-brume">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-2">
          {it.style === "band" ? (
            <i className="block h-2.5 w-4 rounded-sm" style={{ background: "color-mix(in oklab, var(--mood) 35%, transparent)" }} />
          ) : it.style === "marker" ? (
            <i className="block h-2 w-2 rounded-full bg-lavande" />
          ) : (
            <i className={`block w-4 ${it.style === "dashed" ? "border-t border-dashed border-voile/40" : it.style === "ghost" ? "h-[2px] bg-voile/55" : "h-[2px] bg-craie"}`} />
          )}
          {it.label}
        </li>
      ))}
    </ul>
  );
}
