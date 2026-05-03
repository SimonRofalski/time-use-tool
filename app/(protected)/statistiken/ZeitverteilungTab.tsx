"use client";

import { Fragment, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
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
  DayBarData,
  MetaAggregates,
  ActivityMetaStats,
} from "./types";
import { CATEGORY_COLORS } from "../zeiterfassung/types";

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

// Formats an ISO date to a short German label for the chart X-axis: "Mo 28.3."
function formatDateShort(dateString: string): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("de-DE", {
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

// Use the shared category palette and bind colors to category ID so
// colors stay consistent even when rows are sorted by totals.
function getCategoryColorById(categoryId: number): string {
  if (categoryId <= 0) return "#94A3B8";
  return CATEGORY_COLORS[(categoryId - 1) % CATEGORY_COLORS.length];
}

type DayFilterMode = "alle" | "werktage" | "wochenende";

function parseDateLocal(dateString: string): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isWeekend(dateString: string): boolean {
  const day = parseDateLocal(dateString).getDay();
  return day === 0 || day === 6;
}

function getIsoWeekInfo(dateString: string): { key: string; label: string } {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayOfWeek);

  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const isoWeek = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );

  return {
    key: `${isoYear}-KW${String(isoWeek).padStart(2, "0")}`,
    label: `KW ${isoWeek}`,
  };
}

function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss");
}

// Icon helpers matching ActivitySelector's visual logic
function getDeviceIcon(name: string): LucideIcon {
  const n = normalizeLabel(name);
  if (n.includes("smartphone")) return Smartphone;
  if (n.includes("computer") || n.includes("laptop")) return Laptop;
  if (n.includes("tablet")) return Tablet;
  if (n.includes("tv") || n.includes("streaming")) return Tv;
  if (n.includes("spielkonsole") || n.includes("konsole")) return Gamepad2;
  if (n.includes("smartwatch") || n.includes("wearable")) return Watch;
  return HelpCircle;
}

function getSocialIcon(name: string): LucideIcon {
  const n = name.toLowerCase();
  if (n.includes("allein")) return UserX;
  if (n.includes("partner") || n.includes("ehepartner")) return Heart;
  if (n.includes("eltern") || n.includes("mutter") || n.includes("vater"))
    return Users;
  if (n.includes("kind") || n.includes("baby")) return Baby;
  if (n.includes("haushalt")) return Home;
  if (n.includes("freunde") || n.includes("kollegen") || n.includes("bekannte"))
    return UserCheck;
  return Users;
}

function getLocationIcon(name: string): LucideIcon {
  const n = normalizeLabel(name);
  if (n.includes("zuhause") || n.includes("zu hause") || n.includes("daheim"))
    return Home;
  if (
    n.includes("hotel") ||
    n.includes("camping") ||
    n.includes("wochenendhaus") ||
    n.includes("ferienwohnung")
  )
    return Hotel;
  if (n.includes("arbeitsplatz")) return Briefcase;
  if (n.includes("restaurant") || n.includes("cafe") || n.includes("bar"))
    return UtensilsCrossed;
  if (n.includes("einkauf") || n.includes("markt") || n.includes("geschaeft"))
    return ShoppingBag;
  if (
    n.includes("schule") ||
    n.includes("universitaet") ||
    n.includes("universitat")
  )
    return GraduationCap;
  if (n.includes("zu fuss") || n.includes("fuss")) return Footprints;
  if (n.includes("fahrrad")) return Bike;
  if (n.includes("pkw") || n.includes("auto")) return Car;
  if (
    n.includes("oeffentlich") ||
    n.includes("zug") ||
    n.includes("bahn") ||
    n.includes("bus") ||
    n.includes("tram")
  )
    return Bus;
  return MapPin;
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
    (p) => categoryNames.includes(p.dataKey) && p.value > 0,
  );

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs min-w-[160px]">
      <p className="font-semibold text-slate-700 mb-2">{label}</p>
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

function getSatisfactionEmoji(label?: string | null): string {
  const parsed = parseSatisfactionLabel(label ?? undefined);
  if (!parsed) return "😐";

  const ratio = parsed.value / parsed.max;
  if (ratio >= 0.8) return "😄";
  if (ratio >= 0.6) return "🙂";
  if (ratio >= 0.4) return "😐";
  if (ratio >= 0.2) return "😟";
  return "😢";
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

  const textClass = dim ? "text-slate-500" : "text-slate-700";
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
  onToggle,
}: {
  sub: SubcategoryRow;
  totalMinutes: number;
  color: string;
  showActivityMeta: boolean;
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
        <td className="py-2 px-3 text-sm text-slate-700 text-right whitespace-nowrap">
          {formatMinutes(sub.totalMinutes)}
        </td>
        <td className="py-2 px-3 text-sm text-slate-500 text-right whitespace-nowrap">
          {sub.percentOfTotal.toFixed(1)}%
        </td>
        {/* Mini progress bar — hidden when meta cols are shown */}
        {!showActivityMeta && (
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
        )}
        {showActivityMeta &&
          (() => {
            const agg = aggregateActivitiesMeta(sub.activities);
            return (
              <>
                <PairCell
                  pair={agg.devices}
                  leftLabel="mit IT"
                  rightLabel="ohne IT"
                  dim
                />
                <PairCell
                  pair={agg.social}
                  leftLabel="mit anderen"
                  rightLabel="allein"
                  dim
                />
                <PairCell
                  pair={agg.location}
                  leftLabel="zuhause"
                  rightLabel="anderswo"
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
            {!showActivityMeta && (
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
            )}
            {showActivityMeta && act.meta && (
              <>
                <PairCell
                  pair={buildPair(
                    act.meta.withDevicesMinutes,
                    act.meta.withoutDevicesMinutes,
                  )}
                  leftLabel="mit IT"
                  rightLabel="ohne IT"
                />
                <PairCell
                  pair={buildPair(
                    act.meta.withPeopleMinutes,
                    act.meta.aloneMinutes,
                  )}
                  leftLabel="mit anderen"
                  rightLabel="allein"
                />
                <PairCell
                  pair={buildPair(
                    act.meta.atHomeMinutes,
                    act.meta.elsewhereMinutes,
                  )}
                  leftLabel="zuhause"
                  rightLabel="anderswo"
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
}: {
  title: string;
  items: { name: string; minutes: number }[];
  getIcon?: (name: string) => LucideIcon;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400">Keine Daten</p>
      ) : (
        <div className="space-y-1.5">
          {items.slice(0, 5).map((item) => {
            const Icon = getIcon ? getIcon(item.name) : null;
            return (
              <div
                key={item.name}
                className="flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  {Icon && (
                    <Icon size={12} className="shrink-0 text-slate-400" />
                  )}
                  <span className="truncate text-slate-600">{item.name}</span>
                </div>
                <span className="whitespace-nowrap font-medium text-slate-700">
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
}) {
  const [showActivityMeta, setShowActivityMeta] = useState(false);

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

  const selectedWeekSet = new Set(selectedWeeks);

  // barData is already filtered by KW + day-of-week in the parent

  return (
    <div className="space-y-4">
      {/* ── Global filters ───────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:flex-wrap">
        {/* Day filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 shrink-0">
            Tage
          </span>
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => onSetDayFilter("alle")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                dayFilter === "alle"
                  ? "bg-white text-slate-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Alle
            </button>
            <button
              type="button"
              onClick={() => onSetDayFilter("werktage")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                dayFilter === "werktage"
                  ? "bg-white text-slate-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Werktage
            </button>
            <button
              type="button"
              onClick={() => onSetDayFilter("wochenende")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                dayFilter === "wochenende"
                  ? "bg-white text-slate-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Wochenende
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
              KW
            </span>
            <button
              type="button"
              onClick={onClearWeeks}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                selectedWeeks.length === 0
                  ? "border-slate-300 bg-slate-100 text-slate-700"
                  : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
              }`}
            >
              Alle
            </button>
            {weekOptions.map((w) => (
              <button
                key={w.key}
                type="button"
                onClick={() => onToggleWeek(w.key)}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                  selectedWeekSet.has(w.key)
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Stacked bar chart ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">
          Tägliche Zeitverteilung
        </h3>

        {barData.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">
            Keine Tage für den gewählten Filter vorhanden.
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
                  tickFormatter={formatDateShort}
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  interval={0}
                  height={22}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => `${Math.round(v / 60)}h`}
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
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
          title="Geräte-Nutzung"
          items={metaAggregates?.devices ?? []}
          getIcon={getDeviceIcon}
        />
        <MetaList
          title="Sozialer Kontext"
          items={metaAggregates?.social ?? []}
          getIcon={getSocialIcon}
        />
        <MetaList
          title="Orte & Transport"
          items={metaAggregates?.locations ?? []}
          getIcon={getLocationIcon}
        />
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Ø Wohlbefinden
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
            Zeitgewichtet nach Dauer der Einträge
          </p>
        </div>
      </div>

      {/* ── Drill-down table ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">
            Zeitverteilung nach Kategorie
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowActivityMeta((v) => !v)}
              className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                showActivityMeta
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              {showActivityMeta
                ? "Metavariablen ausblenden"
                : "Metavariablen anzeigen"}
            </button>
          </div>
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
                {!showActivityMeta && <th className="py-2.5 pl-3 pr-4 w-32" />}
                {showActivityMeta && (
                  <>
                    <th className="py-2.5 px-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wide whitespace-nowrap">
                      IT Gerät
                    </th>
                    <th className="py-2.5 px-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wide whitespace-nowrap">
                      Sozial
                    </th>
                    <th className="py-2.5 px-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wide whitespace-nowrap">
                      Ort
                    </th>
                    <th
                      title="Zeitgewichteter Mittelwert der ausgewählten Gefühlsstufen innerhalb der Zeile"
                      className="py-2.5 px-2 text-right text-xs font-medium text-slate-400 uppercase tracking-wide whitespace-nowrap"
                    >
                      Ø Gefühl
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {categoryRows.map((cat) => (
                <Fragment key={cat.categoryId}>
                  {/* Category row */}
                  <tr
                    className="cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => onToggleCategory(cat.categoryId)}
                  >
                    <td className="py-3 pl-4 pr-2">
                      <div className="flex items-center gap-2">
                        {/* Color dot */}
                        <span
                          className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: getCategoryColorById(
                              cat.categoryId,
                            ),
                          }}
                        />
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
                    {/* Mini progress bar — hidden when meta cols shown */}
                    {!showActivityMeta && (
                      <td className="py-3 pl-3 pr-4 w-32">
                        <div className="h-2 w-full rounded-full bg-slate-100">
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
                              leftLabel="mit IT"
                              rightLabel="ohne IT"
                            />
                            <PairCell
                              pair={agg.social}
                              leftLabel="mit anderen"
                              rightLabel="allein"
                            />
                            <PairCell
                              pair={agg.location}
                              leftLabel="zuhause"
                              rightLabel="anderswo"
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
                        onToggle={() =>
                          onToggleSubcategory(cat.categoryId, sub.subcategoryId)
                        }
                      />
                    ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
