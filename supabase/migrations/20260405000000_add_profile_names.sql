-- Add first and last name fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text;

-- Ensure existing rows are initialized and fields are required
UPDATE public.profiles
SET
  first_name = COALESCE(first_name, ''),
  last_name = COALESCE(last_name, '');

ALTER TABLE public.profiles
  ALTER COLUMN first_name SET DEFAULT '',
  ALTER COLUMN first_name SET NOT NULL,
  ALTER COLUMN last_name SET DEFAULT '',
  ALTER COLUMN last_name SET NOT NULL;

-- Allow authenticated users to update their own profile row
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
