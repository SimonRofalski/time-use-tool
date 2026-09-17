import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { getApiLocale } from "@/lib/i18n/api-locale";
import { requireAdmin } from "@/lib/admin/auth";
import {
  buildCourseExport,
  MIN_PARTICIPANTS_FOR_EXPORT,
  type ExportMode,
} from "@/lib/admin/course-export";

export const dynamic = "force-dynamic";

// GET /api/admin/course-export?courseId=123&mode=aggregiert|roh&locale=de|en
// Returns de-identified export rows for one course (see lib/admin/course-export.ts).
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  // Explicit query param wins (what the page currently shows), cookie as fallback
  const requestedLocale = request.nextUrl.searchParams.get("locale");
  const locale = hasLocale(routing.locales, requestedLocale)
    ? requestedLocale
    : getApiLocale(request);
  const t = await getTranslations({ locale, namespace: "apiErrors.courseExport" });

  const { searchParams } = new URL(request.url);
  const courseId = Number(searchParams.get("courseId"));
  const modeParam = searchParams.get("mode");
  const mode: ExportMode | null =
    modeParam === "aggregiert" || modeParam === "roh" ? modeParam : null;

  if (!Number.isInteger(courseId) || courseId <= 0 || !mode) {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }

  try {
    const result = await buildCourseExport(auth.ctx.admin, courseId, mode, locale);

    if (!result.ok) {
      if (result.reason === "COURSE_NOT_FOUND") {
        return NextResponse.json(
          { error: t("courseNotFound") },
          { status: 404 },
        );
      }
      return NextResponse.json(
        {
          error: t("tooFewParticipants", {
            minimum: MIN_PARTICIPANTS_FOR_EXPORT,
            participants: result.participants,
          }),
          code: "TOO_FEW_PARTICIPANTS",
          participants: result.participants,
          minimum: MIN_PARTICIPANTS_FOR_EXPORT,
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      courseName: result.courseName,
      rows: result.rows,
      participants: result.participants,
      submittedDays: result.submittedDays,
    });
  } catch (error) {
    console.error("admin course-export GET error", error);
    return NextResponse.json({ error: t("exportFailed") }, { status: 500 });
  }
}
