// ─── Shared course-period utilities ──────────────────────────────────────────
// Single source of truth for date calculations across admin, user, and stats views.

export type CoursePeriod = {
  course_period_id: number;
  course_id: number;
  start_date: string; // "YYYY-MM-DD"
  end_date: string; // "YYYY-MM-DD"
  sort_order: number;
};

function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatIsoDateUtc(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Generates every ISO date string between startDate and endDate (inclusive)
function generateDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = parseIsoDate(startDate);
  const last = parseIsoDate(endDate);
  while (current <= last) {
    dates.push(formatIsoDateUtc(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

// Returns all dates from all periods, deduplicated and sorted ascending.
// Handles overlapping periods safely via a Set.
export function getPeriodDates(
  periods: Pick<CoursePeriod, "start_date" | "end_date">[],
): string[] {
  const allDates = new Set<string>();
  for (const p of periods) {
    for (const d of generateDateRange(p.start_date, p.end_date)) {
      allDates.add(d);
    }
  }
  return [...allDates].sort();
}

// Returns the dates belonging to exactly one period (no set logic needed here,
// but honours the shared generateDateRange implementation).
export function getSinglePeriodDates(
  startDate: string,
  endDate: string,
): string[] {
  return generateDateRange(startDate, endDate);
}

// Returns the total number of distinct course days across all periods
export function totalPeriodDays(
  periods: Pick<CoursePeriod, "start_date" | "end_date">[],
): number {
  return getPeriodDates(periods).length;
}

// Returns a German "X Tag(e)" label for the summed days across all periods
export function periodsDurationLabel(
  periods: Pick<CoursePeriod, "start_date" | "end_date">[],
): string {
  const days = totalPeriodDays(periods);
  return `${days} Tag${days !== 1 ? "e" : ""}`;
}

// Formats a single period's date range for display.
// e.g. "23.03.2026 – 05.04.2026 · 14 Tage" (de) / "03/23/2026 – 04/05/2026 · 14 days" (en)
export function formatPeriodLabel(
  startDate: string,
  endDate: string,
  locale: "de" | "en" = "de",
): string {
  const days = generateDateRange(startDate, endDate).length;
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString(locale === "en" ? "en-US" : "de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  const dayLabel =
    locale === "en" ? `day${days !== 1 ? "s" : ""}` : `Tag${days !== 1 ? "e" : ""}`;
  return `${fmt(startDate)} – ${fmt(endDate)} · ${days} ${dayLabel}`;
}

// Validates that a list of periods contain no overlapping date ranges.
// Returns a German error message string, or null if valid.
export function validatePeriodsNoOverlap(
  periods: Pick<CoursePeriod, "start_date" | "end_date">[],
  locale: "de" | "en" = "de",
): string | null {
  const sorted = [...periods].sort((a, b) =>
    a.start_date.localeCompare(b.start_date),
  );
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString(locale === "en" ? "en-US" : "de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start_date <= sorted[i - 1].end_date) {
      const rangeA = `${fmt(sorted[i - 1].start_date)}–${fmt(sorted[i - 1].end_date)}`;
      const rangeB = `${fmt(sorted[i].start_date)}–${fmt(sorted[i].end_date)}`;
      return locale === "en"
        ? `Periods overlap: ${rangeA} and ${rangeB}`
        : `Zeiträume überschneiden sich: ${rangeA} und ${rangeB}`;
    }
  }
  return null;
}
