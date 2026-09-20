-- ─── SWITCH edu-ID login support ──────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS auth_provider text NOT NULL DEFAULT 'password'
    CHECK (auth_provider IN ('password', 'switch_edu_id'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

-- Stable OIDC `sub` claim from SWITCH edu-ID, used to look up returning users
-- instead of relying on email (which can change on the IdP side).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS switch_edu_id_sub text UNIQUE;

-- ─── Protect auth-state columns from being changed by ordinary client calls ───
-- "Users can update own profile" (20260405000000_add_profile_names.sql) has no
-- column restriction, so without this trigger a user could flip
-- must_change_password back to false themselves (or forge auth_provider /
-- switch_edu_id_sub) via a normal supabase-js call on their own row. Only
-- server-side code using the service-role client (admin API routes, the OIDC
-- callback, the change-password route) may change these three columns.

CREATE OR REPLACE FUNCTION public.protect_profiles_auth_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    NEW.auth_provider := OLD.auth_provider;
    NEW.must_change_password := OLD.must_change_password;
    NEW.switch_edu_id_sub := OLD.switch_edu_id_sub;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profiles_auth_fields ON public.profiles;
CREATE TRIGGER trg_protect_profiles_auth_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profiles_auth_fields();

-- ─── Admin write access to profiles (delete/update via service role today; ────
--     these policies are defense-in-depth for any future direct-client use) ──

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
CREATE POLICY "Admins can delete profiles"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ─── Extend the existing (previously unused) admin password-reset audit log ───
-- to also cover admin-created accounts, instead of adding a new table.

ALTER TABLE public.admin_password_reset_log
  ADD COLUMN IF NOT EXISTS action text NOT NULL DEFAULT 'admin_set_password'
    CHECK (action IN ('admin_set_password', 'admin_created_account'));

-- ─── Ensure deleting an auth.users row cascades to profiles ──────────────────
-- profiles was created outside the tracked migration history, so its FK to
-- auth.users isn't visible in this repo. Detect it and make sure it cascades,
-- so admin-triggered user deletion (auth.admin.deleteUserById) cleans up
-- profiles (and everything FK'd to profiles.id) without manual cleanup.

DO $$
DECLARE
  fk_name text;
  fk_delete_rule text;
BEGIN
  SELECT tc.constraint_name, rc.delete_rule
    INTO fk_name, fk_delete_rule
  FROM information_schema.table_constraints tc
  JOIN information_schema.referential_constraints rc
    ON rc.constraint_name = tc.constraint_name
   AND rc.constraint_schema = tc.constraint_schema
  JOIN information_schema.key_column_usage kcu
    ON kcu.constraint_name = tc.constraint_name
   AND kcu.constraint_schema = tc.constraint_schema
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
   AND ccu.constraint_schema = tc.constraint_schema
  WHERE tc.table_schema = 'public'
    AND tc.table_name = 'profiles'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'id'
    AND ccu.table_schema = 'auth'
    AND ccu.table_name = 'users'
  LIMIT 1;

  IF fk_name IS NULL THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  ELSIF fk_delete_rule IS DISTINCT FROM 'CASCADE' THEN
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', fk_name);
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;
