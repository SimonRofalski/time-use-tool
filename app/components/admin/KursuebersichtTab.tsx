"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Download, Plus, X } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { CATEGORY_COLORS } from "@/app/(protected)/zeiterfassung/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import ConfirmModal from "./ConfirmModal";
import UserStatsView from "./UserStatsView";
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
  comparison_enabled: boolean;
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

function getCategoryColorById(categoryId: number): string {
  if (categoryId <= 0) return "#94A3B8";
  return CATEGORY_COLORS[(categoryId - 1) % CATEGORY_COLORS.length];
}

function hexToRgbTuple(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return [99, 102, 241];
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
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
  const [userDetailView, setUserDetailView] = useState<"tage" | "statistiken">(
    "tage",
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
  const [isExporting, setIsExporting] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportTarget, setExportTarget] = useState<"admin" | "benutzer">(
    "admin",
  );
  const [exportGranularity, setExportGranularity] = useState<
    "aggregiert" | "roh"
  >("aggregiert");

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
        "course_id, name, start_date, end_date, is_locked, accessCode, anonymized_at, comparison_enabled",
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

  async function handleExportCourse(
    format: "csv" | "xlsx",
    granularity: "aggregiert" | "roh",
  ) {
    if (view.type !== "course") return;
    setIsExporting(true);

    const { courseId, courseName } = view;

    try {
      // Load all categories
      const { data: categories } = await supabase
        .from("category")
        .select("category_id, name")
        .order("category_id");

      // Load activity → category mapping
      const { data: activities } = await supabase
        .from("activity")
        .select("activity_id, name, subcategory:subcategory_id(category_id)");

      const [
        locationsRes,
        socialContextsRes,
        digitalMediaTypesRes,
        satisfactionsRes,
      ] = await Promise.all([
        supabase
          .from("location_transport")
          .select("location_transport_id, name"),
        supabase.from("social_context").select("social_context_id, name"),
        supabase
          .from("digital_media_type")
          .select("digital_media_type_id, name"),
        supabase.from("satisfaction").select("satisfaction_id, name"),
      ]);

      const activityToCategoryId: Record<number, number> = {};
      const activityNameById: Record<number, string> = {};
      for (const a of activities ?? []) {
        const catId =
          a.subcategory &&
          typeof a.subcategory === "object" &&
          "category_id" in a.subcategory
            ? (a.subcategory as { category_id: number }).category_id
            : null;
        if (catId != null) activityToCategoryId[a.activity_id] = catId;
        activityNameById[a.activity_id] = a.name;
      }

      const locationNameById: Record<number, string> = {};
      for (const l of locationsRes.data ?? []) {
        locationNameById[l.location_transport_id] = l.name;
      }
      const socialContextNameById: Record<number, string> = {};
      for (const s of socialContextsRes.data ?? []) {
        socialContextNameById[s.social_context_id] = s.name;
      }
      const digitalMediaTypeNameById: Record<number, string> = {};
      for (const m of digitalMediaTypesRes.data ?? []) {
        digitalMediaTypeNameById[m.digital_media_type_id] = m.name;
      }
      const satisfactionNameById: Record<number, string> = {};
      for (const s of satisfactionsRes.data ?? []) {
        satisfactionNameById[s.satisfaction_id] = s.name;
      }

      const categoryNameById: Record<number, string> = {};
      for (const c of categories ?? [])
        categoryNameById[c.category_id] = c.name;
      const categoryIds = (categories ?? []).map((c) => c.category_id);

      // Load all days for this course
      const { data: allDays } = await supabase
        .from("day")
        .select("day_id, profiles_id, is_submitted, date")
        .eq("course_id", courseId);

      const dayIds = (allDays ?? []).map((d) => d.day_id);
      const dayProfileMap: Record<number, string> = {};
      const dayDateMap: Record<number, string> = {};
      const submittedDayIds = new Set<number>();
      for (const d of allDays ?? []) {
        dayProfileMap[d.day_id] = d.profiles_id;
        dayDateMap[d.day_id] = d.date;
        if (d.is_submitted) submittedDayIds.add(d.day_id);
      }

      // Load time entries
      let entries: {
        entry_id: number;
        day_id: number;
        primary_activity_id: number | null;
        secondary_activity_id: number | null;
        location_transport_id: number | null;
        satisfaction_id: number | null;
        digital_media_used: boolean | null;
        start_time: string;
        end_time: string;
        time_entry_digital_media_type?: {
          digital_media_type_id: number | null;
        }[];
        time_entry_social_context?: { social_context_id: number | null }[];
      }[] = [];
      if (dayIds.length > 0) {
        const { data: entryData } = await supabase
          .from("time_entry")
          .select(
            "entry_id, day_id, start_time, end_time, primary_activity_id, secondary_activity_id, location_transport_id, satisfaction_id, digital_media_used, time_entry_digital_media_type(digital_media_type_id), time_entry_social_context(social_context_id)",
          )
          .in("day_id", dayIds)
          .order("start_time", { ascending: true });
        entries = entryData ?? [];
      }

      const sanitize = (v: string | number | null | undefined) =>
        String(v ?? "").replaceAll(";", ",");
      const minutesFromTimes = (start: string, end: string) => {
        const [sh, sm] = start.split(":").map(Number);
        const [eh, em] = end.split(":").map(Number);
        const startMin = sh * 60 + sm;
        const endMin =
          eh === 0 && em === 0 && startMin > 0 ? 1440 : eh * 60 + em;
        const mins = endMin - startMin;
        return mins > 0 ? mins : 0;
      };

      let rows: Record<string, string | number>[] = [];

      if (granularity === "aggregiert") {
        // Aggregate minutes per user per category (submitted days only)
        const minutesByUserCategory: Record<
          string,
          Record<number, number>
        > = {};
        for (const e of entries) {
          if (!submittedDayIds.has(e.day_id)) continue;
          const profileId = dayProfileMap[e.day_id];
          if (!profileId || e.primary_activity_id == null) continue;
          const catId = activityToCategoryId[e.primary_activity_id];
          if (catId == null) continue;
          const mins = minutesFromTimes(e.start_time, e.end_time);
          if (mins <= 0) continue;
          if (!minutesByUserCategory[profileId])
            minutesByUserCategory[profileId] = {};
          minutesByUserCategory[profileId][catId] =
            (minutesByUserCategory[profileId][catId] ?? 0) + mins;
        }

        // Submitted days per user
        const submittedDaysByUser: Record<string, number> = {};
        for (const d of allDays ?? []) {
          if (d.is_submitted) {
            submittedDaysByUser[d.profiles_id] =
              (submittedDaysByUser[d.profiles_id] ?? 0) + 1;
          }
        }

        rows = courseUsers.map((u) => {
          const row: Record<string, string | number> = {
            Vorname: u.firstName ?? "",
            Nachname: u.lastName ?? "",
            "Tage erfasst": submittedDaysByUser[u.userId] ?? 0,
          };
          for (const catId of categoryIds) {
            const mins = minutesByUserCategory[u.userId]?.[catId] ?? 0;
            row[`${categoryNameById[catId]} (h)`] =
              Math.round((mins / 60) * 10) / 10;
          }
          return row;
        });
      } else {
        // Raw export: one row per submitted time entry
        const userById: Record<
          string,
          { firstName: string | null; lastName: string | null }
        > = {};
        for (const u of courseUsers) {
          userById[u.userId] = { firstName: u.firstName, lastName: u.lastName };
        }

        rows = entries
          .filter((e) => submittedDayIds.has(e.day_id))
          .map((e) => {
            const userId = dayProfileMap[e.day_id] ?? "";
            const user = userById[userId];
            const minutes = minutesFromTimes(e.start_time, e.end_time);
            const categoryId =
              e.primary_activity_id != null
                ? activityToCategoryId[e.primary_activity_id]
                : undefined;
            return {
              Vorname: user?.firstName ?? "",
              Nachname: user?.lastName ?? "",
              Datum: dayDateMap[e.day_id]
                ? formatDate(dayDateMap[e.day_id])
                : "",
              Start: e.start_time,
              Ende: e.end_time,
              "Dauer (min)": minutes,
              "Dauer (h)": Math.round((minutes / 60) * 100) / 100,
              Kategorie:
                categoryId != null ? (categoryNameById[categoryId] ?? "") : "",
              Aktivitaet:
                e.primary_activity_id != null
                  ? (activityNameById[e.primary_activity_id] ?? "")
                  : "",
              Nebenaktivitaet:
                e.secondary_activity_id != null
                  ? (activityNameById[e.secondary_activity_id] ?? "")
                  : "",
              "Digitale Medien genutzt": e.digital_media_used ? "Ja" : "Nein",
              Medienarten: (e.time_entry_digital_media_type ?? [])
                .map((m) => m.digital_media_type_id)
                .filter((id): id is number => typeof id === "number")
                .map((id) => digitalMediaTypeNameById[id] ?? `#${id}`)
                .join(", "),
              "Ort / Transport":
                e.location_transport_id != null
                  ? (locationNameById[e.location_transport_id] ?? "")
                  : "",
              "Sozialer Kontext": (e.time_entry_social_context ?? [])
                .map((s) => s.social_context_id)
                .filter((id): id is number => typeof id === "number")
                .map((id) => socialContextNameById[id] ?? `#${id}`)
                .join(", "),
              Zufriedenheit:
                e.satisfaction_id != null
                  ? (satisfactionNameById[e.satisfaction_id] ?? "")
                  : "",
            };
          });
      }

      const headers = Object.keys(rows[0] ?? {});
      const safeCourseName = courseName.replace(/[^\w\- äöüÄÖÜß]/g, "").trim();
      const modeSuffix = granularity === "aggregiert" ? "Aggregiert" : "Roh";

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
    } finally {
      setIsExporting(false);
    }
  }

  async function handleExportUserPdf() {
    if (view.type !== "course") return;
    setIsExporting(true);

    const { courseId, courseName } = view;

    try {
      const [{ data: categories }, { data: activities }, { data: allDays }] =
        await Promise.all([
          supabase
            .from("category")
            .select("category_id, name")
            .order("category_id"),
          supabase
            .from("activity")
            .select(
              "activity_id, name, subcategory:subcategory_id(category_id)",
            ),
          supabase
            .from("day")
            .select("day_id, profiles_id, is_submitted")
            .eq("course_id", courseId),
        ]);

      const { data: digitalMediaTypes } = await supabase
        .from("digital_media_type")
        .select("digital_media_type_id, name");

      const categoryNameById: Record<number, string> = {};
      const categoryIds = (categories ?? []).map((c) => {
        categoryNameById[c.category_id] = c.name;
        return c.category_id;
      });

      const activityNameById: Record<number, string> = {};
      const activityToCategoryId: Record<number, number> = {};
      for (const a of activities ?? []) {
        activityNameById[a.activity_id] = a.name;
        const catId =
          a.subcategory &&
          typeof a.subcategory === "object" &&
          "category_id" in a.subcategory
            ? (a.subcategory as { category_id: number }).category_id
            : null;
        if (catId != null) activityToCategoryId[a.activity_id] = catId;
      }

      const digitalMediaTypeNameById: Record<number, string> = {};
      for (const m of digitalMediaTypes ?? []) {
        digitalMediaTypeNameById[m.digital_media_type_id] = m.name;
      }

      const dayProfileMap: Record<number, string> = {};
      const submittedDayIds = new Set<number>();
      for (const d of allDays ?? []) {
        dayProfileMap[d.day_id] = d.profiles_id;
        if (d.is_submitted) submittedDayIds.add(d.day_id);
      }

      const dayIds = Array.from(submittedDayIds);
      let entries: {
        entry_id: number;
        day_id: number;
        primary_activity_id: number | null;
        digital_media_used: boolean | null;
        start_time: string;
        end_time: string;
        time_entry_digital_media_type?: {
          digital_media_type_id: number | null;
        }[];
      }[] = [];
      if (dayIds.length > 0) {
        const { data } = await supabase
          .from("time_entry")
          .select(
            "entry_id, day_id, primary_activity_id, digital_media_used, start_time, end_time, time_entry_digital_media_type(digital_media_type_id)",
          )
          .in("day_id", dayIds);
        entries = data ?? [];
      }

      const minutesFromTimes = (start: string, end: string) => {
        const [sh, sm] = start.split(":").map(Number);
        const [eh, em] = end.split(":").map(Number);
        const startMin = sh * 60 + sm;
        const endMin =
          eh === 0 && em === 0 && startMin > 0 ? 1440 : eh * 60 + em;
        const mins = endMin - startMin;
        return mins > 0 ? mins : 0;
      };

      const submittedDaysByUser: Record<string, number> = {};
      for (const d of allDays ?? []) {
        if (d.is_submitted) {
          submittedDaysByUser[d.profiles_id] =
            (submittedDaysByUser[d.profiles_id] ?? 0) + 1;
        }
      }

      const minutesByUserCategory: Record<string, Record<number, number>> = {};
      const minutesByUserActivity: Record<string, Record<number, number>> = {};
      const minutesByUserDevice: Record<string, Record<string, number>> = {};
      const withItMinutesByUser: Record<string, number> = {};
      const withoutItMinutesByUser: Record<string, number> = {};
      for (const e of entries) {
        const userId = dayProfileMap[e.day_id];
        if (!userId || e.primary_activity_id == null) continue;
        const mins = minutesFromTimes(e.start_time, e.end_time);
        if (mins <= 0) continue;

        const catId = activityToCategoryId[e.primary_activity_id];
        if (catId != null) {
          if (!minutesByUserCategory[userId])
            minutesByUserCategory[userId] = {};
          minutesByUserCategory[userId][catId] =
            (minutesByUserCategory[userId][catId] ?? 0) + mins;
        }

        if (!minutesByUserActivity[userId]) minutesByUserActivity[userId] = {};
        minutesByUserActivity[userId][e.primary_activity_id] =
          (minutesByUserActivity[userId][e.primary_activity_id] ?? 0) + mins;

        if (!minutesByUserDevice[userId]) minutesByUserDevice[userId] = {};
        if (!e.digital_media_used) {
          withoutItMinutesByUser[userId] =
            (withoutItMinutesByUser[userId] ?? 0) + mins;
          minutesByUserDevice[userId]["Ohne IT-Gerät"] =
            (minutesByUserDevice[userId]["Ohne IT-Gerät"] ?? 0) + mins;
        } else {
          withItMinutesByUser[userId] =
            (withItMinutesByUser[userId] ?? 0) + mins;
          const mediaIds = (e.time_entry_digital_media_type ?? [])
            .map((m) => m.digital_media_type_id)
            .filter((id): id is number => typeof id === "number");

          if (mediaIds.length === 0) {
            minutesByUserDevice[userId]["IT-Gerät (nicht spezifiziert)"] =
              (minutesByUserDevice[userId]["IT-Gerät (nicht spezifiziert)"] ??
                0) + mins;
          } else {
            for (const mediaId of mediaIds) {
              const name =
                digitalMediaTypeNameById[mediaId] ?? `Gerät ${mediaId}`;
              minutesByUserDevice[userId][name] =
                (minutesByUserDevice[userId][name] ?? 0) + mins;
            }
          }
        }
      }

      const usersWithData = courseUsers.filter(
        (u) => !u.isExcluded && (submittedDaysByUser[u.userId] ?? 0) > 0,
      );
      if (usersWithData.length === 0) {
        window.alert(
          "Keine abgegebenen Nutzerdaten für den PDF-Export gefunden.",
        );
        return;
      }

      const userCount = usersWithData.length;
      const courseAvgMinutesByCategory: Record<number, number> = {};
      for (const catId of categoryIds) {
        let sum = 0;
        for (const u of usersWithData) {
          sum += minutesByUserCategory[u.userId]?.[catId] ?? 0;
        }
        courseAvgMinutesByCategory[catId] = sum / userCount;
      }

      const safeCourseName = courseName.replace(/[^\w\- äöüÄÖÜß]/g, "").trim();
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const generatedAt = new Date().toLocaleDateString("de-DE");

      const drawComparisonChart = (
        title: string,
        startY: number,
        rows: {
          label: string;
          userValue: number;
          avgValue: number;
          color: [number, number, number];
        }[],
      ) => {
        doc.setFontSize(11);
        doc.text(title, 14, startY);
        doc.setFontSize(8);
        doc.setFillColor(15, 118, 110);
        doc.rect(14, startY + 2, 3, 3, "F");
        doc.text("Kursschnitt", 19, startY + 4.5);

        const topRows = rows.slice(0, 5);
        const maxValue = Math.max(
          ...topRows.flatMap((r) => [r.userValue, r.avgValue]),
          1,
        );
        let y = startY + 7;

        topRows.forEach((row) => {
          const label =
            row.label.length > 22 ? `${row.label.slice(0, 22)}...` : row.label;
          const baseX = 62;
          const fullWidth = 74;
          const userW = (row.userValue / maxValue) * fullWidth;
          const avgW = (row.avgValue / maxValue) * fullWidth;

          doc.setFontSize(8);
          doc.text(label, 14, y + 4);

          doc.setDrawColor(203, 213, 225);
          doc.rect(baseX, y, fullWidth, 3);
          doc.setFillColor(row.color[0], row.color[1], row.color[2]);
          doc.rect(baseX, y, userW, 3, "F");

          doc.setDrawColor(203, 213, 225);
          doc.rect(baseX, y + 4, fullWidth, 3);
          doc.setFillColor(15, 118, 110);
          doc.rect(baseX, y + 4, avgW, 3, "F");

          doc.text(
            `${Math.round(row.userValue * 10) / 10} / ${Math.round(row.avgValue * 10) / 10} h`,
            140,
            y + 4,
          );
          y += 10;
        });

        return y;
      };

      usersWithData.forEach((u, index) => {
        if (index > 0) doc.addPage();

        const fullName =
          [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
        const submittedDays = submittedDaysByUser[u.userId] ?? 0;
        const userCategoryMinutes = minutesByUserCategory[u.userId] ?? {};
        const userActivityMinutes = minutesByUserActivity[u.userId] ?? {};
        const totalMinutes = Object.values(userCategoryMinutes).reduce(
          (acc, m) => acc + m,
          0,
        );

        doc.setFontSize(14);
        doc.text("Benutzer-Auswertung", 14, 16);
        doc.setFontSize(10);
        doc.text(`Kurs: ${courseName}`, 14, 23);
        doc.text(`Teilnehmer: ${fullName}`, 14, 28);
        doc.text(`Erstellt am: ${generatedAt}`, 14, 33);

        doc.setFontSize(10);
        doc.text(`Abgegebene Tage: ${submittedDays}`, 14, 40);
        doc.text(
          `Gesamtstunden: ${Math.round((totalMinutes / 60) * 10) / 10}`,
          14,
          45,
        );

        const comparisonHoursData = categoryIds
          .map((catId) => ({
            label: categoryNameById[catId] ?? `Kategorie ${catId}`,
            userValue:
              Math.round(((userCategoryMinutes[catId] ?? 0) / 60) * 10) / 10,
            avgValue:
              Math.round((courseAvgMinutesByCategory[catId] / 60) * 10) / 10,
            color: hexToRgbTuple(getCategoryColorById(catId)),
          }))
          .filter((r) => r.userValue > 0 || r.avgValue > 0)
          .sort((a, b) => b.userValue - a.userValue);

        const chartEndY = drawComparisonChart(
          "Vergleich mit Kursschnitt",
          50,
          comparisonHoursData,
        );

        const categoryRows = categoryIds
          .map((catId) => {
            const mins = userCategoryMinutes[catId] ?? 0;
            const hours = Math.round((mins / 60) * 10) / 10;
            const share =
              totalMinutes > 0 ? Math.round((mins / totalMinutes) * 100) : 0;
            const avgHours =
              Math.round((courseAvgMinutesByCategory[catId] / 60) * 10) / 10;
            const diff = Math.round((hours - avgHours) * 10) / 10;
            return [
              categoryNameById[catId] ?? `Kategorie ${catId}`,
              String(hours),
              `${share}%`,
              String(avgHours),
              `${diff >= 0 ? "+" : ""}${diff}`,
            ];
          })
          .filter((row) => Number(row[1]) > 0);

        const activityRows = Object.entries(userActivityMinutes)
          .map(([activityId, mins]) => {
            const actId = Number(activityId);
            const catId = activityToCategoryId[actId];
            const hours = Math.round((mins / 60) * 10) / 10;
            const share =
              totalMinutes > 0 ? Math.round((mins / totalMinutes) * 100) : 0;
            return [
              catId != null
                ? (categoryNameById[catId] ?? `Kategorie ${catId}`)
                : "Unbekannt",
              activityNameById[actId] ?? `Aktivitaet ${activityId}`,
              String(hours),
              `${share}%`,
            ];
          })
          .sort((a, b) => Number(b[2]) - Number(a[2]));

        const topActivityRows = activityRows.slice(0, 5);

        autoTable(doc, {
          startY: chartEndY + 6,
          head: [
            ["Kategorie", "Stunden", "Anteil", "Kursschnitt (h)", "Differenz"],
          ],
          body:
            categoryRows.length > 0
              ? categoryRows
              : [["Keine erfassten Kategorien", "0", "0%", "0", "0"]],
          styles: { fontSize: 9 },
          headStyles: { fillColor: [71, 85, 105] },
        });

        const afterCategoryTableY =
          ((doc as unknown as { lastAutoTable?: { finalY?: number } })
            .lastAutoTable?.finalY ?? chartEndY + 6) + 6;
        doc.setFontSize(11);
        doc.text("Top 5 Aktivitaeten", 14, afterCategoryTableY);

        autoTable(doc, {
          startY: afterCategoryTableY + 2,
          head: [["Kategorie", "Aktivitaet", "Stunden", "Anteil"]],
          body:
            topActivityRows.length > 0
              ? topActivityRows
              : [["-", "Keine Aktivitaeten", "0", "0%"]],
          styles: { fontSize: 8 },
          headStyles: { fillColor: [59, 130, 246] },
          columnStyles: {
            0: { cellWidth: 38 },
            1: { cellWidth: 78 },
            2: { cellWidth: 22, halign: "right" },
            3: { cellWidth: 18, halign: "right" },
          },
        });

        const withItHours =
          Math.round(((withItMinutesByUser[u.userId] ?? 0) / 60) * 10) / 10;
        const withoutItHours =
          Math.round(((withoutItMinutesByUser[u.userId] ?? 0) / 60) * 10) / 10;
        const totalItHours = withItHours + withoutItHours;
        const withItPercent =
          totalItHours > 0 ? Math.round((withItHours / totalItHours) * 100) : 0;
        const withoutItPercent =
          totalItHours > 0
            ? Math.round((withoutItHours / totalItHours) * 100)
            : 0;
        const deviceSplitRows = [
          ["Mit IT-Nutzung", String(withItHours), `${withItPercent}%`],
          ["Ohne IT-Nutzung", String(withoutItHours), `${withoutItPercent}%`],
        ];

        const deviceRows = Object.entries(minutesByUserDevice[u.userId] ?? {})
          .map(([deviceName, mins]) => [
            deviceName,
            String(Math.round((mins / 60) * 10) / 10),
          ])
          .filter((row) => row[0] !== "Ohne IT-Gerät")
          .sort((a, b) => Number(b[1]) - Number(a[1]));

        const afterActivityTableY =
          ((doc as unknown as { lastAutoTable?: { finalY?: number } })
            .lastAutoTable?.finalY ?? afterCategoryTableY + 2) + 8;
        doc.setFontSize(11);
        doc.text("Geräte-Nutzung", 14, afterActivityTableY);

        autoTable(doc, {
          startY: afterActivityTableY + 2,
          head: [["IT-Nutzung", "Stunden", "Anteil"]],
          body: deviceSplitRows,
          styles: { fontSize: 9 },
          headStyles: { fillColor: [30, 64, 175] },
        });

        const afterDeviceSplitY =
          ((doc as unknown as { lastAutoTable?: { finalY?: number } })
            .lastAutoTable?.finalY ?? afterActivityTableY + 2) + 6;
        doc.setFontSize(11);
        doc.text("Geräte innerhalb IT-Nutzung", 14, afterDeviceSplitY);

        autoTable(doc, {
          startY: afterDeviceSplitY + 2,
          head: [["Geraet", "Stunden"]],
          body:
            deviceRows.length > 0
              ? deviceRows
              : [["Keine detaillierten Gerätedaten", "0"]],
          styles: { fontSize: 9 },
          headStyles: { fillColor: [51, 65, 85] },
        });
      });

      doc.save(`${safeCourseName}_Benutzerauswertungen.pdf`);
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
        comparison_enabled: false,
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
                <div className="flex flex-wrap items-center gap-1.5 sm:justify-end sm:gap-2">
                  {course.anonymized_at && (
                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 sm:px-2.5 sm:py-1 sm:text-xs">
                      Anonymisiert
                    </span>
                  )}
                  {course.comparison_enabled ? (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 sm:px-2.5 sm:py-1 sm:text-xs">
                      Kursvergleich frei
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400 sm:px-2.5 sm:py-1 sm:text-xs">
                      Kursvergleich gesperrt
                    </span>
                  )}
                </div>
              </div>

              {/* Access code row */}
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800 sm:mt-3 sm:pt-3">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
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

                {!course.is_locked && (
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
            Zur Kursuebersicht
          </button>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              disabled={isExporting || courseUsers.length === 0}
              onClick={() => setIsExportModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
            >
              <Download size={13} />
              Datenexport
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
                ? "Kursvergleich sperren"
                : "Kursvergleich freigeben"}
            </button>

            {!isAnonymized && (
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
            )}
          </div>
        </div>

        {isExportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    Datenexport
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Waehle Exporttyp und Dateiformat für diesen Kurs.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => setIsExportModalOpen(false)}
                  className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                  aria-label="Exportdialog schliessen"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                    Export für
                  </p>
                  <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
                    <button
                      type="button"
                      onClick={() => setExportTarget("admin")}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                        exportTarget === "admin"
                          ? "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100"
                          : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                      }`}
                    >
                      Admin
                    </button>
                    <button
                      type="button"
                      onClick={() => setExportTarget("benutzer")}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                        exportTarget === "benutzer"
                          ? "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100"
                          : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                      }`}
                    >
                      Benutzer
                    </button>
                  </div>
                </div>

                {exportTarget === "admin" ? (
                  <>
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                        Inhalt
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
                          Aggregiert
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
                          Rohdaten
                        </button>
                      </div>
                    </div>

                    <div>
                      <p className="mb-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                        Format
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={isExporting}
                          onClick={async () => {
                            await handleExportCourse("csv", exportGranularity);
                            setIsExportModalOpen(false);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                        >
                          <Download size={13} />
                          {isExporting ? "Exportiere..." : "CSV"}
                        </button>
                        <button
                          type="button"
                          disabled={isExporting}
                          onClick={async () => {
                            await handleExportCourse("xlsx", exportGranularity);
                            setIsExportModalOpen(false);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                        >
                          <Download size={13} />
                          {isExporting ? "Exportiere..." : "Excel"}
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40">
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Erstellt ein PDF mit einer eigenen Auswertungsseite pro
                      Teilnehmer (nur abgegebene Tage): Zeitverteilung,
                      Top-Aktivitaeten und Vergleich mit dem Kursschnitt.
                    </p>
                    <div className="mt-3">
                      <button
                        type="button"
                        disabled={isExporting}
                        onClick={async () => {
                          await handleExportUserPdf();
                          setIsExportModalOpen(false);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                      >
                        <Download size={13} />
                        {isExporting ? "Erstelle PDF..." : "PDF erstellen"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
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
                                isComparisonEnabled: view.isComparisonEnabled,
                                userId: u.userId,
                                userDisplayName: displayLabel,
                              });
                              setUserDetailView("tage");
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
            Zurueck zum Kurs
          </button>
          <button
            type="button"
            onClick={() => setView({ type: "list" })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ChevronLeft size={13} />
            Zur Kursuebersicht
          </button>
        </div>

        {/* View toggle */}
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1 max-w-xs">
          <button
            type="button"
            onClick={() => setUserDetailView("tage")}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
              userDetailView === "tage"
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Tagesübersicht
          </button>
          <button
            type="button"
            onClick={() => setUserDetailView("statistiken")}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
              userDetailView === "statistiken"
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Zeitverteilung
          </button>
        </div>

        {userDetailView === "statistiken" ? (
          <UserStatsView userId={view.userId} courseId={view.courseId} />
        ) : (
          renderUserDayList()
        )}
      </div>
    );
  }

  function renderUserDayList() {
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
