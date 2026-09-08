BEGIN;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS review_error text;
DO $$
BEGIN
IF EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'accuracy_score') THEN
-- Preserve all legacy metrics before removing the obsolete columns.
CREATE TABLE IF NOT EXISTS public.session_score_backup_20260908 AS
SELECT id, score, accuracy_score, fluency_score, vocabulary_score FROM public.sessions;
ALTER TABLE public.session_score_backup_20260908 ENABLE ROW LEVEL SECURITY;
UPDATE public.sessions SET score = accuracy_score WHERE score IS NULL AND accuracy_score IS NOT NULL;
END IF;
END $$;
ALTER TABLE public.sessions
    DROP COLUMN IF EXISTS accuracy_score,
    DROP COLUMN IF EXISTS fluency_score,
    DROP COLUMN IF EXISTS vocabulary_score;
COMMIT;
