-- Split "WEGEZEITEN UND NICHT SPEZIFIZIERTE ZEITNUTZUNG" into two categories.
--
-- Category 10 keeps all travel activities (9xx "Wege ...") and is renamed to
-- "WEGEZEITEN". The three non-travel activities move into a new category 11
-- "NICHT SPEZIFIZIERTE ZEITNUTZUNG":
--   995 Ausfüllen des Zeitverwendungs-Tagebuchs
--   998 Nicht näher bezeichnete Freizeit
--   999 Sonstige nicht näher bezeichnete Zeitnutzung
--
-- Only activity.subcategory_id changes — activity_ids stay the same, so existing
-- time_entry rows keep pointing at the same activity and are simply counted
-- under the new category from now on.
--
-- HETUS has no separate top-level code for this group; "99" is used for both the
-- new category and subcategory (matching the 99x activity codes it contains).
--
-- category_id / subcategory_id are GENERATED ALWAYS identity columns, so the
-- explicit ids (which the app's id-keyed icon/colour maps rely on) need
-- OVERRIDING SYSTEM VALUE. Already applied to the live DB on 2026-09-25.

INSERT INTO public.category (category_id, code, name, name_en)
OVERRIDING SYSTEM VALUE VALUES
  (11, '99', 'NICHT SPEZIFIZIERTE ZEITNUTZUNG', 'UNSPECIFIED TIME USE')
ON CONFLICT (category_id) DO NOTHING;

INSERT INTO public.subcategory (subcategory_id, category_id, code, name, name_en)
OVERRIDING SYSTEM VALUE VALUES
  (34, 11, '99', 'NICHT SPEZIFIZIERTE ZEITNUTZUNG', 'UNSPECIFIED TIME USE')
ON CONFLICT (subcategory_id) DO NOTHING;

UPDATE public.activity
  SET subcategory_id = 34
  WHERE code IN ('995', '998', '999');

UPDATE public.category
  SET name = 'WEGEZEITEN', name_en = 'TRAVEL'
  WHERE category_id = 10;

UPDATE public.subcategory
  SET name = 'WEGEZEITEN', name_en = 'TRAVEL'
  WHERE subcategory_id = 33;
