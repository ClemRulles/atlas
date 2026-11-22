import { describe, expect, it } from "vitest";
import { lifeSlices } from "./life-slices";
import type { Expense } from "./types";

const expenses: Expense[] = [
  { id: "abonnements", label: "Abonnements", monthly: 64 },
  { id: "courses", label: "Courses", monthly: 420 },
  { id: "loyer", label: "Loyer", monthly: 950 },
];

describe("lifeSlices", () => {
  it("convertit le rendement attendu en dépenses couvertes, dans l'ordre", () => {
    const life = lifeSlices(184_320, 0.05, expenses);
    expect(life.monthlyIncomeEUR).toBeCloseTo(768, 9);
    expect(life.slices.map((s) => s.ratio)).toEqual([1, 1, expect.closeTo(284 / 950, 9)]);
    expect(life.slices[2].coveredMonthly).toBeCloseTo(284, 9);
    expect(life.coveredCount).toBe(2);
  });

  it("donne le prochain palier et ce qu'il manque pour l'atteindre", () => {
    const life = lifeSlices(184_320, 0.05, expenses);
    expect(life.next?.expense.id).toBe("loyer");
    expect(life.next?.capitalNeededEUR).toBeCloseTo((1434 * 12) / 0.05, 6); // 344 160 €
    expect(life.next?.missingEUR).toBeCloseTo(344_160 - 184_320, 6);
    expect(life.slices.map((s) => s.capitalNeededEUR)).toEqual([
      expect.closeTo(15_360, 6),
      expect.closeTo(116_160, 6),
      expect.closeTo(344_160, 6),
    ]);
  });

  it("n'a plus de palier quand tout est couvert", () => {
    const life = lifeSlices(400_000, 0.05, expenses);
    expect(life.coveredCount).toBe(3);
    expect(life.next).toBeNull();
  });

  it("ne promet rien avec un rendement attendu nul ou un patrimoine vide", () => {
    const flat = lifeSlices(184_320, 0, expenses);
    expect(flat.monthlyIncomeEUR).toBe(0);
    expect(flat.next).toEqual({ expense: expenses[0], capitalNeededEUR: null, missingEUR: null });
    expect(lifeSlices(0, 0.05, expenses).coveredCount).toBe(0);
  });

  it("ignore les dépenses sans montant", () => {
    const life = lifeSlices(10_000, 0.06, [{ id: "vide", label: "Vide", monthly: 0 }, ...expenses]);
    expect(life.slices).toHaveLength(3);
    expect(life.slices[0].ratio).toBeCloseTo(50 / 64, 9);
  });
});
