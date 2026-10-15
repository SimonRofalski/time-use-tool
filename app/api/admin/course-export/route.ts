import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { hasLocale } from "next-intl";
import * as XLSX from "xlsx";
import { strToU8, unzipSync, zipSync } from "fflate";
import { routing } from "@/i18n/routing";
import { getApiLocale } from "@/lib/i18n/api-locale";
import { requireAdmin } from "@/lib/admin/auth";
import {
  buildCourseExport,
  MIN_PARTICIPANTS_FOR_EXPORT,
  type ExportMode,
  type ExportRow,
} from "@/lib/admin/course-export";
import { buildResearchExport } from "@/lib/admin/research-export";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/admin/course-export?courseId=123&mode=aggregiert|roh|forschung&format=xlsx|csv&locale=de|en
// aggregiert/roh: de-identified rows for one course (lib/admin/course-export.ts).
// forschung: pseudonymised sheets for research (lib/admin/research-export.ts).
//
// The file itself is built here and returned compressed (xlsx, or csv / zip of
// csv files): returning the rows as JSON exceeds Vercel's 4.5 MB response limit
// for larger courses. Errors are returned as JSON.

type Sheet = { name: string; rows: ExportRow[] };

function toWorksheet(rows: ExportRow[]): XLSX.WorkSheet {
  const headers = Object.keys(rows[0] ?? {});
  const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length, 14) }));
  return ws;
}

// Semicolon-separated with BOM, so Excel opens umlauts correctly
function toCsv(rows: ExportRow[]): string {
  return "﻿" + XLSX.utils.sheet_to_csv(toWorksheet(rows), { FS: ";" });
}

function fileResponse(sheets: Sheet[], format: "xlsx" | "csv"): NextResponse {
  if (format === "xlsx") {
    const wb = XLSX.utils.book_new();
    for (const sheet of sheets)
      // Excel limits sheet names to 31 characters
      XLSX.utils.book_append_sheet(wb, toWorksheet(sheet.rows), sheet.name.slice(0, 31));
    // An .xlsx is a zip; SheetJS' own `compression` option depends on the
    // runtime, so the archive is re-packed with fflate (≈10× smaller)
    const raw = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const body = zipSync(unzipSync(new Uint8Array(raw)), { level: 6 });
    return new NextResponse(body, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Cache-Control": "no-store",
      },
    });
  }

  if (sheets.length === 1) {
    return new NextResponse(toCsv(sheets[0].rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  // Several sheets as CSV → one zip with a file per sheet
  const zip = zipSync(
    Object.fromEntries(
      sheets.map((s) => [`${s.name}.csv`, strToU8(toCsv(s.rows))]),
    ),
  );
  return new NextResponse(zip, {
    headers: { "Content-Type": "application/zip", "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  // Explicit query param wins (what the page currently shows), cookie as fallback
  const requestedLocale = request.nextUrl.searchParams.get("locale");
  const locale = hasLocale(routing.locales, requestedLocale)
    ? requestedLocale
    : getApiLocale(request);
  const t = await getTranslations({ locale, namespace: "apiErrors.courseExport" });

  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const courseId = Number(searchParams.get("courseId"));
    const modeParam = searchParams.get("mode");
    const mode: ExportMode | "forschung" | null =
      modeParam === "aggregiert" || modeParam === "roh" || modeParam === "forschung"
        ? modeParam
        : null;
    const formatParam = searchParams.get("format");
    const format = formatParam === "csv" || formatParam === "xlsx" ? formatParam : null;

    if (!Number.isInteger(courseId) || courseId <= 0 || !mode || !format) {
      return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
    }

    const result =
      mode === "forschung"
        ? await buildResearchExport(auth.ctx.admin, courseId, locale)
        : await buildCourseExport(auth.ctx.admin, courseId, mode, locale);

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

    const sheets: Sheet[] =
      "sheets" in result
        ? result.sheets
        : [{ name: "Statistiken", rows: result.rows }];
    return fileResponse(sheets, format);
  } catch (error) {
    // Also catches a misconfigured deployment (e.g. missing
    // SUPABASE_SERVICE_ROLE_KEY) — details only in the server log
    console.error("admin course-export GET error", error);
    return NextResponse.json({ error: t("exportFailed") }, { status: 500 });
  }
}
