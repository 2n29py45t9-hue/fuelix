import { describe, expect, it } from "vitest";
import { buildCarbAmpel, calculateFuelingPlan, dayTypeFor, dayTypeLabel, restOfDayPhase } from "./fueling";

const input = (durationMin: number, intensity: "low" | "moderate" | "high", heat: "normal" | "hot", bodyWeightKg: number) =>
  calculateFuelingPlan({ durationMin, intensity, heat, bodyWeightKg });

describe("calculateFuelingPlan", () => {
  it("kurze Einheit unter 45 min: kein Fueling waehrend", () => {
    const p = input(30, "high", "normal", 70);
    expect(p.carbsPerHour).toBe(0);
    expect(p.totalCarbsG).toBe(0);
    expect(p.strategy).toContain("kein Fueling");
  });

  it("60 min mittel: 15 g/h", () => {
    expect(input(60, "moderate", "normal", 70).carbsPerHour).toBe(15);
  });

  it("90 min hoch: 60 g/h", () => {
    expect(input(90, "high", "normal", 70).carbsPerHour).toBe(60);
  });

  it("180 min hoch: 90 g/h und Mischquellen-Hinweis", () => {
    const p = input(180, "high", "normal", 70);
    expect(p.carbsPerHour).toBe(90);
    expect(p.totalCarbsG).toBe(248);
    expect(p.strategy).toContain("Glukose-Fruktose");
  });

  it("240 min hoch: 105 g/h", () => {
    expect(input(240, "high", "normal", 70).carbsPerHour).toBe(105);
  });

  it("Hitze erhoeht Fluessigkeit um 35 Prozent", () => {
    const normal = input(120, "moderate", "normal", 70);
    const hot = input(120, "moderate", "hot", 70);
    expect(hot.fluidPerHour).toBe(Math.round(normal.fluidPerHour * 1.35));
  });

  it("Hitze erhoeht Natrium um 30 Prozent", () => {
    const normal = input(120, "high", "normal", 70);
    const hot = input(120, "high", "hot", 70);
    expect(hot.sodiumPerHour).toBe(Math.round(normal.sodiumPerHour * 1.3));
  });

  it("Regeneration skaliert mit Koerpergewicht", () => {
    const p = input(120, "high", "normal", 80);
    expect(p.postCarbsG).toBe(96);
    expect(p.preCarbsG).toBe(120);
  });

  it("Tagesziel periodisiert nach Intensitaet", () => {
    expect(input(90, "low", "normal", 70).dailyCarbsPerKg).toBe(4);
    expect(input(90, "moderate", "normal", 70).dailyCarbsPerKg).toBe(6);
    expect(input(90, "high", "normal", 70).dailyCarbsPerKg).toBe(8);
  });
});

describe("Carb-Coding-Ampel (DUO-28)", () => {
  it("Ruhetag ohne nennenswertes Training", () => {
    expect(dayTypeFor(0, "low", 0)).toBe("rest");
    expect(dayTypeLabel("rest")).toBe("Ruhetag");
    expect(restOfDayPhase("rest", 70).color).toBe("yellow");
  });

  it("Belastungstag bei moderater Laengereinheit", () => {
    expect(dayTypeFor(90, "moderate", 90)).toBe("load");
    expect(dayTypeLabel("load")).toBe("Belastungstag");
  });

  it("Wettkampftag bei langer intensiver Einheit", () => {
    expect(dayTypeFor(120, "high", 120)).toBe("race");
    expect(dayTypeLabel("race")).toBe("Wettkampftag");
    expect(restOfDayPhase("race", 70).color).toBe("green");
  });

  it("Kurze Einheit: pre gelb, during rot, post gelb", () => {
    const ampel = buildCarbAmpel({ durationMin: 30, intensity: "moderate", heat: "normal", bodyWeightKg: 70 });
    expect(ampel.find((p) => p.key === "pre")?.color).toBe("yellow");
    expect(ampel.find((p) => p.key === "during")?.color).toBe("red");
    expect(ampel.find((p) => p.key === "post")?.color).toBe("yellow");
  });

  it("Lange intensive Einheit: during und post gruen, alle Phasen erklaert", () => {
    const ampel = buildCarbAmpel({ durationMin: 180, intensity: "high", heat: "normal", bodyWeightKg: 70 });
    expect(ampel.find((p) => p.key === "pre")?.color).toBe("green");
    expect(ampel.find((p) => p.key === "during")?.color).toBe("green");
    expect(ampel.find((p) => p.key === "post")?.color).toBe("green");
    ampel.forEach((p) => expect(p.explanation.length).toBeGreaterThan(10));
  });
});
