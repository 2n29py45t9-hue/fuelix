import { useState } from "react";
import { ageFromBirthYear, buildCarbAmpel, buildRedsWarnings, calculateFuelingPlan, dailyTargetsFor, dayTypeFor, dayTypeLabel, energyBalanceFor, estimateDailyEnergyNeed, isYouthAthlete, mealPlanFor, reallocateMealPlan, restOfDayPhase, sessionFuelingCheckpoints, type FuelingCheckpoint, type MealSlotPlan } from "../lib/fueling";
import { hhmmFromIso, hhmmNow, localIso, minutesFromHHMM } from "../lib/date";
import { slotsForDate } from "../lib/mealSchedule";
import Tip from "./Tip";
import type { CarbAmpelPhase, MealLog, MealOverride, MealPhase, MealSlot, TrainingSession } from "../types";

/*
 * Home / Tages-Summary. DUO-38: grosse Fortschrittsringe im
 * Apple-Health-Stil (KH / Protein / Energie) inkl. "wie viel noch fehlt".
 * DUO-43: Redundanz entfernt - die Carb-Ampel-Dopplung unten ist weg
 * (der volle Plan lebt in der PlanCard), das Tages-Tracking steckt in
 * den Ringen und der Timeline. DUO-45: Timeline = Kalender - jede
 * Kachel ist anippbar: geplante Anlaesse und Logs lassen sich direkt
 * bearbeiten ("Tag anpassen"), Einheiten oeffnen ihren Plan.
 */

const phaseText: Record<MealPhase, string> = {
  pre: "Vor der Einheit",
  during: "Während",
  post: "Danach",
  snack: "Snack"
};

const intensityText = (i: string) => (i === "high" ? "Hoch" : i === "moderate" ? "Mittel" : "Leicht");

/* DUO-38: Fortschrittsring - SVG-Donut mit Bogen nach Fortschritt. */
const RING_R = 34;
const RING_C = 2 * Math.PI * RING_R;

function Ring({ pct, color, label, rest, explain }: { pct: number; color: string; label: string; rest: string; explain: string }) {
  const p = Math.max(0, Math.min(100, pct));
  const offset = RING_C * (1 - p / 100);
  return (
    <div className="ring">
      <div className="ringwrap">
        <svg viewBox="0 0 84 84" width="84" height="84" aria-hidden="true">
          <circle className="ring-track" cx="42" cy="42" r={RING_R} strokeWidth="10" fill="none" />
          <circle
            className="ring-arc"
            cx="42"
            cy="42"
            r={RING_R}
            stroke={color}
            strokeWidth="10"
            fill="none"
            strokeDasharray={RING_C}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform="rotate(-90 42 42)"
          />
        </svg>
        <span className="ring-pct">{Math.round(p)}%</span>
      </div>
      <span className="ring-label">
        {label} <Tip text={explain} />
      </span>
      <span className="ring-rest">{rest}</span>
    </div>
  );
}

type FeedItem =
  | { kind: "meal"; time: string; log: MealLog }
  | { kind: "session"; time: string; session: TrainingSession }
  | { kind: "slot"; time: string; slot: MealSlotPlan }
  | { kind: "fueling"; time: string; cp: FuelingCheckpoint };

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
  mealSchedule = [],
  overrides = [],
  onSelectSession,
  onEditDay,
  onEditLog,
  onLogMeal
}: {
  date: string;
  sessions: TrainingSession[];
  weightKg: number;
  mealLogs: MealLog[];
  birthYear?: number | "";
  mealSchedule?: MealSlot[];
  overrides?: MealOverride[];
  onSelectSession: (s: TrainingSession) => void;
  onEditDay: () => void;
  onEditLog: (log: MealLog) => void;
  /* Finetuning Item-Logging: geplante Mahlzeit antippen = "was hast du
   * gegessen" (Item-Liste), NICHT der Tages-Editor (dafuer ist der Button). */
  onLogMeal: (slot: MealSlotPlan) => void;
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
  const loggedFat = logsToday.reduce((sum, l) => sum + Number(l.fat_g), 0);

  // Energieziel-Engine (DUO-33): Tagesbedarf und Bilanz aus geloggten Makros
  const energyTarget = estimateDailyEnergyNeed({ weightKg, ageYears, trainingMinutes: minutes, maxIntensity });
  const balance = energyBalanceFor(
    { carbsG: loggedCarbs, proteinG: loggedProtein, fatG: loggedFat },
    energyTarget.totalKcal,
    youth
  );

  const warnings = logsToday.length > 0
    ? buildRedsWarnings({ dayType, trainingMinutes: minutes, loggedCarbsG: loggedCarbs, targetCarbsG: dailyTargetG, isYouth: youth })
    : [];
  // Abend-Check der Energiebilanz (DUO-33): frueh am Tag waere die Warnung nur noise
  const nowHour = new Date().getHours();
  if (isToday && logsToday.length > 0 && nowHour >= 17 && balance.level !== "ok") {
    warnings.push(
      "Energiebilanz am Abend: erst " + balance.pct + "% des Tagesbedarfs (ca. " + balance.loggedKcal + " von " + balance.targetKcal + " kcal)" +
        (youth ? " – im Wachstum darf die Bilanz nicht ins Minus laufen (RED-S-Schutz)." : " – jetzt noch eine kohlenhydratreiche Mahlzeit für die Regeneration.")
    );
  }
  // Abend-Prompt (DUO-35): das Abendfenster ist die häufigste unloggierte Lücke.
  if (isToday && nowHour >= 20 && logsToday.length > 0) {
    const lastLogHour = logsToday.reduce((max, l) => {
      const t = hhmmFromIso(l.created_at);
      return t !== "" ? Math.max(max, Number(t.slice(0, 2))) : max;
    }, -1);
    if (lastLogHour < 19) {
      warnings.push(
        "Abend-Check: Nach 19 Uhr ist heute nichts mehr geloggt. Der Abend ist die häufigste Lücke – erfasse deinen letzten Snack, damit die Tagesbilanz stimmt."
      );
    }
  }

  // Fueling-Phasen nur noch fuer den naechsten Schritt - die Ampel-Dopplung
  // unten ist weg, der volle Plan lebt in der PlanCard (DUO-43).
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

  // Mahlzeiten-Periodisierung (DUO-35 + DUO-36): effektive Anlässe des
  // Tages = Override fuer dieses Datum, sonst Wochentags-Routine. Gegen
  // das Training periodisieren und – Hexis-Reallocation-Prinzip – nach
  // den bisherigen Logs neu berechnen.
  const daySlots = mealSchedule.length > 0 || overrides.length > 0 ? slotsForDate(mealSchedule, overrides, date) : [];
  const mealPlan = daySlots.length > 0
    ? mealPlanFor({
        slots: daySlots,
        sessions: todays.map((s) => ({ start: s.session_start ?? null, durationMin: s.duration_min, intensity: s.intensity, heat: s.heat, sport: s.sport })),
        weightKg,
        dayType,
        isYouth: youth
      })
    : null;
  const nowHhmm = hhmmNow();
  const reallocPlan = mealPlan && isToday ? reallocateMealPlan(mealPlan, loggedCarbs, nowHhmm) : null;
  const nextSlot = reallocPlan
    ? reallocPlan.slots.find((s) => minutesFromHHMM(s.time) > minutesFromHHMM(nowHhmm))
    : null;
  const originalNext = nextSlot && mealPlan ? mealPlan.slots.find((s) => s.time === nextSlot.time) : null;
  const nextChanged = !!(nextSlot && originalNext && originalNext.carbsG !== nextSlot.carbsG);

  // Timeline-Feed (DUO-32 + DUO-36): geplante Anlässe aus der Routine
  // (gestrichelt, mit Ziel), ALLE geloggten Mahlzeiten und Snacks sowie
  // Einheiten - chronologisch gemischt, damit der Überblick stimmt.
  // Fueling-Plan in die Timeline (DUO-37): pro geplanter Einheit die
  // Fueling-Fenster Vor / Waehrend / Danach als eigene Kacheln mit
  // konkreter Uhrzeit und Ziel. Uebernimmt eine Mahlzeit aus dem Raster
  // das Vor- oder Recovery-Fueling (sessionLabel am Slot), entfaellt
  // die orphan-Kachel - das Fueling steckt dann in der Mahlzeit.
  const fuelingItems: FeedItem[] = [];
  for (const s of todays) {
    if (!s.session_start) continue;
    const cps = sessionFuelingCheckpoints(
      { start: s.session_start, durationMin: s.duration_min, intensity: s.intensity, heat: s.heat, sport: s.sport },
      s.sport,
      weightKg
    );
    const hasPreSlot = !!(mealPlan && mealPlan.slots.some((sl) => sl.relation === "pre" && sl.sessionTime === s.session_start));
    const hasPostSlot = !!(mealPlan && mealPlan.slots.some((sl) => sl.relation === "post" && sl.sessionTime === s.session_start));
    for (const cp of cps) {
      if (cp.key === "pre" && hasPreSlot) continue;
      if (cp.key === "post" && hasPostSlot) continue;
      fuelingItems.push({ kind: "fueling", time: cp.time, cp });
    }
  }

  const feed: FeedItem[] = [
    ...(mealPlan ? mealPlan.slots.map((s) => ({ kind: "slot" as const, time: s.time, slot: s })) : []),
    ...fuelingItems,
    /* Slot-verknuepfte Sammel-Logs erscheinen IM Slot-Tile mit Status -
     * sonst wuerde die Mahlzeit doppelt in der Timeline stehen. */
    ...logsToday
      .filter((l) => !(l.slot_time && mealPlan && mealPlan.slots.some((s) => s.time === l.slot_time)))
      .map((l) => ({ kind: "meal" as const, time: hhmmFromIso(l.created_at), log: l })),
    ...todays.map((s) => ({ kind: "session" as const, time: s.session_start || "", session: s }))
  ].sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));

  /* Item-Logging: Sammel-Log pro geplanter Mahlzeit (via slot_time). */
  const slotLogs = new Map<string, MealLog>();
  for (const l of logsToday) {
    if (l.slot_time) slotLogs.set(l.slot_time, l);
  }
  /* Status eines Anlasses: abgehakt bei +-10 % des KH-Ziels. */
  const slotState = (slot: MealSlotPlan) => {
    const log = slotLogs.get(slot.time);
    if (!log) return { logged: null as number | null, done: false };
    const loggedCarbs = Number(log.carbs_g);
    const done = slot.carbsG > 0 && loggedCarbs >= slot.carbsG * 0.9 && loggedCarbs <= slot.carbsG * 1.1;
    return { logged: loggedCarbs, done };
  };
  /* Reallocation: wenn was fehlt, zeigen spaetere Anlaesse das neu
   * berechnete Ziel (aus reallocPlan, gleiche Hexis-Logik wie der
   * "Naechster Anlass"-Block). */
  const adjFor = (slot: MealSlotPlan) => {
    if (!reallocPlan) return null;
    const adj = reallocPlan.slots.find((s) => s.time === slot.time);
    if (!adj) return null;
    return adj.carbsG !== slot.carbsG ? adj : null;
  };

  const dateLabel = isToday
    ? "Heute"
    : new Date(date + "T12:00:00").toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long" });

  // DUO-38: Ring-Texte - altes Erklaerwissen bleibt als Tip erhalten.
  const carbRingExplain = (youth
    ? "Füllstand der Glykogenspeicher: gegessene Kohlenhydrate im Verhältnis zum heutigen Jugend-Ziel – im Wachstum höher angesetzt (Ruhetag 5, Belastungstag 7, Wettkampftag 8 g/kg) und nie stark gedrosselt (RED-S-Schutz). "
    : "Füllstand deiner Glykogenspeicher: gegessene Kohlenhydrate im Verhältnis zum heutigen Ziel – periodisiert nach Trainingsbelastung (Ruhetag 4, Belastungstag 6, Wettkampftag 8 g/kg). ") +
    "Heutiges KH-Ziel: " + dailyCarbsPerKg + " g pro kg Körpergewicht – hochgerechnet auf " + dailyTargetG + " g.";

  const proteinExplain = youth
    ? "Protein-Ziel: ca. " + targets.proteinPerKg + " g pro kg Körpergewicht – im Jugend-Wachstum etwas höher, wichtig für Muskelaufbau, Knochen und Regeneration."
    : "Protein-Ziel: ca. 1,6 g pro kg Körpergewicht für Muskelerhalt und Regeneration – auch am Ruhetag wichtig.";

  const energyExplain = "Tagesenergie: Grundumsatz " + energyTarget.rmrKcal + " kcal (Schofield-Schätzung nach Alter und Gewicht) plus Alltag " + energyTarget.dailyLifeKcal + " kcal (Faktor 1,4) plus Training " + energyTarget.trainingKcal + " kcal (METs aus Dauer und Intensität) = ca. " + energyTarget.totalKcal + " kcal. Schätzwert – der Ring füllt sich über den Tag aus den geloggten Makros (4 kcal/g KH und Protein, 9 kcal/g Fett).";

  const carbRest = loggedCarbs >= dailyTargetG
    ? "Ziel erreicht – stark!"
    : "noch " + Math.round(dailyTargetG - loggedCarbs) + " g";
  const proteinRest = loggedProtein >= proteinTargetG
    ? "Ziel erreicht"
    : "noch " + Math.round(proteinTargetG - loggedProtein) + " g";
  const energyRest = balance.loggedKcal >= energyTarget.totalKcal
    ? "Ziel erreicht"
    : "noch " + Math.round(energyTarget.totalKcal - balance.loggedKcal) + " kcal";

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
      <div className="sumhead">
        <h2>
          {dateLabel} <span className={"badge badge-" + dayType}>{dayTypeLabel(dayType)}</span>
          {youth ? <span className="badge badge-youth">Jugend U15-U19</span> : null}
        </h2>
        <button
          type="button"
          className="sumhead-edit"
          onClick={onEditDay}
          title="Mahlzeiten, Snacks und Anlässe dieses Tages anpassen"
        >
          Tag anpassen
        </button>
      </div>

      <div className="traincard">
        <div className="traincard-head">
          <span className="traincard-title">
            Training <Tip text="Deine Einheiten dieses Tages. Bearbeiten öffnet die Einheit mit ihrem vollen Fueling-Plan – änderst du Dauer oder Intensität, rechnen Ringe, Timeline und Mahlzeitziele sofort neu." />
          </span>
          {todays.length > 0 ? (
            <span className="traincard-sum">{minutes} min · {plannedCarbs} g KH geplant · {liters} l Flüssigkeit</span>
          ) : null}
        </div>
        {todays.length === 0 ? (
          <span className="muted">Keine Einheiten an diesem Tag.</span>
        ) : (
          <div className="trainrows">
            {todays.map((s) => (
              <div className="trainrow" key={s.id ?? s.sport + (s.session_start ?? "")}>
                <span className="trainrow-when">{s.session_start || "—"}</span>
                <span className="trainrow-name">{s.sport} · {s.duration_min} min · {intensityText(s.intensity)}</span>
                <button type="button" className="trainrow-edit" onClick={() => onSelectSession(s)}>
                  Bearbeiten
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rings">
        <Ring
          pct={dailyTargetG > 0 ? (loggedCarbs / dailyTargetG) * 100 : 0}
          color="#22c55e"
          label="Kohlenhydrate"
          rest={carbRest}
          explain={carbRingExplain}
        />
        <Ring
          pct={proteinTargetG > 0 ? (loggedProtein / proteinTargetG) * 100 : 0}
          color="#3b82f6"
          label="Protein"
          rest={proteinRest}
          explain={proteinExplain}
        />
        <Ring
          pct={energyTarget.totalKcal > 0 ? (balance.loggedKcal / energyTarget.totalKcal) * 100 : 0}
          color="#fbbf24"
          label="Energie"
          rest={energyRest}
          explain={energyExplain}
        />
      </div>

      {nextSlot ? (
        <div className="realloc">
          <span className="realloc-title">
            Nächster Anlass: {nextSlot.label} ({nextSlot.time})
            <Tip text={nextSlot.explanation !== "" ? nextSlot.explanation : "Ziel aus deinem Tagesablauf-Raster, periodisiert gegen dein Training. Jeder Log rechnet die restlichen Anlässe neu."} />
          </span>
          <span className="realloc-value">
            ≈ {nextSlot.carbsG} g KH · {nextSlot.proteinG} g Protein{nextChanged ? " (neu berechnet)" : ""}
          </span>
        </div>
      ) : null}

      <div className="timeline">
        <span className="timeline-title">
          Timeline <Tip text="Dein Tag im Überblick: gestrichelte Kacheln sind geplant – graue aus deiner Routine mit Ziel (Farbe = KH-Betonung), blaue sind Fueling-Fenster um deine Einheit (Vor / Während / Danach). Tippe eine geplante Mahlzeit an und erfasse als Liste, was du gegessen hast – die Summe wird gegen das Mahlzeit-Ziel gerechnet, bei ±10 % ist die Mahlzeit abgehakt (✓); fehlt etwas, werden die übrigen Anlässe neu berechnet (neu: ≈ X g KH). Tippe eine ausgefüllte Kachel an, um den Log zu bearbeiten oder zu löschen. Mahlzeiten mit Einheits-Bezug tragen einen blauen Verweis, z. B. Frühstück → Laufen. Log-Farben: Blau = vor der Einheit, Gelb = während, Grün = danach, Grau = Snack/sonstige." />
        </span>
        {feed.length === 0 ? (
          <span className="muted timeline-empty">Noch nichts an diesem Tag – tippe unten auf + zum Loggen.</span>
        ) : (
          <div className="feed">
            {feed.map((f, i) =>
              f.kind === "slot" ? (() => {
                const st = slotState(f.slot);
                const adj = adjFor(f.slot);
                return (
                  <div className="feedrow" key={"p" + i + f.slot.time}>
                    <span className="feedtime">{f.slot.time}</span>
                    <button
                      type="button"
                      className={"slottile" + (st.done ? " done" : st.logged !== null ? " partial" : "")}
                      onClick={() => onLogMeal(f.slot)}
                      title="Antippen: erfassen, was du gegessen hast – die Summe wird gegen das Ziel gerechnet"
                    >
                      <span className={"calslot-dot " + f.slot.color} />
                      <span className="tile-name">{st.done ? "✓ " : ""}{f.slot.label}</span>
                      {f.slot.sessionLabel ? (
                        <span className="slottile-link">→ {f.slot.sessionLabel} {f.slot.sessionTime}</span>
                      ) : null}
                      {st.logged !== null ? (
                        <span className="slottile-target">
                          {st.done
                            ? Math.round(st.logged) + " g KH erfasst – Ziel erreicht"
                            : Math.round(st.logged) + " g erfasst – noch " + Math.max(0, Math.round(f.slot.carbsG - st.logged)) + " g KH"}
                        </span>
                      ) : (
                        <span className="slottile-target">
                          Ziel ≈ {f.slot.carbsG} g KH · {f.slot.proteinG} g P
                          {adj ? <span className="slottile-adj"> (neu: ≈ {adj.carbsG} g KH)</span> : null}
                        </span>
                      )}
                      <Tip text={f.slot.explanation !== "" ? f.slot.explanation : "Geplanter Anlass aus deiner Routine – periodisiert gegen dein Training. Antippen und als Liste erfassen, was du gegessen hast; die Summe wird gegen das Ziel gerechnet (±10 % = abgehakt)."} />
                    </button>
                  </div>
                );
              })() : f.kind === "meal" ? (
                <div className="feedrow" key={"m" + i}>
                  <span className="feedtime">{f.time}</span>
                  <button
                    type="button"
                    className={"mealtile tile-" + f.log.phase}
                    onClick={() => onEditLog(f.log)}
                    title="Log ansehen, korrigieren oder löschen"
                  >
                    <span className="tile-head">
                      <span className="tile-name">{f.log.name}</span>
                      <span className="tile-phase">{phaseText[f.log.phase]}</span>
                    </span>
                    <span className="tile-macros">
                      <span><strong>{Math.round(Number(f.log.carbs_g))}</strong> g KH</span>
                      <span><strong>{Math.round(Number(f.log.protein_g))}</strong> g P</span>
                      <span><strong>{Math.round(Number(f.log.fat_g))}</strong> g F</span>
                    </span>
                  </button>
                </div>
              ) : f.kind === "fueling" ? (
                <div className="feedrow" key={"fu" + i + f.cp.key + f.cp.time}>
                  <span className="feedtime">{f.cp.time}</span>
                  <div className="fueltile">
                    <span className={"calslot-dot " + f.cp.color} />
                    <span className="tile-name">{f.cp.label}</span>
                    <span className="fueltile-target">
                      {f.cp.key === "during"
                        ? f.cp.carbsG + " g KH · " + f.cp.fluidMl + " ml/h · " + f.cp.sodiumMg + " mg Na/h"
                        : "≈ " + f.cp.carbsG + " g KH" + (f.cp.proteinG > 0 ? " · " + f.cp.proteinG + " g P" : "") + " · " + f.cp.fluidMl + " ml"}
                    </span>
                    <Tip text={f.cp.explanation} />
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
    </div>
  );
}
