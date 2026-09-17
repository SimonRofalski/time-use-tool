// ─── Shared types for the aggregated admin statistics ────────────────────────
// Used by both the server-side builder (lib/admin/statistics.ts) and the
// client chart component (app/components/admin/StatistikenTab.tsx).
// Every value here is an aggregate over many users — nothing is per person.

export type KpiData = {
  totalUsers: number;
  activeCourses: number;
  closedCourses: number;
  newEntriesLast7Days: number;
  totalEntries: number;
};

export type TrendPoint = {
  date: string; // short label: "Mo 28.3."
  users: number; // distinct users who logged entries that day
};

export type CourseProgressData = {
  name: string; // truncated course name
  open: number;
  inProgress: number;
  done: number;
};

export type ActivityData = {
  name: string;
  count: number;
  label: string; // e.g. "42 (15%)"
  categoryId: number;
};

export type CategoryData = {
  categoryId: number;
  name: string;
  minutes: number;
  percentage: number;
};

export type SatisfactionData = {
  name: string;
  count: number;
  label: string; // e.g. "42 (15%)"
};

export type AdminStatistics = {
  kpis: KpiData;
  trendData: TrendPoint[];
  courseProgress: CourseProgressData[];
  topActivities: ActivityData[];
  categoryData: CategoryData[];
  satisfactionData: SatisfactionData[];
};
