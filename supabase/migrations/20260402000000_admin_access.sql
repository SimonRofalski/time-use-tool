-- ─── Add email column to profiles ────────────────────────────────────────────
-- Stores a copy of auth.users.email so admins can query it without the service role key.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

-- Backfill emails for all existing users
UPDATE public.profiles
SET email = auth.users.email
FROM auth.users
WHERE auth.users.id = public.profiles.id;

-- ─── Trigger: keep profiles.email in sync when auth.users.email changes ───────

CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles SET email = NEW.email WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_sync ON auth.users;
CREATE TRIGGER on_auth_user_email_sync
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_email();

-- ─── RLS: Admin read/write policies ──────────────────────────────────────────
-- Admin role is set via app_metadata.role = 'admin' in Supabase Auth.
-- All policies use (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' to check this.

-- profiles: admins can read all rows; users can read their own
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
CREATE POLICY "Admins can read all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR id = auth.uid()
  );

-- user_course: admins can read all enrollments
DROP POLICY IF EXISTS "Admins can read all user_course" ON public.user_course;
CREATE POLICY "Admins can read all user_course"
  ON public.user_course FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR profiles_id = auth.uid()
  );

-- day: admins can read all day records
DROP POLICY IF EXISTS "Admins can read all days" ON public.day;
CREATE POLICY "Admins can read all days"
  ON public.day FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR profiles_id = auth.uid()
  );

-- time_entry: admins can read all entries; users can read entries for their own days
DROP POLICY IF EXISTS "Admins can read all time_entries" ON public.time_entry;
CREATE POLICY "Admins can read all time_entries"
  ON public.time_entry FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.day
      WHERE day.day_id = time_entry.day_id
        AND day.profiles_id = auth.uid()
    )
  );

-- course: admins can create new courses and update existing ones (e.g. lock them)
DROP POLICY IF EXISTS "Admins can insert courses" ON public.course;
CREATE POLICY "Admins can insert courses"
  ON public.course FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

DROP POLICY IF EXISTS "Admins can update courses" ON public.course;
CREATE POLICY "Admins can update courses"
  ON public.course FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
