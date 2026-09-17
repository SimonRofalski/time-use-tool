import type { SupabaseClient } from "@supabase/supabase-js";
import { totalPeriodDays } from "@/lib/course-periods";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import type {
  ActivityData,
  AdminStatistics,
  CategoryData,
  CourseProgressData,
  SatisfactionData,
  TrendPoint,
} from "./statistics-types";

// ─── Server-side builder for the admin "Statistiken" tab ─────────────────────
// Runs with the service-role client inside a route handler. It reads raw
// time entries, but returns ONLY aggregates across all (non-excluded) users.
// No per-user value ever leaves this module.

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateShort(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("de-DE", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
  });
}

// ISO date string for N days ago (midnight UTC)
function daysAgoISO(n: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

// Returns YYYY-MM-DD for a given Date
function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Generates an array of date strings for the last N days (oldest first)
function lastNDates(n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - 1 - i));
    return toDateKey(d);
  });
}

// Counts calendar days between two ISO date strings (inclusive)
function courseDurationDays(start: string, end: string): number {
  return (
    Math.round(
      (new Date(end).getTime() - new Date(start).getTime()) / 86_400_000,
    ) + 1
  );
}

// Converts "HH:MM:SS" to total minutes
function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// Truncates long strings for chart axis labels
function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function getSatisfactionSortRank(name: string): number {
  const normalized = name.toLowerCase();
  if (normalized.includes("sehr schlecht")) return 0;
  if (normalized.includes("schlecht")) return 1;
  if (
    normalized.includes("mittelmäßig") ||
    normalized.includes("mittelmaessig")
  )
    return 2;
  if (normalized.includes("gut") && !normalized.includes("sehr gut")) return 3;
  if (normalized.includes("sehr gut")) return 4;
  return 2;
}

// ─── Data processors ──────────────────────────────────────────────────────────

function buildTrendData(
  recentEntries: { day_id: number; created_at: string }[],
  dayById: Record<number, { profiles_id: string }>,
): TrendPoint[] {
  const dates = lastNDates(14);
  // Map: dateKey → Set<profiles_id>
  const usersByDate: Record<string, Set<string>> = {};
  for (const date of dates) usersByDate[date] = new Set();

  for (const entry of recentEntries) {
    const dateKey = toDateKey(new Date(entry.created_at));
    if (!usersByDate[dateKey]) continue;
    const day = dayById[entry.day_id];
    if (day) usersByDate[dateKey].add(day.profiles_id);
  }

  return dates.map((date) => ({
    date: formatDateShort(date),
    users: usersByDate[date].size,
  }));
}

function buildCourseProgress(
  courses: {
    course_id: number;
    name: string;
    start_date: string;
    end_date: string;
    periodDays: number;
  }[],
  userCountByCourse: Record<number, number>,
  days: { course_id: number; is_submitted: boolean }[],
): CourseProgressData[] {
  return courses.map((course) => {
    const enrolled = userCountByCourse[course.course_id] ?? 0;
    const totalPossible = course.periodDays * enrolled;
    const courseDays = days.filter((d) => d.course_id === course.course_id);
    const done = courseDays.filter((d) => d.is_submitted).length;
    const inProgress = courseDays.length - done;
    const open = Math.max(0, totalPossible - courseDays.length);

    return {
      name: truncate(course.name, 22),
      open,
      inProgress,
      done,
    };
  });
}

function buildTopActivities(
  entries: { primary_activity_id: number | null }[],
  activityById: Record<number, string>,
  activityToCategory: Record<number, number>,
): ActivityData[] {
  const counts: Record<number, number> = {};
  for (const e of entries) {
    if (e.primary_activity_id != null) {
      counts[e.primary_activity_id] = (counts[e.primary_activity_id] ?? 0) + 1;
    }
  }
  const total = Object.values(counts).reduce((s, c) => s + c, 0);
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([id, count]) => ({
      name: truncate(activityById[Number(id)] ?? `#${id}`, 28),
      count,
      label:
        total > 0
          ? `${count} (${Math.round((count / total) * 100)}%)`
          : `${count}`,
      categoryId: activityToCategory[Number(id)] ?? 0,
    }));
}

function buildCategoryDistribution(
  entries: {
    primary_activity_id: number | null;
    start_time: string;
    end_time: string;
  }[],
  activityToCategory: Record<number, number>, // activity_id → category_id
  categoryById: Record<number, string>,
): CategoryData[] {
  const minutesByCategory: Record<number, number> = {};
  for (const e of entries) {
    if (e.primary_activity_id == null) continue;
    const catId = activityToCategory[e.primary_activity_id];
    if (catId == null) continue;
    const mins = timeToMinutes(e.end_time) - timeToMinutes(e.start_time);
    if (mins > 0) {
      minutesByCategory[catId] = (minutesByCategory[catId] ?? 0) + mins;
    }
  }

  const totalMinutes = Object.values(minutesByCategory).reduce(
    (sum, mins) => sum + mins,
    0,
  );

  return Object.entries(minutesByCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([id, minutes]) => ({
      categoryId: Number(id),
      name: categoryById[Number(id)] ?? `#${id}`,
      minutes,
      percentage:
        totalMinutes > 0 ? Math.round((minutes / totalMinutes) * 100) : 0,
    }));
}

function buildSatisfactionData(
  entries: { satisfaction_id: number | null }[],
  satisfactions: { satisfaction_id: number; name: string }[],
): SatisfactionData[] {
  const counts: Record<number, number> = {};
  for (const e of entries) {
    if (e.satisfaction_id != null) {
      counts[e.satisfaction_id] = (counts[e.satisfaction_id] ?? 0) + 1;
    }
  }
  const total = Object.values(counts).reduce((s, c) => s + c, 0);
  return [...satisfactions]
    .sort(
      (a, b) =>
        getSatisfactionSortRank(a.name) - getSatisfactionSortRank(b.name),
    )
    .map((s) => {
      const count = counts[s.satisfaction_id] ?? 0;
      return {
        name: truncate(s.name, 20),
        count,
        label:
          total > 0
            ? `${count} (${Math.round((count / total) * 100)}%)`
            : `${count}`,
      };
    });
}

// ─── Loader ───────────────────────────────────────────────────────────────────

export async function loadAdminStatistics(
  admin: SupabaseClient,
): Promise<AdminStatistics> {
  const sevenDaysAgo = daysAgoISO(7);
  const fourteenDaysAgo = daysAgoISO(14);

  type DayLite = {
    day_id: number;
    profiles_id: string;
    course_id: number;
    is_submitted: boolean;
  };
  type RecentEntry = { entry_id: number; day_id: number; created_at: string };
  type EntryLite = {
    day_id: number;
    primary_activity_id: number | null;
    satisfaction_id: number | null;
    start_time: string;
    end_time: string;
  };

  const [
    profilesRes,
    coursesRes,
    periodsRes,
    userCoursesRes,
    allDays,
    newEntriesRes,
    totalEntriesRes,
    recentEntries,
    allEntries,
    activitiesRes,
    subcategoriesRes,
    categoriesRes,
    satisfactionsRes,
  ] = await Promise.all([
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    admin.from("course").select("course_id, name, start_date, end_date, is_locked"),
    admin.from("course_period").select("course_id, start_date, end_date"),
    admin.from("user_course").select("profiles_id, course_id, is_excluded"),
    fetchAllRows<DayLite>((from, to) =>
      admin
        .from("day")
        .select("day_id, profiles_id, course_id, is_submitted")
        .order("day_id")
        .range(from, to),
    ),
    admin
      .from("time_entry")
      .select("entry_id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo),
    admin.from("time_entry").select("entry_id", { count: "exact", head: true }),
    fetchAllRows<RecentEntry>((from, to) =>
      admin
        .from("time_entry")
        .select("entry_id, day_id, created_at")
        .gte("created_at", fourteenDaysAgo)
        .order("entry_id")
        .range(from, to),
    ),
    fetchAllRows<EntryLite>((from, to) =>
      admin
        .from("time_entry")
        .select(
          "day_id, primary_activity_id, satisfaction_id, start_time, end_time",
        )
        .order("entry_id")
        .range(from, to),
    ),
    admin.from("activity").select("activity_id, name, subcategory_id"),
    admin.from("subcategory").select("subcategory_id, category_id"),
    admin.from("category").select("category_id, name"),
    admin.from("satisfaction").select("satisfaction_id, name"),
  ]);

  if (coursesRes.error) {
    throw new Error(coursesRes.error.message);
  }

  const rawCourses = coursesRes.data ?? [];
  const allPeriods = periodsRes.data ?? [];
  const userCourses = userCoursesRes.data ?? [];

  // Group periods by course_id and compute total days per course
  const periodsByCourseId: Record<
    number,
    { start_date: string; end_date: string }[]
  > = {};
  for (const p of allPeriods) {
    if (!periodsByCourseId[p.course_id]) periodsByCourseId[p.course_id] = [];
    periodsByCourseId[p.course_id].push(p);
  }
  const courses = rawCourses.map((c) => {
    const cp = periodsByCourseId[c.course_id] ?? [];
    return {
      ...c,
      periodDays:
        cp.length > 0
          ? totalPeriodDays(cp)
          : courseDurationDays(c.start_date, c.end_date),
    };
  });

  const activities = activitiesRes.data ?? [];
  const subcategories = subcategoriesRes.data ?? [];
  const categories = categoriesRes.data ?? [];
  const satisfactions = satisfactionsRes.data ?? [];

  // Profiles excluded from statistics by admin (is_excluded = true on user_course)
  const excludedProfileIds = new Set<string>();
  for (const uc of userCourses) {
    if (uc.is_excluded) excludedProfileIds.add(uc.profiles_id);
  }

  // Filter days and entries to remove excluded users' data
  const filteredDays = allDays.filter(
    (d) => !excludedProfileIds.has(d.profiles_id),
  );
  const filteredDayIds = new Set(filteredDays.map((d) => d.day_id));
  const filteredEntries = allEntries.filter((e) => filteredDayIds.has(e.day_id));

  const dayById: Record<number, { profiles_id: string }> = {};
  for (const d of allDays) dayById[d.day_id] = { profiles_id: d.profiles_id };

  const userCountByCourse: Record<number, number> = {};
  for (const uc of userCourses) {
    if (!uc.is_excluded) {
      userCountByCourse[uc.course_id] =
        (userCountByCourse[uc.course_id] ?? 0) + 1;
    }
  }

  const activityById: Record<number, string> = {};
  for (const a of activities) activityById[a.activity_id] = a.name;

  // activity_id → category_id (via subcategory)
  const subcatToCategory: Record<number, number> = {};
  for (const s of subcategories)
    subcatToCategory[s.subcategory_id] = s.category_id;

  const activityToCategory: Record<number, number> = {};
  for (const a of activities) {
    const catId = subcatToCategory[a.subcategory_id];
    if (catId != null) activityToCategory[a.activity_id] = catId;
  }

  const categoryById: Record<number, string> = {};
  for (const c of categories) categoryById[c.category_id] = c.name;

  return {
    kpis: {
      totalUsers: profilesRes.count ?? 0,
      activeCourses: courses.filter((c) => !c.is_locked).length,
      closedCourses: courses.filter((c) => c.is_locked).length,
      newEntriesLast7Days: newEntriesRes.count ?? 0,
      totalEntries: totalEntriesRes.count ?? 0,
    },
    trendData: buildTrendData(recentEntries, dayById),
    courseProgress: buildCourseProgress(courses, userCountByCourse, filteredDays),
    topActivities: buildTopActivities(
      filteredEntries,
      activityById,
      activityToCategory,
    ),
    categoryData: buildCategoryDistribution(
      filteredEntries,
      activityToCategory,
      categoryById,
    ),
    satisfactionData: buildSatisfactionData(filteredEntries, satisfactions),
  };
}
