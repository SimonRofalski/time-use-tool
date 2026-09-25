-- Guided tutorial (onboarding tour): remembers when a user finished or skipped it.
--
-- NULL = not seen yet → the tour starts automatically on the next login after
-- course enrollment. Deliberately not backfilled, so existing users also see
-- it once. Written by the user themselves via the existing
-- "Users can update own profile" policy (20260405000000_add_profile_names.sql).
-- "Tutorial neu starten" in the settings panel replays it without resetting
-- this column.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tutorial_completed_at timestamptz;
