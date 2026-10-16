import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { localIso } from "../lib/date";
import type { TrainingSession } from "../types";

export default function SessionForm({ onCreated }: { onCreated: (s: TrainingSession) => void }) {
  const [sessionDate, setSessionDate] = useState(localIso());
  const [sport, setSport] = useState("Radsport");
  const [durationMin, setDurationMin] = useState(90);
  const [intensity, setIntensity] = useState("moderate");
  const [heat, setHeat] = useState("normal");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { data, error } = await supabase
      .from("sessions")
      .insert({
        session_date: sessionDate,
        sport,
        duration_min: Number(durationMin),
        intensity,
        heat,
        notes: notes || null
      })
      .select()
      .single();
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    onCreated(data as TrainingSession);
    setNotes("");
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>Training erfassen</h2>
      <label>Datum</label>
      <input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} required />
      <label>Sportart</label>
      <input value={sport} onChange={(e) => setSport(e.target.value)} required />
      <label>Dauer (Minuten)</label>
      <input
        type="number"
        min="10"
        step="5"
        value={durationMin}
        onChange={(e) => setDurationMin(Number(e.target.value))}
        required
      />
      <label>Intensität</label>
      <select value={intensity} onChange={(e) => setIntensity(e.target.value)}>
        <option value="low">Leicht (Regeneration / Grundlage)</option>
        <option value="moderate">Mittel (Tempo / längere Dauerläufe)</option>
        <option value="high">Hoch (Intervalle / Wettkampf)</option>
      </select>
      <label>Bedingungen</label>
      <select value={heat} onChange={(e) => setHeat(e.target.value)}>
        <option value="normal">Normal</option>
        <option value="hot">Heiß</option>
      </select>
      <label>Notizen</label>
      <textarea
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="z. B. 4x8 min Sweet Spot"
      />
      {error ? <p className="error">{error}</p> : null}
      <button type="submit" disabled={busy}>
        {busy ? "Speichere ..." : "Plan berechnen"}
      </button>
    </form>
  );
}
