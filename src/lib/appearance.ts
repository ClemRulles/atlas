/**
 * Apparence d'Atlas : thème (sombre, clair ou celui de l'appareil) et palette de l'aurore.
 * Seul le fond change de couleur ; cartes, textes et graphiques restent neutres.
 * Le choix vit dans les réglages (donc dans le compte) et en miroir dans le navigateur
 * pour que le script de démarrage l'applique avant le premier affichage.
 */

export type ThemeChoice = "auto" | "dark" | "light";
export type PaletteId = "vivante" | "boreale" | "lagon" | "braise" | "aube" | "graphite";

export interface AuroraColors {
  a1: string;
  a2: string;
  a3: string;
  mood: string;
}

export const LOOK_KEY = "atlas:look";

export const THEMES: { id: ThemeChoice; label: string }[] = [
  { id: "auto", label: "Automatique" },
  { id: "dark", label: "Sombre" },
  { id: "light", label: "Clair" },
];

export const PALETTES: { id: PaletteId; label: string; hint: string; colors: AuroraColors | null }[] = [
  { id: "vivante", label: "Vivante", hint: "Suit ta journée : calme, vert en hausse, corail en baisse.", colors: null },
  { id: "boreale", label: "Boréale", hint: "Bleu et violet, toujours calme.", colors: { a1: "#5b6bff", a2: "#9a6bff", a3: "#2b8cff", mood: "#9aa0ff" } },
  { id: "lagon", label: "Lagon", hint: "Cyan et menthe, frais.", colors: { a1: "#17c9c0", a2: "#2b8cff", a3: "#4de5b2", mood: "#4de5b2" } },
  { id: "braise", label: "Braise", hint: "Corail et ambre, chaleureux.", colors: { a1: "#ff7a5c", a2: "#ffb347", a3: "#ff5e7a", mood: "#ff9a6b" } },
  { id: "aube", label: "Aube", hint: "Pêche et rose poudré, tout en douceur.", colors: { a1: "#ffb199", a2: "#ff8fb1", a3: "#ffd6a5", mood: "#ff9fb2" } },
  { id: "graphite", label: "Graphite", hint: "Presque sans couleur, très sobre.", colors: { a1: "#7a7f90", a2: "#a3a8ba", a3: "#4a4e5c", mood: "#b4b8ff" } },
];

export const DEFAULT_THEME: ThemeChoice = "dark";
export const DEFAULT_PALETTE: PaletteId = "vivante";

export const isTheme = (v: unknown): v is ThemeChoice => v === "auto" || v === "dark" || v === "light";
export const isPalette = (v: unknown): v is PaletteId => PALETTES.some((p) => p.id === v);

export const paletteColors = (id: PaletteId) => PALETTES.find((p) => p.id === id)?.colors ?? null;

/** Couleur de la barre d'état (iPhone) et du navigateur pour chaque thème. */
export const THEME_COLOR = { dark: "#06070b", light: "#f4f2ee" } as const;

export function resolveTheme(choice: ThemeChoice): "dark" | "light" {
  if (choice !== "auto") return choice;
  if (typeof matchMedia === "undefined") return "dark";
  return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Applique le thème à la page et le garde en miroir pour le prochain démarrage. */
export function applyLook(theme: ThemeChoice, palette: PaletteId) {
  const resolved = resolveTheme(theme);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = THEME_COLOR[resolved];
  try {
    localStorage.setItem(LOOK_KEY, JSON.stringify({ theme, palette, colors: paletteColors(palette) }));
  } catch {
    /* navigation privée : sans miroir, le thème s'applique un instant plus tard */
  }
}

/**
 * Script de démarrage (avant tout affichage) : thème et palette fixe depuis le miroir local.
 * Sans miroir, le thème sombre par défaut reste.
 */
export const LOOK_BOOT_SCRIPT = `try{var l=JSON.parse(localStorage.getItem("${LOOK_KEY}")||"null");if(l){var t=l.theme==="auto"?(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):l.theme;var r=document.documentElement;if(t==="light"||t==="dark"){r.dataset.theme=t;r.style.colorScheme=t}if(l.colors){r.style.setProperty("--a1",l.colors.a1);r.style.setProperty("--a2",l.colors.a2);r.style.setProperty("--a3",l.colors.a3);r.style.setProperty("--mood",l.colors.mood)}}}catch(e){}`;
