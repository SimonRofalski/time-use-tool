"use client";

import { useState, useEffect } from "react";
import { ChevronRight } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

// ─── Types ────────────────────────────────────────────────────────────────────

type CourseRow = {
  course_id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_locked: boolean;
  accessCode: string | null;
  userCount: number;
};

type EnrolledUser = {
  userId: string;
  email: string;
  submittedDays: number;
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
  | { type: "course"; courseId: number; courseName: string }
  | {
      type: "user";
      courseId: number;
      courseName: string;
      userId: string;
      userEmail: string;
    };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function courseDurationLabel(startDate: string, endDate: string): string {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return `${days} Tag${days !== 1 ? "e" : ""}`;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function KursuebersichtTab() {
  const supabase = getSupabaseBrowserClient();

  const [subTab, setSubTab] = useState<"alle" | "neu">("alle");
  const [view, setView] = useState<DrillView>({ type: "list" });

  // ── "Neuer Kurs" form ───────────────────────────────────────────────────────
  const [newName, setNewName] = useState("");
  const [newStartDate, setNewStartDate] = useState("");
  const [newEndDate, setNewEndDate] = useState("");
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
      .select("course_id, name, start_date, end_date, is_locked, accessCode")
      .order("start_date", { ascending: false });

    if (courseErr || !courseData) {
      setCoursesError("Kurse konnten nicht geladen werden.");
      setIsLoadingCourses(false);
      return;
    }

    // Count enrolled users per course client-side (avoids a GROUP BY query)
    const { data: userCourseData } = await supabase
      .from("user_course")
      .select("course_id");

    const countByCourse: Record<number, number> = {};
    for (const row of userCourseData ?? []) {
      countByCourse[row.course_id] = (countByCourse[row.course_id] ?? 0) + 1;
    }

    setCourses(
      courseData.map((c) => ({
        ...c,
        userCount: countByCourse[c.course_id] ?? 0,
      })),
    );
    setIsLoadingCourses(false);
  }

  async function loadCourseUsers(courseId: number) {
    setIsLoadingUsers(true);
    setCourseUsers([]);

    const { data: enrollments } = await supabase
      .from("user_course")
      .select("profiles_id")
      .eq("course_id", courseId);

    const userIds = (enrollments ?? []).map((e) => e.profiles_id);
    if (userIds.length === 0) {
      setIsLoadingUsers(false);
      return;
    }

    const [profilesRes, submittedDaysRes] = await Promise.all([
      supabase.from("profiles").select("id, email").in("id", userIds),
      supabase
        .from("day")
        .select("profiles_id")
        .eq("course_id", courseId)
        .eq("is_submitted", true),
    ]);

    const emailById: Record<string, string> = {};
    for (const p of profilesRes.data ?? []) {
      emailById[p.id] = p.email ?? p.id.slice(0, 8) + "…";
    }

    const submittedByUser: Record<string, number> = {};
    for (const d of submittedDaysRes.data ?? []) {
      submittedByUser[d.profiles_id] =
        (submittedByUser[d.profiles_id] ?? 0) + 1;
    }

    setCourseUsers(
      userIds.map((id) => ({
        userId: id,
        email: emailById[id] ?? id.slice(0, 8) + "…",
        submittedDays: submittedByUser[id] ?? 0,
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

    // Collect unique lookup IDs, then fetch names in parallel
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
  }

  async function handleCreateCourse(e: React.FormEvent) {
    e.preventDefault();
    setIsCreating(true);
    setCreateError("");
    setCreateSuccess(false);

    if (
      !newName.trim() ||
      !newStartDate ||
      !newEndDate ||
      !newAccessCode.trim()
    ) {
      setCreateError("Bitte alle Felder ausfüllen.");
      setIsCreating(false);
      return;
    }

    if (newEndDate < newStartDate) {
      setCreateError("Das Enddatum muss nach dem Startdatum liegen.");
      setIsCreating(false);
      return;
    }

    const { error } = await supabase.from("course").insert({
      name: newName.trim(),
      start_date: newStartDate,
      end_date: newEndDate,
      accessCode: newAccessCode.trim(),
      is_locked: false,
    });

    if (error) {
      setCreateError("Kurs konnte nicht erstellt werden: " + error.message);
    } else {
      setCreateSuccess(true);
      setNewName("");
      setNewStartDate("");
      setNewEndDate("");
      setNewAccessCode("");
    }
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
                  });
                }
              }}
              className="hover:text-slate-800 transition-colors"
            >
              {view.courseName}
            </button>
            <ChevronRight size={14} className="shrink-0" />
            <span className="font-medium text-slate-800 truncate max-w-[200px]">
              {view.userEmail}
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Startdatum
            </label>
            <input
              type="date"
              value={newStartDate}
              onChange={(e) => {
                setNewStartDate(e.target.value);
                setCreateError("");
                setCreateSuccess(false);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Enddatum
            </label>
            <input
              type="date"
              value={newEndDate}
              onChange={(e) => {
                setNewEndDate(e.target.value);
                setCreateError("");
                setCreateSuccess(false);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
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
        {courses.map((course) => (
          <div
            key={course.course_id}
            className="rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex items-start justify-between gap-4">
              {/* Clickable course name → drill into course detail */}
              <button
                type="button"
                className="flex-1 text-left"
                onClick={() => {
                  setView({
                    type: "course",
                    courseId: course.course_id,
                    courseName: course.name,
                  });
                  void loadCourseUsers(course.course_id);
                }}
              >
                <p className="font-medium text-slate-800 hover:text-blue-600 transition-colors dark:text-slate-100">
                  {course.name}
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {formatDate(course.start_date)} –{" "}
                  {formatDate(course.end_date)}
                  {" · "}
                  {courseDurationLabel(course.start_date, course.end_date)}
                  {" · "}
                  {course.userCount} Teilnehmer
                </p>
              </button>

              {/* Status badge + action button */}
              <div className="flex shrink-0 items-center gap-2">
                {course.is_locked ? (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    Abgeschlossen
                  </span>
                ) : (
                  <>
                    <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      Aktiv
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Kurs „${course.name}" wirklich beenden?`,
                          )
                        ) {
                          void handleLockCourse(course.course_id);
                        }
                      }}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                    >
                      Kurs beenden
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderCourseDetail() {
    if (view.type !== "course") return null;
    if (isLoadingUsers)
      return <p className="text-sm text-slate-500">Wird geladen…</p>;
    if (courseUsers.length === 0) {
      return (
        <p className="text-sm text-slate-500">
          Keine Teilnehmer in diesem Kurs.
        </p>
      );
    }

    return (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left dark:border-slate-800 dark:bg-slate-800/50">
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                E-Mail
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Abgeschlossene Tage
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {courseUsers.map((u) => (
              <tr
                key={u.userId}
                className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40"
              >
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (view.type === "course") {
                        setView({
                          type: "user",
                          courseId: view.courseId,
                          courseName: view.courseName,
                          userId: u.userId,
                          userEmail: u.email,
                        });
                        void loadUserDays(u.userId, view.courseId);
                      }
                    }}
                    className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {u.email}
                  </button>
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                  {u.submittedDays}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
              {/* Day row — click to expand */}
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

              {/* Expanded: time entry table */}
              {isExpanded && (
                <div className="border-t border-slate-100 dark:border-slate-800">
                  {isLoadingEntries ? (
                    <p className="px-4 py-3 text-sm text-slate-500">Lädt…</p>
                  ) : !entries || entries.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-slate-400">
                      Keine Einträge für diesen Tag.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
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
  );
}
