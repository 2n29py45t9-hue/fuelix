import { minutesFromHHMM } from "./date";
import type { AmpelColor, CarbAmpelPhase, DayType, FuelingPlan, Heat, Intensity, MealPhase, RaceDayPhase } from "../types";

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

/*
 * Mahlzeiten-Periodisierung (DUO-35) - Carb Coding pro Anlass:
 * Deep-Research-Grundlage (vgl. Quellenreport im Projektdokument):
 * - Tagesziel aus dailyTargetsFor (fuel for the work required, Impey et al. 2018)
 * - Session-Fuel (waehrend) bekommt ein eigenes Budget und wird separat geloggt
 *   (60-90 g/h je nach Dauer/Intensitaet, GSSI/ACSM-Baender)
 * - Letzte Mahlzeit vor der Einheit: 1,0-1,5 g/kg im Fenster bis 4 h vorher
 * - Erste Mahlzeit nach der Einheit: 1,0-1,2 g/kg + 20-30 g Protein (Recovery)
 * - Restbudget verteilt sich aufs individuelle Raster: Hauptmahlzeit 1, Snack 0,55
 * - Protein: ~0,4 g/kg je Hauptmahlzeit (Schoenfeld/Aragon 2018), Jugend 1,7 g/kg/Tag
 * - Vorabend-Anhebung, wenn am Folgetag eine harte Einheit liegt (72-h-Fenster,
 *   so arbeitet auch Hexis: gestern/heute/morgen)
 * - Farbe: gruen = KH-Betonung wichtig, gelb = moderat, rot = klar unter dem
 *   Tagesdurchschnitt (z. B. Snacks am Ruhetag)
 */
export interface MealSlotInput {
  time: string;
  label: string;
  primary: boolean;
}

export interface MealPlanSession {
  start: string | null;
  durationMin: number;
  intensity: Intensity;
  heat: Heat;
}

export interface MealSlotPlan {
  time: string;
  label: string;
  primary: boolean;
  carbsG: number;
  proteinG: number;
  color: AmpelColor;
  relation: "pre" | "post" | "free";
  explanation: string;
}

export interface MealDayPlan {
  dayType: DayType;
  totalCarbsG: number;
  totalProteinG: number;
  sessionFuelG: number;
  slots: MealSlotPlan[];
}

export function mealPlanFor(input: {
  slots: MealSlotInput[];
  sessions: MealPlanSession[];
  weightKg: number;
  dayType: DayType;
  isYouth: boolean;
  nextDayKey?: boolean;
}): MealDayPlan {
  const targets = dailyTargetsFor(input.dayType, input.weightKg, input.isYouth);
  const kg = input.weightKg;

  const slotTimes = input.slots
    .map((s) => ({ slot: s, min: minutesFromHHMM(s.time) }))
    .filter((s) => s.min >= 0)
    .sort((a, b) => a.min - b.min);

  // Session-Fuel waehrend der Einheit(en): eigenes Budget, separat geloggt.
  const sessionFuelG = input.sessions.reduce((sum, s) => {
    const p = calculateFuelingPlan({ durationMin: s.durationMin, intensity: s.intensity, heat: s.heat, bodyWeightKg: kg });
    return sum + p.totalCarbsG;
  }, 0);

  const result: MealSlotPlan[] = slotTimes.map((s) => ({
    time: s.slot.time,
    label: s.slot.label,
    primary: s.slot.primary,
    carbsG: 0,
    proteinG: 0,
    color: "yellow",
    relation: "free",
    explanation: ""
  }));

  // 1) Trainingsnaehe: letzte Mahlzeit vor der Einheit, erste danach.
  for (const sess of input.sessions) {
    if (!sess.start) continue;
    const startMin = minutesFromHHMM(sess.start);
    if (startMin < 0) continue;
    const plan = calculateFuelingPlan({ durationMin: sess.durationMin, intensity: sess.intensity, heat: sess.heat, bodyWeightKg: kg });

    let preIdx = -1;
    slotTimes.forEach((s, i) => {
      if (s.min >= startMin - 240 && s.min < startMin) preIdx = i;
    });
    if (preIdx >= 0) {
      const perKg = sess.durationMin >= 90 || sess.intensity === "high" ? 1.5 : 1.0;
      result[preIdx].carbsG = Math.max(result[preIdx].carbsG, Math.round(kg * perKg));
      result[preIdx].relation = "pre";
      result[preIdx].color = "green";
      result[preIdx].explanation =
        "Trainingsnah (vor der Einheit): ca. " + perKg + " g KH pro kg (" + Math.round(kg * perKg) +
        " g) bis 4 h vor dem Start laden die Glykogenspeicher – das Carb Coding setzt deine größte Portion dorthin.";
    }

    const endMin = startMin + sess.durationMin;
    let postIdx = -1;
    slotTimes.forEach((s, i) => {
      if (postIdx < 0 && result[i].relation === "free" && s.min >= endMin && s.min <= endMin + 240) postIdx = i;
    });
    if (postIdx >= 0) {
      result[postIdx].carbsG = Math.max(result[postIdx].carbsG, plan.postCarbsG);
      result[postIdx].proteinG = Math.max(result[postIdx].proteinG, plan.postProteinG);
      result[postIdx].relation = "post";
      result[postIdx].color = "green";
      result[postIdx].explanation =
        "Regenerationsfenster (nach der Einheit): ca. " + plan.postCarbsG + " g KH (1,0-1,2 g/kg) plus " +
        plan.postProteinG + " g Protein starten die Erholung, solange die Speicher am aufnahmefähigsten sind.";
    }
  }

  // 2) Restbudget auf freie Anlaesse verteilen (Hauptmahlzeit 1, Snack 0,55).
  const fixed = result.filter((s) => s.relation !== "free").reduce((sum, s) => sum + s.carbsG, 0);
  const restBudget = Math.max(0, targets.carbsG - sessionFuelG - fixed);
  const freeIdx = result.map((s, i) => (s.relation === "free" ? i : -1)).filter((i) => i >= 0);
  const weightSum = freeIdx.reduce((sum, i) => sum + (result[i].primary ? 1 : 0.55), 0);
  const baseline = weightSum > 0 ? restBudget / weightSum : 0;
  for (const i of freeIdx) {
    result[i].carbsG = Math.round(baseline * (result[i].primary ? 1 : 0.55));
  }

  // 3) Protein je Anlass: ~0,4 g/kg Hauptmahlzeit, Snacks ~0,15 g/kg.
  const proteinPerPrimary = input.isYouth ? 0.425 : 0.4;
  for (const s of result) {
    const base = s.primary ? Math.round(kg * proteinPerPrimary) : Math.round(kg * 0.15);
    s.proteinG = Math.max(s.proteinG, base);
  }

  // 4) Vorabend-Anhebung vor Key-Session am Folgetag (72-h-Prinzip).
  if (input.nextDayKey) {
    for (let i = result.length - 1; i >= 0; i--) {
      if (minutesFromHHMM(result[i].time) >= 17 * 60) {
        result[i].carbsG = Math.round(result[i].carbsG * 1.4);
        result[i].color = "green";
        result[i].explanation =
          "Morgen steht eine harte Einheit an: Der Vorabend füllt die Speicher vor – das ist die 72-Stunden-Logik (gestern gegessen, heute geplant, morgen vorbereitet).";
        break;
      }
    }
  }

  // 5) Farben und Erklärungen der freien Anlässe, Casein-Hinweis für späte Snacks.
  for (const s of result) {
    if (s.relation === "free") {
      const ratio = baseline > 0 ? s.carbsG / baseline : 1;
      if (ratio >= 1.25) s.color = "green";
      else if (ratio <= 0.75) s.color = "red";
      else s.color = "yellow";
      if (!s.explanation) {
        s.explanation =
          "Freier Anteil: " + s.carbsG + " g KH aus dem Tagesziel (" + targets.carbsG + " g" +
          (sessionFuelG > 0 ? " abzüglich " + sessionFuelG + " g Session-Fuel" : "") + "). " +
          (input.dayType === "rest"
            ? "Ruhetag: moderate Menge, Fokus auf Protein und Gemüse – die Speicher müssen heute nicht voll sein."
            : "Belastungstag: ausgewogen zusätzlich zu den trainingsnahen Anlässen.");
      }
    }
    if (minutesFromHHMM(s.time) >= 21 * 60) {
      s.proteinG = Math.max(s.proteinG, 25);
      s.explanation += " Vor dem Schlafen: 20-40 g Casein (z. B. Quark) stützen die nächtliche Regeneration.";
    }
  }

  return {
    dayType: input.dayType,
    totalCarbsG: targets.carbsG,
    totalProteinG: targets.proteinG,
    sessionFuelG,
    slots: result
  };
}

/*
 * Reallocation (DUO-35, Hexis-Prinzip): Nach jedem Log werden die Ziele der
 * noch ausstehenden Anlässe neu berechnet – gegessene KH verschieben das
 * Restbudget, statt nur einen Balken zu füllen. Vergangene Anlässe bleiben
 * unangetastet, die Zukunft passt sich an.
 */
export function reallocateMealPlan(plan: MealDayPlan, loggedCarbsG: number, nowTime: string): MealDayPlan {
  const nowMin = minutesFromHHMM(nowTime);
  const future = plan.slots
    .map((s, i) => ({ s, i, min: minutesFromHHMM(s.time) }))
    .filter((x) => x.min > nowMin);
  if (future.length === 0) return plan;
  const remaining = Math.max(0, plan.totalCarbsG - loggedCarbsG);
  const slots = plan.slots.map((s) => ({ ...s }));
  if (remaining <= 0) {
    for (const x of future) {
      slots[x.i].carbsG = 0;
      slots[x.i].color = "red";
      slots[x.i].explanation = "Tagesziel bereits erreicht – für heute sind keine Kohlenhydrate mehr nötig.";
    }
    return { ...plan, slots };
  }
  const futureSum = future.reduce((sum, x) => sum + x.s.carbsG, 0);
  if (futureSum > 0) {
    for (const x of future) {
      const scaled = Math.round((x.s.carbsG / futureSum) * remaining);
      slots[x.i].carbsG = scaled;
      if (scaled < x.s.carbsG * 0.75) {
        slots[x.i].color = x.s.color === "green" ? "yellow" : "red";
      }
      slots[x.i].explanation =
        "Neu berechnet nach deinen Logs: " + scaled + " g KH statt " + x.s.carbsG +
        " g – du hast heute schon " + loggedCarbsG + " von " + plan.totalCarbsG + " g gegessen.";
    }
  } else {
    const weightSum = future.reduce((sum, x) => sum + (x.s.primary ? 1 : 0.55), 0);
    for (const x of future) {
      slots[x.i].carbsG = Math.round((remaining / (weightSum || 1)) * (x.s.primary ? 1 : 0.55));
      slots[x.i].explanation = "Neu berechnet: Restbudget " + remaining + " g KH verteilt auf die übrigen Anlässe.";
    }
  }
  return { ...plan, slots };
}

/*
 * Automatische Anlass-Erkennung beim Logging (DUO-35): statt den Nutzer zu
 * fragen, leitet Fuelix die Fueling-Phase aus der Uhrzeit und den geplanten
 * Einheiten ab – weniger Fragen, schnellere Logs (Adherence-Forschung:
 * Zeit pro Log ist der stärkste Abbruchfaktor).
 */
export function inferLogPhase(sessions: MealPlanSession[], nowTime: string): MealPhase {
  const nowMin = minutesFromHHMM(nowTime);
  if (nowMin < 0) return "snack";
  const withStart = sessions
    .filter((s) => s.start !== null && minutesFromHHMM(s.start) >= 0)
    .map((s) => ({ ...s, start: (s.start as string) }));
  for (const s of withStart) {
    const startMin = minutesFromHHMM(s.start);
    const endMin = startMin + s.durationMin;
    if (nowMin >= startMin && nowMin <= endMin) return "during";
    if (nowMin > endMin && nowMin <= endMin + 60) return "post";
    if (nowMin >= startMin - 240 && nowMin < startMin) return "pre";
  }
  return "snack";
}
