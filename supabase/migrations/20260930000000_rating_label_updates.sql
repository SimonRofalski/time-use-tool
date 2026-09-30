-- ─── Rating answer label updates ─────────────────────────────────────────────
-- Satisfaction answers start with a capital letter like every other answer
-- list (e.g. "very good" → "Very good"). Only the first letter changes, so the
-- lowercase matching in lib/admin/statistics.ts keeps working; the UI keys off
-- `code`, not the name.

UPDATE public.satisfaction
SET
  name    = upper(left(name, 1)) || substr(name, 2),
  name_en = upper(left(name_en, 1)) || substr(name_en, 2);

-- Stressfulness answers reworded from a generic low→high intensity scale to
-- stress-specific labels. Codes (1=least … 5=most stressful) are unchanged.

UPDATE public.stressfulness SET name = 'Überhaupt nicht stressig', name_en = 'Not at all stressful' WHERE code = '1';
UPDATE public.stressfulness SET name = 'Kaum stressig',            name_en = 'Mildly stressful'     WHERE code = '2';
UPDATE public.stressfulness SET name = 'Etwas stressig',           name_en = 'Moderately stressful' WHERE code = '3';
UPDATE public.stressfulness SET name = 'Stressig',                 name_en = 'Stressful'            WHERE code = '4';
UPDATE public.stressfulness SET name = 'Sehr stressig',            name_en = 'Very stressful'       WHERE code = '5';
