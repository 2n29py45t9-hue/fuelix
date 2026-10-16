import { useCallback, useEffect, useState } from "react";
import type { Session as SupabaseSession } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { buildCarbAmpel, calculateFuelingPlan, inferLogPhase } from "./lib/fueling";
import { buildSessionsCsv, downloadCsv } from "./lib/csv";
import { hhmmNow, localIso } from "./lib/date";
import type { FuelingPlan, MealLog, MealSlot, TrainingSession } from "./types";
import Auth from "./components/Auth";
import SessionForm from "./components/SessionForm";
import PlanCard from "./components/PlanCard";
import SessionList from "./components/SessionList";
import DaySummary from "./components/DaySummary";
import DayScroller from "./components/DayScroller";
import WeekView from "./components/WeekView";
import QuickLog from "./components/QuickLog";
import RaceDayWizard from "./components/RaceDayWizard";
import BottomNav from "./components/BottomNav";
import MealCalendar from "./components/MealCalendar";
import StravaSync from "./components/StravaSync";
import Onboarding from "./components/Onboarding";
import { consumeHandoff } from "./lib/strava";

type Tab = "plan" | "kalender" | "trends" | "more";

export default function App() {
  const [authSession, setAuthSession] = useState<SupabaseSession | null>(null);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [mealLogs, setMealLogs] = useState<MealLog[]>([]);
  const [mealSchedule, setMealSchedule] = useState<MealSlot[]>([]);
  const [weightKg, setWeightKg] = useState(70);
  const [birthYear, setBirthYear] = useState<number | "">("");
  const [mainSport, setMainSport] = useState("Radsport");
  const [selected, setSelected] = useState<TrainingSession | null>(null);
  const [selectedDate, setSelectedDate] = useState(localIso());
  const [activeTab, setActiveTab] = useState<Tab>("plan");
  const [logSheet, setLogSheet] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => setAuthSession(newSession));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Strava-OAuth-Uebergabe (DUO-23): Tokens aus dem Callback mit eigener Session speichern.
  useEffect(() => {
    if (!authSession) return;
    consumeHandoff().catch(() => {});
  }, [authSession]);

  const load = useCallback(async () => {
    const profileRes = await supabase.from("profile").select("*").limit(1);
    const sessionsRes = await supabase.from("sessions").select("*").order("session_date", { ascending: false }).limit(100);
    const logsRes = await supabase.from("meal_logs").select("*").order("created_at", { ascending: false }).limit(200);
    const scheduleRes = await supabase.from("meal_schedule").select("*").order("weekday", { ascending: true }).order("time", { ascending: true });
    if (profileRes.data && profileRes.data.length > 0) {
      setWeightKg(Number(profileRes.data[0].body_weight_kg));
      const by = profileRes.data[0].birth_year;
      setBirthYear(by ? Number(by) : "");
      setMainSport(profileRes.data[0].main_sport ?? "Radsport");
      setShowOnboarding(false);
    } else {
      // Onboarding (DUO-34): kein Profil -> gefuehrter Einstieg.
      setShowOnboarding(true);
    }
    if (sessionsRes.data) setSessions(sessionsRes.data as TrainingSession[]);
    if (logsRes.data) setMealLogs(logsRes.data as MealLog[]);
    if (scheduleRes.data) setMealSchedule(scheduleRes.data as MealSlot[]);
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

  const showSession = (s: TrainingSession) => {
    setSelected(s);
    setSelectedDate(s.session_date);
    setActiveTab("plan");
    const el = document.getElementById("plancard");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // DUO-35: Anlass- und Session-Fuel-Kontext fuer QuickLog.
  const sessionsToday = sessions.filter((s) => s.session_date === selectedDate);
  const quickPhase = inferLogPhase(
    sessionsToday.map((s) => ({ start: s.session_start ?? null, durationMin: s.duration_min, intensity: s.intensity, heat: s.heat })),
    hhmmNow()
  );
  const sessionFuelG = sessionsToday.reduce(
    (sum, s) =>
      sum +
      calculateFuelingPlan({
        durationMin: s.duration_min,
        intensity: s.intensity,
        heat: s.heat,
        bodyWeightKg: weightKg
      }).totalCarbsG,
    0
  );

  return (
    <div className="app">
      <header className="appheader">
        <div className="appheader-inner">
          <div>
            <h1>Fuelix</h1>
            <p className="appheader-sub">Fueling pro Einheit &amp; Mahlzeit</p>
          </div>
          <button type="button" className="headeravatar" onClick={() => setActiveTab("more")} aria-label="Profil und Einstellungen">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
            </svg>
          </button>
        </div>
      </header>

      <main className="appmain">
        {activeTab === "plan" ? (
          <>
            <DayScroller selected={selectedDate} onSelect={setSelectedDate} sessions={sessions} />
            <DaySummary date={selectedDate} sessions={sessions} weightKg={weightKg} mealLogs={mealLogs} birthYear={birthYear} mealSchedule={mealSchedule} onSelectSession={showSession} />
            <div className="grid">
              <SessionForm
                defaultSport={mainSport}
                onCreated={(s) => {
                  setSelected(s);
                  setSelectedDate(s.session_date);
                  load();
                }}
              />
              <div id="plancard">
                <PlanCard session={selected} plan={plan} ampel={ampel} />
              </div>
            </div>
            <RaceDayWizard sessions={sessions} weightKg={weightKg} />
          </>
        ) : null}
        {activeTab === "kalender" ? (
          <MealCalendar
            selectedDate={selectedDate}
            onSelectDate={(iso) => {
              setSelectedDate(iso);
              setActiveTab("plan");
            }}
            sessions={sessions}
            weightKg={weightKg}
            birthYear={birthYear}
            mealSchedule={mealSchedule}
            onScheduleSaved={load}
          />
        ) : null}
        {activeTab === "trends" ? (
          <>
            <WeekView sessions={sessions} weightKg={weightKg} />
            <SessionList sessions={sessions} onSelect={showSession} onChanged={load} />
          </>
        ) : null}
        {activeTab === "more" ? (
          <>
            <div className="card">
              <h2>Profil</h2>
              <label htmlFor="weight">Körpergewicht (kg)</label>
              <input
                id="weight"
                type="number"
                min="30"
                max="150"
                inputMode="numeric"
                value={weightKg}
                onChange={(e) => setWeightKg(Number(e.target.value))}
              />
              <label htmlFor="birthyear">Geburtsjahr – aktiviert den Jugend-Modus (U15-U19)</label>
              <input
                id="birthyear"
                type="number"
                min="1930"
                max="2020"
                inputMode="numeric"
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value === "" ? "" : Number(e.target.value))}
              />
              <button type="button" onClick={saveProfile}>
                Speichern
              </button>
              <span className="status">{status}</span>
              <h3>Daten</h3>
              <div className="headeractions">
                <button type="button" className="link" onClick={exportCsv}>
                  Export (CSV)
                </button>
                <button type="button" className="link" onClick={signOut}>
                  Abmelden
                </button>
              </div>
            </div>
            <StravaSync onSynced={load} />
          </>
        ) : null}
      </main>

      {showOnboarding ? <Onboarding onDone={load} /> : null}

      {logSheet ? (
        <>
          <div className="sheet-backdrop" onClick={() => setLogSheet(false)} />
          <div className="sheet">
            <QuickLog
              onLogged={load}
              onClose={() => setLogSheet(false)}
              logDate={selectedDate}
              defaultPhase={quickPhase}
              recentLogs={mealLogs.slice(0, 30)}
              sessionFuelG={sessionFuelG}
            />
          </div>
        </>
      ) : null}

      <BottomNav active={activeTab} onTab={setActiveTab} onFab={() => setLogSheet(true)} />
    </div>
  );
}
