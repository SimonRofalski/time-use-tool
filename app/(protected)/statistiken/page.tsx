"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { getPeriodDates, getSinglePeriodDates } from "@/lib/course-periods";
import ZeitverteilungTab from "./ZeitverteilungTab";
import KursvergleichTab from "./KursvergleichTab";
import type {
  CategoryRow,
  SubcategoryRow,
  ActivityRow,
  DayBarData,
  ComparisonTopic,
  ComparisonMetaStats,
  MetaAggregates,
} from "./types";

// ─── Constants ────────────────────────────────────────────────────────────────

// Activity IDs that count as "Schlaf" (subcategory 1: sleep + sick in bed)
const SLEEP_ACTIVITY_IDS = new Set([1, 2]);

// Activity IDs that count as "Sport" (subcategories 24 and 26)
const SPORT_ACTIVITY_IDS = new Set([77, 78, 79, 80, 81, 82, 83, 85]);

// digital_media_type_id for smartphone usage
const SMARTPHONE_MEDIA_TYPE_ID = 2;

// Minimum submitted days a user must have to be included in the course comparison
const MIN_DAYS_FOR_COMPARISON = 2;

// ─── Types (local, only used in data loading) ─────────────────────────────────

type Tab = "zeitverteilung" | "kursvergleich";
type DayFilterMode = "alle" | "werktage" | "wochenende";

// Raw time entry row as returned by Supabase for aggregation purposes
type RawEntry = {
  entry_id: number;
  day_id: number;
  start_time: string;
  end_time: string;
  primary_activity_id: number | null;
  location_transport_id: number | null;
  satisfaction_id: number | null;
  digital_media_type_ids: number[];
  social_context_ids: number[];
};

// Lookup row shapes
type ActivityLookup = {
  activity_id: number;
  name: string;
  subcategory_id: number;
};
type SubcategoryLookup = {
  subcategory_id: number;
  name: string;
  category_id: number;
};
type CategoryLookup = {
  category_id: number;
  name: string;
};
type DigitalMediaTypeLookup = {
  digital_media_type_id: number;
  name: string;
};
type SocialContextLookup = {
  social_context_id: number;
  name: string;
};
type LocationTransportLookup = {
  location_transport_id: number;
  name: string;
};
type SatisfactionLookup = {
  satisfaction_id: number;
  name: string;
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────

// Calculates how many minutes are covered by a single time_entry row
// e.g. "08:00:00", "09:30:00" → 90 minutes
// Handles the midnight wrap: end_time "00:00" after a non-zero start means 1440 min
function calculateMinutes(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const startMinTotal = sh * 60 + sm;
  const endMinTotal =
    eh === 0 && em === 0 && startMinTotal > 0 ? 1440 : eh * 60 + em;
  return endMinTotal - startMinTotal;
}

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

function normalizeDateOnly(value: string): string {
  return value.slice(0, 10);
}

function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss");
}

function isWeekend(dateString: string): boolean {
  const normalized = dateString.slice(0, 10);
  const [year, month, day] = normalized.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.getDay() === 0 || d.getDay() === 6;
}

function getIsoWeekInfo(dateString: string): { key: string; label: string } {
  const normalized = dateString.slice(0, 10);
  const [year, month, day] = normalized.split("-").map(Number);
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

function isAloneContext(name: string): boolean {
  const normalized = normalizeLabel(name);
  return normalized.includes("allein") || normalized.includes("solo");
}

function isAtHomeLocation(name: string): boolean {
  const normalized = normalizeLabel(name);
  return (
    normalized.includes("zu hause") ||
    normalized.includes("zuhause") ||
    normalized.includes("daheim") ||
    normalized.includes("home")
  );
}

function getSatisfactionRankFromName(name: string): number | null {
  const normalized = normalizeLabel(name);

  // Highest to lowest (5 -> 1)
  if (normalized.includes("sehr gut")) return 5;
  if (normalized === "gut" || normalized.includes(" gut")) return 4;
  if (normalized.includes("mittel")) return 3;
  if (normalized.includes("sehr schlecht")) return 1;
  if (normalized.includes("schlecht")) return 2;

  return null;
}

function formatAverageSatisfactionLabel(
  weightedSum: number,
  weight: number,
  maxRank: number,
): string {
  if (weight <= 0 || maxRank <= 0) return "-";
  const avgRank = weightedSum / weight;
  // Keep percent consistent with the displayed 1-decimal average value.
  const avgRankRounded = Number(avgRank.toFixed(1));
  const ratio = avgRankRounded / maxRank;
  const percent = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  return `${avgRankRounded.toFixed(1)} / ${maxRank} (${percent}%)`;
}

// ─── Data aggregation helpers ─────────────────────────────────────────────────

// Builds the drill-down category tree and bar chart data from raw time entries.
// Only processes entries belonging to submitted days.
function buildZeitverteilungData(
  entries: RawEntry[],
  dayIdToDate: Record<number, string>,
  allCourseDates: string[],
  trackedDayIds: Set<number>,
  activities: ActivityLookup[],
  subcategories: SubcategoryLookup[],
  categories: CategoryLookup[],
  digitalMediaById: Record<number, string>,
  socialContextById: Record<number, string>,
  locationById: Record<number, string>,
  satisfactionRankById: Record<number, number>,
  maxSatisfactionRank: number,
): {
  categoryRows: CategoryRow[];
  barData: DayBarData[];
  categoryNames: string[];
  metaAggregates: MetaAggregates;
} {
  // Build lookup maps for fast access by ID
  const activityMap = new Map(activities.map((a) => [a.activity_id, a]));
  const subcategoryMap = new Map(
    subcategories.map((s) => [s.subcategory_id, s]),
  );
  const categoryMap = new Map(categories.map((c) => [c.category_id, c]));

  // Accumulate minutes: category → subcategory → activity
  // Structure: { categoryId: { subcategoryId: { activityId: minutes } } }
  const minuteTree: Record<number, Record<number, Record<number, number>>> = {};

  // Accumulate minutes per day per category for the bar chart
  // Structure: { date: { categoryId: minutes } }
  const dailyMinutes: Record<string, Record<number, number>> = {};
  const uncategorizedByDate: Record<string, number> = {};
  let uncategorizedTotal = 0;

  const deviceMinutesByName: Record<string, number> = {};
  const socialMinutesByName: Record<string, number> = {};
  const locationMinutesByName: Record<string, number> = {};

  const activityMetaById: Record<
    number,
    {
      withDevicesMinutes: number;
      withoutDevicesMinutes: number;
      withPeopleMinutes: number;
      aloneMinutes: number;
      atHomeMinutes: number;
      elsewhereMinutes: number;
      satisfactionWeightedSum: number;
      satisfactionWeight: number;
    }
  > = {};

  let overallSatisfactionWeightedSum = 0;
  let overallSatisfactionWeight = 0;
  const trackedDates = new Set(
    Object.values(dayIdToDate).map((d) => normalizeDateOnly(d)),
  );

  for (const entry of entries) {
    // Only include entries from tracked days
    if (!trackedDayIds.has(entry.day_id)) continue;

    const dateRaw = dayIdToDate[entry.day_id];
    if (!dateRaw) continue;
    const date = normalizeDateOnly(dateRaw);

    const activity =
      entry.primary_activity_id != null
        ? activityMap.get(entry.primary_activity_id)
        : undefined;

    const minutes = calculateMinutes(entry.start_time, entry.end_time);

    const deviceTypeIds = entry.digital_media_type_ids;
    if (deviceTypeIds.length > 0) {
      const split = minutes / deviceTypeIds.length;
      for (const id of deviceTypeIds) {
        const name = digitalMediaById[id] ?? `Gerät #${id}`;
        deviceMinutesByName[name] = (deviceMinutesByName[name] ?? 0) + split;
      }
    } else {
      deviceMinutesByName["Ohne IT-Gerät"] =
        (deviceMinutesByName["Ohne IT-Gerät"] ?? 0) + minutes;
    }

    const contextIds = entry.social_context_ids;
    if (contextIds.length > 0) {
      const split = minutes / contextIds.length;
      for (const id of contextIds) {
        const name = socialContextById[id] ?? `Kontext #${id}`;
        socialMinutesByName[name] = (socialMinutesByName[name] ?? 0) + split;
      }
    } else {
      socialMinutesByName["Allein"] =
        (socialMinutesByName["Allein"] ?? 0) + minutes;
    }

    const locationName =
      entry.location_transport_id != null
        ? (locationById[entry.location_transport_id] ??
          `Ort #${entry.location_transport_id}`)
        : "Unbekannt";
    locationMinutesByName[locationName] =
      (locationMinutesByName[locationName] ?? 0) + minutes;

    if (entry.satisfaction_id != null) {
      const rank = satisfactionRankById[entry.satisfaction_id];
      if (rank != null) {
        overallSatisfactionWeightedSum += rank * minutes;
        overallSatisfactionWeight += minutes;
      }
    }

    if (!activity) {
      uncategorizedByDate[date] = (uncategorizedByDate[date] ?? 0) + minutes;
      uncategorizedTotal += minutes;
      continue;
    }

    const subcategory = subcategoryMap.get(activity.subcategory_id);
    if (!subcategory) {
      uncategorizedByDate[date] = (uncategorizedByDate[date] ?? 0) + minutes;
      uncategorizedTotal += minutes;
      continue;
    }

    const category = categoryMap.get(subcategory.category_id);
    if (!category) {
      uncategorizedByDate[date] = (uncategorizedByDate[date] ?? 0) + minutes;
      uncategorizedTotal += minutes;
      continue;
    }
    const catId = category.category_id;
    const subId = subcategory.subcategory_id;
    const actId = activity.activity_id;

    if (!activityMetaById[actId]) {
      activityMetaById[actId] = {
        withDevicesMinutes: 0,
        withoutDevicesMinutes: 0,
        withPeopleMinutes: 0,
        aloneMinutes: 0,
        atHomeMinutes: 0,
        elsewhereMinutes: 0,
        satisfactionWeightedSum: 0,
        satisfactionWeight: 0,
      };
    }
    const activityMeta = activityMetaById[actId];

    if (deviceTypeIds.length > 0) {
      activityMeta.withDevicesMinutes += minutes;
    } else {
      activityMeta.withoutDevicesMinutes += minutes;
    }

    const contextNames = contextIds.map((id) => socialContextById[id] ?? "");
    const hasOtherPeople = contextNames.some((name) => !isAloneContext(name));
    if (hasOtherPeople) {
      activityMeta.withPeopleMinutes += minutes;
    } else {
      activityMeta.aloneMinutes += minutes;
    }

    if (isAtHomeLocation(locationName)) {
      activityMeta.atHomeMinutes += minutes;
    } else {
      activityMeta.elsewhereMinutes += minutes;
    }

    if (entry.satisfaction_id != null) {
      const rank = satisfactionRankById[entry.satisfaction_id];
      if (rank != null) {
        activityMeta.satisfactionWeightedSum += rank * minutes;
        activityMeta.satisfactionWeight += minutes;
      }
    }

    // Accumulate into the tree
    if (!minuteTree[catId]) minuteTree[catId] = {};
    if (!minuteTree[catId][subId]) minuteTree[catId][subId] = {};
    minuteTree[catId][subId][actId] =
      (minuteTree[catId][subId][actId] ?? 0) + minutes;

    // Accumulate into daily map
    if (!dailyMinutes[date]) dailyMinutes[date] = {};
    dailyMinutes[date][catId] = (dailyMinutes[date][catId] ?? 0) + minutes;
  }

  // Total minutes across everything (for percentage calculation)
  const categorizedTotal = Object.values(minuteTree).reduce(
    (catSum, subs) =>
      catSum +
      Object.values(subs).reduce(
        (subSum, acts) =>
          subSum + Object.values(acts).reduce((a, b) => a + b, 0),
        0,
      ),
    0,
  );
  const grandTotal = categorizedTotal + uncategorizedTotal;

  // Build the CategoryRow array, sorted by total minutes descending
  const categoryRows: CategoryRow[] = categories
    .filter((cat) => minuteTree[cat.category_id])
    .map((cat) => {
      const subTree = minuteTree[cat.category_id];

      // Build subcategory rows
      const subcategoryRows: SubcategoryRow[] = subcategories
        .filter((sub) => subTree[sub.subcategory_id])
        .map((sub) => {
          const actTree = subTree[sub.subcategory_id];

          // Build activity rows
          const activityRows: ActivityRow[] = activities
            .filter((act) => actTree[act.activity_id])
            .map((act) => {
              const mins = actTree[act.activity_id];
              const meta = activityMetaById[act.activity_id];
              return {
                activityId: act.activity_id,
                name: act.name,
                totalMinutes: mins,
                percentOfTotal: grandTotal > 0 ? (mins / grandTotal) * 100 : 0,
                meta: {
                  withDevicesMinutes: meta?.withDevicesMinutes ?? 0,
                  withoutDevicesMinutes: meta?.withoutDevicesMinutes ?? 0,
                  withPeopleMinutes: meta?.withPeopleMinutes ?? 0,
                  aloneMinutes: meta?.aloneMinutes ?? 0,
                  atHomeMinutes: meta?.atHomeMinutes ?? 0,
                  elsewhereMinutes: meta?.elsewhereMinutes ?? 0,
                  satisfactionWeightedSum: meta?.satisfactionWeightedSum ?? 0,
                  satisfactionWeight: meta?.satisfactionWeight ?? 0,
                  avgSatisfactionLabel: formatAverageSatisfactionLabel(
                    meta?.satisfactionWeightedSum ?? 0,
                    meta?.satisfactionWeight ?? 0,
                    maxSatisfactionRank,
                  ),
                },
              };
            })
            .sort((a, b) => b.totalMinutes - a.totalMinutes);

          const subTotal = activityRows.reduce((s, a) => s + a.totalMinutes, 0);
          return {
            subcategoryId: sub.subcategory_id,
            name: sub.name,
            totalMinutes: subTotal,
            percentOfTotal: grandTotal > 0 ? (subTotal / grandTotal) * 100 : 0,
            isExpanded: true,
            activities: activityRows,
          };
        })
        .sort((a, b) => b.totalMinutes - a.totalMinutes);

      const catTotal = subcategoryRows.reduce(
        (s, sub) => s + sub.totalMinutes,
        0,
      );
      return {
        categoryId: cat.category_id,
        name: cat.name,
        totalMinutes: catTotal,
        percentOfTotal: grandTotal > 0 ? (catTotal / grandTotal) * 100 : 0,
        isExpanded: true,
        subcategories: subcategoryRows,
      };
    })
    .sort((a, b) => b.totalMinutes - a.totalMinutes);

  if (uncategorizedTotal > 0) {
    categoryRows.push({
      categoryId: 0,
      name: "Ohne Zuordnung",
      totalMinutes: uncategorizedTotal,
      percentOfTotal:
        grandTotal > 0 ? (uncategorizedTotal / grandTotal) * 100 : 0,
      isExpanded: false,
      subcategories: [],
    });
    categoryRows.sort((a, b) => b.totalMinutes - a.totalMinutes);
  }

  // Build the sorted category name list (same order as categoryRows)
  const categoryNames = categoryRows.map((r) => r.name);

  // Build one DayBarData entry per course date
  const normalizedCourseDates = Array.from(
    new Set(allCourseDates.map((d) => normalizeDateOnly(d))),
  );
  const todayEpochDay = dateOnlyToEpochDay(getLocalIsoDate(new Date()));
  const barData: DayBarData[] = normalizedCourseDates.map((date) => {
    const isTrackedDay = trackedDates.has(date);

    // Not tracked day: show a small placeholder for past/today,
    // and no placeholder for future days.
    if (!isTrackedDay) {
      const dateEpochDay = dateOnlyToEpochDay(date);
      if (dateEpochDay > todayEpochDay) {
        return {
          date,
          isSubmitted: false,
        };
      }
      return {
        date,
        isSubmitted: false,
        unsubmitted: 60,
      };
    }

    // Submitted day: populate per-category minutes
    const dayEntry: DayBarData = { date, isSubmitted: true };
    for (const cat of categoryRows) {
      dayEntry[cat.name] =
        cat.categoryId === 0
          ? (uncategorizedByDate[date] ?? 0)
          : (dailyMinutes[date]?.[cat.categoryId] ?? 0);
    }
    return dayEntry;
  });

  const toSortedItems = (obj: Record<string, number>) =>
    Object.entries(obj)
      .map(([name, minutes]) => ({ name, minutes: Math.round(minutes) }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 8);

  const metaAggregates: MetaAggregates = {
    devices: toSortedItems(deviceMinutesByName),
    social: toSortedItems(socialMinutesByName),
    locations: toSortedItems(locationMinutesByName),
    avgSatisfactionLabel: formatAverageSatisfactionLabel(
      overallSatisfactionWeightedSum,
      overallSatisfactionWeight,
      maxSatisfactionRank,
    ),
  };

  return { categoryRows, barData, categoryNames, metaAggregates };
}

// Calculates average hours per day for a set of entries, filtered to a specific set of activity IDs.
// Only counts days that have at least one matching entry.
// Returns 0 if no matching entries exist.
function calcAverageHoursPerDay(
  entries: RawEntry[],
  submittedDayIds: Set<number>,
  activityIdFilter: Set<number>,
): number {
  // Minutes per day: only count days where the activity appears
  const minutesByDay: Record<number, number> = {};

  for (const entry of entries) {
    if (!submittedDayIds.has(entry.day_id)) continue;
    if (entry.primary_activity_id == null) continue;
    if (!activityIdFilter.has(entry.primary_activity_id)) continue;

    const mins = calculateMinutes(entry.start_time, entry.end_time);
    minutesByDay[entry.day_id] = (minutesByDay[entry.day_id] ?? 0) + mins;
  }

  // Average over ALL submitted days (including days with zero minutes for this activity)
  const totalDays = submittedDayIds.size;
  if (totalDays === 0) return 0;

  const totalMinutes = Object.values(minutesByDay).reduce((s, m) => s + m, 0);
  return totalMinutes / 60 / totalDays;
}

// Calculates average hours per day the user used smartphone (digital_media_type_id = 2)
// Counts all time entries where digital_media_type_id matches, across submitted days.
function calcSmartphoneHoursPerDay(
  entries: RawEntry[],
  submittedDayIds: Set<number>,
): number {
  const totalDays = submittedDayIds.size;
  if (totalDays === 0) return 0;

  let totalMinutes = 0;
  for (const entry of entries) {
    if (!submittedDayIds.has(entry.day_id)) continue;
    if (!entry.digital_media_type_ids.includes(SMARTPHONE_MEDIA_TYPE_ID)) {
      continue;
    }
    totalMinutes += calculateMinutes(entry.start_time, entry.end_time);
  }

  return totalMinutes / 60 / totalDays;
}

function pairPercent(leftMinutes: number, rightMinutes: number) {
  const total = leftMinutes + rightMinutes;
  if (total <= 0) return null;
  const leftPercent = Math.round((leftMinutes / total) * 100);
  return {
    leftPercent,
    rightPercent: 100 - leftPercent,
  };
}

function filterDayIds(
  dayIds: number[],
  dayIdToDate: Record<number, string>,
  weeksFilter: string[],
  dayMode: DayFilterMode,
): number[] {
  const weekKeySet = new Set(weeksFilter);
  return dayIds.filter((dayId) => {
    const date = dayIdToDate[dayId];
    if (!date) return false;

    if (weekKeySet.size > 0 && !weekKeySet.has(getIsoWeekInfo(date).key)) {
      return false;
    }
    if (dayMode === "werktage" && isWeekend(date)) return false;
    if (dayMode === "wochenende" && !isWeekend(date)) return false;

    return true;
  });
}

// ─── Main page component ──────────────────────────────────────────────────────

export default function StatistikenPage() {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<Tab>("zeitverteilung");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [isCourseComparisonEnabled, setIsCourseComparisonEnabled] =
    useState(false);

  // Zeitverteilung tab state
  const [categoryRows, setCategoryRows] = useState<CategoryRow[]>([]);
  const [barData, setBarData] = useState<DayBarData[]>([]);
  const [categoryNames, setCategoryNames] = useState<string[]>([]);
  const [metaAggregates, setMetaAggregates] = useState<MetaAggregates | null>(
    null,
  );
  const [selectedWeeks, setSelectedWeeks] = useState<string[]>([]);
  const [weekOptions, setWeekOptions] = useState<
    { key: string; label: string }[]
  >([]);
  const [dayFilter, setDayFilter] = useState<DayFilterMode>("alle");

  // Raw data kept for KW-filter recomputation
  type RawDataSnapshot = {
    myEntries: RawEntry[];
    myDayIdToDate: Record<number, string>;
    allCourseDates: string[];
    trackedDayIds: Set<number>;
    activities: ActivityLookup[];
    subcategories: SubcategoryLookup[];
    categories: CategoryLookup[];
    digitalMediaById: Record<number, string>;
    socialContextById: Record<number, string>;
    locationById: Record<number, string>;
    satisfactionRankById: Record<number, number>;
    maxSatisfactionRank: number;
  };
  const rawDataRef = useRef<RawDataSnapshot | null>(null);

  type RawComparisonSnapshot = {
    userId: string;
    qualifyingUsers: Array<[string, number[]]>;
    rawAllEntries: RawEntry[];
    dayIdToDate: Record<number, string>;
    myEntries: RawEntry[];
    mySubmittedDayIds: Set<number>;
    socialContextById: Record<number, string>;
    locationById: Record<number, string>;
    satisfactionRankById: Record<number, number>;
    maxSatisfactionRank: number;
  };
  const rawComparisonRef = useRef<RawComparisonSnapshot | null>(null);

  // Kursvergleich tab state
  const [comparisonTopics, setComparisonTopics] = useState<ComparisonTopic[]>(
    [],
  );
  const [comparisonMetaStats, setComparisonMetaStats] =
    useState<ComparisonMetaStats | null>(null);
  const [qualifyingUserCount, setQualifyingUserCount] = useState(0);

  useEffect(() => {
    loadAllData();

    const handleFocus = () => {
      void loadAllData();
    };

    const handlePageShow = () => {
      void loadAllData();
    };

    const handleVisibility = () => {
      if (!document.hidden) void loadAllData();
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

  // Recomputes Zeitverteilung stats from raw data, filtered by KW and day-of-week
  function computeAndSetStats(weeksFilter: string[], dayMode: DayFilterMode) {
    const raw = rawDataRef.current;
    if (!raw) return;

    let filteredCourseDates = raw.allCourseDates;
    let filteredTrackedDayIds = raw.trackedDayIds;

    // Apply KW filter
    if (weeksFilter.length > 0) {
      const weekKeySet = new Set(weeksFilter);
      filteredCourseDates = filteredCourseDates.filter((date) =>
        weekKeySet.has(getIsoWeekInfo(date).key),
      );
      filteredTrackedDayIds = new Set(
        [...filteredTrackedDayIds].filter((dayId) => {
          const date = raw.myDayIdToDate[dayId];
          return date != null && weekKeySet.has(getIsoWeekInfo(date).key);
        }),
      );
    }

    // Apply day-of-week filter
    if (dayMode === "werktage") {
      filteredCourseDates = filteredCourseDates.filter((d) => !isWeekend(d));
      filteredTrackedDayIds = new Set(
        [...filteredTrackedDayIds].filter((dayId) => {
          const date = raw.myDayIdToDate[dayId];
          return date != null && !isWeekend(date);
        }),
      );
    } else if (dayMode === "wochenende") {
      filteredCourseDates = filteredCourseDates.filter((d) => isWeekend(d));
      filteredTrackedDayIds = new Set(
        [...filteredTrackedDayIds].filter((dayId) => {
          const date = raw.myDayIdToDate[dayId];
          return date != null && isWeekend(date);
        }),
      );
    }

    const result = buildZeitverteilungData(
      raw.myEntries,
      raw.myDayIdToDate,
      filteredCourseDates,
      filteredTrackedDayIds,
      raw.activities,
      raw.subcategories,
      raw.categories,
      raw.digitalMediaById,
      raw.socialContextById,
      raw.locationById,
      raw.satisfactionRankById,
      raw.maxSatisfactionRank,
    );
    setCategoryRows(result.categoryRows);
    setBarData(result.barData);
    setCategoryNames(result.categoryNames);
    setMetaAggregates(result.metaAggregates);
  }

  function computeAndSetComparison(
    weeksFilter: string[],
    dayMode: DayFilterMode,
  ) {
    const raw = rawComparisonRef.current;
    if (!raw) return;

    const filteredUsers = raw.qualifyingUsers
      .map(([profileId, dayIds]) => {
        const filteredDayIds = filterDayIds(
          dayIds,
          raw.dayIdToDate,
          weeksFilter,
          dayMode,
        );
        return [profileId, filteredDayIds] as const;
      })
      .filter(([, dayIds]) => dayIds.length >= MIN_DAYS_FOR_COMPARISON);

    setQualifyingUserCount(filteredUsers.length);

    if (filteredUsers.length < 3) {
      setComparisonTopics([]);
      setComparisonMetaStats(null);
      return;
    }

    const sleepValues: number[] = [];
    const sportValues: number[] = [];
    const smartphoneValues: number[] = [];

    let courseWithDevice = 0;
    let courseWithoutDevice = 0;
    let courseWithOthers = 0;
    let courseAlone = 0;
    let courseAtHome = 0;
    let courseElsewhere = 0;
    let courseSatisfactionWeightedSum = 0;
    let courseSatisfactionWeight = 0;

    for (const [profileId, dayIds] of filteredUsers) {
      const dayIdSet = new Set(dayIds);
      const userEntries = raw.rawAllEntries.filter((e) =>
        dayIdSet.has(e.day_id),
      );

      sleepValues.push(
        calcAverageHoursPerDay(userEntries, dayIdSet, SLEEP_ACTIVITY_IDS),
      );
      sportValues.push(
        calcAverageHoursPerDay(userEntries, dayIdSet, SPORT_ACTIVITY_IDS),
      );
      smartphoneValues.push(calcSmartphoneHoursPerDay(userEntries, dayIdSet));

      for (const entry of userEntries) {
        const minutes = calculateMinutes(entry.start_time, entry.end_time);

        if (entry.digital_media_type_ids.length > 0) {
          courseWithDevice += minutes;
        } else {
          courseWithoutDevice += minutes;
        }

        const hasOtherPeople = entry.social_context_ids.some((id) => {
          const name = raw.socialContextById[id] ?? "";
          return !isAloneContext(name);
        });
        if (hasOtherPeople) {
          courseWithOthers += minutes;
        } else {
          courseAlone += minutes;
        }

        const locationName =
          entry.location_transport_id != null
            ? (raw.locationById[entry.location_transport_id] ?? "")
            : "";
        if (isAtHomeLocation(locationName)) {
          courseAtHome += minutes;
        } else {
          courseElsewhere += minutes;
        }

        if (entry.satisfaction_id != null) {
          const rank = raw.satisfactionRankById[entry.satisfaction_id];
          if (rank != null) {
            courseSatisfactionWeightedSum += rank * minutes;
            courseSatisfactionWeight += minutes;
          }
        }
      }
    }

    const myFilteredSubmittedDayIds = new Set(
      filterDayIds(
        [...raw.mySubmittedDayIds],
        raw.dayIdToDate,
        weeksFilter,
        dayMode,
      ),
    );

    const mySleepValue = calcAverageHoursPerDay(
      raw.myEntries,
      myFilteredSubmittedDayIds,
      SLEEP_ACTIVITY_IDS,
    );
    const mySportValue = calcAverageHoursPerDay(
      raw.myEntries,
      myFilteredSubmittedDayIds,
      SPORT_ACTIVITY_IDS,
    );
    const mySmartphoneValue = calcSmartphoneHoursPerDay(
      raw.myEntries,
      myFilteredSubmittedDayIds,
    );

    let myWithDevice = 0;
    let myWithoutDevice = 0;
    let myWithOthers = 0;
    let myAlone = 0;
    let myAtHome = 0;
    let myElsewhere = 0;
    let mySatisfactionWeightedSum = 0;
    let mySatisfactionWeight = 0;

    for (const entry of raw.myEntries) {
      if (!myFilteredSubmittedDayIds.has(entry.day_id)) continue;

      const minutes = calculateMinutes(entry.start_time, entry.end_time);

      if (entry.digital_media_type_ids.length > 0) {
        myWithDevice += minutes;
      } else {
        myWithoutDevice += minutes;
      }

      const hasOtherPeople = entry.social_context_ids.some((id) => {
        const name = raw.socialContextById[id] ?? "";
        return !isAloneContext(name);
      });
      if (hasOtherPeople) {
        myWithOthers += minutes;
      } else {
        myAlone += minutes;
      }

      const locationName =
        entry.location_transport_id != null
          ? (raw.locationById[entry.location_transport_id] ?? "")
          : "";
      if (isAtHomeLocation(locationName)) {
        myAtHome += minutes;
      } else {
        myElsewhere += minutes;
      }

      if (entry.satisfaction_id != null) {
        const rank = raw.satisfactionRankById[entry.satisfaction_id];
        if (rank != null) {
          mySatisfactionWeightedSum += rank * minutes;
          mySatisfactionWeight += minutes;
        }
      }
    }

    setComparisonTopics([
      {
        key: "schlaf",
        label: "Schlaf",
        unit: "h/Tag",
        allValues: sleepValues,
        userValue: mySleepValue,
      },
      {
        key: "sport",
        label: "Sport & Bewegung",
        unit: "h/Tag",
        allValues: sportValues,
        userValue: mySportValue,
      },
      {
        key: "smartphone",
        label: "Smartphone",
        unit: "h/Tag",
        allValues: smartphoneValues,
        userValue: mySmartphoneValue,
      },
    ]);

    setComparisonMetaStats({
      itDevice: {
        user: pairPercent(myWithDevice, myWithoutDevice),
        course: pairPercent(courseWithDevice, courseWithoutDevice),
      },
      social: {
        user: pairPercent(myWithOthers, myAlone),
        course: pairPercent(courseWithOthers, courseAlone),
      },
      location: {
        user: pairPercent(myAtHome, myElsewhere),
        course: pairPercent(courseAtHome, courseElsewhere),
      },
      wellbeing: {
        userLabel: formatAverageSatisfactionLabel(
          mySatisfactionWeightedSum,
          mySatisfactionWeight,
          raw.maxSatisfactionRank,
        ),
        courseLabel: formatAverageSatisfactionLabel(
          courseSatisfactionWeightedSum,
          courseSatisfactionWeight,
          raw.maxSatisfactionRank,
        ),
      },
    });
  }

  // ── Data loading ────────────────────────────────────────────────────────────

  async function loadAllData() {
    setIsLoading(true);
    setErrorMessage("");

    // Step 1: get the logged-in user
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      router.push("/");
      return;
    }
    const userId = authData.user.id;

    // Step 2: get course enrollment
    const { data: userCourse } = await supabase
      .from("user_course")
      .select("course_id")
      .eq("profiles_id", userId)
      .single();
    if (!userCourse) {
      setErrorMessage("Kein Kurs gefunden.");
      setIsLoading(false);
      return;
    }
    const courseId = userCourse.course_id;

    const { data: courseSettings } = await supabase
      .from("course")
      .select("comparison_enabled")
      .eq("course_id", courseId)
      .single();
    setIsCourseComparisonEnabled(courseSettings?.comparison_enabled === true);

    // Step 3: load course date range via periods; fallback to legacy columns
    const { data: periodsData } = await supabase
      .from("course_period")
      .select("start_date, end_date, sort_order")
      .eq("course_id", courseId)
      .order("sort_order", { ascending: true });

    let allCourseDates: string[];
    if (periodsData && periodsData.length > 0) {
      allCourseDates = getPeriodDates(periodsData);
    } else {
      const { data: courseData } = await supabase
        .from("course")
        .select("start_date, end_date")
        .eq("course_id", courseId)
        .single();
      if (!courseData) {
        setErrorMessage("Kursdaten konnten nicht geladen werden.");
        setIsLoading(false);
        return;
      }
      allCourseDates = getSinglePeriodDates(
        courseData.start_date,
        courseData.end_date,
      );
    }

    // Step 4: load lookup tables in parallel
    const [cats, subs, acts, mediaTypes, socialContexts, locations, sats] =
      await Promise.all([
        supabase
          .from("category")
          .select("category_id, name")
          .order("category_id"),
        supabase
          .from("subcategory")
          .select("subcategory_id, name, category_id")
          .order("subcategory_id"),
        supabase
          .from("activity")
          .select("activity_id, name, subcategory_id")
          .order("activity_id"),
        supabase
          .from("digital_media_type")
          .select("digital_media_type_id, name")
          .order("digital_media_type_id"),
        supabase
          .from("social_context")
          .select("social_context_id, name")
          .order("social_context_id"),
        supabase
          .from("location_transport")
          .select("location_transport_id, name")
          .order("location_transport_id"),
        supabase
          .from("satisfaction")
          .select("satisfaction_id, name")
          .order("satisfaction_id"),
      ]);

    if (
      cats.error ||
      subs.error ||
      acts.error ||
      mediaTypes.error ||
      socialContexts.error ||
      locations.error ||
      sats.error
    ) {
      setErrorMessage("Stammdaten konnten nicht geladen werden.");
      setIsLoading(false);
      return;
    }

    const categories: CategoryLookup[] = cats.data ?? [];
    const subcategories: SubcategoryLookup[] = subs.data ?? [];
    const activities: ActivityLookup[] = acts.data ?? [];
    const mediaTypeRows: DigitalMediaTypeLookup[] = mediaTypes.data ?? [];
    const socialContextRows: SocialContextLookup[] = socialContexts.data ?? [];
    const locationRows: LocationTransportLookup[] = locations.data ?? [];
    const satisfactionRows: SatisfactionLookup[] = sats.data ?? [];

    const digitalMediaById: Record<number, string> = {};
    for (const item of mediaTypeRows) {
      digitalMediaById[item.digital_media_type_id] = item.name;
    }
    const socialContextById: Record<number, string> = {};
    for (const item of socialContextRows) {
      socialContextById[item.social_context_id] = item.name;
    }
    const locationById: Record<number, string> = {};
    for (const item of locationRows) {
      locationById[item.location_transport_id] = item.name;
    }
    const satisfactionRankById: Record<number, number> = {};
    let maxSatisfactionRank = 1;
    satisfactionRows.forEach((item, index) => {
      const derivedRank = getSatisfactionRankFromName(item.name);
      const rank = derivedRank ?? index + 1;
      satisfactionRankById[item.satisfaction_id] = rank;
      if (rank > maxSatisfactionRank) {
        maxSatisfactionRank = rank;
      }
    });

    // Step 5: load day records for this user in this course
    // Track submitted OR complete days to stay compatible with legacy rows.
    const { data: myDays } = await supabase
      .from("day")
      .select("day_id, date, is_submitted, is_complete")
      .eq("profiles_id", userId)
      .eq("course_id", courseId);

    const allMyDays = myDays ?? [];
    const submittedDayIds = new Set(
      allMyDays.filter((d) => d.is_submitted).map((d) => d.day_id),
    );

    // Step 6: load all time entries for this user's day records.
    // Some legacy rows have entries but missing is_submitted/is_complete flags.
    const allMyDayIds = allMyDays.map((d) => d.day_id);
    let allMyEntries: RawEntry[] = [];

    if (allMyDayIds.length > 0) {
      const { data: entryData } = await supabase
        .from("time_entry")
        .select(
          "entry_id, day_id, start_time, end_time, primary_activity_id, location_transport_id, satisfaction_id, time_entry_digital_media_type(digital_media_type_id), time_entry_social_context(social_context_id)",
        )
        .in("day_id", allMyDayIds);
      allMyEntries = (entryData ?? []).map((row: any) => ({
        entry_id: row.entry_id,
        day_id: row.day_id,
        start_time: row.start_time,
        end_time: row.end_time,
        primary_activity_id: row.primary_activity_id,
        location_transport_id: row.location_transport_id,
        satisfaction_id: row.satisfaction_id,
        digital_media_type_ids: (row.time_entry_digital_media_type ?? [])
          .map((m: any) => m.digital_media_type_id)
          .filter((id: unknown) => typeof id === "number"),
        social_context_ids: (row.time_entry_social_context ?? [])
          .map((m: any) => m.social_context_id)
          .filter((id: unknown) => typeof id === "number"),
      }));
    }

    const dayIdsWithEntries = new Set(allMyEntries.map((e) => e.day_id));
    const trackedDays = allMyDays.filter(
      (d) => d.is_submitted || d.is_complete || dayIdsWithEntries.has(d.day_id),
    );
    const trackedDayIds = new Set(trackedDays.map((d) => d.day_id));

    const myDayIdToDate: Record<number, string> = {};
    for (const d of trackedDays) {
      myDayIdToDate[d.day_id] = normalizeDateOnly(d.date);
    }

    const myEntries = allMyEntries.filter((e) => trackedDayIds.has(e.day_id));

    // Step 7: build Zeitverteilung data from the user's own entries
    const zeitverteilungResult = buildZeitverteilungData(
      myEntries,
      myDayIdToDate,
      allCourseDates,
      trackedDayIds,
      activities,
      subcategories,
      categories,
      digitalMediaById,
      socialContextById,
      locationById,
      satisfactionRankById,
      maxSatisfactionRank,
    );
    setCategoryRows(zeitverteilungResult.categoryRows);
    setBarData(zeitverteilungResult.barData);
    setCategoryNames(zeitverteilungResult.categoryNames);
    setMetaAggregates(zeitverteilungResult.metaAggregates);

    // Store raw data for KW-filter recomputation
    rawDataRef.current = {
      myEntries,
      myDayIdToDate,
      allCourseDates,
      trackedDayIds,
      activities,
      subcategories,
      categories,
      digitalMediaById,
      socialContextById,
      locationById,
      satisfactionRankById,
      maxSatisfactionRank,
    };

    // Build week options from all course dates
    const weekOptionsList: { key: string; label: string }[] = [];
    const seenWeekKeys = new Set<string>();
    for (const date of zeitverteilungResult.barData.map((d) => d.date)) {
      const info = getIsoWeekInfo(date);
      if (!seenWeekKeys.has(info.key)) {
        seenWeekKeys.add(info.key);
        weekOptionsList.push(info);
      }
    }
    setWeekOptions(weekOptionsList);
    setSelectedWeeks([]);

    // Step 8: load course comparison data
    // Derive participant IDs from submitted day records instead of user_course.
    // This avoids a self-referential RLS policy on user_course and naturally limits
    // the comparison pool to users who have actually submitted at least one day.
    const { data: allSubmittedDays } = await supabase
      .from("day")
      .select("profiles_id")
      .eq("course_id", courseId)
      .eq("is_submitted", true);

    // De-duplicate: one entry per unique participant
    const allParticipantIds = [
      ...new Set(
        (allSubmittedDays ?? []).map((d: any) => d.profiles_id as string),
      ),
    ];

    // Load submitted days for all participants
    const { data: allDays } = await supabase
      .from("day")
      .select("day_id, profiles_id, date")
      .eq("course_id", courseId)
      .eq("is_submitted", true)
      .in("profiles_id", allParticipantIds);

    // Group submitted day IDs by user and filter to users with ≥ MIN_DAYS_FOR_COMPARISON
    const submittedDaysByUser: Record<string, number[]> = {};
    for (const day of allDays ?? []) {
      if (!submittedDaysByUser[day.profiles_id]) {
        submittedDaysByUser[day.profiles_id] = [];
      }
      submittedDaysByUser[day.profiles_id].push(day.day_id);
    }

    const qualifyingUsers = Object.entries(submittedDaysByUser).filter(
      ([, dayIds]) => dayIds.length >= MIN_DAYS_FOR_COMPARISON,
    );

    const comparisonDayIdToDate: Record<number, string> = {};
    for (const day of allDays ?? []) {
      comparisonDayIdToDate[day.day_id] = normalizeDateOnly(day.date);
    }

    // Only build comparison if there are enough qualifying users
    if (
      qualifyingUsers.length >= 3 &&
      courseSettings?.comparison_enabled === true
    ) {
      // Load all time entries for all qualifying users' submitted days
      const allQualifyingDayIds = qualifyingUsers.flatMap(
        ([, dayIds]) => dayIds,
      );

      const { data: allEntries } = await supabase
        .from("time_entry")
        .select(
          "entry_id, day_id, start_time, end_time, primary_activity_id, location_transport_id, satisfaction_id, time_entry_digital_media_type(digital_media_type_id), time_entry_social_context(social_context_id)",
        )
        .in("day_id", allQualifyingDayIds);

      const rawAllEntries: RawEntry[] = (allEntries ?? []).map((row: any) => ({
        entry_id: row.entry_id,
        day_id: row.day_id,
        start_time: row.start_time,
        end_time: row.end_time,
        primary_activity_id: row.primary_activity_id,
        location_transport_id: row.location_transport_id,
        satisfaction_id: row.satisfaction_id,
        digital_media_type_ids: (row.time_entry_digital_media_type ?? [])
          .map((m: any) => m.digital_media_type_id)
          .filter((id: unknown) => typeof id === "number"),
        social_context_ids: (row.time_entry_social_context ?? [])
          .map((m: any) => m.social_context_id)
          .filter((id: unknown) => typeof id === "number"),
      }));

      rawComparisonRef.current = {
        userId,
        qualifyingUsers,
        rawAllEntries,
        dayIdToDate: comparisonDayIdToDate,
        myEntries,
        mySubmittedDayIds: submittedDayIds,
        socialContextById,
        locationById,
        satisfactionRankById,
        maxSatisfactionRank,
      };
      computeAndSetComparison([], "alle");
    } else {
      rawComparisonRef.current = null;
      setComparisonTopics([]);
      setComparisonMetaStats(null);
      setQualifyingUserCount(
        courseSettings?.comparison_enabled === true
          ? qualifyingUsers.length
          : 0,
      );
    }

    setIsLoading(false);
  }

  // ── Accordion toggle handlers ───────────────────────────────────────────────

  // KW filter handlers — recompute all stats for the selected weeks
  function handleToggleWeek(weekKey: string) {
    setSelectedWeeks((prev) => {
      const next = prev.includes(weekKey)
        ? prev.filter((k) => k !== weekKey)
        : [...prev, weekKey];
      computeAndSetStats(next, dayFilter);
      computeAndSetComparison(next, dayFilter);
      return next;
    });
  }

  function handleClearWeeks() {
    computeAndSetStats([], dayFilter);
    computeAndSetComparison([], dayFilter);
    setSelectedWeeks([]);
  }

  function handleSetDayFilter(mode: DayFilterMode) {
    setDayFilter(mode);
    computeAndSetStats(selectedWeeks, mode);
    computeAndSetComparison(selectedWeeks, mode);
  }

  // Toggles the expanded state of a category row in the drill-down table
  function handleToggleCategory(categoryId: number) {
    setCategoryRows((prev) =>
      prev.map((cat) =>
        cat.categoryId === categoryId
          ? { ...cat, isExpanded: !cat.isExpanded }
          : cat,
      ),
    );
  }

  // Toggles the expanded state of a subcategory row within a category
  function handleToggleSubcategory(categoryId: number, subcategoryId: number) {
    setCategoryRows((prev) =>
      prev.map((cat) =>
        cat.categoryId !== categoryId
          ? cat
          : {
              ...cat,
              subcategories: cat.subcategories.map((sub) =>
                sub.subcategoryId === subcategoryId
                  ? { ...sub, isExpanded: !sub.isExpanded }
                  : sub,
              ),
            },
      ),
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

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
    <div className="space-y-5">
      {/* Tab bar */}
      {isCourseComparisonEnabled && (
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("zeitverteilung")}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
              activeTab === "zeitverteilung"
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Zeitverteilung
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("kursvergleich")}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
              activeTab === "kursvergleich"
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Kursvergleich
          </button>
        </div>
      )}

      {/* Tab content */}
      {activeTab === "zeitverteilung" ? (
        <ZeitverteilungTab
          barData={barData}
          categoryRows={categoryRows}
          categoryNames={categoryNames}
          metaAggregates={metaAggregates}
          selectedWeeks={selectedWeeks}
          weekOptions={weekOptions}
          dayFilter={dayFilter}
          onToggleWeek={handleToggleWeek}
          onClearWeeks={handleClearWeeks}
          onSetDayFilter={handleSetDayFilter}
          onToggleCategory={handleToggleCategory}
          onToggleSubcategory={handleToggleSubcategory}
        />
      ) : isCourseComparisonEnabled ? (
        <KursvergleichTab
          topics={comparisonTopics}
          metaStats={comparisonMetaStats}
          qualifyingUserCount={qualifyingUserCount}
          selectedWeeks={selectedWeeks}
          weekOptions={weekOptions}
          dayFilter={dayFilter}
          onToggleWeek={handleToggleWeek}
          onClearWeeks={handleClearWeeks}
          onSetDayFilter={handleSetDayFilter}
        />
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-6 text-center">
          <p className="text-sm font-semibold text-amber-800">
            Kursvergleich ist noch nicht freigeschaltet
          </p>
          <p className="mt-1 text-xs text-amber-700">
            Bitte Kursleitung/Admin:in bitten, den Kursvergleich in der
            Kursübersicht freizugeben.
          </p>
        </div>
      )}
    </div>
  );
}
