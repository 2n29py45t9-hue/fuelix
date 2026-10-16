-- Youth Mode (DUO-31): Geburtsjahr als Basis fuer jugendspezifische
-- Fueling-Berechnungen (U15-U19) und RED-S-Schutz.
ALTER TABLE public.profile ADD COLUMN IF NOT EXISTS birth_year INT;

COMMENT ON COLUMN public.profile.birth_year IS 'Geburtsjahr des Athleten - Basis fuer Jugend-Modus (U15-U19) und RED-S-Fruehwarnung';

ALTER TABLE public.profile DROP CONSTRAINT IF EXISTS profile_birth_year_range;
ALTER TABLE public.profile ADD CONSTRAINT profile_birth_year_range
  CHECK (birth_year IS NULL OR (birth_year >= 1930 AND birth_year <= EXTRACT(YEAR FROM now())));
