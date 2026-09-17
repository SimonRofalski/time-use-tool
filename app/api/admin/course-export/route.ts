import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import {
  buildCourseExport,
  MIN_PARTICIPANTS_FOR_EXPORT,
  type ExportMode,
} from "@/lib/admin/course-export";

export const dynamic = "force-dynamic";

// GET /api/admin/course-export?courseId=123&mode=aggregiert|roh
// Returns de-identified export rows for one course (see lib/admin/course-export.ts).
export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const courseId = Number(searchParams.get("courseId"));
  const modeParam = searchParams.get("mode");
  const mode: ExportMode | null =
    modeParam === "aggregiert" || modeParam === "roh" ? modeParam : null;

  if (!Number.isInteger(courseId) || courseId <= 0 || !mode) {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  try {
    const result = await buildCourseExport(auth.ctx.admin, courseId, mode);

    if (!result.ok) {
      if (result.reason === "COURSE_NOT_FOUND") {
        return NextResponse.json(
          { error: "Kurs nicht gefunden." },
          { status: 404 },
        );
      }
      return NextResponse.json(
        {
          error: `Export nicht möglich: Mindestens ${MIN_PARTICIPANTS_FOR_EXPORT} Teilnehmende mit abgegebenen Tagen sind nötig, damit einzelne Zeilen nicht einer Person zugeordnet werden können (aktuell ${result.participants}).`,
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
    return NextResponse.json(
      { error: "Export konnte nicht erstellt werden." },
      { status: 500 },
    );
  }
}
