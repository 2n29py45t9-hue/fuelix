import { useState, type ReactNode } from "react";
import { ageFromBirthYear, dailyTargetsFor, dayTypeFor, isYouthAthlete } from "../lib/fueling";
import { localIso } from "../lib/date";
import type { MealLog, TrainingSession } from "../types";

/* Mobile Home (DUO-32): Wochen-Scroller wie im Mockup, aber mit DayType-Ring
 * statt Deko-Glow - jede Tag-Zelle zeigt den Carb-Coding-Typ des Tages.
 * DUO-44: unter der Tageszahl ein Mini-Ring, wie weit das KH-Ziel des Tages
 * erfüllt ist (Ring-Schluss wie bei Apple Health), und oben rechts ein
 * gruener Springe-zu-Heute-Button mit dem heutigen Datum. */
const WD = ["M", "D", "M", "D", "F", "S", "S"];

function mondayOf(date: Date): Date {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

/* DUO-44: Mini-Fortschrittsring (18 px) - zeigt pro Wochentag, wie viel
 * vom KH-Tagesziel bereits geloggt ist. Farbe: gruen ab 100 %, amber
 * ab 60 %, sonst der Rest-Bogen in Grau. */
function MiniRing({ pct }: { pct: number }) {
  const r = 7;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  const color = p >= 100 ? "#22c55e" : p >= 60 ? "#fbbf24" : "#64748b";
  const offset = c * (1 - p / 100);
  return (
    <svg className="ds-miniring" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
      <circle cx="9" cy="9" r={r} fill="none" stroke="#334155" strokeWidth="2.5" />
      {p > 0 ? (
        <circle
          cx="9"
          cy="9"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 9 9)"
        />
      ) : null}
    </svg>
  );
}

export default function DayScroller({
  selected,
  onSelect,
  sessions,
  mealLogs = [],
  weightKg = 70,
  birthYear = ""
}: {
  selected: string;
  onSelect: (iso: string) => void;
  sessions: TrainingSession[];
  mealLogs?: MealLog[];
  weightKg?: number;
  birthYear?: number | "";
}) {
  const [offset, setOffset] = useState(0);
  const youth = isYouthAthlete(ageFromBirthYear(birthYear === "" ? null : birthYear));
  const todayIso = localIso();
  const todayLabel = new Date().toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });

  const monday = mondayOf(new Date());
  monday.setDate(monday.getDate() + offset * 7);
  const monthLabel = monday.toLocaleDateString("de-DE", { month: "long" });

  const jumpToday = () => {
    setOffset(0);
    onSelect(todayIso);
  };

  const days = WD.map((wd, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    const iso = localIso(d);
    const ds = sessions.filter((s) => s.session_date === iso);
    const minutes = ds.reduce((sum, s) => sum + s.duration_min, 0);
    const longest = ds.reduce((m, s) => Math.max(m, s.duration_min), 0);
    const maxInt = ds.some((s) => s.intensity === "high")
      ? "high"
      : ds.some((s) => s.intensity === "moderate")
        ? "moderate"
        : "low";
    const dayType = dayTypeFor(minutes, maxInt, longest);
    const carbsLogged = mealLogs
      .filter((l) => l.log_date === iso)
      .reduce((sum, l) => sum + Number(l.carbs_g), 0);
    const targets = dailyTargetsFor(dayType, weightKg, youth);
    const ringPct = targets.carbsG > 0 ? (carbsLogged / targets.carbsG) * 100 : 0;
    return { iso, wd, num: d.getDate(), dayType, ringPct };
  });

  const navBtn = (label: string, node: ReactNode, action: () => void) => (
    <button type="button" className="ds-navbtn" onClick={action} aria-label={label}>
      {node}
    </button>
  );

  return (
    <div className="card dayscroller">
      <div className="ds-head">
        <span className="ds-month">{monthLabel} · KW {isoWeek(monday)}</span>
        <div className="ds-weeknav">
          {navBtn("Fruehere Woche", "←", () => setOffset(offset - 1))}
          <button
            type="button"
            className={"ds-today" + (selected === todayIso ? " on" : "")}
            onClick={jumpToday}
            title="Zum heutigen Tag springen"
          >
            {todayLabel}
          </button>
          {navBtn("Spaetere Woche", "→", () => setOffset(offset + 1))}
        </div>
      </div>
      <div className="ds-grid">
        {days.map((d) => (
          <button
            type="button"
            key={d.iso}
            className={"ds-day" + (d.iso === selected ? " selected" : "")}
            onClick={() => onSelect(d.iso)}
          >
            <span className="ds-wd">{d.wd}</span>
            <span className="ds-num">{d.num}</span>
            <MiniRing pct={d.ringPct} />
            <span className={"ds-dot " + d.dayType} title={d.dayType} />
          </button>
        ))}
      </div>
    </div>
  );
}
