import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { loadAdminStatistics } from "@/lib/admin/statistics";

export const dynamic = "force-dynamic";

// GET /api/admin/statistics
// Returns aggregated, cross-user statistics for the admin dashboard.
// Raw time entries are read server-side only; nothing per person is returned.
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const statistics = await loadAdminStatistics(auth.ctx.admin);
    return NextResponse.json(statistics);
  } catch (error) {
    console.error("admin statistics GET error", error);
    return NextResponse.json(
      { error: "Statistiken konnten nicht geladen werden." },
      { status: 500 },
    );
  }
}
