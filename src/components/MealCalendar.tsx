import { useState, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { ageFromBirthYear, dayTypeFor, dayTypeLabel, isYouthAthlete, mealPlanFor, type MealDayPlan, type MealPlanSession, type MealSlotPlan } from "../lib/fueling";
import { hhmmFromIso, hhmmNow, localIso, minutesFromHHMM, weekdayIndexMondayFirst } from "../lib/date";
import { clearFutureOverrides, saveOverrideForDate, saveRoutineForWeekday, slotsForDate, WEEKDAY_SHORT } from "../lib/mealSchedule";
import Tip from "./Tip";
import MealDayEditor, { type MealEditScope } from "./MealDayEditor";
import type { DayType, MealLog, MealOverride, MealSlot, TrainingSession } from "../types";

/*
 * Kalender-Tab (DUO-36 + DUO-39/40/42/46): 3-Tage-Ansicht nach
 * Kalender-Referenz (Google/Notion) mit Stundenraster.
 *
 * DUO-39: Monat im Header, aufklappbare Monatsuebersicht (heute gruen,
 * DayType-Markierungen, Monats-Navigation), heutiges Datum als grüner
 * Springe-zu-Heute-Button oben rechts, Erklär-Kasten entfernt.
 * DUO-40: Trainingseinheiten als Bloecke ueber ihre VOLLE Dauer im
 * Raster, geloggte Mahlzeiten und Snacks erscheinen als Chips (wie in
 * der Home-Timeline) und sind klickbar – auch nachträglich loggen
 * (geplanter Anlass antippen → "Als gegessen loggen") und anpassen.
 * DUO-42: "+ Mahlzeit" ist jetzt "Tag anpassen" – Mahlzeiten UND
 * Trainingszeiten des Tages; die Wochen-Routine-Karte ist entfernt
 * (die Notion-Logik "nur dieser Tag / ab jetzt jede Wiederholung"
 * steckt in jedem Tag).
 * DUO-46: Navigation um genau EINEN Tag (die Woche im Kopf
 * durchgehen), "+ Termin"-Button legt Training/Events an beliebigen
 * Daten an.
 */

/* Sichtbares Stundenfenster des Rasters. */
const HOURS = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];

/* Zeilenhoehe einer Stundenzeile - Trainingsbloecke rechnen ihre
 * Hoehen daraus ab (DUO-40). */
const HOUR_H = 52;

const intensityShort = (i: string) => (i === "high" ? "intensiv" : i === "moderate" ? "mittel" : "leicht");
const hourOf = (hhmm: string): number => {
  const m = minutesFromHHMM(hhmm);
  if (m < 0) return -1;
  return Math.floor(m / 60);
};
const endHhmm = (start: string, durationMin: number): string => {
  const m = minutesFromHHMM(start);
  if (m < 0) return "";
  const end = m + durationMin;
  return String(Math.floor(end / 60)).padStart(2, "0") + ":" + String(end % 60).padStart(2, "0");
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
  mealLogs,
  onEditLog,
  onAddSession,
  saveSessionTime,
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
  /* DUO-40: geloggte Mahlzeiten/Snacks als Chips im Raster. */
  mealLogs: MealLog[];
  onEditLog: (log: MealLog) => void;
  /* DUO-46: Training/Event an beliebigem Datum anlegen. */
  onAddSession: (dateIso: string) => void;
  /* DUO-42: Trainingszeit aus dem Tages-Editor heraus speichern. */
  saveSessionTime: (sessionId: string, time: string) => void;
  onSaved: () => void;
}) {
  const [dayOffset, setDayOffset] = useState(0);
  const [editDate, setEditDate] = useState<string | null>(null);
  const [showMonth, setShowMonth] = useState(false);
  const [mealAction, setMealAction] = useState<{ dateIso: string; dateLabel: string; slot: MealSlotPlan } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const youth = isYouthAthlete(ageFromBirthYear(birthYear === "" ? null : birthYear));
  const todayIso = localIso();
  const todayLabel = new Date().toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
  const nowHhmm = hhmmNow();
  const nowHour = hourOf(nowHhmm);

  const anchor = new Date();
  anchor.setHours(0, 0, 0, 0);
  anchor.setDate(anchor.getDate() + dayOffset);
  const anchorIso = localIso(anchor);
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
      ? plan.slots.map((s) => ({ hour: Math.max(HOURS[0], hourOf(s.time)), time: s.time, label: s.label, carbsG: s.carbsG, proteinG: s.proteinG, color: s.color, slot: s }))
      : [];
    const timed = ds.filter((s) => s.session_start);
    const sessionEvents = timed.map((s) => ({ hour: Math.max(HOURS[0], hourOf(s.session_start ?? "")), s }));
    const untimed = ds.filter((s) => !s.session_start);
    /* DUO-40: geloggte Mahlzeiten und Snacks gehoeren in die Kalender-
     * Timeline (gleiche Daten wie auf der Home-Seite). */
    const logEvents = mealLogs
      .filter((l) => l.log_date === iso)
      .map((l) => ({ hour: Math.max(HOURS[0], hourOf(hhmmFromIso(l.created_at))), log: l }));

    return { iso, weekday, num: d.getDate(), isToday: iso === todayIso, dayType, ds, untimed, plan, mealEvents, sessionEvents, logEvents };
  });

  /* DUO-39: Monatsuebersicht - Monat des Anker-Tags, Navigation durch
   * Monate verschiebt den Anker auf den Monatsersten. */
  const todayMid = new Date();
  todayMid.setHours(0, 0, 0, 0);
  const diffDays = (d: Date) => Math.round((d.getTime() - todayMid.getTime()) / 86400000);
  const monthFirst = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const monthTitle = monthFirst.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
  const daysInMonth = new Date(monthFirst.getFullYear(), monthFirst.getMonth() + 1, 0).getDate();
  const lead = (monthFirst.getDay() + 6) % 7;
  type MonthCell = { iso: string; num: number; dayType: DayType | null; diff: number } | null;
  const monthCells: MonthCell[] = [];
  for (let i = 0; i < lead; i += 1) monthCells.push(null);
  for (let i = 1; i <= daysInMonth; i += 1) {
    const d = new Date(monthFirst.getFullYear(), monthFirst.getMonth(), i);
    const iso = localIso(d);
    const ds = sessions.filter((s) => s.session_date === iso);
    monthCells.push({ iso, num: i, dayType: ds.length > 0 ? dayTypeOf(ds) : null, diff: diffDays(d) });
  }
  while (monthCells.length % 7 !== 0) monthCells.push(null);
  const gotoMonth = (delta: number) => {
    const m = new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1);
    setDayOffset(diffDays(m));
  };

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

  /* DUO-40: geplanten Anlass nachtraeglich als gegessen loggen. */
  const logPlannedMeal = async () => {
    if (!mealAction) return;
    const slot = mealAction.slot;
    setBusy(true);
    setError("");
    const { error: logError } = await supabase.from("meal_logs").insert({
      log_date: mealAction.dateIso,
      logged_ms: 0,
      name: slot.label,
      phase: slot.relation === "pre" ? "pre" : slot.relation === "post" ? "post" : "snack",
      carbs_g: slot.carbsG,
      protein_g: slot.proteinG,
      fat_g: 0
    });
    setBusy(false);
    if (logError) {
      setError(logError.message);
      return;
    }
    setMealAction(null);
    onSaved();
  };

  return (
    <div className="cal">
      <div className="card">
        <div className="ds-head">
          <span className="ds-month">
            {monthLabel}{" "}
            <Tip text="Carb Coding: Jeder Tag zeigt seinen Typ (Ruhetag, Belastungstag, Wettkampftag) und jedes geplante Ziel ist gegen dein Training periodisiert. Deine Onboarding-Routine gilt automatisch für jede Woche; Abweichungen legst du pro Tag an (Override) oder änderst ab jetzt jede Wiederholung." />
          </span>
          <div className="ds-weeknav">
            <button type="button" className="cal-addbtn" onClick={() => onAddSession(anchorIso)} title="Training oder Event an beliebigem Datum anlegen">
              + Termin
            </button>
            <button type="button" className="ds-navbtn" onClick={() => setDayOffset(dayOffset - 1)} aria-label="Vorheriger Tag">
              ←
            </button>
            <button
              type="button"
              className={"ds-navbtn" + (showMonth ? " on" : "")}
              onClick={() => setShowMonth(!showMonth)}
              aria-label="Monatsübersicht ein- oder ausklappen"
              title="Monatsübersicht"
            >
              Monat
            </button>
            <button
              type="button"
              className={"ds-today" + (dayOffset === 0 ? " on" : "")}
              onClick={() => setDayOffset(0)}
              title="Zum heutigen Tag springen"
            >
              {todayLabel}
            </button>
            <button type="button" className="ds-navbtn" onClick={() => setDayOffset(dayOffset + 1)} aria-label="Nächster Tag">
              →
            </button>
          </div>
        </div>

        {showMonth ? (
          <div className="mgrid">
            <div className="mgrid-nav">
              <button type="button" className="ds-navbtn" onClick={() => gotoMonth(-1)} aria-label="Vorheriger Monat">
                ←
              </button>
              <span className="mgrid-title">{monthTitle}</span>
              <button type="button" className="ds-navbtn" onClick={() => gotoMonth(1)} aria-label="Nächster Monat">
                →
              </button>
            </div>
            <div className="mgrid-weekdays">
              {WEEKDAY_SHORT.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div className="mgrid-days">
              {monthCells.map((c, i) =>
                c ? (
                  <button
                    type="button"
                    key={c.iso}
                    className={"mgrid-day" + (c.iso === todayIso ? " today" : "") + (c.iso === anchorIso ? " anchor" : "")}
                    onClick={() => setDayOffset(c.diff)}
                    title={c.dayType ? dayTypeLabel(c.dayType) : "Tag anzeigen"}
                  >
                    {c.num}
                    {c.dayType ? <span className={"mgrid-dot " + c.dayType} /> : null}
                  </button>
                ) : (
                  <span className="mgrid-empty" key={"e" + i} />
                )
              )}
            </div>
          </div>
        ) : null}
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
                  aria-label={"Mahlzeiten und Trainingszeiten dieses Tages anpassen"}
                  title="Mahlzeiten und Trainingszeiten dieses Tages anpassen"
                >
                  Tag anpassen
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
                const logs = day.logEvents.filter((e) => e.hour === h);
                const isNow = day.isToday && h === nowHour;
                cells.push(
                  <div className={"cal3-cell" + (isNow ? " now" : "")} key={day.iso + "h" + h}>
                    {sess.map((e) => {
                      const blockH = Math.max(46, Math.round((e.s.duration_min / 60) * HOUR_H));
                      return (
                        <button
                          type="button"
                          className="calev calev-session calev-block"
                          style={{ height: blockH + "px" }}
                          key={e.s.id ?? e.s.session_date + e.s.duration_min}
                          onClick={() => onSelectSession(e.s)}
                          title="Fueling-Plan dieser Einheit öffnen"
                        >
                          <span className="calev-time">{e.s.session_start} – {endHhmm(e.s.session_start ?? "", e.s.duration_min)}</span>
                          <span className="calev-label">{e.s.sport}</span>
                          <span className="calev-target">{e.s.duration_min} min · {intensityShort(e.s.intensity)}</span>
                        </button>
                      );
                    })}
                    {meals.map((e) => (
                      <button
                        type="button"
                        className="calev calev-meal"
                        key={e.time + e.label}
                        onClick={() => {
                          const dateLabel = new Date(day.iso + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
                          setMealAction({ dateIso: day.iso, dateLabel, slot: e.slot });
                        }}
                        title="Antippen: als gegessen loggen oder den Tag anpassen"
                      >
                        <span className="calev-time">{e.time}</span>
                        <span className={"calev-dot " + e.color} />
                        <span className="calev-label">{e.label}</span>
                        <span className="calev-target">≈ {e.carbsG} g KH</span>
                      </button>
                    ))}
                    {logs.map((e) => (
                      <button
                        type="button"
                        className={"calev calev-log tile-" + e.log.phase}
                        key={e.log.id}
                        onClick={() => onEditLog(e.log)}
                        title="Log ansehen, korrigieren oder löschen"
                      >
                        <span className="calev-time">{hhmmFromIso(e.log.created_at)}</span>
                        <span className="calev-label">{e.log.name}</span>
                        <span className="calev-target">{Math.round(Number(e.log.carbs_g))} g KH · {Math.round(Number(e.log.protein_g))} g P</span>
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

      {editDate ? (
        <>
          <div className="sheet-backdrop" onClick={() => setEditDate(null)} />
          <div className="sheet">
            <MealDayEditor
              dateIso={editDate}
              mealSchedule={mealSchedule}
              overrides={overrides}
              sessions={sessions.filter((s) => s.session_date === editDate)}
              busy={busy}
              onSave={saveDay}
              onSaveSessionTime={saveSessionTime}
              onClose={() => setEditDate(null)}
            />
            {error ? <p className="error">{error}</p> : null}
          </div>
        </>
      ) : null}

      {mealAction ? (
        <>
          <div className="sheet-backdrop" onClick={() => setMealAction(null)} />
          <div className="sheet">
            <h2 style={{ margin: 0 }}>{mealAction.slot.label}</h2>
            <p className="muted mse-hint">
              {mealAction.dateLabel} · {mealAction.slot.time} Uhr · Ziel ≈ {mealAction.slot.carbsG} g KH und {mealAction.slot.proteinG} g Protein.
              Gegessen wie geplant? Dann logge den Anlass – auch nachträglich. Oder passe den Tag an.
            </p>
            <div className="mse-actions">
              <button type="button" onClick={logPlannedMeal} disabled={busy}>
                {busy ? "Speichere ..." : "Als gegessen loggen"}
              </button>
              <button
                type="button"
                className="link"
                onClick={() => {
                  const d = mealAction.dateIso;
                  setMealAction(null);
                  setEditDate(d);
                }}
              >
                Tag anpassen
              </button>
            </div>
            {error ? <p className="error">{error}</p> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
