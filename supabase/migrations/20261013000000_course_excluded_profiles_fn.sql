-- Course comparison without excluded participants
--
-- Admins can exclude an enrolment from statistics (user_course.is_excluded).
-- The participant-side course comparison (statistiken/page.tsx) builds its
-- pool from other participants' submitted days, but participants can only
-- read their own user_course row — so the client could not tell who is
-- excluded, and excluded users still fed everyone else's course average.
--
-- This function exposes only the excluded profile IDs of one course, and only
-- to members of that course (or admins). Nothing else about user_course
-- (aliases, other enrolments) becomes readable.

CREATE OR REPLACE FUNCTION public.course_excluded_profile_ids(p_course_id integer)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT uc.profiles_id
  FROM public.user_course uc
  WHERE uc.course_id = p_course_id
    AND uc.is_excluded
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.user_course me
        WHERE me.course_id = p_course_id
          AND me.profiles_id = auth.uid()
      )
    );
$$;

REVOKE ALL ON FUNCTION public.course_excluded_profile_ids(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.course_excluded_profile_ids(integer) TO authenticated;
