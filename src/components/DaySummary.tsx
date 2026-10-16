import { calculateFuelingPlan } from "../lib/fueling";
import { localIso } from "../lib/date";
import type { TrainingSession } from "../types";

export default function DaySummary({
  sessions,
  weightKg
}: {
  sessions: TrainingSession[];
  weightKg: number;
}) {
  const today = localIso();
  const todays = sessions.filter((s) => s.session_date === today);

  if (todays.length === 0) {
    return (
      <div className="card summary">
        <h2>Heute</h2>
        <p className="muted">Noch keine Einheiten heute – Zeit fuer Training.</p>
      </div>
    );
  }

  const minutes = todays.reduce((sum, s) => sum + s.duration_min, 0);
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
      <h2>Heute</h2>
      <p>
        {todays.length} {todays.length === 1 ? "Einheit" : "Einheiten"} · {minutes} min · {carbs} g KH geplant · {liters} l
        Fluessigkeit
      </p>
    </div>
  );
}
