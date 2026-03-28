"use client";

import type { ComparisonTopic } from "./types";

// ─── Constants ────────────────────────────────────────────────────────────────

// Minimum number of qualifying users (≥2 submitted days) before comparison is shown
const MIN_USERS_FOR_COMPARISON = 3;

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

// ─── DistributionStrip ────────────────────────────────────────────────────────

// Renders a horizontal dot strip showing all participant values.
// Each participant is an anonymous dot; the current user's dot is highlighted.
// A dashed vertical line marks the course average.
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
    return ((value - axisMin) / axisRange) * 100;
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

        {/* Anonymous participant dots */}
        {allValues.map((value, index) => {
          // Skip rendering a separate dot for the user's own value here
          // (we render it separately below so it stays on top)
          const isUser = value === userValue;
          if (isUser) return null;
          return (
            <div
              key={index}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-slate-300"
              style={{ left: `${toPercent(value)}%` }}
            />
          );
        })}

        {/* User's own dot — highlighted on top */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-blue-500 ring-2 ring-white shadow-md z-10"
          style={{ left: `${userPercent}%` }}
        />
      </div>

      {/* Axis labels: min and max */}
      <div className="flex justify-between text-xs text-slate-400 mt-1">
        <span>{formatHours(axisMin)} {unit}</span>
        <span>{formatHours(axisMax)} {unit}</span>
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
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* Card header */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{icon}</span>
        <h3 className="text-sm font-semibold text-slate-800">{topic.label}</h3>
      </div>
      <p className="text-xs text-slate-400">Durchschnittliche Stunden pro Tag</p>

      <DistributionStrip topic={topic} hasEnoughUsers={hasEnoughUsers} />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function KursvergleichTab({
  topics,
  qualifyingUserCount,
}: {
  // The three comparison topics with all participant values
  topics: ComparisonTopic[];
  // How many users in the course meet the ≥2 submitted days threshold
  qualifyingUserCount: number;
}) {
  const hasEnoughUsers = qualifyingUserCount >= MIN_USERS_FOR_COMPARISON;

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
          <strong>Anonym:</strong> Jeder Punkt steht für eine Person in deinem Kurs.
          Namen sind nicht sichtbar — du siehst nur deinen eigenen blauen Punkt.
        </p>
      </div>

      {/* Not enough users disclaimer */}
      {!hasEnoughUsers && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-6 text-center">
          <p className="text-2xl mb-2">👥</p>
          <p className="text-sm font-semibold text-amber-800">
            Vergleich noch nicht verfügbar
          </p>
          <p className="mt-1 text-xs text-amber-700">
            Für den Kursvergleich müssen mindestens {MIN_USERS_FOR_COMPARISON} Teilnehmende
            jeweils 2 Tage eingereicht haben. Schau später nochmal rein!
          </p>
          <p className="mt-2 text-xs text-amber-500">
            Aktuell qualifiziert: {qualifyingUserCount} / {MIN_USERS_FOR_COMPARISON} Personen
          </p>
        </div>
      )}

      {/* Topic cards — always rendered but DistributionStrip hides when not enough users */}
      {topics.map((topic) => (
        <TopicCard
          key={topic.key}
          topic={topic}
          hasEnoughUsers={hasEnoughUsers}
          icon={topicIcons[topic.key] ?? "📊"}
        />
      ))}
    </div>
  );
}
