import { describe, expect, it } from "vitest";
import { calculateFuelingPlan } from "./fueling";

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
