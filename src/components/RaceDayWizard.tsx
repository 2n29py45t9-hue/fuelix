import { useState, type FormEvent } from "react";
import { buildRaceDayPlan } from "../lib/fueling";
import type { Heat, RaceDayPhase, TrainingSession } from "../types";

export default function RaceDayWizard({
  sessions,
  weightKg
}: {
  sessions: TrainingSession[];
  weightKg: number;
}) {
  const [sessionIdx, setSessionIdx] = useState(-1);
  const [durationMin, setDurationMin] = useState(120);
  const [heat, setHeat] = useState<Heat>("normal");
  const [phases, setPhases] = useState<RaceDayPhase[] | null>(null);

  const chosen = sessionIdx >= 0 ? sessions[sessionIdx] : null;

  const generate = (e: FormEvent) => {
    e.preventDefault();
    const dur = chosen ? chosen.duration_min : Number(durationMin);
    const raceHeat = chosen ? chosen.heat : heat;
    setPhases(
      buildRaceDayPlan({
        durationMin: dur,
        intensity: "high",
        heat: raceHeat,
        bodyWeightKg: weightKg
      })
    );
  };

  return (
    <div className="card wizard">
      <h2>Race-Day-Wizard</h2>
      <p className="muted">Schritt-fuer-Schritt-Renntagsplan aus einer geplanten Einheit.</p>
      <form className="wizard-controls" onSubmit={generate}>
        <div className="field">
          <label>Renn-Einheit</label>
          <select value={sessionIdx} onChange={(e) => setSessionIdx(Number(e.target.value))}>
            <option value={-1}>Manuell (Dauer unten)</option>
            {sessions.map((s, i) => (
              <option key={s.id ?? i} value={i}>
                {s.session_date} · {s.sport} · {s.duration_min} min
              </option>
            ))}
          </select>
        </div>
        {chosen ? null : (
          <div className="field">
            <label>Renndauer (Minuten)</label>
            <input
              type="number"
              min="45"
              step="15"
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value))}
              required
            />
          </div>
        )}
        {chosen ? null : (
          <div className="field">
            <label>Bedingungen</label>
            <select value={heat} onChange={(e) => setHeat(e.target.value as Heat)}>
              <option value="normal">Normal</option>
              <option value="hot">Heiss</option>
            </select>
          </div>
        )}
        <button type="submit">Renntagsplan erstellen</button>
      </form>
      {phases ? (
        <div className="wizard-phases">
          {phases.map((p) => (
            <div key={p.key} className="phase">
              <h4>{p.title}</h4>
              <div className="window">{p.window}</div>
              <ul>
                {p.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
