"use client";

import { motion } from "motion/react";
import { Card } from "@/components/ui/primitives";
import { DEFAULT_PALETTE, DEFAULT_THEME, PALETTES, THEMES, type AuroraColors, type PaletteId, type ThemeChoice } from "@/lib/appearance";
import { useAtlas } from "@/lib/store";
import { haptic } from "@/lib/ui";

/** Les trois humeurs de la palette vivante, côte à côte : calme, hausse, baisse. */
const VIVANTE_PREVIEW: AuroraColors[] = [
  { a1: "#5b6bff", a2: "#9a6bff", a3: "#2b8cff", mood: "" },
  { a1: "#19e6a6", a2: "#2bb5ff", a3: "#7a5cff", mood: "" },
  { a1: "#ff5e7a", a2: "#ff9a5c", a3: "#a04cff", mood: "" },
];

/** Petite aurore d'aperçu : trois lueurs floues sur le fond du thème affiché. */
function Swatch({ colors }: { colors: AuroraColors | null }) {
  const sets = colors ? [colors] : VIVANTE_PREVIEW;
  return (
    <span className="relative block h-16 w-full overflow-hidden rounded-2xl bg-nuit ring-1 ring-voile/[0.08]" aria-hidden="true">
      {sets.map((c, i) => {
        const w = 100 / sets.length;
        return (
          <span key={i} className="absolute inset-y-0" style={{ left: `${i * w}%`, width: `${w}%` }}>
            <i className="absolute -top-3 -left-2 h-10 w-3/4 rounded-full blur-[14px]" style={{ background: c.a1, opacity: "calc(0.75 * var(--aurore-force))" }} />
            <i className="absolute -top-1 right-0 h-8 w-2/3 rounded-full blur-[14px]" style={{ background: c.a2, opacity: "calc(0.6 * var(--aurore-force))" }} />
            <i className="absolute top-4 left-1/4 h-7 w-1/2 rounded-full blur-[14px]" style={{ background: c.a3, opacity: "calc(0.45 * var(--aurore-force))" }} />
          </span>
        );
      })}
      <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-b from-transparent to-nuit" />
    </span>
  );
}

/** « Apparence » : thème par défaut et palette de l'aurore. Le changement est immédiat et suit le compte. */
export function AppearanceSetting() {
  const { settings, saveSettings } = useAtlas();
  const theme = settings.theme ?? DEFAULT_THEME;
  const palette = settings.palette ?? DEFAULT_PALETTE;
  const setTheme = (t: ThemeChoice) => (haptic(), saveSettings({ ...settings, theme: t }));
  const setPalette = (p: PaletteId) => (haptic(), saveSettings({ ...settings, palette: p }));
  const current = THEMES.findIndex((t) => t.id === theme);
  const hint = PALETTES.find((p) => p.id === palette)?.hint;

  return (
    <Card className="flex flex-col gap-5">
      <span className="repere">Apparence</span>

      <div className="flex flex-col gap-2.5">
        <span className="text-[14.5px]">Thème</span>
        <div className="verre relative grid grid-cols-3 rounded-full p-1" role="radiogroup" aria-label="Thème">
          <motion.span
            aria-hidden="true"
            className="absolute top-1 bottom-1 left-1 rounded-full bg-voile/10 shadow-[var(--reflet)]"
            style={{ width: "calc((100% - 8px) / 3)" }}
            animate={{ x: `${current * 100}%` }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
          />
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={theme === t.id}
              onClick={() => setTheme(t.id)}
              className={`touche relative z-10 rounded-full py-2.5 text-[13.5px] ${theme === t.id ? "text-craie" : "text-brume"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="text-[12.5px] text-ombre">Automatique suit le réglage clair ou sombre de ton appareil.</p>
      </div>

      <div className="flex flex-col gap-2.5">
        <span className="text-[14.5px]">Couleur du fond</span>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3" role="radiogroup" aria-label="Couleur du fond">
          {PALETTES.map((p) => {
            const selected = palette === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setPalette(p.id)}
                className={`touche flex flex-col gap-2 rounded-[20px] p-1.5 text-left transition-shadow ${selected ? "bg-voile/[0.06] shadow-[0_0_0_1.5px_var(--color-craie)]" : "shadow-[0_0_0_1px_var(--lisere)]"}`}
              >
                <Swatch colors={p.colors} />
                <span className="flex items-center justify-between px-1.5 pb-1 text-[13.5px]">
                  {p.label}
                  {selected && <span className="h-1.5 w-1.5 rounded-full bg-craie" aria-hidden="true" />}
                </span>
              </button>
            );
          })}
        </div>
        {hint && <p className="text-[12.5px] text-ombre">{hint}</p>}
      </div>
    </Card>
  );
}
