// ─── Wohlbefinden-Skala ───────────────────────────────────────────────────────
// Single source of truth for the five levels shown in the Zeiterfassung
// (ActivitySelector) so every statistic maps an average back to the SAME
// emoji and word the user picked from. Averages are rounded to the nearest
// level: 4.1 → "gut", 4.5 → "sehr gut".

export type SatisfactionLevel = {
  rank: number; // 1 = sehr schlecht … 5 = sehr gut
  emoji: string;
  label: string;
};

export const SATISFACTION_LEVELS: SatisfactionLevel[] = [
  { rank: 1, emoji: "😢", label: "sehr schlecht" },
  { rank: 2, emoji: "😟", label: "schlecht" },
  { rank: 3, emoji: "😐", label: "mittelmässig" },
  { rank: 4, emoji: "🙂", label: "gut" },
  { rank: 5, emoji: "😄", label: "sehr gut" },
];

// Maps a time-weighted average rank (1…maxRank) to the nearest level.
// Returns null when there is no data (avg <= 0).
export function satisfactionLevelForAverage(
  avgRank: number,
  maxRank: number,
): SatisfactionLevel | null {
  if (!(avgRank > 0) || !(maxRank > 1)) return null;
  // Rescale a non-standard scale onto 1…5 before rounding
  const scaled = 1 + ((avgRank - 1) / (maxRank - 1)) * 4;
  const rank = Math.min(5, Math.max(1, Math.round(scaled)));
  return SATISFACTION_LEVELS[rank - 1];
}

// Parses the label format used across the stats ("4.1 / 5 (82%)")
export function parseSatisfactionLabel(
  label: string | null | undefined,
): { value: number; max: number } | null {
  if (!label) return null;
  const match = label.match(/^([\d.]+)\s*\/\s*([\d.]+)/);
  if (!match) return null;
  const value = Number(match[1]);
  const max = Number(match[2]);
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return null;
  return { value, max };
}

export function satisfactionLevelForLabel(
  label: string | null | undefined,
): SatisfactionLevel | null {
  const parsed = parseSatisfactionLabel(label);
  return parsed ? satisfactionLevelForAverage(parsed.value, parsed.max) : null;
}
