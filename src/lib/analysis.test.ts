import { describe, expect, it } from "vitest";
import { buildDemoPortfolio } from "@/lib/demo/portfolio";
import { analyze, convictions, localToday, periodSeries } from "./analysis";

describe("analyze (démo)", () => {
  const data = buildDemoPortfolio("2026-11-20");
  const snap = analyze(data, "2026-11-22");

  it("valorise le dimanche avec la clôture du vendredi et le dit", () => {
    expect(snap.story.closeDate).toBe("2026-11-20");
    expect(snap.sentence[0]).toEqual({ kind: "text", text: expect.stringMatching(/^Marchés fermés\. Vendredi 20 novembre/) });
    expect(snap.series.at(-1)!.valueEUR).toBeCloseTo(snap.totalEUR, 6);
  });

  it("regroupe les lignes par type, des ETF aux fonds", () => {
    expect(snap.groups.map((g) => g.label)).toEqual(["ETF", "Actions", "Fonds"]);
    expect(snap.groups.reduce((s, g) => s + g.totalEUR, 0)).toBeCloseTo(snap.totalEUR, 6);
    expect(snap.lines.every((l) => l.spark.length === 30)).toBe(true);
  });

  it("réduit une longue courbe sans perdre ses extrémités", () => {
    const points = periodSeries(snap.series, "Tout", snap.today, 100);
    expect(points).toHaveLength(100);
    expect(points[0]).toBe(snap.series[0]);
    expect(points.at(-1)).toBe(snap.series.at(-1));
    const week = periodSeries(snap.series, "1S", snap.today);
    expect(week.length).toBeGreaterThanOrEqual(5);
    expect(week.length).toBeLessThanOrEqual(7);
  });

  it("ressort les convictions, de la plus récente à la plus ancienne", () => {
    const list = convictions(data, "2026-11-22");
    expect(list.length).toBeGreaterThanOrEqual(5);
    expect(list[0].date >= list[1].date).toBe(true);
    expect(list.every((c) => c.sincePct !== null && c.ageDays > 0)).toBe(true);
  });

  it("donne la date locale au format ISO", () => {
    expect(localToday(new Date(2026, 10, 22, 23, 30))).toBe("2026-11-22");
  });
});
