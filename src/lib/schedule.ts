import type { MealOverride, MealSlot } from "../types";
import type { MealSlotInput } from "./fueling";
import { weekdayIndexMondayFirst } from "./date";

/*
 * Reine Raster-Logik (DUO-36): Wochen-Routine (meal_schedule, gilt fuer
 * jede Woche) plus datums-spezifische Overrides (meal_overrides, Notion-
 * Logik: "nur dieses Datum"). Ohne Datenbankzugriff - deshalb testbar.
 */

export const WEEKDAY_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
export const WEEKDAY_LONG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

/* Standard-Raster: 3 Hauptmahlzeiten + 1 Abend-Snack, fuer alle 7 Tage gleich. */
export function defaultRaster(): MealSlotInput[][] {
  const day = (): MealSlotInput[] => [
    { time: "07:00", label: "Frühstück", primary: true },
    { time: "12:30", label: "Mittagessen", primary: true },
    { time: "18:30", label: "Abendessen", primary: true },
    { time: "20:30", label: "Abend-Snack", primary: false }
  ];
  return [0, 1, 2, 3, 4, 5, 6].map(() => day());
}

/* DB-Zeilen -> Raster; Tage ohne Zeilen behalten das Standard-Raster. */
export function rasterFromRows(rows: MealSlot[]): MealSlotInput[][] {
  const raster = defaultRaster();
  for (let w = 0; w < 7; w++) {
    const dayRows = rows.filter((r) => r.weekday === w).sort((a, b) => a.time.localeCompare(b.time));
    if (dayRows.length > 0) {
      raster[w] = dayRows.map((r) => ({ time: r.time, label: r.label, primary: r.primary_meal }));
    }
  }
  return raster;
}

/* Anlaesse eines Wochentags aus der Routine, sortiert nach Uhrzeit. */
export function slotsForWeekday(rows: MealSlot[], weekday: number): MealSlotInput[] {
  return rows
    .filter((r) => r.weekday === weekday)
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((r) => ({ time: r.time, label: r.label, primary: r.primary_meal }));
}

/* Overrides fuer genau ein Datum, sortiert nach Uhrzeit. */
export function overridesForDate(overrides: MealOverride[], iso: string): MealSlotInput[] {
  return overrides
    .filter((o) => o.date === iso)
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((o) => ({ time: o.time, label: o.label, primary: o.primary_meal }));
}

/*
 * Effektive Anlaesse eines Datums (DUO-36): ein Override gewinnt gegen
 * die Routine (Notion: "nur dieses Datum"), ohne Override gilt der
 * Wochentag der Routine. Eine leere Override-Liste faellt auf die
 * Routine zurueck.
 */
export function slotsForDate(rows: MealSlot[], overrides: MealOverride[], iso: string): MealSlotInput[] {
  const day = overridesForDate(overrides, iso);
  if (day.length > 0) return day;
  return slotsForWeekday(rows, weekdayIndexMondayFirst(iso));
}
