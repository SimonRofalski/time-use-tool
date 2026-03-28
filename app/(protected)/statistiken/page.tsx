"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import ZeitverteilungTab from "./ZeitverteilungTab";
import KursvergleichTab from "./KursvergleichTab";
import type {
  CategoryRow,
  SubcategoryRow,
  ActivityRow,
  DayBarData,
  ComparisonTopic,
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

// Raw time entry row as returned by Supabase for aggregation purposes
type RawEntry = {
  day_id: number;
  start_time: string;
  end_time: string;
  primary_activity_id: number;
  digital_media_type_id: number | null;
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

// ─── Pure helpers ─────────────────────────────────────────────────────────────

// Calculates how many minutes are covered by a single time_entry row
// e.g. "08:00:00", "09:30:00" → 90 minutes
function calculateMinutes(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

// Generates an array of all ISO date strings between startDate and endDate (inclusive)
function generateDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  const last = new Date(endDate);
  while (current <= last) {
    dates.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// ─── Data aggregation helpers ─────────────────────────────────────────────────

// Builds the drill-down category tree and bar chart data from raw time entries.
// Only processes entries belonging to submitted days.
function buildZeitverteilungData(
  entries: RawEntry[],
  dayIdToDate: Record<number, string>,
  allCourseDates: string[],
  submittedDayIds: Set<number>,
  activities: ActivityLookup[],
  subcategories: SubcategoryLookup[],
  categories: CategoryLookup[]
): { categoryRows: CategoryRow[]; barData: DayBarData[]; categoryNames: string[] } {

  // Build lookup maps for fast access by ID
  const activityMap = new Map(activities.map((a) => [a.activity_id, a]));
  const subcategoryMap = new Map(subcategories.map((s) => [s.subcategory_id, s]));
  const categoryMap = new Map(categories.map((c) => [c.category_id, c]));

  // Accumulate minutes: category → subcategory → activity
  // Structure: { categoryId: { subcategoryId: { activityId: minutes } } }
  const minuteTree: Record<number, Record<number, Record<number, number>>> = {};

  // Accumulate minutes per day per category for the bar chart
  // Structure: { date: { categoryId: minutes } }
  const dailyMinutes: Record<string, Record<number, number>> = {};

  for (const entry of entries) {
    // Only include entries from submitted days
    if (!submittedDayIds.has(entry.day_id)) continue;

    const date = dayIdToDate[entry.day_id];
    if (!date) continue;

    const activity = activityMap.get(entry.primary_activity_id);
    if (!activity) continue;

    const subcategory = subcategoryMap.get(activity.subcategory_id);
    if (!subcategory) continue;

    const category = categoryMap.get(subcategory.category_id);
    if (!category) continue;

    const minutes = calculateMinutes(entry.start_time, entry.end_time);
    const catId = category.category_id;
    const subId = subcategory.subcategory_id;
    const actId = activity.activity_id;

    // Accumulate into the tree
    if (!minuteTree[catId]) minuteTree[catId] = {};
    if (!minuteTree[catId][subId]) minuteTree[catId][subId] = {};
    minuteTree[catId][subId][actId] = (minuteTree[catId][subId][actId] ?? 0) + minutes;

    // Accumulate into daily map
    if (!dailyMinutes[date]) dailyMinutes[date] = {};
    dailyMinutes[date][catId] = (dailyMinutes[date][catId] ?? 0) + minutes;
  }

  // Total minutes across everything (for percentage calculation)
  const grandTotal = Object.values(minuteTree).reduce((catSum, subs) =>
    catSum + Object.values(subs).reduce((subSum, acts) =>
      subSum + Object.values(acts).reduce((a, b) => a + b, 0), 0), 0);

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
              return {
                activityId: act.activity_id,
                name: act.name,
                totalMinutes: mins,
                percentOfTotal: grandTotal > 0 ? (mins / grandTotal) * 100 : 0,
              };
            })
            .sort((a, b) => b.totalMinutes - a.totalMinutes);

          const subTotal = activityRows.reduce((s, a) => s + a.totalMinutes, 0);
          return {
            subcategoryId: sub.subcategory_id,
            name: sub.name,
            totalMinutes: subTotal,
            percentOfTotal: grandTotal > 0 ? (subTotal / grandTotal) * 100 : 0,
            isExpanded: false,
            activities: activityRows,
          };
        })
        .sort((a, b) => b.totalMinutes - a.totalMinutes);

      const catTotal = subcategoryRows.reduce((s, sub) => s + sub.totalMinutes, 0);
      return {
        categoryId: cat.category_id,
        name: cat.name,
        totalMinutes: catTotal,
        percentOfTotal: grandTotal > 0 ? (catTotal / grandTotal) * 100 : 0,
        isExpanded: false,
        subcategories: subcategoryRows,
      };
    })
    .sort((a, b) => b.totalMinutes - a.totalMinutes);

  // Build the sorted category name list (same order as categoryRows)
  const categoryNames = categoryRows.map((r) => r.name);

  // Build one DayBarData entry per course date
  const today = new Date().toISOString().split("T")[0];
  const barData: DayBarData[] = allCourseDates.map((date) => {
    const isSubmittedDay = [...submittedDayIds].some(
      (id) => dayIdToDate[id] === date
    );

    // Future or not-yet-submitted days: use a placeholder bar of 1440 minutes
    if (!isSubmittedDay) {
      return {
        date,
        isSubmitted: false,
        unsubmitted: date <= today ? 60 : 1440, // small indicator for past unsubmitted, full grey for future
      };
    }

    // Submitted day: populate per-category minutes
    const dayEntry: DayBarData = { date, isSubmitted: true };
    for (const cat of categoryRows) {
      dayEntry[cat.name] = dailyMinutes[date]?.[cat.categoryId] ?? 0;
    }
    return dayEntry;
  });

  return { categoryRows, barData, categoryNames };
}

// Calculates average hours per day for a set of entries, filtered to a specific set of activity IDs.
// Only counts days that have at least one matching entry.
// Returns 0 if no matching entries exist.
function calcAverageHoursPerDay(
  entries: RawEntry[],
  submittedDayIds: Set<number>,
  activityIdFilter: Set<number>
): number {
  // Minutes per day: only count days where the activity appears
  const minutesByDay: Record<number, number> = {};

  for (const entry of entries) {
    if (!submittedDayIds.has(entry.day_id)) continue;
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
  submittedDayIds: Set<number>
): number {
  const totalDays = submittedDayIds.size;
  if (totalDays === 0) return 0;

  let totalMinutes = 0;
  for (const entry of entries) {
    if (!submittedDayIds.has(entry.day_id)) continue;
    if (entry.digital_media_type_id !== SMARTPHONE_MEDIA_TYPE_ID) continue;
    totalMinutes += calculateMinutes(entry.start_time, entry.end_time);
  }

  return totalMinutes / 60 / totalDays;
}

// ─── Main page component ──────────────────────────────────────────────────────

export default function StatistikenPage() {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<Tab>("zeitverteilung");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  // Zeitverteilung tab state
  const [categoryRows, setCategoryRows] = useState<CategoryRow[]>([]);
  const [barData, setBarData] = useState<DayBarData[]>([]);
  const [categoryNames, setCategoryNames] = useState<string[]>([]);

  // Kursvergleich tab state
  const [comparisonTopics, setComparisonTopics] = useState<ComparisonTopic[]>([]);
  const [qualifyingUserCount, setQualifyingUserCount] = useState(0);

  useEffect(() => {
    loadAllData();
  }, []);

  // ── Data loading ────────────────────────────────────────────────────────────

  async function loadAllData() {
    setIsLoading(true);
    setErrorMessage("");

    // Step 1: get the logged-in user
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) { router.push("/"); return; }
    const userId = authData.user.id;

    // Step 2: get course enrollment
    const { data: userCourse } = await supabase
      .from("user_course").select("course_id").eq("profiles_id", userId).single();
    if (!userCourse) {
      setErrorMessage("Kein Kurs gefunden.");
      setIsLoading(false);
      return;
    }
    const courseId = userCourse.course_id;

    // Step 3: load course date range
    const { data: courseData } = await supabase
      .from("course").select("start_date, end_date").eq("course_id", courseId).single();
    if (!courseData) {
      setErrorMessage("Kursdaten konnten nicht geladen werden.");
      setIsLoading(false);
      return;
    }
    const allCourseDates = generateDateRange(courseData.start_date, courseData.end_date);

    // Step 4: load lookup tables in parallel
    const [cats, subs, acts] = await Promise.all([
      supabase.from("category").select("category_id, name").order("category_id"),
      supabase.from("subcategory").select("subcategory_id, name, category_id").order("subcategory_id"),
      supabase.from("activity").select("activity_id, name, subcategory_id").order("activity_id"),
    ]);

    const categories: CategoryLookup[] = cats.data ?? [];
    const subcategories: SubcategoryLookup[] = subs.data ?? [];
    const activities: ActivityLookup[] = acts.data ?? [];

    // Step 5: load all submitted day records for this user in this course
    const { data: myDays } = await supabase
      .from("day")
      .select("day_id, date")
      .eq("profiles_id", userId)
      .eq("course_id", courseId)
      .eq("is_submitted", true);

    const mySubmittedDayIds = new Set((myDays ?? []).map((d) => d.day_id));
    const myDayIdToDate: Record<number, string> = {};
    for (const d of myDays ?? []) myDayIdToDate[d.day_id] = d.date;

    // Step 6: load all time entries for the user's submitted days
    const myDayIds = [...mySubmittedDayIds];
    let myEntries: RawEntry[] = [];

    if (myDayIds.length > 0) {
      const { data: entryData } = await supabase
        .from("time_entry")
        .select("day_id, start_time, end_time, primary_activity_id, digital_media_type_id")
        .in("day_id", myDayIds);
      myEntries = entryData ?? [];
    }

    // Step 7: build Zeitverteilung data from the user's own entries
    const zeitverteilungResult = buildZeitverteilungData(
      myEntries,
      myDayIdToDate,
      allCourseDates,
      mySubmittedDayIds,
      activities,
      subcategories,
      categories
    );
    setCategoryRows(zeitverteilungResult.categoryRows);
    setBarData(zeitverteilungResult.barData);
    setCategoryNames(zeitverteilungResult.categoryNames);

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
      ...new Set((allSubmittedDays ?? []).map((d: any) => d.profiles_id as string)),
    ];

    // Load submitted days for all participants
    const { data: allDays } = await supabase
      .from("day")
      .select("day_id, profiles_id")
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
      ([, dayIds]) => dayIds.length >= MIN_DAYS_FOR_COMPARISON
    );
    setQualifyingUserCount(qualifyingUsers.length);

    // Only build comparison if there are enough qualifying users
    if (qualifyingUsers.length >= 3) {
      // Load all time entries for all qualifying users' submitted days
      const allQualifyingDayIds = qualifyingUsers.flatMap(([, dayIds]) => dayIds);

      const { data: allEntries } = await supabase
        .from("time_entry")
        .select("day_id, start_time, end_time, primary_activity_id, digital_media_type_id")
        .in("day_id", allQualifyingDayIds);

      const rawAllEntries: RawEntry[] = allEntries ?? [];

      // Calculate per-topic average hours/day for each qualifying user
      const sleepValues: number[] = [];
      const sportValues: number[] = [];
      const smartphoneValues: number[] = [];

      for (const [profileId, dayIds] of qualifyingUsers) {
        const userDayIdSet = new Set(dayIds);
        const userEntries = rawAllEntries.filter((e) => userDayIdSet.has(e.day_id));

        sleepValues.push(calcAverageHoursPerDay(userEntries, userDayIdSet, SLEEP_ACTIVITY_IDS));
        sportValues.push(calcAverageHoursPerDay(userEntries, userDayIdSet, SPORT_ACTIVITY_IDS));
        smartphoneValues.push(calcSmartphoneHoursPerDay(userEntries, userDayIdSet));
      }

      // Get the current user's own values (use myEntries + mySubmittedDayIds)
      const mySleeepValue = calcAverageHoursPerDay(myEntries, mySubmittedDayIds, SLEEP_ACTIVITY_IDS);
      const mySportValue = calcAverageHoursPerDay(myEntries, mySubmittedDayIds, SPORT_ACTIVITY_IDS);
      const mySmartphoneValue = calcSmartphoneHoursPerDay(myEntries, mySubmittedDayIds);

      setComparisonTopics([
        {
          key: "schlaf",
          label: "Schlaf",
          unit: "h/Tag",
          allValues: sleepValues,
          userValue: mySleeepValue,
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
    }

    setIsLoading(false);
  }

  // ── Accordion toggle handlers ───────────────────────────────────────────────

  // Toggles the expanded state of a category row in the drill-down table
  function handleToggleCategory(categoryId: number) {
    setCategoryRows((prev) =>
      prev.map((cat) =>
        cat.categoryId === categoryId
          ? { ...cat, isExpanded: !cat.isExpanded }
          : cat
      )
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
                  : sub
              ),
            }
      )
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
      {/* Page header */}
      <div>
        <h2 className="text-xl font-semibold text-slate-800">Statistiken</h2>
        <p className="mt-1 text-sm text-slate-500">
          Basierend auf deinen eingereichten Tagen
        </p>
      </div>

      {/* Tab bar */}
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

      {/* Tab content */}
      {activeTab === "zeitverteilung" ? (
        <ZeitverteilungTab
          barData={barData}
          categoryRows={categoryRows}
          categoryNames={categoryNames}
          onToggleCategory={handleToggleCategory}
          onToggleSubcategory={handleToggleSubcategory}
        />
      ) : (
        <KursvergleichTab
          topics={comparisonTopics}
          qualifyingUserCount={qualifyingUserCount}
        />
      )}
    </div>
  );
}
