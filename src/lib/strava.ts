import { supabase } from "./supabase";
import { mapActivityToSession, type StravaActivity } from "./stravaMap";

/* Strava-Sync (DUO-23): OAuth-Glut zwischen SPA und Strava.
 * Das Client-Secret bleibt ausschliesslich in den Vercel-Server-Funktionen
 * (api/strava-callback.ts, api/strava-refresh.ts). */

export interface StravaTokens {
  athlete_id: number;
  athlete_name?: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope?: string | null;
  last_sync_at?: string | null;
  updated_at?: string;
}

export const stravaClientId = ((import.meta.env.VITE_STRAVA_CLIENT_ID as string | undefined) ?? "");

export function isStravaConfigured(): boolean {
  return stravaClientId !== "";
}

export function stravaAuthorizeUrl(): string {
  const redirect = encodeURIComponent(window.location.origin + "/api/strava-callback");
  return "https://www.strava.com/oauth/authorize?client_id=" + stravaClientId + "&redirect_uri=" + redirect + "&response_type=code&approval_prompt=auto&scope=activity:read_all";
}

export async function loadTokens(): Promise<StravaTokens | null> {
  const { data } = await supabase.from("strava_tokens").select("*").limit(1);
  if (data && data.length > 0) return data[0] as StravaTokens;
  return null;
}

export async function saveTokens(tokens: StravaTokens): Promise<void> {
  const { error } = await supabase.from("strava_tokens").upsert(tokens, { onConflict: "athlete_id" });
  if (error) throw new Error(error.message);
}

/* Uebergabe aus dem OAuth-Callback: api/strava-callback.ts legt die Tokens
 * kurzzeitig in localStorage ab, die App speichert sie mit der eigenen
 * Supabase-Session (RLS: authenticated). */
export async function consumeHandoff(): Promise<StravaTokens | null> {
  const raw = localStorage.getItem("fuelix_strava");
  if (!raw) return null;
  localStorage.removeItem("fuelix_strava");
  try {
    const parsed = JSON.parse(raw) as StravaTokens;
    await saveTokens(parsed);
    return parsed;
  } catch {
    return null;
  }
}

export async function ensureAccessToken(tokens: StravaTokens): Promise<StravaTokens> {
  if (Date.now() < tokens.expires_at * 1000 - 60000) return tokens;
  const res = await fetch("/api/strava-refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: tokens.refresh_token })
  });
  if (!res.ok) throw new Error("Strava-Login konnte nicht erneuert werden (" + res.status + ").");
  const t = await res.json();
  const updated: StravaTokens = {
    ...tokens,
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: t.expires_at
  };
  await saveTokens(updated);
  return updated;
}

export async function fetchStravaActivities(accessToken: string, afterEpochSec: number): Promise<StravaActivity[]> {
  const all: StravaActivity[] = [];
  let page = 1;
  // Seitenweise laden, max. 5 Seiten (500 Activities) pro Sync - weit jenseits der Rate-Limits.
  while (page <= 5) {
    const url = "https://www.strava.com/api/v3/athlete/activities?after=" + afterEpochSec + "&per_page=100&page=" + page;
    const res = await fetch(url, { headers: { Authorization: "Bearer " + accessToken } });
    if (!res.ok) throw new Error("Strava-Aktivitaeten konnten nicht geladen werden (" + res.status + ").");
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }
  return all;
}

export interface StravaSyncResult {
  fetched: number;
  imported: number;
}

export async function syncStrava(days = 30): Promise<StravaSyncResult> {
  const tokens = await loadTokens();
  if (!tokens) throw new Error("Strava ist noch nicht verbunden.");
  const fresh = await ensureAccessToken(tokens);
  const after = Math.floor(Date.now() / 1000) - days * 86400;
  const activities = await fetchStravaActivities(fresh.access_token, after);
  const sessions = activities.map(mapActivityToSession);
  // Dedup: strava_id ist eindeutig - bereits importierte Einheiten werden uebersprungen.
  const { data, error } = await supabase
    .from("sessions")
    .upsert(sessions, { onConflict: "strava_id", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(error.message);
  const imported = data ? data.length : 0;
  await supabase.from("strava_tokens").update({ last_sync_at: new Date().toISOString() }).eq("athlete_id", fresh.athlete_id);
  return { fetched: activities.length, imported };
}
