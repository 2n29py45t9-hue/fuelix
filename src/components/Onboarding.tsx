import { useState } from "react";
import { supabase } from "../lib/supabase";
import { ageFromBirthYear, isYouthAthlete, type MealSlotInput } from "../lib/fueling";
import { defaultRaster, saveMealSchedule, WEEKDAY_LONG } from "../lib/mealSchedule";
import MealScheduleEditor from "./MealScheduleEditor";
import "../onboarding.css";

/*
 * Onboarding: gefuehrter Einstieg fuer neue Athleten.
 * Erscheint genau einmal - sobald ein Profil existiert, nie wieder.
 * "Ueberspringen" speichert ein Default-Profil, damit der Dialog niemanden
 * blockiert. Jede Frage hat einen erkennbaren Nutzen: Gewicht und Geburtsjahr
 * speisen die Fueling- und Energie-Engine, der Hauptsport praegt die
 * Voreinstellung neuer Trainingseinheiten, und das Mahlzeitenraster (DUO-35)
 * legt fest, wie die Tagesziele auf Anlässe verteilt werden.
 */

const SPORTS = ["Radsport", "Laufen", "Triathlon", "Schwimmen", "Krafttraining", "Sonstiges"];

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [weightKg, setWeightKg] = useState(70);
  const [birthYear, setBirthYear] = useState<number | "">("");
  const [mainSport, setMainSport] = useState("Radsport");
  const [raster, setRaster] = useState<MealSlotInput[][]>(defaultRaster());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const age = birthYear === "" ? null : ageFromBirthYear(Number(birthYear));
  const youth = isYouthAthlete(age);
  const weightValid = weightKg >= 30 && weightKg <= 150;
  const todayIdx = (new Date().getDay() + 6) % 7;
  const todayMeals = raster[todayIdx]?.length ?? 0;

  const finish = async (skip: boolean) => {
    setBusy(true);
    setError("");
    const payload = {
      body_weight_kg: skip ? 70 : Number(weightKg) || 70,
      birth_year: birthYear === "" ? null : Number(birthYear),
      main_sport: skip ? null : mainSport
    };
    const existing = await supabase.from("profile").select("id").limit(1);
    if (existing.error) {
      setBusy(false);
      setError(existing.error.message);
      return;
    }
    if (existing.data && existing.data.length > 0) {
      await supabase.from("profile").update(payload).eq("id", existing.data[0].id);
    } else {
      const { error: insertError } = await supabase.from("profile").insert(payload);
      if (insertError) {
        setBusy(false);
        setError(insertError.message);
        return;
      }
    }
    // Mahlzeitenraster speichern (DUO-35). Fehler blockieren das Onboarding nicht.
    try {
      await saveMealSchedule(raster);
    } catch {
      /* Raster kann im Kalender-Tab nachgepflegt werden */
    }
    setBusy(false);
    onDone();
  };

  return (
    <div className="onboarding">
      <div className="ob-card">
        <div className="ob-dots">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className={i === step ? "ob-dot ob-dot-active" : "ob-dot"} />
          ))}
        </div>

        {step === 0 ? (
          <div className="ob-step">
            <h2>Willkommen bei Fuelix</h2>
            <p>Dein Fueling-Plan pro Einheit – berechnet, nicht geraten.</p>
            <ul>
              <li>Ziele pro Training: Kohlenhydrate, Flüssigkeit und Natrium – berechnet aus Dauer, Intensität, Hitze und Körpergewicht.</li>
              <li>Carb-Ampel: Farbcodes zeigen, wann Fueling wichtig ist.</li>
              <li>Periodisierung pro Mahlzeit: Deine Tagesziele werden auf deine echten Essenszeiten verteilt – gegen dein Training.</li>
              <li>RED-S-Schutz: Warnt vor Unterernährung – besonders im Jugend-Modus (U15-U19).</li>
            </ul>
            <button type="button" onClick={() => setStep(1)}>Los geht's</button>
            <button type="button" className="ob-skip" onClick={() => finish(true)} disabled={busy}>Überspringen</button>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="ob-step">
            <h2>Über dich</h2>
            <label htmlFor="ob-weight">Körpergewicht (kg) – Basis aller berechneten Ziele</label>
            <input
              id="ob-weight"
              type="number"
              min="30"
              max="150"
              inputMode="numeric"
              value={weightKg}
              onChange={(e) => setWeightKg(Number(e.target.value))}
            />
            <label htmlFor="ob-birthyear">Geburtsjahr (optional) – aktiviert den Jugend-Modus (U15-U19)</label>
            <input
              id="ob-birthyear"
              type="number"
              min="1930"
              max="2020"
              inputMode="numeric"
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value === "" ? "" : Number(e.target.value))}
            />
            {youth ? (
              <p className="ob-hint">
                Jugend-Modus wird aktiviert: höhere Kohlenhydrat- und Proteinziele für das Wachstum plus strengere RED-S-Warnungen.
              </p>
            ) : null}
            <div className="ob-actions">
              <button type="button" className="link" onClick={() => setStep(0)}>Zurück</button>
              <button type="button" onClick={() => setStep(2)} disabled={!weightValid}>Weiter</button>
            </div>
            <button type="button" className="ob-skip" onClick={() => finish(true)} disabled={busy}>Überspringen</button>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="ob-step">
            <h2>Dein Fokus</h2>
            <p>Welche Sportart trainierst du hauptsächlich? Wir legen sie als Voreinstellung für neue Einheiten fest.</p>
            <div className="ob-chips">
              {SPORTS.map((s) => (
                <button type="button" key={s} className={s === mainSport ? "ob-chip ob-chip-active" : "ob-chip"} onClick={() => setMainSport(s)}>
                  {s}
                </button>
              ))}
            </div>
            <div className="ob-actions">
              <button type="button" className="link" onClick={() => setStep(1)}>Zurück</button>
              <button type="button" onClick={() => setStep(3)}>Weiter</button>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="ob-step">
            <h2>Dein Tagesablauf</h2>
            <p>
              Wann und wie oft isst du normalerweise? Darauf verteilen wir später deine Tagesziele – pro Anlass und
              gegen dein Training periodisiert. Jeder Wochentag ist einzeln einstellbar.
            </p>
            <MealScheduleEditor initial={raster} onChange={setRaster} embedded />
            <div className="ob-actions">
              <button type="button" className="link" onClick={() => setStep(2)}>Zurück</button>
              <button type="button" onClick={() => setStep(4)}>Weiter</button>
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="ob-step">
            <h2>Alles bereit</h2>
            <p>
              {weightKg} kg · {youth ? "Jugend-Modus (U15-U19)" : "Erwachsenen-Ziele"} · Fokus {mainSport} ·{" "}
              {todayMeals} Anlässe am {WEEKDAY_LONG[todayIdx]}
            </p>
            <p>
              So geht's weiter: Über das Plus unten erfassest du Mahlzeiten in unter 3 Sekunden – der Anlass wird
              automatisch erkannt. Im Kalender-Tab siehst du deine Woche mit den vorgeschlagenen Zielen pro Mahlzeit,
              im Plan-Tab legst du Trainingseinheiten an und bekommst deinen Fueling-Plan.
            </p>
            <button type="button" onClick={() => finish(false)} disabled={busy}>
              {busy ? "Speichere ..." : "Fuelix starten"}
            </button>
          </div>
        ) : null}

        {error ? <p className="error">{error}</p> : null}
      </div>
    </div>
  );
}
