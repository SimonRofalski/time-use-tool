"use client";

import { useState, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/routing";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Download,
  Plus,
  ShieldCheck,
  X,
} from "lucide-react";
import * as XLSX from "xlsx";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import ConfirmModal from "./ConfirmModal";
import {
  type CoursePeriod,
  getPeriodDates,
  getSinglePeriodDates,
  totalPeriodDays,
  periodsDurationLabel,
  formatPeriodLabel,
  validatePeriodsNoOverlap,
} from "@/lib/course-periods";

// ─── Datenschutz (Ergebnis der Ethikprüfung) ──────────────────────────────────
// Admins dürfen die Zuordnung von Zeitnutzungsdaten zu Personen nicht einsehen.
// Pro Person ist deshalb ausschliesslich sichtbar: Name/E-Mail (bzw. Alias) und
// pro Kurstag ein true/false ("abgeschlossen"). Keine Zeiteinträge, keine
// Tätigkeiten, keine persönliche Zeitverteilung. Exporte werden serverseitig
// de-identifiziert erzeugt (siehe lib/admin/course-export.ts).

// ─── Types ────────────────────────────────────────────────────────────────────

type PeriodInput = { start: string; end: string };

type CoursePeriodRow = Pick<
  CoursePeriod,
  "course_period_id" | "start_date" | "end_date" | "sort_order"
>;

type CourseRow = {
  course_id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_locked: boolean;
  accessCode: string | null;
  anonymized_at: string | null;
  comparison_enabled: boolean;
  ask_extra_ratings: boolean;
  ask_day_questionnaire: boolean;
  userCount: number;
  periods: CoursePeriodRow[];
};

type EnrolledUser = {
  userCourseId: string;
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  alias: string | null;
  isExcluded: boolean;
  submittedDays: number;
  // Submitted days whose day questionnaire is answered (flag only, no answers)
  answeredDayQuestionnaires: number;
  courseTotalDays: number;
};

// One course day for a participant — only completion flags, nothing else
type DayStatusRow = {
  date: string; // "YYYY-MM-DD"
  isSubmitted: boolean;
  dayQuestionnaireCompleted: boolean;
};

type ExportRow = Record<string, string | number>;

// Drill-down navigation state for the "Alle Kurse" sub-tab
type DrillView =
  | { type: "list" }
  | {
      type: "course";
      courseId: number;
      courseName: string;
      courseTotalDays: number;
      isAnonymized: boolean;
      isComparisonEnabled: boolean;
    }
  | {
      type: "user";
      courseId: number;
      courseName: string;
      courseTotalDays: number;
      isAnonymized: boolean;
      isComparisonEnabled: boolean;
      userId: string;
      userDisplayName: string;
    };

type ConfirmModalState = {
  title: string;
  message: string;
  variant: "danger" | "warning" | "default";
  confirmLabel: string;
  onConfirm: () => void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateString: string, locale: Locale): string {
  return new Date(dateString).toLocaleDateString(
    locale === "en" ? "en-US" : "de-DE",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    },
  );
}

function courseDurationDays(startDate: string, endDate: string): number {
  return (
    Math.round(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) /
        86_400_000,
    ) + 1
  );
}

function courseDurationLabel(
  startDate: string,
  endDate: string,
  locale: Locale,
): string {
  const days = courseDurationDays(startDate, endDate);
  const dayLabel =
    locale === "en" ? `day${days !== 1 ? "s" : ""}` : `Tag${days !== 1 ? "e" : ""}`;
  return `${days} ${dayLabel}`;
}

function userDisplayName(user: EnrolledUser, isAnonymized: boolean): string {
  if (isAnonymized && user.alias) return user.alias;
  if (user.firstName || user.lastName) {
    return [user.firstName, user.lastName].filter(Boolean).join(" ");
  }
  return user.email;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function KursuebersichtTab() {
  const t = useTranslations("kursuebersicht");
  const locale = useLocale() as Locale;
  const supabase = getSupabaseBrowserClient();

  const [subTab, setSubTab] = useState<"alle" | "neu">("alle");
  const [view, setView] = useState<DrillView>({ type: "list" });

  // ── "Neuer Kurs" form ───────────────────────────────────────────────────────
  const [newName, setNewName] = useState("");
  const [newPeriods, setNewPeriods] = useState<PeriodInput[]>([
    { start: "", end: "" },
  ]);
  const [newAccessCode, setNewAccessCode] = useState("");
  const [newAskExtraRatings, setNewAskExtraRatings] = useState(false);
  const [newAskDayQuestionnaire, setNewAskDayQuestionnaire] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState(false);

  // ── "Alle Kurse" list ───────────────────────────────────────────────────────
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(false);
  const [coursesError, setCoursesError] = useState("");

  // ── Course detail (users enrolled in a course) ──────────────────────────────
  const [courseUsers, setCourseUsers] = useState<EnrolledUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  // ── User detail (per-day completion status only) ────────────────────────────
  const [userDays, setUserDays] = useState<DayStatusRow[]>([]);
  const [isLoadingDays, setIsLoadingDays] = useState(false);

  // ── Modals & inline edits ───────────────────────────────────────────────────
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(
    null,
  );
  const [editingAccessCode, setEditingAccessCode] = useState<{
    courseId: number;
    value: string;
  } | null>(null);
  const [isAnonymizing, setIsAnonymizing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportGranularity, setExportGranularity] = useState<
    "aggregiert" | "roh"
  >("aggregiert");
  const [exportError, setExportError] = useState("");

  useEffect(() => {
    if (subTab === "alle" && view.type === "list") {
      void loadCourses();
    }
  }, [subTab, view.type]);

  // ── Data loaders ──────────────────────────────────────────────────────────────

  async function loadCourses() {
    setIsLoadingCourses(true);
    setCoursesError("");

    const { data: courseData, error: courseErr } = await supabase
      .from("course")
      .select(
        "course_id, name, start_date, end_date, is_locked, accessCode, anonymized_at, comparison_enabled, ask_extra_ratings, ask_day_questionnaire",
      )
      .order("start_date", { ascending: false });

    if (courseErr || !courseData) {
      setCoursesError(t("errors.coursesLoadError"));
      setIsLoadingCourses(false);
      return;
    }

    // Count enrolled users per course client-side
    const { data: userCourseData } = await supabase
      .from("user_course")
      .select("course_id");

    const countByCourse: Record<number, number> = {};
    for (const row of userCourseData ?? []) {
      countByCourse[row.course_id] = (countByCourse[row.course_id] ?? 0) + 1;
    }

    // Load all periods for all courses in one query and group by course_id
    const { data: periodsData } = await supabase
      .from("course_period")
      .select("course_period_id, course_id, start_date, end_date, sort_order")
      .order("sort_order", { ascending: true });

    const periodsByCourse: Record<number, CoursePeriodRow[]> = {};
    for (const p of periodsData ?? []) {
      if (!periodsByCourse[p.course_id]) periodsByCourse[p.course_id] = [];
      periodsByCourse[p.course_id].push(p);
    }

    setCourses(
      courseData.map((c) => ({
        ...c,
        userCount: countByCourse[c.course_id] ?? 0,
        periods: periodsByCourse[c.course_id] ?? [],
      })),
    );
    setIsLoadingCourses(false);
  }

  async function loadCourseUsers(courseId: number, courseTotalDays: number) {
    setIsLoadingUsers(true);
    setCourseUsers([]);

    const { data: enrollments } = await supabase
      .from("user_course")
      .select("user_course_id, profiles_id, is_excluded, alias")
      .eq("course_id", courseId);

    const userIds = (enrollments ?? []).map((e) => e.profiles_id);
    if (userIds.length === 0) {
      setIsLoadingUsers(false);
      return;
    }

    const [profilesRes, submittedDays] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, email, first_name, last_name")
        .in("id", userIds),
      // Paged: large courses exceed the 1000-row cap
      fetchAllRows<{
        profiles_id: string;
        day_questionnaire_completed: boolean;
      }>((from, to) =>
        supabase
          .from("day")
          .select("profiles_id, day_questionnaire_completed")
          .eq("course_id", courseId)
          .eq("is_submitted", true)
          .order("day_id")
          .range(from, to),
      ),
    ]);

    const profileById: Record<
      string,
      { email: string; firstName: string | null; lastName: string | null }
    > = {};
    for (const p of profilesRes.data ?? []) {
      profileById[p.id] = {
        email: p.email ?? p.id.slice(0, 8) + "…",
        firstName: p.first_name ?? null,
        lastName: p.last_name ?? null,
      };
    }

    const submittedByUser: Record<string, number> = {};
    const answeredByUser: Record<string, number> = {};
    for (const d of submittedDays) {
      submittedByUser[d.profiles_id] =
        (submittedByUser[d.profiles_id] ?? 0) + 1;
      if (d.day_questionnaire_completed) {
        answeredByUser[d.profiles_id] =
          (answeredByUser[d.profiles_id] ?? 0) + 1;
      }
    }

    const ucById: Record<
      string,
      { userCourseId: string; isExcluded: boolean; alias: string | null }
    > = {};
    for (const e of enrollments ?? []) {
      ucById[e.profiles_id] = {
        userCourseId: e.user_course_id,
        isExcluded: e.is_excluded ?? false,
        alias: e.alias ?? null,
      };
    }

    setCourseUsers(
      userIds.map((id) => ({
        userCourseId: ucById[id]?.userCourseId ?? "",
        userId: id,
        email: profileById[id]?.email ?? id.slice(0, 8) + "…",
        firstName: profileById[id]?.firstName ?? null,
        lastName: profileById[id]?.lastName ?? null,
        alias: ucById[id]?.alias ?? null,
        isExcluded: ucById[id]?.isExcluded ?? false,
        submittedDays: submittedByUser[id] ?? 0,
        answeredDayQuestionnaires: answeredByUser[id] ?? 0,
        courseTotalDays,
      })),
    );
    setIsLoadingUsers(false);
  }

  async function loadUserDays(userId: string, courseId: number) {
    setIsLoadingDays(true);
    setUserDays([]);

    // Only `date` + completion flags are read — never time entries or answers.
    const [{ data: periods }, { data: days }] = await Promise.all([
      supabase
        .from("course_period")
        .select("start_date, end_date")
        .eq("course_id", courseId),
      supabase
        .from("day")
        .select("date, is_submitted, day_questionnaire_completed")
        .eq("profiles_id", userId)
        .eq("course_id", courseId),
    ]);

    let courseDates =
      periods && periods.length > 0 ? getPeriodDates(periods) : [];
    if (courseDates.length === 0) {
      // Legacy course without period rows: fall back to start/end span
      const { data: course } = await supabase
        .from("course")
        .select("start_date, end_date")
        .eq("course_id", courseId)
        .maybeSingle();
      if (course?.start_date && course?.end_date) {
        courseDates = getSinglePeriodDates(
          String(course.start_date).slice(0, 10),
          String(course.end_date).slice(0, 10),
        );
      }
    }

    const submittedDates = new Set<string>();
    const answeredDates = new Set<string>();
    for (const d of days ?? []) {
      const date = String(d.date).slice(0, 10);
      if (d.is_submitted) submittedDates.add(date);
      if (d.day_questionnaire_completed) answeredDates.add(date);
    }

    // Course days ∪ submitted days (in case a submitted day lies outside the periods)
    const allDates = [...new Set([...courseDates, ...submittedDates])].sort();
    setUserDays(
      allDates.map((date) => ({
        date,
        isSubmitted: submittedDates.has(date),
        dayQuestionnaireCompleted: answeredDates.has(date),
      })),
    );
    setIsLoadingDays(false);
  }

  // ── Action handlers ───────────────────────────────────────────────────────────

  async function handleLockCourse(courseId: number) {
    const { error } = await supabase
      .from("course")
      .update({ is_locked: true })
      .eq("course_id", courseId);
    if (!error) {
      setCourses((prev) =>
        prev.map((c) =>
          c.course_id === courseId ? { ...c, is_locked: true } : c,
        ),
      );
    }
    setConfirmModal(null);
  }

  async function handleChangeAccessCode(courseId: number, newCode: string) {
    const { error } = await supabase
      .from("course")
      .update({ accessCode: newCode })
      .eq("course_id", courseId);
    if (!error) {
      setCourses((prev) =>
        prev.map((c) =>
          c.course_id === courseId ? { ...c, accessCode: newCode } : c,
        ),
      );
      setEditingAccessCode(null);
    }
  }

  async function handleKickUser(userCourseId: string, userId: string) {
    const { error } = await supabase
      .from("user_course")
      .delete()
      .eq("user_course_id", userCourseId);
    if (!error) {
      setCourseUsers((prev) => prev.filter((u) => u.userId !== userId));
    }
    setConfirmModal(null);
  }

  async function handleToggleExclude(user: EnrolledUser) {
    const nowExcluded = !user.isExcluded;
    const { error } = await supabase
      .from("user_course")
      .update({ is_excluded: nowExcluded })
      .eq("user_course_id", user.userCourseId);

    if (!error) {
      setCourseUsers((prev) =>
        prev.map((u) =>
          u.userId === user.userId ? { ...u, isExcluded: nowExcluded } : u,
        ),
      );
    }
    setConfirmModal(null);
  }

  async function handleExportCourse(
    format: "csv" | "xlsx",
    granularity: "aggregiert" | "roh",
  ): Promise<boolean> {
    if (view.type !== "course") return false;
    setIsExporting(true);
    setExportError("");

    const { courseId } = view;

    try {
      // Rows are built server-side without any person reference
      // (no names, e-mails, IDs, aliases or dates; shuffled order).
      const res = await fetch(
        `/api/admin/course-export?courseId=${courseId}&mode=${granularity}&locale=${locale}`,
        { cache: "no-store" },
      );
      const payload = (await res.json()) as {
        error?: string;
        courseName?: string;
        rows?: ExportRow[];
      };

      if (!res.ok || !payload.rows) {
        setExportError(payload.error ?? t("exportModal.exportError"));
        return false;
      }

      const rows = payload.rows;
      const headers = Object.keys(rows[0] ?? {});
      const safeCourseName = (payload.courseName ?? view.courseName)
        .replace(/[^\w\- äöüÄÖÜß]/g, "")
        .trim();
      const modeSuffix =
        granularity === "aggregiert" ? "Aggregiert_anonym" : "Rohdaten_anonym";
      const sanitize = (v: string | number | null | undefined) =>
        String(v ?? "").replaceAll(";", ",");

      if (format === "csv") {
        const bom = "\uFEFF";
        const csvLines = [
          headers.join(";"),
          ...rows.map((r) => headers.map((h) => sanitize(r[h])).join(";")),
        ];
        const blob = new Blob([bom + csvLines.join("\n")], {
          type: "text/csv;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${safeCourseName}_Statistiken_${modeSuffix}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
        ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length, 14) }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Statistiken");
        XLSX.writeFile(wb, `${safeCourseName}_Statistiken_${modeSuffix}.xlsx`);
      }
      return true;
    } catch {
      setExportError(t("exportModal.exportError"));
      return false;
    } finally {
      setIsExporting(false);
    }
  }

  async function handleAnonymizeCourse(courseId: number) {
    setIsAnonymizing(true);

    // Sort users deterministically for stable alias assignment
    const usersToAnonymize = [...courseUsers].sort((a, b) =>
      a.userId.localeCompare(b.userId),
    );

    const updates = usersToAnonymize.map((u, i) => ({
      userCourseId: u.userCourseId,
      alias: `TN-${String(i + 1).padStart(4, "0")}`,
    }));

    await Promise.all(
      updates.map(({ userCourseId, alias }) =>
        supabase
          .from("user_course")
          .update({ alias })
          .eq("user_course_id", userCourseId),
      ),
    );

    const anonymizedAt = new Date().toISOString();
    await supabase
      .from("course")
      .update({ anonymized_at: anonymizedAt })
      .eq("course_id", courseId);

    setCourses((prev) =>
      prev.map((c) =>
        c.course_id === courseId ? { ...c, anonymized_at: anonymizedAt } : c,
      ),
    );
    setCourseUsers((prev) =>
      prev.map((u) => {
        const upd = updates.find((x) => x.userCourseId === u.userCourseId);
        return upd ? { ...u, alias: upd.alias } : u;
      }),
    );
    setView((prev) => {
      if (prev.type === "course" && prev.courseId === courseId) {
        return { ...prev, isAnonymized: true };
      }
      return prev;
    });

    setIsAnonymizing(false);
    setConfirmModal(null);
  }

  async function handleToggleCourseComparison(
    courseId: number,
    enabled: boolean,
  ) {
    const { error } = await supabase
      .from("course")
      .update({ comparison_enabled: enabled })
      .eq("course_id", courseId);
    if (error) return;

    setCourses((prev) =>
      prev.map((c) =>
        c.course_id === courseId ? { ...c, comparison_enabled: enabled } : c,
      ),
    );

    setView((prev) => {
      if (prev.type === "course" && prev.courseId === courseId) {
        return { ...prev, isComparisonEnabled: enabled };
      }
      if (prev.type === "user" && prev.courseId === courseId) {
        return { ...prev, isComparisonEnabled: enabled };
      }
      return prev;
    });
  }

  async function handleToggleExtraRatings(courseId: number, enabled: boolean) {
    const { error } = await supabase
      .from("course")
      .update({ ask_extra_ratings: enabled })
      .eq("course_id", courseId);
    if (error) return;

    setCourses((prev) =>
      prev.map((c) =>
        c.course_id === courseId ? { ...c, ask_extra_ratings: enabled } : c,
      ),
    );
  }

  async function handleToggleDayQuestionnaire(
    courseId: number,
    enabled: boolean,
  ) {
    const { error } = await supabase
      .from("course")
      .update({ ask_day_questionnaire: enabled })
      .eq("course_id", courseId);
    if (error) return;

    setCourses((prev) =>
      prev.map((c) =>
        c.course_id === courseId ? { ...c, ask_day_questionnaire: enabled } : c,
      ),
    );
  }

  async function handleCreateCourse(e: React.FormEvent) {
    e.preventDefault();
    setIsCreating(true);
    setCreateError("");
    setCreateSuccess(false);

    if (!newName.trim() || !newAccessCode.trim()) {
      setCreateError(t("errors.fillAllFields"));
      setIsCreating(false);
      return;
    }

    // Validate every period
    for (const p of newPeriods) {
      if (!p.start || !p.end) {
        setCreateError(t("errors.periodDatesRequired"));
        setIsCreating(false);
        return;
      }
      if (p.end < p.start) {
        setCreateError(t("errors.periodEndBeforeStart"));
        setIsCreating(false);
        return;
      }
    }

    // Validate no overlaps between periods
    const overlapError = validatePeriodsNoOverlap(
      newPeriods.map((p) => ({ start_date: p.start, end_date: p.end })),
      locale,
    );
    if (overlapError) {
      setCreateError(overlapError);
      setIsCreating(false);
      return;
    }

    // Compute overall span for the legacy start_date / end_date columns
    const sortedByStart = [...newPeriods].sort((a, b) =>
      a.start.localeCompare(b.start),
    );
    const spanStart = sortedByStart[0].start;
    const spanEnd = sortedByStart.reduce(
      (max, p) => (p.end > max ? p.end : max),
      sortedByStart[0].end,
    );

    // Insert the course
    const { data: courseInsert, error: courseError } = await supabase
      .from("course")
      .insert({
        name: newName.trim(),
        start_date: spanStart,
        end_date: spanEnd,
        accessCode: newAccessCode.trim(),
        is_locked: false,
        comparison_enabled: false,
        ask_extra_ratings: newAskExtraRatings,
        ask_day_questionnaire: newAskDayQuestionnaire,
      })
      .select("course_id")
      .single();

    if (courseError || !courseInsert) {
      setCreateError(
        t("errors.courseCreateError", { message: courseError?.message ?? "" }),
      );
      setIsCreating(false);
      return;
    }

    // Insert periods
    const periodInserts = newPeriods.map((p, i) => ({
      course_id: courseInsert.course_id,
      start_date: p.start,
      end_date: p.end,
      sort_order: i,
    }));
    const { error: periodError } = await supabase
      .from("course_period")
      .insert(periodInserts);

    if (periodError) {
      setCreateError(
        t("errors.periodsSaveError", { message: periodError.message }),
      );
      setIsCreating(false);
      return;
    }

    setCreateSuccess(true);
    setNewName("");
    setNewPeriods([{ start: "", end: "" }]);
    setNewAccessCode("");
    setNewAskExtraRatings(false);
    setNewAskDayQuestionnaire(false);
    setIsCreating(false);
  }

  // ── Section renderers ─────────────────────────────────────────────────────────

  function renderBreadcrumb() {
    if (view.type === "list") return null;
    return (
      <nav className="mb-5 flex items-center gap-1 text-sm text-slate-500">
        <button
          type="button"
          onClick={() => setView({ type: "list" })}
          className="hover:text-slate-800 transition-colors"
        >
          {t("breadcrumb.allCourses")}
        </button>
        {view.type === "course" && (
          <>
            <ChevronRight size={14} className="shrink-0" />
            <span className="font-medium text-slate-800">
              {view.courseName}
            </span>
          </>
        )}
        {view.type === "user" && (
          <>
            <ChevronRight size={14} className="shrink-0" />
            <button
              type="button"
              onClick={() => {
                if (view.type === "user") {
                  setView({
                    type: "course",
                    courseId: view.courseId,
                    courseName: view.courseName,
                    courseTotalDays: view.courseTotalDays,
                    isAnonymized: view.isAnonymized,
                    isComparisonEnabled: view.isComparisonEnabled,
                  });
                }
              }}
              className="hover:text-slate-800 transition-colors"
            >
              {view.courseName}
            </button>
            <ChevronRight size={14} className="shrink-0" />
            <span className="font-medium text-slate-800 truncate max-w-[200px]">
              {view.userDisplayName}
            </span>
          </>
        )}
      </nav>
    );
  }

  function renderNewCourseForm() {
    return (
      <form onSubmit={handleCreateCourse} className="max-w-md space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            {t("newCourseForm.nameLabel")}
          </label>
          <input
            type="text"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              setCreateError("");
              setCreateSuccess(false);
            }}
            placeholder={t("newCourseForm.namePlaceholder")}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Period list */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="block text-sm font-medium text-slate-700">
              {t("newCourseForm.periodsLabel")}
            </label>
            <button
              type="button"
              onClick={() => {
                setNewPeriods((prev) => [...prev, { start: "", end: "" }]);
                setCreateError("");
                setCreateSuccess(false);
              }}
              className="flex items-center gap-1 text-xs font-medium text-blue-600 transition-colors hover:text-blue-700"
            >
              <Plus size={13} />
              {t("newCourseForm.addPeriodButton")}
            </button>
          </div>

          <div className="space-y-2">
            {newPeriods.map((p, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-xs text-slate-500 mb-1">
                    {newPeriods.length > 1
                      ? t("newCourseForm.periodStartLabel", { index: i + 1 })
                      : t("newCourseForm.startDateLabel")}
                  </label>
                  <input
                    type="date"
                    value={p.start}
                    onChange={(e) => {
                      const updated = newPeriods.map((x, j) =>
                        j === i ? { ...x, start: e.target.value } : x,
                      );
                      setNewPeriods(updated);
                      setCreateError("");
                      setCreateSuccess(false);
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-slate-500 mb-1">
                    {newPeriods.length > 1
                      ? t("newCourseForm.periodEndLabel")
                      : t("newCourseForm.endDateLabel")}
                  </label>
                  <input
                    type="date"
                    value={p.end}
                    onChange={(e) => {
                      const updated = newPeriods.map((x, j) =>
                        j === i ? { ...x, end: e.target.value } : x,
                      );
                      setNewPeriods(updated);
                      setCreateError("");
                      setCreateSuccess(false);
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                {newPeriods.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      setNewPeriods((prev) => prev.filter((_, j) => j !== i));
                      setCreateError("");
                      setCreateSuccess(false);
                    }}
                    className="mb-0.5 rounded p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                    title={t("newCourseForm.removePeriodTitle")}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            {t("newCourseForm.accessCodeLabel")}
          </label>
          <input
            type="text"
            value={newAccessCode}
            onChange={(e) => {
              setNewAccessCode(e.target.value);
              setCreateError("");
              setCreateSuccess(false);
            }}
            placeholder={t("newCourseForm.accessCodePlaceholder")}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={newAskExtraRatings}
              onChange={(e) => setNewAskExtraRatings(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            {t("newCourseForm.askExtraRatingsLabel")}
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={newAskDayQuestionnaire}
              onChange={(e) => setNewAskDayQuestionnaire(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            {t("newCourseForm.askDayQuestionnaireLabel")}
          </label>
        </div>

        {createError && <p className="text-sm text-red-600">{createError}</p>}
        {createSuccess && (
          <p className="text-sm text-green-600 font-medium">
            {t("newCourseForm.createSuccess")}
          </p>
        )}

        <button
          type="submit"
          disabled={isCreating}
          className="rounded-lg bg-slate-800 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isCreating ? t("newCourseForm.creatingButton") : t("newCourseForm.createButton")}
        </button>
      </form>
    );
  }

  function renderCourseList() {
    if (isLoadingCourses)
      return <p className="text-sm text-slate-500">{t("loading")}</p>;
    if (coursesError)
      return <p className="text-sm text-red-600">{coursesError}</p>;
    if (courses.length === 0) {
      return (
        <p className="text-sm text-slate-500">{t("courseList.noCourses")}</p>
      );
    }

    return (
      <div className="space-y-3">
        {courses.map((course) => {
          const isEditingCode =
            editingAccessCode?.courseId === course.course_id;

          return (
            <div
              key={course.course_id}
              className={`rounded-xl border bg-white p-3 transition-colors dark:bg-slate-900 sm:p-4 ${
                course.is_locked
                  ? "border-red-300 hover:border-red-400 dark:border-red-800 dark:hover:border-red-700"
                  : "border-green-300 hover:border-green-400 dark:border-green-800 dark:hover:border-green-700"
              }`}
            >
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                {/* Left: clickable course name + metadata */}
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    const totalDays =
                      course.periods.length > 0
                        ? totalPeriodDays(course.periods)
                        : courseDurationDays(
                            course.start_date,
                            course.end_date,
                          );
                    setView({
                      type: "course",
                      courseId: course.course_id,
                      courseName: course.name,
                      courseTotalDays: totalDays,
                      isAnonymized: course.anonymized_at != null,
                      isComparisonEnabled: course.comparison_enabled,
                    });
                    void loadCourseUsers(course.course_id, totalDays);
                  }}
                >
                  <p className="break-words text-sm font-medium leading-snug text-slate-800 transition-colors hover:text-blue-600 dark:text-slate-100 sm:text-lg">
                    {course.name}
                  </p>
                  <div className="mt-1 space-y-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400 sm:text-sm">
                    {course.periods.length > 0 ? (
                      course.periods.map((p) => (
                        <p key={p.course_period_id} className="break-words">
                          {formatPeriodLabel(p.start_date, p.end_date, locale)}
                        </p>
                      ))
                    ) : (
                      <p className="break-words">
                        {formatDate(course.start_date, locale)} –{" "}
                        {formatDate(course.end_date, locale)}
                        {" · "}
                        {courseDurationLabel(
                          course.start_date,
                          course.end_date,
                          locale,
                        )}
                      </p>
                    )}
                    <p className="break-words">
                      {t("courseList.participantsLabel", { count: course.userCount })}
                    </p>
                  </div>
                </button>

                {/* Right: badges + actions */}
                <div className="flex flex-wrap items-center gap-1.5 sm:justify-end sm:gap-2">
                  {course.anonymized_at && (
                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 sm:px-2.5 sm:py-1 sm:text-xs">
                      {t("courseList.anonymizedBadge")}
                    </span>
                  )}
                  {course.comparison_enabled ? (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 sm:px-2.5 sm:py-1 sm:text-xs">
                      {t("courseList.comparisonEnabledBadge")}
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400 sm:px-2.5 sm:py-1 sm:text-xs">
                      {t("courseList.comparisonDisabledBadge")}
                    </span>
                  )}
                  {course.ask_extra_ratings && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 sm:px-2.5 sm:py-1 sm:text-xs">
                      {t("courseList.extraRatingsEnabledBadge")}
                    </span>
                  )}
                  {course.ask_day_questionnaire && (
                    <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-medium text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 sm:px-2.5 sm:py-1 sm:text-xs">
                      {t("courseList.dayQuestionnaireEnabledBadge")}
                    </span>
                  )}
                </div>
              </div>

              {/* Access code row */}
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800 sm:mt-3 sm:pt-3">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 sm:text-xs">
                    {t("courseList.accessCodeLabel")}
                  </span>
                  {isEditingCode ? (
                    <>
                      <input
                        type="text"
                        value={editingAccessCode.value}
                        onChange={(e) =>
                          setEditingAccessCode({
                            courseId: course.course_id,
                            value: e.target.value,
                          })
                        }
                        className="min-w-[7rem] rounded border border-slate-300 px-2 py-0.5 text-[11px] text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 sm:min-w-[8rem] sm:text-xs"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() =>
                          void handleChangeAccessCode(
                            course.course_id,
                            editingAccessCode.value.trim(),
                          )
                        }
                        className="text-[11px] font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 sm:text-xs"
                      >
                        {t("courseList.saveButton")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingAccessCode(null)}
                        className="text-[11px] text-slate-400 hover:text-slate-600 sm:text-xs"
                      >
                        {t("courseList.cancelButton")}
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="max-w-full overflow-hidden rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-300 sm:text-xs">
                        {course.accessCode ?? "–"}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setEditingAccessCode({
                            courseId: course.course_id,
                            value: course.accessCode ?? "",
                          })
                        }
                        className="text-[11px] text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-300 sm:text-xs"
                      >
                        {t("courseList.changeButton")}
                      </button>
                    </>
                  )}
                </div>

                {!course.is_locked && (
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmModal({
                        title: t("courseList.endCourseConfirm.title"),
                        message: t("courseList.endCourseConfirm.message", {
                          name: course.name,
                        }),
                        variant: "danger",
                        confirmLabel: t("courseList.endCourseConfirm.confirmLabel"),
                        onConfirm: () =>
                          void handleLockCourse(course.course_id),
                      })
                    }
                    className="rounded-lg border border-red-200 px-2.5 py-1 text-[11px] font-medium text-red-600 transition hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20 sm:px-3 sm:py-1.5 sm:text-xs"
                  >
                    {t("courseList.endCourseButton")}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderCourseDetail() {
    if (view.type !== "course") return null;
    const { isAnonymized, isComparisonEnabled } = view;
    const currentCourse = courses.find((c) => c.course_id === view.courseId);
    const isAskExtraRatings = currentCourse?.ask_extra_ratings ?? false;
    const isAskDayQuestionnaire = currentCourse?.ask_day_questionnaire ?? false;

    return (
      <div className="space-y-4">
        {/* Course-level actions */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setView({ type: "list" })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ChevronLeft size={13} />
            {t("courseDetail.backToOverviewButton")}
          </button>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              disabled={isExporting || courseUsers.length === 0}
              onClick={() => {
                setExportError("");
                setIsExportModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
            >
              <Download size={13} />
              {t("courseDetail.exportButton")}
            </button>

            <button
              type="button"
              onClick={() =>
                void handleToggleCourseComparison(
                  view.courseId,
                  !isComparisonEnabled,
                )
              }
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                isComparisonEnabled
                  ? "border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-900/20"
                  : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {isComparisonEnabled
                ? t("courseDetail.comparisonDisableButton")
                : t("courseDetail.comparisonEnableButton")}
            </button>

            <button
              type="button"
              onClick={() =>
                void handleToggleExtraRatings(
                  view.courseId,
                  !isAskExtraRatings,
                )
              }
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                isAskExtraRatings
                  ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                  : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {isAskExtraRatings
                ? t("courseDetail.extraRatingsDisableButton")
                : t("courseDetail.extraRatingsEnableButton")}
            </button>

            <button
              type="button"
              onClick={() =>
                void handleToggleDayQuestionnaire(
                  view.courseId,
                  !isAskDayQuestionnaire,
                )
              }
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                isAskDayQuestionnaire
                  ? "border-teal-200 text-teal-700 hover:bg-teal-50 dark:border-teal-800 dark:text-teal-400 dark:hover:bg-teal-900/20"
                  : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {isAskDayQuestionnaire
                ? t("courseDetail.dayQuestionnaireDisableButton")
                : t("courseDetail.dayQuestionnaireEnableButton")}
            </button>

            {!isAnonymized && (
              <button
                type="button"
                disabled={isAnonymizing}
                onClick={() =>
                  setConfirmModal({
                    title: t("courseDetail.anonymizeConfirm.title"),
                    message: t("courseDetail.anonymizeConfirm.message"),
                    variant: "warning",
                    confirmLabel: t("courseDetail.anonymizeConfirm.confirmLabel"),
                    onConfirm: () => void handleAnonymizeCourse(view.courseId),
                  })
                }
                className="rounded-lg border border-violet-200 px-3 py-1.5 text-xs font-medium text-violet-700 transition hover:bg-violet-50 disabled:opacity-50 dark:border-violet-800 dark:text-violet-400 dark:hover:bg-violet-900/20"
              >
                {isAnonymizing ? t("courseDetail.anonymizingButton") : t("courseDetail.anonymizeButton")}
              </button>
            )}
          </div>
        </div>

        {isExportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {t("exportModal.title")}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {t("exportModal.subtitle")}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => setIsExportModalOpen(false)}
                  className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                  aria-label={t("exportModal.closeAriaLabel")}
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50 p-3 dark:border-violet-800 dark:bg-violet-900/20">
                  <ShieldCheck
                    size={15}
                    className="mt-0.5 shrink-0 text-violet-600 dark:text-violet-400"
                  />
                  <p className="text-xs text-violet-800 dark:text-violet-300">
                    {t("exportModal.privacyNote")}
                  </p>
                </div>

                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                    {t("exportModal.contentLabel")}
                  </p>
                  <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
                    <button
                      type="button"
                      onClick={() => setExportGranularity("aggregiert")}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                        exportGranularity === "aggregiert"
                          ? "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100"
                          : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                      }`}
                    >
                      {t("exportModal.aggregatedOption")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setExportGranularity("roh")}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                        exportGranularity === "roh"
                          ? "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100"
                          : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                      }`}
                    >
                      {t("exportModal.rawOption")}
                    </button>
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {exportGranularity === "aggregiert"
                      ? t("exportModal.aggregatedDescription")
                      : t("exportModal.rawDescription")}
                  </p>
                </div>

                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                    {t("exportModal.formatLabel")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={isExporting}
                      onClick={async () => {
                        const ok = await handleExportCourse(
                          "csv",
                          exportGranularity,
                        );
                        if (ok) setIsExportModalOpen(false);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                    >
                      <Download size={13} />
                      {isExporting ? t("exportModal.exportingLabel") : t("exportModal.csvButton")}
                    </button>
                    <button
                      type="button"
                      disabled={isExporting}
                      onClick={async () => {
                        const ok = await handleExportCourse(
                          "xlsx",
                          exportGranularity,
                        );
                        if (ok) setIsExportModalOpen(false);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                    >
                      <Download size={13} />
                      {isExporting ? t("exportModal.exportingLabel") : t("exportModal.excelButton")}
                    </button>
                  </div>
                </div>

                {exportError && (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                    {exportError}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {isLoadingUsers ? (
          <p className="text-sm text-slate-500">{t("loading")}</p>
        ) : courseUsers.length === 0 ? (
          <p className="text-sm text-slate-500">
            {t("courseDetail.noParticipants")}
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left dark:border-slate-800 dark:bg-slate-800/50">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t("courseDetail.table.participantColumn")}
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t("courseDetail.table.progressColumn")}
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t("courseDetail.table.actionsColumn")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {courseUsers.map((u) => {
                  const displayLabel = userDisplayName(u, isAnonymized);
                  const showEmail =
                    !isAnonymized && (u.firstName || u.lastName);

                  return (
                    <tr
                      key={u.userId}
                      className={`transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                        u.isExcluded ? "opacity-50" : ""
                      }`}
                    >
                      {/* Name / alias */}
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => {
                            if (view.type === "course") {
                              setView({
                                type: "user",
                                courseId: view.courseId,
                                courseName: view.courseName,
                                courseTotalDays: view.courseTotalDays,
                                isAnonymized: view.isAnonymized,
                                isComparisonEnabled: view.isComparisonEnabled,
                                userId: u.userId,
                                userDisplayName: displayLabel,
                              });
                              void loadUserDays(u.userId, view.courseId);
                            }
                          }}
                          className="text-left"
                        >
                          <p className="font-medium text-blue-600 hover:underline dark:text-blue-400">
                            {displayLabel}
                          </p>
                          {showEmail && (
                            <p className="text-xs text-slate-400 dark:text-slate-500">
                              {u.email}
                            </p>
                          )}
                        </button>
                      </td>

                      {/* X / Y progress */}
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {u.submittedDays}{" "}
                        <span className="text-slate-400 dark:text-slate-500">
                          / {u.courseTotalDays} {t("courseDetail.table.daysUnit")}
                        </span>
                        {/* Answered day questionnaires, out of the completed days */}
                        {isAskDayQuestionnaire && (
                          <p
                            className={`mt-0.5 text-xs ${
                              u.answeredDayQuestionnaires < u.submittedDays
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-slate-400 dark:text-slate-500"
                            }`}
                          >
                            {t("courseDetail.table.dayQuestionnairesProgress", {
                              answered: u.answeredDayQuestionnaires,
                              total: u.submittedDays,
                            })}
                          </p>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {/* Exclude toggle */}
                          <button
                            type="button"
                            onClick={() => {
                              if (u.isExcluded) {
                                setConfirmModal({
                                  title: t("courseDetail.table.includeConfirm.title"),
                                  message: t(
                                    "courseDetail.table.includeConfirm.message",
                                    { name: displayLabel },
                                  ),
                                  variant: "default",
                                  confirmLabel: t(
                                    "courseDetail.table.includeConfirm.confirmLabel",
                                  ),
                                  onConfirm: () => void handleToggleExclude(u),
                                });
                              } else {
                                setConfirmModal({
                                  title: t("courseDetail.table.excludeConfirm.title"),
                                  message: t(
                                    "courseDetail.table.excludeConfirm.message",
                                    { name: displayLabel },
                                  ),
                                  variant: "warning",
                                  confirmLabel: t(
                                    "courseDetail.table.excludeConfirm.confirmLabel",
                                  ),
                                  onConfirm: () => void handleToggleExclude(u),
                                });
                              }
                            }}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                              u.isExcluded
                                ? "border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:border-slate-700 dark:text-slate-400"
                                : "border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-900/20"
                            }`}
                          >
                            {u.isExcluded
                              ? t("courseDetail.table.includeButton")
                              : t("courseDetail.table.excludeButton")}
                          </button>

                          {/* Kick user */}
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmModal({
                                title: t("courseDetail.table.removeConfirm.title"),
                                message: t(
                                  "courseDetail.table.removeConfirm.message",
                                  { name: displayLabel },
                                ),
                                variant: "danger",
                                confirmLabel: t(
                                  "courseDetail.table.removeConfirm.confirmLabel",
                                ),
                                onConfirm: () =>
                                  void handleKickUser(u.userCourseId, u.userId),
                              })
                            }
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                          >
                            {t("courseDetail.table.removeButton")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  function renderUserDetail() {
    if (view.type !== "user") return null;

    const submittedCount = userDays.filter((d) => d.isSubmitted).length;
    const answeredCount = userDays.filter(
      (d) => d.isSubmitted && d.dayQuestionnaireCompleted,
    ).length;
    const totalCount = Math.max(userDays.length, view.courseTotalDays);
    const isAskDayQuestionnaire =
      courses.find((c) => c.course_id === view.courseId)
        ?.ask_day_questionnaire ?? false;

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (view.type === "user") {
                setView({
                  type: "course",
                  courseId: view.courseId,
                  courseName: view.courseName,
                  courseTotalDays: view.courseTotalDays,
                  isAnonymized: view.isAnonymized,
                  isComparisonEnabled: view.isComparisonEnabled,
                });
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ChevronLeft size={13} />
            {t("userDetail.backToCourseButton")}
          </button>
          <button
            type="button"
            onClick={() => setView({ type: "list" })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ChevronLeft size={13} />
            {t("userDetail.backToOverviewButton")}
          </button>
        </div>

        {/* Summary card: name + completion count only */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-slate-800 dark:text-slate-100">
                {view.userDisplayName}
              </p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {isLoadingDays ? (
                  t("userDetail.loading")
                ) : (
                  <>
                    <span className="font-medium">{submittedCount}</span>
                    <span className="text-slate-400 dark:text-slate-500">
                      {" "}
                      {t("userDetail.daysCompleted", { total: totalCount })}
                    </span>
                  </>
                )}
              </p>
              {!isLoadingDays && isAskDayQuestionnaire && (
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  {t("courseDetail.table.dayQuestionnairesProgress", {
                    answered: answeredCount,
                    total: submittedCount,
                  })}
                </p>
              )}
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 dark:border-violet-800 dark:bg-violet-900/20 sm:max-w-sm">
              <ShieldCheck
                size={15}
                className="mt-0.5 shrink-0 text-violet-600 dark:text-violet-400"
              />
              <p className="text-xs text-violet-800 dark:text-violet-300">
                {t("userDetail.privacyNote")}
              </p>
            </div>
          </div>
        </div>

        {renderUserDayList(isAskDayQuestionnaire)}
      </div>
    );
  }

  function renderUserDayList(showDayQuestionnaire: boolean) {
    if (view.type !== "user") return null;
    if (isLoadingDays) return null; // summary card already shows the loading state
    if (userDays.length === 0) {
      return (
        <p className="text-sm text-slate-500">
          {t("dayList.noCourseDays")}
        </p>
      );
    }

    return (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left dark:border-slate-800 dark:bg-slate-800/50">
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t("dayList.colDay")}
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t("dayList.colCompleted")}
              </th>
              {showDayQuestionnaire && (
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t("dayList.colDayQuestionnaire")}
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {userDays.map((day) => (
              <tr
                key={day.date}
                className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40"
              >
                <td className="px-4 py-3 text-slate-800 dark:text-slate-100">
                  {new Date(`${day.date}T00:00:00`).toLocaleDateString(
                    locale === "en" ? "en-US" : "de-DE",
                    {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    },
                  )}
                </td>
                <td className="px-4 py-3">
                  {day.isSubmitted ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      <CheckCircle2 size={13} />
                      {t("dayList.yes")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      <Circle size={13} />
                      {t("dayList.no")}
                    </span>
                  )}
                </td>
                {showDayQuestionnaire && (
                  <td className="px-4 py-3">
                    {day.dayQuestionnaireCompleted ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        <CheckCircle2 size={13} />
                        {t("dayList.yes")}
                      </span>
                    ) : day.isSubmitted ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        <Circle size={13} />
                        {t("dayList.pending")}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        –
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

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

      <div>
        {/* Sub-tab bar */}
        <div className="mb-6 flex gap-1 border-b border-slate-200 dark:border-slate-800">
          {(["alle", "neu"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                setSubTab(tab);
                setView({ type: "list" });
              }}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                subTab === tab
                  ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-300"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
              }`}
            >
              {tab === "alle" ? t("subTabs.alleKurse") : t("subTabs.neuerKurs")}
            </button>
          ))}
        </div>

        {subTab === "neu" && renderNewCourseForm()}

        {subTab === "alle" && (
          <div>
            {renderBreadcrumb()}
            {view.type === "list" && renderCourseList()}
            {view.type === "course" && renderCourseDetail()}
            {view.type === "user" && renderUserDetail()}
          </div>
        )}
      </div>
    </>
  );
}
