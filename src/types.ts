export type Intensity = "low" | "moderate" | "high";
export type Heat = "normal" | "hot";

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
  // Während
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
