-- Bilingual support (AFE2): add English name columns to all lookup tables,
-- and a locale preference on profiles.
--
-- `name` stays as-is (German, unchanged) so no existing query needs to change.
-- `name_en` starts nullable; a follow-up migration backfills it and adds NOT NULL
-- once translations have been reviewed.

ALTER TABLE public.category ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE public.subcategory ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE public.activity ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE public.satisfaction ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE public.location_transport ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE public.social_context ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE public.digital_media_type ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE public.gender ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE public.marital_status ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE public.education_level ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE public.occupational_status ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE public.employment_status ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE public.main_workplace ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE public.health_status ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE public.nationality ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE public.region ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE public.urbanity ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE public.children_in_household ADD COLUMN IF NOT EXISTS name_en text;

-- Per-user language preference; browser language is only the first-visit default,
-- this is what persists it across devices once a user has one.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'de';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_locale_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_locale_check CHECK (locale IN ('de', 'en'));
