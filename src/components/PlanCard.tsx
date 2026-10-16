import type { FuelingPlan, TrainingSession } from "../types";

const fmt = (n: number) => Math.round(n);

const intensityLabel = (i: string) => (i === "low" ? "Leicht" : i === "moderate" ? "Mittel" : "Hoch");

export default function PlanCard({
  session,
  plan
}: {
  session: TrainingSession | null;
  plan: FuelingPlan | null;
}) {
  if (!session || !plan) {
    return (
      <div className="card plan">
        <h2>Fueling-Plan</h2>
        <p className="muted">Erfasse ein Training – der Plan erscheint sofort.</p>
      </div>
    );
  }
  return (
    <div className="card plan">
      <h2>Fueling-Plan</h2>
      <p className="muted">
        {session.sport} · {session.duration_min} min · {intensityLabel(session.intensity)}
      </p>
      <h3>Vor der Einheit (1–3 h vorher)</h3>
      <ul>
        <li>{fmt(plan.preCarbsG)} g Kohlenhydrate</li>
        <li>{fmt(plan.preFluidMl)} ml Flüssigkeit</li>
      </ul>
      <h3>Während</h3>
      <ul>
        <li>
          {fmt(plan.carbsPerHour)} g KH / h ({fmt(plan.totalCarbsG)} g gesamt)
        </li>
        <li>
          {fmt(plan.fluidPerHour)} ml / h ({fmt(plan.totalFluidMl)} ml gesamt)
        </li>
        <li>{fmt(plan.sodiumPerHour)} mg Natrium / h</li>
      </ul>
      <h3>Danach (innerhalb 60 min)</h3>
      <ul>
        <li>{fmt(plan.postCarbsG)} g Kohlenhydrate</li>
        <li>{fmt(plan.postProteinG)} g Protein</li>
        <li>
          {fmt(plan.postFluidMl)} ml Flüssigkeit (ca. {plan.estimatedSweatL} l Schweißverlust)
        </li>
      </ul>
      <h3>Tagesziel</h3>
      <p>ca. {plan.dailyCarbsPerKg} g KH pro kg Körpergewicht über den Tag verteilt</p>
      <p className="strategy">{plan.strategy}</p>
    </div>
  );
}
