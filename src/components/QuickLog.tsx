import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import type { MealFavorite, MealPhase } from "../types";

/* Turbo-Logging (DUO-30) - jetzt als Bottom-Sheet vom FAB (DUO-32):
 * Favorit antippen, fertig. Unter 3 Sekunden. */
export default function QuickLog({
  onLogged,
  onClose,
  logDate
}: {
  onLogged: () => void;
  onClose?: () => void;
  logDate: string;
}) {
  const [favorites, setFavorites] = useState<MealFavorite[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [favName, setFavName] = useState("");
  const [favPhase, setFavPhase] = useState<MealPhase>("snack");
  const [favCarbs, setFavCarbs] = useState(60);
  const [favProtein, setFavProtein] = useState(15);
  const [favFat, setFavFat] = useState(8);
  const [quickName, setQuickName] = useState("");
  const [quickCarbs, setQuickCarbs] = useState(50);
  // Interne Anti-Friction-Metrik (DUO-30): Zeit vom Sheet-Oeffnen bis zum Log.
  const startRef = useRef(Date.now());

  const loadFavorites = useCallback(async () => {
    const { data } = await supabase
      .from("meal_favorites")
      .select("*")
      .order("created_at", { ascending: true });
    if (data) setFavorites(data as MealFavorite[]);
  }, []);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  const insertLog = async (payload: {
    favorite_id?: string | null;
    name: string;
    phase: MealPhase;
    carbs_g: number;
    protein_g: number;
    fat_g: number;
  }) => {
    const now = Date.now();
    const { error: logError } = await supabase.from("meal_logs").insert({
      log_date: logDate,
      logged_ms: now - startRef.current,
      ...payload
    });
    startRef.current = Date.now();
    if (logError) {
      setError(logError.message);
      return false;
    }
    onLogged();
    return true;
  };

  const logFavorite = async (fav: MealFavorite) => {
    setBusy(fav.id);
    setError("");
    await insertLog({
      favorite_id: fav.id,
      name: fav.name,
      phase: fav.phase,
      carbs_g: fav.carbs_g,
      protein_g: fav.protein_g,
      fat_g: fav.fat_g
    });
    setBusy(null);
  };

  const quickSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    await insertLog({
      name: quickName,
      phase: "snack",
      carbs_g: Number(quickCarbs),
      protein_g: 0,
      fat_g: 0
    });
    setQuickName("");
  };

  const saveFavorite = async (e: FormEvent) => {
    e.preventDefault();
    setBusy("new");
    setError("");
    const { error: favError } = await supabase.from("meal_favorites").insert({
      name: favName,
      phase: favPhase,
      carbs_g: Number(favCarbs),
      protein_g: Number(favProtein),
      fat_g: Number(favFat)
    });
    setBusy(null);
    if (favError) {
      setError(favError.message);
      return;
    }
    setFavName("");
    setShowNew(false);
    loadFavorites();
  };

  const removeFavorite = async (id: string) => {
    await supabase.from("meal_favorites").delete().eq("id", id);
    loadFavorites();
  };

  return (
    <div className="quicksheet">
      <div className="sheet-grabber" />
      <div className="sheet-head">
        <h2>Mahlzeit loggen</h2>
        {onClose ? (
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Schliessen">
            ✕
          </button>
        ) : null}
      </div>
      <p className="muted">Favorit antippen, fertig - in unter 3 Sekunden.</p>
      {error ? <p className="error">{error}</p> : null}
      {favorites.length === 0 ? (
        <p className="muted">Noch keine Favoriten - lege unten deinen ersten an.</p>
      ) : (
        <div className="favs">
          {favorites.map((fav) => (
            <span className="favwrap" key={fav.id}>
              <button
                className="fav"
                onClick={() => logFavorite(fav)}
                disabled={busy === fav.id}
                title={fav.phase}
              >
                {fav.name} · {fav.carbs_g} g KH
              </button>
              <button className="favdel" onClick={() => removeFavorite(fav.id)} title="Favorit loeschen">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <form className="quickadd" onSubmit={quickSubmit}>
        <input
          value={quickName}
          onChange={(e) => setQuickName(e.target.value)}
          placeholder="Schnell loggen, z. B. Porridge mit Banane"
          required
        />
        <input
          type="number"
          min="0"
          inputMode="numeric"
          value={quickCarbs}
          onChange={(e) => setQuickCarbs(Number(e.target.value))}
          aria-label="Kohlenhydrate (g)"
        />
        <button type="submit">Loggen</button>
      </form>
      <button type="button" className="link" onClick={() => setShowNew(!showNew)}>
        {showNew ? "Favorit-Formular schliessen" : "+ Neuer Favorit"}
      </button>
      {showNew ? (
        <form onSubmit={saveFavorite}>
          <label>Name</label>
          <input value={favName} onChange={(e) => setFavName(e.target.value)} required />
          <label>Phase</label>
          <select value={favPhase} onChange={(e) => setFavPhase(e.target.value as MealPhase)}>
            <option value="pre">Vor der Einheit</option>
            <option value="during">Waehrend</option>
            <option value="post">Danach</option>
            <option value="snack">Snack / sonstige</option>
          </select>
          <label>Kohlenhydrate (g)</label>
          <input type="number" min="0" inputMode="numeric" value={favCarbs} onChange={(e) => setFavCarbs(Number(e.target.value))} required />
          <label>Protein (g)</label>
          <input type="number" min="0" inputMode="numeric" value={favProtein} onChange={(e) => setFavProtein(Number(e.target.value))} required />
          <label>Fett (g)</label>
          <input type="number" min="0" inputMode="numeric" value={favFat} onChange={(e) => setFavFat(Number(e.target.value))} required />
          <button type="submit" disabled={busy === "new"}>
            {busy === "new" ? "Speichere ..." : "Favorit speichern"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
