import { useCallback, useEffect, useState } from "react";
import type { Session as SupabaseSession } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { buildCarbAmpel, calculateFuelingPlan } from "./lib/fueling";
import { buildSessionsCsv, downloadCsv } from "./lib/csv";
import type { FuelingPlan, MealLog, TrainingSession } from "./types";
import Auth from "./components/Auth";
import SessionForm from "./components/SessionForm";
import PlanCard from "./components/PlanCard";
import SessionList from "./components/SessionList";
import DaySummary from "./components/DaySummary";
import WeekView from "./components/WeekView";
import QuickLog from "./components/QuickLog";
import RaceDayWizard from "./components/RaceDayWizard";

export default function App() {
  const [authSession, setAuthSession] = useState<SupabaseSession | null>(null);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [mealLogs, setMealLogs] = useState<MealLog[]>([]);
  const [weightKg, setWeightKg] = useState(70);
  const [birthYear, setBirthYear] = useState<number | "">("");
  const [selected, setSelected] = useState<TrainingSession | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => setAuthSession(newSession));
    return () => sub.subscription.unsubscribe();
  }, []);

  const load = useCallback(async () => {
    const profileRes = await supabase.from("profile").select("*").limit(1);
    const sessionsRes = await supabase.from("sessions").select("*").order("session_date", { ascending: false }).limit(100);
    const logsRes = await supabase.from("meal_logs").select("*").order("created_at", { ascending: false }).limit(200);
    if (profileRes.data && profileRes.data.length > 0) {
      setWeightKg(Number(profileRes.data[0].body_weight_kg));
      const by = profileRes.data[0].birth_year;
      setBirthYear(by ? Number(by) : "");
    }
    if (sessionsRes.data) setSessions(sessionsRes.data as TrainingSession[]);
    if (logsRes.data) setMealLogs(logsRes.data as MealLog[]);
  }, []);

  useEffect(() => {
    if (authSession) load();
  }, [authSession, load]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const exportCsv = () => {
    downloadCsv(buildSessionsCsv(sessions, weightKg), "fuelix-sessions.csv");
  };

  const saveProfile = async () => {
    const payload = { body_weight_kg: weightKg, birth_year: birthYear === "" ? null : Number(birthYear) };
    const existing = await supabase.from("profile").select("id").limit(1);
    if (existing.data && existing.data.length > 0) {
      await supabase.from("profile").update(payload).eq("id", existing.data[0].id);
    } else {
      await supabase.from("profile").insert(payload);
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

  const ampel = selected
    ? buildCarbAmpel({
        durationMin: selected.duration_min,
        intensity: selected.intensity,
        heat: selected.heat,
        bodyWeightKg: weightKg
      })
    : null;

  if (!authSession) {
    return <Auth />;
  }

  return (
    <div className="app">
      <header>
        <h1>Fuelix 🚴</h1>
        <p>Fueling-Plan pro Einheit - dein eigenes Hexis.live</p>
        <div className="headeractions">
          <button className="link" onClick={exportCsv}>
            Export (CSV)
          </button>
          <button className="link" onClick={signOut}>
            Abmelden
          </button>
        </div>
      </header>
      <DaySummary sessions={sessions} weightKg={weightKg} mealLogs={mealLogs} birthYear={birthYear} />
      <div className="weight">
        <label htmlFor="weight">Koerpergewicht (kg): </label>
        <input
          id="weight"
          type="number"
          min="30"
          max="150"
          value={weightKg}
          onChange={(e) => setWeightKg(Number(e.target.value))}
          onBlur={saveProfile}
        />
        <label htmlFor="birthyear">Geburtsjahr: </label>
        <input
          id="birthyear"
          type="number"
          min="1930"
          max="2020"
          value={birthYear}
          onChange={(e) => setBirthYear(e.target.value === "" ? "" : Number(e.target.value))}
          onBlur={saveProfile}
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
        <PlanCard session={selected} plan={plan} ampel={ampel} />
      </main>
      <QuickLog onLogged={load} />
      <RaceDayWizard sessions={sessions} weightKg={weightKg} />
      <WeekView sessions={sessions} weightKg={weightKg} />
      <SessionList sessions={sessions} onSelect={setSelected} onChanged={load} />
    </div>
  );
}
