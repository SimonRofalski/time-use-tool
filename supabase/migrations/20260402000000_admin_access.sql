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

-- ─── Helper function: is the current user an admin? ──────────────────────────
-- SECURITY DEFINER bypasses RLS so the function can read profiles.role without
-- causing infinite recursion when profiles itself has an RLS policy that calls this.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ─── Enable RLS on all relevant tables (safe to run even if already enabled) ──

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_course ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.day ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course ENABLE ROW LEVEL SECURITY;

-- ─── RLS policies ─────────────────────────────────────────────────────────────

-- profiles: users read their own row; admins read all rows
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
CREATE POLICY "Admins can read all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.is_admin());

-- user_course: users read their own enrollment; admins read all
DROP POLICY IF EXISTS "Admins can read all user_course" ON public.user_course;
CREATE POLICY "Admins can read all user_course"
  ON public.user_course FOR SELECT
  TO authenticated
  USING (profiles_id = auth.uid() OR public.is_admin());

-- day: users read their own days; admins read all
DROP POLICY IF EXISTS "Admins can read all days" ON public.day;
CREATE POLICY "Admins can read all days"
  ON public.day FOR SELECT
  TO authenticated
  USING (profiles_id = auth.uid() OR public.is_admin());

-- time_entry: users read entries for their own days; admins read all
DROP POLICY IF EXISTS "Admins can read all time_entries" ON public.time_entry;
CREATE POLICY "Admins can read all time_entries"
  ON public.time_entry FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.day
      WHERE day.day_id = time_entry.day_id
        AND day.profiles_id = auth.uid()
    )
  );

-- course: all authenticated users can read courses (needed for enrollment)
--         only admins can create or update courses
DROP POLICY IF EXISTS "Authenticated users can read courses" ON public.course;
CREATE POLICY "Authenticated users can read courses"
  ON public.course FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can insert courses" ON public.course;
CREATE POLICY "Admins can insert courses"
  ON public.course FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update courses" ON public.course;
CREATE POLICY "Admins can update courses"
  ON public.course FOR UPDATE
  TO authenticated
  USING (public.is_admin());
