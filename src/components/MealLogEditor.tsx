import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { hhmmFromIso } from "../lib/date";
import type { MealLog, MealPhase } from "../types";

/*
 * Log-Editor (DUO-45): ausgefüllte Timeline-Kacheln (geloggte Mahlzeiten
 * und Snacks) antippen und direkt korrigieren oder loeschen - gleiche
 * Bearbeiten-Logik wie im Kalender, ohne Umweg ueber andere Tabs.
 * Reine State-Komponente; die Persistenz macht das Component selbst
 * gegen Supabase (Update/Delete auf meal_logs).
 */

const PHASES: { key: MealPhase; label: string }[] = [
  { key: "pre", label: "Vor der Einheit" },
  { key: "during", label: "Während" },
  { key: "post", label: "Danach" },
  { key: "snack", label: "Snack / sonstige" }
];

export default function MealLogEditor({
  log,
  onSaved,
  onClose
}: {
  log: MealLog;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(log.name);
  const [phase, setPhase] = useState<MealPhase>(log.phase);
  const [carbs, setCarbs] = useState(String(Math.round(Number(log.carbs_g))));
  const [protein, setProtein] = useState(String(Math.round(Number(log.protein_g))));
  const [fat, setFat] = useState(String(Math.round(Number(log.fat_g))));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const timeLabel = hhmmFromIso(log.created_at);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error: updateError } = await supabase
      .from("meal_logs")
      .update({
        name,
        phase,
        carbs_g: Number(carbs),
        protein_g: Number(protein),
        fat_g: Number(fat)
      })
      .eq("id", log.id);
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onSaved();
  };

  const remove = async () => {
    setBusy(true);
    setError("");
    const { error: deleteError } = await supabase.from("meal_logs").delete().eq("id", log.id);
    setBusy(false);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    onSaved();
  };

  return (
    <form className="mse" onSubmit={save}>
      <h2 style={{ margin: 0 }}>Log bearbeiten</h2>
      <p className="muted mse-hint">
        {timeLabel ? "Erfasst um " + timeLabel + " Uhr – " : ""}
        {log.name}, {PHASES.find((p) => p.key === phase)?.label}. Korrigiere die Werte oder entferne den Log –
        Ringe und Timeline rechnen sofort neu.
      </p>
      <label htmlFor="mle-name">Bezeichnung</label>
      <input id="mle-name" value={name} onChange={(e) => setName(e.target.value)} required />
      <label htmlFor="mle-phase">Fueling-Phase</label>
      <select id="mle-phase" value={phase} onChange={(e) => setPhase(e.target.value as MealPhase)}>
        {PHASES.map((p) => (
          <option key={p.key} value={p.key}>{p.label}</option>
        ))}
      </select>
      <div className="quickfree-macros">
        <div>
          <label htmlFor="mle-carbs">Kohlenhydrate (g)</label>
          <input
            id="mle-carbs"
            type="number"
            min="0"
            inputMode="numeric"
            value={carbs}
            onChange={(e) => setCarbs(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="mle-protein">Protein (g)</label>
          <input
            id="mle-protein"
            type="number"
            min="0"
            inputMode="numeric"
            value={protein}
            onChange={(e) => setProtein(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="mle-fat">Fett (g)</label>
          <input
            id="mle-fat"
            type="number"
            min="0"
            inputMode="numeric"
            value={fat}
            onChange={(e) => setFat(e.target.value)}
            required
          />
        </div>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="mse-actions">
        <button type="submit" disabled={busy}>
          {busy ? "Speichere ..." : "Speichern"}
        </button>
        <button type="button" className="danger" onClick={remove} disabled={busy}>
          Löschen
        </button>
        <button type="button" className="link" onClick={onClose}>
          Abbrechen
        </button>
      </div>
    </form>
  );
}
