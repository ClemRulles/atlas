"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { useEffect, type ReactNode } from "react";
import { IconChat, IconEye, IconEyeOff, IconOwn, IconPlus, IconToday, IconWhatIf } from "@/components/ui/icons";
import { AtlasProvider, useAtlas } from "@/lib/store";
import { auroraFor, haptic } from "@/lib/ui";
import { AddSheet, ChatSheet, ModeSheet } from "./sheets";

export const PAGES = [
  { href: "/", label: "Aujourd'hui", Icon: IconToday },
  { href: "/possessions", label: "Ce que tu possèdes", Icon: IconOwn },
  { href: "/et-si", label: "Et si", Icon: IconWhatIf },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AtlasProvider>
      <Aurora />
      <div className="relative z-10 mx-auto w-full max-w-6xl pb-36 pl-[max(20px,env(safe-area-inset-left))] pr-[max(20px,env(safe-area-inset-right))] pt-[calc(14px+env(safe-area-inset-top))] sm:pl-[max(32px,env(safe-area-inset-left))] sm:pr-[max(32px,env(safe-area-inset-right))]">
        <TopBar />
        {children}
      </div>
      <Dock />
      <AddSheet />
      <ChatSheet />
      <ModeSheet />
    </AtlasProvider>
  );
}

/** Lumière d'ambiance : sa teinte suit la variation du jour. */
function Aurora() {
  const { snapshot } = useAtlas();
  useEffect(() => {
    const { a1, a2, a3, mood } = auroraFor(snapshot?.dayPct ?? 0);
    const root = document.documentElement.style;
    root.setProperty("--a1", a1);
    root.setProperty("--a2", a2);
    root.setProperty("--a3", a3);
    root.setProperty("--mood", mood);
  }, [snapshot?.dayPct]);
  return (
    <div className="aurore" aria-hidden="true">
      <i />
      <i />
      <i />
    </div>
  );
}

function TopBar() {
  const { mode, discreet, toggleDiscreet, openSheet } = useAtlas();
  return (
    <header className="flex items-center justify-between gap-3 pb-6">
      <span className="font-serif text-[22px] italic tracking-[-0.01em]">Atlas</span>
      <div className="flex items-center gap-2">
        {mode && (
          <button
            type="button"
            onClick={() => openSheet("mode")}
            className="touche verre flex h-10 items-center gap-2 rounded-full px-4 text-[13px] text-brume"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${mode === "demo" ? "bg-lavande" : "bg-menthe"}`} />
            {mode === "demo" ? "Portefeuille démo" : "Mon portefeuille"}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            haptic();
            toggleDiscreet();
          }}
          aria-pressed={discreet}
          aria-label={discreet ? "Afficher les montants" : "Mode discret : flouter les montants"}
          className={`touche grid h-10 w-10 place-items-center rounded-full ${discreet ? "bg-white text-nuit" : "verre text-brume"}`}
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
      <button type="button" aria-label="Ajouter une position" onClick={() => (haptic(), openSheet("add"))} className="touche grid h-12 w-12 place-items-center rounded-full bg-white text-nuit shadow-[0_10px_30px_-8px_rgba(255,255,255,0.35)]">
        <IconPlus />
      </button>
      <div className="verre-sombre relative flex rounded-full p-[5px]">
        <motion.span
          aria-hidden="true"
          className="absolute top-[5px] left-[5px] h-10 w-12 rounded-full bg-white/10"
          style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,.14), 0 0 22px -4px var(--mood)" }}
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
