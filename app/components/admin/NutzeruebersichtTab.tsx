"use client";

import { useState, useEffect, useMemo } from "react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { totalPeriodDays } from "@/lib/course-periods";
import ConfirmModal from "./ConfirmModal";

// ─── Types ────────────────────────────────────────────────────────────────────

type UserRow = {
  userId: string;
  userCourseId: string | null;
  email: string;
  firstName: string | null;
  lastName: string | null;
  courseName: string | null;
  courseTotalDays: number;
  submittedDays: number;
  isExcluded: boolean;
};

type Kpis = {
  totalUsers: number;
  totalSubmittedDays: number;
  avgCompletionRate: number; // 0–100, average across users who started at least one day
};

type ConfirmModalState = {
  title: string;
  message: string;
  variant: "danger" | "warning" | "default";
  confirmLabel: string;
  onConfirm: () => void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function courseDurationDays(start: string, end: string): number {
  return (
    Math.round(
      (new Date(end).getTime() - new Date(start).getTime()) / 86_400_000,
    ) + 1
  );
}

function displayName(u: UserRow): string {
  if (u.firstName || u.lastName) {
    return [u.firstName, u.lastName].filter(Boolean).join(" ");
  }
  return u.email;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function NutzeruebersichtTab() {
  const t = useTranslations("nutzeruebersicht");
  const supabase = getSupabaseBrowserClient();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(
    null,
  );

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    setError("");

    // All active profiles (requires the admin RLS policy from the migration)
    const { data: profiles, error: profilesErr } = await supabase
      .from("profiles")
      .select("id, email, first_name, last_name")
      .eq("is_active", true);

    if (profilesErr || !profiles) {
      setError(t("loadError"));
      setIsLoading(false);
      return;
    }

    // Fetch enrollments with course name + dates + periods for total-days calculation
    const { data: userCourses } = await supabase
      .from("user_course")
      .select(
        "user_course_id, profiles_id, is_excluded, course:course_id(name, start_date, end_date, course_period(start_date, end_date))",
      );

    const courseInfoByUser: Record<
      string,
      {
        name: string;
        totalDays: number;
        userCourseId: string;
        isExcluded: boolean;
      }
    > = {};
    for (const uc of userCourses ?? []) {
      const courseRaw = uc.course as unknown;
      let courseName: string | null = null;
      let totalDays = 0;

      const extractCourse = (c: {
        name: string;
        start_date: string;
        end_date: string;
        course_period?: { start_date: string; end_date: string }[] | null;
      }) => {
        courseName = c.name;
        const coursePeriods = c.course_period ?? [];
        totalDays =
          coursePeriods.length > 0
            ? totalPeriodDays(coursePeriods)
            : courseDurationDays(c.start_date, c.end_date);
      };

      if (courseRaw && typeof courseRaw === "object" && "name" in courseRaw) {
        extractCourse(
          courseRaw as {
            name: string;
            start_date: string;
            end_date: string;
            course_period?: { start_date: string; end_date: string }[];
          },
        );
      } else if (Array.isArray(courseRaw) && courseRaw.length > 0) {
        extractCourse(
          courseRaw[0] as {
            name: string;
            start_date: string;
            end_date: string;
            course_period?: { start_date: string; end_date: string }[];
          },
        );
      }

      if (uc.profiles_id && courseName) {
        courseInfoByUser[uc.profiles_id] = {
          name: courseName,
          totalDays,
          userCourseId: uc.user_course_id,
          isExcluded: uc.is_excluded ?? false,
        };
      }
    }

    // All day records to compute per-user submitted counts and the KPI (paged)
    const allDays = await fetchAllRows<{
      profiles_id: string;
      is_submitted: boolean;
    }>((from, to) =>
      supabase
        .from("day")
        .select("profiles_id, is_submitted")
        .order("day_id")
        .range(from, to),
    );

    const submittedByUser: Record<string, number> = {};
    const totalDaysByUser: Record<string, number> = {};
    let totalSubmittedDays = 0;

    for (const d of allDays) {
      totalDaysByUser[d.profiles_id] =
        (totalDaysByUser[d.profiles_id] ?? 0) + 1;
      if (d.is_submitted) {
        submittedByUser[d.profiles_id] =
          (submittedByUser[d.profiles_id] ?? 0) + 1;
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
            }, 0) / usersWhoStarted.length,
          )
        : 0;

    setKpis({
      totalUsers: profiles.length,
      totalSubmittedDays,
      avgCompletionRate,
    });

    setUsers(
      profiles.map((p) => {
        const info = courseInfoByUser[p.id];
        return {
          userId: p.id,
          userCourseId: info?.userCourseId ?? null,
          email: p.email ?? p.id.slice(0, 8) + "…",
          firstName: p.first_name ?? null,
          lastName: p.last_name ?? null,
          courseName: info?.name ?? null,
          courseTotalDays: info?.totalDays ?? 0,
          submittedDays: submittedByUser[p.id] ?? 0,
          isExcluded: info?.isExcluded ?? false,
        };
      }),
    );

    setIsLoading(false);
  }

  async function handleToggleExclude(user: UserRow) {
    if (!user.userCourseId) return;

    const nowExcluded = !user.isExcluded;
    const { error } = await supabase
      .from("user_course")
      .update({ is_excluded: nowExcluded })
      .eq("user_course_id", user.userCourseId);

    if (!error) {
      setUsers((prev) =>
        prev.map((u) =>
          u.userId === user.userId ? { ...u, isExcluded: nowExcluded } : u,
        ),
      );
    }
    setConfirmModal(null);
  }

  function openExcludeModal(user: UserRow) {
    if (user.isExcluded) {
      setConfirmModal({
        title: t("includeConfirm.title"),
        message: t("includeConfirm.message", { name: displayName(user) }),
        variant: "default",
        confirmLabel: t("includeConfirm.confirmLabel"),
        onConfirm: () => void handleToggleExclude(user),
      });
    } else {
      setConfirmModal({
        title: t("excludeConfirm.title"),
        message: t("excludeConfirm.message", { name: displayName(user) }),
        variant: "warning",
        confirmLabel: t("excludeConfirm.confirmLabel"),
        onConfirm: () => void handleToggleExclude(user),
      });
    }
  }

  // Filter applied client-side — searches name, email and course name
  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const name = [u.firstName, u.lastName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return (
        name.includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.courseName?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [users, searchQuery]);

  // ── Render ────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-slate-500">{t("loading")}</p>
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
    <>
      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          variant={confirmModal.variant}
          confirmLabel={confirmModal.confirmLabel}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}

      <div className="space-y-6">
        {/* KPI cards */}
        {kpis && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {t("kpis.activeUsers")}
              </p>
              <p className="mt-2 text-3xl font-bold text-slate-800 dark:text-slate-100">
                {kpis.totalUsers}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {t("kpis.completedDays")}
              </p>
              <p className="mt-2 text-3xl font-bold text-slate-800 dark:text-slate-100">
                {kpis.totalSubmittedDays}
              </p>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                {t("kpis.completedDaysSubtitle")}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {t("kpis.avgCompletionRate")}
              </p>
              <p className="mt-2 text-3xl font-bold text-slate-800 dark:text-slate-100">
                {kpis.avgCompletionRate}%
              </p>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                {t("kpis.avgCompletionRateSubtitle")}
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
            placeholder={t("searchPlaceholder")}
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>

        {/* Mobile user cards */}
        <div className="space-y-3 md:hidden">
          {filteredUsers.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500">
              {searchQuery.trim() ? t("noUserFound") : t("noActiveUsers")}
            </div>
          ) : (
            filteredUsers.map((u) => (
              <div
                key={u.userId}
                className={`rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 ${
                  u.isExcluded ? "opacity-50" : ""
                }`}
              >
                <div className="space-y-1">
                  {u.firstName || u.lastName ? (
                    <>
                      <p className="break-words font-medium text-slate-800 dark:text-slate-100">
                        {displayName(u)}
                      </p>
                      <p className="break-all text-xs text-slate-400 dark:text-slate-500">
                        {u.email}
                      </p>
                    </>
                  ) : (
                    <p className="break-all font-medium text-slate-800 dark:text-slate-100">
                      {u.email}
                    </p>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      {t("courseLabel")}
                    </p>
                    <p className="mt-1 break-words text-slate-600 dark:text-slate-300">
                      {u.courseName ?? t("noCoursePlaceholder")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      {t("progressLabel")}
                    </p>
                    <p className="mt-1 break-words text-slate-600 dark:text-slate-300">
                      {u.courseTotalDays > 0
                        ? t("progressDaysLabel", {
                            submitted: u.submittedDays,
                            total: u.courseTotalDays,
                          })
                        : u.submittedDays}
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  {u.userCourseId && (
                    <button
                      type="button"
                      onClick={() => openExcludeModal(u)}
                      className={`w-full rounded-lg border px-3 py-2 text-xs font-medium transition ${
                        u.isExcluded
                          ? "border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:border-slate-700 dark:text-slate-400"
                          : "border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-900/20"
                      }`}
                    >
                      {u.isExcluded ? t("includeButton") : t("excludeButton")}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop user table */}
        <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left dark:border-slate-800 dark:bg-slate-800/50">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t("table.user")}
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t("table.course")}
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t("table.progress")}
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t("table.actions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500"
                  >
                    {searchQuery.trim() ? t("noUserFound") : t("noActiveUsers")}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr
                    key={u.userId}
                    className={`transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                      u.isExcluded ? "opacity-50" : ""
                    }`}
                  >
                    {/* Name + email */}
                    <td className="px-4 py-3">
                      {u.firstName || u.lastName ? (
                        <>
                          <p className="font-medium text-slate-800 dark:text-slate-100">
                            {displayName(u)}
                          </p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">
                            {u.email}
                          </p>
                        </>
                      ) : (
                        <p className="font-medium text-slate-800 dark:text-slate-100">
                          {u.email}
                        </p>
                      )}
                    </td>

                    {/* Course */}
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {u.courseName ?? (
                        <span className="text-slate-300 dark:text-slate-600">
                          {t("noCoursePlaceholder")}
                        </span>
                      )}
                    </td>

                    {/* X / Y progress */}
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {u.courseTotalDays > 0 ? (
                        <span>
                          {u.submittedDays}{" "}
                          <span className="text-slate-400 dark:text-slate-500">
                            / {u.courseTotalDays} {t("daysUnit")}
                          </span>
                        </span>
                      ) : (
                        u.submittedDays
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {u.userCourseId && (
                          <button
                            type="button"
                            onClick={() => openExcludeModal(u)}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                              u.isExcluded
                                ? "border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:border-slate-700 dark:text-slate-400"
                                : "border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-900/20"
                            }`}
                          >
                            {u.isExcluded ? t("includeButton") : t("excludeButton")}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
