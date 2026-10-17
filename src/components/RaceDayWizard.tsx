import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { localIso } from "../lib/date";
import { buildRaceDayPlan } from "../lib/fueling";
import type { Heat, RaceDayPhase, TrainingSession } from "../types";

/*
 * Race-Day-Wizard (DUO-30 + DUO-41): gefuehrter Renntagsplan in fuenf
 * Phasen mit abhakbarer Checkliste.
 *
 * DUO-41: Zukuenftige Rennen PLANBAR - Datum, Startzeit, Dauer,
 * Bedingungen, Distanz und Hoehenmeter angeben (z. B. 80 km, 1200 hm,
 * warm, all out): Das Rennen wird als hochintensive Einheit im
 * Kalender angelegt, der Tag wird damit zum Wettkampftag und das
 * Fueling rechnet automatisch dagegen. Alternativ wie bisher eine
 * bestehende Einheit auswaehlen.
 */

export default function RaceDayWizard({
  sessions,
  weightKg,
  onCreated
}: {
  sessions: TrainingSession[];
  weightKg: number;
  onCreated?: (s: TrainingSession) => void;
}) {
  const [sessionIdx, setSessionIdx] = useState(-1);
  const [durationMin, setDurationMin] = useState(150);
  const [heat, setHeat] = useState<Heat>("normal");
  const [raceDate, setRaceDate] = useState(localIso());
  const [raceStart, setRaceStart] = useState("");
  const [raceDist, setRaceDist] = useState("");
  const [raceHm, setRaceHm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [phases, setPhases] = useState<RaceDayPhase[] | null>(null);
  const [step, setStep] = useState(0);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const chosen = sessionIdx >= 0 ? sessions[sessionIdx] : null;

  const generate = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (sessionIdx < 0) {
      /* DUO-41: zukuenftiges Rennen als Einheit anlegen (Kalender + Race-Day). */
      setBusy(true);
      const notesParts: string[] = [];
      if (raceDist !== "") notesParts.push(raceDist + " km");
      if (raceHm !== "") notesParts.push(raceHm + " hm");
      const { data, error: insertError } = await supabase
        .from("sessions")
        .insert({
          session_date: raceDate,
          session_start: raceStart || null,
          sport: "Rennen",
          duration_min: Number(durationMin),
          intensity: "high",
          heat,
          notes: notesParts.length > 0 ? notesParts.join(" · ") : null
        })
        .select()
        .single();
      setBusy(false);
      if (insertError || !data) {
        setError(insertError ? insertError.message : "Anlegen fehlgeschlagen.");
        return;
      }
      const created = data as TrainingSession;
      if (onCreated) onCreated(created);
      setPhases(
        buildRaceDayPlan({
          durationMin: created.duration_min,
          intensity: "high",
          heat: created.heat,
          bodyWeightKg: weightKg
        })
      );
      setStep(0);
      setChecked({});
      return;
    }
    if (chosen) {
      setPhases(
        buildRaceDayPlan({
          durationMin: chosen.duration_min,
          intensity: "high",
          heat: chosen.heat,
          bodyWeightKg: weightKg
        })
      );
      setStep(0);
      setChecked({});
    }
  };

  const toggle = (key: string) => {
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (!phases) {
    return (
      <div className="card wizard">
        <h2>Race-Day-Wizard</h2>
        <p className="muted">
          Zukünftiges Rennen planen – Datum, Dauer, Bedingungen, Distanz und Höhenmeter angeben (z. B. 80 km, 1200 hm,
          warm, all out). Das Rennen wird als hochintensive Einheit im Kalender angelegt, der Tag wird zum Wettkampftag
          und dein Fueling rechnet automatisch dagegen. Alternativ eine bestehende Einheit wählen.
        </p>
        <form className="wizard-controls" onSubmit={generate}>
          <div className="field">
            <label>Modus</label>
            <select value={sessionIdx} onChange={(e) => setSessionIdx(Number(e.target.value))}>
              <option value={-1}>Neues Rennen planen (unten)</option>
              {sessions.map((s, i) => (
                <option key={s.id ?? i} value={i}>
                  {s.session_date} · {s.sport} · {s.duration_min} min
                </option>
              ))}
            </select>
          </div>
          {chosen ? null : (
            <>
              <div className="field">
                <label>Renndatum</label>
                <input type="date" value={raceDate} onChange={(e) => setRaceDate(e.target.value)} required />
              </div>
              <div className="field">
                <label>Startzeit (optional)</label>
                <input type="time" value={raceStart} onChange={(e) => setRaceStart(e.target.value)} />
              </div>
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
              <div className="field">
                <label>Bedingungen</label>
                <select value={heat} onChange={(e) => setHeat(e.target.value as Heat)}>
                  <option value="normal">Normal</option>
                  <option value="hot">Heiss</option>
                </select>
              </div>
              <div className="field">
                <label>Distanz (km, optional)</label>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={raceDist}
                  onChange={(e) => setRaceDist(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Höhenmeter (optional)</label>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={raceHm}
                  onChange={(e) => setRaceHm(e.target.value)}
                />
              </div>
            </>
          )}
          {error ? <p className="error">{error}</p> : null}
          <button type="submit" disabled={busy}>
            {busy ? "Lege an ..." : chosen ? "Renntagsplan starten" : "Rennen anlegen & Renntagsplan starten"}
          </button>
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
