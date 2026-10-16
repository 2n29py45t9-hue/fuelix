-- Strava-Sync (DUO-23): Tokens des Single-Athleten + Dedup-Spalte.
create table if not exists public.strava_tokens (
  id uuid primary key default gen_random_uuid(),
  athlete_id bigint not null unique,
  athlete_name text,
  access_token text not null,
  refresh_token text not null,
  expires_at bigint not null,
  scope text,
  last_sync_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.strava_tokens enable row level security;

create policy "authenticated full access" on public.strava_tokens
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Sessions: Strava-Aktivitaets-ID fuer Dedup beim Import.
alter table public.sessions add column if not exists strava_id bigint;
create unique index if not exists sessions_strava_id_unique on public.sessions (strava_id);
