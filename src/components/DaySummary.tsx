import { ageFromBirthYear, buildCarbAmpel, buildRedsWarnings, calculateFuelingPlan, dailyTargetsFor, dayTypeFor, dayTypeLabel, isYouthAthlete, restOfDayPhase } from "../lib/fueling";
import { localIso } from "../lib/date";
import CarbAmpel from "./CarbAmpel";
import Tip from "./Tip";
import type { CarbAmpelPhase, MealLog, MealPhase, TrainingSession } from "../types";

const phaseColor: Record<MealPhase, string> = {
  pre: "tl-pre",
  during: "tl-during",
  post: "tl-post",
  snack: "tl-snack"
};

const phaseText: Record<MealPhase, string> = {
  pre: "Vor der Einheit",
  during: "Während",
  post: "Danach",
  snack: "Snack"
};

function Bar({ value, max, label, unit, explain }: { value: number; max: number; label: string; unit: string; explain: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="macrobar">
      <div className="macrobar-head">
        <span className="macrobar-label">
          {label} <Tip text={explain} />
        </span>
        <span className="macrobar-value">
          <strong>{Math.round(value)}</strong> / {Math.round(max)} {unit}
        </span>
      </div>
      <div className="track">
        <div className={"fill" + (pct >= 100 ? " fill-green" : pct >= 60 ? " fill-amber" : "")} style={{ width: pct + "%" }} />
      </div>
    </div>
  );
}

export default function DaySummary({
  sessions,
  weightKg,
  mealLogs,
  birthYear = ""
}: {
  sessions: TrainingSession[];
  weightKg: number;
  mealLogs: MealLog[];
  birthYear?: number | "";
}) {
  const today = localIso();
  const todays = sessions.filter((s) => s.session_date === today);
  const logsToday = mealLogs.filter((l) => l.log_date === today);

  const minutes = todays.reduce((sum, s) => sum + s.duration_min, 0);
  const longestSession = todays.length > 0 ? todays.reduce((a, b) => (b.duration_min > a.duration_min ? b : a)) : null;
  const maxIntensity = todays.some((s) => s.intensity === "high")
    ? "high"
    : todays.some((s) => s.intensity === "moderate")
      ? "moderate"
      : "low";
  const dayType = dayTypeFor(minutes, maxIntensity, longestSession ? longestSession.duration_min : 0);

  // Youth Mode (DUO-31): jugendspezifische Tagesziele und RED-S-Schutz
  const ageYears = ageFromBirthYear(birthYear === "" ? null : birthYear);
  const youth = isYouthAthlete(ageYears);
  const targets = dailyTargetsFor(dayType, weightKg, youth);
  const dailyCarbsPerKg = targets.carbsPerKg;
  const dailyTargetG = targets.carbsG;
  const proteinTargetG = targets.proteinG;

  const loggedCarbs = logsToday.reduce((sum, l) => sum + Number(l.carbs_g), 0);
  const loggedProtein = logsToday.reduce((sum, l) => sum + Number(l.protein_g), 0);

  const warnings = logsToday.length > 0
    ? buildRedsWarnings({ dayType, trainingMinutes: minutes, loggedCarbsG: loggedCarbs, targetCarbsG: dailyTargetG, isYouth: youth })
    : [];

  const phases: CarbAmpelPhase[] = longestSession
    ? [
        ...buildCarbAmpel({
          durationMin: longestSession.duration_min,
          intensity: longestSession.intensity,
          heat: longestSession.heat,
          bodyWeightKg: weightKg
        }),
        restOfDayPhase(dayType, weightKg)
      ]
    : [restOfDayPhase(dayType, weightKg)];

  const plans = todays.map((s) =>
    calculateFuelingPlan({
      durationMin: s.duration_min,
      intensity: s.intensity,
      heat: s.heat,
      bodyWeightKg: weightKg
    })
  );
  const plannedCarbs = plans.reduce((sum, p) => sum + p.totalCarbsG, 0);
  const fluid = plans.reduce((sum, p) => sum + p.totalFluidMl, 0);
  const liters = (fluid / 1000).toFixed(1).replace(".", ",");

  const glycogenTip = youth
    ? "Füllstand der Glykogenspeicher: gegessene Kohlenhydrate im Verhältnis zum heutigen Jugend-Ziel – im Wachstum höher angesetzt (Ruhetag 5, Belastungstag 7, Wettkampftag 8 g/kg) und nie stark gedrosselt (RED-S-Schutz)."
    : "Füllstand deiner Glykogenspeicher: gegessene Kohlenhydrate im Verhältnis zum heutigen Ziel – periodisiert nach Trainingsbelastung (Ruhetag 4, Belastungstag 6, Wettkampftag 8 g/kg).";

  const carbsExplain = youth
    ? "Heutiges KH-Ziel: " + dailyCarbsPerKg + " g pro kg Körpergewicht – hochgerechnet auf " + dailyTargetG + " g. Jugend-Modus: höhere Ziele wegen Wachstum und RED-S-Schutz."
    : "Heutiges KH-Ziel: " + dailyCarbsPerKg + " g pro kg Körpergewicht – hochgerechnet auf " + dailyTargetG + " g. Das Ziel wechselt täglich mit der Belastung (Carb Coding).";

  const proteinExplain = youth
    ? "Protein-Ziel: ca. " + targets.proteinPerKg + " g pro kg Körpergewicht – im Jugend-Wachstum etwas höher, wichtig für Muskelaufbau, Knochen und Regeneration."
    : "Protein-Ziel: ca. 1,6 g pro kg Körpergewicht für Muskelerhalt und Regeneration – auch am Ruhetag wichtig.";

  let nextStep: string;
  if (todays.length === 0) {
    nextStep = "Erfasse dein heutiges Training – danach erscheint dein Fueling-Plan.";
  } else if (loggedCarbs === 0) {
    const first = phases.find((p) => p.key === "pre");
    nextStep = first
      ? "Nächster Schritt: " + first.label + " – ca. " + first.carbsG + " g KH."
      : "Logge deine erste Mahlzeit.";
  } else if (loggedCarbs < dailyTargetG * 0.8) {
    nextStep = "Noch " + Math.round(dailyTargetG - loggedCarbs) + " g KH bis zum Tagesziel – z. B. " + (dayType === "rest" ? "Obst und Joghurt." : "Reis, Nudeln oder ein Iso-Getränk.");
  } else {
    nextStep = "Tagesziel fast erreicht – stark! Jetzt auf Protein und Erholung achten.";
  }

  return (
    <div className="card summary">
      <h2>
        Heute <span className={"badge badge-" + dayType}>{dayTypeLabel(dayType)}</span>
        {youth ? <span className="badge badge-youth">Jugend U15-U19</span> : null}
      </h2>
      {todays.length === 0 ? (
        <p className="muted">Noch keine Einheiten heute – Zeit fuer Training.</p>
      ) : (
        <p className="muted">
          {todays.length} {todays.length === 1 ? "Einheit" : "Einheiten"} · {minutes} min · {plannedCarbs} g KH geplant · {liters} l Fluessigkeit
        </p>
      )}

      <div className="glycogen">
        <div className="glycogen-head">
          <span className="glycogen-label">
            Tagesenergie (KH) <Tip text={glycogenTip} />
          </span>
          <span className="glycogen-pct">{dailyTargetG > 0 ? Math.min(100, Math.round((loggedCarbs / dailyTargetG) * 100)) : 0}%</span>
        </div>
        <div className="track track-big">
          <div
            className={"fill" + (loggedCarbs >= dailyTargetG ? " fill-green" : loggedCarbs >= dailyTargetG * 0.6 ? " fill-amber" : "")}
            style={{ width: (dailyTargetG > 0 ? Math.min(100, (loggedCarbs / dailyTargetG) * 100) : 0) + "%" }}
          />
        </div>
      </div>

      <div className="macros">
        <Bar
          label="Kohlenhydrate"
          unit="g"
          value={loggedCarbs}
          max={dailyTargetG}
          explain={carbsExplain}
        />
        <Bar
          label="Protein"
          unit="g"
          value={loggedProtein}
          max={proteinTargetG}
          explain={proteinExplain}
        />
      </div>

      <div className="timeline">
        <span className="timeline-title">
          Mahlzeiten heute <Tip text="Farbliche Zuordnung: Blau = vor der Einheit, Gelb = während, Grün = Danach (Regeneration), Grau = Snack/sonstige – nach dem Fuelin-Prinzip farbcodierter Mahlzeiten." />
        </span>
        {logsToday.length === 0 ? (
          <span className="muted timeline-empty">Noch nichts geloggt – ein Klick auf einen Favoriten genügt.</span>
        ) : (
          <div className="timeline-items">
            {logsToday.map((l) => (
              <span key={l.id} className={"tl " + phaseColor[l.phase]} title={phaseText[l.phase]}>
                {l.name} · {Math.round(Number(l.carbs_g))} g
              </span>
            ))}
          </div>
        )}
      </div>

      {warnings.length > 0 && (
        <div className="reds">
          <span className="reds-title">
            RED-S-Schutz <Tip text="RED-S = Relative Energy Deficiency in Sport: Die Energiezufuhr liegt dauerhaft unter dem Bedarf. Fuelix warnt früh, besonders bei Jugendlichen, weil Wachstum, Knochen und Hormonsystem hier am empfindlichsten reagieren." />
          </span>
          <ul className="reds-list">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="nextstep">{nextStep}</div>
      <CarbAmpel phases={phases} />
    </div>
  );
}
