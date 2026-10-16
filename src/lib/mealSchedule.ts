import { supabase } from "./supabase";
import type { MealSlot } from "../types";
import type { MealSlotInput } from "./fueling";

/*
 * Mahlzeiten-Raster (DUO-35): Persistenz und Mapping fuer das
 * wochentags-individuelle Mahlzeitenraster.
 */

export const WEEKDAY_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
export const WEEKDAY_LONG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

/* Standard-Raster: 3 Hauptmahlzeiten + 1 Abend-Snack, initially fuer alle 7 Tage gleich. */
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

/* Anlässe eines Wochentags, sortiert nach Uhrzeit. */
export function slotsForWeekday(rows: MealSlot[], weekday: number): MealSlotInput[] {
  return rows
    .filter((r) => r.weekday === weekday)
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((r) => ({ time: r.time, label: r.label, primary: r.primary_meal }));
}

/* Gesamtes Raster atomar speichern: alte Zeilen loeschen, neue schreiben. */
export async function saveMealSchedule(raster: MealSlotInput[][]): Promise<void> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error("Nicht angemeldet");
  await supabase.from("meal_schedule").delete().eq("user_id", user.id);
  const rows = raster.flatMap((day, weekday) =>
    day
      .filter((s) => s.time && s.label)
      .map((s) => ({ user_id: user.id, weekday, time: s.time, label: s.label, primary_meal: s.primary }))
  );
  if (rows.length === 0) return;
  const { error } = await supabase.from("meal_schedule").insert(rows);
  if (error) throw error;
}
