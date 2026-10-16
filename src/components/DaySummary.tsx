import { useState } from "react";
import { ageFromBirthYear, buildCarbAmpel, buildRedsWarnings, calculateFuelingPlan, dailyTargetsFor, dayTypeFor, dayTypeLabel, isYouthAthlete, restOfDayPhase } from "../lib/fueling";
import { hhmmFromIso, localIso } from "../lib/date";
import CarbAmpel from "./CarbAmpel";
import Tip from "./Tip";
import type { CarbAmpelPhase, MealLog, MealPhase, TrainingSession } from "../types";

const phaseText: Record<MealPhase, string> = {
  pre: "Vor der Einheit",
  during: "Während",
  post: "Danach",
  snack: "Snack"
};

const intensityText = (i: string) => (i === "high" ? "Hoch" : i === "moderate" ? "Mittel" : "Leicht");

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

type FeedItem =
  | { kind: "meal"; time: string; log: MealLog }
  | { kind: "session"; time: string; session: TrainingSession };

function SessionDrawer({ session, weightKg, onOpenPlan }: { session: TrainingSession; weightKg: number; onOpenPlan: () => void }) {
  const plan = calculateFuelingPlan({
    durationMin: session.duration_min,
    intensity: session.intensity,
    heat: session.heat,
    bodyWeightKg: weightKg
  });
  return (
    <div className="drawer">
      <div className="drawer-facts">
        <span className="drawer-chip">{plan.carbsPerHour} g KH/h während</span>
        <span className="drawer-chip">{plan.fluidPerHour} ml/h trinken</span>
        <span className="drawer-chip">{plan.postCarbsG} g KH + {plan.postProteinG} g Protein danach</span>
      </div>
      <button type="button" onClick={onOpenPlan}>Zum vollen Plan</button>
    </div>
  );
}

export default function DaySummary({
  date,
  sessions,
  weightKg,
  mealLogs,
  birthYear = "",
  onSelectSession
}: {
  date: string;
  sessions: TrainingSession[];
  weightKg: number;
  mealLogs: MealLog[];
  birthYear?: number | "";
  onSelectSession: (s: TrainingSession) => void;
}) {
  const [openSession, setOpenSession] = useState<string | null>(null);

  const isToday = date === localIso();
  const todays = sessions.filter((s) => s.session_date === date);
  const logsToday = mealLogs.filter((l) => l.log_date === date);

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

  // Timeline-Feed (DUO-32): Mahlzeiten und Einheiten chronologisch gemischt,
  // Tiles nach Fueling-Phase farbcodiert (Carb Coding statt Mahlzeitentyp).
  const feed: FeedItem[] = [
    ...logsToday.map((l) => ({ kind: "meal" as const, time: hhmmFromIso(l.created_at), log: l })),
    ...todays.map((s) => ({ kind: "session" as const, time: s.session_start || "", session: s }))
  ].sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));

  const dateLabel = isToday
    ? "Heute"
    : new Date(date + "T12:00:00").toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long" });

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
    nextStep = "Erfasse dein Training – danach erscheint dein Fueling-Plan.";
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
        {dateLabel} <span className={"badge badge-" + dayType}>{dayTypeLabel(dayType)}</span>
        {youth ? <span className="badge badge-youth">Jugend U15-U19</span> : null}
      </h2>
      {todays.length === 0 ? (
        <p className="muted">Keine Einheiten an diesem Tag.</p>
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
          Timeline <Tip text="Farbliche Zuordnung nach Fueling-Phase: Blau = vor der Einheit, Gelb = während, Grün = danach (Regeneration), Grau = Snack/sonstige – nach dem Fuelin-Prinzip farbcodierter Mahlzeiten. Zeiten zeigen, wann geloggt bzw. wann die Einheit geplant ist." />
        </span>
        {feed.length === 0 ? (
          <span className="muted timeline-empty">Noch nichts an diesem Tag – tippe unten auf + zum Loggen.</span>
        ) : (
          <div className="feed">
            {feed.map((f, i) =>
              f.kind === "meal" ? (
                <div className="feedrow" key={"m" + i}>
                  <span className="feedtime">{f.time}</span>
                  <div className={"mealtile tile-" + f.log.phase}>
                    <div className="tile-head">
                      <span className="tile-name">{f.log.name}</span>
                      <span className="tile-phase">{phaseText[f.log.phase]}</span>
                    </div>
                    <div className="tile-macros">
                      <span><strong>{Math.round(Number(f.log.carbs_g))}</strong> g KH</span>
                      <span><strong>{Math.round(Number(f.log.protein_g))}</strong> g P</span>
                      <span><strong>{Math.round(Number(f.log.fat_g))}</strong> g F</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="feedrow" key={"s" + (f.session.id || i)}>
                  <span className="feedtime">{f.time}</span>
                  <div className="sessiontile">
                    <button
                      type="button"
                      className="tile-toggle"
                      onClick={() => setOpenSession(openSession === f.session.id ? null : f.session.id ?? null)}
                    >
                      <span className="tile-name">{f.session.sport} · {f.session.duration_min} min · {intensityText(f.session.intensity)}</span>
                    </button>
                    {openSession === f.session.id ? (
                      <SessionDrawer session={f.session} weightKg={weightKg} onOpenPlan={() => onSelectSession(f.session)} />
                    ) : null}
                  </div>
                </div>
              )
            )}
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
