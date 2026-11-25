"use client";

import { useSyncExternalStore } from "react";

/** Thème réellement affiché (« dark » ou « light »), mis à jour quand il change. */
export function useResolvedTheme(): "dark" | "light" {
  return useSyncExternalStore(
    (notify) => {
      const observer = new MutationObserver(notify);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      return () => observer.disconnect();
    },
    () => (document.documentElement.dataset.theme === "light" ? "light" : "dark"),
    () => "dark",
  );
}
