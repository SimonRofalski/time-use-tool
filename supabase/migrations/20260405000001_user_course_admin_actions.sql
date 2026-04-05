-- ─── Exclusion flag: admin can exclude a user's data from statistics ──────────
-- is_excluded = true → user's entries are filtered out of all statistical views.
-- The user's own app experience is unchanged (they can still log and view their data).

ALTER TABLE public.user_course ADD COLUMN IF NOT EXISTS is_excluded boolean NOT NULL DEFAULT false;

-- ─── Alias: set during course anonymization ───────────────────────────────────
-- alias is populated when an admin triggers "Kurs anonymisieren".
-- Once set, admin views replace name/email with this alias for that enrollment.

ALTER TABLE public.user_course ADD COLUMN IF NOT EXISTS alias text;

-- ─── RLS: admin can update and delete user_course rows ───────────────────────

DROP POLICY IF EXISTS "Admins can update user_course" ON public.user_course;
CREATE POLICY "Admins can update user_course"
  ON public.user_course FOR UPDATE
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete from user_course" ON public.user_course;
CREATE POLICY "Admins can delete from user_course"
  ON public.user_course FOR DELETE
  TO authenticated
  USING (public.is_admin());
