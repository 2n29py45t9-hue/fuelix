import type { CarbAmpelPhase, DayType, FuelingPlan, Heat, Intensity } from "../types";

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
