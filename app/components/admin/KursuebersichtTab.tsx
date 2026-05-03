"use client";

import { useState, useEffect } from "react";
import { ChevronRight, Plus, X } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import ConfirmModal from "./ConfirmModal";
import {
  type CoursePeriod,
  totalPeriodDays,
  periodsDurationLabel,
  formatPeriodLabel,
  validatePeriodsNoOverlap,
} from "@/lib/course-periods";

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
  courseTotalDays: number;
};

type DayRow = {
  day_id: number;
  date: string;
  is_submitted: boolean;
};

type EntryRow = {
  entry_id: number;
  start_time: string;
  end_time: string;
  primaryActivity: string | null;
  secondaryActivity: string | null;
  locationTransport: string | null;
  satisfaction: string | null;
};

// Drill-down navigation state for the "Alle Kurse" sub-tab
type DrillView =
  | { type: "list" }
  | {
      type: "course";
      courseId: number;
      courseName: string;
      courseTotalDays: number;
      isAnonymized: boolean;
    }
  | {
      type: "user";
      courseId: number;
      courseName: string;
      courseTotalDays: number;
      isAnonymized: boolean;
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

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function courseDurationDays(startDate: string, endDate: string): number {
  return (
    Math.round(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) /
        86_400_000,
    ) + 1
  );
}

function courseDurationLabel(startDate: string, endDate: string): string {
  const days = courseDurationDays(startDate, endDate);
  return `${days} Tag${days !== 1 ? "e" : ""}`;
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
  const supabase = getSupabaseBrowserClient();

  const [subTab, setSubTab] = useState<"alle" | "neu">("alle");
  const [view, setView] = useState<DrillView>({ type: "list" });

  // ── "Neuer Kurs" form ───────────────────────────────────────────────────────
  const [newName, setNewName] = useState("");
  const [newPeriods, setNewPeriods] = useState<PeriodInput[]>([
    { start: "", end: "" },
  ]);
  const [newAccessCode, setNewAccessCode] = useState("");
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

  // ── User detail (days + expandable entries) ─────────────────────────────────
  const [userDays, setUserDays] = useState<DayRow[]>([]);
  const [isLoadingDays, setIsLoadingDays] = useState(false);
  const [expandedDayIds, setExpandedDayIds] = useState<Set<number>>(new Set());
  const [dayEntries, setDayEntries] = useState<Record<number, EntryRow[]>>({});
  const [loadingEntryDayIds, setLoadingEntryDayIds] = useState<Set<number>>(
    new Set(),
  );

  // ── Modals & inline edits ───────────────────────────────────────────────────
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(
    null,
  );
  const [editingAccessCode, setEditingAccessCode] = useState<{
    courseId: number;
    value: string;
  } | null>(null);
  const [isAnonymizing, setIsAnonymizing] = useState(false);

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
        "course_id, name, start_date, end_date, is_locked, accessCode, anonymized_at",
      )
      .order("start_date", { ascending: false });

    if (courseErr || !courseData) {
      setCoursesError("Kurse konnten nicht geladen werden.");
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

    const [profilesRes, submittedDaysRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, email, first_name, last_name")
        .in("id", userIds),
      supabase
        .from("day")
        .select("profiles_id")
        .eq("course_id", courseId)
        .eq("is_submitted", true),
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
    for (const d of submittedDaysRes.data ?? []) {
      submittedByUser[d.profiles_id] =
        (submittedByUser[d.profiles_id] ?? 0) + 1;
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
        courseTotalDays,
      })),
    );
    setIsLoadingUsers(false);
  }

  async function loadUserDays(userId: string, courseId: number) {
    setIsLoadingDays(true);
    setUserDays([]);
    setExpandedDayIds(new Set());
    setDayEntries({});

    const { data: days } = await supabase
      .from("day")
      .select("day_id, date, is_submitted")
      .eq("profiles_id", userId)
      .eq("course_id", courseId)
      .order("date");

    setUserDays(days ?? []);
    setIsLoadingDays(false);
  }

  async function loadDayEntries(dayId: number) {
    if (dayEntries[dayId] !== undefined) return; // already loaded

    setLoadingEntryDayIds((prev) => new Set([...prev, dayId]));

    const { data: rawEntries } = await supabase
      .from("time_entry")
      .select(
        "entry_id, start_time, end_time, primary_activity_id, secondary_activity_id, location_transport_id, satisfaction_id",
      )
      .eq("day_id", dayId)
      .order("start_time");

    if (!rawEntries || rawEntries.length === 0) {
      setDayEntries((prev) => ({ ...prev, [dayId]: [] }));
      setLoadingEntryDayIds((prev) => {
        const s = new Set(prev);
        s.delete(dayId);
        return s;
      });
      return;
    }

    const activityIds = [
      ...new Set(
        [
          ...rawEntries.map((e) => e.primary_activity_id),
          ...rawEntries.map((e) => e.secondary_activity_id),
        ].filter((id): id is number => id != null),
      ),
    ];
    const locationIds = [
      ...new Set(
        rawEntries
          .map((e) => e.location_transport_id)
          .filter((id): id is number => id != null),
      ),
    ];
    const satisfactionIds = [
      ...new Set(
        rawEntries
          .map((e) => e.satisfaction_id)
          .filter((id): id is number => id != null),
      ),
    ];

    const [activitiesRes, locationsRes, satisfactionsRes] = await Promise.all([
      activityIds.length > 0
        ? supabase
            .from("activity")
            .select("activity_id, name")
            .in("activity_id", activityIds)
        : Promise.resolve({
            data: [] as { activity_id: number; name: string }[],
          }),
      locationIds.length > 0
        ? supabase
            .from("location_transport")
            .select("location_transport_id, name")
            .in("location_transport_id", locationIds)
        : Promise.resolve({
            data: [] as { location_transport_id: number; name: string }[],
          }),
      satisfactionIds.length > 0
        ? supabase
            .from("satisfaction")
            .select("satisfaction_id, name")
            .in("satisfaction_id", satisfactionIds)
        : Promise.resolve({
            data: [] as { satisfaction_id: number; name: string }[],
          }),
    ]);

    const activityMap: Record<number, string> = {};
    for (const a of activitiesRes.data ?? [])
      activityMap[a.activity_id] = a.name;
    const locationMap: Record<number, string> = {};
    for (const l of locationsRes.data ?? [])
      locationMap[l.location_transport_id] = l.name;
    const satisfactionMap: Record<number, string> = {};
    for (const s of satisfactionsRes.data ?? [])
      satisfactionMap[s.satisfaction_id] = s.name;

    const entries: EntryRow[] = rawEntries.map((e) => ({
      entry_id: e.entry_id,
      start_time: e.start_time,
      end_time: e.end_time,
      primaryActivity:
        e.primary_activity_id != null
          ? (activityMap[e.primary_activity_id] ?? null)
          : null,
      secondaryActivity:
        e.secondary_activity_id != null
          ? (activityMap[e.secondary_activity_id] ?? null)
          : null,
      locationTransport:
        e.location_transport_id != null
          ? (locationMap[e.location_transport_id] ?? null)
          : null,
      satisfaction:
        e.satisfaction_id != null
          ? (satisfactionMap[e.satisfaction_id] ?? null)
          : null,
    }));

    setDayEntries((prev) => ({ ...prev, [dayId]: entries }));
    setLoadingEntryDayIds((prev) => {
      const s = new Set(prev);
      s.delete(dayId);
      return s;
    });
  }

  function toggleDayExpanded(dayId: number) {
    const isExpanding = !expandedDayIds.has(dayId);
    setExpandedDayIds((prev) => {
      const s = new Set(prev);
      if (s.has(dayId)) s.delete(dayId);
      else s.add(dayId);
      return s;
    });
    if (isExpanding) void loadDayEntries(dayId);
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

  async function handleCreateCourse(e: React.FormEvent) {
    e.preventDefault();
    setIsCreating(true);
    setCreateError("");
    setCreateSuccess(false);

    if (!newName.trim() || !newAccessCode.trim()) {
      setCreateError("Bitte alle Felder ausfüllen.");
      setIsCreating(false);
      return;
    }

    // Validate every period
    for (const p of newPeriods) {
      if (!p.start || !p.end) {
        setCreateError("Bitte für jeden Zeitraum Start- und Enddatum angeben.");
        setIsCreating(false);
        return;
      }
      if (p.end < p.start) {
        setCreateError("Das Enddatum muss nach dem Startdatum liegen.");
        setIsCreating(false);
        return;
      }
    }

    // Validate no overlaps between periods
    const overlapError = validatePeriodsNoOverlap(
      newPeriods.map((p) => ({ start_date: p.start, end_date: p.end })),
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
      })
      .select("course_id")
      .single();

    if (courseError || !courseInsert) {
      setCreateError(
        "Kurs konnte nicht erstellt werden: " + (courseError?.message ?? ""),
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
        "Zeiträume konnten nicht gespeichert werden: " + periodError.message,
      );
      setIsCreating(false);
      return;
    }

    setCreateSuccess(true);
    setNewName("");
    setNewPeriods([{ start: "", end: "" }]);
    setNewAccessCode("");
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
          Alle Kurse
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
            Kursname
          </label>
          <input
            type="text"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              setCreateError("");
              setCreateSuccess(false);
            }}
            placeholder="z. B. Sommersemester 2026"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Period list */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="block text-sm font-medium text-slate-700">
              Zeiträume
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
              Zeitraum hinzufügen
            </button>
          </div>

          <div className="space-y-2">
            {newPeriods.map((p, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-xs text-slate-500 mb-1">
                    {newPeriods.length > 1
                      ? `Zeitraum ${i + 1} – Start`
                      : "Startdatum"}
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
                    {newPeriods.length > 1 ? `Ende` : "Enddatum"}
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
                    title="Zeitraum entfernen"
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
            Zugangscode
          </label>
          <input
            type="text"
            value={newAccessCode}
            onChange={(e) => {
              setNewAccessCode(e.target.value);
              setCreateError("");
              setCreateSuccess(false);
            }}
            placeholder="z. B. SS2026"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {createError && <p className="text-sm text-red-600">{createError}</p>}
        {createSuccess && (
          <p className="text-sm text-green-600 font-medium">
            Kurs wurde erfolgreich erstellt.
          </p>
        )}

        <button
          type="submit"
          disabled={isCreating}
          className="rounded-lg bg-slate-800 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isCreating ? "Wird erstellt…" : "Kurs erstellen"}
        </button>
      </form>
    );
  }

  function renderCourseList() {
    if (isLoadingCourses)
      return <p className="text-sm text-slate-500">Wird geladen…</p>;
    if (coursesError)
      return <p className="text-sm text-red-600">{coursesError}</p>;
    if (courses.length === 0) {
      return (
        <p className="text-sm text-slate-500">Noch keine Kurse vorhanden.</p>
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
              className="rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 sm:p-4"
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
                          {formatPeriodLabel(p.start_date, p.end_date)}
                        </p>
                      ))
                    ) : (
                      <p className="break-words">
                        {formatDate(course.start_date)} –{" "}
                        {formatDate(course.end_date)}
                        {" · "}
                        {courseDurationLabel(
                          course.start_date,
                          course.end_date,
                        )}
                      </p>
                    )}
                    <p className="break-words">{course.userCount} Teilnehmer</p>
                  </div>
                </button>

                {/* Right: badges + actions */}
                <div className="flex flex-wrap items-center gap-1.5 sm:max-w-[16rem] sm:justify-end sm:gap-2">
                  {course.anonymized_at && (
                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 sm:px-2.5 sm:py-1 sm:text-xs">
                      Anonymisiert
                    </span>
                  )}
                  {course.is_locked ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400 sm:px-2.5 sm:py-1 sm:text-xs">
                      Abgeschlossen
                    </span>
                  ) : (
                    <>
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400 sm:px-2.5 sm:py-1 sm:text-xs">
                        Aktiv
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmModal({
                            title: `Kurs beenden`,
                            message: `Soll der Kurs „${course.name}" wirklich beendet werden? Diese Aktion kann nicht rückgängig gemacht werden.`,
                            variant: "danger",
                            confirmLabel: "Beenden",
                            onConfirm: () =>
                              void handleLockCourse(course.course_id),
                          })
                        }
                        className="rounded-lg border border-red-200 px-2.5 py-1 text-[11px] font-medium text-red-600 transition hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20 sm:px-3 sm:py-1.5 sm:text-xs"
                      >
                        Kurs beenden
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Access code row */}
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2.5 dark:border-slate-800 sm:mt-3 sm:gap-2 sm:pt-3">
                <span className="text-[11px] text-slate-400 dark:text-slate-500 sm:text-xs">
                  Zugangscode:
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
                      Speichern
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingAccessCode(null)}
                      className="text-[11px] text-slate-400 hover:text-slate-600 sm:text-xs"
                    >
                      Abbrechen
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
                      Ändern
                    </button>
                  </>
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
    const { isAnonymized } = view;

    return (
      <div className="space-y-4">
        {/* Course-level actions */}
        {!isAnonymized && (
          <div className="flex items-center justify-end">
            <button
              type="button"
              disabled={isAnonymizing}
              onClick={() =>
                setConfirmModal({
                  title: "Kurs anonymisieren",
                  message: `Alle Teilnehmer erhalten ein Alias (TN-0001, TN-0002, …). Realnamen und E-Mail-Adressen werden in der Admin-Ansicht durch Aliases ersetzt. Diese Aktion kann nicht rückgängig gemacht werden.`,
                  variant: "warning",
                  confirmLabel: "Anonymisieren",
                  onConfirm: () => void handleAnonymizeCourse(view.courseId),
                })
              }
              className="rounded-lg border border-violet-200 px-3 py-1.5 text-xs font-medium text-violet-700 transition hover:bg-violet-50 disabled:opacity-50 dark:border-violet-800 dark:text-violet-400 dark:hover:bg-violet-900/20"
            >
              {isAnonymizing ? "Anonymisiere…" : "Kurs anonymisieren"}
            </button>
          </div>
        )}

        {isLoadingUsers ? (
          <p className="text-sm text-slate-500">Wird geladen…</p>
        ) : courseUsers.length === 0 ? (
          <p className="text-sm text-slate-500">
            Keine Teilnehmer in diesem Kurs.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left dark:border-slate-800 dark:bg-slate-800/50">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Teilnehmer
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Fortschritt
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Aktionen
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
                          / {u.courseTotalDays} Tage
                        </span>
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
                                  title: "Ausschluss aufheben",
                                  message: `Die Daten von ${displayLabel} werden wieder in den Statistiken berücksichtigt.`,
                                  variant: "default",
                                  confirmLabel: "Aufheben",
                                  onConfirm: () => void handleToggleExclude(u),
                                });
                              } else {
                                setConfirmModal({
                                  title: "Aus Statistiken ausschliessen",
                                  message: `Die Daten von ${displayLabel} werden aus allen Statistiken entfernt. Der Teilnehmer wird nicht informiert.`,
                                  variant: "warning",
                                  confirmLabel: "Ausschliessen",
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
                            {u.isExcluded ? "Einschliessen" : "Ausschliessen"}
                          </button>

                          {/* Kick user */}
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmModal({
                                title: "Teilnehmer entfernen",
                                message: `Soll ${displayLabel} wirklich aus dem Kurs entfernt werden? Die Zeiteinträge bleiben erhalten.`,
                                variant: "danger",
                                confirmLabel: "Entfernen",
                                onConfirm: () =>
                                  void handleKickUser(u.userCourseId, u.userId),
                              })
                            }
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                          >
                            Entfernen
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
    if (isLoadingDays)
      return <p className="text-sm text-slate-500">Wird geladen…</p>;
    if (userDays.length === 0) {
      return (
        <p className="text-sm text-slate-500">
          Dieser Nutzer hat noch keine Tage erfasst.
        </p>
      );
    }

    return (
      <div className="space-y-2">
        {userDays.map((day) => {
          const isExpanded = expandedDayIds.has(day.day_id);
          const isLoadingEntries = loadingEntryDayIds.has(day.day_id);
          const entries = dayEntries[day.day_id];

          return (
            <div
              key={day.day_id}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
            >
              <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40"
                onClick={() => toggleDayExpanded(day.day_id)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    {new Date(day.date).toLocaleDateString("de-DE", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                  {day.is_submitted ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      Abgeschlossen
                    </span>
                  ) : (
                    <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                      In Bearbeitung
                    </span>
                  )}
                </div>
                <span className="text-slate-400 text-sm">
                  {isExpanded ? "▲" : "▼"}
                </span>
              </button>

              {isExpanded && (
                <div className="border-t border-slate-100 dark:border-slate-800">
                  {isLoadingEntries ? (
                    <p className="px-4 py-3 text-sm text-slate-500">Lädt…</p>
                  ) : !entries || entries.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-slate-400">
                      Keine Einträge für diesen Tag.
                    </p>
                  ) : (
                    <div className="overflow-x-auto scrollbar-thin">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50 text-left dark:border-slate-800 dark:bg-slate-800/50">
                            {[
                              "Zeit",
                              "Haupttätigkeit",
                              "Nebentätigkeit",
                              "Ort / Transport",
                              "Wohlbefinden",
                            ].map((h) => (
                              <th
                                key={h}
                                className="px-3 py-2 font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                          {entries.map((entry) => (
                            <tr
                              key={entry.entry_id}
                              className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/30"
                            >
                              <td className="whitespace-nowrap px-3 py-2 font-mono text-slate-600 dark:text-slate-300">
                                {entry.start_time.slice(0, 5)} –{" "}
                                {entry.end_time.slice(0, 5)}
                              </td>
                              <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                                {entry.primaryActivity ?? "–"}
                              </td>
                              <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                                {entry.secondaryActivity ?? "–"}
                              </td>
                              <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                                {entry.locationTransport ?? "–"}
                              </td>
                              <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                                {entry.satisfaction ?? "–"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
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
              {tab === "alle" ? "Alle Kurse" : "Neuer Kurs"}
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
