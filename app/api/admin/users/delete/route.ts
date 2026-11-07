import { NextRequest, NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/admin/auth";
import { getApiLocale } from "@/lib/i18n/api-locale";

type DeleteUserBody = {
  userId?: string;
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

  const body = (await request.json()) as DeleteUserBody;

  if (!body.userId) {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }

  if (body.userId === adminUserId) {
    return NextResponse.json({ error: t("cannotDeleteSelf") }, { status: 400 });
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(body.userId);

  if (deleteError) {
    // Postgres foreign-key violations surface here if some table referencing
    // profiles.id doesn't cascade — report clearly instead of a bare 500.
    const status = deleteError.message.toLowerCase().includes("foreign key")
      ? 409
      : 400;
    return NextResponse.json(
      { error: deleteError.message || t("deleteFailed") },
      { status },
    );
  }

  return NextResponse.json({ success: true });
}
