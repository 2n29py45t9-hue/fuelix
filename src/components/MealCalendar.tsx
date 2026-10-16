import { useState } from "react";
import { dayTypeFor, dayTypeLabel, isYouthAthlete, ageFromBirthYear, mealPlanFor, type MealPlanSession, type MealDayPlan } from "../lib/fueling";
import { localIso } from "../lib/date";
import { rasterFromRows, saveMealSchedule, slotsForWeekday, WEEKDAY_LONG } from "../lib/mealSchedule";
import Tip from "./Tip";
import MealScheduleEditor from "./MealScheduleEditor";
import type { MealSlot, TrainingSession } from "../types";

/*
 * Kalender-Tab (DUO-35): Wochenübersicht mit Mahlzeitenzeiten und
 * vorgeschlagener Periodisierung pro Anlass – das, was der Nutzer im
 * Onboarding als Raster festlegt, wird hier gegen das geplante
 * Trainingspensum periodisiert (Carb Coding pro Mahlzeit, Hexis-Stil).
 * Zusätzlich 72-h-Logik: ist morgen eine harte Einheit geplant,
 * hebt der Vorabend-Anlass an.
 */
function mondayOf(date: Date): Date {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

const intensityShort = (i: string) => (i === "high" ? "intensiv" : i === "moderate" ? "mittel" : "leicht");

export default function MealCalendar({
  selectedDate,
  onSelectDate,
  sessions,
  weightKg,
  birthYear,
  mealSchedule,
  onScheduleSaved
}: {
  selectedDate: string;
  onSelectDate: (iso: string) => void;
  sessions: TrainingSession[];
  weightKg: number;
  birthYear: number | "";
  mealSchedule: MealSlot[];
  onScheduleSaved: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const [showEditor, setShowEditor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const youth = isYouthAthlete(ageFromBirthYear(birthYear === "" ? null : birthYear));

  const monday = mondayOf(new Date());
  monday.setDate(monday.getDate() + offset * 7);

  const dayTypeOf = (list: TrainingSession[]) => {
    const minutes = list.reduce((sum, s) => sum + s.duration_min, 0);
    const longest = list.reduce((m, s) => Math.max(m, s.duration_min), 0);
    const maxInt = list.some((s) => s.intensity === "high") ? "high" : list.some((s) => s.intensity === "moderate") ? "moderate" : "low";
    return dayTypeFor(minutes, maxInt, longest);
  };

  const toPlanSessions = (list: TrainingSession[]): MealPlanSession[] =>
    list.map((s) => ({ start: s.session_start ?? null, durationMin: s.duration_min, intensity: s.intensity, heat: s.heat }));

  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    const iso = localIso(d);
    const ds = sessions.filter((s) => s.session_date === iso);
    const dayType = dayTypeOf(ds);

    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const nextIso = localIso(next);
    const nds = sessions.filter((s) => s.session_date === nextIso);
    const nextDayKey = dayTypeOf(nds) === "race";

    const slotInputs = slotsForWeekday(mealSchedule, i);
    let plan: MealDayPlan | null = null;
    if (slotInputs.length > 0) {
      plan = mealPlanFor({
        slots: slotInputs,
        sessions: toPlanSessions(ds),
        weightKg,
        dayType,
        isYouth: youth,
        nextDayKey
      });
    }
    return { iso, weekday: i, num: d.getDate(), dayType, ds, plan, slotCount: slotInputs.length };
  });

  const saveSchedule = async (raster: { time: string; label: string; primary: boolean }[][]) => {
    setBusy(true);
    setError("");
    try {
      await saveMealSchedule(raster);
      onScheduleSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    }
    setBusy(false);
  };

  return (
    <div className="cal">
      <div className="card">
        <div className="ds-head">
          <span className="ds-month">Kalender · Mahlzeiten &amp; Periodisierung</span>
          <div className="ds-weeknav">
            <button type="button" className="ds-navbtn" onClick={() => setOffset(offset - 1)} aria-label="Frühere Woche">
              ←
            </button>
            <button type="button" className="ds-navbtn" onClick={() => setOffset(0)}>
              Heute
            </button>
            <button type="button" className="ds-navbtn" onClick={() => setOffset(offset + 1)} aria-label="Spätere Woche">
              →
            </button>
          </div>
        </div>
        <p className="muted">
          Jeder Tag zeigt dein Raster mit den vorgeschlagenen Zielen pro Anlass – periodisiert gegen dein geplantes
          Training (grün = KH-Betonung, gelb = moderat, rot = wenig). Tippe auf einen Tag für die Detailansicht.{" "}
          <Tip text="Carb Coding pro Mahlzeit: Das Tages-KH-Ziel wird auf deine Anlässe verteilt. Trainingsnahe Anlässe (davor/danach) bekommen den größten Anteil, am Ruhetag sinken die Ziele. Grundlage: Fuel-for-the-Work-Required-Forschung (Impey et al.), Details im Quellenreport." />
        </p>
      </div>

      <div className="cal-grid">
        {days.map((day) => (
          <button
            type="button"
            key={day.iso}
            className={"cal-day" + (day.iso === selectedDate ? " selected" : "")}
            onClick={() => onSelectDate(day.iso)}
          >
            <div className="cal-head">
              <h3>{WEEKDAY_LONG[day.weekday]}, {day.num}.</h3>
              <span className={"badge badge-" + day.dayType}>{dayTypeLabel(day.dayType)}</span>
            </div>
            {day.ds.length > 0 ? (
              <div className="cal-sess">
                {day.ds.map((s) => (
                  <span className="badge" key={s.id ?? s.session_date + s.duration_min}>
                    {s.sport} · {s.duration_min} min · {intensityShort(s.intensity)}
                    {s.session_start ? " · " + s.session_start : ""}
                  </span>
                ))}
              </div>
            ) : null}
            {day.plan ? (
              <>
                <div className="cal-totals">
                  Ziel: {day.plan.totalCarbsG} g KH · {day.plan.totalProteinG} g Protein
                  {day.plan.sessionFuelG > 0 ? " · davon " + day.plan.sessionFuelG + " g auf der Einheit" : ""}
                </div>
                <div className="cal-slots">
                  {day.plan.slots.map((slot) => (
                    <div className="calslot" key={slot.time + slot.label}>
                      <span className="calslot-time">{slot.time}</span>
                      <span className={"calslot-dot " + slot.color} />
                      <span className="calslot-label">
                        {slot.label} <Tip text={slot.explanation} />
                      </span>
                      <span className="calslot-target">
                        ≈ {slot.carbsG} g KH · {slot.proteinG} g P
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="cal-empty">
                Kein Tagesablauf für {WEEKDAY_LONG[day.weekday]} – lege ihn unten im Editor fest.
              </p>
            )}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="ds-head">
          <h2 style={{ margin: 0 }}>Tagesablauf bearbeiten</h2>
          <button type="button" className="ds-navbtn" onClick={() => setShowEditor(!showEditor)}>
            {showEditor ? "Schließen" : "Bearbeiten"}
          </button>
        </div>
        {showEditor ? (
          <MealScheduleEditor initial={rasterFromRows(mealSchedule)} onSave={saveSchedule} busy={busy} />
        ) : (
          <p className="muted">
            Dein wochentägliches Mahlzeitenraster – hier änderst du Uhrzeiten, Anlässe und Hauptmahlzeiten. Das Onboarding
            legt ein Standard-Raster fest (Frühstück, Mittag, Abend, Snack).
          </p>
        )}
        {error ? <p className="error">{error}</p> : null}
      </div>
    </div>
  );
}
