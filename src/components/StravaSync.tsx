import { useEffect, useState } from "react";
import { isStravaConfigured, loadTokens, stravaAuthorizeUrl, syncStrava, type StravaTokens } from "../lib/strava";

/* Strava-Sync (DUO-23): Garmin-Aktivitaetten laufen ueber die
 * Garmin-Connect-Strava-Verbindung automatisch in Fuelix ein.
 * Single-Athlet-Setup: genau ein verbundener Athlet (Strava Single Player Mode). */
export default function StravaSync({ onSynced }: { onSynced: () => void }) {
  const [tokens, setTokens] = useState<StravaTokens | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadTokens().then(setTokens);
  }, []);

  const connect = () => {
    window.location.href = stravaAuthorizeUrl();
  };

  const sync = async () => {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const result = await syncStrava(30);
      if (result.imported > 0) {
        setMsg(result.imported + " neue Einheit" + (result.imported === 1 ? "" : "en") + " importiert (" + result.fetched + " geprueft).");
      } else {
        setMsg("Alles aktuell - keine neuen Einheiten (" + result.fetched + " geprueft).");
      }
      onSynced();
      loadTokens().then(setTokens);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2>Strava-Sync (Garmin)</h2>
      {!isStravaConfigured() ? (
        <p className="muted">
          Sync ist eingebaut, aber noch nicht konfiguriert: In der Strava-API-App die Callback-Domain
          fuelix-five.vercel.app eintragen und Client-ID sowie Secret als Vercel-Umgebungsvariablen setzen.
        </p>
      ) : tokens ? (
        <>
          <p>
            Verbunden{tokens.athlete_name ? " als " + tokens.athlete_name : ""}. Fuelix liest nur (keine Schreibrechte)
            und importiert Aktivitaeten der letzten 30 Tage als Trainingseinheit.
          </p>
          {tokens.last_sync_at ? <p className="muted">Letzter Sync: {new Date(tokens.last_sync_at).toLocaleString("de-DE")}</p> : null}
          <button type="button" onClick={sync} disabled={busy}>
            {busy ? "Synchronisiere ..." : "Jetzt synchronisieren"}
          </button>
        </>
      ) : (
        <>
          <p>
            Garmin-Aktivitaetten automatisch erfassen: Die Uhr synced zu Garmin Connect, Garmin Connect zu Strava -
            und Fuelix uebernimmt Datum, Dauer, Sportart und Intensitaet (aus der Herzfrequenz geschaetzt).
          </p>
          <button type="button" onClick={connect}>
            Mit Strava verbinden
          </button>
        </>
      )}
      {msg ? <p className="status">{msg}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
