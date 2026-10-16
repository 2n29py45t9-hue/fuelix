-- Fuelix: Turbo-Logging (DUO-30) - Mahlzeiten-Favoriten und Meal-Logs
create table if not exists public.meal_favorites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phase text not null default 'snack' check (phase in ('pre','during','post','snack')),
  carbs_g numeric not null default 0,
  protein_g numeric not null default 0,
  fat_g numeric not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.meal_logs (
  id uuid primary key default gen_random_uuid(),
  log_date date not null default current_date,
  favorite_id uuid references public.meal_favorites(id) on delete set null,
  name text not null,
  phase text not null default 'snack' check (phase in ('pre','during','post','snack')),
  carbs_g numeric not null default 0,
  protein_g numeric not null default 0,
  fat_g numeric not null default 0,
  logged_ms integer,
  created_at timestamptz not null default now()
);

alter table public.meal_favorites enable row level security;
alter table public.meal_logs enable row level security;

create policy "meal_favorites authenticated access" on public.meal_favorites
  for all to authenticated using (true) with check (true);

create policy "meal_logs authenticated access" on public.meal_logs
  for all to authenticated using (true) with check (true);
