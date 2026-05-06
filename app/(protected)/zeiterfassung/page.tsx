"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import {
  type TimeEntryRecord,
  type PendingEntry,
  type QuestionnaireStep,
  type LookupData,
} from "./types";
import { getPeriodDates, getSinglePeriodDates } from "@/lib/course-periods";

const TimeGrid = dynamic(() => import("./TimeGrid"), {
  loading: () => (
    <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
      Raster wird geladen...
    </div>
  ),
});

const ActivitySelector = dynamic(() => import("./ActivitySelector"), {
  loading: () => (
    <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
      Fragebogen wird geladen...
    </div>
  ),
});

// ─── Constants ────────────────────────────────────────────────────────────────

const TOTAL_SLOTS_PER_DAY = 144;

// ─── Pure helper functions ────────────────────────────────────────────────────

// Formats a date string to German long format: "Freitag, 28. März 2026"
function formatDateGerman(dateString: string): string {
  return new Date(dateString).toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Formats a date string to compact German format: "Di., 05.05.2026"
function formatDateCompactGerman(dateString: string): string {
  return new Date(dateString).toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Strips seconds from a DB time string: "08:30:00" → "08:30"
function normalizeDbTime(dbTime: string): string {
  return dbTime.substring(0, 5);
}

// Calculates how many 10-minute slots are covered by a time range
// Handles the midnight wrap: end_time "00:00" after a non-zero start means 1440 min
function calculateCoveredSlots(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const startMinTotal = sh * 60 + sm;
  const endMinTotal =
    eh === 0 && em === 0 && startMinTotal > 0 ? 1440 : eh * 60 + em;
  return Math.round((endMinTotal - startMinTotal) / 10);
}

// Computes the DB end_time string for one 10-minute slot
// e.g. "08:50" → "09:00:00"
// Special case: the last slot (23:50) ends at midnight — stored as "00:00:00"
// because PostgreSQL TIME arithmetic wraps 23:50 + 10min → 00:00, not 24:00
function getSlotEndTime(slot: string): string {
  const [h, m] = slot.split(":").map(Number);
  const endTotal = h * 60 + m + 10;
  if (endTotal >= 1440) return "00:00:00";
  return `${Math.floor(endTotal / 60)
    .toString()
    .padStart(2, "0")}:${(endTotal % 60).toString().padStart(2, "0")}:00`;
}

// Determines the next questionnaire step based on the current step and pending data
// Returns null when all steps are complete and the entry should be saved
function getNextStep(
  currentStep: QuestionnaireStep,
  entry: PendingEntry,
): QuestionnaireStep | null {
  switch (currentStep) {
    case "primary_activity":
      return "secondary_activity";
    case "secondary_activity":
      return "digital_media";
    case "digital_media":
      return entry.digital_media_used
        ? "digital_media_type"
        : "location_transport";
    case "digital_media_type":
      return "location_transport";
    case "location_transport":
      return "social_context";
    case "social_context":
      return "satisfaction";
    case "satisfaction":
      return null;
  }
}

// Creates a blank PendingEntry for a fresh questionnaire
function createEmptyPendingEntry(slots: string[]): PendingEntry {
  return {
    slots,
    primary_activity_id: null,
    secondary_activity_id: null,
    digital_media_used: false,
    digital_media_type_ids: [],
    location_transport_id: null,
    social_context_ids: [],
    satisfaction_id: null,
  };
}

// Checks if all selected slots already have entries with identical activity data.
// If so, pre-fills the questionnaire for editing. Otherwise returns null (fresh start).
// Mixed selections (some filled, some empty, or different data) always return null.
function getPreloadedEntry(
  selectedSlots: Set<string>,
  existingEntries: TimeEntryRecord[],
): PendingEntry | null {
  const slotList = [...selectedSlots].sort();

  // Match existing entries by start_time (one entry per slot)
  const matchingEntries = existingEntries.filter((e) =>
    slotList.includes(e.start_time),
  );

  // No existing data → fresh entry
  if (matchingEntries.length === 0) return null;

  // Mixed: some slots filled, some empty → overwrite, start fresh
  if (matchingEntries.length !== slotList.length) return null;

  // All slots filled — only pre-load if every entry has identical activity data
  const first = matchingEntries[0];
  const allIdentical = matchingEntries.every(
    (e) =>
      e.primary_activity_id === first.primary_activity_id &&
      e.secondary_activity_id === first.secondary_activity_id &&
      e.satisfaction_id === first.satisfaction_id &&
      e.location_transport_id === first.location_transport_id &&
      e.digital_media_used === first.digital_media_used &&
      JSON.stringify([...e.digital_media_type_ids].sort()) ===
        JSON.stringify([...first.digital_media_type_ids].sort()),
  );

  if (!allIdentical) return null;

  return {
    slots: slotList,
    primary_activity_id: first.primary_activity_id,
    secondary_activity_id: first.secondary_activity_id,
    digital_media_used: first.digital_media_used,
    digital_media_type_ids: first.digital_media_type_ids,
    location_transport_id: first.location_transport_id,
    social_context_ids: first.social_context_ids,
    satisfaction_id: first.satisfaction_id,
  };
}

// Maps a raw Supabase row (with nested social_context join) to TimeEntryRecord
function mapRawEntryToRecord(raw: any): TimeEntryRecord {
  return {
    entry_id: raw.entry_id,
    day_id: raw.day_id,
    start_time: normalizeDbTime(raw.start_time),
    end_time: normalizeDbTime(raw.end_time),
    primary_activity_id: raw.primary_activity_id,
    secondary_activity_id: raw.secondary_activity_id ?? null,
    satisfaction_id: raw.satisfaction_id ?? null,
    location_transport_id: raw.location_transport_id ?? null,
    digital_media_used: raw.digital_media_used,
    digital_media_type_ids:
      raw.time_entry_digital_media_type?.map(
        (r: any) => r.digital_media_type_id,
      ) ?? [],
    social_context_ids:
      raw.time_entry_social_context?.map((sc: any) => sc.social_context_id) ??
      [],
  };
}

// ─── CompletionBar component ──────────────────────────────────────────────────

// Shows the current date with prev/next arrows and a slot-fill progress bar
function CompletionBar({
  currentDate,
  coveredSlots,
  allDates,
  onDateChange,
}: {
  currentDate: string;
  coveredSlots: number;
  allDates: string[];
  onDateChange: (date: string) => void;
}) {
  const currentIndex = allDates.indexOf(currentDate);
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < allDates.length - 1;
  const previousDate = canGoPrev ? allDates[currentIndex - 1] : null;
  const nextDate = canGoNext ? allDates[currentIndex + 1] : null;
  const progressPercent = Math.min(
    Math.round((coveredSlots / TOTAL_SLOTS_PER_DAY) * 100),
    100,
  );
  const progressFillClass =
    coveredSlots <= 0
      ? "bg-slate-300"
      : coveredSlots >= TOTAL_SLOTS_PER_DAY
        ? "bg-green-500"
        : "bg-orange-400";
  const progressTextClass =
    coveredSlots <= 0
      ? "text-slate-500"
      : coveredSlots >= TOTAL_SLOTS_PER_DAY
        ? "text-green-600"
        : "text-orange-600";

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
      {/* Date row: prev | current (with inline progress) | next */}
      <div className="grid grid-cols-1 items-stretch gap-2 sm:grid-cols-[140px_1fr_140px]">
        <button
          type="button"
          onClick={() => canGoPrev && onDateChange(allDates[currentIndex - 1])}
          disabled={!canGoPrev}
          className="relative overflow-hidden rounded-md border border-slate-200 bg-white px-4 py-1.5 text-right transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
        >
          <span className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-5xl font-light text-slate-400 select-none leading-none">
            ‹
          </span>
          <p className="relative text-[10px] font-medium uppercase tracking-wide text-slate-400">
            Letzter
          </p>
          <p className="relative text-xs font-medium text-slate-600">
            {previousDate
              ? formatDateCompactGerman(previousDate)
              : "Kein früherer Tag"}
          </p>
        </button>

        {/* Current date + progress inline */}
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
          <p className="text-sm font-bold text-blue-950 sm:text-[15px] leading-tight">
            {formatDateGerman(currentDate)}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-blue-100">
              <div
                className={`h-1.5 rounded-full ${progressFillClass} transition-all duration-500`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span
              className={`text-[10px] font-semibold whitespace-nowrap ${progressTextClass}`}
            >
              {coveredSlots}/{TOTAL_SLOTS_PER_DAY} · {progressPercent}%
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => canGoNext && onDateChange(allDates[currentIndex + 1])}
          disabled={!canGoNext}
          className="relative overflow-hidden rounded-md border border-slate-200 bg-white px-4 py-1.5 text-left transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
        >
          <span className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-5xl font-light text-slate-400 select-none leading-none">
            ›
          </span>
          <p className="relative text-[10px] font-medium uppercase tracking-wide text-slate-400">
            Nächster
          </p>
          <p className="relative text-xs font-medium text-slate-600">
            {nextDate ? formatDateCompactGerman(nextDate) : "Kein späterer Tag"}
          </p>
        </button>
      </div>
    </div>
  );
}

// ─── Main page component ──────────────────────────────────────────────────────

export default function ZeiterfassungPage() {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Auth + course
  const [userId, setUserId] = useState<string | null>(null);
  const [courseId, setCourseId] = useState<number | null>(null);
  const [allDates, setAllDates] = useState<string[]>([]);

  // Current day
  const [currentDate, setCurrentDate] = useState<string>("");
  const [dayId, setDayId] = useState<number | null>(null);
  const [existingEntries, setExistingEntries] = useState<TimeEntryRecord[]>([]);
  const [coveredSlots, setCoveredSlots] = useState(0);

  // Grid + questionnaire
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set());
  const [pendingEntry, setPendingEntry] = useState<PendingEntry | null>(null);
  // true when the pending entry was loaded from an existing (already saved) entry
  const [pendingIsExisting, setPendingIsExisting] = useState(false);
  const [currentStep, setCurrentStep] = useState<QuestionnaireStep | null>(
    null,
  );
  const [stepHistory, setStepHistory] = useState<QuestionnaireStep[]>([]);

  // Lookup data (reference tables)
  const [lookupData, setLookupData] = useState<LookupData | null>(null);

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [gridCollapsed, setGridCollapsed] = useState(false);
  const [isDeletingSelection, setIsDeletingSelection] = useState(false);

  // Confirmation dialog when user tries to navigate away with progress
  const [abandonDialog, setAbandonDialog] = useState<null | (() => void)>(null);

  useEffect(() => {
    loadPageData();
  }, []);

  // Optional local/preview diagnostics: /zeiterfassung?perf=1
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (searchParams.get("perf") !== "1") return;
    if (!("PerformanceObserver" in window)) return;

    let lastValue = 0;
    const observer = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (entry.startTime <= lastValue) continue;
        lastValue = entry.startTime;

        const lcpEntry = entry as PerformanceEntry & {
          element?: Element;
          size?: number;
        };
        const element = lcpEntry.element;
        const className =
          element instanceof HTMLElement ? element.className : "(none)";

        console.info("[perf] LCP update", {
          valueMs: Math.round(entry.startTime),
          size: lcpEntry.size,
          tag: element?.tagName,
          className,
          path: window.location.pathname,
        });
      }
    });

    observer.observe({ type: "largest-contentful-paint", buffered: true });

    return () => observer.disconnect();
  }, [searchParams]);

  // Reload day entries whenever the date or user/course changes
  useEffect(() => {
    if (!currentDate || !userId || courseId === null) return;
    loadDayData(currentDate);
  }, [currentDate, userId, courseId]);

  // ── Data loading ──────────────────────────────────────────────────────────

  // Loads auth, course enrollment, lookup tables, and determines the initial date
  async function loadPageData() {
    setIsLoading(true);

    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      router.push("/");
      return;
    }
    const uid = authData.user.id;
    setUserId(uid);

    // Get course enrollment
    const { data: userCourse } = await supabase
      .from("user_course")
      .select("course_id")
      .eq("profiles_id", uid)
      .single();
    if (!userCourse) {
      setErrorMessage("Kein Kurs gefunden.");
      setIsLoading(false);
      return;
    }
    const cid = userCourse.course_id;
    setCourseId(cid);

    // Load course date range (via periods; fallback to legacy columns)
    const { data: periodsData } = await supabase
      .from("course_period")
      .select("start_date, end_date, sort_order")
      .eq("course_id", cid)
      .order("sort_order", { ascending: true });

    let dates: string[];
    if (periodsData && periodsData.length > 0) {
      dates = getPeriodDates(periodsData);
    } else {
      // Legacy fallback for courses without period rows
      const { data: course } = await supabase
        .from("course")
        .select("start_date, end_date")
        .eq("course_id", cid)
        .single();
      dates = course
        ? getSinglePeriodDates(course.start_date, course.end_date)
        : [];
    }
    setAllDates(dates);

    // Load all lookup tables in parallel for speed
    const [cats, subs, acts, locs, socials, media, sats] = await Promise.all([
      supabase.from("category").select("*").order("category_id"),
      supabase.from("subcategory").select("*").order("subcategory_id"),
      supabase.from("activity").select("*").order("activity_id"),
      supabase
        .from("location_transport")
        .select("*")
        .order("location_transport_id"),
      supabase.from("social_context").select("*").order("social_context_id"),
      supabase
        .from("digital_media_type")
        .select("*")
        .order("digital_media_type_id"),
      supabase.from("satisfaction").select("*").order("satisfaction_id"),
    ]);
    setLookupData({
      categories: cats.data ?? [],
      subcategories: subs.data ?? [],
      activities: acts.data ?? [],
      locationTransports: locs.data ?? [],
      socialContexts: socials.data ?? [],
      digitalMediaTypes: media.data ?? [],
      satisfactions: sats.data ?? [],
    });

    // Determine initial date: URL param → today → earliest incomplete → last
    const dateFromUrl = searchParams.get("date");
    const today = new Date().toISOString().split("T")[0];
    let targetDate: string;

    if (dateFromUrl && dates.includes(dateFromUrl)) {
      targetDate = dateFromUrl;
    } else if (dates.includes(today)) {
      targetDate = today;
    } else {
      const { data: dayRecords } = await supabase
        .from("day")
        .select("date, is_complete")
        .eq("profiles_id", uid)
        .eq("course_id", cid);
      const completedDates = new Set(
        (dayRecords ?? []).filter((d) => d.is_complete).map((d) => d.date),
      );
      targetDate =
        dates.find((d) => !completedDates.has(d)) ?? dates[dates.length - 1];
    }

    setCurrentDate(targetDate);
    setIsLoading(false);
  }

  // Loads the day record and entries for the given date
  async function loadDayData(date: string) {
    if (!userId || courseId === null) return;

    const { data: dayRecord } = await supabase
      .from("day")
      .select("day_id")
      .eq("profiles_id", userId)
      .eq("course_id", courseId)
      .eq("date", date)
      .single();

    const loadedDayId = dayRecord?.day_id ?? null;
    setDayId(loadedDayId);

    if (loadedDayId === null) {
      setExistingEntries([]);
      setCoveredSlots(0);
      return;
    }
    await loadEntriesForDay(loadedDayId);
  }

  // Fetches all time entries (with social context) for a day_id
  async function loadEntriesForDay(targetDayId: number) {
    const { data: rawEntries, error } = await supabase
      .from("time_entry")
      .select(
        `
        entry_id, day_id, start_time, end_time,
        primary_activity_id, secondary_activity_id,
        satisfaction_id, location_transport_id,
        digital_media_used,
        time_entry_digital_media_type ( digital_media_type_id ),
        time_entry_social_context ( social_context_id )
      `,
      )
      .eq("day_id", targetDayId);

    if (error) {
      setErrorMessage("Einträge konnten nicht geladen werden.");
      return;
    }

    const entries = (rawEntries ?? []).map(mapRawEntryToRecord);
    setExistingEntries(entries);

    // Update progress bar
    const totalCovered = entries.reduce(
      (sum, e) => sum + calculateCoveredSlots(e.start_time, e.end_time),
      0,
    );
    setCoveredSlots(totalCovered);
  }

  // ── Grid interaction ──────────────────────────────────────────────────────

  // Returns true when the user has made unsaved progress on a NEW entry
  function hasProgress(): boolean {
    return !!(
      pendingEntry &&
      pendingEntry.primary_activity_id !== null &&
      !pendingIsExisting
    );
  }

  // Triggered when the user finishes a drag — starts the questionnaire
  const handleSlotsSelected = useCallback(
    (slots: Set<string>) => {
      if (slots.size === 0) return;
      const proceed = () => {
        const preloaded = getPreloadedEntry(slots, existingEntries);
        setPendingEntry(
          preloaded ?? createEmptyPendingEntry([...slots].sort()),
        );
        setPendingIsExisting(!!preloaded);
        setSelectedSlots(slots);
        setCurrentStep("primary_activity");
        setStepHistory([]);
      };
      if (hasProgress()) {
        setAbandonDialog(() => proceed);
      } else {
        proceed();
      }
    },
    [existingEntries, pendingEntry],
  );

  // ── Questionnaire logic ───────────────────────────────────────────────────

  // Merges step data into pendingEntry and advances to next step (or saves)
  function handleStepComplete(stepData: Partial<PendingEntry>) {
    if (!pendingEntry || !currentStep) return;

    const shouldSave = (stepData as any)._save === true;
    const isAdvance = (stepData as any)._advance === true;
    const { _save, _advance, ...cleanData } = stepData as any;
    const updatedEntry: PendingEntry = { ...pendingEntry, ...cleanData };

    // social_context and digital_media_type toggles fire onStepComplete for state
    // updates without advancing — only proceed when _advance is set
    const isIntermediateUpdate =
      (currentStep === "social_context" ||
        currentStep === "digital_media_type") &&
      !isAdvance &&
      !shouldSave;

    if (isIntermediateUpdate) {
      setPendingEntry(updatedEntry);
      return;
    }

    setPendingEntry(updatedEntry);
    // Once the user actively advances a step, treat as unsaved new progress
    setPendingIsExisting(false);

    if (shouldSave) {
      saveEntry(updatedEntry);
      return;
    }

    const nextStep = getNextStep(currentStep, updatedEntry);
    if (nextStep === null) {
      saveEntry(updatedEntry);
    } else {
      setStepHistory((prev) => [...prev, currentStep]);
      setCurrentStep(nextStep);
    }
  }

  function handleBack() {
    if (stepHistory.length === 0) return;
    setCurrentStep(stepHistory[stepHistory.length - 1]);
    setStepHistory((prev) => prev.slice(0, -1));
  }

  function handleCancel() {
    setSelectedSlots(new Set());
    setPendingEntry(null);
    setCurrentStep(null);
    setStepHistory([]);
  }

  async function handleDeleteSelectedEntries() {
    if (selectedSlots.size === 0) return;

    // If no day exists yet, there is nothing persisted to remove.
    if (dayId === null) {
      handleCancel();
      return;
    }

    setIsDeletingSelection(true);
    try {
      await deleteOverlappingEntries(dayId, [...selectedSlots].sort());
      await loadEntriesForDay(dayId);
      await updateDayCompletion(dayId);
      handleCancel();
    } catch {
      setErrorMessage("Einträge konnten nicht gelöscht werden.");
    } finally {
      setIsDeletingSelection(false);
    }
  }

  async function handleDeleteSlots(slots: string[]) {
    if (slots.length === 0) return;
    if (dayId === null) return;
    setIsDeletingSelection(true);
    try {
      await deleteOverlappingEntries(dayId, slots.sort());
      await loadEntriesForDay(dayId);
      await updateDayCompletion(dayId);
    } catch {
      setErrorMessage("Einträge konnten nicht gelöscht werden.");
    } finally {
      setIsDeletingSelection(false);
    }
  }

  function handleReselectSlots(slots: string[]) {
    if (slots.length === 0) return;
    const newSet = new Set(slots);
    const preloaded = getPreloadedEntry(newSet, existingEntries);
    setPendingEntry(preloaded ?? createEmptyPendingEntry(slots.sort()));
    setPendingIsExisting(!!preloaded);
    setSelectedSlots(newSet);
    setCurrentStep("primary_activity");
    setStepHistory([]);
  }

  // ── Saving ────────────────────────────────────────────────────────────────

  async function saveEntry(finalEntry: PendingEntry) {
    if (!userId || courseId === null || !finalEntry.primary_activity_id) return;

    const sortedSlots = [...finalEntry.slots].sort();

    // Ensure a day record exists before inserting entries
    const activeDayId = await ensureDayRecord();
    if (activeDayId === null) return;

    // Remove any existing entries for the selected slots before inserting
    await deleteOverlappingEntries(activeDayId, sortedSlots);

    // Build one DB row per selected slot (constraint: end_time = start_time + 10 min)
    const rowsToInsert = sortedSlots.map((slot) => ({
      day_id: activeDayId,
      start_time: `${slot}:00`,
      end_time: getSlotEndTime(slot),
      primary_activity_id: finalEntry.primary_activity_id,
      secondary_activity_id: finalEntry.secondary_activity_id || null,
      satisfaction_id: finalEntry.satisfaction_id || null,
      location_transport_id: finalEntry.location_transport_id || null,
      digital_media_used: finalEntry.digital_media_used,
    }));

    const { data: newEntries, error: insertError } = await supabase
      .from("time_entry")
      .insert(rowsToInsert)
      .select("entry_id");

    if (insertError || !newEntries) {
      setErrorMessage(
        `Eintrag konnte nicht gespeichert werden: ${insertError?.message ?? "unbekannter Fehler"}`,
      );
      return;
    }

    // Insert digital media type junction rows
    if (
      finalEntry.digital_media_used &&
      finalEntry.digital_media_type_ids.length > 0
    ) {
      const mediaRows = newEntries.flatMap((entry) =>
        finalEntry.digital_media_type_ids.map((id) => ({
          entry_id: entry.entry_id,
          digital_media_type_id: id,
        })),
      );
      await supabase.from("time_entry_digital_media_type").insert(mediaRows);
    }

    // Insert social context records for every newly created entry
    if (finalEntry.social_context_ids.length > 0) {
      const socialRows = newEntries.flatMap((entry) =>
        finalEntry.social_context_ids.map((id) => ({
          entry_id: entry.entry_id,
          social_context_id: id,
        })),
      );
      await supabase.from("time_entry_social_context").insert(socialRows);
    }

    // Refresh the grid and update day completion flag
    await loadEntriesForDay(activeDayId);
    await updateDayCompletion(activeDayId);
    handleCancel();
  }

  // Creates a day record if one doesn't exist yet, returns the day_id
  async function ensureDayRecord(): Promise<number | null> {
    if (dayId !== null) return dayId;

    const { data, error } = await supabase
      .from("day")
      .insert({ profiles_id: userId, course_id: courseId, date: currentDate })
      .select("day_id")
      .single();

    if (error || !data) {
      setErrorMessage(
        `Tageseintrag konnte nicht erstellt werden: ${error?.message ?? "unbekannter Fehler"}`,
      );
      return null;
    }
    setDayId(data.day_id);
    return data.day_id;
  }

  // Deletes all existing entries whose start_time matches any of the selected slots
  // Social context records are deleted first due to the foreign key constraint
  async function deleteOverlappingEntries(
    activeDayId: number,
    slots: string[],
  ) {
    // existingEntries uses "HH:MM" — match directly against the slot strings
    const slotsSet = new Set(slots);
    const toDelete = existingEntries.filter((e) => slotsSet.has(e.start_time));
    if (toDelete.length === 0) return;

    const ids = toDelete.map((e) => e.entry_id);
    await supabase
      .from("time_entry_digital_media_type")
      .delete()
      .in("entry_id", ids);
    await supabase
      .from("time_entry_social_context")
      .delete()
      .in("entry_id", ids);
    await supabase.from("time_entry").delete().in("entry_id", ids);
  }

  // Counts covered slots after save and updates is_complete + is_submitted on the day record
  // Both flags are kept in sync: a fully filled day is automatically marked as submitted,
  // and editing it back below 144 slots un-submits it
  async function updateDayCompletion(activeDayId: number) {
    const { data: entries } = await supabase
      .from("time_entry")
      .select("start_time, end_time")
      .eq("day_id", activeDayId);

    const totalCovered = (entries ?? []).reduce(
      (sum, e) => sum + calculateCoveredSlots(e.start_time, e.end_time),
      0,
    );
    const isComplete = totalCovered >= TOTAL_SLOTS_PER_DAY;
    await supabase
      .from("day")
      .update({ is_complete: isComplete, is_submitted: isComplete })
      .eq("day_id", activeDayId);
  }

  // ── Date navigation ───────────────────────────────────────────────────────

  function handleDateChange(date: string) {
    const proceed = () => {
      handleCancel();
      setGridCollapsed(false);
      setCurrentDate(date);
      router.replace(`/zeiterfassung?date=${date}`);
    };
    if (hasProgress()) {
      setAbandonDialog(() => proceed);
    } else {
      proceed();
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (isLoading || !lookupData || !currentDate) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="h-4 w-44 animate-pulse rounded bg-slate-200" />
          <div className="mt-3 h-2 w-full animate-pulse rounded-full bg-slate-100" />
        </div>

        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          <div className="w-full md:w-1/3 min-w-0 md:self-start">
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
              Raster wird geladen...
            </div>
          </div>

          <div className="w-full md:w-2/3 min-w-0">
            <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white p-10 text-center">
              <p className="text-3xl mb-4">⏱️</p>
              <p className="text-base font-semibold text-slate-700">
                Zeitslot auswählen
              </p>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                Markiere zuerst einen oder mehrere Slots im Raster.
                <br className="hidden sm:block" /> Danach wählst du die passende
                Kategorie als Kachel und direkt die Aktivität.
              </p>
            </div>
          </div>
        </div>
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

  // Collapse grid on mobile when questionnaire opens, expand when it closes
  const isQuestionnaireActive = !!(currentStep && pendingEntry);

  return (
    <div className="space-y-4">
      {/* Completion bar: date navigation + slot progress */}
      <CompletionBar
        currentDate={currentDate}
        coveredSlots={coveredSlots}
        allDates={allDates}
        onDateChange={handleDateChange}
      />

      {/* Responsive layout: stacked on mobile, side-by-side on md+ */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        {/* Left: 24×6 time grid — collapsible on mobile when questionnaire is active */}
        <div className="w-full md:w-1/3 min-w-0 md:self-start">
          {/* Mobile collapse toggle — only shown when questionnaire is open */}
          {isQuestionnaireActive && (
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 md:hidden"
              onClick={() => setGridCollapsed((v) => !v)}
            >
              <span>Zeitraster</span>
              <span className="text-slate-400 text-xs">
                {gridCollapsed ? "▼ Aufklappen" : "▲ Einklappen"}
              </span>
            </button>
          )}

          {/* Grid: always visible on md+, toggleable on mobile when questionnaire active */}
          <div
            className={`${isQuestionnaireActive && gridCollapsed ? "hidden" : "block"} md:block ${isQuestionnaireActive ? "mt-2 md:mt-0" : ""}`}
          >
            <TimeGrid
              existingEntries={existingEntries}
              selectedSlots={selectedSlots}
              lookupData={lookupData}
              onSlotsSelected={(slots) => {
                setGridCollapsed(true);
                handleSlotsSelected(slots);
              }}
            />
          </div>
        </div>

        {/* Right: activity questionnaire or idle placeholder */}
        <div className="w-full md:w-2/3 min-w-0">
          {isQuestionnaireActive ? (
            <ActivitySelector
              step={currentStep}
              pendingEntry={pendingEntry}
              selectedSlots={selectedSlots}
              existingEntries={existingEntries}
              lookupData={lookupData}
              onStepComplete={handleStepComplete}
              onBack={handleBack}
              onDeleteSelection={handleDeleteSelectedEntries}
              onDeleteSlots={handleDeleteSlots}
              onReselectSlots={handleReselectSlots}
              showDeleteSelection={selectedSlots.size > 0}
              isDeletingSelection={isDeletingSelection}
            />
          ) : (
            <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white p-10 text-center">
              <p className="text-3xl mb-4">⏱️</p>
              <p className="text-base font-semibold text-slate-700">
                Zeitslot auswählen
              </p>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                Markiere zuerst einen oder mehrere Slots im Raster.
                <br className="hidden sm:block" /> Danach wählst du die passende
                Kategorie als Kachel und direkt die Aktivität.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Abandon-progress confirmation dialog */}
      {abandonDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h2 className="text-base font-semibold text-slate-900">
              Eingabe abbrechen?
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Du hast bereits Angaben gemacht. Wenn du jetzt wechselst, gehen
              deine bisherigen Eingaben verloren.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAbandonDialog(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Weiter eingeben
              </button>
              <button
                type="button"
                onClick={() => {
                  abandonDialog();
                  setAbandonDialog(null);
                }}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
              >
                Ja, verwerfen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
