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
  const [step, setStep] = useState(0);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

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
    setStep(0);
    setChecked({});
  };

  const toggle = (key: string) => {
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (!phases) {
    return (
      <div className="card wizard">
        <h2>Race-Day-Wizard</h2>
        <p className="muted">Dein geführter Renntagsplan – Schritt für Schritt durch alle fünf Phasen, mit abhakbarer Checkliste.</p>
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
          <button type="submit">Renntagsplan starten</button>
        </form>
      </div>
    );
  }

  const phase = phases[step];
  const isLast = step === phases.length - 1;
  const pct = Math.round(((step + 1) / phases.length) * 100);
  const doneCount = phase.items.filter((_, i) => checked[step + ":" + i]).length;

  return (
    <div className="card wizard">
      <h2>Race-Day-Wizard</h2>
      <div className="stepper-head">
        <span className="stepper-count">Phase {step + 1} von {phases.length}: {phase.title}</span>
        <button className="link" onClick={() => setPhases(null)}>
          Plan ändern
        </button>
      </div>
      <div className="track stepper-track">
        <div className="fill fill-green" style={{ width: pct + "%" }} />
      </div>
      <div className="stepnav">
        {phases.map((p, i) => (
          <span
            key={p.key}
            className={"stepdot" + (i < step ? " done" : "") + (i === step ? " active" : "")}
            title={p.title}
          >
            {i + 1}
          </span>
        ))}
      </div>
      <div className="stepcard">
        <h4>{phase.title}</h4>
        <div className="window">{phase.window} · {doneCount} von {phase.items.length} erledigt</div>
        <ul className="checklist">
          {phase.items.map((item, i) => {
            const key = step + ":" + i;
            const isChecked = !!checked[key];
            return (
              <li
                key={key}
                className={isChecked ? "checked" : ""}
                onClick={() => toggle(key)}
              >
                <span className="checkbox">{isChecked ? "✓" : ""}</span>
                <span>{item}</span>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="stepper-actions">
        <button type="button" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
          ← Zurück
        </button>
        {isLast ? (
          <button
            type="button"
            onClick={() => {
              setPhases(null);
              setStep(0);
              setChecked({});
            }}
          >
            Renntag abgeschlossen – fertig!
          </button>
        ) : (
          <button type="button" onClick={() => setStep(step + 1)}>
            Weiter →
          </button>
        )}
      </div>
      {isLast ? (
        <p className="muted stepper-hint">Stark gelaufen! Denk an die Regeneration – der nächste Plan wartet auf dich.</p>
      ) : null}
    </div>
  );
}
