-- DUO-35: Mahlzeiten-Raster pro Wochentag (Onboarding-Schritt + Kalender-Tab).
-- weekday 0 = Montag ... 6 = Sonntag; time als 'HH:MM' Text fuer einfaches Sortieren.
create table if not exists public.meal_schedule (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  time text not null,
  label text not null,
  primary_meal boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, weekday, time)
);

alter table public.meal_schedule enable row level security;

-- Eigene Zeilen nur fuer den eigenen Nutzer (strikter als aeltere Tabellen).
create policy "meal_schedule own rows" on public.meal_schedule
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
