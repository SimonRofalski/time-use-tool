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
import { CATEGORY_COLORS } from "@/app/(protected)/zeiterfassung/types";
import type {
  ActivityData,
  AdminStatistics,
  CategoryData,
  CourseProgressData,
  KpiData,
  SatisfactionData,
  TrendPoint,
} from "@/lib/admin/statistics-types";

// ─── Datenschutz ──────────────────────────────────────────────────────────────
// Alle Werte hier sind Aggregate über alle (nicht ausgeschlossenen) Nutzenden.
// Die Berechnung passiert serverseitig in /api/admin/statistics — der Browser
// des Admins erhält keine einzelnen Zeiteinträge und keinen Personenbezug.

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  const { name, value, payload: datum } = payload[0];
  const data = datum as CategoryData;
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  const label = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs dark:border-slate-700 dark:bg-slate-800">
      <p className="font-semibold text-slate-700 dark:text-slate-200">{name}</p>
      <p className="mt-1 text-slate-600 dark:text-slate-300">{label}</p>
      <p className="mt-1 text-slate-500 dark:text-slate-400">
        {data.percentage}%
      </p>
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

    try {
      const res = await fetch("/api/admin/statistics", { cache: "no-store" });
      if (!res.ok) {
        setError("Statistiken konnten nicht geladen werden.");
        setIsLoading(false);
        return;
      }
      const data = (await res.json()) as AdminStatistics;
      setKpis(data.kpis);
      setTrendData(data.trendData);
      setCourseProgress(data.courseProgress);
      setTopActivities(data.topActivities);
      setCategoryData(data.categoryData);
      setSatisfactionData(data.satisfactionData);
    } catch {
      setError("Statistiken konnten nicht geladen werden.");
    }

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
                    <Cell key={index} fill={getCategoryColorById(entry.categoryId)} />
                  ))}
                </Pie>
                <Tooltip content={<CategoryTooltip />} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={(value, entry: any) =>
                    `${value} ${entry?.payload?.percentage ?? 0}%`
                  }
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
