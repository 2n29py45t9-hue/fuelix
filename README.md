# Fuelix 🚴

Dein eigenes Hexis.live: Fueling-Plan (Kohlenhydrate & Flüssigkeit) pro Trainingseinheit – Single-User, nur für dich.

## Features

- Fueling-Plan pro Einheit (KH, Flüssigkeit, Natrium – vorher/während/danach)
- Tages-Zusammenfassung und Wochenansicht mit periodisierten Tages-KH-Zielen
- CSV-Export der Einheiten inklusive berechneter Pläne
- Login (Supabase Auth), Datenbank per RLS nur für eingeloggte Nutzer

## Setup

1. `npm install`
2. `.env.example` nach `.env` kopieren (Supabase-Zugangsdaten sind darin)
3. `npm run dev`

## Auth

Der erste Start zeigt einen Login-Screen: einmalig registrieren, Bestätigungsmail klicken, einloggen. Danach in den Supabase-Auth-Einstellungen die Registrierung deaktivieren.

## Tests

`npm test` führt die Unit-Tests der Fueling-Engine aus (Vitest).

## Deploy (z. B. Vercel)

Repo importieren, Umgebungsvariablen `VITE_SUPABASE_URL` und `VITE_SUPABASE_KEY` setzen, Framework-Preset: Vite.

## Architektur

- Frontend: Vite + React + TypeScript, Login via Supabase Auth
- Backend: Supabase (Postgres, Tabellen: `profile`, `sessions`, `fueling_plans`, RLS auf `authenticated`)
- Engine: `src/lib/fueling.ts` – reine, testbare Funktion für alle Empfehlungen

## Roadmap

- Wearable-Integration (Garmin, WHOOP, Apple Health)
- (später) Coach-Modus für mehrere Athleten
