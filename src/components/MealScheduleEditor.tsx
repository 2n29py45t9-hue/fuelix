import { useState } from "react";
import type { MealSlotInput } from "../lib/fueling";
import { WEEKDAY_LONG, WEEKDAY_SHORT } from "../lib/mealSchedule";

/*
 * Raster-Editor (DUO-35): Mahlzeiten pro Wochentag einstellen.
 * Reine State-Komponente ohne Datenbankzugriff - die Persistenz macht der
 * Aufrufer: Onboarding speichert im finish(), der Kalender-Tab ueber den
 * Speichern-Button. Hexis kriegt das per App-Store-Reviews vorgeworfen
 * (starr 4-5 Anlässe) - hier ist jeder Wochentag frei konfigurierbar.
 */
export default function MealScheduleEditor({
  initial,
  onChange,
  embedded = false,
  onSave,
  busy = false
}: {
  initial: MealSlotInput[][];
  onChange?: (raster: MealSlotInput[][]) => void;
  embedded?: boolean;
  onSave?: (raster: MealSlotInput[][]) => void;
  busy?: boolean;
}) {
  const [raster, setRaster] = useState<MealSlotInput[][]>(initial.map((d) => d.map((m) => ({ ...m }))));
  const todayIdx = (new Date().getDay() + 6) % 7;
  const [day, setDay] = useState(todayIdx);

  const update = (next: MealSlotInput[][]) => {
    setRaster(next);
    if (onChange) onChange(next);
  };

  const current = raster[day] ?? [];

  const setDayRaster = (weekday: number, meals: MealSlotInput[]) => {
    update(raster.map((d, i) => (i === weekday ? meals : d)));
  };

  const changeMeal = (idx: number, patch: Partial<MealSlotInput>) => {
    setDayRaster(day, current.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  };

  const addMeal = () => {
    setDayRaster(day, [...current, { time: "15:00", label: "Snack", primary: false }]);
  };

  const removeMeal = (idx: number) => {
    setDayRaster(day, current.filter((_, i) => i !== idx));
  };

  const applyToAll = () => {
    update(raster.map(() => current.map((m) => ({ ...m }))));
  };

  return (
    <div className="mse">
      <div className="mse-days">
        {WEEKDAY_SHORT.map((wd, i) => (
          <button
            type="button"
            key={wd}
            className={"mse-daychip" + (i === day ? " active" : "")}
            onClick={() => setDay(i)}
          >
            {wd}
          </button>
        ))}
      </div>
      <p className="muted mse-hint">
        {WEEKDAY_LONG[day]} – wann isst du normalerweise? Deine Routine gilt für jede Woche; abweichende einzelne
        Tage änderst du direkt im Kalender.
      </p>
      <div className="mse-rows">
        {current.map((m, i) => (
          <div className="mse-row" key={i}>
            <input
              type="time"
              value={m.time}
              onChange={(e) => changeMeal(i, { time: e.target.value })}
              aria-label="Uhrzeit der Mahlzeit"
            />
            <input
              value={m.label}
              onChange={(e) => changeMeal(i, { label: e.target.value })}
              aria-label="Name der Mahlzeit"
            />
            <button
              type="button"
              className={"mse-primary" + (m.primary ? " on" : "")}
              onClick={() => changeMeal(i, { primary: !m.primary })}
              title={m.primary ? "Hauptmahlzeit – volle Portion Protein und KH" : "Snack – kleinerer Anteil"}
            >
              {m.primary ? "Haupt" : "Snack"}
            </button>
            <button type="button" className="favdel" onClick={() => removeMeal(i)} aria-label="Mahlzeit entfernen">
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="mse-actions">
        <button type="button" className="link" onClick={addMeal}>
          + Anlass hinzufügen
        </button>
        <button type="button" className="link" onClick={applyToAll}>
          Für alle Tage übernehmen
        </button>
      </div>
      {!embedded && onSave ? (
        <button type="button" onClick={() => onSave(raster)} disabled={busy}>
          {busy ? "Speichere ..." : "Tagesablauf speichern"}
        </button>
      ) : null}
    </div>
  );
}
