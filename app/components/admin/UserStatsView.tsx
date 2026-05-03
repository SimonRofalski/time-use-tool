"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { getPeriodDates, getSinglePeriodDates } from "@/lib/course-periods";
import ZeitverteilungTab from "@/app/(protected)/statistiken/ZeitverteilungTab";
import type {
  CategoryRow,
  SubcategoryRow,
  ActivityRow,
  DayBarData,
  MetaAggregates,
} from "@/app/(protected)/statistiken/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type DayFilterMode = "alle" | "werktage" | "wochenende";

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
type CategoryLookup = { category_id: number; name: string };

type RawSnapshot = {
  entries: RawEntry[];
  dayIdToDate: Record<number, string>;
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

// ─── Pure helpers (mirrored from statistiken/page.tsx) ────────────────────────

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
  const avgRankRounded = Number(avgRank.toFixed(1));
  const ratio = avgRankRounded / maxRank;
  const percent = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  return `${avgRankRounded.toFixed(1)} / ${maxRank} (${percent}%)`;
}

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
  const activityMap = new Map(activities.map((a) => [a.activity_id, a]));
  const subcategoryMap = new Map(
    subcategories.map((s) => [s.subcategory_id, s]),
  );
  const categoryMap = new Map(categories.map((c) => [c.category_id, c]));

  const minuteTree: Record<number, Record<number, Record<number, number>>> = {};
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

    if (!minuteTree[catId]) minuteTree[catId] = {};
    if (!minuteTree[catId][subId]) minuteTree[catId][subId] = {};
    minuteTree[catId][subId][actId] =
      (minuteTree[catId][subId][actId] ?? 0) + minutes;

    if (!dailyMinutes[date]) dailyMinutes[date] = {};
    dailyMinutes[date][catId] = (dailyMinutes[date][catId] ?? 0) + minutes;
  }

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

  const categoryRows: CategoryRow[] = categories
    .filter((cat) => minuteTree[cat.category_id])
    .map((cat) => {
      const subTree = minuteTree[cat.category_id];
      const subcategoryRows: SubcategoryRow[] = subcategories
        .filter((sub) => subTree[sub.subcategory_id])
        .map((sub) => {
          const actTree = subTree[sub.subcategory_id];
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

  const categoryNames = categoryRows.map((r) => r.name);

  const normalizedCourseDates = Array.from(
    new Set(allCourseDates.map((d) => normalizeDateOnly(d))),
  );
  const todayEpochDay = dateOnlyToEpochDay(getLocalIsoDate(new Date()));
  const barData: DayBarData[] = normalizedCourseDates.map((date) => {
    const isTrackedDay = trackedDates.has(date);
    if (!isTrackedDay) {
      const dateEpochDay = dateOnlyToEpochDay(date);
      if (dateEpochDay > todayEpochDay) return { date, isSubmitted: false };
      return { date, isSubmitted: false, unsubmitted: 60 };
    }
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
    if (weekKeySet.size > 0 && !weekKeySet.has(getIsoWeekInfo(date).key))
      return false;
    if (dayMode === "werktage" && isWeekend(date)) return false;
    if (dayMode === "wochenende" && !isWeekend(date)) return false;
    return true;
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function UserStatsView({
  userId,
  courseId,
}: {
  userId: string;
  courseId: number;
}) {
  const supabase = getSupabaseBrowserClient();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

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

  const rawRef = useRef<RawSnapshot | null>(null);

  useEffect(() => {
    void loadData();
  }, [userId, courseId]);

  function computeAndSetStats(weeksFilter: string[], dayMode: DayFilterMode) {
    const raw = rawRef.current;
    if (!raw) return;

    const filteredDayIds = filterDayIds(
      Array.from(raw.trackedDayIds),
      raw.dayIdToDate,
      weeksFilter,
      dayMode,
    );
    const filteredTrackedDayIds = new Set(filteredDayIds);

    const result = buildZeitverteilungData(
      raw.entries,
      raw.dayIdToDate,
      raw.allCourseDates,
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

  function handleToggleWeek(weekKey: string) {
    const next = selectedWeeks.includes(weekKey)
      ? selectedWeeks.filter((w) => w !== weekKey)
      : [...selectedWeeks, weekKey];
    setSelectedWeeks(next);
    computeAndSetStats(next, dayFilter);
  }

  function handleClearWeeks() {
    setSelectedWeeks([]);
    computeAndSetStats([], dayFilter);
  }

  function handleSetDayFilter(mode: DayFilterMode) {
    setDayFilter(mode);
    computeAndSetStats(selectedWeeks, mode);
  }

  function handleToggleCategory(categoryId: number) {
    setCategoryRows((prev) =>
      prev.map((r) =>
        r.categoryId === categoryId ? { ...r, isExpanded: !r.isExpanded } : r,
      ),
    );
  }

  function handleToggleSubcategory(categoryId: number, subcategoryId: number) {
    setCategoryRows((prev) =>
      prev.map((r) =>
        r.categoryId === categoryId
          ? {
              ...r,
              subcategories: r.subcategories.map((s) =>
                s.subcategoryId === subcategoryId
                  ? { ...s, isExpanded: !s.isExpanded }
                  : s,
              ),
            }
          : r,
      ),
    );
  }

  async function loadData() {
    setIsLoading(true);
    setError("");

    // Load course periods
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
        setError("Kursdaten konnten nicht geladen werden.");
        setIsLoading(false);
        return;
      }
      allCourseDates = getSinglePeriodDates(
        courseData.start_date,
        courseData.end_date,
      );
    }

    // Load lookup tables
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

    if (cats.error || subs.error || acts.error) {
      setError("Stammdaten konnten nicht geladen werden.");
      setIsLoading(false);
      return;
    }

    const categories: CategoryLookup[] = cats.data ?? [];
    const subcategories: SubcategoryLookup[] = subs.data ?? [];
    const activities: ActivityLookup[] = acts.data ?? [];

    const digitalMediaById: Record<number, string> = {};
    for (const item of mediaTypes.data ?? []) {
      digitalMediaById[item.digital_media_type_id] = item.name;
    }
    const socialContextById: Record<number, string> = {};
    for (const item of socialContexts.data ?? []) {
      socialContextById[item.social_context_id] = item.name;
    }
    const locationById: Record<number, string> = {};
    for (const item of locations.data ?? []) {
      locationById[item.location_transport_id] = item.name;
    }
    const satisfactionRankById: Record<number, number> = {};
    let maxSatisfactionRank = 1;
    (sats.data ?? []).forEach((item) => {
      const rank = getSatisfactionRankFromName(item.name) ?? 1;
      satisfactionRankById[item.satisfaction_id] = rank;
      if (rank > maxSatisfactionRank) maxSatisfactionRank = rank;
    });

    // Load user's days for this course
    const { data: myDays } = await supabase
      .from("day")
      .select("day_id, date, is_submitted, is_complete")
      .eq("profiles_id", userId)
      .eq("course_id", courseId);

    const allMyDays = myDays ?? [];
    const allMyDayIds = allMyDays.map((d) => d.day_id);

    let allEntries: RawEntry[] = [];
    if (allMyDayIds.length > 0) {
      const { data: entryData } = await supabase
        .from("time_entry")
        .select(
          "entry_id, day_id, start_time, end_time, primary_activity_id, location_transport_id, satisfaction_id, time_entry_digital_media_type(digital_media_type_id), time_entry_social_context(social_context_id)",
        )
        .in("day_id", allMyDayIds);

      allEntries = (entryData ?? []).map((row: any) => ({
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

    const dayIdsWithEntries = new Set(allEntries.map((e) => e.day_id));
    const trackedDays = allMyDays.filter(
      (d) => d.is_submitted || d.is_complete || dayIdsWithEntries.has(d.day_id),
    );
    const trackedDayIds = new Set(trackedDays.map((d) => d.day_id));

    const dayIdToDate: Record<number, string> = {};
    for (const d of trackedDays) {
      dayIdToDate[d.day_id] = normalizeDateOnly(d.date);
    }

    const entries = allEntries.filter((e) => trackedDayIds.has(e.day_id));

    rawRef.current = {
      entries,
      dayIdToDate,
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

    const result = buildZeitverteilungData(
      entries,
      dayIdToDate,
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

    setCategoryRows(result.categoryRows);
    setBarData(result.barData);
    setCategoryNames(result.categoryNames);
    setMetaAggregates(result.metaAggregates);

    // Build week options
    const weekOptionsList: { key: string; label: string }[] = [];
    const seenWeekKeys = new Set<string>();
    for (const date of result.barData.map((d) => d.date)) {
      const info = getIsoWeekInfo(date);
      if (!seenWeekKeys.has(info.key)) {
        seenWeekKeys.add(info.key);
        weekOptionsList.push(info);
      }
    }
    setWeekOptions(weekOptionsList);
    setSelectedWeeks([]);
    setDayFilter("alle");
    setIsLoading(false);
  }

  if (isLoading) {
    return (
      <p className="text-sm text-slate-500 py-4">Statistiken werden geladen…</p>
    );
  }

  if (error) {
    return <p className="text-sm text-red-600 py-4">{error}</p>;
  }

  if (barData.length === 0) {
    return (
      <p className="text-sm text-slate-500 py-4">
        Dieser Nutzer hat noch keine Daten erfasst.
      </p>
    );
  }

  return (
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
  );
}
