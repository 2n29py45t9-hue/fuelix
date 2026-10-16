-- Fuelix: Auth und RLS-Lockdown
-- Anon-Policies entfernen, Zugriff nur noch fuer eingeloggte Nutzer.
drop policy if exists "profile anon access" on public.profile;
drop policy if exists "sessions anon access" on public.sessions;
drop policy if exists "fueling_plans anon access" on public.fueling_plans;

create policy "profile authenticated access" on public.profile
  for all to authenticated using (true) with check (true);

create policy "sessions authenticated access" on public.sessions
  for all to authenticated using (true) with check (true);

create policy "fueling_plans authenticated access" on public.fueling_plans
  for all to authenticated using (true) with check (true);
