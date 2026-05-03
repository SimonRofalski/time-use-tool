"use client";

import { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
  CartesianGrid,
  LabelList,
} from "recharts";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { totalPeriodDays } from "@/lib/course-periods";
import { CATEGORY_COLORS } from "@/app/(protected)/zeiterfassung/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type KpiData = {
  totalUsers: number;
  activeCourses: number;
  closedCourses: number;
  newEntriesLast7Days: number;
  totalEntries: number;
};

type TrendPoint = {
  date: string; // short label: "Mo 28.3."
  users: number; // distinct users who logged entries that day
};

type CourseProgressData = {
  name: string; // truncated course name
  open: number;
  inProgress: number;
  done: number;
};

type ActivityData = {
  name: string;
  count: number;
  label: string; // e.g. "42 (15%)"
  categoryId: number;
};

type CategoryData = {
  categoryId: number;
  name: string;
  minutes: number;
  color: string;
};

type SatisfactionData = {
  name: string;
  count: number;
  label: string; // e.g. "42 (15%)"
};

// ─── Constants ────────────────────────────────────────────────────────────────

const CHART_COLORS = CATEGORY_COLORS;

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
  return d.toISOString().split("T")[0];
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

function getCategoryColorById(categoryId: number): string {
  if (categoryId <= 0) return "#94A3B8";
  return CATEGORY_COLORS[(categoryId - 1) % CATEGORY_COLORS.length];
}

function getSatisfactionColor(index: number, total: number): string {
  if (total <= 1) return "#f59e0b";
  const t = index / (total - 1);
  const hue = Math.round(0 + t * 120); // red -> green
  return `hsl(${hue} 75% 48%)`;
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
    }))
    .reverse(); // smallest at top so the largest bar reads last (natural reading order)
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

  return Object.entries(minutesByCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([id, minutes]) => ({
      categoryId: Number(id),
      name: categoryById[Number(id)] ?? `#${id}`,
      minutes,
      color: getCategoryColorById(Number(id)),
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
  // Return in DB order (typically worst → best), including zero values
  return satisfactions.map((s) => {
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

// ─── Custom tooltips ──────────────────────────────────────────────────────────

function TrendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs dark:border-slate-700 dark:bg-slate-800">
      <p className="font-semibold text-slate-700 dark:text-slate-200">
        {label}
      </p>
      <p className="mt-1 text-blue-600 dark:text-blue-400">
        {payload[0].value} aktive Nutzer
      </p>
    </div>
  );
}

function CategoryTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  const label = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs dark:border-slate-700 dark:bg-slate-800">
      <p className="font-semibold text-slate-700 dark:text-slate-200">{name}</p>
      <p className="mt-1 text-slate-600 dark:text-slate-300">{label}</p>
    </div>
  );
}

function CourseTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs dark:border-slate-700 dark:bg-slate-800">
      <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1">
        {label}
      </p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.fill }} className="mt-0.5">
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
}

// ─── Chart card wrapper ───────────────────────────────────────────────────────

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      <p className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-200">
        {title}
      </p>
      {children}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function StatistikenTab() {
  const supabase = getSupabaseBrowserClient();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [courseProgress, setCourseProgress] = useState<CourseProgressData[]>(
    [],
  );
  const [topActivities, setTopActivities] = useState<ActivityData[]>([]);
  const [categoryData, setCategoryData] = useState<CategoryData[]>([]);
  const [satisfactionData, setSatisfactionData] = useState<SatisfactionData[]>(
    [],
  );

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    setError("");

    const sevenDaysAgo = daysAgoISO(7);
    const fourteenDaysAgo = daysAgoISO(14);

    // Fetch all raw data in parallel
    const [
      profilesRes,
      coursesRes,
      periodsRes,
      userCoursesRes,
      allDaysRes,
      newEntriesRes,
      totalEntriesRes,
      recentEntriesRes,
      allEntriesRes,
      activitiesRes,
      subcategoriesRes,
      categoriesRes,
      satisfactionsRes,
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true),
      supabase
        .from("course")
        .select("course_id, name, start_date, end_date, is_locked"),
      supabase.from("course_period").select("course_id, start_date, end_date"),
      supabase
        .from("user_course")
        .select("profiles_id, course_id, is_excluded"),
      supabase
        .from("day")
        .select("day_id, profiles_id, course_id, is_submitted"),
      supabase
        .from("time_entry")
        .select("entry_id", { count: "exact", head: true })
        .gte("created_at", sevenDaysAgo),
      supabase
        .from("time_entry")
        .select("entry_id", { count: "exact", head: true }),
      supabase
        .from("time_entry")
        .select("entry_id, day_id, created_at")
        .gte("created_at", fourteenDaysAgo),
      supabase
        .from("time_entry")
        .select(
          "day_id, primary_activity_id, satisfaction_id, start_time, end_time",
        )
        .limit(100000),
      supabase.from("activity").select("activity_id, name, subcategory_id"),
      supabase.from("subcategory").select("subcategory_id, category_id"),
      supabase.from("category").select("category_id, name"),
      supabase.from("satisfaction").select("satisfaction_id, name"),
    ]);

    if (coursesRes.error || allDaysRes.error) {
      setError("Statistiken konnten nicht geladen werden.");
      setIsLoading(false);
      return;
    }

    const rawCourses = coursesRes.data ?? [];
    const allPeriods = periodsRes.data ?? [];
    const userCourses = userCoursesRes.data ?? [];
    const allDays = allDaysRes.data ?? [];

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

    const recentEntries = recentEntriesRes.data ?? [];
    const allEntries = allEntriesRes.data ?? [];
    const activities = activitiesRes.data ?? [];
    const subcategories = subcategoriesRes.data ?? [];
    const categories = categoriesRes.data ?? [];
    const satisfactions = satisfactionsRes.data ?? [];

    // ── Build lookup maps ──────────────────────────────────────────────────────

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
    const filteredEntries = allEntries.filter((e) =>
      filteredDayIds.has(e.day_id),
    );

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

    // ── KPIs ──────────────────────────────────────────────────────────────────

    setKpis({
      totalUsers: profilesRes.count ?? 0,
      activeCourses: courses.filter((c) => !c.is_locked).length,
      closedCourses: courses.filter((c) => c.is_locked).length,
      newEntriesLast7Days: newEntriesRes.count ?? 0,
      totalEntries: totalEntriesRes.count ?? 0,
    });

    // ── Charts ────────────────────────────────────────────────────────────────

    setTrendData(buildTrendData(recentEntries, dayById));
    setCourseProgress(
      buildCourseProgress(courses, userCountByCourse, filteredDays),
    );
    setTopActivities(
      buildTopActivities(filteredEntries, activityById, activityToCategory),
    );
    setCategoryData(
      buildCategoryDistribution(
        filteredEntries,
        activityToCategory,
        categoryById,
      ),
    );
    setSatisfactionData(buildSatisfactionData(filteredEntries, satisfactions));

    setIsLoading(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-slate-500">Statistiken werden geladen…</p>
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
      {/* ── KPI cards ──────────────────────────────────────────────────────── */}
      {kpis && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Gesamtnutzer
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-800 dark:text-slate-100">
              {kpis.totalUsers}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Kurse
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-800 dark:text-slate-100">
              {kpis.activeCourses + kpis.closedCourses}
            </p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              {kpis.activeCourses} aktiv · {kpis.closedCourses} abgeschlossen
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Neue Einträge (7 Tage)
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-800 dark:text-slate-100">
              {kpis.newEntriesLast7Days}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Einträge gesamt
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-800 dark:text-slate-100">
              {kpis.totalEntries.toLocaleString("de-DE")}
            </p>
          </div>
        </div>
      )}

      {/* ── Row 2: Trend + Course progress ─────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Aktive Nutzer Trend */}
        <ChartCard title="Aktive Nutzer — letzte 14 Tage">
          {trendData.every((d) => d.users === 0) ? (
            <p className="py-10 text-center text-sm text-slate-400">
              Keine Aktivität in den letzten 14 Tagen.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={trendData}
                margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#f1f5f9"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  content={<TrendTooltip />}
                  cursor={{ fill: "#f8fafc" }}
                />
                <Bar
                  dataKey="users"
                  fill={CATEGORY_COLORS[0]}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Kursfortschritt */}
        <ChartCard title="Kursfortschritt">
          {courseProgress.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">
              Keine Kursdaten vorhanden.
            </p>
          ) : (
            <ResponsiveContainer
              width="100%"
              height={Math.max(220, courseProgress.length * 52)}
            >
              <BarChart
                data={courseProgress}
                layout="vertical"
                margin={{ top: 4, right: 8, left: 8, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#f1f5f9"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  content={<CourseTooltip />}
                  cursor={{ fill: "#f8fafc" }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={(value) =>
                    value === "open"
                      ? "Offen"
                      : value === "inProgress"
                        ? "Laufend"
                        : "Abgeschlossen"
                  }
                />
                <Bar
                  dataKey="done"
                  name="done"
                  stackId="a"
                  fill="#22c55e"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="inProgress"
                  name="inProgress"
                  stackId="a"
                  fill="#f59e0b"
                />
                <Bar
                  dataKey="open"
                  name="open"
                  stackId="a"
                  fill="#e2e8f0"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* ── Row 3: Top activities + Category donut ──────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Top 7 Aktivitäten */}
        <ChartCard title="Top 7 Haupttätigkeiten">
          {topActivities.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">
              Noch keine Einträge vorhanden.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={topActivities}
                layout="vertical"
                margin={{ top: 4, right: 90, left: 8, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#f1f5f9"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={150}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value) => [`${value} Einträge`, "Anzahl"]}
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                  }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={24}>
                  {topActivities.map((activity, index) => (
                    <Cell
                      key={index}
                      fill={getCategoryColorById(activity.categoryId)}
                    />
                  ))}
                  <LabelList
                    dataKey="label"
                    position="right"
                    style={{ fontSize: 10, fill: "#64748b" }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Aktivitätskategorien (donut) */}
        <ChartCard title="Aktivitätskategorien — Zeitverteilung">
          {categoryData.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">
              Noch keine Einträge vorhanden.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={categoryData}
                  dataKey="minutes"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={95}
                  paddingAngle={2}
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CategoryTooltip />} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11 }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* ── Row 4: Wohlbefinden ─────────────────────────────────────────────── */}
      <ChartCard title="Wohlbefinden-Verteilung">
        {satisfactionData.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">
            Noch keine Einträge vorhanden.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={satisfactionData}
              margin={{ top: 24, right: 8, left: -20, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#f1f5f9"
                vertical={false}
              />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(value) => [`${value} Einträge`, "Anzahl"]}
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={60}>
                {satisfactionData.map((_, index) => (
                  <Cell
                    key={index}
                    fill={getSatisfactionColor(index, satisfactionData.length)}
                  />
                ))}
                <LabelList
                  dataKey="label"
                  position="top"
                  style={{ fontSize: 10, fill: "#64748b" }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}
