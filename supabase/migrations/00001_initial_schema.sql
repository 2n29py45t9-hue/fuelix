-- Fuelix: initiales Schema (Single-User MVP)
create table public.profile (
  id uuid primary key default gen_random_uuid(),
  name text,
  body_weight_kg numeric not null default 70,
  sport text default 'Radsport',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  session_date date not null default current_date,
  sport text not null default 'Radsport',
  duration_min int not null check (duration_min > 0),
  intensity text not null check (intensity in ('low','moderate','high')),
  heat text not null default 'normal' check (heat in ('normal','hot')),
  notes text,
  created_at timestamptz not null default now()
);

create table public.fueling_plans (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  carbs_gh numeric not null,
  fluid_mlh numeric not null,
  sodium_mgh numeric not null,
  pre text,
  during text,
  post text,
  raw jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.profile enable row level security;
alter table public.sessions enable row level security;
alter table public.fueling_plans enable row level security;

-- MVP: Single-User ohne Auth. Projekt ist privat.
-- Ausbaustufe: Supabase Auth aktivieren und Policies auf authenticated einschraenken.
create policy "profile anon access" on public.profile for all to anon using (true) with check (true);
create policy "sessions anon access" on public.sessions for all to anon using (true) with check (true);
create policy "fueling_plans anon access" on public.fueling_plans for all to anon using (true) with check (true);
