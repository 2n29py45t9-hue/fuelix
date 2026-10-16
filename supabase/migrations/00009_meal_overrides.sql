-- DUO-36: Einzeltermin-Overrides fuer das Mahlzeiten-Raster (Notion-Logik:
-- "nur dieses Datum" vs. "alle zukuenftigen Wiederholungen" = Routine).
-- Ueberschreibt die wochentags-Routine fuer genau ein Datum.
create table if not exists public.meal_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  time text not null,
  label text not null,
  primary_meal boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, date, time)
);

alter table public.meal_overrides enable row level security;

-- Eigene Zeilen nur fuer den eigenen Nutzer.
create policy "meal_overrides own rows" on public.meal_overrides
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists meal_overrides_user_date_idx on public.meal_overrides (user_id, date);
