import { useCallback, useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { calculateFuelingPlan } from "./lib/fueling";
import type { FuelingPlan, TrainingSession } from "./types";
import SessionForm from "./components/SessionForm";
import PlanCard from "./components/PlanCard";
import SessionList from "./components/SessionList";

export default function App() {
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [weightKg, setWeightKg] = useState(70);
  const [selected, setSelected] = useState<TrainingSession | null>(null);
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    const profileRes = await supabase.from("profile").select("*").limit(1);
    const sessionsRes = await supabase.from("sessions").select("*").order("session_date", { ascending: false }).limit(30);
    if (profileRes.data && profileRes.data.length > 0) {
      setWeightKg(Number(profileRes.data[0].body_weight_kg));
    }
    if (sessionsRes.data) setSessions(sessionsRes.data as TrainingSession[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveWeight = async () => {
    const existing = await supabase.from("profile").select("id").limit(1);
    if (existing.data && existing.data.length > 0) {
      await supabase.from("profile").update({ body_weight_kg: weightKg }).eq("id", existing.data[0].id);
    } else {
      await supabase.from("profile").insert({ body_weight_kg: weightKg });
    }
    setStatus("Gespeichert.");
    setTimeout(() => setStatus(""), 2000);
  };

  const plan: FuelingPlan | null = selected
    ? calculateFuelingPlan({
        durationMin: selected.duration_min,
        intensity: selected.intensity,
        heat: selected.heat,
        bodyWeightKg: weightKg
      })
    : null;

  return (
    <div className="app">
      <header>
        <h1>Fuelix 🚴</h1>
        <p>Fueling-Plan pro Einheit – dein eigenes Hexis.live</p>
      </header>
      <div className="weight">
        <label htmlFor="weight">Körpergewicht (kg): </label>
        <input
          id="weight"
          type="number"
          min="30"
          max="150"
          value={weightKg}
          onChange={(e) => setWeightKg(Number(e.target.value))}
          onBlur={saveWeight}
        />
        <span className="status">{status}</span>
      </div>
      <main className="grid">
        <SessionForm
          onCreated={(s) => {
            setSelected(s);
            load();
          }}
        />
        <PlanCard session={selected} plan={plan} />
      </main>
      <SessionList sessions={sessions} onSelect={setSelected} onChanged={load} />
    </div>
  );
}
