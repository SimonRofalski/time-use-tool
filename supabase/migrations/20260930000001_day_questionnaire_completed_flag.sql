-- ─── day.day_questionnaire_completed ─────────────────────────────────────────
-- True/false per day: has the participant answered the day questionnaire?
-- Admins may not read day_questionnaire rows of other users (see
-- 20260920000001_add_day_questionnaire.sql), but they may see per-day
-- completion flags on `day` (like is_submitted). This flag lets the course
-- overview count answered day questionnaires without exposing any answers.
-- Participants use it too, to see which days still need answering (the
-- questionnaire can be postponed with "Später ausfüllen").

ALTER TABLE public.day
  ADD COLUMN IF NOT EXISTS day_questionnaire_completed boolean NOT NULL DEFAULT false;

-- Backfill from already answered questionnaires
UPDATE public.day d
SET day_questionnaire_completed = true
WHERE EXISTS (
  SELECT 1 FROM public.day_questionnaire q WHERE q.day_id = d.day_id
);

-- Kept in sync by trigger, so the client never has to set it itself.
-- SECURITY DEFINER: runs regardless of the caller's UPDATE rights on `day`.
CREATE OR REPLACE FUNCTION public.sync_day_questionnaire_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.day
    SET day_questionnaire_completed = false
    WHERE day_id = OLD.day_id;
    RETURN OLD;
  END IF;

  UPDATE public.day
  SET day_questionnaire_completed = true
  WHERE day_id = NEW.day_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_day_questionnaire_completed ON public.day_questionnaire;
CREATE TRIGGER trg_day_questionnaire_completed
  AFTER INSERT OR DELETE ON public.day_questionnaire
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_day_questionnaire_completed();
