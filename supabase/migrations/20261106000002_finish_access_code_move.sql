-- ─── Finish moving course access codes (run AFTER the new app is deployed) ──
-- Requires 20261106000001_security_hardening.sql. Running this while the old
-- app version is still live would break enrollment and the admin course view
-- (both still read course."accessCode").

-- Pick up codes created/changed in the old app since 20261106000001 ran
INSERT INTO public.course_access_code (course_id, access_code)
SELECT course_id, "accessCode"
FROM public.course
WHERE "accessCode" IS NOT NULL AND btrim("accessCode") <> ''
ON CONFLICT (course_id) DO UPDATE SET access_code = EXCLUDED.access_code;

ALTER TABLE public.course DROP COLUMN IF EXISTS "accessCode";

-- Enrollment now only goes through app/api/courses/enroll (service role, checks
-- the code). Remove every INSERT policy on user_course so users can no longer
-- enroll themselves into any course without a code via a direct API call.
-- (The original policy was created in the dashboard, so its name is unknown.)
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_course' AND cmd = 'INSERT'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.user_course', pol.policyname);
  END LOOP;
END $$;

-- Check: remaining policies on user_course (expected: no INSERT and no ALL
-- policy for normal users). The result is shown in the SQL editor.
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'user_course'
ORDER BY cmd, policyname;
