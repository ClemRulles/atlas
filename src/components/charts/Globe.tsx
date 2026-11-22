"use client";

import createGlobe from "cobe";
import { useEffect, useRef, useState } from "react";
import { COUNTRY_LOCATIONS, EXCHANGES, isOpen } from "@/lib/domain/exchanges";

export interface GlobeWeight {
  key: string;
  weight: number;
}

/**
 * Globe en points : les pays où travaille l'argent (taille selon le poids) et les places
 * boursières, allumées quand elles sont ouvertes. Se fait tourner au doigt.
 */
export function Globe({ countries, size = 320 }: { countries: GlobeWeight[]; size?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const drag = useRef<{ x: number; phi: number } | null>(null);
  const phi = useRef(4.6);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const max = Math.max(...countries.map((c) => c.weight), 0.01);
    const markers = [
      ...countries.flatMap((c) => {
        const location = COUNTRY_LOCATIONS[c.key];
        return location ? [{ location, size: 0.03 + 0.07 * Math.sqrt(c.weight / max), color: [0.62, 0.64, 1] as [number, number, number] }] : [];
      }),
      ...EXCHANGES.map((x) => {
        const open = isOpen(x, now);
        return { location: x.location, size: open ? 0.05 : 0.018, color: (open ? [1, 0.86, 0.55] : [0.45, 0.47, 0.6]) as [number, number, number] };
      }),
    ];
    let globe: ReturnType<typeof createGlobe>;
    try {
      globe = createGlobe(el, {
        devicePixelRatio: Math.min(2, window.devicePixelRatio || 1),
        width: size * 2,
        height: size * 2,
        phi: phi.current,
        theta: 0.28,
        dark: 1,
        diffuse: 1.15,
        mapSamples: 14000,
        mapBrightness: 5,
        baseColor: [0.28, 0.3, 0.44],
        markerColor: [1, 0.86, 0.55],
        glowColor: [0.15, 0.17, 0.3],
        markers,
      });
    } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- WebGL indisponible : on remplace le globe par un message
      setFailed(true);
      return;
    }
    let frame = 0;
    const loop = () => {
      if (!drag.current && !reduce) phi.current += 0.0028;
      globe.update({ phi: phi.current });
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      globe.destroy();
    };
  }, [countries, size, now]);

  if (failed) return <p className="text-[14px] text-ombre">Le globe a besoin de WebGL, indisponible sur cet appareil.</p>;
  return (
    <canvas
      ref={canvas}
      width={size * 2}
      height={size * 2}
      className="mx-auto block aspect-square w-full cursor-grab touch-pan-y active:cursor-grabbing"
      style={{ maxWidth: size }}
      aria-label="Globe : les pays où ton argent est investi et les places boursières ouvertes en ce moment"
      onPointerDown={(e) => (drag.current = { x: e.clientX, phi: phi.current })}
      onPointerMove={(e) => {
        if (drag.current) phi.current = drag.current.phi + (e.clientX - drag.current.x) / 120;
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerLeave={() => (drag.current = null)}
    />
  );
}

/** Places ouvertes à l'instant donné. */
export function openExchanges(now: Date) {
  return EXCHANGES.filter((x) => isOpen(x, now));
}
