-- Mobile Home (DUO-32): Startzeit fuer Trainingseinheiten (HH:MM),
-- damit Einheiten und Mahlzeiten im Timeline-Feed chronologisch mischbar sind.
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS session_start TEXT;

COMMENT ON COLUMN public.sessions.session_start IS 'Geplante Startzeit der Einheit als HH:MM (optional)';
