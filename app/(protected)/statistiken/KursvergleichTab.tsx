"use client";

import type { ReactNode } from "react";
import {
  BedDouble,
  Bike,
  Briefcase,
  Circle,
  GraduationCap,
  HandHeart,
  Home,
  Palette,
  Route,
  Tv,
  Users,
  type LucideIcon,
} from "lucide-react";
import type {
  CategoryComparison,
  ComparisonMetric,
  ComparisonTopic,
} from "./types";
import { CATEGORY_COLORS } from "@/app/(protected)/zeiterfassung/types";
import { satisfactionLevelForAverage } from "./satisfaction";

// ─── Constants ────────────────────────────────────────────────────────────────

// Minimum number of qualifying users (≥2 submitted days) before comparison is shown
const MIN_USERS_FOR_COMPARISON = 3;
type DayFilterMode = "alle" | "werktage" | "wochenende";

const USER_BLUE = "#3B82F6"; // blue-500 — "du" in the focus and context cards

const TOPIC_EMOJI: Record<string, string> = {
  schlaf: "😴",
  sport: "🏃",
  smartphone: "📱",
};

const CONTEXT_EMOJI: Record<string, string> = {
  itDevice: "💻",
  social: "👥",
  location: "📍",
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// 0–100: share of course values strictly below the user's value
function calculatePercentile(allValues: number[], userValue: number): number {
  if (allValues.length === 0) return 0;
  const below = allValues.filter((v) => v < userValue).length;
  return Math.round((below / allValues.length) * 100);
}

function getCategoryColorById(categoryId: number): string {
  if (categoryId <= 0) return "#94A3B8";
  return CATEGORY_COLORS[(categoryId - 1) % CATEGORY_COLORS.length];
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss");
}

// Icon per category, matched on the category name (falls back to a dot)
function getCategoryIcon(name: string): LucideIcon {
  const n = normalize(name);
  if (n.includes("pflege") || n.includes("schlaf")) return BedDouble;
  if (n.includes("erwerb")) return Briefcase;
  if (n.includes("studium") || n.includes("ausbildung")) return GraduationCap;
  if (n.includes("haushalt") || n.includes("familie")) return Home;
  if (n.includes("freiwillig") || n.includes("treffen")) return HandHeart;
  if (n.includes("sozial") || n.includes("unterhaltung")) return Users;
  if (n.includes("sport") || n.includes("freien")) return Bike;
  if (n.includes("hobby")) return Palette;
  if (n.includes("medien")) return Tv;
  if (n.includes("wege") || n.includes("transport")) return Route;
  return Circle;
}


type Unit = ComparisonMetric["unit"];

function formatValue(value: number, unit: Unit): string {
  if (unit === "%") return `${Math.round(value)} %`;
  if (unit === "Punkte") return value.toFixed(1);
  return `${value.toFixed(1)} h`;
}

// "+2.4 h/Tag ggü. Kurs" · "+27 %-Pkt. ggü. Kurs" · "im Kursschnitt"
function describeDifference(
  userValue: number,
  meanValue: number,
  unit: Unit,
  short = false,
): string {
  const diff = userValue - meanValue;
  const threshold = unit === "%" ? 3 : unit === "Punkte" ? 0.15 : 0.25;
  if (Math.abs(diff) < threshold) return "im Kursschnitt";
  const sign = diff > 0 ? "+" : "−";
  const abs = Math.abs(diff);
  const suffix = short ? "" : " ggü. Kurs";
  if (unit === "%") return `${sign}${Math.round(abs)} %-Pkt.${suffix}`;
  if (unit === "Punkte") return `${sign}${abs.toFixed(1)} Pkt.${suffix}`;
  return `${sign}${abs.toFixed(1)} h/Tag${suffix}`;
}

function verdictText(
  row: { userValue: number; allValues: number[]; unit: Unit },
  short = false,
): string {
  if (row.userValue <= 0) return "keine eigenen Daten";
  const meanValue = calculateMean(row.allValues);
  const diff = describeDifference(row.userValue, meanValue, row.unit, short);
  if (row.allValues.length === 0) return diff;
  const p = calculatePercentile(row.allValues, row.userValue);
  const above = row.allValues.some((v) => v > row.userValue);
  const position =
    !above
      ? "höchster Wert der Gruppe"
      : p === 0
        ? "tiefster Wert der Gruppe"
        : `über ${p}% der Gruppe`;
  return `${diff} · ${position}`;
}

// ─── Shared bar pair ──────────────────────────────────────────────────────────

// Two thin bars: you (colour) above the course mean (grey), values at the right
function BarPair({
  userValue,
  meanValue,
  scaleMax,
  unit,
  color,
  showLabels = false,
}: {
  userValue: number;
  meanValue: number;
  scaleMax: number;
  unit: Unit;
  color: string;
  showLabels?: boolean;
}) {
  const pct = (v: number) =>
    Math.min(
      100,
      Math.max(scaleMax > 0 ? (v / scaleMax) * 100 : 0, v > 0 ? 1.5 : 0),
    );

  const line = (label: string, value: number, fill: string, strong: boolean) => (
    <div className="flex items-center gap-2">
      {showLabels && (
        <span className="w-10 shrink-0 text-[10px] uppercase tracking-wide text-slate-400">
          {label}
        </span>
      )}
      <div className="h-2 flex-1 rounded-full bg-slate-100 dark:bg-slate-700">
        <div
          className="h-2 rounded-full transition-all"
          style={{ width: `${pct(value)}%`, backgroundColor: fill }}
        />
      </div>
      <span
        className={`w-12 shrink-0 text-right text-xs ${
          strong
            ? "font-semibold text-slate-700 dark:text-slate-100"
            : "text-slate-500 dark:text-slate-400"
        }`}
      >
        {formatValue(value, unit)}
      </span>
    </div>
  );

  return (
    <div className="space-y-1">
      {line("Du", userValue, color, true)}
      {line("Kurs", meanValue, "#94A3B8", false)}
    </div>
  );
}

// ─── Metric card (focus + context) ───────────────────────────────────────────

type MetricCardData = {
  key: string;
  emoji: string;
  title: string;
  subtitle: string;
  unit: Unit;
  scaleMax?: number;
  allValues: number[];
  userValue: number;
};

function MetricCard({ metric }: { metric: MetricCardData }) {
  const meanValue = calculateMean(metric.allValues);
  const scaleMax =
    metric.scaleMax ?? Math.max(0.1, metric.userValue, meanValue) * 1.15;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center gap-2.5">
        <span className="text-2xl leading-none" aria-hidden="true">
          {metric.emoji}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
            {metric.title}
          </p>
          <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">
            {metric.subtitle}
          </p>
        </div>
      </div>
      <div className="mt-3">
        <BarPair
          userValue={metric.userValue}
          meanValue={meanValue}
          scaleMax={scaleMax}
          unit={metric.unit}
          color={USER_BLUE}
          showLabels
        />
      </div>
      <p className="mt-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
        {verdictText(metric)}
      </p>
    </div>
  );
}

// ─── Category row (compact, with icon) ───────────────────────────────────────

function CategoryRow({
  category,
  scaleMax,
}: {
  category: CategoryComparison;
  scaleMax: number;
}) {
  const color = getCategoryColorById(category.categoryId);
  const Icon = getCategoryIcon(category.name);
  const meanValue = calculateMean(category.allValues);

  return (
    <div className="flex items-start gap-2.5">
      <span
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${color}1F`, color }}
        aria-hidden="true"
      >
        <Icon size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">
            {category.name}
          </span>
          <span className="shrink-0 text-[11px] text-slate-500 dark:text-slate-400">
            {verdictText({ ...category, unit: "h/Tag" }, true)}
          </span>
        </div>
        <BarPair
          userValue={category.userValue}
          meanValue={meanValue}
          scaleMax={scaleMax}
          unit="h/Tag"
          color={color}
        />
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function KursvergleichTab({
  topics,
  categoryComparison,
  contextMetrics,
  qualifyingUserCount,
  selectedWeeks,
  weekOptions,
  dayFilter,
  onToggleWeek,
  onClearWeeks,
  onSetDayFilter,
  actions,
}: {
  // Focus topics (Schlaf, Sport, Smartphone) with all participant values
  topics: ComparisonTopic[];
  // Per-category Ø h/Tag comparison (empty when not enough users)
  categoryComparison: CategoryComparison[];
  // Context metrics (IT-Gerät, Sozial, Ort, Wohlbefinden) with per-participant values
  contextMetrics: ComparisonMetric[];
  // How many users in the course meet the ≥2 submitted days threshold
  qualifyingUserCount: number;
  selectedWeeks: string[];
  weekOptions: { key: string; label: string }[];
  dayFilter: DayFilterMode;
  onToggleWeek: (weekKey: string) => void;
  onClearWeeks: () => void;
  onSetDayFilter: (mode: DayFilterMode) => void;
  // Optional controls rendered at the right end of the filter bar (e.g. PDF export)
  actions?: ReactNode;
}) {
  const hasEnoughUsers = qualifyingUserCount >= MIN_USERS_FOR_COMPARISON;
  const selectedWeekSet = new Set(selectedWeeks);

  const focusCards: MetricCardData[] = topics.map((t) => ({
    key: t.key,
    emoji: TOPIC_EMOJI[t.key] ?? "📊",
    title: t.label,
    subtitle: "Ø Stunden pro abgegebenem Tag",
    unit: "h/Tag",
    allValues: t.allValues,
    userValue: t.userValue,
  }));

  const contextCards: MetricCardData[] = contextMetrics.map((m) => {
    if (m.key === "wellbeing") {
      // Emoji and word come from the same five levels as in the Zeiterfassung
      const max = m.scaleMax ?? 5;
      const level = satisfactionLevelForAverage(m.userValue, max);
      const courseLevel = satisfactionLevelForAverage(
        calculateMean(m.allValues),
        max,
      );
      return {
        key: m.key,
        emoji: level?.emoji ?? "😐",
        title: m.label,
        subtitle: level
          ? `du: ${level.label} · Kurs: ${courseLevel?.label ?? "–"} · Skala 1–${max}`
          : (m.description ?? ""),
        unit: m.unit,
        scaleMax: m.scaleMax,
        allValues: m.allValues,
        userValue: m.userValue,
      };
    }
    return {
      key: m.key,
      emoji: CONTEXT_EMOJI[m.key] ?? "📊",
      title: m.label,
      subtitle: m.description ?? "",
      unit: m.unit,
      scaleMax: m.scaleMax,
      allValues: m.allValues,
      userValue: m.userValue,
    };
  });

  const sortedCategories = [...categoryComparison].sort(
    (a, b) => b.userValue - a.userValue,
  );
  // Categories share one scale so bar lengths are comparable across life areas
  const categoryScaleMax = Math.max(
    1,
    ...sortedCategories.flatMap((c) => [
      c.userValue,
      calculateMean(c.allValues),
    ]),
  );

  return (
    <div className="space-y-4">
      {/* Global filters (same structure as Zeitverteilung) */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:flex-wrap">
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
                  ? "bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-100 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
            >
              Alle
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
              Werktage
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
              Wochenende
            </button>
          </div>
        </div>

        {weekOptions.length > 0 && (
          <div className="hidden sm:block w-px self-stretch bg-slate-200" />
        )}

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
                  ? "border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                  : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600"
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
                    ? "border-blue-200 dark:border-blue-600/40 bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300"
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600"
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
        )}

        {actions && <div className="sm:ml-auto">{actions}</div>}
      </div>

      {/* Reading aid — one line */}
      <p className="px-1 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="mr-1.5 inline-block h-2 w-5 rounded-full bg-blue-500 align-middle" />
        du
        <span className="ml-3 mr-1.5 inline-block h-2 w-5 rounded-full bg-slate-400 align-middle" />
        Ø Kurs · «über X % der Gruppe» = so viele Teilnehmende liegen unter
        deinem Wert · anonym, keine Einzelwerte anderer Personen
      </p>

      {/* Not enough users disclaimer */}
      {!hasEnoughUsers && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-6 text-center">
          <p className="text-2xl mb-2">👥</p>
          <p className="text-sm font-semibold text-amber-800">
            Vergleich noch nicht verfügbar
          </p>
          <p className="mt-1 text-xs text-amber-700">
            Für den Kursvergleich müssen mindestens {MIN_USERS_FOR_COMPARISON}{" "}
            Teilnehmende jeweils 2 Tage eingereicht haben. Schau später nochmal
            rein!
          </p>
          <p className="mt-2 text-xs text-amber-500">
            Aktuell qualifiziert: {qualifyingUserCount} /{" "}
            {MIN_USERS_FOR_COMPARISON} Personen
          </p>
        </div>
      )}

      {hasEnoughUsers && (
        <>
          {/* 1. Focus topics — three compact cards */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {focusCards.map((m) => (
              <MetricCard key={m.key} metric={m} />
            ))}
          </div>

          {/* 2. Context — four compact cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {contextCards.map((m) => (
              <MetricCard key={m.key} metric={m} />
            ))}
          </div>

          {/* 3. Per-category comparison — two columns on wide screens */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Zeitverteilung im Kursvergleich
              </h3>
              <p className="text-[11px] text-slate-400">
                Ø Stunden pro abgegebenem Tag je Lebensbereich
              </p>
            </div>
            {sortedCategories.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">
                Noch keine vergleichbaren Daten.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-x-8 gap-y-3.5 lg:grid-cols-2">
                {sortedCategories.map((c) => (
                  <CategoryRow
                    key={c.categoryId}
                    category={c}
                    scaleMax={categoryScaleMax}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
