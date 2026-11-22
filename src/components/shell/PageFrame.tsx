import { ViewTransition, type ReactNode } from "react";

/** Enveloppe de chaque page : le contenu glisse dans le sens de la navigation. */
export function PageFrame({ children }: { children: ReactNode }) {
  return (
    <ViewTransition
      enter={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
      exit={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
      default="none"
    >
      <main>{children}</main>
    </ViewTransition>
  );
}
