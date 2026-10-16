import { supabase } from "../lib/supabase";
import type { TrainingSession } from "../types";

const intensityLabel = (i: string) => (i === "low" ? "Leicht" : i === "moderate" ? "Mittel" : "Hoch");

export default function SessionList({
  sessions,
  onSelect,
  onChanged
}: {
  sessions: TrainingSession[];
  onSelect: (s: TrainingSession) => void;
  onChanged: () => void;
}) {
  const remove = async (id: string) => {
    await supabase.from("sessions").delete().eq("id", id);
    onChanged();
  };

  if (sessions.length === 0) {
    return <p className="muted">Noch keine Einheiten erfasst.</p>;
  }

  return (
    <div className="card">
      <h2>Letzte Einheiten</h2>
      <table>
        <thead>
          <tr>
            <th>Datum</th>
            <th>Sport</th>
            <th>Min</th>
            <th>Intensität</th>
            <th>Hitze</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.id}>
              <td>{s.session_date}</td>
              <td>{s.sport}</td>
              <td>{s.duration_min}</td>
              <td>{intensityLabel(s.intensity)}</td>
              <td>{s.heat === "hot" ? "Heiß" : "Normal"}</td>
              <td>
                <button onClick={() => onSelect(s)}>Plan</button>
                <button className="danger" onClick={() => remove(s.id!)}>
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
