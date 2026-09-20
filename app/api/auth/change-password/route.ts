import { NextRequest, NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getApiLocale } from "@/lib/i18n/api-locale";

type ChangePasswordBody = {
  newPassword?: string;
};

export async function POST(request: NextRequest) {
  const t = await getTranslations({
    locale: getApiLocale(request),
    namespace: "apiErrors.changePassword",
  });

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: t("notAuthenticated") }, { status: 401 });
  }

  const body = (await request.json()) as ChangePasswordBody;

  if (!body.newPassword || body.newPassword.length < 6) {
    return NextResponse.json({ error: t("passwordTooShort") }, { status: 400 });
  }

  // Runs under the caller's own session — the user is changing their own
  // password, which auth.updateUser permits for the currently signed-in user.
  const { error: updateAuthError } = await supabase.auth.updateUser({
    password: body.newPassword,
  });

  if (updateAuthError) {
    return NextResponse.json({ error: updateAuthError.message }, { status: 400 });
  }

  // profiles.must_change_password is locked to service-role writes only
  // (see supabase/migrations/20260920000000_add_edu_id_login.sql), so
  // clearing it here requires the admin client even though the caller has
  // already been verified as this exact user above.
  const admin = createSupabaseAdminClient();
  const { error: updateProfileError } = await admin
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", user.id);

  if (updateProfileError) {
    return NextResponse.json({ error: updateProfileError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
