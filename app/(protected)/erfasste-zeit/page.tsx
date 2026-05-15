"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import {
  formatPeriodLabel,
  getPeriodDates,
  getSinglePeriodDates,
} from "@/lib/course-periods";

// ─── Constants ────────────────────────────────────────────────────────────────

// A full day consists of 144 time slots of 10 minutes each (24h × 6 slots/h)
const TOTAL_ENTRIES_PER_DAY = 144;

// Calculates how many 10-minute slots are covered by one time entry
// e.g. start="08:00:00", end="09:00:00" → 6 slots
// Handles the midnight wrap: end_time "00:00" after a non-zero start means 1440 min
function calculateCoveredSlots(startTime: string, endTime: string): number {
  const [startHour, startMin] = startTime.split(":").map(Number);
  const [endHour, endMin] = endTime.split(":").map(Number);
  const startMinTotal = startHour * 60 + startMin;
  const endMinTotal =
    endHour === 0 && endMin === 0 && startMinTotal > 0
      ? 1440
      : endHour * 60 + endMin;
  return Math.round((endMinTotal - startMinTotal) / 10);
}

// ─── Types ────────────────────────────────────────────────────────────────────

// The four possible states a diary day can be in
type DayStatus =
  | "nicht_verfuegbar" // date is in the future
  | "nicht_begonnen" // date is today or past, but no entries yet
  | "in_bearbeitung" // some entries exist, but day not submitted yet
  | "abgeschlossen"; // day has been submitted by the student

// Represents one calendar day in the course, enriched with progress data
type CourseDay = {
  date: string; // ISO format: "YYYY-MM-DD"
  dayId: number | null; // null if no day record exists in the database yet
  entryCount: number;
  isSubmitted: boolean;
  isComplete: boolean;
  status: DayStatus;
};

type CoursePeriodInfo = {
  course_period_id: number;
  start_date: string;
  end_date: string;
  sort_order: number;
};

// Basic course info shown in the page header
type CourseSummary = {
  courseName: string;
  periods: CoursePeriodInfo[];
};

function getLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateOnlyToEpochDay(dateOnly: string): number {
  const normalized = dateOnly.slice(0, 10);
  const [year, month, day] = normalized.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

// ─── Pure helper functions ────────────────────────────────────────────────────

// Determines the status of a day based on its date, entry count, and submission state
function getDayStatus(
  date: string,
  entryCount: number,
  isSubmitted: boolean,
): DayStatus {
  if (isSubmitted) return "abgeschlossen";
  if (entryCount > 0) return "in_bearbeitung";

  const todayDate = getLocalIsoDate(new Date());
  if (dateOnlyToEpochDay(date) > dateOnlyToEpochDay(todayDate)) {
    return "nicht_verfuegbar";
  }

  return "nicht_begonnen";
}

// Formats an ISO date string into a German long-form date
// e.g. "2026-03-28" → "Samstag, 28. März 2026"
function formatDateGerman(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Returns a compact two-part date label for carousel cards
// e.g. "2026-03-28" → { weekday: "Sa.", dayMonth: "28. Mär." }
function formatDateCompact(dateString: string): {
  weekday: string;
  dayMonth: string;
} {
  const date = new Date(dateString);
  return {
    weekday: date.toLocaleDateString("de-DE", { weekday: "short" }),
    dayMonth: date.toLocaleDateString("de-DE", {
      day: "numeric",
      month: "short",
    }),
  };
}

// Returns Tailwind CSS classes for background, text, progress bar, and badge
// based on the day's status
function getStatusColors(status: DayStatus): {
  cardBg: string;
  labelBg: string;
  labelText: string;
  barFill: string;
  percentText: string;
} {
  switch (status) {
    case "nicht_verfuegbar":
      return {
        cardBg: "bg-slate-50 opacity-60",
        labelBg: "bg-slate-100",
        labelText: "text-slate-400",
        barFill: "bg-slate-200",
        percentText: "text-slate-400",
      };
    case "nicht_begonnen":
      return {
        cardBg: "bg-white",
        labelBg: "bg-slate-100",
        labelText: "text-slate-500",
        barFill: "bg-slate-300",
        percentText: "text-slate-500",
      };
    case "in_bearbeitung":
      return {
        cardBg: "bg-orange-50",
        labelBg: "bg-orange-100",
        labelText: "text-orange-700",
        barFill: "bg-orange-400",
        percentText: "text-orange-600",
      };
    case "abgeschlossen":
      return {
        cardBg: "bg-green-50",
        labelBg: "bg-green-100",
        labelText: "text-green-700",
        barFill: "bg-green-500",
        percentText: "text-green-600",
      };
  }
}

// Returns the German display label for a day status
function getStatusLabel(status: DayStatus): string {
  switch (status) {
    case "nicht_verfuegbar":
      return "Noch nicht verfügbar";
    case "nicht_begonnen":
      return "Nicht begonnen";
    case "in_bearbeitung":
      return "In Bearbeitung";
    case "abgeschlossen":
      return "Abgeschlossen";
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// DayCarouselCard: compact vertical card used inside the horizontal carousel
function DayCarouselCard({
  day,
  onClick,
}: {
  day: CourseDay;
  onClick: () => void;
}) {
  const colors = getStatusColors(day.status);
  const isAvailable = day.status !== "nicht_verfuegbar";
  const completionPercentage = Math.min(
    Math.round((day.entryCount / TOTAL_ENTRIES_PER_DAY) * 100),
    100,
  );
  const { weekday, dayMonth } = formatDateCompact(day.date);

  return (
    <div
      className={`${colors.cardBg} flex-shrink-0 rounded-lg border border-slate-200 p-3 transition-shadow ${
        isAvailable
          ? "cursor-pointer hover:shadow-md"
          : "cursor-default opacity-60"
      }`}
      style={{ scrollSnapAlign: "start" }}
      onClick={isAvailable ? onClick : undefined}
    >
      {/* Date */}
      <p className="text-xs font-medium text-slate-400">{weekday}</p>
      <p className="text-sm font-semibold text-slate-800 leading-tight">
        {dayMonth}
      </p>

      {/* Status badge */}
      <span
        className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colors.labelBg} ${colors.labelText}`}
      >
        {getStatusLabel(day.status)}
      </span>

      {/* Progress bar */}
      <div className="mt-3 h-1.5 w-full rounded-full bg-slate-100">
        <div
          className={`h-1.5 rounded-full ${colors.barFill} transition-all duration-300`}
          style={{ width: `${completionPercentage}%` }}
        />
      </div>

      {/* Percentage + entry count */}
      <div className="mt-1.5 flex items-center justify-between">
        <p className="text-xs text-slate-400">
          {day.entryCount}/{TOTAL_ENTRIES_PER_DAY}
        </p>
        <p className={`text-sm font-semibold ${colors.percentText}`}>
          {completionPercentage}%
        </p>
      </div>
    </div>
  );
}

// DayCarousel: horizontal scrolling carousel with prev/next navigation
// Shows cards side by side; scrolls by one full viewport at a time
function DayCarousel({
  days,
  onDayClick,
  label,
}: {
  days: CourseDay[];
  onDayClick: (date: string) => void;
  label?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div>
      {/* Header row: period date range + day count */}
      <div className="mb-3 flex items-center">
        <p className="text-sm font-medium text-slate-600">
          {label ?? `${days.length} Tage`}
        </p>
      </div>

      {/* Mobile: all days visible in a responsive grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:hidden">
        {days.map((day) => (
          <DayCarouselCard
            key={day.date}
            day={day}
            onClick={() => onDayClick(day.date)}
          />
        ))}
      </div>

      {/* Desktop: scrollable card row with nav buttons */}
      <div
        ref={scrollRef}
        className="hidden gap-3 overflow-x-auto pb-2 md:flex"
        style={{ scrollSnapType: "x mandatory", scrollbarWidth: "none" }}
      >
        {days.map((day) => (
          <DayCarouselCard
            key={day.date}
            day={day}
            onClick={() => onDayClick(day.date)}
          />
        ))}
      </div>
    </div>
  );
}

// SummaryBar: three summary containers at the bottom of the page
// Only counts days up to and including today (future days are excluded)
function SummaryBar({ days }: { days: CourseDay[] }) {
  // Exclude future days from the summary counts
  const pastAndTodayDays = days.filter(
    (day) => day.status !== "nicht_verfuegbar",
  );

  const completedCount = pastAndTodayDays.filter(
    (day) => day.status === "abgeschlossen",
  ).length;

  const inProgressCount = pastAndTodayDays.filter(
    (day) => day.status === "in_bearbeitung",
  ).length;

  const notStartedCount = pastAndTodayDays.filter(
    (day) => day.status === "nicht_begonnen",
  ).length;

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {/* Completed days */}
      <div className="w-full rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-center sm:w-[220px]">
        <p className="text-xl font-bold text-green-600">{completedCount}</p>
        <p className="mt-0.5 text-xs font-medium text-green-700">
          Abgeschlossen
        </p>
      </div>

      {/* In-progress days */}
      <div className="w-full rounded-lg border border-orange-200 bg-orange-50 px-3 py-2.5 text-center sm:w-[220px]">
        <p className="text-xl font-bold text-orange-500">{inProgressCount}</p>
        <p className="mt-0.5 text-xs font-medium text-orange-700">
          In Bearbeitung
        </p>
      </div>

      {/* Not started days */}
      <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-center sm:w-[220px]">
        <p className="text-xl font-bold text-slate-500">{notStartedCount}</p>
        <p className="mt-0.5 text-xs font-medium text-slate-600">
          Nicht begonnen
        </p>
      </div>
    </div>
  );
}

// ─── Main Page Component ──────────────────────────────────────────────────────

export default function ErfassteZeitPage() {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [courseSummary, setCourseSummary] = useState<CourseSummary | null>(
    null,
  );
  const [courseDays, setCourseDays] = useState<CourseDay[]>([]);
  const [periods, setPeriods] = useState<CoursePeriodInfo[]>([]);

  // Tracks the last time data was loaded to avoid unnecessary reloads on tab switch
  const lastLoadTimeRef = useRef<number>(0);
  const RELOAD_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

  // Load all overview data when the component mounts
  // and whenever the tab/page becomes visible again (e.g. after returning from Zeiterfassung)
  useEffect(() => {
    loadOverviewData();

    const shouldReload = () =>
      Date.now() - lastLoadTimeRef.current > RELOAD_THRESHOLD_MS;

    const handleFocus = () => {
      if (shouldReload()) void loadOverviewData();
    };

    const handlePageShow = () => {
      if (shouldReload()) void loadOverviewData();
    };

    const handleVisibility = () => {
      if (!document.hidden && shouldReload()) void loadOverviewData();
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  // Orchestrates all data fetching steps:
  // user → course enrollment → course details → day records → entry counts → merge
  async function loadOverviewData() {
    setIsLoading(true);
    setErrorMessage("");

    // Step 1: get the currently logged-in user
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      setErrorMessage("Benutzer konnte nicht geladen werden.");
      setIsLoading(false);
      return;
    }
    const userId = authData.user.id;

    // Step 2: get the course the user is enrolled in (one course per user)
    const { data: userCourseData, error: userCourseError } = await supabase
      .from("user_course")
      .select("course_id")
      .eq("profiles_id", userId)
      .single();

    if (userCourseError || !userCourseData) {
      setErrorMessage(
        "Kein Kurs gefunden. Bitte wende dich an deinen Administrator.",
      );
      setIsLoading(false);
      return;
    }
    const courseId = userCourseData.course_id;

    // Steps 3a, 3b, 4: load course name, periods, and day records in parallel
    const [
      { data: courseData, error: courseError },
      { data: periodsData },
      { data: dayRecords, error: dayError },
    ] = await Promise.all([
      supabase
        .from("course")
        .select("name, start_date, end_date")
        .eq("course_id", courseId)
        .single(),
      supabase
        .from("course_period")
        .select("course_period_id, start_date, end_date, sort_order")
        .eq("course_id", courseId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("day")
        .select("day_id, date, is_submitted, is_complete")
        .eq("profiles_id", userId)
        .eq("course_id", courseId),
    ]);

    if (courseError || !courseData) {
      setErrorMessage("Kursinformationen konnten nicht geladen werden.");
      setIsLoading(false);
      return;
    }

    if (dayError) {
      setErrorMessage("Tage konnten nicht geladen werden.");
      setIsLoading(false);
      return;
    }

    const loadedPeriods: CoursePeriodInfo[] = (periodsData ?? []).map((p) => ({
      course_period_id: p.course_period_id,
      start_date: p.start_date,
      end_date: p.end_date,
      sort_order: p.sort_order,
    }));

    // Fallback for courses without periods (pre-migration data)
    const effectivePeriods =
      loadedPeriods.length > 0
        ? loadedPeriods
        : [
            {
              course_period_id: 0,
              start_date: courseData.start_date,
              end_date: courseData.end_date,
              sort_order: 0,
            },
          ];

    setPeriods(effectivePeriods);
    setCourseSummary({
      courseName: courseData.name,
      periods: effectivePeriods,
    });

    // Step 5: load entry counts for all days that have a day record
    // We only fetch the day_id column and count client-side to keep it simple
    const dayIds = (dayRecords ?? []).map((d) => d.day_id);
    const entryCountByDayId: Record<number, number> = {};

    if (dayIds.length > 0) {
      // Fetch start_time + end_time so we can count covered 10-min slots per day
      // (one DB row can span multiple slots, so row count ≠ slot count)
      const { data: entryRows, error: entryError } = await supabase
        .from("time_entry")
        .select("day_id, start_time, end_time")
        .in("day_id", dayIds);

      if (entryError) {
        setErrorMessage("Einträge konnten nicht geladen werden.");
        setIsLoading(false);
        return;
      }

      // Sum covered slots per day instead of counting rows
      for (const row of entryRows ?? []) {
        const coveredSlots = calculateCoveredSlots(
          row.start_time,
          row.end_time,
        );
        entryCountByDayId[row.day_id] =
          (entryCountByDayId[row.day_id] ?? 0) + coveredSlots;
      }
    }

    // Step 6: build a lookup map from date string → day record for fast access
    const dayRecordByDate: Record<string, (typeof dayRecords)[0]> = {};
    for (const dayRecord of dayRecords ?? []) {
      dayRecordByDate[dayRecord.date] = dayRecord;
    }

    // Step 7: generate all dates from all periods and merge with DB data
    const allDates = getPeriodDates(effectivePeriods);

    const mergedCourseDays: CourseDay[] = allDates.map((date) => {
      const dayRecord = dayRecordByDate[date] ?? null;
      const entryCount = dayRecord
        ? (entryCountByDayId[dayRecord.day_id] ?? 0)
        : 0;
      const isSubmitted = dayRecord?.is_submitted ?? false;

      return {
        date,
        dayId: dayRecord?.day_id ?? null,
        entryCount,
        isSubmitted,
        isComplete: dayRecord?.is_complete ?? false,
        status: getDayStatus(date, entryCount, isSubmitted),
      };
    });

    setCourseDays(mergedCourseDays);
    lastLoadTimeRef.current = Date.now();
    setIsLoading(false);
  }

  // Navigates to the Zeiterfassung page for the selected date
  function handleDayClick(date: string) {
    router.push(`/zeiterfassung?date=${date}`);
  }

  // ── Render states ────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Wird geladen">
        {/* Skeleton SummaryBar */}
        <div className="flex flex-wrap items-stretch gap-2">
          <div className="w-full rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-center sm:w-[220px]">
            <div className="mx-auto h-7 w-8 animate-pulse rounded bg-green-200" />
            <p className="mt-0.5 text-xs font-medium text-green-700">
              Abgeschlossen
            </p>
          </div>
          <div className="w-full rounded-lg border border-orange-200 bg-orange-50 px-3 py-2.5 text-center sm:w-[220px]">
            <div className="mx-auto h-7 w-8 animate-pulse rounded bg-orange-200" />
            <p className="mt-0.5 text-xs font-medium text-orange-700">
              In Bearbeitung
            </p>
          </div>
          <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-center sm:w-[220px]">
            <div className="mx-auto h-7 w-8 animate-pulse rounded bg-slate-200" />
            <p className="mt-0.5 text-xs font-medium text-slate-600">
              Nicht begonnen
            </p>
          </div>
        </div>

        {/* Skeleton carousel section */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center">
            <p className="text-sm font-medium text-slate-600">Wird geladen…</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex-shrink-0 rounded-lg border border-slate-200 bg-white p-3 animate-pulse"
              >
                <div className="h-3 w-8 rounded bg-slate-200" />
                <div className="mt-1 h-4 w-14 rounded bg-slate-200" />
                <div className="mt-2 h-4 w-20 rounded-full bg-slate-100" />
                <div className="mt-3 h-1.5 w-full rounded-full bg-slate-100" />
              </div>
            ))}
          </div>
          <div className="hidden gap-3 md:flex">
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="flex-shrink-0 w-28 rounded-lg border border-slate-200 bg-white p-3 animate-pulse"
              >
                <div className="h-3 w-8 rounded bg-slate-200" />
                <div className="mt-1 h-4 w-14 rounded bg-slate-200" />
                <div className="mt-2 h-4 w-20 rounded-full bg-slate-100" />
                <div className="mt-3 h-1.5 w-full rounded-full bg-slate-100" />
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-600">{errorMessage}</p>
      </div>
    );
  }

  // Groups the flat courseDays list into one entry per period
  const groupedPeriods = periods.map((period) => {
    const periodDates = new Set(
      getSinglePeriodDates(period.start_date, period.end_date),
    );
    return {
      period,
      days: courseDays.filter((d) => periodDates.has(d.date)),
    };
  });

  return (
    <div className="space-y-4">
      {/* Compact status summary across all periods */}
      <SummaryBar days={courseDays} />

      {/* One carousel section per period */}
      {groupedPeriods.map(({ period, days: periodDays }) => (
        <section
          key={period.course_period_id}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <DayCarousel
            days={periodDays}
            onDayClick={handleDayClick}
            label={formatPeriodLabel(period.start_date, period.end_date)}
          />
        </section>
      ))}
    </div>
  );
}
