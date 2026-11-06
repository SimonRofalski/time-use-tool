-- ─── Close privilege escalation via "Users can update own profile" ──────────
-- The policy from 20260405000000_add_profile_names.sql has no column
-- restriction, and protect_profiles_auth_fields (20260920000000_add_edu_id_login.sql)
-- only froze auth_provider / must_change_password / switch_edu_id_sub. Through
-- a normal supabase-js call on their own row a user could therefore still:
--   - set role = 'admin' (full admin UI + admin RLS policies), or
--   - set email to someone else's address, which edu-ID account linking
--     (lib/oidc/provision.ts) and the security-question password reset
--     (app/api/password-reset/*) both look up -> account takeover.
-- The browser only ever writes first_name, last_name, locale and
-- tutorial_completed_at; everything else is written server-side with the
-- service role (admin API routes, OIDC callback, change-password).
--
-- Only requests coming through PostgREST (session_user = 'authenticator')
-- without the service role are restricted. Dashboard / SQL editor edits
-- (session_user postgres/supabase_admin) and GoTrue's own writes such as the
-- on_auth_user_email_sync trigger (session_user supabase_auth_admin) keep
-- working - inside this SECURITY DEFINER function current_user is the owner,
-- but session_user is still the connecting role.

CREATE OR REPLACE FUNCTION public.protect_profiles_auth_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF session_user = 'authenticator'
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    NEW.auth_provider := OLD.auth_provider;
    NEW.must_change_password := OLD.must_change_password;
    NEW.switch_edu_id_sub := OLD.switch_edu_id_sub;
    NEW.role := OLD.role;
    NEW.email := OLD.email;
    NEW.is_active := OLD.is_active;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger itself is unchanged (created in 20260920000000_add_edu_id_login.sql);
-- re-created here so this file is self-contained.
DROP TRIGGER IF EXISTS trg_protect_profiles_auth_fields ON public.profiles;
CREATE TRIGGER trg_protect_profiles_auth_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profiles_auth_fields();
