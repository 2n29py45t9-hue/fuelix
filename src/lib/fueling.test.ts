import { describe, expect, it } from "vitest";
import { intensityFromStrava, mapActivityToSession, sportFromStrava, type StravaActivity } from "./stravaMap";
import { ageFromBirthYear, buildCarbAmpel, buildRaceDayPlan, buildRedsWarnings, calculateFuelingPlan, dailyTargetsFor, dayTypeFor, dayTypeLabel, energyBalanceFor, estimateDailyEnergyNeed, inferLogPhase, isYouthAthlete, mealPlanFor, reallocateMealPlan, restOfDayPhase, youthDailyCarbsPerKg } from "./fueling";
import { overridesForDate, slotsForDate } from "./schedule";
import type { MealOverride, MealSlot } from "../types";

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

describe("Race-Day-Wizard (DUO-29)", () => {
  it("erzeugt fuenf Phasen in richtiger Reihenfolge", () => {
    const plan = buildRaceDayPlan({ durationMin: 150, intensity: "high", heat: "normal", bodyWeightKg: 70 });
    expect(plan.map((p) => p.key)).toEqual(["eve", "morning", "prestart", "during", "after"]);
  });

  it("Waehrend-Phase kennt Zielraten aus der Engine", () => {
    const plan = buildRaceDayPlan({ durationMin: 150, intensity: "high", heat: "normal", bodyWeightKg: 70 });
    const during = plan.find((p) => p.key === "during");
    expect(during?.items.join(" ")).toContain("90 g KH/h");
    expect(during?.items.join(" ")).toContain("Glukose-Fruktose-Mix");
  });

  it("Hitze ergaennt Elektrolyt-Hinweis, Recovery enthaelt Protein", () => {
    const plan = buildRaceDayPlan({ durationMin: 120, intensity: "high", heat: "hot", bodyWeightKg: 70 });
    const during = plan.find((p) => p.key === "during");
    expect(during?.items.join(" ")).toContain("Elektrolyt-Getraenk");
    const after = plan.find((p) => p.key === "after");
    expect(after?.items.join(" ")).toContain("Protein");
  });
});

describe("Youth Mode (DUO-31)", () => {
  const now = new Date("2026-06-15T12:00:00Z");

  it("Altersberechnung aus Geburtsjahr und Jugend-Erkennung", () => {
    expect(ageFromBirthYear(2008, now)).toBe(18);
    expect(ageFromBirthYear(2013, now)).toBe(13);
    expect(isYouthAthlete(ageFromBirthYear(2008, now))).toBe(true);
    expect(isYouthAthlete(ageFromBirthYear(2006, now))).toBe(false);
    expect(isYouthAthlete(ageFromBirthYear(2014, now))).toBe(false);
    expect(isYouthAthlete(null)).toBe(false);
    expect(ageFromBirthYear(2030, now)).toBe(null);
  });

  it("Jugend-Ziele liegen hoeher: Ruhetag 5, Belastung 7, Rennen 8 g/kg", () => {
    expect(youthDailyCarbsPerKg("rest")).toBe(5);
    expect(youthDailyCarbsPerKg("load")).toBe(7);
    expect(youthDailyCarbsPerKg("race")).toBe(8);
  });

  it("dailyTargetsFor: Jugend vs. Erwachsener", () => {
    const youth = dailyTargetsFor("rest", 60, true);
    const adult = dailyTargetsFor("rest", 60, false);
    expect(youth.carbsG).toBe(300);
    expect(adult.carbsG).toBe(240);
    expect(youth.proteinG).toBe(102);
    expect(adult.proteinG).toBe(96);
  });

  it("RED-S-Warnungen bei Unter-Ernaehrung, Ruhe bei ausreichender Zufuhr", () => {
    const warnings = buildRedsWarnings({ dayType: "load", trainingMinutes: 120, loggedCarbsG: 100, targetCarbsG: 480, isYouth: true });
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.join(" ")).toContain("RED-S");
    const ok = buildRedsWarnings({ dayType: "load", trainingMinutes: 120, loggedCarbsG: 450, targetCarbsG: 480, isYouth: true });
    expect(ok.length).toBe(0);
  });

  it("Ruhetag-Warnung formuliert fuer Jugend das Wachstum mit", () => {
    const youth = buildRedsWarnings({ dayType: "rest", trainingMinutes: 0, loggedCarbsG: 50, targetCarbsG: 300, isYouth: true });
    expect(youth.join(" ")).toContain("Wachstum");
    const adult = buildRedsWarnings({ dayType: "rest", trainingMinutes: 0, loggedCarbsG: 50, targetCarbsG: 240, isYouth: false });
    expect(adult.join(" ")).not.toContain("Wachstum");
  });
});

describe("Energieziel-Engine (DUO-33)", () => {
  it("Grundumsatz nach Alter (Schofield, vereinfacht)", () => {
    expect(estimateDailyEnergyNeed({ weightKg: 60, ageYears: 15, trainingMinutes: 0, maxIntensity: "low" }).rmrKcal).toBe(1719);
    expect(estimateDailyEnergyNeed({ weightKg: 70, ageYears: 22, trainingMinutes: 0, maxIntensity: "low" }).rmrKcal).toBe(1749);
    expect(estimateDailyEnergyNeed({ weightKg: 70, ageYears: 30, trainingMinutes: 0, maxIntensity: "low" }).rmrKcal).toBe(1678);
  });

  it("Trainingskosten skalieren mit Dauer und Intensitaet (METs)", () => {
    const light = estimateDailyEnergyNeed({ weightKg: 70, ageYears: 30, trainingMinutes: 60, maxIntensity: "low" });
    const hard = estimateDailyEnergyNeed({ weightKg: 70, ageYears: 30, trainingMinutes: 120, maxIntensity: "high" });
    expect(light.trainingKcal).toBe(441);
    expect(hard.trainingKcal).toBe(1470);
    expect(hard.trainingKcal).toBeGreaterThan(light.trainingKcal);
  });

  it("Zielwert ist Summe aus Grundumsatz, Alltag und Training", () => {
    const e = estimateDailyEnergyNeed({ weightKg: 70, ageYears: 30, trainingMinutes: 90, maxIntensity: "moderate" });
    expect(e.totalKcal).toBe(e.rmrKcal + e.dailyLifeKcal + e.trainingKcal);
  });

  it("Energiebilanz aus Makros: 4/4/9 kcal pro Gramm", () => {
    const b = energyBalanceFor({ carbsG: 200, proteinG: 100, fatG: 60 }, 2500, false);
    expect(b.loggedKcal).toBe(1740);
    expect(b.pct).toBe(70);
    expect(b.level).toBe("watch");
  });

  it("Jugend-Schwellen sind strenger als Erwachsenen-Schwellen", () => {
    const adult = energyBalanceFor({ carbsG: 200, proteinG: 100, fatG: 60 }, 3000, false);
    const youth = energyBalanceFor({ carbsG: 200, proteinG: 100, fatG: 60 }, 3000, true);
    expect(adult.pct).toBe(58);
    expect(adult.level).toBe("watch");
    expect(youth.level).toBe("risk");
  });

  it("Ausreichende Zufuhr ist ok, auch fuer Jugend", () => {
    const ok = energyBalanceFor({ carbsG: 300, proteinG: 120, fatG: 80 }, 3000, false);
    expect(ok.loggedKcal).toBe(2400);
    expect(ok.pct).toBe(80);
    expect(ok.level).toBe("ok");
  });
});

describe("Mahlzeiten-Periodisierung (DUO-35)", () => {
  const raster = [
    { time: "07:00", label: "Fruehstueck", primary: true },
    { time: "12:30", label: "Mittagessen", primary: true },
    { time: "15:30", label: "Snack", primary: false },
    { time: "18:30", label: "Abendessen", primary: true }
  ];

  it("Ruhetag: Restbudget nach Hauptmahlzeit-Snack-Gewichtung, Snack rot", () => {
    const plan = mealPlanFor({ slots: raster, sessions: [], weightKg: 70, dayType: "rest", isYouth: false });
    expect(plan.totalCarbsG).toBe(280);
    expect(plan.sessionFuelG).toBe(0);
    expect(plan.slots.map((s) => s.carbsG)).toEqual([79, 79, 43, 79]);
    expect(plan.slots.map((s) => s.color)).toEqual(["yellow", "yellow", "red", "yellow"]);
    expect(plan.slots[0].proteinG).toBe(28);
    expect(plan.slots[0].explanation.length).toBeGreaterThan(10);
  });

  it("Belastungstag: Session-Fuel separat, pre- und post-Anlaesse gruen", () => {
    const plan = mealPlanFor({
      slots: raster,
      sessions: [{ start: "17:00", durationMin: 90, intensity: "moderate", heat: "normal" }],
      weightKg: 70,
      dayType: "load",
      isYouth: false
    });
    expect(plan.totalCarbsG).toBe(420);
    expect(plan.sessionFuelG).toBe(56);
    const snack = plan.slots.find((s) => s.label === "Snack");
    const abend = plan.slots.find((s) => s.label === "Abendessen");
    const frueh = plan.slots.find((s) => s.label === "Fruehstueck");
    const mittag = plan.slots.find((s) => s.label === "Mittagessen");
    expect(snack?.relation).toBe("pre");
    expect(snack?.carbsG).toBe(105);
    expect(snack?.color).toBe("green");
    expect(abend?.relation).toBe("post");
    expect(abend?.carbsG).toBe(70);
    expect(abend?.proteinG).toBe(28);
    expect(abend?.color).toBe("green");
    expect(frueh?.carbsG).toBe(95);
    expect(mittag?.carbsG).toBe(95);
  });

  it("Vorabend-Anhebung vor Key-Session am Folgetag (72-h-Prinzip)", () => {
    const plain = mealPlanFor({ slots: raster, sessions: [], weightKg: 70, dayType: "rest", isYouth: false });
    const boosted = mealPlanFor({ slots: raster, sessions: [], weightKg: 70, dayType: "rest", isYouth: false, nextDayKey: true });
    const plainAbend = plain.slots.find((s) => s.label === "Abendessen");
    const boostedAbend = boosted.slots.find((s) => s.label === "Abendessen");
    expect(boostedAbend?.carbsG).toBe(Math.round((plainAbend?.carbsG ?? 0) * 1.4));
    expect(boostedAbend?.color).toBe("green");
    expect(boostedAbend?.explanation).toContain("72");
  });

  it("Reallocation: gegessene KH verschieben nur die Zukunft", () => {
    const plan = mealPlanFor({ slots: raster, sessions: [], weightKg: 70, dayType: "rest", isYouth: false });
    const re = reallocateMealPlan(plan, 200, "13:00");
    const snack = re.slots.find((s) => s.label === "Snack");
    const abend = re.slots.find((s) => s.label === "Abendessen");
    const frueh = re.slots.find((s) => s.label === "Fruehstueck");
    expect(snack?.carbsG).toBe(28);
    expect(abend?.carbsG).toBe(52);
    expect(frueh?.carbsG).toBe(79);
    expect(snack?.explanation).toContain("Neu berechnet");
  });

  it("Reallocation bei ueberschrittenem Tagesziel: keine KH mehr, rot", () => {
    const plan = mealPlanFor({ slots: raster, sessions: [], weightKg: 70, dayType: "rest", isYouth: false });
    const re = reallocateMealPlan(plan, 300, "13:00");
    const future = re.slots.filter((s) => s.time > "13:00");
    expect(future.length).toBe(2);
    future.forEach((s) => {
      expect(s.carbsG).toBe(0);
      expect(s.color).toBe("red");
    });
  });

  it("Anlass-Erkennung aus Uhrzeit und geplanter Einheit", () => {
    const sessions = [{ start: "17:00", durationMin: 90, intensity: "moderate", heat: "normal" }];
    expect(inferLogPhase(sessions, "16:00")).toBe("pre");
    expect(inferLogPhase(sessions, "17:30")).toBe("during");
    expect(inferLogPhase(sessions, "18:45")).toBe("post");
    expect(inferLogPhase(sessions, "20:00")).toBe("snack");
    expect(inferLogPhase([], "08:00")).toBe("snack");
  });
});

const activity = (over: Partial<StravaActivity>): StravaActivity => ({
  id: 123456,
  name: "Morning Ride",
  sport_type: "Ride",
  start_date: "2026-10-16T13:45:00Z",
  moving_time: 5400,
  distance: 45000,
  ...over
});

describe("Strava-Mapping (DUO-23)", () => {
  it("Ride wird zu Radsport, Dauer in Minuten, km im Namen", () => {
    const s = mapActivityToSession(activity({}));
    expect(s.sport).toBe("Radsport");
    expect(s.duration_min).toBe(90);
    expect(s.strava_id).toBe(123456);
    expect(s.notes).toContain("45 km");
    expect(s.heat).toBe("normal");
  });

  it("Lauf-, Schwimm- und Kraft-Typen werden zugeordnet, Unbekannte fallen auf den Rohwert", () => {
    expect(sportFromStrava(activity({ sport_type: "TrailRun" }))).toBe("Laufen");
    expect(sportFromStrava(activity({ sport_type: "Swim" }))).toBe("Schwimmen");
    expect(sportFromStrava(activity({ sport_type: "WeightTraining" }))).toBe("Krafttraining");
    expect(sportFromStrava(activity({ sport_type: "Zumba" }))).toBe("Zumba");
    expect(sportFromStrava(activity({ sport_type: undefined }))).toBe("Radsport");
  });

  it("Intensitaet aus Herzfrequenz: unter 120 low, bis 150 moderate, darueber high, ohne HF moderate", () => {
    expect(intensityFromStrava(110)).toBe("low");
    expect(intensityFromStrava(140)).toBe("moderate");
    expect(intensityFromStrava(165)).toBe("high");
    expect(intensityFromStrava(undefined)).toBe("moderate");
  });

  it("Datum und Startzeit werden lokal gerendert", () => {
    const s = mapActivityToSession(activity({}));
    expect(s.session_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(s.session_start).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("Kalender: Routine vs. Einzeltermin (DUO-36)", () => {
  // Routine fuer Freitag (weekday 4): Fruehstück 07:00 + Mittagessen 12:30.
  const routine: MealSlot[] = [
    { id: "r1", weekday: 4, time: "07:00", label: "Frühstück", primary_meal: true },
    { id: "r2", weekday: 4, time: "12:30", label: "Mittagessen", primary_meal: true }
  ];
  // Override fuer den 2026-10-16 (ein Freitag): Wettkampf-Frühstück + Pre-Race-Snack.
  const ovs: MealOverride[] = [
    { id: "o1", date: "2026-10-16", time: "11:00", label: "Pre-Race-Snack", primary_meal: false },
    { id: "o2", date: "2026-10-16", time: "08:00", label: "Rennfrühstück", primary_meal: true }
  ];

  it("Override gewinnt fuer sein Datum", () => {
    const slots = slotsForDate(routine, ovs, "2026-10-16");
    expect(slots.map((s) => s.label)).toEqual(["Rennfrühstück", "Pre-Race-Snack"]);
    expect(slots[0].time).toBe("08:00");
    expect(slots[0].primary).toBe(true);
    expect(slots[1].primary).toBe(false);
  });

  it("ohne Override gilt die Routine des Wochentags (gleicher Wochentag, anderes Datum)", () => {
    const slots = slotsForDate(routine, ovs, "2026-10-23");
    expect(slots.map((s) => s.label)).toEqual(["Frühstück", "Mittagessen"]);
  });

  it("anderer Wochentag ohne Routine: leer", () => {
    expect(slotsForDate(routine, ovs, "2026-10-17")).toEqual([]);
  });

  it("overridesForDate sortiert nach Uhrzeit", () => {
    const sorted = overridesForDate(ovs, "2026-10-16");
    expect(sorted.map((s) => s.time)).toEqual(["08:00", "11:00"]);
  });
});
