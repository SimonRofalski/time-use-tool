import { NextRequest, NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/admin/auth";
import { getApiLocale } from "@/lib/i18n/api-locale";

type CreateUserBody = {
  email?: string;
  firstName?: string;
  lastName?: string;
  temporaryPassword?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  const body = (await request.json()) as CreateUserBody;

  if (!body.email || !EMAIL_PATTERN.test(body.email)) {
    return NextResponse.json({ error: t("invalidEmail") }, { status: 400 });
  }

  if (!body.temporaryPassword || body.temporaryPassword.length < 6) {
    return NextResponse.json({ error: t("passwordTooShort") }, { status: 400 });
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: body.email,
    password: body.temporaryPassword,
    email_confirm: true,
  });

  if (createError || !created?.user) {
    return NextResponse.json(
      { error: createError?.message ?? t("createFailed") },
      { status: 400 },
    );
  }

  const { error: updateProfileError } = await admin
    .from("profiles")
    .update({
      auth_provider: "password",
      must_change_password: true,
      ...(body.firstName ? { first_name: body.firstName } : {}),
      ...(body.lastName ? { last_name: body.lastName } : {}),
    })
    .eq("id", created.user.id);

  if (updateProfileError) {
    return NextResponse.json({ error: updateProfileError.message }, { status: 500 });
  }

  await admin.from("admin_password_reset_log").insert({
    target_profile_id: created.user.id,
    triggered_by_profile_id: adminUserId,
    action: "admin_created_account",
  });

  return NextResponse.json({ success: true, userId: created.user.id });
}
