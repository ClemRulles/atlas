"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { useEffect, type ReactNode } from "react";
import { IconChat, IconEye, IconEyeOff, IconOwn, IconPlus, IconToday, IconWhatIf } from "@/components/ui/icons";
import { AtlasProvider, useAtlas } from "@/lib/store";
import { auroraFor, haptic } from "@/lib/ui";
import { applyLook, DEFAULT_PALETTE, DEFAULT_THEME, paletteColors } from "@/lib/appearance";
import { AddSheet } from "@/components/add/AddSheet";
import { CaptureSheet } from "@/components/add/CaptureSheet";
import { CsvSheet } from "@/components/add/CsvSheet";
import { ChatSheet, ExpensesSheet, ModeSheet } from "./sheets";
import { LockScreen } from "@/components/lock/LockScreen";

export const PAGES = [
  { href: "/", label: "Aujourd'hui", Icon: IconToday },
  { href: "/possessions", label: "Ce que tu possèdes", Icon: IconOwn },
  { href: "/et-si", label: "Et si", Icon: IconWhatIf },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login") {
    return (
      <div className="relative z-10 mx-auto w-full pl-[max(20px,env(safe-area-inset-left))] pr-[max(20px,env(safe-area-inset-right))] pt-[calc(14px+env(safe-area-inset-top))]">
        <div className="aurore" aria-hidden="true"><i /><i /><i /></div>
        <div className="relative">{children}</div>
      </div>
    );
  }
  return (
    <AtlasProvider>
      <ServiceWorker />
      <Aurora />
      <div className="app-root relative z-10 mx-auto w-full max-w-6xl pb-36 pl-[max(20px,env(safe-area-inset-left))] pr-[max(20px,env(safe-area-inset-right))] pt-[calc(14px+env(safe-area-inset-top))] sm:pl-[max(32px,env(safe-area-inset-left))] sm:pr-[max(32px,env(safe-area-inset-right))]">
        <TopBar />
        {children}
      </div>
      <Dock />
      <AddSheet />
      <CsvSheet />
      <CaptureSheet />
      <ChatSheet />
      <ModeSheet />
      <ExpensesSheet />
      <LockScreen />
    </AtlasProvider>
  );
}

/** Enregistre le service worker en production : l'app s'ouvre même hors ligne. */
function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}

/**
 * Lumière d'ambiance. Palette « vivante » : la teinte suit la variation du jour ; sinon la palette
 * choisie, fixe. Applique aussi le thème (et suit l'appareil en mode automatique).
 */
function Aurora() {
  const { snapshot, settings, mode } = useAtlas();
  // Tant que les réglages ne sont pas lus, le script de démarrage a déjà posé le bon thème.
  const ready = mode !== null;
  const theme = settings.theme ?? DEFAULT_THEME;
  const palette = settings.palette ?? DEFAULT_PALETTE;
  useEffect(() => {
    if (!ready) return;
    applyLook(theme, palette);
    if (theme !== "auto") return;
    const media = matchMedia("(prefers-color-scheme: light)");
    const follow = () => applyLook(theme, palette);
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, [ready, theme, palette]);
  useEffect(() => {
    if (!ready) return;
    const { a1, a2, a3, mood } = paletteColors(palette) ?? auroraFor(snapshot?.dayPct ?? 0);
    const root = document.documentElement.style;
    root.setProperty("--a1", a1);
    root.setProperty("--a2", a2);
    root.setProperty("--a3", a3);
    root.setProperty("--mood", mood);
    // Couleur du signe du jour (texte) : indépendante de la palette, lisible dans les deux thèmes.
    const day = snapshot?.dayPct ?? 0;
    root.setProperty("--signe", day > 0.0005 ? "var(--color-menthe)" : day < -0.0005 ? "var(--color-braise)" : "var(--color-lavande)");
  }, [ready, snapshot?.dayPct, palette]);
  return (
    <div className="aurore" aria-hidden="true">
      <i />
      <i />
      <i />
    </div>
  );
}

function TopBar() {
  const { mode, discreet, toggleDiscreet } = useAtlas();
  return (
    <header className="flex items-center justify-between gap-3 pb-6">
      <span className="font-serif text-[22px] italic tracking-[-0.01em]">Atlas</span>
      <div className="flex items-center gap-2">
        {mode && (
          <Link href="/patrimoine" className="touche verre flex h-10 items-center gap-2 rounded-full px-4 text-[13px] text-brume" onClick={() => haptic()}>
            <span className={`h-1.5 w-1.5 rounded-full ${mode === "demo" ? "bg-lavande" : "bg-menthe"}`} />
            {mode === "demo" ? "Démo · mon patrimoine" : "Mon patrimoine"}
          </Link>
        )}
        <button
          type="button"
          onClick={() => {
            haptic();
            toggleDiscreet();
          }}
          aria-pressed={discreet}
          aria-label={discreet ? "Afficher les montants" : "Mode discret : flouter les montants"}
          className={`touche grid h-10 w-10 place-items-center rounded-full ${discreet ? "bg-craie text-nuit" : "verre text-brume"}`}
        >
          {discreet ? <IconEyeOff /> : <IconEye />}
        </button>
      </div>
    </header>
  );
}

/** Barre flottante en bas à droite : trois pages, l'ajout d'une position et le chat. */
function Dock() {
  const pathname = usePathname();
  const { openSheet } = useAtlas();
  const current = Math.max(0, PAGES.findIndex((p) => p.href === pathname));
  return (
    <nav
      aria-label="Navigation"
      className="fixed z-40 flex items-center gap-2"
      style={{ right: "max(16px, env(safe-area-inset-right))", bottom: "calc(16px + env(safe-area-inset-bottom))" }}
    >
      <button type="button" aria-label="Demande à ton patrimoine" onClick={() => (haptic(), openSheet("chat"))} className="touche verre-sombre grid h-12 w-12 place-items-center rounded-full">
        <IconChat />
      </button>
      <button type="button" aria-label="Ajouter une position" onClick={() => (haptic(), openSheet("add"))} className="touche grid h-12 w-12 place-items-center rounded-full bg-craie text-nuit shadow-[var(--lueur-bouton)]">
        <IconPlus />
      </button>
      <div className="verre-sombre relative flex rounded-full p-[5px]">
        <motion.span
          aria-hidden="true"
          className="absolute top-[5px] left-[5px] h-10 w-12 rounded-full bg-voile/10"
          style={{ boxShadow: "var(--reflet), 0 0 22px -4px var(--mood)" }}
          animate={{ x: current * 48 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        />
        {PAGES.map(({ href, label, Icon }, i) => (
          <Link
            key={href}
            href={href}
            aria-label={label}
            aria-current={i === current ? "page" : undefined}
            transitionTypes={i === current ? undefined : [i > current ? "nav-forward" : "nav-back"]}
            onClick={() => haptic()}
            className={`touche relative z-10 grid h-10 w-12 place-items-center rounded-full ${i === current ? "text-craie" : "text-ombre hover:text-brume"}`}
          >
            <Icon />
          </Link>
        ))}
      </div>
    </nav>
  );
}
