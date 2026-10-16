# Fuelix 🚴

Dein eigenes Hexis.live: Fueling-Plan (Kohlenhydrate & Flüssigkeit) pro Trainingseinheit.

## Setup

1. `npm install`
2. `.env.example` nach `.env` kopieren (Supabase-Zugangsdaten sind darin)
3. `npm run dev`

## Deploy (z. B. Vercel)

Repo importieren, Umgebungsvariablen `VITE_SUPABASE_URL` und `VITE_SUPABASE_KEY` setzen, Framework-Preset: Vite.

## Architektur

- Frontend: Vite + React + TypeScript
- Backend: Supabase (Postgres, Tabellen: `profile`, `sessions`, `fueling_plans`)
- Engine: `src/lib/fueling.ts` – reine, testbare Funktion für alle Empfehlungen

## Roadmap

- Supabase Auth + strikte RLS-Policies
- Wearable-Integration (Garmin, WHOOP, Apple Health)
- Coach-Modus für mehrere Athleten
- Wochen-Periodisierung (fuel for the work required)
