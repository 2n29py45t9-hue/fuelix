import { calculateFuelingPlan } from "./fueling";
import type { TrainingSession } from "../types";

const esc = (v: string) => v.replace(/;/g, ",").replace(/\r?\n/g, " ");

export function buildSessionsCsv(sessions: TrainingSession[], weightKg: number): string {
  const header = [
    "Datum",
    "Sport",
    "Dauer (min)",
    "Intensitaet",
    "Hitze",
    "Notizen",
    "KH/h",
    "KH gesamt (g)",
    "ml/h",
    "Fluessigkeit gesamt (ml)",
    "Natrium mg/h",
    "KH vorher (g)",
    "KH danach (g)",
    "Protein (g)",
    "Tagesziel g/kg"
  ];
  const rows = sessions.map((s) => {
    const p = calculateFuelingPlan({
      durationMin: s.duration_min,
      intensity: s.intensity,
      heat: s.heat,
      bodyWeightKg: weightKg
    });
    return [
      s.session_date,
      esc(s.sport),
      String(s.duration_min),
      s.intensity,
      s.heat,
      esc(s.notes || ""),
      String(p.carbsPerHour),
      String(p.totalCarbsG),
      String(p.fluidPerHour),
      String(p.totalFluidMl),
      String(p.sodiumPerHour),
      String(p.preCarbsG),
      String(p.postCarbsG),
      String(p.postProteinG),
      String(p.dailyCarbsPerKg)
    ].join(";");
  });
  return [header.join(";"), ...rows].join("\n");
}

export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
