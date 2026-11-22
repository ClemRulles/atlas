"use client";

import { AnimatePresence, motion, useDragControls } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useEscape } from "@/components/ui/primitives";

/** Feuille qui monte du bas sur téléphone, panneau centré sur ordinateur. Glisser vers le bas pour fermer. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEscape(onClose, open);
  const [mounted, setMounted] = useState(false);
  const controls = useDragControls();
  // eslint-disable-next-line react-hooks/set-state-in-effect -- le portail n'existe qu'au navigateur
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  // Portail vers <body> : la feuille passe au-dessus de la barre de navigation, quel que soit l'empilement de la page.
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
          <motion.button
            type="button"
            aria-label="Fermer"
            className="absolute inset-0 bg-black/55 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="relative max-h-[88dvh] w-full overflow-y-auto rounded-t-[32px] border border-white/10 bg-[#0d0f17]/95 px-5 pt-3 pb-[calc(28px+env(safe-area-inset-bottom))] shadow-[0_-20px_80px_-20px_rgba(0,0,0,0.9)] backdrop-blur-2xl sm:max-w-lg sm:rounded-[32px] sm:pb-7"
            initial={{ y: "100%", opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            drag="y"
            dragListener={false}
            dragControls={controls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => (info.offset.y > 110 || info.velocity.y > 600) && onClose()}
          >
            {/* Poignée : on la tire vers le bas pour fermer, le reste de la feuille défile normalement. */}
            <div className="-mx-5 -mt-3 mb-2 flex cursor-grab touch-none justify-center pt-3 pb-3 sm:hidden" onPointerDown={(e) => controls.start(e)}>
              <div className="h-1.5 w-10 rounded-full bg-white/20" />
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
