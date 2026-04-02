"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

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
  const endMinTotal = (endHour === 0 && endMin === 0 && startMinTotal > 0) ? 1440 : endHour * 60 + endMin;
  return Math.round((endMinTotal - startMinTotal) / 10);
}

// ─── Types ────────────────────────────────────────────────────────────────────

// The four possible states a diary day can be in
type DayStatus =
  | "nicht_verfuegbar" // date is in the future
  | "nicht_begonnen"   // date is today or past, but no entries yet
  | "in_bearbeitung"   // some entries exist, but day not submitted yet
  | "abgeschlossen";   // day has been submitted by the student

// Represents one calendar day in the course, enriched with progress data
type CourseDay = {
  date: string;        // ISO format: "YYYY-MM-DD"
  dayId: number | null; // null if no day record exists in the database yet
  entryCount: number;
  isSubmitted: boolean;
  isComplete: boolean;
  status: DayStatus;
};

// Basic course info shown in the page header
type CourseSummary = {
  courseName: string;
  startDate: string;
  endDate: string;
};

// ─── Pure helper functions ────────────────────────────────────────────────────

// Determines the status of a day based on its date, entry count, and submission state
function getDayStatus(
  date: string,
  entryCount: number,
  isSubmitted: boolean
): DayStatus {
  // Compare date strings — ISO format sorts correctly as strings
  const todayDate = new Date().toISOString().split("T")[0];

  if (date > todayDate) return "nicht_verfuegbar";
  if (isSubmitted) return "abgeschlossen";
  if (entryCount > 0) return "in_bearbeitung";
  return "nicht_begonnen";
}

// Generates an array of all ISO date strings between startDate and endDate (inclusive)
function generateDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const currentDate = new Date(startDate);
  const lastDate = new Date(endDate);

  while (currentDate <= lastDate) {
    dates.push(currentDate.toISOString().split("T")[0]);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return dates;
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
function formatDateCompact(dateString: string): { weekday: string; dayMonth: string } {
  const date = new Date(dateString);
  return {
    weekday: date.toLocaleDateString("de-DE", { weekday: "short" }),
    dayMonth: date.toLocaleDateString("de-DE", { day: "numeric", month: "short" }),
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
    case "nicht_verfuegbar": return "Noch nicht verfügbar";
    case "nicht_begonnen":   return "Nicht begonnen";
    case "in_bearbeitung":   return "In Bearbeitung";
    case "abgeschlossen":    return "Abgeschlossen";
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
    100
  );
  const { weekday, dayMonth } = formatDateCompact(day.date);

  return (
    <div
      className={`${colors.cardBg} flex-shrink-0 rounded-lg border border-slate-200 p-3 transition-shadow ${
        isAvailable ? "cursor-pointer hover:shadow-md" : "cursor-default opacity-60"
      }`}
      style={{ width: "160px", scrollSnapAlign: "start" }}
      onClick={isAvailable ? onClick : undefined}
    >
      {/* Date */}
      <p className="text-xs font-medium text-slate-400">{weekday}</p>
      <p className="text-sm font-semibold text-slate-800 leading-tight">{dayMonth}</p>

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
        <p className="text-xs text-slate-400">{day.entryCount}/{TOTAL_ENTRIES_PER_DAY}</p>
        <p className={`text-sm font-semibold ${colors.percentText}`}>{completionPercentage}%</p>
      </div>
    </div>
  );
}

// DayCarousel: horizontal scrolling carousel with prev/next navigation
// Shows cards side by side; scrolls by one full viewport at a time
function DayCarousel({
  days,
  onDayClick,
}: {
  days: CourseDay[];
  onDayClick: (date: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  function scroll(direction: "prev" | "next") {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({
      left: direction === "next" ? scrollRef.current.clientWidth : -scrollRef.current.clientWidth,
      behavior: "smooth",
    });
  }

  return (
    <div>
      {/* Header row with day count and nav buttons */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-slate-600">{days.length} Tage</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => scroll("prev")}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-800"
            aria-label="Vorherige Tage"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => scroll("next")}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-800"
            aria-label="Nächste Tage"
          >
            ›
          </button>
        </div>
      </div>

      {/* Scrollable card row — scrollbar hidden, snap-to-start per card */}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-2"
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
    (day) => day.status !== "nicht_verfuegbar"
  );

  const completedCount = pastAndTodayDays.filter(
    (day) => day.status === "abgeschlossen"
  ).length;

  const inProgressCount = pastAndTodayDays.filter(
    (day) => day.status === "in_bearbeitung"
  ).length;

  const notStartedCount = pastAndTodayDays.filter(
    (day) => day.status === "nicht_begonnen"
  ).length;

  return (
    <div className="grid grid-cols-3 gap-3">
      {/* Completed days */}
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
        <p className="text-2xl font-bold text-green-600">{completedCount}</p>
        <p className="mt-1 text-xs font-medium text-green-700">Abgeschlossen</p>
      </div>

      {/* In-progress days */}
      <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-center">
        <p className="text-2xl font-bold text-orange-500">{inProgressCount}</p>
        <p className="mt-1 text-xs font-medium text-orange-700">In Bearbeitung</p>
      </div>

      {/* Not started days */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center">
        <p className="text-2xl font-bold text-slate-500">{notStartedCount}</p>
        <p className="mt-1 text-xs font-medium text-slate-600">Nicht begonnen</p>
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
  const [courseSummary, setCourseSummary] = useState<CourseSummary | null>(null);
  const [courseDays, setCourseDays] = useState<CourseDay[]>([]);

  // Load all overview data when the component mounts
  useEffect(() => {
    loadOverviewData();
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
        "Kein Kurs gefunden. Bitte wenden Sie sich an Ihren Administrator."
      );
      setIsLoading(false);
      return;
    }
    const courseId = userCourseData.course_id;

    // Step 3: load the course details (name, date range)
    const { data: courseData, error: courseError } = await supabase
      .from("course")
      .select("name, start_date, end_date")
      .eq("course_id", courseId)
      .single();

    if (courseError || !courseData) {
      setErrorMessage("Kursinformationen konnten nicht geladen werden.");
      setIsLoading(false);
      return;
    }

    setCourseSummary({
      courseName: courseData.name,
      startDate: courseData.start_date,
      endDate: courseData.end_date,
    });

    // Step 4: load all existing day records for this user and course
    const { data: dayRecords, error: dayError } = await supabase
      .from("day")
      .select("day_id, date, is_submitted, is_complete")
      .eq("profiles_id", userId)
      .eq("course_id", courseId);

    if (dayError) {
      setErrorMessage("Tage konnten nicht geladen werden.");
      setIsLoading(false);
      return;
    }

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
        const coveredSlots = calculateCoveredSlots(row.start_time, row.end_time);
        entryCountByDayId[row.day_id] =
          (entryCountByDayId[row.day_id] ?? 0) + coveredSlots;
      }
    }

    // Step 6: build a lookup map from date string → day record for fast access
    const dayRecordByDate: Record<string, (typeof dayRecords)[0]> = {};
    for (const dayRecord of dayRecords ?? []) {
      dayRecordByDate[dayRecord.date] = dayRecord;
    }

    // Step 7: generate the full date range from the course and merge with DB data
    const allDates = generateDateRange(courseData.start_date, courseData.end_date);

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
    setIsLoading(false);
  }

  // Navigates to the Zeiterfassung page for the selected date
  function handleDayClick(date: string) {
    router.push(`/zeiterfassung?date=${date}`);
  }

  // ── Render states ────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-slate-500">Wird geladen...</p>
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

  return (
    <div className="space-y-6">
      {/* Page header with course name and date range */}
      <div>
        <h2 className="text-xl font-semibold text-slate-800">Übersicht</h2>
        {courseSummary && (
          <p className="mt-1 text-sm text-slate-500">
            {courseSummary.courseName}
            {" · "}
            {formatDateGerman(courseSummary.startDate)}
            {" – "}
            {formatDateGerman(courseSummary.endDate)}
          </p>
        )}
      </div>

      {/* Horizontal carousel of all days in the course */}
      <DayCarousel days={courseDays} onDayClick={handleDayClick} />

      {/* Summary containers at the bottom */}
      <SummaryBar days={courseDays} />
    </div>
  );
}
