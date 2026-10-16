import { buildCarbAmpel, calculateFuelingPlan, dayTypeFor, dayTypeLabel, restOfDayPhase } from "../lib/fueling";
import { localIso } from "../lib/date";
import CarbAmpel from "./CarbAmpel";
import type { CarbAmpelPhase, MealLog, TrainingSession } from "../types";

export default function DaySummary({
  sessions,
  weightKg,
  mealLogs
}: {
  sessions: TrainingSession[];
  weightKg: number;
  mealLogs: MealLog[];
}) {
  const today = localIso();
  const todays = sessions.filter((s) => s.session_date === today);
  const logsToday = mealLogs.filter((l) => l.log_date === today);
  const loggedCarbs = Math.round(logsToday.reduce((sum, l) => sum + Number(l.carbs_g), 0));

  const minutes = todays.reduce((sum, s) => sum + s.duration_min, 0);
  const longestSession = todays.length > 0 ? todays.reduce((a, b) => (b.duration_min > a.duration_min ? b : a)) : null;
  const maxIntensity = todays.some((s) => s.intensity === "high")
    ? "high"
    : todays.some((s) => s.intensity === "moderate")
      ? "moderate"
      : "low";
  const dayType = dayTypeFor(minutes, maxIntensity, longestSession ? longestSession.duration_min : 0);
  const dailyCarbsPerKg = dayType === "rest" ? 4 : dayType === "load" ? 6 : 8;
  const dailyTargetG = Math.round(weightKg * dailyCarbsPerKg);

  const phases: CarbAmpelPhase[] = longestSession
    ? [
        ...buildCarbAmpel({
          durationMin: longestSession.duration_min,
          intensity: longestSession.intensity,
          heat: longestSession.heat,
          bodyWeightKg: weightKg
        }),
        restOfDayPhase(dayType, weightKg)
      ]
    : [restOfDayPhase(dayType, weightKg)];

  const plans = todays.map((s) =>
    calculateFuelingPlan({
      durationMin: s.duration_min,
      intensity: s.intensity,
      heat: s.heat,
      bodyWeightKg: weightKg
    })
  );
  const carbs = plans.reduce((sum, p) => sum + p.totalCarbsG, 0);
  const fluid = plans.reduce((sum, p) => sum + p.totalFluidMl, 0);
  const liters = (fluid / 1000).toFixed(1).replace(".", ",");

  return (
    <div className="card summary">
      <h2>
        Heute <span className="badge">{dayTypeLabel(dayType)}</span>
      </h2>
      {todays.length === 0 ? (
        <p className="muted">Noch keine Einheiten heute - Zeit fuer Training.</p>
      ) : (
        <p>
          {todays.length} {todays.length === 1 ? "Einheit" : "Einheiten"} · {minutes} min · {carbs} g KH geplant · {liters} l
          Fluessigkeit
        </p>
      )}
      <p>
        Geloggt: <strong>{loggedCarbs} g KH</strong> von {dailyTargetG} g Tagesziel
      </p>
      <CarbAmpel phases={phases} />
    </div>
  );
}
