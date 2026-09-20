import { NextRequest, NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/admin/auth";
import { getApiLocale } from "@/lib/i18n/api-locale";

type SetPasswordBody = {
  userId?: string;
  temporaryPassword?: string;
  force?: boolean;
};

export async function POST(request: NextRequest) {
  const t = await getTranslations({
    locale: getApiLocale(request),
    namespace: "apiErrors.adminUsers",
  });

  const guard = await requireAdmin();
  if (!guard.ok) {
    return guard.response;
  }
  const { admin, userId: adminUserId } = guard.ctx;

  const body = (await request.json()) as SetPasswordBody;

  if (!body.userId) {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }

  if (!body.temporaryPassword || body.temporaryPassword.length < 6) {
    return NextResponse.json({ error: t("passwordTooShort") }, { status: 400 });
  }

  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("auth_provider")
    .eq("id", body.userId)
    .maybeSingle();

  if (targetError || !target) {
    return NextResponse.json({ error: t("userNotFound") }, { status: 404 });
  }

  if (target.auth_provider === "switch_edu_id" && !body.force) {
    return NextResponse.json(
      { error: t("switchEduIdAccountNeedsForce") },
      { status: 409 },
    );
  }

  const { error: updateAuthError } = await admin.auth.admin.updateUserById(
    body.userId,
    { password: body.temporaryPassword },
  );

  if (updateAuthError) {
    return NextResponse.json({ error: updateAuthError.message }, { status: 400 });
  }

  const { error: updateProfileError } = await admin
    .from("profiles")
    .update({
      must_change_password: true,
      ...(target.auth_provider === "switch_edu_id" && body.force
        ? { auth_provider: "password" }
        : {}),
    })
    .eq("id", body.userId);

  if (updateProfileError) {
    return NextResponse.json({ error: updateProfileError.message }, { status: 500 });
  }

  await admin.from("admin_password_reset_log").insert({
    target_profile_id: body.userId,
    triggered_by_profile_id: adminUserId,
    action: "admin_set_password",
  });

  return NextResponse.json({ success: true });
}
