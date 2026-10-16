import { useState, type ReactNode } from "react";
import { ageFromBirthYear, dayTypeFor, dayTypeLabel, isYouthAthlete, mealPlanFor, type MealDayPlan, type MealPlanSession } from "../lib/fueling";
import { hhmmNow, localIso, minutesFromHHMM, weekdayIndexMondayFirst } from "../lib/date";
import { clearFutureOverrides, rasterFromRows, saveMealSchedule, saveOverrideForDate, saveRoutineForWeekday, slotsForDate, WEEKDAY_LONG, WEEKDAY_SHORT } from "../lib/mealSchedule";
import Tip from "./Tip";
import MealScheduleEditor from "./MealScheduleEditor";
import MealDayEditor, { type MealEditScope } from "./MealDayEditor";
import type { MealOverride, MealSlot, TrainingSession } from "../types";

/*
 * Kalender-Tab (DUO-36): klassische 3-Tage-Ansicht nach Kalender-Referenz
 * (Google/Notion): drei Tagesspalten nebeneinander, darunter ein
 * Stundenraster mit Zeitleiste. Mahlzeiten (aus Routine oder Override)
 * und Trainingseinheiten erscheinen als Ereignis-Chips an ihrer Uhrzeit.
 *
 * Notion-Logik fuer Wiederholungen: Das Onboarding legt die ROUTINE fest
 * (gilt automatisch fuer jede Woche, kein staendiges Neu-Angeben). Eine
 * Abweichung tippt man im Kalender an und entscheidet: nur dieses Datum
 * (Override) oder ab jetzt jede Wiederholung (Routine aendern).
 *
 * Strategisch uebernommene Kalender-Funktionen: Heute-Button, Navigation
 * in Sichtbreite (3 Tage), Ganztags-Reihe fuer Einheiten ohne Startzeit,
 * Jetzt-Markierung, Klick-auf-Ereignis = bearbeiten.
 */

/* Sichtbares Stundenfenster des Rasters. */
const HOURS = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];

const intensityShort = (i: string) => (i === "high" ? "intensiv" : i === "moderate" ? "mittel" : "leicht");
const hourOf = (hhmm: string): number => {
  const m = minutesFromHHMM(hhmm);
  if (m < 0) return -1;
  return Math.floor(m / 60);
};

export default function MealCalendar({
  selectedDate,
  onSelectDate,
  onSelectSession,
  sessions,
  weightKg,
  birthYear,
  mealSchedule,
  overrides,
  onSaved
}: {
  selectedDate: string;
  onSelectDate: (iso: string) => void;
  onSelectSession: (s: TrainingSession) => void;
  sessions: TrainingSession[];
  weightKg: number;
  birthYear: number | "";
  mealSchedule: MealSlot[];
  overrides: MealOverride[];
  onSaved: () => void;
}) {
  const [dayOffset, setDayOffset] = useState(0);
  const [editDate, setEditDate] = useState<string | null>(null);
  const [showRoutine, setShowRoutine] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const youth = isYouthAthlete(ageFromBirthYear(birthYear === "" ? null : birthYear));
  const todayIso = localIso();
  const nowHhmm = hhmmNow();
  const nowHour = hourOf(nowHhmm);

  const anchor = new Date();
  anchor.setHours(0, 0, 0, 0);
  anchor.setDate(anchor.getDate() + dayOffset);
  const monthLabel = anchor.toLocaleDateString("de-DE", { month: "long", year: "numeric" });

  const dayTypeOf = (list: TrainingSession[]) => {
    const minutes = list.reduce((sum, s) => sum + s.duration_min, 0);
    const longest = list.reduce((m, s) => Math.max(m, s.duration_min), 0);
    const maxInt = list.some((s) => s.intensity === "high") ? "high" : list.some((s) => s.intensity === "moderate") ? "moderate" : "low";
    return dayTypeFor(minutes, maxInt, longest);
  };

  const toPlanSessions = (list: TrainingSession[]): MealPlanSession[] =>
    list.map((s) => ({ start: s.session_start ?? null, durationMin: s.duration_min, intensity: s.intensity, heat: s.heat }));

  const days = [0, 1, 2].map((i) => {
    const d = new Date(anchor);
    d.setDate(d.getDate() + i);
    const iso = localIso(d);
    const weekday = weekdayIndexMondayFirst(iso);
    const ds = sessions.filter((s) => s.session_date === iso);
    const dayType = dayTypeOf(ds);

    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const nds = sessions.filter((s) => s.session_date === localIso(next));
    const nextDayKey = dayTypeOf(nds) === "race";

    const slotInputs = slotsForDate(mealSchedule, overrides, iso);
    const plan: MealDayPlan | null = slotInputs.length > 0
      ? mealPlanFor({
          slots: slotInputs,
          sessions: toPlanSessions(ds),
          weightKg,
          dayType,
          isYouth: youth,
          nextDayKey
        })
      : null;

    const mealEvents = plan
      ? plan.slots.map((s) => ({ hour: Math.max(HOURS[0], hourOf(s.time)), time: s.time, label: s.label, carbsG: s.carbsG, color: s.color }))
      : [];
    const timed = ds.filter((s) => s.session_start);
    const sessionEvents = timed.map((s) => ({ hour: Math.max(HOURS[0], hourOf(s.session_start ?? "")), s }));
    const untimed = ds.filter((s) => !s.session_start);

    return { iso, weekday, num: d.getDate(), isToday: iso === todayIso, dayType, ds, untimed, plan, mealEvents, sessionEvents };
  });

  const saveDay = async (slots: { time: string; label: string; primary: boolean }[], scope: MealEditScope) => {
    if (!editDate) return;
    setBusy(true);
    setError("");
    try {
      const weekday = weekdayIndexMondayFirst(editDate);
      if (scope === "once") {
        await saveOverrideForDate(editDate, slots);
      } else {
        await saveRoutineForWeekday(weekday, slots);
        await clearFutureOverrides(weekday, editDate);
      }
      onSaved();
      setEditDate(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    }
    setBusy(false);
  };

  const saveRoutine = async (raster: { time: string; label: string; primary: boolean }[][]) => {
    setBusy(true);
    setError("");
    try {
      await saveMealSchedule(raster);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    }
    setBusy(false);
  };

  return (
    <div className="cal">
      <div className="card">
        <div className="ds-head">
          <span className="ds-month">Kalender · {monthLabel}</span>
          <div className="ds-weeknav">
            <button type="button" className="ds-navbtn" onClick={() => setDayOffset(dayOffset - 3)} aria-label="Frühere Tage">
              ←
            </button>
            <button type="button" className="ds-navbtn" onClick={() => setDayOffset(0)}>
              Heute
            </button>
            <button type="button" className="ds-navbtn" onClick={() => setDayOffset(dayOffset + 3)} aria-label="Spätere Tage">
              →
            </button>
          </div>
        </div>
        <p className="muted">
          Drei Tage nebeneinander: Mahlzeiten aus deiner Routine und geplante Einheiten im Stundenraster. Tippe auf
          eine Mahlzeit, um sie für einen einzelnen Tag oder ab jetzt für jede Wiederholung anzupassen – tippe auf
          eine Einheit, um ihren Fueling-Plan zu öffnen.{" "}
          <Tip text="Dein Onboarding-Raster ist die Routine und gilt automatisch für jede Woche – du musst sie nicht immer wieder angeben. Abweichungen (Wettkampf, Reisen) legst du als Override für genau ein Datum an. Carb Coding: Jeder Anlass zeigt das gegen das Training periodisierte Ziel (grün = KH-Betonung, gelb = moderat, rot = wenig)." />
        </p>
      </div>

      <div className="card cal3-card">
        <div className="cal3-scroll">
          <div className="cal3-grid">
            <div className="cal3-corner" />
            {days.map((day) => (
              <div className={"cal3-dhead" + (day.iso === selectedDate ? " selected" : "")} key={day.iso}>
                <button type="button" className="cal3-dtitle" onClick={() => onSelectDate(day.iso)} title="Tag im Plan-Tab öffnen">
                  <span className="cal3-dwd">{WEEKDAY_SHORT[day.weekday]} · {day.num}.</span>
                  <span className={"badge badge-" + day.dayType}>{dayTypeLabel(day.dayType)}</span>
                  {day.plan ? (
                    <span className="cal3-dtarget">{day.plan.totalCarbsG} g KH</span>
                  ) : null}
                </button>
                <button
                  type="button"
                  className="cal3-add"
                  onClick={() => setEditDate(day.iso)}
                  aria-label={"Mahlzeiten an diesem Tag anpassen"}
                  title="Mahlzeiten für diesen Tag anpassen"
                >
                  + Mahlzeit
                </button>
              </div>
            ))}

            <div className="cal3-gutter cal3-gutter-allday" />
            {days.map((day) => (
              <div className="cal3-cell cal3-allday" key={"ad" + day.iso}>
                {day.untimed.map((s) => (
                  <button type="button" className="calev calev-session" key={s.id ?? s.session_date} onClick={() => onSelectSession(s)}>
                    <span className="calev-label">{s.sport} · {s.duration_min} min · {intensityShort(s.intensity)}</span>
                    <span className="calev-target">ohne Zeit</span>
                  </button>
                ))}
              </div>
            ))}

            {HOURS.map((h) => {
              const cells: ReactNode[] = [
                <div className="cal3-gutter" key={"g" + h}>
                  {String(h).padStart(2, "0")}:00
                </div>
              ];
              for (const day of days) {
                const meals = day.mealEvents.filter((e) => e.hour === h);
                const sess = day.sessionEvents.filter((e) => e.hour === h);
                const isNow = day.isToday && h === nowHour;
                cells.push(
                  <div className={"cal3-cell" + (isNow ? " now" : "")} key={day.iso + "h" + h}>
                    {sess.map((e) => (
                      <button
                        type="button"
                        className="calev calev-session"
                        key={e.s.id ?? e.s.session_date + e.s.duration_min}
                        onClick={() => onSelectSession(e.s)}
                        title="Fueling-Plan dieser Einheit öffnen"
                      >
                        <span className="calev-time">{e.s.session_start}</span>
                        <span className="calev-label">{e.s.sport} · {e.s.duration_min} min</span>
                      </button>
                    ))}
                    {meals.map((e) => (
                      <button
                        type="button"
                        className="calev calev-meal"
                        key={e.time + e.label}
                        onClick={() => setEditDate(day.iso)}
                        title="Mahlzeit für diesen Tag anpassen"
                      >
                        <span className="calev-time">{e.time}</span>
                        <span className={"calev-dot " + e.color} />
                        <span className="calev-label">{e.label}</span>
                        <span className="calev-target">≈ {e.carbsG} g KH</span>
                      </button>
                    ))}
                  </div>
                );
              }
              return cells;
            })}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="ds-head">
          <h2 style={{ margin: 0 }}>Deine Wochen-Routine</h2>
          <button type="button" className="ds-navbtn" onClick={() => setShowRoutine(!showRoutine)}>
            {showRoutine ? "Schließen" : "Bearbeiten"}
          </button>
        </div>
        {showRoutine ? (
          <MealScheduleEditor initial={rasterFromRows(mealSchedule)} onSave={saveRoutine} busy={busy} />
        ) : (
          <p className="muted">
            Die Mahlzeiten aus deinem Onboarding sind deine Routine und gelten automatisch für jede Woche. Abweichende
            Tage passt du direkt oben im Kalender an – tippe auf eine Mahlzeit oder auf „+ Mahlzeit“ im Tageskopf und
            wähle, ob die Änderung nur für einen Tag oder ab jetzt für jede Wiederholung gilt.
          </p>
        )}
        {error ? <p className="error">{error}</p> : null}
      </div>

      {editDate ? (
        <>
          <div className="sheet-backdrop" onClick={() => setEditDate(null)} />
          <div className="sheet">
            <MealDayEditor
              dateIso={editDate}
              mealSchedule={mealSchedule}
              overrides={overrides}
              busy={busy}
              onSave={saveDay}
              onClose={() => setEditDate(null)}
            />
            {error ? <p className="error">{error}</p> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
