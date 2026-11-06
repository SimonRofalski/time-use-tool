import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";

// ─── Course enrollment with access code ──────────────────────────────────────
// The access codes live in course_access_code, which only admins can read
// (migration 20261106000001_security_hardening.sql), and users have no INSERT
// policy on user_course (20261106000002). So the code check and the insert
// both happen here with the service-role client — never in the browser.
//
// Returns { error: "<code>" } on failure; EnrollmentModal maps the code to a
// translated message.

type EnrollBody = {
  courseId?: number;
  accessCode?: string;
};

function fail(code: string, status: number) {
  return NextResponse.json({ error: code }, { status });
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("not_authenticated", 401);

  const body = (await request.json().catch(() => ({}))) as EnrollBody;
  const courseId = Number(body.courseId);
  const accessCode = body.accessCode?.trim() ?? "";
  if (!Number.isInteger(courseId) || !accessCode) {
    return fail("invalid_request", 400);
  }

  const admin = createSupabaseAdminClient();

  const { data: course, error: courseError } = await admin
    .from("course")
    .select("course_id, is_locked")
    .eq("course_id", courseId)
    .maybeSingle();
  if (courseError) return fail("course_load_failed", 500);
  // Locked courses aren't offered in the enrollment list either
  if (!course || course.is_locked) return fail("invalid_code", 400);

  const { data: codeRow, error: codeError } = await admin
    .from("course_access_code")
    .select("access_code")
    .eq("course_id", courseId)
    .maybeSingle();
  if (codeError) return fail("course_load_failed", 500);
  if (!codeRow || codeRow.access_code.trim() !== accessCode) {
    return fail("invalid_code", 400);
  }

  // Already enrolled in this course (e.g. double click / second tab) → success
  const { data: existing } = await admin
    .from("user_course")
    .select("user_course_id")
    .eq("profiles_id", user.id)
    .eq("course_id", courseId)
    .maybeSingle();
  if (existing) return NextResponse.json({ success: true });

  const { error: insertError } = await admin
    .from("user_course")
    .insert({ profiles_id: user.id, course_id: courseId });
  if (insertError) return fail("enroll_failed", 500);

  return NextResponse.json({ success: true });
}
