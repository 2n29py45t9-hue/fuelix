import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import type { MealLogItem, MealPhase } from "../types";
import type { MealSlotPlan } from "../lib/fueling";

/*
 * Mahlzeit-Logger (Finetuning): Antippen einer GEPLANTEN Mahlzeit oeffnet
 * diese Liste - "was hast du gegessen?", nicht "Tag anpassen" (dafuer ist
 * der Button da). Der Nutzer fuegt einzelne Lebensmittel als simple Liste
 * hinzu; die Summe der Inhaltsstoffe wird live gegen das Ziel der Mahlzeit
 * gerechnet:
 * - innerhalb +-10 % des KH-Ziels -> Mahlzeit ist abgehakt
 * - darunter -> Restanzeige; die uebrigen Mahlzeiten des Tages werden
 *   ueber die Reallocation (reallocateMealPlan) angepasst
 * Die Items liegen in meal_log_items; meal_logs haelt die Summe als
 * Sammel-Log (slot_time verknuepft) - Ringe, Timeline und Kalender
 * rechnen also wie gewohnt mit.
 */

const TOL = 0.1;

export default function MealLogger({
  dateIso,
  slot,
  onClose,
  onChanged,
  onEditDay
}: {
  dateIso: string;
  slot: MealSlotPlan;
  onClose: () => void;
  onChanged: () => void;
  onEditDay: () => void;
}) {
  const [items, setItems] = useState<MealLogItem[]>([]);
  const [logId, setLogId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [carbs, setCarbs] = useState("");
  const [protein, setProtein] = useState("");
  const [fat, setFat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  /* Bestehenden Sammel-Log + Items zur Mahlzeit laden (slot_time = Uhrzeit). */
  useEffect(() => {
    const init = async () => {
      const { data: logs } = await supabase
        .from("meal_logs")
        .select("*")
        .eq("log_date", dateIso)
        .eq("slot_time", slot.time)
        .limit(1);
      const log = logs && logs.length > 0 ? logs[0] : null;
      if (!log) {
        setLogId(null);
        setItems([]);
        return;
      }
      setLogId(log.id);
      const { data: rows } = await supabase
        .from("meal_log_items")
        .select("*")
        .eq("log_id", log.id)
        .order("created_at", { ascending: true });
      setItems((rows ?? []) as MealLogItem[]);
    };
    init().catch(() => setError("Laden fehlgeschlagen."));
  }, [dateIso, slot.time]);

  const sum = items.reduce(
    (acc, it) => ({
      carbs: acc.carbs + Number(it.carbs_g),
      protein: acc.protein + Number(it.protein_g),
      fat: acc.fat + Number(it.fat_g)
    }),
    { carbs: 0, protein: 0, fat: 0 }
  );

  const targetCarbs = slot.carbsG;
  const targetProtein = slot.proteinG;
  const carbPct = targetCarbs > 0 ? (sum.carbs / targetCarbs) * 100 : 0;
  const inTolerance = sum.carbs >= targetCarbs * (1 - TOL) && sum.carbs <= targetCarbs * (1 + TOL);
  const over = sum.carbs > targetCarbs * (1 + TOL);
  const remaining = Math.max(0, targetCarbs - sum.carbs);

  const addItem = async (e: FormEvent) => {
    e.preventDefault();
    if (name === "" || (carbs === "" && protein === "" && fat === "")) {
      setError("Name und mindestens ein Naehrwert angeben.");
      return;
    }
    setBusy(true);
    setError("");
    const c = carbs === "" ? 0 : Number(carbs);
    const p = protein === "" ? 0 : Number(protein);
    const f = fat === "" ? 0 : Number(fat);
    const newSum = { carbs: sum.carbs + c, protein: sum.protein + p, fat: sum.fat + f };
    const phase: MealPhase = slot.relation === "pre" ? "pre" : slot.relation === "post" ? "post" : "snack";
    try {
      let id = logId;
      if (!id) {
        const { data: created, error: insertError } = await supabase
          .from("meal_logs")
          .insert({
            log_date: dateIso,
            slot_time: slot.time,
            logged_ms: 0,
            name: slot.label,
            phase,
            carbs_g: newSum.carbs,
            protein_g: newSum.protein,
            fat_g: newSum.fat
          })
          .select()
          .single();
        if (insertError || !created) throw insertError ?? new Error("Anlegen fehlgeschlagen.");
        id = created.id;
        setLogId(id);
      } else {
        const { error: updateError } = await supabase
          .from("meal_logs")
          .update({ carbs_g: newSum.carbs, protein_g: newSum.protein, fat_g: newSum.fat })
          .eq("id", id);
        if (updateError) throw updateError;
      }
      const { data: item, error: itemError } = await supabase
        .from("meal_log_items")
        .insert({ log_id: id, name, carbs_g: c, protein_g: p, fat_g: f })
        .select()
        .single();
      if (itemError || !item) throw itemError ?? new Error("Anlegen fehlgeschlagen.");
      setItems([...items, item as MealLogItem]);
      setName("");
      setCarbs("");
      setProtein("");
      setFat("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    }
    setBusy(false);
  };

  const removeItem = async (item: MealLogItem) => {
    setBusy(true);
    setError("");
    try {
      const { error: delError } = await supabase.from("meal_log_items").delete().eq("id", item.id);
      if (delError) throw delError;
      const rest = items.filter((it) => it.id !== item.id);
      setItems(rest);
      if (logId) {
        if (rest.length === 0) {
          /* Keine Items mehr -> Mahlzeit wieder "ungegessen": Sammel-Log loeschen. */
          const { error: logDel } = await supabase.from("meal_logs").delete().eq("id", logId);
          if (logDel) throw logDel;
          setLogId(null);
        } else {
          const newSum = rest.reduce(
            (acc, it) => ({
              carbs: acc.carbs + Number(it.carbs_g),
              protein: acc.protein + Number(it.protein_g),
              fat: acc.fat + Number(it.fat_g)
            }),
            { carbs: 0, protein: 0, fat: 0 }
          );
          const { error: updError } = await supabase
            .from("meal_logs")
            .update({ carbs_g: newSum.carbs, protein_g: newSum.protein, fat_g: newSum.fat })
            .eq("id", logId);
          if (updError) throw updError;
        }
      }
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Loeschen fehlgeschlagen.");
    }
    setBusy(false);
  };

  return (
    <div className="mlg">
      <h2 style={{ margin: 0 }}>
        {inTolerance ? "✓ " : ""}
        {slot.label} <span className="mlg-time">· {slot.time} Uhr</span>
      </h2>
      <p className="muted mlg-hint">
        Was hast du gegessen? Einfach als Liste erfassen – die Summe wird gegen das Ziel der Mahlzeit
        gerechnet (±10 % = abgehakt). Fehlt etwas, rechnen die übrigen Mahlzeiten des Tages neu.
      </p>

      <div className={"mlg-target" + (inTolerance ? " ok" : "") + (over ? " over" : "")}>
        <div className="mlg-target-row">
          <span className="mlg-target-label">Ziel</span>
          <span className="mlg-target-val">≈ {Math.round(targetCarbs)} g KH · {Math.round(targetProtein)} g Protein</span>
        </div>
        <div className="track mlg-track">
          <div
            className={"fill " + (inTolerance ? "fill-green" : over ? "fill-red" : "fill-amber")}
            style={{ width: Math.min(100, carbPct) + "%" }}
          />
        </div>
        <div className="mlg-target-row">
          <span className="mlg-target-label">Erfasst</span>
          <span className="mlg-target-val">
            {Math.round(sum.carbs)} g KH · {Math.round(sum.protein)} g P · {Math.round(sum.fat)} g F
            {inTolerance ? " – Ziel erreicht, Mahlzeit abgehakt" : over ? " – über dem Ziel" : " – noch " + Math.round(remaining) + " g KH bis zum Ziel"}
          </span>
        </div>
      </div>

      {items.length > 0 ? (
        <ul className="mlg-list">
          {items.map((it) => (
            <li className="mlg-item" key={it.id}>
              <span className="mlg-item-name">{it.name}</span>
              <span className="mlg-item-macros">
                {Math.round(Number(it.carbs_g))} g KH · {Math.round(Number(it.protein_g))} g P · {Math.round(Number(it.fat_g))} g F
              </span>
              <button type="button" className="mlg-del" onClick={() => removeItem(it)} disabled={busy} aria-label={"Eintrag entfernen: " + it.name}>
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted mlg-hint">Noch nichts erfasst – trage unten ein, was auf dem Teller war.</p>
      )}

      <form className="mlg-form" onSubmit={addItem}>
        <div className="mlg-form-name">
          <label htmlFor="mlg-name">Lebensmittel</label>
          <input
            id="mlg-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z. B. Haferflocken mit Milch"
          />
        </div>
        <div className="mlg-form-macros">
          <div>
            <label htmlFor="mlg-carbs">KH (g)</label>
            <input id="mlg-carbs" type="number" min="0" inputMode="numeric" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
          </div>
          <div>
            <label htmlFor="mlg-protein">Protein (g)</label>
            <input id="mlg-protein" type="number" min="0" inputMode="numeric" value={protein} onChange={(e) => setProtein(e.target.value)} />
          </div>
          <div>
            <label htmlFor="mlg-fat">Fett (g)</label>
            <input id="mlg-fat" type="number" min="0" inputMode="numeric" value={fat} onChange={(e) => setFat(e.target.value)} />
          </div>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit" disabled={busy}>
          {busy ? "Speichere ..." : "Hinzufügen"}
        </button>
      </form>

      <div className="mlg-actions">
        <button type="button" className="link" onClick={onClose}>
          Fertig
        </button>
        <button
          type="button"
          className="link"
          onClick={() => {
            onClose();
            onEditDay();
          }}
        >
          Tag anpassen (Mahlzeiten & Trainingszeiten)
        </button>
      </div>
    </div>
  );
}
