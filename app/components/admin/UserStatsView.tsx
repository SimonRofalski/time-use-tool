"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/routing";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { getLocalizedName } from "@/lib/i18n/localized-name";
import { getPeriodDates, getSinglePeriodDates } from "@/lib/course-periods";
import ZeitverteilungTab from "@/app/[locale]/(protected)/statistiken/ZeitverteilungTab";
import type {
  CategoryRow,
  SubcategoryRow,
  ActivityRow,
  DayBarData,
  MetaAggregates,
} from "@/app/[locale]/(protected)/statistiken/types";

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

// Lookup row shapes — mirrors app/[locale]/(protected)/statistiken/page.tsx
type ActivityLookup = {
  activity_id: number;
  name: string;
  name_en: string;
  subcategory_id: number;
};
type SubcategoryLookup = {
  subcategory_id: number;
  name: string;
  name_en: string;
  category_id: number;
};
type CategoryLookup = { category_id: number; name: string; name_en: string };
type DigitalMediaTypeLookup = {
  digital_media_type_id: number;
  name: string;
  name_en: string;
  code: string;
};
type SocialContextLookup = {
  social_context_id: number;
  name: string;
  name_en: string;
  code: string;
};
type LocationTransportLookup = {
  location_transport_id: number;
  name: string;
  name_en: string;
  code: string;
};
type SatisfactionLookup = {
  satisfaction_id: number;
  name: string;
  name_en: string;
  code: string;
};

// { name, code } pair used for id → lookup maps: `name` is already localized
// at construction time, `code` is the language-neutral classification key
// (see ActivitySelector.tsx's *_VISUAL_BY_CODE maps for the canonical meanings).
type NamedCode = { name: string; code: string };

type RawSnapshot = {
  entries: RawEntry[];
  dayIdToDate: Record<number, string>;
  allCourseDates: string[];
  trackedDayIds: Set<number>;
  activities: ActivityLookup[];
  subcategories: SubcategoryLookup[];
  categories: CategoryLookup[];
  digitalMediaById: Record<number, NamedCode>;
  socialContextById: Record<number, NamedCode>;
  locationById: Record<number, NamedCode>;
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

// Code-based classification (language-neutral, safe across locales) — mirrors
// statistiken/page.tsx exactly, since this component duplicates its aggregation
// logic for admin per-user drill-down. Replaces the previous German-substring
// matching, which broke once lookup names became locale-dependent.
function isAloneContextCode(code: string): boolean {
  return code === "1"; // Alleine
}

// Codes 11 (Zuhause) and 14 (Zuhause anderer Personen) both count as "at home" —
// matches the previous substring match, which matched "zuhause" in both names.
function isAtHomeLocationCode(code: string): boolean {
  return code === "11" || code === "14";
}

// Satisfaction codes run 1 (sehr gut) … 5 (sehr schlecht); the rank scale is
// inverted (higher = better) to match the previous name-derived ranking.
function getSatisfactionRankFromCode(code: string): number | null {
  const n = Number(code);
  if (!Number.isInteger(n) || n < 1 || n > 5) return null;
  return 6 - n;
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
  digitalMediaById: Record<number, NamedCode>,
  socialContextById: Record<number, NamedCode>,
  locationById: Record<number, NamedCode>,
  satisfactionRankById: Record<number, number>,
  maxSatisfactionRank: number,
  t: ReturnType<typeof useTranslations<"statistiken">>,
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

  // Keyed by the language-neutral `code` (or a stable fallback sentinel) so
  // buckets stay consistent across locales; `name` inside each entry is the
  // already-localized display name.
  const deviceMinutesByCode: Record<string, { name: string; code: string; minutes: number }> = {};
  const socialMinutesByCode: Record<string, { name: string; code: string; minutes: number }> = {};
  const locationMinutesByCode: Record<string, { name: string; code: string; minutes: number }> = {};

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
        const info = digitalMediaById[id];
        const key = info?.code ?? `id-${id}`;
        if (!deviceMinutesByCode[key]) {
          deviceMinutesByCode[key] = {
            name: info?.name ?? t("fallbackLabels.unknownDevice", { id }),
            code: info?.code ?? "",
            minutes: 0,
          };
        }
        deviceMinutesByCode[key].minutes += split;
      }
    } else {
      const key = "__no_device__";
      if (!deviceMinutesByCode[key]) {
        // code "0" (Kein IT-Hilfsmittel) so it picks up the matching icon
        deviceMinutesByCode[key] = { name: t("fallbackLabels.noDevice"), code: "0", minutes: 0 };
      }
      deviceMinutesByCode[key].minutes += minutes;
    }

    const contextIds = entry.social_context_ids;
    if (contextIds.length > 0) {
      const split = minutes / contextIds.length;
      for (const id of contextIds) {
        const info = socialContextById[id];
        const key = info?.code ?? `id-${id}`;
        if (!socialMinutesByCode[key]) {
          socialMinutesByCode[key] = {
            name: info?.name ?? t("fallbackLabels.unknownContext", { id }),
            code: info?.code ?? "",
            minutes: 0,
          };
        }
        socialMinutesByCode[key].minutes += split;
      }
    } else {
      // Kept as a distinct bucket from an explicit "Alleine" selection (code "1"),
      // matching the previous behavior where the two used different label text.
      const key = "__no_context__";
      if (!socialMinutesByCode[key]) {
        socialMinutesByCode[key] = { name: t("fallbackLabels.aloneFallback"), code: "1", minutes: 0 };
      }
      socialMinutesByCode[key].minutes += minutes;
    }

    const locationInfo =
      entry.location_transport_id != null
        ? locationById[entry.location_transport_id]
        : undefined;
    const locationKey = locationInfo?.code ?? "__unknown_location__";
    if (!locationMinutesByCode[locationKey]) {
      locationMinutesByCode[locationKey] = {
        name: locationInfo?.name ?? t("fallbackLabels.unknownLocation"),
        code: locationInfo?.code ?? "",
        minutes: 0,
      };
    }
    locationMinutesByCode[locationKey].minutes += minutes;
    const isAtHomeForEntry = locationInfo
      ? isAtHomeLocationCode(locationInfo.code)
      : false;

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

    const contextCodes = contextIds.map((id) => socialContextById[id]?.code ?? "");
    const hasOtherPeople = contextCodes.some((code) => !isAloneContextCode(code));
    if (hasOtherPeople) {
      activityMeta.withPeopleMinutes += minutes;
    } else {
      activityMeta.aloneMinutes += minutes;
    }

    if (isAtHomeForEntry) {
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
      name: t("uncategorizedLabel"),
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

  const toSortedItems = (
    obj: Record<string, { name: string; code: string; minutes: number }>,
  ) =>
    Object.values(obj)
      .map((item) => ({
        name: item.name,
        code: item.code,
        minutes: Math.round(item.minutes),
      }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 8);

  const metaAggregates: MetaAggregates = {
    devices: toSortedItems(deviceMinutesByCode),
    social: toSortedItems(socialMinutesByCode),
    locations: toSortedItems(locationMinutesByCode),
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
  const t = useTranslations("statistiken");
  const tLocal = useTranslations("adminUserStatsView");
  const locale = useLocale() as Locale;
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
      t,
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
        setError(t("errors.courseDataLoadError"));
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
          .select("category_id, name, name_en")
          .order("category_id"),
        supabase
          .from("subcategory")
          .select("subcategory_id, name, name_en, category_id")
          .order("subcategory_id"),
        supabase
          .from("activity")
          .select("activity_id, name, name_en, subcategory_id")
          .order("activity_id"),
        supabase
          .from("digital_media_type")
          .select("digital_media_type_id, name, name_en, code")
          .order("digital_media_type_id"),
        supabase
          .from("social_context")
          .select("social_context_id, name, name_en, code")
          .order("social_context_id"),
        supabase
          .from("location_transport")
          .select("location_transport_id, name, name_en, code")
          .order("location_transport_id"),
        supabase
          .from("satisfaction")
          .select("satisfaction_id, name, name_en, code")
          .order("satisfaction_id"),
      ]);

    if (cats.error || subs.error || acts.error) {
      setError(t("errors.lookupDataLoadError"));
      setIsLoading(false);
      return;
    }

    // Localize display names once, here, so every downstream consumer that
    // reads `.name` (chart keys, table rows, etc.) gets the right locale
    // without further changes.
    const categories: CategoryLookup[] = (cats.data ?? []).map((c) => ({
      ...c,
      name: getLocalizedName(c, locale),
    }));
    const subcategories: SubcategoryLookup[] = (subs.data ?? []).map((s) => ({
      ...s,
      name: getLocalizedName(s, locale),
    }));
    const activities: ActivityLookup[] = (acts.data ?? []).map((a) => ({
      ...a,
      name: getLocalizedName(a, locale),
    }));
    const mediaTypeRows: DigitalMediaTypeLookup[] = mediaTypes.data ?? [];
    const socialContextRows: SocialContextLookup[] = socialContexts.data ?? [];
    const locationRows: LocationTransportLookup[] = locations.data ?? [];
    const satisfactionRows: SatisfactionLookup[] = sats.data ?? [];

    const digitalMediaById: Record<number, NamedCode> = {};
    for (const item of mediaTypeRows) {
      digitalMediaById[item.digital_media_type_id] = {
        name: getLocalizedName(item, locale),
        code: item.code,
      };
    }
    const socialContextById: Record<number, NamedCode> = {};
    for (const item of socialContextRows) {
      socialContextById[item.social_context_id] = {
        name: getLocalizedName(item, locale),
        code: item.code,
      };
    }
    const locationById: Record<number, NamedCode> = {};
    for (const item of locationRows) {
      locationById[item.location_transport_id] = {
        name: getLocalizedName(item, locale),
        code: item.code,
      };
    }
    const satisfactionRankById: Record<number, number> = {};
    let maxSatisfactionRank = 1;
    satisfactionRows.forEach((item, index) => {
      const derivedRank = getSatisfactionRankFromCode(item.code);
      const rank = derivedRank ?? index + 1;
      satisfactionRankById[item.satisfaction_id] = rank;
      if (rank > maxSatisfactionRank) {
        maxSatisfactionRank = rank;
      }
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
      t,
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
    return <p className="text-sm text-slate-500 py-4">{t("loading")}</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600 py-4">{error}</p>;
  }

  if (barData.length === 0) {
    return (
      <p className="text-sm text-slate-500 py-4">{tLocal("noData")}</p>
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
