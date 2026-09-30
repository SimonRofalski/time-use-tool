"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { FileDown } from "lucide-react";
import type { Locale } from "@/i18n/routing";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { getLocalizedName } from "@/lib/i18n/localized-name";
import { getPeriodDates, getSinglePeriodDates } from "@/lib/course-periods";
import ZeitverteilungTab from "./ZeitverteilungTab";
import KursvergleichTab from "./KursvergleichTab";
import { generatePersonalReportPdf } from "./export-pdf";
import type {
  CategoryRow,
  SubcategoryRow,
  ActivityRow,
  DayBarData,
  CategoryComparison,
  ComparisonMetric,
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

// ─── Time entry loading ───────────────────────────────────────────────────────

const TIME_ENTRY_SELECT =
  "entry_id, day_id, start_time, end_time, primary_activity_id, location_transport_id, satisfaction_id, time_entry_digital_media_type(digital_media_type_id), time_entry_social_context(social_context_id)";

// A day has at most 144 entries, so 6 days (≤ 864 rows) fit into one
// 1000-row response — each request is a single page, and requests can run
// side by side instead of paging through one long result one after another
const DAYS_PER_ENTRY_REQUEST = 6;
const MAX_PARALLEL_ENTRY_REQUESTS = 8;

function mapEntryRow(row: any): RawEntry {
  return {
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
  };
}

// Loads the time entries of the given days in parallel day chunks
async function fetchEntriesForDays(
  supabase: ReturnType<typeof getSupabaseBrowserClient>,
  dayIds: number[],
): Promise<RawEntry[]> {
  const chunks: number[][] = [];
  for (let i = 0; i < dayIds.length; i += DAYS_PER_ENTRY_REQUEST) {
    chunks.push(dayIds.slice(i, i + DAYS_PER_ENTRY_REQUEST));
  }

  const results: any[][] = new Array(chunks.length);
  let nextChunk = 0;
  // A few workers pull chunks until none are left (bounded concurrency)
  async function worker() {
    while (nextChunk < chunks.length) {
      const index = nextChunk++;
      // fetchAllRows as a safety net, should a chunk ever exceed one page
      results[index] = await fetchAllRows<any>((from, to) =>
        supabase
          .from("time_entry")
          .select(TIME_ENTRY_SELECT)
          .in("day_id", chunks[index])
          .order("entry_id")
          .range(from, to),
      );
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(MAX_PARALLEL_ENTRY_REQUESTS, chunks.length) },
      worker,
    ),
  );
  return results.flat().map(mapEntryRow);
}

// Lookup row shapes
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
type CategoryLookup = {
  category_id: number;
  name: string;
  name_en: string;
};
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

function isWeekend(dateString: string): boolean {
  const normalized = dateString.slice(0, 10);
  const [year, month, day] = normalized.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.getDay() === 0 || d.getDay() === 6;
}

// `t` is passed in explicitly since this is a plain helper, not a component —
// it can't call useTranslations() itself.
function getIsoWeekInfo(
  dateString: string,
  t: ReturnType<typeof useTranslations<"statistiken">>,
): { key: string; label: string } {
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
    label: t("weekLabel", { week: isoWeek }),
  };
}

// Code-based classification (language-neutral, safe across locales) — mirrors
// the meanings documented in ActivitySelector.tsx's SOCIAL_CONTEXT_VISUAL_BY_CODE
// and LOCATION_MAPPING_BY_CODE. Replaces the previous German-substring matching,
// which broke once lookup names became locale-dependent.
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
      name: t("uncategorizedLabel"),
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
  t: ReturnType<typeof useTranslations<"statistiken">>,
): number[] {
  const weekKeySet = new Set(weeksFilter);
  return dayIds.filter((dayId) => {
    const date = dayIdToDate[dayId];
    if (!date) return false;

    if (weekKeySet.size > 0 && !weekKeySet.has(getIsoWeekInfo(date, t).key)) {
      return false;
    }
    if (dayMode === "werktage" && isWeekend(date)) return false;
    if (dayMode === "wochenende" && !isWeekend(date)) return false;

    return true;
  });
}

// ─── Main page component ──────────────────────────────────────────────────────

export default function StatistikenPage() {
  const t = useTranslations("statistiken");
  const locale = useLocale() as Locale;
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<Tab>("zeitverteilung");
  const [isLoading, setIsLoading] = useState(true);
  // The course comparison loads in the background after the page is shown
  const [isComparisonLoading, setIsComparisonLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  // Incremented per loadAllData run, so an outdated run can bail out
  const loadIdRef = useRef(0);
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
  // Latest filters, for the background comparison load to apply on arrival
  const filtersRef = useRef({ weeks: selectedWeeks, dayFilter });
  filtersRef.current = { weeks: selectedWeeks, dayFilter };

  // Raw data kept for KW-filter recomputation
  type RawDataSnapshot = {
    myEntries: RawEntry[];
    myDayIdToDate: Record<number, string>;
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
  const rawDataRef = useRef<RawDataSnapshot | null>(null);

  type RawComparisonSnapshot = {
    userId: string;
    qualifyingUsers: Array<[string, number[]]>;
    rawAllEntries: RawEntry[];
    dayIdToDate: Record<number, string>;
    myEntries: RawEntry[];
    mySubmittedDayIds: Set<number>;
    socialContextById: Record<number, NamedCode>;
    locationById: Record<number, NamedCode>;
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
  const [categoryComparison, setCategoryComparison] = useState<
    CategoryComparison[]
  >([]);
  const [contextMetrics, setContextMetrics] = useState<ComparisonMetric[]>([]);
  const [qualifyingUserCount, setQualifyingUserCount] = useState(0);

  // Header info for the personal PDF export
  const [courseName, setCourseName] = useState("");
  const [participantName, setParticipantName] = useState("");
  const [participantId, setParticipantId] = useState("");
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Tracks the last time data was loaded to avoid unnecessary reloads on tab switch
  const lastLoadTimeRef = useRef<number>(0);
  const RELOAD_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

  useEffect(() => {
    loadAllData();

    const shouldReload = () =>
      Date.now() - lastLoadTimeRef.current > RELOAD_THRESHOLD_MS;

    const handleFocus = () => {
      if (shouldReload()) void loadAllData();
    };

    const handlePageShow = () => {
      if (shouldReload()) void loadAllData();
    };

    const handleVisibility = () => {
      if (!document.hidden && shouldReload()) void loadAllData();
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
        weekKeySet.has(getIsoWeekInfo(date, t).key),
      );
      filteredTrackedDayIds = new Set(
        [...filteredTrackedDayIds].filter((dayId) => {
          const date = raw.myDayIdToDate[dayId];
          return date != null && weekKeySet.has(getIsoWeekInfo(date, t).key);
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
      t,
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
          t,
        );
        return [profileId, filteredDayIds] as const;
      })
      .filter(([, dayIds]) => dayIds.length >= MIN_DAYS_FOR_COMPARISON);

    setQualifyingUserCount(filteredUsers.length);

    if (filteredUsers.length < 3) {
      setComparisonTopics([]);
      setComparisonMetaStats(null);
      setCategoryComparison([]);
      setContextMetrics([]);
      return;
    }

    // activity_id → category_id (needed for the per-category comparison)
    const lookups = rawDataRef.current;
    const activityToCategory: Record<number, number> = {};
    if (lookups) {
      const subToCat: Record<number, number> = {};
      for (const sub of lookups.subcategories)
        subToCat[sub.subcategory_id] = sub.category_id;
      for (const act of lookups.activities) {
        const catId = subToCat[act.subcategory_id];
        if (catId != null) activityToCategory[act.activity_id] = catId;
      }
    }
    // Ø h/Tag per category for one participant's entries over `dayIdSet` days
    const hoursPerDayByCategory = (
      entries: RawEntry[],
      dayIdSet: Set<number>,
    ): Record<number, number> => {
      const minutes: Record<number, number> = {};
      for (const entry of entries) {
        if (!dayIdSet.has(entry.day_id)) continue;
        if (entry.primary_activity_id == null) continue;
        const catId = activityToCategory[entry.primary_activity_id];
        if (catId == null) continue;
        minutes[catId] =
          (minutes[catId] ?? 0) +
          calculateMinutes(entry.start_time, entry.end_time);
      }
      const result: Record<number, number> = {};
      const days = dayIdSet.size;
      for (const [catId, mins] of Object.entries(minutes)) {
        result[Number(catId)] = days > 0 ? mins / 60 / days : 0;
      }
      return result;
    };
    const courseCategoryValues: Record<number, number[]> = {};

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

    // Per-participant context values (anonymous) for the paired-bar comparison
    const deviceShareValues: number[] = [];
    const socialShareValues: number[] = [];
    const homeShareValues: number[] = [];
    const wellbeingValues: number[] = [];

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

      const perCategory = hoursPerDayByCategory(userEntries, dayIdSet);
      for (const cat of lookups?.categories ?? []) {
        if (!courseCategoryValues[cat.category_id])
          courseCategoryValues[cat.category_id] = [];
        courseCategoryValues[cat.category_id].push(
          perCategory[cat.category_id] ?? 0,
        );
      }

      let uWithDevice = 0;
      let uWithoutDevice = 0;
      let uWithOthers = 0;
      let uAlone = 0;
      let uAtHome = 0;
      let uElsewhere = 0;
      let uSatSum = 0;
      let uSatWeight = 0;

      for (const entry of userEntries) {
        const minutes = calculateMinutes(entry.start_time, entry.end_time);

        if (entry.digital_media_type_ids.length > 0) {
          uWithDevice += minutes;
        } else {
          uWithoutDevice += minutes;
        }

        const hasOtherPeople = entry.social_context_ids.some((id) => {
          const code = raw.socialContextById[id]?.code ?? "";
          return !isAloneContextCode(code);
        });
        if (hasOtherPeople) {
          uWithOthers += minutes;
        } else {
          uAlone += minutes;
        }

        const locationCode =
          entry.location_transport_id != null
            ? (raw.locationById[entry.location_transport_id]?.code ?? "")
            : "";
        if (isAtHomeLocationCode(locationCode)) {
          uAtHome += minutes;
        } else {
          uElsewhere += minutes;
        }

        if (entry.satisfaction_id != null) {
          const rank = raw.satisfactionRankById[entry.satisfaction_id];
          if (rank != null) {
            uSatSum += rank * minutes;
            uSatWeight += minutes;
          }
        }
      }

      courseWithDevice += uWithDevice;
      courseWithoutDevice += uWithoutDevice;
      courseWithOthers += uWithOthers;
      courseAlone += uAlone;
      courseAtHome += uAtHome;
      courseElsewhere += uElsewhere;
      courseSatisfactionWeightedSum += uSatSum;
      courseSatisfactionWeight += uSatWeight;

      const share = (part: number, total: number) =>
        total > 0 ? (part / total) * 100 : 0;
      deviceShareValues.push(share(uWithDevice, uWithDevice + uWithoutDevice));
      socialShareValues.push(share(uWithOthers, uWithOthers + uAlone));
      homeShareValues.push(share(uAtHome, uAtHome + uElsewhere));
      if (uSatWeight > 0) wellbeingValues.push(uSatSum / uSatWeight);
    }

    const myFilteredSubmittedDayIds = new Set(
      filterDayIds(
        [...raw.mySubmittedDayIds],
        raw.dayIdToDate,
        weeksFilter,
        dayMode,
        t,
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
        const code = raw.socialContextById[id]?.code ?? "";
        return !isAloneContextCode(code);
      });
      if (hasOtherPeople) {
        myWithOthers += minutes;
      } else {
        myAlone += minutes;
      }

      const locationCode =
        entry.location_transport_id != null
          ? (raw.locationById[entry.location_transport_id]?.code ?? "")
          : "";
      if (isAtHomeLocationCode(locationCode)) {
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
        label: t("comparisonTopics.schlaf"),
        unit: t("perDayUnit"),
        allValues: sleepValues,
        userValue: mySleepValue,
      },
      {
        key: "sport",
        label: t("comparisonTopics.sport"),
        unit: t("perDayUnit"),
        allValues: sportValues,
        userValue: mySportValue,
      },
      {
        key: "smartphone",
        label: t("comparisonTopics.smartphone"),
        unit: t("perDayUnit"),
        allValues: smartphoneValues,
        userValue: mySmartphoneValue,
      },
    ]);

    const myCategoryValues = hoursPerDayByCategory(
      raw.myEntries,
      myFilteredSubmittedDayIds,
    );
    setCategoryComparison(
      (lookups?.categories ?? [])
        .map((cat) => ({
          categoryId: cat.category_id,
          name: cat.name,
          allValues: courseCategoryValues[cat.category_id] ?? [],
          userValue: myCategoryValues[cat.category_id] ?? 0,
        }))
        // Skip categories nobody in the course used in this period
        .filter((c) => c.userValue > 0 || c.allValues.some((v) => v > 0)),
    );

    // Labels are resolved in the tab / PDF via the metric key (translatable)
    const myShare = (part: number, total: number) =>
      total > 0 ? (part / total) * 100 : 0;
    setContextMetrics([
      {
        key: "itDevice",
        unit: "%",
        scaleMax: 100,
        allValues: deviceShareValues,
        userValue: myShare(myWithDevice, myWithDevice + myWithoutDevice),
      },
      {
        key: "social",
        unit: "%",
        scaleMax: 100,
        allValues: socialShareValues,
        userValue: myShare(myWithOthers, myWithOthers + myAlone),
      },
      {
        key: "location",
        unit: "%",
        scaleMax: 100,
        allValues: homeShareValues,
        userValue: myShare(myAtHome, myAtHome + myElsewhere),
      },
      {
        key: "wellbeing",
        unit: "Punkte",
        scaleMax: raw.maxSatisfactionRank,
        allValues: wellbeingValues,
        userValue:
          mySatisfactionWeight > 0
            ? mySatisfactionWeightedSum / mySatisfactionWeight
            : 0,
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
    // A later reload (focus/visibility) supersedes this one: results of an
    // outdated run are dropped instead of overwriting newer state
    const loadId = ++loadIdRef.current;
    const isStale = () => loadId !== loadIdRef.current;

    lastLoadTimeRef.current = Date.now();
    setIsLoading(true);
    setErrorMessage("");

    // Step 1: the logged-in user. The local session is enough here: the
    // protected layout and proxy.ts already verify the user with the auth
    // server, and every query below is enforced by RLS — this saves a
    // network round trip before anything else can start.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const authUser = session?.user;
    if (!authUser) {
      router.push("/");
      return;
    }
    const userId = authUser.id;
    setParticipantId(userId);

    // Step 2: get course enrollment (everything else depends on course_id)
    const { data: userCourse } = await supabase
      .from("user_course")
      .select("course_id")
      .eq("profiles_id", userId)
      .single();
    if (isStale()) return;
    if (!userCourse) {
      setErrorMessage(t("errors.noCourseFound"));
      setIsLoading(false);
      return;
    }
    const courseId = userCourse.course_id;

    // Step 3: all independent queries in ONE parallel round trip — course
    // settings (incl. legacy date columns), profile, periods, lookup tables,
    // this user's days, and the submitted days of the whole course for the
    // comparison pool
    const [
      { data: courseSettings },
      { data: myProfile },
      { data: periodsData },
      cats,
      subs,
      acts,
      mediaTypes,
      socialContexts,
      locations,
      sats,
      { data: myDays },
      allDays,
    ] = await Promise.all([
      supabase
        .from("course")
        .select("name, comparison_enabled, start_date, end_date")
        .eq("course_id", courseId)
        .single(),
      supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("course_period")
        .select("start_date, end_date, sort_order")
        .eq("course_id", courseId)
        .order("sort_order", { ascending: true }),
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
      supabase
        .from("day")
        .select("day_id, date, is_submitted, is_complete")
        .eq("profiles_id", userId)
        .eq("course_id", courseId),
      // Submitted days of all participants, for the comparison pool (paged —
      // grows with course size). Participant IDs are derived from day records
      // instead of user_course: avoids a self-referential RLS policy on
      // user_course and limits the pool to users who submitted something.
      fetchAllRows<{ day_id: number; profiles_id: string; date: string }>(
        (from, to) =>
          supabase
            .from("day")
            .select("day_id, profiles_id, date")
            .eq("course_id", courseId)
            .eq("is_submitted", true)
            .order("day_id")
            .range(from, to),
      ),
    ]);
    if (isStale()) return;

    setIsCourseComparisonEnabled(courseSettings?.comparison_enabled === true);
    setCourseName(courseSettings?.name ?? "");
    setParticipantName(
      [myProfile?.first_name, myProfile?.last_name]
        .map((v) => (v ?? "").trim())
        .filter(Boolean)
        .join(" ") ||
        authUser.email ||
        "",
    );

    // Course date range via periods; fallback to legacy columns
    let allCourseDates: string[];
    if (periodsData && periodsData.length > 0) {
      allCourseDates = getPeriodDates(periodsData);
    } else {
      if (!courseSettings) {
        setErrorMessage(t("errors.courseDataLoadError"));
        setIsLoading(false);
        return;
      }
      allCourseDates = getSinglePeriodDates(
        courseSettings.start_date,
        courseSettings.end_date,
      );
    }

    if (
      cats.error ||
      subs.error ||
      acts.error ||
      mediaTypes.error ||
      socialContexts.error ||
      locations.error ||
      sats.error
    ) {
      setErrorMessage(t("errors.lookupDataLoadError"));
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

    const allMyDays = myDays ?? [];
    const submittedDayIds = new Set(
      allMyDays.filter((d) => d.is_submitted).map((d) => d.day_id),
    );

    // Step 4: load the time entries of this user's SUBMITTED days.
    // Only submitted days count — the same basis as the Kursvergleich, the PDF
    // and the admin export. Days still "in Bearbeitung" are partially filled and
    // would distort totals and per-day averages; they show as grey placeholders.
    const allMyEntries = await fetchEntriesForDays(supabase, [
      ...submittedDayIds,
    ]);
    if (isStale()) return;

    const trackedDays = allMyDays.filter((d) => d.is_submitted);
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
      t,
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
      const info = getIsoWeekInfo(date, t);
      if (!seenWeekKeys.has(info.key)) {
        seenWeekKeys.add(info.key);
        weekOptionsList.push(info);
      }
    }
    setWeekOptions(weekOptionsList);
    setSelectedWeeks([]);

    // Zeitverteilung is ready: show the page now. The course comparison
    // (entries of every qualifying participant — by far the largest load)
    // continues in the background and only gates the Kursvergleich tab.
    lastLoadTimeRef.current = Date.now();
    setIsLoading(false);

    // Step 5: course comparison data
    // Group submitted day IDs by user and filter to users with ≥ MIN_DAYS_FOR_COMPARISON
    const submittedDaysByUser: Record<string, number[]> = {};
    for (const day of allDays) {
      if (!submittedDaysByUser[day.profiles_id]) {
        submittedDaysByUser[day.profiles_id] = [];
      }
      submittedDaysByUser[day.profiles_id].push(day.day_id);
    }

    const qualifyingUsers = Object.entries(submittedDaysByUser).filter(
      ([, dayIds]) => dayIds.length >= MIN_DAYS_FOR_COMPARISON,
    );

    const comparisonDayIdToDate: Record<number, string> = {};
    for (const day of allDays) {
      comparisonDayIdToDate[day.day_id] = normalizeDateOnly(day.date);
    }

    // Only build comparison if there are enough qualifying users
    if (
      qualifyingUsers.length >= 3 &&
      courseSettings?.comparison_enabled === true
    ) {
      setIsComparisonLoading(true);

      // Own entries are already loaded — only fetch the other participants'
      const otherDayIds = qualifyingUsers
        .filter(([profileId]) => profileId !== userId)
        .flatMap(([, dayIds]) => dayIds);

      let otherEntries: RawEntry[];
      try {
        otherEntries = await fetchEntriesForDays(supabase, otherDayIds);
      } catch {
        otherEntries = [];
      }
      if (isStale()) return;

      const ownPoolEntries = qualifyingUsers.some(
        ([profileId]) => profileId === userId,
      )
        ? allMyEntries
        : [];

      rawComparisonRef.current = {
        userId,
        qualifyingUsers,
        rawAllEntries: [...ownPoolEntries, ...otherEntries],
        dayIdToDate: comparisonDayIdToDate,
        myEntries,
        mySubmittedDayIds: submittedDayIds,
        socialContextById,
        locationById,
        satisfactionRankById,
        maxSatisfactionRank,
      };
      // Apply whatever filters the user picked while this was loading
      computeAndSetComparison(
        filtersRef.current.weeks,
        filtersRef.current.dayFilter,
      );
      setIsComparisonLoading(false);
    } else {
      rawComparisonRef.current = null;
      setComparisonTopics([]);
      setComparisonMetaStats(null);
      setCategoryComparison([]);
      setContextMetrics([]);
      setQualifyingUserCount(
        courseSettings?.comparison_enabled === true
          ? qualifyingUsers.length
          : 0,
      );
      setIsComparisonLoading(false);
    }
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

  // ── Personal PDF export ─────────────────────────────────────────────────────

  function buildFilterLabel(): string {
    const parts: string[] = [];
    if (dayFilter === "werktage") parts.push(t("pdf.filter.weekdaysOnly"));
    else if (dayFilter === "wochenende") parts.push(t("pdf.filter.weekendOnly"));
    if (selectedWeeks.length > 0) {
      const labels = weekOptions
        .filter((w) => selectedWeeks.includes(w.key))
        .map((w) => w.label);
      parts.push(labels.join(", "));
    }
    return parts.length > 0 ? parts.join(" · ") : t("pdf.filter.allDays");
  }

  async function handleExportPdf() {
    // Note: the PDF report is still German-only and will get a proper i18n +
    // design pass later; for now it must simply keep working after the merge.
    setIsExportingPdf(true);
    try {
      await generatePersonalReportPdf({
        courseName,
        participantName,
        participantId,
        filterLabel: buildFilterLabel(),
        barData,
        categoryRows,
        metaAggregates,
        comparison: {
          enabled: isCourseComparisonEnabled,
          qualifyingUserCount,
          topics: comparisonTopics,
          metaStats: comparisonMetaStats,
          categories: categoryComparison,
        },
      });
    } finally {
      setIsExportingPdf(false);
    }
  }

  // Rendered inside the filter bar of both tabs (next to Tage / KW)
  const exportButton = (
    <button
      type="button"
      // The PDF includes the course comparison, so wait until it's loaded
      disabled={isExportingPdf || isComparisonLoading}
      onClick={() => void handleExportPdf()}
      title={t("pdf.buttonTitle")}
      className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/15"
    >
      <FileDown size={13} />
      {isExportingPdf ? t("pdf.buttonBusy") : t("pdf.button")}
    </button>
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-slate-500">{t("loading")}</p>
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
        <div className="flex gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("zeitverteilung")}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
              activeTab === "zeitverteilung"
                ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            {t("tabs.zeitverteilung")}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("kursvergleich")}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
              activeTab === "kursvergleich"
                ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            {t("tabs.kursvergleich")}
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
          actions={exportButton}
        />
      ) : isCourseComparisonEnabled && isComparisonLoading ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-slate-500 dark:text-slate-400">{t("loading")}</p>
        </div>
      ) : isCourseComparisonEnabled ? (
        <KursvergleichTab
          topics={comparisonTopics}
          categoryComparison={categoryComparison}
          contextMetrics={contextMetrics}
          qualifyingUserCount={qualifyingUserCount}
          selectedWeeks={selectedWeeks}
          weekOptions={weekOptions}
          dayFilter={dayFilter}
          onToggleWeek={handleToggleWeek}
          onClearWeeks={handleClearWeeks}
          onSetDayFilter={handleSetDayFilter}
          actions={exportButton}
        />
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-6 text-center">
          <p className="text-sm font-semibold text-amber-800">
            {t("comparisonLocked.title")}
          </p>
          <p className="mt-1 text-xs text-amber-700">
            {t("comparisonLocked.description")}
          </p>
        </div>
      )}
    </div>
  );
}
