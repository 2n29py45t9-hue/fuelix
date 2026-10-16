import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import type { MealFavorite, MealLog, MealPhase } from "../types";
import Tip from "./Tip";

const phaseText: Record<MealPhase, string> = {
  pre: "Vor der Einheit",
  during: "Während",
  post: "Danach",
  snack: "Snack / sonstige"
};

/*
 * QuickLog-Relaunch (DUO-35): Logging in unter 3 Sekunden, zwei gleichwertige
 * Wege nebeneinander (Favoriten 1-Tap und freie Erfassung) – plus drei
 * Adherence-Hebel aus der Forschung:
 * - Automatische Anlass-Erkennung statt Fragen (Zeit pro Log = Abbruchfaktor Nr. 1)
 * - "Zuletzt"-Chips: Wiederholungsmahlzeiten mit einem Tap (größter Hebel nach
 *   den ersten zwei Wochen – die persönliche Bibliothek wächst von selbst)
 * - Session-Fuel-Schnellbuttons: Gels/Getränke zählen in die Tages-KH und
 *   trigger die Neuberechnung der restlichen Mahlzeiten (Hexis-Reallocation)
 */

export default function QuickLog({
  onLogged,
  onClose,
  logDate,
  defaultPhase,
  recentLogs,
  sessionFuelG
}: {
  onLogged: () => void;
  onClose?: () => void;
  logDate: string;
  defaultPhase: MealPhase;
  recentLogs: MealLog[];
  sessionFuelG: number;
}) {
  const [favorites, setFavorites] = useState<MealFavorite[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [favName, setFavName] = useState("");
  const [favPhase, setFavPhase] = useState<MealPhase>(defaultPhase);
  const [favCarbs, setFavCarbs] = useState(60);
  const [favProtein, setFavProtein] = useState(15);
  const [favFat, setFavFat] = useState(8);
  const [quickName, setQuickName] = useState("");
  const [quickCarbs, setQuickCarbs] = useState(50);
  const [quickProtein, setQuickProtein] = useState(15);
  const [quickFat, setQuickFat] = useState(10);
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

  const recent = useMemo(() => {
    const seen = new Set<string>();
    const out: MealLog[] = [];
    for (const log of recentLogs) {
      if (seen.has(log.name)) continue;
      seen.add(log.name);
      out.push(log);
      if (out.length >= 6) break;
    }
    return out;
  }, [recentLogs]);

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

  const logRecent = async (log: MealLog) => {
    setBusy("recent-" + log.name);
    setError("");
    await insertLog({
      name: log.name,
      phase: log.phase,
      carbs_g: log.carbs_g,
      protein_g: log.protein_g,
      fat_g: log.fat_g
    });
    setBusy(null);
  };

  const logSessionFuel = async (name: string, carbsG: number) => {
    setBusy("sfuel-" + name);
    setError("");
    await insertLog({
      name: name,
      phase: "during",
      carbs_g: carbsG,
      protein_g: 0,
      fat_g: 0
    });
    setBusy(null);
  };

  const quickSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const ok = await insertLog({
      name: quickName,
      phase: defaultPhase,
      carbs_g: Number(quickCarbs),
      protein_g: Number(quickProtein),
      fat_g: Number(quickFat)
    });
    if (ok) setQuickName("");
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
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Schließen">
            ✕
          </button>
        ) : null}
      </div>
      <p className="muted">
        Anlass automatisch: <strong>{phaseText[defaultPhase]}</strong>{" "}
        <Tip text="Fuelix erkennt aus der Uhrzeit und deinen geplanten Einheiten, ob du vor, während oder nach einer Einheit isst – du musst nicht fragen oder suchen. Das hält das Logging unter 3 Sekunden." />
      </p>
      {error ? <p className="error">{error}</p> : null}

      <div className="ql-grid">
        <div className="ql-col">
          <span className="ql-title">
            Favoriten <Tip text="Deine Stamm-Mahlzeiten als 1-Tap-Buttons. Die ersten zwei Wochen bauen deine Bibliothek auf – danach wird jedes Log zum einzigen Tipp." />
          </span>
          {favorites.length === 0 ? (
            <p className="muted">Noch keine Favoriten – lege unten deinen ersten an.</p>
          ) : (
            <div className="favs">
              {favorites.map((fav) => (
                <span className="favwrap" key={fav.id}>
                  <button
                    className="fav"
                    onClick={() => logFavorite(fav)}
                    disabled={busy === fav.id}
                    title={phaseText[fav.phase]}
                  >
                    {fav.name} · {fav.carbs_g} g KH
                  </button>
                  <button className="favdel" onClick={() => removeFavorite(fav.id)} title="Favorit löschen">
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <button type="button" className="link" onClick={() => setShowNew(!showNew)}>
            {showNew ? "Favorit-Formular schließen" : "+ Neuer Favorit"}
          </button>
          {showNew ? (
            <form onSubmit={saveFavorite}>
              <label>Name</label>
              <input value={favName} onChange={(e) => setFavName(e.target.value)} required />
              <label>Phase</label>
              <select value={favPhase} onChange={(e) => setFavPhase(e.target.value as MealPhase)}>
                <option value="pre">Vor der Einheit</option>
                <option value="during">Während</option>
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

        <div className="ql-col">
          <span className="ql-title">
            Frei erfassen <Tip text="Ohne Favorit: Name plus Makros direkt eintippen. Der Anlass wird automatisch zugeordnet." />
          </span>
          <form className="quickfree" onSubmit={quickSubmit}>
            <label htmlFor="qk-name">Was hast du gegessen?</label>
            <input
              id="qk-name"
              value={quickName}
              onChange={(e) => setQuickName(e.target.value)}
              placeholder="z. B. Porridge mit Banane"
              required
            />
            <div className="quickfree-macros">
              <div>
                <label htmlFor="qk-carbs">KH (g)</label>
                <input id="qk-carbs" type="number" min="0" inputMode="numeric" value={quickCarbs} onChange={(e) => setQuickCarbs(Number(e.target.value))} />
              </div>
              <div>
                <label htmlFor="qk-protein">Protein (g)</label>
                <input id="qk-protein" type="number" min="0" inputMode="numeric" value={quickProtein} onChange={(e) => setQuickProtein(Number(e.target.value))} />
              </div>
              <div>
                <label htmlFor="qk-fat">Fett (g)</label>
                <input id="qk-fat" type="number" min="0" inputMode="numeric" value={quickFat} onChange={(e) => setQuickFat(Number(e.target.value))} />
              </div>
            </div>
            <button type="submit">Loggen</button>
          </form>
        </div>
      </div>

      {recent.length > 0 ? (
        <div className="ql-recent">
          <span className="ql-title">
            Zuletzt <Tip text="Deine letzten Mahlzeiten als 1-Tap-Wiederholung – der schnellste Weg für Tage mit Routinen." />
          </span>
          <div className="favs">
            {recent.map((log) => (
              <button
                className="fav"
                key={"recent-" + log.id}
                onClick={() => logRecent(log)}
                disabled={busy === "recent-" + log.name}
                title={phaseText[log.phase]}
              >
                {log.name} · {Math.round(Number(log.carbs_g))} g KH
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {sessionFuelG > 0 ? (
        <div className="sfuel">
          <span className="ql-title">
            Session-Fuel <Tip text="KH auf der Einheit (Gels, Getränke, Riegel) zählen in dein Tagesziel und lösen die Neuberechnung der restlichen Mahlzeiten aus – das Hexis-Reallocation-Prinzip." />
          </span>
          <p className="muted">Heute ca. {sessionFuelG} g KH auf der Einheit geplant – schnell geloggt:</p>
          <div className="favs">
            <button className="fav" onClick={() => logSessionFuel("Gel", 25)} disabled={busy === "sfuel-Gel"}>
              + Gel (25 g)
            </button>
            <button className="fav" onClick={() => logSessionFuel("Iso-Getränk", 30)} disabled={busy === "sfuel-Iso-Getränk"}>
              + Iso (30 g)
            </button>
            <button className="fav" onClick={() => logSessionFuel("Riegel", 40)} disabled={busy === "sfuel-Riegel"}>
              + Riegel (40 g)
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
