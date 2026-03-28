"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { CategoryRow, SubcategoryRow, DayBarData } from "./types";

// ─── Constants ────────────────────────────────────────────────────────────────

// One color per category, assigned by category index (stable across renders)
const CATEGORY_COLORS = [
  "#3b82f6", // blue-500
  "#10b981", // emerald-500
  "#f59e0b", // amber-500
  "#ef4444", // red-500
  "#8b5cf6", // violet-500
  "#06b6d4", // cyan-500
  "#f97316", // orange-500
  "#84cc16", // lime-500
  "#ec4899", // pink-500
  "#6366f1", // indigo-500
  "#14b8a6", // teal-500
  "#a855f7", // purple-500
];

// Color used for days that have not been submitted yet
const UNSUBMITTED_BAR_COLOR = "#e2e8f0"; // slate-200

// Maximum minutes in a full day (24h × 60min)
const MINUTES_PER_DAY = 1440;

// ─── Pure helpers ─────────────────────────────────────────────────────────────

// Converts minutes to a "Xh Ym" display string, e.g. 150 → "2h 30m"
function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

// Formats an ISO date to a short German label for the chart X-axis: "Mo 28.3."
function formatDateShort(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
  });
}

// Returns the color for a given category by its index in the sorted list
function getCategoryColor(index: number): string {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

// ─── Custom tooltip for the bar chart ────────────────────────────────────────

// Shows date + per-category minutes when hovering a bar
function ChartTooltip({
  active,
  payload,
  label,
  categoryNames,
  categoryColorMap,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
  categoryNames: string[];
  categoryColorMap: Record<string, string>;
}) {
  if (!active || !payload || payload.length === 0) return null;

  // Check if this is an unsubmitted day (only has the "unsubmitted" key)
  const isUnsubmitted = payload.some((p) => p.dataKey === "unsubmitted");
  if (isUnsubmitted) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs">
        <p className="font-semibold text-slate-700">{label}</p>
        <p className="mt-1 text-slate-400">Noch nicht eingereicht</p>
      </div>
    );
  }

  // Only show categories with actual time recorded
  const entries = payload.filter(
    (p) => categoryNames.includes(p.dataKey) && p.value > 0
  );

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs min-w-[160px]">
      <p className="font-semibold text-slate-700 mb-2">{label}</p>
      {entries.map((entry) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
              style={{ backgroundColor: categoryColorMap[entry.dataKey] }}
            />
            <span className="text-slate-600">{entry.dataKey}</span>
          </div>
          <span className="font-medium text-slate-800">
            {formatMinutes(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── DrillDownTable ───────────────────────────────────────────────────────────

// Renders the accordion-style drill-down table for a single subcategory row
function SubcategoryAccordion({
  sub,
  totalMinutes,
  color,
  onToggle,
}: {
  sub: SubcategoryRow;
  totalMinutes: number;
  color: string;
  onToggle: () => void;
}) {
  return (
    <>
      {/* Subcategory row */}
      <tr
        className="cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={onToggle}
      >
        {/* Indent + expand icon */}
        <td className="py-2 pl-8 pr-2">
          <div className="flex items-center gap-1.5 text-slate-600 text-sm">
            {sub.activities.length > 0 ? (
              sub.isExpanded ? (
                <ChevronDown size={14} className="flex-shrink-0 text-slate-400" />
              ) : (
                <ChevronRight size={14} className="flex-shrink-0 text-slate-400" />
              )
            ) : (
              <span className="w-3.5" />
            )}
            {sub.name}
          </div>
        </td>
        <td className="py-2 px-3 text-sm text-slate-700 text-right whitespace-nowrap">
          {formatMinutes(sub.totalMinutes)}
        </td>
        <td className="py-2 px-3 text-sm text-slate-500 text-right whitespace-nowrap">
          {sub.percentOfTotal.toFixed(1)}%
        </td>
        {/* Mini progress bar */}
        <td className="py-2 pl-3 pr-4 w-32">
          <div className="h-1.5 w-full rounded-full bg-slate-100">
            <div
              className="h-1.5 rounded-full transition-all"
              style={{
                width: `${Math.min(sub.percentOfTotal, 100)}%`,
                backgroundColor: color,
                opacity: 0.6,
              }}
            />
          </div>
        </td>
      </tr>

      {/* Activity rows — visible only when subcategory is expanded */}
      {sub.isExpanded &&
        sub.activities.map((act) => (
          <tr key={act.activityId} className="bg-slate-50/50">
            <td className="py-1.5 pl-14 pr-2 text-xs text-slate-500">
              {act.name}
            </td>
            <td className="py-1.5 px-3 text-xs text-slate-500 text-right whitespace-nowrap">
              {formatMinutes(act.totalMinutes)}
            </td>
            <td className="py-1.5 px-3 text-xs text-slate-400 text-right whitespace-nowrap">
              {act.percentOfTotal.toFixed(1)}%
            </td>
            <td className="py-1.5 pl-3 pr-4 w-32">
              <div className="h-1 w-full rounded-full bg-slate-100">
                <div
                  className="h-1 rounded-full"
                  style={{
                    width: `${Math.min(act.percentOfTotal, 100)}%`,
                    backgroundColor: color,
                    opacity: 0.4,
                  }}
                />
              </div>
            </td>
          </tr>
        ))}
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ZeitverteilungTab({
  barData,
  categoryRows,
  categoryNames,
  onToggleCategory,
  onToggleSubcategory,
}: {
  // barData: one entry per course day, with per-category minute values
  barData: DayBarData[];
  // categoryRows: the drill-down tree, sorted by totalMinutes descending
  categoryRows: CategoryRow[];
  // categoryNames: ordered list of category names (same order as categoryRows)
  categoryNames: string[];
  // Callbacks to toggle accordion state (passed up to parent for state management)
  onToggleCategory: (categoryId: number) => void;
  onToggleSubcategory: (categoryId: number, subcategoryId: number) => void;
}) {
  // Build a stable color map: category name → hex color
  const categoryColorMap: Record<string, string> = {};
  categoryNames.forEach((name, index) => {
    categoryColorMap[name] = getCategoryColor(index);
  });

  // Total tracked minutes across all categories (for display in the table header)
  const grandTotalMinutes = categoryRows.reduce(
    (sum, row) => sum + row.totalMinutes,
    0
  );

  return (
    <div className="space-y-6">
      {/* ── Stacked bar chart ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">
          Tägliche Zeitverteilung
        </h3>

        {barData.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">
            Noch keine eingereichten Tage vorhanden.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={barData}
              margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
              barCategoryGap="20%"
            >
              <XAxis
                dataKey="date"
                tickFormatter={formatDateShort}
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => `${Math.round(v / 60)}h`}
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
                domain={[0, MINUTES_PER_DAY]}
                ticks={[0, 360, 720, 1080, 1440]}
              />
              <Tooltip
                content={
                  <ChartTooltip
                    categoryNames={categoryNames}
                    categoryColorMap={categoryColorMap}
                  />
                }
                cursor={{ fill: "rgba(148,163,184,0.08)" }}
              />

              {/* Grey bar for unsubmitted days */}
              <Bar dataKey="unsubmitted" stackId="a" fill={UNSUBMITTED_BAR_COLOR} radius={[3, 3, 0, 0]} />

              {/* One stacked segment per category */}
              {categoryNames.map((name, index) => (
                <Bar
                  key={name}
                  dataKey={name}
                  stackId="a"
                  fill={getCategoryColor(index)}
                  radius={
                    index === categoryNames.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]
                  }
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}

        {/* Legend */}
        {categoryNames.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {categoryNames.map((name, index) => (
              <div key={name} className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: getCategoryColor(index) }}
                />
                <span className="text-xs text-slate-500">{name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Drill-down table ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">
            Zeitverteilung nach Kategorie
          </h3>
          <span className="text-xs text-slate-400">
            Gesamt: {formatMinutes(grandTotalMinutes)}
          </span>
        </div>

        {categoryRows.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">
            Noch keine eingereichten Einträge vorhanden.
          </p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="py-2.5 pl-4 pr-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">
                  Kategorie
                </th>
                <th className="py-2.5 px-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">
                  Zeit
                </th>
                <th className="py-2.5 px-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">
                  Anteil
                </th>
                <th className="py-2.5 pl-3 pr-4 w-32" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {categoryRows.map((cat, catIndex) => (
                <>
                  {/* Category row */}
                  <tr
                    key={cat.categoryId}
                    className="cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => onToggleCategory(cat.categoryId)}
                  >
                    <td className="py-3 pl-4 pr-2">
                      <div className="flex items-center gap-2">
                        {/* Color dot */}
                        <span
                          className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: getCategoryColor(catIndex) }}
                        />
                        {/* Expand / collapse chevron */}
                        {cat.subcategories.length > 0 ? (
                          cat.isExpanded ? (
                            <ChevronDown size={15} className="flex-shrink-0 text-slate-400" />
                          ) : (
                            <ChevronRight size={15} className="flex-shrink-0 text-slate-400" />
                          )
                        ) : (
                          <span className="w-4" />
                        )}
                        <span className="text-sm font-medium text-slate-800">
                          {cat.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-sm font-semibold text-slate-800 text-right whitespace-nowrap">
                      {formatMinutes(cat.totalMinutes)}
                    </td>
                    <td className="py-3 px-3 text-sm text-slate-600 text-right whitespace-nowrap">
                      {cat.percentOfTotal.toFixed(1)}%
                    </td>
                    {/* Mini progress bar */}
                    <td className="py-3 pl-3 pr-4 w-32">
                      <div className="h-2 w-full rounded-full bg-slate-100">
                        <div
                          className="h-2 rounded-full transition-all"
                          style={{
                            width: `${Math.min(cat.percentOfTotal, 100)}%`,
                            backgroundColor: getCategoryColor(catIndex),
                          }}
                        />
                      </div>
                    </td>
                  </tr>

                  {/* Subcategory + activity rows — visible when category is expanded */}
                  {cat.isExpanded &&
                    cat.subcategories.map((sub) => (
                      <SubcategoryAccordion
                        key={sub.subcategoryId}
                        sub={sub}
                        totalMinutes={grandTotalMinutes}
                        color={getCategoryColor(catIndex)}
                        onToggle={() =>
                          onToggleSubcategory(cat.categoryId, sub.subcategoryId)
                        }
                      />
                    ))}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
