"use client";

import { useState, useEffect, useMemo } from "react";
import { Search } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

// ─── Types ────────────────────────────────────────────────────────────────────

type UserRow = {
  userId: string;
  email: string;
  courseName: string | null;
  submittedDays: number;
};

type Kpis = {
  totalUsers: number;
  totalSubmittedDays: number;
  avgCompletionRate: number; // 0–100, average across users who started at least one day
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function NutzeruebersichtTab() {
  const supabase = getSupabaseBrowserClient();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    setError("");

    // All active profiles (requires the admin RLS policy from the migration)
    const { data: profiles, error: profilesErr } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("is_active", true);

    if (profilesErr || !profiles) {
      setError("Nutzerdaten konnten nicht geladen werden.");
      setIsLoading(false);
      return;
    }

    // Fetch enrollments with course names in one query via PostgREST FK join
    const { data: userCourses } = await supabase
      .from("user_course")
      .select("profiles_id, course:course_id(name)");

    const courseNameByUser: Record<string, string> = {};
    for (const uc of userCourses ?? []) {
      const courseRaw = uc.course as unknown;
      const courseName =
        courseRaw && typeof courseRaw === "object" && "name" in courseRaw
          ? (courseRaw as { name: string }).name
          : Array.isArray(courseRaw) && courseRaw.length > 0
          ? (courseRaw[0] as { name: string }).name
          : null;
      if (uc.profiles_id && courseName) {
        courseNameByUser[uc.profiles_id] = courseName;
      }
    }

    // All day records to compute per-user submitted counts and the KPI
    const { data: allDays } = await supabase
      .from("day")
      .select("profiles_id, is_submitted");

    const submittedByUser: Record<string, number> = {};
    const totalDaysByUser: Record<string, number> = {};
    let totalSubmittedDays = 0;

    for (const d of allDays ?? []) {
      totalDaysByUser[d.profiles_id] = (totalDaysByUser[d.profiles_id] ?? 0) + 1;
      if (d.is_submitted) {
        submittedByUser[d.profiles_id] = (submittedByUser[d.profiles_id] ?? 0) + 1;
        totalSubmittedDays++;
      }
    }

    // Ø Abschlussquote: average per-user completion among users who started at least one day
    const usersWhoStarted = Object.keys(totalDaysByUser);
    const avgCompletionRate =
      usersWhoStarted.length > 0
        ? Math.round(
            usersWhoStarted.reduce((sum, uid) => {
              const submitted = submittedByUser[uid] ?? 0;
              return sum + (submitted / totalDaysByUser[uid]) * 100;
            }, 0) / usersWhoStarted.length
          )
        : 0;

    setKpis({
      totalUsers: profiles.length,
      totalSubmittedDays,
      avgCompletionRate,
    });

    setUsers(
      profiles.map((p) => ({
        userId: p.id,
        email: p.email ?? p.id.slice(0, 8) + "…",
        courseName: courseNameByUser[p.id] ?? null,
        submittedDays: submittedByUser[p.id] ?? 0,
      }))
    );

    setIsLoading(false);
  }

  // Filter applied client-side — searches email and course name
  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.courseName?.toLowerCase().includes(q) ?? false)
    );
  }, [users, searchQuery]);

  // ── Render ────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-slate-500">Wird geladen…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      {kpis && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Aktive Nutzer
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-800 dark:text-slate-100">
              {kpis.totalUsers}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Abgeschlossene Tage
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-800 dark:text-slate-100">
              {kpis.totalSubmittedDays}
            </p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Gesamt aller Nutzer</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Ø Abschlussquote
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-800 dark:text-slate-100">
              {kpis.avgCompletionRate}%
            </p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Ø aller gestarteten Nutzer
            </p>
          </div>
        </div>
      )}

      {/* Search bar */}
      <div className="relative">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Nutzer suchen…"
          className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </div>

      {/* User table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left dark:border-slate-800 dark:bg-slate-800/50">
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                E-Mail
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Kurs
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Abgeschl. Tage
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredUsers.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500"
                >
                  {searchQuery.trim() ? "Kein Nutzer gefunden." : "Keine aktiven Nutzer vorhanden."}
                </td>
              </tr>
            ) : (
              filteredUsers.map((u) => (
                <tr
                  key={u.userId}
                  className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">
                    {u.email}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {u.courseName ?? (
                      <span className="text-slate-300 dark:text-slate-600">–</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {u.submittedDays}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
