import type { CarbAmpelPhase, DayType, FuelingPlan, Heat, Intensity, RaceDayPhase } from "../types";

export interface FuelingInput {
  durationMin: number;
  intensity: Intensity;
  heat: Heat;
  bodyWeightKg: number;
}

/*
 * Fueling-Engine - Richtwerte aus der Sporternaehrungs-Forschung (Ausdauer, v. a. Radsport):
 * - KH waehrend: <45 min ~0 | 45-75 min 15-30 g/h | 75-120 min 30-60 g/h
 *   | 2-3 h 60-90 g/h | >3 h 90-120 g/h (Glukose:Fruktose-Mix)
 * - Fluessigkeit: ~400-1200 ml/h je nach Intensitaet und Hitze
 * - Natrium: ~300-700 mg/h (bei Hitze mehr)
 * - Nach der Einheit: 1-1,2 g/kg KH + 20-40 g Protein innerhalb 60 min
 * - Tagesziel: 4-8+ g/kg/Tag, periodisiert nach Belastung
 */
export function calculateFuelingPlan(input: FuelingInput): FuelingPlan {
  const hours = input.durationMin / 60;
  const kg = input.bodyWeightKg;

  // --- Kohlenhydrate waehrend (g/h) ---
  let carbsPerHour: number;
  if (input.durationMin < 45) {
    carbsPerHour = 0;
  } else if (input.durationMin < 75) {
    carbsPerHour = input.intensity === "high" ? 30 : 15;
  } else if (input.durationMin <= 120) {
    carbsPerHour = input.intensity === "low" ? 30 : input.intensity === "moderate" ? 45 : 60;
  } else if (input.durationMin <= 180) {
    carbsPerHour = input.intensity === "low" ? 50 : input.intensity === "moderate" ? 70 : 90;
  } else {
    carbsPerHour = input.intensity === "low" ? 60 : input.intensity === "moderate" ? 90 : 105;
  }

  // --- Fluessigkeit (ml/h) ---
  const intensityFluid = input.intensity === "low" ? 400 : input.intensity === "moderate" ? 550 : 750;
  const fluidPerHour = Math.round(intensityFluid * (input.heat === "hot" ? 1.35 : 1));

  // --- Natrium (mg/h) ---
  const sodiumBase = input.intensity === "low" ? 300 : input.intensity === "moderate" ? 450 : 600;
  const sodiumPerHour = Math.round(sodiumBase * (input.heat === "hot" ? 1.3 : 1));

  // --- Vor der Einheit (1-3 h vorher) ---
  const preCarbsG = Math.round(kg * (hours > 1.5 || input.intensity === "high" ? 1.5 : 1.0));
  const preFluidMl = Math.round(kg * 7);

  // --- Regeneration ---
  const sweatLPerHour = (fluidPerHour / 1000) * 0.9;
  const estimatedSweatL = Math.round(sweatLPerHour * hours * 10) / 10;
  const postCarbsG = Math.round(kg * (input.intensity === "high" ? 1.2 : 1.0));
  const postProteinG = input.durationMin >= 60 ? 25 : 15;
  const postFluidMl = Math.round(estimatedSweatL * 1500);

  // --- Tagesperiodisierung (fuel for the work required) ---
  const dailyCarbsPerKg = input.intensity === "low" ? 4 : input.intensity === "moderate" ? 6 : 8;

  const strategy = buildStrategy(input, carbsPerHour, fluidPerHour, sodiumPerHour);

  return {
    preCarbsG,
    preFluidMl,
    carbsPerHour,
    totalCarbsG: Math.round(carbsPerHour * Math.max(0, hours - 0.25)),
    fluidPerHour,
    totalFluidMl: Math.round(fluidPerHour * hours),
    sodiumPerHour,
    totalSodiumMg: Math.round(sodiumPerHour * hours),
    postCarbsG,
    postProteinG,
    postFluidMl,
    estimatedSweatL,
    dailyCarbsPerKg,
    strategy
  };
}

function buildStrategy(input: FuelingInput, carbs: number, fluid: number, sodium: number): string {
  if (input.durationMin < 45) {
    return "Kurze Einheit: kein Fueling noetig. Vorher ausreichend trinken, bei Intensitaet optional Mundspuelung mit KH-Getraenk.";
  }
  const lines: string[] = [];
  lines.push("Waehrend: " + carbs + " g KH/h und ca. " + fluid + " ml/h trinken (" + sodium + " mg Natrium/h).");
  if (carbs >= 60) {
    lines.push("Ab 60 g/h: Glukose-Fruktose-Mix (Mischquelle) nutzen, z. B. Gel plus Iso-Getraenk.");
  }
  if (input.heat === "hot") {
    lines.push("Heisse Bedingungen: Elektrolyt-Getraenk statt purem Wasser, alle 15-20 min trinken.");
  }
  return lines.join(" ");
}

/*
 * Carb-Coding-Ampel (DUO-28):
 * Gruen = KH-Betonung wichtig · Gelb = moderat · Rot = kein Extra-Fueling noetig.
 * Jede Phase liefert eine Erklaerung, damit wechselnde Ziele nicht wie Bugs wirken.
 */
export function dayTypeFor(minutes: number, maxIntensity: Intensity, longestMin: number): DayType {
  if (minutes < 45) return "rest";
  if (longestMin >= 90 && maxIntensity === "high") return "race";
  return "load";
}

export function dayTypeLabel(dayType: DayType): string {
  if (dayType === "rest") return "Ruhetag";
  if (dayType === "race") return "Wettkampftag";
  return "Belastungstag";
}

export function buildCarbAmpel(input: FuelingInput): CarbAmpelPhase[] {
  const plan = calculateFuelingPlan(input);
  const phases: CarbAmpelPhase[] = [];

  // Vor der Einheit
  if (input.durationMin < 45) {
    phases.push({
      key: "pre",
      label: "Vor der Einheit",
      color: "yellow",
      carbsG: plan.preCarbsG,
      explanation: "Kurze Einheit: eine normale Mahlzeit genuegt, die Speicher sind bereits gefuellt."
    });
  } else {
    phases.push({
      key: "pre",
      label: "Vor der Einheit",
      color: "green",
      carbsG: plan.preCarbsG,
      explanation: "KH-reiche Mahlzeit 1-3 h vorher laedt die Glykogenspeicher fuer die kommende Belastung."
    });
  }

  // Waehrend
  if (plan.carbsPerHour >= 60) {
    phases.push({
      key: "during",
      label: "Waehrend",
      color: "green",
      carbsG: plan.totalCarbsG,
      explanation: "Lange bzw. intensive Einheit: " + plan.carbsPerHour + " g KH/h sichern die Leistung und schuetzen die Speicher (Glukose-Fruktose-Mix)."
    });
  } else if (plan.carbsPerHour >= 15) {
    phases.push({
      key: "during",
      label: "Waehrend",
      color: "yellow",
      carbsG: plan.totalCarbsG,
      explanation: "Mittlere Belastung: moderates Fueling mit " + plan.carbsPerHour + " g KH/h reicht aus, Trinken nicht vergessen."
    });
  } else {
    phases.push({
      key: "during",
      label: "Waehrend",
      color: "red",
      carbsG: 0,
      explanation: "Unter 45 min: kein KH-Fueling noetig - Wasser genuegt, bei hoher Intensitaet optional KH-Mundspuelung."
    });
  }

  // Danach
  if (input.durationMin >= 60) {
    phases.push({
      key: "post",
      label: "Danach (60-min-Fenster)",
      color: "green",
      carbsG: plan.postCarbsG,
      explanation: "Offenes Regenerationsfenster: " + plan.postCarbsG + " g KH plus " + plan.postProteinG + " g Protein innerhalb von 60 min starten die Erholung."
    });
  } else {
    phases.push({
      key: "post",
      label: "Danach",
      color: "yellow",
      carbsG: plan.postCarbsG,
      explanation: "Kurze Belastung: die naechste normale Mahlzeit genuegt als Regeneration."
    });
  }

  return phases;
}

export function restOfDayPhase(dayType: DayType, weightKg: number): CarbAmpelPhase {
  if (dayType === "race") {
    return {
      key: "restofday",
      label: "Restlicher Tag",
      color: "green",
      carbsG: Math.round(weightKg * 8),
      explanation: "Wettkampftag: KH-Betonung ueber den ganzen Tag halten, damit die Speicher bis zur naechsten Belastung gefuellt bleiben."
    };
  }
  if (dayType === "rest") {
    return {
      key: "restofday",
      label: "Restlicher Tag",
      color: "yellow",
      carbsG: Math.round(weightKg * 4),
      explanation: "Ruhetag: moderate KH-Menge, Fokus auf Protein und Gemuese - die Speicher muessen heute nicht voll sein."
    };
  }
  return {
    key: "restofday",
    label: "Restlicher Tag",
    color: "green",
    carbsG: Math.round(weightKg * 6),
    explanation: "Belastungstag: ausgewogene KH-Zufuhr unterstuetzt die Trainingsanpassung und die naechste Einheit."
  };
}

/*
 * Race-Day-Wizard (DUO-29):
 * Schritt-fuer-Schritt-Renntagsplan aus einer geplanten Renn-Session,
 * alle Empfehlungen stammen aus der Fueling-Engine.
 */
export function buildRaceDayPlan(input: FuelingInput): RaceDayPhase[] {
  const plan = calculateFuelingPlan(input);
  const kg = input.bodyWeightKg;

  const duringItems: string[] = [
    "Zielrate: " + plan.carbsPerHour + " g KH/h" + (plan.carbsPerHour >= 60 ? " (Glukose-Fruktose-Mix)" : ""),
    "Trinkrate: ca. " + plan.fluidPerHour + " ml/h",
    "Natrium: ca. " + plan.sodiumPerHour + " mg/h",
    "Alle 15-20 min trinken, Gele auf 20-30 g Portionen verteilen"
  ];
  if (input.heat === "hot") {
    duringItems.push("Hitze: Elektrolyt-Getraenk statt Wasser, alle 20 min 300-500 ml anstreben");
  }

  return [
    {
      key: "eve",
      title: "Vorabend",
      window: "18:00-21:00 am Tag zuvor",
      items: [
        "KH-reiches Abendessen: ca. " + Math.round(kg * 1.5) + " g KH (Reis, Nudeln, Kartoffeln)",
        "Ueber den Tag ca. " + Math.round(kg * 35) + " ml trinken, Urin hell halten",
        "Keine neuen Lebensmittel testen, Fett und Huesen moderat halten"
      ]
    },
    {
      key: "morning",
      title: "Renntag-Morgen",
      window: "3 h bis 30 min vor dem Start",
      items: [
        "Fruehstueck 3 h vorher: ca. " + plan.preCarbsG + " g KH",
        "Bis 2 h vorher ca. " + plan.preFluidMl + " ml trinken",
        "30 min vorher: kleiner KH-Snack (20-30 g) oder Schluck Iso-Getraenk"
      ]
    },
    {
      key: "prestart",
      title: "Vor dem Start",
      window: "letzte 15 min",
      items: [
        "Beide Flaschen voll: Zielrate " + plan.fluidPerHour + " ml/h",
        "Gele und Riegel griffbereit: " + plan.carbsPerHour + " g KH/h",
        "Optional: KH-Mundspuelung gegen Nervositaet"
      ]
    },
    {
      key: "during",
      title: "Waehrend des Rennens",
      window: input.durationMin + " min Renndauer",
      items: duringItems
    },
    {
      key: "after",
      title: "Danach (Recovery)",
      window: "0-60 min nach dem Ziel",
      items: [
        plan.postCarbsG + " g KH + " + plan.postProteinG + " g Protein (z. B. Recovery-Shake)",
        "Ca. " + plan.postFluidMl + " ml Fluessigkeit (Schweissverlust ~" + plan.estimatedSweatL + " l)",
        "Fettes und Alkohol erst nach dem 60-min-Fenster"
      ]
    }
  ];
}

/*
 * Youth Mode (DUO-31) - jugendspezifische Anpassungen (U15-U19):
 * Heranwachsende Athleten brauchen im Wachstum mehr Energie und reagieren
 * empfindlicher auf Energiedefizite (RED-S-Risiko). Kernprinzipien:
 * - Ruhetage: keine harte KH-Reduktion (5 statt 4 g/kg)
 * - Belastungs-/Renntage: staerkere KH-Betonung (7 bzw. 8 g/kg)
 * - Protein: 1,7 g/kg im Wachstum (statt 1,6)
 * - RED-S-Fruehwarnung, wenn die Zufuhr deutlich hinter dem Ziel zurueckbleibt
 */
export function ageFromBirthYear(birthYear: number | null | undefined, now?: Date): number | null {
  if (birthYear === null || birthYear === undefined) return null;
  const year = now ? now.getFullYear() : new Date().getFullYear();
  if (!Number.isFinite(birthYear) || birthYear < 1900 || birthYear > year) return null;
  return year - birthYear;
}

export function isYouthAthlete(ageYears: number | null | undefined): boolean {
  return ageYears !== null && ageYears !== undefined && ageYears >= 13 && ageYears <= 19;
}

export function youthDailyCarbsPerKg(dayType: DayType): number {
  if (dayType === "rest") return 5;
  if (dayType === "race") return 8;
  return 7;
}

export interface DailyTargets {
  carbsPerKg: number;
  carbsG: number;
  proteinPerKg: number;
  proteinG: number;
}

export function dailyTargetsFor(dayType: DayType, weightKg: number, isYouth: boolean): DailyTargets {
  const carbsPerKg = isYouth
    ? youthDailyCarbsPerKg(dayType)
    : dayType === "rest" ? 4 : dayType === "load" ? 6 : 8;
  const proteinPerKg = isYouth ? 1.7 : 1.6;
  return {
    carbsPerKg,
    carbsG: Math.round(weightKg * carbsPerKg),
    proteinPerKg,
    proteinG: Math.round(weightKg * proteinPerKg)
  };
}

export interface RedsCheckInput {
  dayType: DayType;
  trainingMinutes: number;
  loggedCarbsG: number;
  targetCarbsG: number;
  isYouth: boolean;
}

export function buildRedsWarnings(input: RedsCheckInput): string[] {
  const warnings: string[] = [];
  if (input.targetCarbsG <= 0) return warnings;
  const ratio = input.loggedCarbsG / input.targetCarbsG;

  if (input.trainingMinutes >= 90 && ratio < 0.5) {
    warnings.push(
      "Lange Belastung mit zu wenig Energie: Bei " + input.trainingMinutes + " min Training liegen erst " +
        Math.round(ratio * 100) + "% des KH-Ziels. Jetzt kohlenhydratreich nachladen – Regeneration, Immunsystem und die nächste Einheit hängen daran."
    );
  }
  if (input.dayType === "rest" && ratio < 0.4) {
    warnings.push(
      "Ruhetag ist kein Fastentag: Der Körper braucht heute Energie für Regeneration" +
        (input.isYouth ? " und Wachstum" : "") + ". Verteile mindestens " +
        Math.round(input.targetCarbsG * 0.4) + " g KH über den Tag."
    );
  }
  if (input.isYouth && ratio < 0.5 && input.trainingMinutes >= 60) {
    warnings.push(
      "Jugend-Athlet (U15-U19): Zu geringe Energiezufuhr erhöht das RED-S-Risiko – Wachstum, Knochenstärke, Hormonhaushalt und Leistung können leiden. Wenn du dein Ziel häufig nicht erreichst, sprich mit einem Arzt oder einer Ernährungsfachkraft."
    );
  }
  return warnings;
}

/*
 * Energieziel-Engine (DUO-33): Tagesenergiebedarf und RED-S-Energiebilanz.
 * Schaetzung, nicht Messung - jeder Bestandteil ist im Tooltip erklaert:
 * - Grundumsatz (RMR) nach Schofield-Gleichungen (maennlich, altersabhaengig)
 * - Alltag: + 40% auf den Grundumsatz (leicht aktiver Tag, PA-Faktor 1,4)
 * - Training: METs (Radsport: leicht 6, mittel 8, hoch 10),
 *   kcal/min = MET x 3,5 x kg / 200
 * - Bilanz aus geloggten Makros (4 kcal/g KH, 4 kcal/g Protein, 9 kcal/g Fett)
 */
export interface DailyEnergyTarget {
  rmrKcal: number;
  dailyLifeKcal: number;
  trainingKcal: number;
  totalKcal: number;
}

export function estimateDailyEnergyNeed(input: {
  weightKg: number;
  ageYears: number | null;
  trainingMinutes: number;
  maxIntensity: Intensity;
}): DailyEnergyTarget {
  const w = input.weightKg;
  const age = input.ageYears === null ? 30 : input.ageYears;
  // Grundumsatz (Schofield, maennlich, vereinfacht)
  let rmr: number;
  if (age >= 10 && age <= 17) {
    rmr = 17.7 * w + 657;
  } else if (age <= 29) {
    rmr = 15.1 * w + 692;
  } else {
    rmr = 11.5 * w + 873;
  }
  const dailyLife = rmr * 0.4;
  const met = input.maxIntensity === "high" ? 10 : input.maxIntensity === "moderate" ? 8 : 6;
  const training = (met * 3.5 * w / 200) * input.trainingMinutes;
  return {
    rmrKcal: Math.round(rmr),
    dailyLifeKcal: Math.round(dailyLife),
    trainingKcal: Math.round(training),
    totalKcal: Math.round(rmr + dailyLife + training)
  };
}

export interface EnergyBalance {
  loggedKcal: number;
  targetKcal: number;
  pct: number;
  level: "ok" | "watch" | "risk";
}

export function energyBalanceFor(
  logged: { carbsG: number; proteinG: number; fatG: number },
  targetKcal: number,
  isYouth: boolean
): EnergyBalance {
  const loggedKcal = Math.round(logged.carbsG * 4 + logged.proteinG * 4 + logged.fatG * 9);
  const pct = targetKcal > 0 ? Math.round((loggedKcal / targetKcal) * 100) : 0;
  // Jugendliche: engere Schwellen (RED-S-Schutz, Wachstum)
  const okAt = isYouth ? 85 : 75;
  const watchAt = isYouth ? 65 : 55;
  const level = pct >= okAt ? "ok" : pct >= watchAt ? "watch" : "risk";
  return { loggedKcal, targetKcal, pct, level };
}
