import { useState, type ReactNode } from "react";
import { dayTypeFor } from "../lib/fueling";
import { localIso } from "../lib/date";
import type { TrainingSession } from "../types";

/* Mobile Home (DUO-32): Wochen-Scroller wie im Mockup, aber mit DayType-Ring
 * statt Deko-Glow - jede Tag-Zelle zeigt den Carb-Coding-Typ des Tages. */
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

export default function DayScroller({
  selected,
  onSelect,
  sessions
}: {
  selected: string;
  onSelect: (iso: string) => void;
  sessions: TrainingSession[];
}) {
  const [offset, setOffset] = useState(0);
  const monday = mondayOf(new Date());
  monday.setDate(monday.getDate() + offset * 7);
  const monthLabel = monday.toLocaleDateString("de-DE", { month: "long" });

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
    return { iso, wd, num: d.getDate(), dayType: dayTypeFor(minutes, maxInt, longest) };
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
          {navBtn("Aktuelle Woche", "Heute", () => setOffset(0))}
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
            <span className={"ds-dot " + d.dayType} title={d.dayType} />
          </button>
        ))}
      </div>
    </div>
  );
}
