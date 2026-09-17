import { NextResponse, type NextRequest } from "next/server";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { getApiLocale } from "@/lib/i18n/api-locale";
import { requireAdmin } from "@/lib/admin/auth";
import { loadAdminStatistics } from "@/lib/admin/statistics";

export const dynamic = "force-dynamic";

// GET /api/admin/statistics?locale=de|en
// Returns aggregated, cross-user statistics for the admin dashboard.
// Raw time entries are read server-side only; nothing per person is returned.
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  // Explicit query param wins (what the page currently shows), cookie as fallback
  const requested = request.nextUrl.searchParams.get("locale");
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : getApiLocale(request);

  try {
    const statistics = await loadAdminStatistics(auth.ctx.admin, locale);
    return NextResponse.json(statistics);
  } catch (error) {
    console.error("admin statistics GET error", error);
    const t = await getTranslations({
      locale,
      namespace: "apiErrors.adminStatistics",
    });
    return NextResponse.json({ error: t("loadFailed") }, { status: 500 });
  }
}
