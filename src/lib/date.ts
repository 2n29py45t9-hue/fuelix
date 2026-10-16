export function localIso(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

/* Mobile Home (DUO-32): Uhrzeit (HH:MM) aus einem ISO-Zeitstempel, lokal gerendert. */
export function hhmmFromIso(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

/* Mahlzeiten-Engine (DUO-35): "HH:MM" in Tagesminuten, ungueltig = -1. */
export function minutesFromHHMM(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  if (!m) return -1;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return -1;
  return h * 60 + min;
}

/* Mahlzeiten-Engine (DUO-35): aktuelle Uhrzeit als "HH:MM". */
export function hhmmNow(d: Date = new Date()): string {
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

/* Mahlzeiten-Engine (DUO-35): Wochentag-Index Montag-first (0 = Mo ... 6 = So). */
export function weekdayIndexMondayFirst(iso: string): number {
  const d = new Date(iso + "T12:00:00");
  return (d.getDay() + 6) % 7;
}
