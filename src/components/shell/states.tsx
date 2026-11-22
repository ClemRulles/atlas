"use client";

import { useAtlas } from "@/lib/store";

/** Silhouettes lumineuses pendant le démarrage. */
export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Chargement">
      <div className="silhouette h-[118px] w-full max-w-xl" />
      <div className="silhouette h-14 w-64" />
      <div className="silhouette h-[170px] w-full" />
      <div className="silhouette h-[220px] w-full rounded-[28px]" />
    </div>
  );
}

/** Portefeuille réel encore vide. */
export function EmptyPortfolio({ question }: { question: string }) {
  const { openSheet, setMode } = useAtlas();
  return (
    <div className="flex max-w-xl flex-col gap-5 pt-6">
      <span className="repere">{question}</span>
      <h1 className="font-serif text-[40px] leading-[1.05] font-light tracking-[-0.02em] text-balance sm:text-[52px]">
        Ton portefeuille est encore vide.
      </h1>
      <p className="text-[16px] leading-relaxed text-brume">
        Ajoute ta première position : un nom ou un ISIN, une quantité, une date et un prix. Tout reste sur ton téléphone.
      </p>
      <div className="flex flex-wrap gap-3 pt-2">
        <button type="button" onClick={() => openSheet("add")} className="touche rounded-full bg-white px-6 py-3.5 text-[15px] font-medium text-nuit">
          Ajouter une position
        </button>
        <button type="button" onClick={() => setMode("demo")} className="touche verre rounded-full px-6 py-3.5 text-[15px] text-brume">
          Revoir la démo
        </button>
      </div>
    </div>
  );
}
