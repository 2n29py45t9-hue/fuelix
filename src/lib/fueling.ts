import type { FuelingPlan, Heat, Intensity } from "../types";

export interface FuelingInput {
  durationMin: number;
  intensity: Intensity;
  heat: Heat;
  bodyWeightKg: number;
}

/*
 * Fueling-Engine – Richtwerte aus der Sporternährungs-Forschung (Ausdauer, v. a. Radsport):
 * - KH während: <45 min ~0 | 45–75 min 15–30 g/h | 75–120 min 30–60 g/h
 *   | 2–3 h 60–90 g/h | >3 h 90–120 g/h (Glukose:Fruktose-Mix)
 * - Flüssigkeit: ~400–1200 ml/h je nach Intensität und Hitze
 * - Natrium: ~300–700 mg/h (bei Hitze mehr)
 * - Nach der Einheit: 1–1,2 g/kg KH + 20–40 g Protein innerhalb 60 min
 * - Tagesziel: 4–8+ g/kg/Tag, periodisiert nach Belastung
 */
export function calculateFuelingPlan(input: FuelingInput): FuelingPlan {
  const hours = input.durationMin / 60;
  const kg = input.bodyWeightKg;

  // --- Kohlenhydrate während (g/h) ---
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

  // --- Flüssigkeit (ml/h) ---
  const intensityFluid = input.intensity === "low" ? 400 : input.intensity === "moderate" ? 550 : 750;
  const fluidPerHour = Math.round(intensityFluid * (input.heat === "hot" ? 1.35 : 1));

  // --- Natrium (mg/h) ---
  const sodiumBase = input.intensity === "low" ? 300 : input.intensity === "moderate" ? 450 : 600;
  const sodiumPerHour = Math.round(sodiumBase * (input.heat === "hot" ? 1.3 : 1));

  // --- Vor der Einheit (1–3 h vorher) ---
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
    return "Kurze Einheit: kein Fueling nötig. Vorher ausreichend trinken, bei Intensität optional Mundspülung mit KH-Getränk.";
  }
  const lines: string[] = [];
  lines.push("Während: " + carbs + " g KH/h und ca. " + fluid + " ml/h trinken (" + sodium + " mg Natrium/h).");
  if (carbs >= 60) {
    lines.push("Ab 60 g/h: Glukose-Fruktose-Mix (Mischquelle) nutzen, z. B. Gel plus Iso-Getränk.");
  }
  if (input.heat === "hot") {
    lines.push("Heiße Bedingungen: Elektrolyt-Getränk statt purem Wasser, alle 15–20 min trinken.");
  }
  return lines.join(" ");
}
