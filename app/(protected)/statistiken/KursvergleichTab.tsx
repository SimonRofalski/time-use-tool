"use client";

import type { ComparisonMetaStats, ComparisonTopic } from "./types";

// ─── Constants ────────────────────────────────────────────────────────────────

// Minimum number of qualifying users (≥2 submitted days) before comparison is shown
const MIN_USERS_FOR_COMPARISON = 3;
type DayFilterMode = "alle" | "werktage" | "wochenende";

// ─── Pure helpers ─────────────────────────────────────────────────────────────

// Rounds a number to one decimal place for display
function formatHours(value: number): string {
  return value.toFixed(1);
}

// Calculates what percentile the user is in (0–100)
// e.g. if 7 out of 10 values are below the user's value → 70th percentile
function calculatePercentile(allValues: number[], userValue: number): number {
  const below = allValues.filter((v) => v < userValue).length;
  return Math.round((below / allValues.length) * 100);
}

// Computes the arithmetic mean of an array of numbers
function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function parseSatisfactionLabel(
  label: string,
): { value: number; max: number } | null {
  const match = label.match(/^([\d.]+)\s*\/\s*([\d.]+)/);
  if (!match) return null;
  const value = Number(match[1]);
  const max = Number(match[2]);
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return null;
  return { value, max };
}

function getSatisfactionEmoji(label: string): string {
  const parsed = parseSatisfactionLabel(label);
  if (!parsed) return "😐";
  const ratio = parsed.value / parsed.max;
  if (ratio >= 0.8) return "😄";
  if (ratio >= 0.6) return "🙂";
  if (ratio >= 0.4) return "😐";
  if (ratio >= 0.2) return "😟";
  return "😢";
}

// ─── DistributionStrip ────────────────────────────────────────────────────────

// Renders a horizontal strip with a dashed course-average line
// and the current user's highlighted point.
function DistributionStrip({
  topic,
  hasEnoughUsers,
}: {
  topic: ComparisonTopic;
  hasEnoughUsers: boolean;
}) {
  const { allValues, userValue, label, unit } = topic;

  if (!hasEnoughUsers) return null;

  // Determine the axis range: min/max with a 10% padding on each side
  const rawMin = Math.min(...allValues);
  const rawMax = Math.max(...allValues);
  const range = rawMax - rawMin || 1; // avoid division by zero if all values identical
  const axisMin = Math.max(0, rawMin - range * 0.15);
  const axisMax = rawMax + range * 0.15;
  const axisRange = axisMax - axisMin;

  // Maps a value to a percentage position along the strip (0–100%)
  function toPercent(value: number): number {
    const raw = ((value - axisMin) / axisRange) * 100;
    // Keep markers visible even when a value sits exactly on the edge.
    return Math.max(2, Math.min(98, raw));
  }

  const meanValue = calculateMean(allValues);
  const userPercentile = calculatePercentile(allValues, userValue);
  const meanPercent = toPercent(meanValue);
  const userPercent = toPercent(userValue);

  // Generate a friendly German description of the user's position
  function buildPositionText(): string {
    if (userPercentile >= 50) {
      return `Du liegst über ${userPercentile}% der Kursgruppe`;
    }
    return `Du liegst unter ${100 - userPercentile}% der Kursgruppe`;
  }

  return (
    <div>
      {/* Strip chart */}
      <div className="relative h-12 mt-3 mb-1">
        {/* Background track */}
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-100 rounded-full -translate-y-1/2" />

        {/* Course average line */}
        <div
          className="absolute top-0 bottom-0 flex flex-col items-center"
          style={{ left: `${meanPercent}%` }}
        >
          <div className="w-px h-full border-l-2 border-dashed border-slate-300" />
        </div>

        {/* User's own dot — highlighted on top */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-blue-500 ring-2 ring-white shadow-md z-10"
          style={{ left: `${userPercent}%` }}
        />
      </div>

      {/* Axis labels: min and max */}
      <div className="flex justify-between text-xs text-slate-400 mt-1">
        <span>
          {formatHours(axisMin)} {unit}
        </span>
        <span>
          {formatHours(axisMax)} {unit}
        </span>
      </div>

      {/* Descriptive text + stats row */}
      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-slate-500">{buildPositionText()}</p>
        <div className="flex gap-4">
          <div className="text-right">
            <p className="text-xs text-slate-400">Dein Wert</p>
            <p className="text-sm font-semibold text-blue-600">
              {formatHours(userValue)} {unit}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400">Ø Kurs</p>
            <p className="text-sm font-semibold text-slate-600">
              {formatHours(meanValue)} {unit}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TopicCard ────────────────────────────────────────────────────────────────

// Card wrapper for one comparison topic (Schlaf, Sport, Smartphone)
function TopicCard({
  topic,
  hasEnoughUsers,
  icon,
}: {
  topic: ComparisonTopic;
  hasEnoughUsers: boolean;
  icon: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      {/* Card header */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{icon}</span>
        <h3 className="text-sm font-semibold text-slate-800">{topic.label}</h3>
      </div>
      <p className="text-xs text-slate-400">
        Durchschnittliche Stunden pro Tag
      </p>

      <DistributionStrip topic={topic} hasEnoughUsers={hasEnoughUsers} />
    </div>
  );
}

function MetaComparisonCard({
  title,
  subtitle,
  emoji,
  userValue,
  courseValue,
}: {
  title: string;
  subtitle: string;
  emoji: string;
  userValue: string;
  courseValue: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </p>
      <div className="mt-1 flex items-center gap-1.5">
        <span className="text-base" aria-hidden="true">
          {emoji}
        </span>
        <span className="text-xs text-slate-500">{subtitle}</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md bg-blue-50 px-2 py-1">
          <p className="text-[10px] text-blue-600">Du</p>
          <p className="font-semibold text-blue-700">{userValue}</p>
        </div>
        <div className="rounded-md bg-slate-100 px-2 py-1">
          <p className="text-[10px] text-slate-500">Kurs</p>
          <p className="font-semibold text-slate-700">{courseValue}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function KursvergleichTab({
  topics,
  metaStats,
  qualifyingUserCount,
  selectedWeeks,
  weekOptions,
  dayFilter,
  onToggleWeek,
  onClearWeeks,
  onSetDayFilter,
}: {
  // The three comparison topics with all participant values
  topics: ComparisonTopic[];
  metaStats: ComparisonMetaStats | null;
  // How many users in the course meet the ≥2 submitted days threshold
  qualifyingUserCount: number;
  selectedWeeks: string[];
  weekOptions: { key: string; label: string }[];
  dayFilter: DayFilterMode;
  onToggleWeek: (weekKey: string) => void;
  onClearWeeks: () => void;
  onSetDayFilter: (mode: DayFilterMode) => void;
}) {
  const hasEnoughUsers = qualifyingUserCount >= MIN_USERS_FOR_COMPARISON;
  const selectedWeekSet = new Set(selectedWeeks);

  // Icon mapping for each topic key
  const topicIcons: Record<string, string> = {
    schlaf: "😴",
    sport: "🏃",
    smartphone: "📱",
  };

  return (
    <div className="space-y-5">
      {/* Section description */}
      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
        <p className="text-xs text-blue-700">
          <strong>Anonym:</strong> Im Vergleich siehst du deinen blauen Punkt
          und die gestrichelte Kurs-Durchschnittslinie. Einzelwerte anderer
          Teilnehmender werden nicht angezeigt.
        </p>
      </div>

      {/* Global filters (same structure as Zeitverteilung) */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:flex-wrap">
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

      {/* Compact meta cards comparable to Zeitverteilung priorities */}
      {metaStats && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <MetaComparisonCard
            title="IT-Gerät"
            subtitle="mit / ohne"
            emoji="💻"
            userValue={
              metaStats.itDevice.user
                ? `${metaStats.itDevice.user.leftPercent}% / ${metaStats.itDevice.user.rightPercent}%`
                : "-"
            }
            courseValue={
              metaStats.itDevice.course
                ? `${metaStats.itDevice.course.leftPercent}% / ${metaStats.itDevice.course.rightPercent}%`
                : "-"
            }
          />
          <MetaComparisonCard
            title="Sozial"
            subtitle="mit anderen / allein"
            emoji="👥"
            userValue={
              metaStats.social.user
                ? `${metaStats.social.user.leftPercent}% / ${metaStats.social.user.rightPercent}%`
                : "-"
            }
            courseValue={
              metaStats.social.course
                ? `${metaStats.social.course.leftPercent}% / ${metaStats.social.course.rightPercent}%`
                : "-"
            }
          />
          <MetaComparisonCard
            title="Ort"
            subtitle="zuhause / anderswo"
            emoji="📍"
            userValue={
              metaStats.location.user
                ? `${metaStats.location.user.leftPercent}% / ${metaStats.location.user.rightPercent}%`
                : "-"
            }
            courseValue={
              metaStats.location.course
                ? `${metaStats.location.course.leftPercent}% / ${metaStats.location.course.rightPercent}%`
                : "-"
            }
          />
          <MetaComparisonCard
            title="Wohlbefinden"
            subtitle="Ø zeitgewichtet"
            emoji={getSatisfactionEmoji(metaStats.wellbeing.userLabel)}
            userValue={metaStats.wellbeing.userLabel}
            courseValue={`${getSatisfactionEmoji(metaStats.wellbeing.courseLabel)} ${metaStats.wellbeing.courseLabel}`}
          />
        </div>
      )}

      {/* One shared legend for all comparison charts */}
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-0 border-l-2 border-dashed border-slate-300" />
            <span>Gestrichelt: Ø Kurs</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500 ring-2 ring-white shadow-sm" />
            <span>Blau: dein Wert</span>
          </div>
        </div>
      </div>

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

      {/* Topic cards — always rendered but DistributionStrip hides when not enough users */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        {topics.map((topic) => (
          <TopicCard
            key={topic.key}
            topic={topic}
            hasEnoughUsers={hasEnoughUsers}
            icon={topicIcons[topic.key] ?? "📊"}
          />
        ))}
      </div>
    </div>
  );
}
