import { useCallback, useEffect, useState } from "react";
import type { Session as SupabaseSession } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { buildCarbAmpel, calculateFuelingPlan, inferLogPhase } from "./lib/fueling";
import { clearFutureOverrides, saveOverrideForDate, saveRoutineForWeekday } from "./lib/mealSchedule";
import { buildSessionsCsv, downloadCsv } from "./lib/csv";
import { hhmmNow, localIso, weekdayIndexMondayFirst } from "./lib/date";
import type { FuelingPlan, MealLog, MealOverride, MealSlot, TrainingSession } from "./types";
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
import MealDayEditor, { type MealEditScope } from "./components/MealDayEditor";
import MealLogEditor from "./components/MealLogEditor";
import StravaSync from "./components/StravaSync";
import Onboarding from "./components/Onboarding";
import { consumeHandoff } from "./lib/strava";

type Tab = "plan" | "kalender" | "trends" | "more";

export default function App() {
  const [authSession, setAuthSession] = useState<SupabaseSession | null>(null);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [mealLogs, setMealLogs] = useState<MealLog[]>([]);
  const [mealSchedule, setMealSchedule] = useState<MealSlot[]>([]);
  const [mealOverrides, setMealOverrides] = useState<MealOverride[]>([]);
  const [weightKg, setWeightKg] = useState(70);
  const [birthYear, setBirthYear] = useState<number | "">("");
  const [mainSport, setMainSport] = useState("Radsport");
  const [selected, setSelected] = useState<TrainingSession | null>(null);
  const [selectedDate, setSelectedDate] = useState(localIso());
  const [activeTab, setActiveTab] = useState<Tab>("plan");
  const [logSheet, setLogSheet] = useState(false);
  const [sessionSheet, setSessionSheet] = useState(false);
  const [sessionFormDate, setSessionFormDate] = useState(localIso());
  const [editDate, setEditDate] = useState<string | null>(null);
  const [editLog, setEditLog] = useState<MealLog | null>(null);
  const [editError, setEditError] = useState("");
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
    // DUO-36: Einzeltermin-Abweichungen der Routine.
    const overridesRes = await supabase.from("meal_overrides").select("*").order("date", { ascending: true }).order("time", { ascending: true });
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
    if (overridesRes.data) setMealOverrides(overridesRes.data as MealOverride[]);
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

  // DUO-45: "Tag anpassen" - Mahlzeiten/Anlässe des ausgewählten Tages
  // editieren mit Notion-Logik: nur dieses Datum (Override) oder ab
  // jetzt jede Wiederholung dieses Wochentags (Routine).
  const saveDay = async (slots: { time: string; label: string; primary: boolean }[], scope: MealEditScope) => {
    if (!editDate) return;
    setEditError("");
    try {
      const weekday = weekdayIndexMondayFirst(editDate);
      if (scope === "once") {
        await saveOverrideForDate(editDate, slots);
      } else {
        await saveRoutineForWeekday(weekday, slots);
        await clearFutureOverrides(weekday, editDate);
      }
      setEditDate(null);
      load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    }
  };

  // DUO-42: Trainingszeit aus dem "Tag anpassen"-Editor speichern -
  // verschiebt die Einheit im Kalender-Raster, Fueling rechnet neu.
  const saveSessionTime = async (sessionId: string, time: string) => {
    const { error } = await supabase.from("sessions").update({ session_start: time === "" ? null : time }).eq("id", sessionId);
    if (error) {
      setEditError(error.message);
      return;
    }
    load();
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
            <DayScroller selected={selectedDate} onSelect={setSelectedDate} sessions={sessions} mealLogs={mealLogs} weightKg={weightKg} birthYear={birthYear} />
            <DaySummary
              date={selectedDate}
              sessions={sessions}
              weightKg={weightKg}
              mealLogs={mealLogs}
              birthYear={birthYear}
              mealSchedule={mealSchedule}
              overrides={mealOverrides}
              onSelectSession={showSession}
              onEditDay={() => {
                setEditError("");
                setEditDate(selectedDate);
              }}
              onEditLog={(log) => {
                setEditError("");
                setEditLog(log);
              }}
            />
            <div className="homecapture">
              <button
                type="button"
                className="capturebtn"
                onClick={() => {
                  setSessionFormDate(selectedDate);
                  setSessionSheet(true);
                }}
                aria-label="Training manuell erfassen"
                title="Training manuell erfassen – dein Plan erscheint sofort"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <span>Training erfassen</span>
              </button>
            </div>
            <div id="plancard">
              {selected ? <PlanCard session={selected} plan={plan} ampel={ampel} /> : null}
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
            onSelectSession={showSession}
            sessions={sessions}
            weightKg={weightKg}
            birthYear={birthYear}
            mealSchedule={mealSchedule}
            overrides={mealOverrides}
            mealLogs={mealLogs}
            onEditLog={(log) => {
              setEditError("");
              setEditLog(log);
            }}
            onAddSession={(iso) => {
              setSessionFormDate(iso);
              setSessionSheet(true);
            }}
            saveSessionTime={saveSessionTime}
            onSaved={load}
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

      {sessionSheet ? (
        <>
          <div className="sheet-backdrop" onClick={() => setSessionSheet(false)} />
          <div className="sheet">
            <SessionForm
              defaultSport={mainSport}
              defaultDate={sessionFormDate}
              onCreated={(s) => {
                setSelected(s);
                setSelectedDate(s.session_date);
                setSessionSheet(false);
                load();
              }}
            />
          </div>
        </>
      ) : null}

      {editDate ? (
        <>
          <div className="sheet-backdrop" onClick={() => setEditDate(null)} />
          <div className="sheet">
            <MealDayEditor
              dateIso={editDate}
              mealSchedule={mealSchedule}
              overrides={mealOverrides}
              sessions={sessions.filter((s) => s.session_date === editDate)}
              onSave={saveDay}
              onSaveSessionTime={saveSessionTime}
              onClose={() => setEditDate(null)}
            />
            {editError ? <p className="error">{editError}</p> : null}
          </div>
        </>
      ) : null}

      {editLog ? (
        <>
          <div className="sheet-backdrop" onClick={() => setEditLog(null)} />
          <div className="sheet">
            <MealLogEditor
              log={editLog}
              onSaved={() => {
                setEditLog(null);
                load();
              }}
              onClose={() => setEditLog(null)}
            />
          </div>
        </>
      ) : null}

      <BottomNav active={activeTab} onTab={setActiveTab} onFab={() => setLogSheet(true)} />
    </div>
  );
}
