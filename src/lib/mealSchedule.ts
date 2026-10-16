import { supabase } from "./supabase";
import type { MealOverride, MealSlot } from "../types";
import type { MealSlotInput } from "./fueling";
import { weekdayIndexMondayFirst } from "./date";
import { defaultRaster, overridesForDate, rasterFromRows, slotsForDate, slotsForWeekday, WEEKDAY_LONG, WEEKDAY_SHORT } from "./schedule";

/*
 * Mahlzeiten-Raster: Persistenz (DUO-35) und Notion-Logik (DUO-36):
 * meal_schedule = Wochen-Routine, meal_overrides = Abweichung fuer genau
 * ein Datum. Reine Logik liegt in ./schedule (testbar ohne Datenbank).
 */

export { defaultRaster, overridesForDate, rasterFromRows, slotsForDate, slotsForWeekday, WEEKDAY_LONG, WEEKDAY_SHORT };

/* Gesamtes Routine-Raster atomar speichern: alte Zeilen loeschen, neue schreiben. */
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

/*
 * DUO-36: Abweichung fuer genau ein Datum speichern (Notion: "nur dieses
 * Datum"). Ueberschreibt die Routine dieses Tages komplett. Eine leere
 * Liste entfernt den Override - der Tag faellt zur Routine zurueck.
 */
export async function saveOverrideForDate(iso: string, slots: MealSlotInput[]): Promise<void> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error("Nicht angemeldet");
  await supabase.from("meal_overrides").delete().eq("user_id", user.id).eq("date", iso);
  const rows = slots
    .filter((s) => s.time && s.label)
    .map((s) => ({ user_id: user.id, date: iso, time: s.time, label: s.label, primary_meal: s.primary }));
  if (rows.length === 0) return;
  const { error } = await supabase.from("meal_overrides").insert(rows);
  if (error) throw error;
}

/*
 * DUO-36: Routine eines Wochentags aendern (Notion: "alle zukuenftigen
 * Wiederholungen"). Bestehende Overrides an kommenden Terminen dieses
 * Wochentags werden geloescht, damit die neue Routine greift.
 */
export async function saveRoutineForWeekday(weekday: number, slots: MealSlotInput[]): Promise<void> {
  const { data } = await supabase.from("meal_schedule").select("*");
  const raster = rasterFromRows((data ?? []) as MealSlot[]);
  raster[weekday] = slots;
  await saveMealSchedule(raster);
}

/* Overrides dieses Wochentags ab einem Datum loeschen (Routine uebernimmt). */
export async function clearFutureOverrides(weekday: number, fromIso: string): Promise<void> {
  const { data } = await supabase.from("meal_overrides").select("*").gte("date", fromIso);
  if (!data) return;
  const ids = (data as MealOverride[])
    .filter((o) => weekdayIndexMondayFirst(o.date) === weekday)
    .map((o) => o.id);
  if (ids.length === 0) return;
  await supabase.from("meal_overrides").delete().in("id", ids);
}
