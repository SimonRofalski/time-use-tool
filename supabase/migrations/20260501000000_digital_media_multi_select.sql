-- ─── Digital media type: migrate from single FK to junction table ─────────────
-- Replaces time_entry.digital_media_type_id (single value) with a proper
-- many-to-many junction table, mirroring time_entry_social_context.

-- 1. Create the junction table
CREATE TABLE IF NOT EXISTS public.time_entry_digital_media_type (
  entry_id              integer NOT NULL REFERENCES public.time_entry(entry_id) ON DELETE CASCADE,
  digital_media_type_id integer NOT NULL REFERENCES public.digital_media_type(digital_media_type_id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, digital_media_type_id)
);

-- 2. Migrate existing data: copy any non-null values into the junction table
INSERT INTO public.time_entry_digital_media_type (entry_id, digital_media_type_id)
SELECT entry_id, digital_media_type_id
FROM public.time_entry
WHERE digital_media_type_id IS NOT NULL;

-- 3. Drop the old column from time_entry
ALTER TABLE public.time_entry DROP COLUMN IF EXISTS digital_media_type_id;

-- 4. Enable RLS on the junction table
ALTER TABLE public.time_entry_digital_media_type ENABLE ROW LEVEL SECURITY;

-- 5. RLS: users can read their own junction rows (via time_entry → day → profiles_id)
DROP POLICY IF EXISTS "Users can read own digital media type entries" ON public.time_entry_digital_media_type;
CREATE POLICY "Users can read own digital media type entries"
  ON public.time_entry_digital_media_type FOR SELECT
  TO authenticated
  USING (
    entry_id IN (
      SELECT te.entry_id FROM public.time_entry te
      JOIN public.day d ON d.day_id = te.day_id
      WHERE d.profiles_id = auth.uid()
    )
  );

-- 6. RLS: users can insert junction rows for their own entries
DROP POLICY IF EXISTS "Users can insert own digital media type entries" ON public.time_entry_digital_media_type;
CREATE POLICY "Users can insert own digital media type entries"
  ON public.time_entry_digital_media_type FOR INSERT
  TO authenticated
  WITH CHECK (
    entry_id IN (
      SELECT te.entry_id FROM public.time_entry te
      JOIN public.day d ON d.day_id = te.day_id
      WHERE d.profiles_id = auth.uid()
    )
  );

-- 7. RLS: users can delete their own junction rows
DROP POLICY IF EXISTS "Users can delete own digital media type entries" ON public.time_entry_digital_media_type;
CREATE POLICY "Users can delete own digital media type entries"
  ON public.time_entry_digital_media_type FOR DELETE
  TO authenticated
  USING (
    entry_id IN (
      SELECT te.entry_id FROM public.time_entry te
      JOIN public.day d ON d.day_id = te.day_id
      WHERE d.profiles_id = auth.uid()
    )
  );

-- 8. RLS: admins can read all junction rows
DROP POLICY IF EXISTS "Admins can read all digital media type entries" ON public.time_entry_digital_media_type;
CREATE POLICY "Admins can read all digital media type entries"
  ON public.time_entry_digital_media_type FOR SELECT
  TO authenticated
  USING (public.is_admin());
