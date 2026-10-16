-- Onboarding: Hauptsport als Voreinstellung fuer neue Trainingseinheiten.
alter table public.profile add column if not exists main_sport text;
