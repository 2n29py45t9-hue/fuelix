import { useState } from "react";
import type { MealSlotInput } from "../lib/fueling";
import { slotsForDate, WEEKDAY_LONG } from "../lib/schedule";
import { weekdayIndexMondayFirst } from "../lib/date";
import type { MealOverride, MealSlot } from "../types";

/*
 * Tages-Editor (DUO-36): Mahlzeiten EINES konkreten Datums anpassen -
 * Notion-Logik. Beim Speichern entscheidet der Nutzer:
 * - "Nur dieser Tag" -> Override fuer genau dieses Datum
 * - "Ab jetzt jede(r) <Wochentag>" -> aendert die Routine fuer alle
 *   zukuenftigen Wiederholungen
 * Reine State-Komponente; die Persistenz macht der Aufrufer.
 */
export type MealEditScope = "once" | "future";

export default function MealDayEditor({
  dateIso,
  mealSchedule,
  overrides,
  busy = false,
  onSave,
  onClose
}: {
  dateIso: string;
  mealSchedule: MealSlot[];
  overrides: MealOverride[];
  busy?: boolean;
  onSave: (slots: MealSlotInput[], scope: MealEditScope) => void;
  onClose?: () => void;
}) {
  const initial = slotsForDate(mealSchedule, overrides, dateIso);
  const [slots, setSlots] = useState<MealSlotInput[]>(initial.map((m) => ({ ...m })));
  const [scope, setScope] = useState<MealEditScope>("once");

  const weekday = weekdayIndexMondayFirst(dateIso);
  const dateLabel = new Date(dateIso + "T12:00:00").toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long" });

  const changeSlot = (idx: number, patch: Partial<MealSlotInput>) => {
    setSlots(slots.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  };

  const addSlot = () => {
    setSlots([...slots, { time: "15:00", label: "Snack", primary: false }]);
  };

  const removeSlot = (idx: number) => {
    setSlots(slots.filter((_, i) => i !== idx));
  };

  return (
    <div className="mse">
      <h2 style={{ marginTop: 0 }}>Mahlzeiten am {dateLabel}</h2>
      <p className="muted mse-hint">
        {WEEKDAY_LONG[weekday]}-Routine als Vorschlag – passe sie fuer diesen Tag an oder uebernimm die
        Aenderung ab jetzt fuer jede(n) {WEEKDAY_LONG[weekday]}.
      </p>
      <div className="mse-rows">
        {slots.map((m, i) => (
          <div className="mse-row" key={i}>
            <input
              type="time"
              value={m.time}
              onChange={(e) => changeSlot(i, { time: e.target.value })}
              aria-label="Uhrzeit der Mahlzeit"
            />
            <input
              value={m.label}
              onChange={(e) => changeSlot(i, { label: e.target.value })}
              aria-label="Name der Mahlzeit"
            />
            <button
              type="button"
              className={"mse-primary" + (m.primary ? " on" : "")}
              onClick={() => changeSlot(i, { primary: !m.primary })}
              title={m.primary ? "Hauptmahlzeit - volle Portion Protein und KH" : "Snack - kleinerer Anteil"}
            >
              {m.primary ? "Haupt" : "Snack"}
            </button>
            <button type="button" className="favdel" onClick={() => removeSlot(i)} aria-label="Mahlzeit entfernen">
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="mse-actions">
        <button type="button" className="link" onClick={addSlot}>
          + Anlass hinzufügen
        </button>
      </div>
      {slots.length === 0 ? (
        <p className="muted mse-hint">
          Kein Anlass an diesem Tag - beim Speichern gilt danach wieder deine {WEEKDAY_LONG[weekday]}-Routine.
        </p>
      ) : null}

      <div className="ov-scopes">
        <label className={"ov-scope" + (scope === "once" ? " on" : "")}>
          <input
            type="radio"
            name="ov-scope"
            checked={scope === "once"}
            onChange={() => setScope("once")}
          />
          <span>
            <strong>Nur dieser Tag.</strong> Deine {WEEKDAY_LONG[weekday]}-Routine bleibt fuer alle anderen
            Wochen unverändert.
          </span>
        </label>
        <label className={"ov-scope" + (scope === "future" ? " on" : "")}>
          <input
            type="radio"
            name="ov-scope"
            checked={scope === "future"}
            onChange={() => setScope("future")}
          />
          <span>
            <strong>Ab jetzt jede(n) {WEEKDAY_LONG[weekday]}.</strong> Ändert deine Routine - gilt fuer alle
            zukuenftigen Wiederholungen, auch heute.
          </span>
        </label>
      </div>

      <div className="mse-actions">
        <button type="button" onClick={() => onSave(slots, scope)} disabled={busy}>
          {busy ? "Speichere ..." : "Speichern"}
        </button>
        {onClose ? (
          <button type="button" className="link" onClick={onClose}>
            Abbrechen
          </button>
        ) : null}
      </div>
    </div>
  );
}
