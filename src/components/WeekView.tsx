import { useState } from "react";
import { calculateFuelingPlan } from "../lib/fueling";
import { localIso } from "../lib/date";
import type { TrainingSession } from "../types";

const DAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function mondayOf(date: Date): Date {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function WeekView({
  sessions,
  weightKg
}: {
  sessions: TrainingSession[];
  weightKg: number;
}) {
  const [offset, setOffset] = useState(0);
  const weekStart = mondayOf(new Date());
  weekStart.setDate(weekStart.getDate() + offset * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });

  const days = DAY_LABELS.map((label, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const iso = localIso(d);
    const daySessions = sessions.filter((s) => s.session_date === iso);
    const minutes = daySessions.reduce((sum, s) => sum + s.duration_min, 0);
    let carbsPerKg = 3;
    for (const s of daySessions) {
      const p = calculateFuelingPlan({
        durationMin: s.duration_min,
        intensity: s.intensity,
        heat: s.heat,
        bodyWeightKg: weightKg
      });
      carbsPerKg = Math.max(carbsPerKg, p.dailyCarbsPerKg);
    }
    return {
      iso,
      label,
      minutes,
      targetG: Math.round(carbsPerKg * weightKg),
      isToday: iso === localIso()
    };
  });

  const maxTarget = Math.max(...days.map((d) => d.targetG), 1);

  return (
    <div className="card week">
      <h2>Woche {fmt(weekStart)} – {fmt(weekEnd)}</h2>
      <div className="weeknav">
        <button className="link" onClick={() => setOffset(offset - 1)}>
          ← früher
        </button>
        <button className="link" onClick={() => setOffset(0)}>
          Heute
        </button>
        <button className="link" onClick={() => setOffset(offset + 1)}>
          später →
        </button>
      </div>
      <div className="bars">
        {days.map((d) => (
          <div key={d.iso} className={"barcol" + (d.isToday ? " today" : "")}>
            <div className="bar" style={{ height: Math.round((d.targetG / maxTarget) * 100) + "%" }}>
              <span>{d.targetG}</span>
            </div>
            <div className="barlabel">{d.label}</div>
            <div className="barmin">{d.minutes > 0 ? d.minutes + " min" : "–"}</div>
          </div>
        ))}
      </div>
      <p className="muted">Tagesziel KH in Gramm: Ruhetag 3, leicht 4, mittel 6, hart 8 g/kg Körpergewicht (Maximum des Tages)</p>
    </div>
  );
}
