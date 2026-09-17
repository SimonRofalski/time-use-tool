"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useLocale, useTranslations } from "next-intl";
import {
  Baby,
  Bike,
  Briefcase,
  Bus,
  Car,
  ChevronDown,
  ChevronRight,
  Footprints,
  Gamepad2,
  GraduationCap,
  Heart,
  HelpCircle,
  Home,
  Hotel,
  Laptop,
  MapPin,
  ShoppingBag,
  Smartphone,
  Tablet,
  Tv,
  UtensilsCrossed,
  UserCheck,
  UserX,
  Users,
  Watch,
  type LucideIcon,
} from "lucide-react";
import type {
  CategoryRow,
  SubcategoryRow,
  ActivityRow,
  DayBarData,
  MetaAggregates,
  ActivityMetaStats,
} from "./types";
import { CATEGORY_COLORS } from "../zeiterfassung/types";
import { satisfactionLevelForLabel } from "./satisfaction";

// ─── Constants ────────────────────────────────────────────────────────────────

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

// Formats an ISO date to a short label for the chart X-axis: "Mo 28.3." (de) / "Mon 3/28" (en)
function formatDateShort(dateString: string, locale: string): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(locale === "en" ? "en-US" : "de-DE", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
  });
}

function formatMinutesCompact(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

// Returns formatted minutes for "total" or "avgPerDay" view mode
function displayMinutesWithMode(
  minutes: number,
  viewMode: "total" | "avgPerDay",
  submittedDaysCount: number,
): string {
  if (viewMode === "total" || submittedDaysCount === 0) return formatMinutes(minutes);
  return formatMinutes(Math.round(minutes / submittedDaysCount));
}

// Use the shared category palette and bind colors to category ID so
// colors stay consistent even when rows are sorted by totals.
function getCategoryColorById(categoryId: number): string {
  if (categoryId <= 0) return "#94A3B8";
  return CATEGORY_COLORS[(categoryId - 1) % CATEGORY_COLORS.length];
}

type DayFilterMode = "alle" | "werktage" | "wochenende";

// Icon helpers keyed by the language-neutral lookup-table `code` column
// (mirrors ActivitySelector.tsx's *_VISUAL_BY_CODE maps) — matching on the
// localized display name would break once names became locale-dependent.
const DEVICE_ICON_BY_CODE: Record<string, LucideIcon> = {
  "1": Smartphone,
  "2": Laptop,
  "3": Tablet,
  "4": Tv,
  "5": Gamepad2,
  "6": Watch,
};

function getDeviceIcon(code: string): LucideIcon {
  return DEVICE_ICON_BY_CODE[code] ?? HelpCircle;
}

const SOCIAL_ICON_BY_CODE: Record<string, LucideIcon> = {
  "1": UserX, // Alleine
  "2": Heart, // Partner / Ehepartner
  "3": Home, // Eltern
  "4": Home, // Haushaltsmitglied bis 9 Jahre
  "5": Home, // Andere Haushaltsmitglieder
  "6": UserCheck, // Andere bekannte Personen
};

function getSocialIcon(code: string): LucideIcon {
  return SOCIAL_ICON_BY_CODE[code] ?? Users;
}

const LOCATION_ICON_BY_CODE: Record<string, LucideIcon> = {
  "11": Home,
  "12": Hotel,
  "13": Briefcase,
  "14": Home,
  "15": UtensilsCrossed,
  "16": ShoppingBag,
  "17": Hotel,
  "18": GraduationCap,
  "21": Footprints,
  "22": Bike,
  "24": Car,
  "31": Bus,
};

function getLocationIcon(code: string): LucideIcon {
  return LOCATION_ICON_BY_CODE[code] ?? MapPin;
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
  const t = useTranslations("statistiken.zeitverteilung");
  if (!active || !payload || payload.length === 0) return null;

  // Check if this is an unsubmitted day (only has the "unsubmitted" key)
  const isUnsubmitted = payload.some((p) => p.dataKey === "unsubmitted");
  if (isUnsubmitted) {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 shadow-lg text-xs">
        <p className="font-semibold text-slate-700">{label}</p>
        <p className="mt-1 text-slate-400">{t("chart.notSubmitted")}</p>
      </div>
    );
  }

  // Only show categories with actual time recorded
  const entries = payload.filter(
    (p) => categoryNames.includes(p.dataKey) && p.value > 0,
  );

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 shadow-lg text-xs min-w-[160px]">
      <p className="font-semibold text-slate-700 dark:text-slate-200 mb-2">{label}</p>
      {entries.map((entry) => (
        <div
          key={entry.dataKey}
          className="flex items-center justify-between gap-4 mb-1"
        >
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
              style={{ backgroundColor: categoryColorMap[entry.dataKey] }}
            />
            <span className="text-slate-600 dark:text-slate-300">{entry.dataKey}</span>
          </div>
          <span className="font-medium text-slate-800 dark:text-slate-100">
            {formatMinutes(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function buildPair(leftMinutes: number, rightMinutes: number) {
  const total = leftMinutes + rightMinutes;
  if (total <= 0) return null;
  const leftPercent = Math.round((leftMinutes / total) * 100);
  return {
    leftPercent,
    rightPercent: 100 - leftPercent,
  };
}

function parseSatisfactionLabel(
  label?: string,
): { value: number; max: number } | null {
  if (!label) return null;
  const match = label.match(/^([\d.]+)\s*\/\s*([\d.]+)/);
  if (!match) return null;
  const value = Number(match[1]);
  const max = Number(match[2]);
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return null;
  return { value, max };
}

// Same five levels as in the Zeiterfassung: average rounded to the nearest level
function getSatisfactionEmoji(label?: string | null): string {
  return satisfactionLevelForLabel(label)?.emoji ?? "😐";
}

function aggregateActivitiesMeta(activities: ActivityRow[]) {
  let withDevices = 0;
  let withoutDevices = 0;
  let withPeople = 0;
  let alone = 0;
  let atHome = 0;
  let elsewhere = 0;
  let satisfactionWeightedSum = 0;
  let satisfactionWeight = 0;
  let maxScale = 5;

  for (const act of activities) {
    if (!act.meta) continue;
    withDevices += act.meta.withDevicesMinutes;
    withoutDevices += act.meta.withoutDevicesMinutes;
    withPeople += act.meta.withPeopleMinutes;
    alone += act.meta.aloneMinutes;
    atHome += act.meta.atHomeMinutes;
    elsewhere += act.meta.elsewhereMinutes;
    satisfactionWeightedSum += act.meta.satisfactionWeightedSum;
    satisfactionWeight += act.meta.satisfactionWeight;

    const parsed = parseSatisfactionLabel(act.meta.avgSatisfactionLabel);
    if (parsed) {
      maxScale = parsed.max;
    }
  }

  return {
    devices: buildPair(withDevices, withoutDevices),
    social: buildPair(withPeople, alone),
    location: buildPair(atHome, elsewhere),
    avgSatisfaction:
      satisfactionWeight > 0
        ? `${(satisfactionWeightedSum / satisfactionWeight).toFixed(1)} / ${maxScale}`
        : null,
  };
}

function PairCell({
  pair,
  leftLabel,
  rightLabel,
  dim,
}: {
  pair: { leftPercent: number; rightPercent: number } | null;
  leftLabel: string;
  rightLabel: string;
  dim?: boolean;
}) {
  if (!pair) {
    return (
      <td className="py-2 px-2 text-center">
        <span className="text-slate-300 text-xs">–</span>
      </td>
    );
  }

  const textClass = dim ? "text-slate-500 dark:text-slate-400" : "text-slate-700 dark:text-slate-200";
  return (
    <td className="py-2 px-2 whitespace-nowrap">
      <div className="text-right leading-tight">
        <p className={`text-xs font-semibold ${textClass}`}>
          {pair.leftPercent}% / {pair.rightPercent}%
        </p>
        <p className="text-[9px] text-slate-400">
          {leftLabel} / {rightLabel}
        </p>
      </div>
    </td>
  );
}

function SatisfactionCell({
  label,
  dim,
}: {
  label?: string | null;
  dim?: boolean;
}) {
  if (!label) {
    return (
      <td className="py-2 px-2 text-center">
        <span className="text-slate-300 text-xs">–</span>
      </td>
    );
  }

  const parsed = parseSatisfactionLabel(label);
  const compact = parsed ? `${parsed.value.toFixed(1)} / ${parsed.max}` : label;
  const emoji = getSatisfactionEmoji(label);
  return (
    <td className="py-2 px-2 whitespace-nowrap text-right">
      <div className="inline-flex items-center gap-1">
        <span className="text-sm leading-none" aria-hidden="true">
          {emoji}
        </span>
        <span
          className={`text-xs ${dim ? "text-slate-500" : "text-slate-700"}`}
        >
          {compact}
        </span>
      </div>
    </td>
  );
}

// ─── DrillDownTable ───────────────────────────────────────────────────────────

// Renders the accordion-style drill-down table for a single subcategory row
function SubcategoryAccordion({
  sub,
  totalMinutes,
  color,
  showActivityMeta,
  viewMode,
  submittedDaysCount,
  onToggle,
}: {
  sub: SubcategoryRow;
  totalMinutes: number;
  color: string;
  showActivityMeta: boolean;
  viewMode: "total" | "avgPerDay";
  submittedDaysCount: number;
  onToggle: () => void;
}) {
  const t = useTranslations("statistiken.zeitverteilung.table.pairLabels");
  return (
    <>
      {/* Subcategory row */}
      <tr
        className="cursor-pointer transition-colors"
        style={{ backgroundColor: `${color}18` }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.backgroundColor = `${color}28`)
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.backgroundColor = `${color}18`)
        }
        onClick={onToggle}
      >
        {/* Indent + expand icon */}
        <td className="py-2 pl-8 pr-2">
          <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200 text-sm">
            {sub.activities.length > 0 ? (
              sub.isExpanded ? (
                <ChevronDown
                  size={14}
                  className="flex-shrink-0 text-slate-400"
                />
              ) : (
                <ChevronRight
                  size={14}
                  className="flex-shrink-0 text-slate-400"
                />
              )
            ) : (
              <span className="w-3.5" />
            )}
            {sub.name}
          </div>
        </td>
        <td className="py-2 px-3 text-sm text-slate-700 dark:text-slate-200 text-right whitespace-nowrap">
          {displayMinutesWithMode(sub.totalMinutes, viewMode, submittedDaysCount)}
        </td>
        <td className="py-2 px-3 text-sm text-slate-500 dark:text-slate-400 text-right whitespace-nowrap">
          {sub.percentOfTotal.toFixed(1)}%
        </td>
        {/* Mini progress bar — hidden when meta cols are shown */}
        {!showActivityMeta && (
          <td className="py-2 pl-3 pr-4 w-32">
            <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-700">
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
        )}
        {showActivityMeta &&
          (() => {
            const agg = aggregateActivitiesMeta(sub.activities);
            return (
              <>
                <PairCell
                  pair={agg.devices}
                  leftLabel={t("withIt")}
                  rightLabel={t("withoutIt")}
                  dim
                />
                <PairCell
                  pair={agg.social}
                  leftLabel={t("withOthers")}
                  rightLabel={t("alone")}
                  dim
                />
                <PairCell
                  pair={agg.location}
                  leftLabel={t("atHome")}
                  rightLabel={t("elsewhere")}
                  dim
                />
                <SatisfactionCell label={agg.avgSatisfaction} dim />
              </>
            );
          })()}
      </tr>

      {/* Activity rows — visible only when subcategory is expanded */}
      {sub.isExpanded &&
        sub.activities.map((act) => (
          <tr key={act.activityId} style={{ backgroundColor: `${color}0c` }}>
            <td className="py-1.5 pl-14 pr-2 text-xs text-slate-500 dark:text-slate-400">
              {act.name}
            </td>
            <td className="py-1.5 px-3 text-xs text-slate-500 dark:text-slate-400 text-right whitespace-nowrap">
              {displayMinutesWithMode(act.totalMinutes, viewMode, submittedDaysCount)}
            </td>
            <td className="py-1.5 px-3 text-xs text-slate-400 dark:text-slate-500 text-right whitespace-nowrap">
              {act.percentOfTotal.toFixed(1)}%
            </td>
            {!showActivityMeta && (
              <td className="py-1.5 pl-3 pr-4 w-32">
                <div className="h-1 w-full rounded-full bg-slate-100 dark:bg-slate-700">
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
            )}
            {showActivityMeta && act.meta && (
              <>
                <PairCell
                  pair={buildPair(
                    act.meta.withDevicesMinutes,
                    act.meta.withoutDevicesMinutes,
                  )}
                  leftLabel={t("withIt")}
                  rightLabel={t("withoutIt")}
                />
                <PairCell
                  pair={buildPair(
                    act.meta.withPeopleMinutes,
                    act.meta.aloneMinutes,
                  )}
                  leftLabel={t("withOthers")}
                  rightLabel={t("alone")}
                />
                <PairCell
                  pair={buildPair(
                    act.meta.atHomeMinutes,
                    act.meta.elsewhereMinutes,
                  )}
                  leftLabel={t("atHome")}
                  rightLabel={t("elsewhere")}
                />
                <SatisfactionCell label={act.meta.avgSatisfactionLabel} />
              </>
            )}
            {showActivityMeta && !act.meta && (
              <>
                <td />
                <td />
                <td />
                <td />
              </>
            )}
          </tr>
        ))}
    </>
  );
}

function MetaList({
  title,
  items,
  getIcon,
  noDataLabel,
}: {
  title: string;
  items: { name: string; code?: string; minutes: number }[];
  getIcon?: (code: string) => LucideIcon;
  noDataLabel: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {title}
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">{noDataLabel}</p>
      ) : (
        <div className="space-y-1.5">
          {items.slice(0, 5).map((item) => {
            const Icon = getIcon ? getIcon(item.code ?? "") : null;
            return (
              <div
                key={item.name}
                className="flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  {Icon && (
                    <Icon size={12} className="shrink-0 text-slate-400 dark:text-slate-500" />
                  )}
                  <span className="truncate text-slate-600 dark:text-slate-300">{item.name}</span>
                </div>
                <span className="whitespace-nowrap font-medium text-slate-700 dark:text-slate-200">
                  {formatMinutesCompact(item.minutes)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ZeitverteilungTab({
  barData,
  categoryRows,
  categoryNames,
  metaAggregates,
  selectedWeeks,
  weekOptions,
  dayFilter,
  onToggleWeek,
  onClearWeeks,
  onSetDayFilter,
  onToggleCategory,
  onToggleSubcategory,
  actions,
}: {
  barData: DayBarData[];
  categoryRows: CategoryRow[];
  categoryNames: string[];
  metaAggregates: MetaAggregates | null;
  selectedWeeks: string[];
  weekOptions: { key: string; label: string }[];
  dayFilter: DayFilterMode;
  onToggleWeek: (weekKey: string) => void;
  onClearWeeks: () => void;
  onSetDayFilter: (mode: DayFilterMode) => void;
  onToggleCategory: (categoryId: number) => void;
  onToggleSubcategory: (categoryId: number, subcategoryId: number) => void;
  // Optional controls rendered at the right end of the filter bar (e.g. PDF export)
  actions?: ReactNode;
}) {
  type SortColumn = "name" | "time" | "percent" | "itDevice" | "social" | "location" | "satisfaction";

  const t = useTranslations("statistiken.zeitverteilung");
  const locale = useLocale();
  const [showActivityMeta, setShowActivityMeta] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortColumn>("time");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewMode, setViewMode] = useState<"total" | "avgPerDay">("total");

  const submittedDaysCount = barData.filter((d) => d.isSubmitted).length;

  function toggleSort(col: SortColumn) {
    if (sortColumn === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortDir(col === "name" ? "asc" : "desc");
    }
  }

  // Pre-compute category-level meta values for sorting
  const categoryMetaValues = useMemo(() => {
    const result = new Map<number, {
      itDeviceLeft: number;
      socialLeft: number;
      locationLeft: number;
      satisfactionValue: number;
    }>();
    for (const cat of categoryRows) {
      const allActs = cat.subcategories.flatMap((s) => s.activities);
      const meta = aggregateActivitiesMeta(allActs);
      const satParsed = parseSatisfactionLabel(meta.avgSatisfaction ?? undefined);
      result.set(cat.categoryId, {
        itDeviceLeft: meta.devices?.leftPercent ?? 0,
        socialLeft: meta.social?.leftPercent ?? 0,
        locationLeft: meta.location?.leftPercent ?? 0,
        satisfactionValue: satParsed ? satParsed.value : 0,
      });
    }
    return result;
  }, [categoryRows]);

  // Build a stable color map: category name → hex color (based on categoryId)
  const categoryColorMap: Record<string, string> = {};
  categoryRows.forEach((row) => {
    categoryColorMap[row.name] = getCategoryColorById(row.categoryId);
  });

  // Total tracked minutes across all categories (for display in the table header)
  const grandTotalMinutes = categoryRows.reduce(
    (sum, row) => sum + row.totalMinutes,
    0,
  );

  const sortedCategoryRows = [...categoryRows].sort((a, b) => {
    let cmp = 0;
    if (sortColumn === "name") cmp = a.name.localeCompare(b.name, locale);
    else if (sortColumn === "time") cmp = a.totalMinutes - b.totalMinutes;
    else if (sortColumn === "percent") cmp = a.percentOfTotal - b.percentOfTotal;
    else {
      const am = categoryMetaValues.get(a.categoryId);
      const bm = categoryMetaValues.get(b.categoryId);
      if (sortColumn === "itDevice") cmp = (am?.itDeviceLeft ?? 0) - (bm?.itDeviceLeft ?? 0);
      else if (sortColumn === "social") cmp = (am?.socialLeft ?? 0) - (bm?.socialLeft ?? 0);
      else if (sortColumn === "location") cmp = (am?.locationLeft ?? 0) - (bm?.locationLeft ?? 0);
      else if (sortColumn === "satisfaction") cmp = (am?.satisfactionValue ?? 0) - (bm?.satisfactionValue ?? 0);
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const selectedWeekSet = new Set(selectedWeeks);

  // barData is already filtered by KW + day-of-week in the parent

  return (
    <div className="space-y-4">
      {/* ── Global filters ───────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:flex-wrap">
        {/* Day filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 shrink-0">
            {t("dayFilter.label")}
          </span>
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-0.5">
            <button
              type="button"
              onClick={() => onSetDayFilter("alle")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                dayFilter === "alle"
                  ? "bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
            >
              {t("dayFilter.all")}
            </button>
            <button
              type="button"
              onClick={() => onSetDayFilter("werktage")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                dayFilter === "werktage"
                  ? "bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
            >
              {t("dayFilter.weekdays")}
            </button>
            <button
              type="button"
              onClick={() => onSetDayFilter("wochenende")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                dayFilter === "wochenende"
                  ? "bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
            >
              {t("dayFilter.weekend")}
            </button>
          </div>
        </div>

        {/* Divider */}
        {weekOptions.length > 0 && (
          <div className="hidden sm:block w-px self-stretch bg-slate-200" />
        )}

        {/* KW filter */}
        {weekOptions.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 shrink-0">
              {t("weekFilter.label")}
            </span>
            <button
              type="button"
              onClick={onClearWeeks}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                selectedWeeks.length === 0
                  ? "border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                  : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600"
              }`}
            >
              {t("weekFilter.all")}
            </button>
            {weekOptions.map((w) => (
              <button
                key={w.key}
                type="button"
                onClick={() => onToggleWeek(w.key)}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                  selectedWeekSet.has(w.key)
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600"
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
        )}

        {actions && <div className="sm:ml-auto">{actions}</div>}
      </div>

      {/* ── Stacked bar chart ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">
          {t("chart.title")}
        </h3>

        {barData.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">
            {t("chart.noDays")}
          </p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={barData}
                margin={{ top: 2, right: 2, left: -24, bottom: 12 }}
                barCategoryGap="20%"
              >
                <XAxis
                  dataKey="date"
                  tickFormatter={(date: string) => formatDateShort(date, locale)}
                  tick={{ fontSize: 12, fill: "#475569", fontWeight: 500 }}
                  interval={0}
                  height={24}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => `${Math.round(v / 60)}h`}
                  tick={{ fontSize: 12, fill: "#475569", fontWeight: 500 }}
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
                <Bar
                  dataKey="unsubmitted"
                  stackId="a"
                  fill={UNSUBMITTED_BAR_COLOR}
                  radius={[3, 3, 0, 0]}
                />

                {/* One stacked segment per category */}
                {categoryNames.map((name, index) => (
                  <Bar
                    key={name}
                    dataKey={name}
                    stackId="a"
                    fill={categoryColorMap[name] ?? "#94A3B8"}
                    radius={
                      index === categoryNames.length - 1
                        ? [3, 3, 0, 0]
                        : [0, 0, 0, 0]
                    }
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </>
        )}

        {/* Legend */}
        {categoryNames.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
            {categoryNames.map((name, index) => (
              <div key={name} className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
                  style={{
                    backgroundColor: categoryColorMap[name] ?? "#94A3B8",
                  }}
                />
                <span className="text-[11px] text-slate-500">{name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetaList
          title={viewMode === "avgPerDay" ? t("metaLists.devicesTitleAvg") : t("metaLists.devicesTitle")}
          items={(metaAggregates?.devices ?? []).map((item) => ({
            ...item,
            minutes: viewMode === "avgPerDay" && submittedDaysCount > 0
              ? item.minutes / submittedDaysCount
              : item.minutes,
          }))}
          getIcon={getDeviceIcon}
          noDataLabel={t("metaLists.noData")}
        />
        <MetaList
          title={viewMode === "avgPerDay" ? t("metaLists.socialTitleAvg") : t("metaLists.socialTitle")}
          items={(metaAggregates?.social ?? []).map((item) => ({
            ...item,
            minutes: viewMode === "avgPerDay" && submittedDaysCount > 0
              ? item.minutes / submittedDaysCount
              : item.minutes,
          }))}
          getIcon={getSocialIcon}
          noDataLabel={t("metaLists.noData")}
        />
        <MetaList
          title={viewMode === "avgPerDay" ? t("metaLists.locationsTitleAvg") : t("metaLists.locationsTitle")}
          items={(metaAggregates?.locations ?? []).map((item) => ({
            ...item,
            minutes: viewMode === "avgPerDay" && submittedDaysCount > 0
              ? item.minutes / submittedDaysCount
              : item.minutes,
          }))}
          getIcon={getLocationIcon}
          noDataLabel={t("metaLists.noData")}
        />
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("metaLists.wellbeingTitle")}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xl leading-none" aria-hidden="true">
              {getSatisfactionEmoji(metaAggregates?.avgSatisfactionLabel)}
            </span>
            <p className="text-sm font-semibold text-slate-700">
              {metaAggregates?.avgSatisfactionLabel ?? "-"}
            </p>
          </div>
          <p className="mt-1 text-[10px] text-slate-400">
            {t("metaLists.wellbeingSubtitle")}
          </p>
        </div>
      </div>

      {/* ── Drill-down table ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-700">
            {t("table.title")}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("total")}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  viewMode === "total"
                    ? "bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100 shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                }`}
              >
                {t("table.viewModeTotal")}
              </button>
              <button
                type="button"
                onClick={() => setViewMode("avgPerDay")}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  viewMode === "avgPerDay"
                    ? "bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100 shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                }`}
              >
                {t("table.viewModeAvgPerDay")}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowActivityMeta((v) => !v)}
              className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                showActivityMeta
                  ? "border-blue-200 dark:border-blue-600/40 bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300"
                  : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600"
              }`}
            >
              {showActivityMeta ? t("table.hideMeta") : t("table.showMeta")}
            </button>
          </div>
        </div>

        {categoryRows.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">
            {t("table.noEntries")}
          </p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-700">
                <th className="py-2.5 pl-4 pr-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">
                  <button
                    type="button"
                    onClick={() => toggleSort("name")}
                    className="flex items-center gap-1 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                  >
                    {t("table.columns.category")}
                    <span className="text-[10px]">
                      {sortColumn === "name" ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
                    </span>
                  </button>
                </th>
                <th className="py-2.5 px-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">
                  <button
                    type="button"
                    onClick={() => toggleSort("time")}
                    className="flex items-center gap-1 ml-auto hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                  >
                    {viewMode === "total" ? t("table.columns.time") : t("table.columns.timeAvg")}
                    <span className="text-[10px]">
                      {sortColumn === "time" ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
                    </span>
                  </button>
                </th>
                <th className="py-2.5 px-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wide">
                  <button
                    type="button"
                    onClick={() => toggleSort("percent")}
                    className="flex items-center gap-1 ml-auto hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                  >
                    {t("table.columns.percent")}
                    <span className="text-[10px]">
                      {sortColumn === "percent" ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
                    </span>
                  </button>
                </th>
                {!showActivityMeta && <th className="py-2.5 pl-3 pr-4 w-32" />}
                {showActivityMeta && (
                  <>
                    {(["itDevice", "social", "location", "satisfaction"] as const).map(
                      (col, i) => {
                        const labels = [
                          t("table.columns.itDevice"),
                          t("table.columns.social"),
                          t("table.columns.location"),
                          t("table.columns.satisfaction"),
                        ];
                        return (
                          <th
                            key={col}
                            className="py-2.5 px-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wide whitespace-nowrap"
                            title={col === "satisfaction" ? t("table.satisfactionColumnTitle") : undefined}
                          >
                            <button
                              type="button"
                              onClick={() => toggleSort(col)}
                              className="flex items-center gap-1 ml-auto hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                            >
                              {labels[i]}
                              <span className="text-[10px]">
                                {sortColumn === col ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
                              </span>
                            </button>
                          </th>
                        );
                      }
                    )}
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
              {sortedCategoryRows.map((cat) => {
                const catColor = getCategoryColorById(cat.categoryId);
                return (
                  <Fragment key={cat.categoryId}>
                    {/* Category row */}
                    <tr
                      className="cursor-pointer transition-colors"
                      style={{ backgroundColor: `${catColor}12` }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.backgroundColor = `${catColor}22`)
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.backgroundColor = `${catColor}12`)
                      }
                      onClick={() => onToggleCategory(cat.categoryId)}
                    >
                      <td className="py-3 pl-4 pr-2">
                        <div className="flex items-center gap-2">
                          {/* Expand / collapse chevron */}
                          {cat.subcategories.length > 0 ? (
                            cat.isExpanded ? (
                              <ChevronDown
                                size={15}
                                className="flex-shrink-0 text-slate-400"
                              />
                            ) : (
                              <ChevronRight
                                size={15}
                                className="flex-shrink-0 text-slate-400"
                              />
                            )
                          ) : (
                            <span className="w-4" />
                          )}
                          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                            {cat.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-sm font-semibold text-slate-800 dark:text-slate-100 text-right whitespace-nowrap">
                        {displayMinutesWithMode(cat.totalMinutes, viewMode, submittedDaysCount)}
                      </td>
                      <td className="py-3 px-3 text-sm text-slate-600 dark:text-slate-300 text-right whitespace-nowrap">
                        {cat.percentOfTotal.toFixed(1)}%
                      </td>
                      {/* Mini progress bar — hidden when meta cols shown */}
                      {!showActivityMeta && (
                        <td className="py-3 pl-3 pr-4 w-32">
                          <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-700">
                            <div
                              className="h-2 rounded-full transition-all"
                              style={{
                                width: `${Math.min(cat.percentOfTotal, 100)}%`,
                                backgroundColor: getCategoryColorById(
                                  cat.categoryId,
                                ),
                              }}
                            />
                          </div>
                        </td>
                      )}
                      {showActivityMeta &&
                        (() => {
                          const allActs = cat.subcategories.flatMap(
                            (s) => s.activities,
                          );
                          const agg = aggregateActivitiesMeta(allActs);
                          return (
                            <>
                              <PairCell
                                pair={agg.devices}
                                leftLabel={t("table.pairLabels.withIt")}
                                rightLabel={t("table.pairLabels.withoutIt")}
                              />
                              <PairCell
                                pair={agg.social}
                                leftLabel={t("table.pairLabels.withOthers")}
                                rightLabel={t("table.pairLabels.alone")}
                              />
                              <PairCell
                                pair={agg.location}
                                leftLabel={t("table.pairLabels.atHome")}
                                rightLabel={t("table.pairLabels.elsewhere")}
                              />
                              <SatisfactionCell label={agg.avgSatisfaction} />
                            </>
                          );
                        })()}
                    </tr>

                    {/* Subcategory + activity rows — visible when category is expanded */}
                    {cat.isExpanded &&
                      cat.subcategories.map((sub) => (
                        <SubcategoryAccordion
                          key={sub.subcategoryId}
                          sub={sub}
                          totalMinutes={grandTotalMinutes}
                          color={getCategoryColorById(cat.categoryId)}
                          showActivityMeta={showActivityMeta}
                          viewMode={viewMode}
                          submittedDaysCount={submittedDaysCount}
                          onToggle={() =>
                            onToggleSubcategory(
                              cat.categoryId,
                              sub.subcategoryId,
                            )
                          }
                        />
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
