import { describe, expect, it } from "vitest";
import { analyze } from "./analysis";
import { answer } from "./chat";
import { buildDemoPortfolio } from "./demo/portfolio";

const data = buildDemoPortfolio("2026-11-20");
const snapshot = analyze(data, "2026-11-22");
const ctx = { snapshot, plans: [{ id: "p", instrumentId: "IE00B4L5Y983", amountEUR: 300, dayOfMonth: 2, start: "2025-01-01" }], expectedReturn: 0.05 };

describe("demande à ton patrimoine", () => {
  it("refuse de conseiller un achat ou une vente", () => {
    const a = answer("Est-ce que je dois vendre Nvidia ?", ctx);
    expect(a.topic).toBe("conseil");
    expect(a.text).toMatch(/jamais quoi acheter ou vendre/);
  });

  it("répond avec les vrais chiffres", () => {
    expect(answer("Combien vaut mon patrimoine ?", ctx).text).toContain("Ton patrimoine vaut");
    expect(answer("Quelle part de mon argent est en dollars ?", ctx).topic).toBe("devise");
    expect(answer("combien je verse chaque mois", ctx).text).toContain("300");
    expect(answer("Combien me coûtent mes frais ?", ctx).topic).toBe("frais");
    expect(answer("Quel est mon plus gros angle mort ?", ctx).topic).toBe("risque");
    expect(answer("Que s'est-il passé aujourd'hui ?", ctx).text).toMatch(/Vendredi 20 novembre/);
  });

  it("dit ce qu'il sait faire quand il ne comprend pas", () => {
    expect(answer("Quelle heure est-il à Tokyo ?", ctx).topic).toBe("inconnu");
  });
});
