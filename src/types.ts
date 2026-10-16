export type Intensity = "low" | "moderate" | "high";
export type Heat = "normal" | "hot";

export type MealPhase = "pre" | "during" | "post" | "snack";
export type AmpelColor = "red" | "yellow" | "green";
export type DayType = "rest" | "load" | "race";

export interface TrainingSession {
  id?: string;
  session_date: string;
  sport: string;
  duration_min: number;
  intensity: Intensity;
  heat: Heat;
  notes?: string | null;
}

export interface FuelingPlan {
  // Vor der Einheit
  preCarbsG: number;
  preFluidMl: number;
  // Waehrend
  carbsPerHour: number;
  totalCarbsG: number;
  fluidPerHour: number;
  totalFluidMl: number;
  sodiumPerHour: number;
  totalSodiumMg: number;
  // Danach
  postCarbsG: number;
  postProteinG: number;
  postFluidMl: number;
  estimatedSweatL: number;
  // Tagesperiodisierung
  dailyCarbsPerKg: number;
  strategy: string;
}

// Carb-Coding-Ampel (DUO-28)
export interface CarbAmpelPhase {
  key: string;
  label: string;
  color: AmpelColor;
  carbsG: number;
  explanation: string;
}

// Turbo-Logging (DUO-30)
export interface MealFavorite {
  id: string;
  name: string;
  phase: MealPhase;
  carbs_g: number;
  protein_g: number;
  fat_g: number;
  notes?: string | null;
  created_at?: string;
}

export interface MealLog {
  id: string;
  log_date: string;
  favorite_id?: string | null;
  name: string;
  phase: MealPhase;
  carbs_g: number;
  protein_g: number;
  fat_g: number;
  logged_ms?: number | null;
  created_at?: string;
}

// Race-Day-Wizard (DUO-29)
export interface RaceDayPhase {
  key: string;
  title: string;
  window: string;
  items: string[];
}
