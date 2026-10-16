import { hhmmFromIso, localIso } from "./date";
import type { Intensity, TrainingSession } from "../types";

/* Strava-Sync (DUO-23): reine Mapping-Logik, frei von Side-Effects -> testbar.
 * Garmin-Aktivitaeten laufen ueber die Garmin-Connect-Strava-Verbindung ein. */

export interface StravaActivity {
  id: number;
  name: string;
  sport_type?: string;
  type?: string;
  start_date: string;
  moving_time: number;
  distance: number;
  average_heartrate?: number;
  total_elevation_gain?: number;
}

export function sportFromStrava(activity: StravaActivity): string {
  const raw = activity.sport_type ?? activity.type ?? "";
  if (["Ride", "VirtualRide", "MountainBikeRide", "GravelRide", "EMountainBikeRide", "HandCycle"].indexOf(raw) >= 0) return "Radsport";
  if (["Run", "TrailRun", "VirtualRun", "TreadmillRun"].indexOf(raw) >= 0) return "Laufen";
  if (raw === "Swim" || raw === "VirtualSwim") return "Schwimmen";
  if (raw === "Hike" || raw === "Walk") return "Wandern";
  if (["AlpineSki", "NordicSki", "BackcountrySki"].indexOf(raw) >= 0) return "Skilauf";
  if (["WeightTraining", "Crossfit", "Workout", "Yoga", "HighIntensityIntervalTraining"].indexOf(raw) >= 0) return "Krafttraining";
  if (raw === "" || raw === "Other") return "Training";
  return raw;
}

/*
 * Intensitaets-Schaetzung ueber die Durchschnitts-Herzfrequenz (Richtwerte):
 * unter 120 low (Grundlagen), 120-150 moderate, ueber 150 high.
 * Ohne Herzfrequenz: moderate als konservative Voreinstellung -
 * die Einheit ist danach jederzeit manuell korrigierbar.
 */
export function intensityFromStrava(averageHr?: number): Intensity {
  if (!averageHr || averageHr <= 0) return "moderate";
  if (averageHr < 120) return "low";
  if (averageHr <= 150) return "moderate";
  return "high";
}

export function mapActivityToSession(activity: StravaActivity): TrainingSession {
  const start = new Date(activity.start_date);
  const km = Math.round((activity.distance ?? 0) / 100) / 10;
  const parts: string[] = [activity.name];
  if (km > 0) parts.push(km + " km");
  return {
    session_date: localIso(start),
    session_start: hhmmFromIso(activity.start_date) || null,
    sport: sportFromStrava(activity),
    duration_min: Math.max(1, Math.round((activity.moving_time ?? 0) / 60)),
    intensity: intensityFromStrava(activity.average_heartrate),
    heat: "normal",
    notes: "Strava: " + parts.join(", "),
    strava_id: activity.id
  };
}
