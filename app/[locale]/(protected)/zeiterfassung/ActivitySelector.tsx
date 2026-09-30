"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/routing";
import { getLocalizedName } from "@/lib/i18n/localized-name";
import {
  Baby,
  Bike,
  BookOpen,
  Briefcase,
  Building2,
  Bus,
  Calendar,
  Car,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Check,
  Clock,
  Clock3,
  CookingPot,
  Dumbbell,
  Film,
  Footprints,
  Gamepad2,
  GraduationCap,
  HandHeart,
  Heart,
  UserCheck,
  UserX,
  Headphones,
  HeartPulse,
  Home,
  Hotel,
  Laptop,
  MapPin,
  MessageCircle,
  HelpCircle,
  MoonStar,
  Music,
  Newspaper,
  NotebookPen,
  Palette,
  Pencil,
  Plus,
  Scissors,
  Search,
  Smartphone,
  Tablet,
  ShoppingBag,
  Sparkles,
  Trash2,
  TrainFront,
  Tv,
  TreePine,
  type LucideIcon,
  UtensilsCrossed,
  Users,
  UserRound,
  Watch,
  Gauge,
  Wrench,
} from "lucide-react";
import {
  type PendingEntry,
  type QuestionnaireStep,
  type LookupData,
  type TimeEntryRecord,
  CATEGORY_COLORS,
  getCategoryColor,
} from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

// Hierarchical structure built for rendering the activity tree
type ActivityNode = {
  activity_id: number;
  name: string;
};

type SubcategoryNode = {
  subcategory_id: number;
  name: string;
  activities: ActivityNode[];
};

type CategoryNode = {
  category_id: number;
  code: string;
  name: string;
  color: string;
  subcategories: SubcategoryNode[];
};

type CategoryVisual = {
  primaryIcon: LucideIcon;
  secondaryIcon: LucideIcon;
  tertiaryIcon: LucideIcon;
};

type ActivitySelectorProps = {
  step: QuestionnaireStep;
  pendingEntry: PendingEntry;
  selectedSlots: Set<string>;
  existingEntries: TimeEntryRecord[];
  lookupData: LookupData;
  onStepComplete: (data: Partial<PendingEntry>) => void;
  onBack: () => void;
  onDeleteSelection: () => void | Promise<void>;
  onDeleteSlots: (slots: string[]) => Promise<void>;
  onReselectSlots: (slots: string[]) => void;
  showDeleteSelection: boolean;
  isDeletingSelection?: boolean;
  askExtraRatings: boolean;
};

// ─── Pure helper functions ────────────────────────────────────────────────────

// Builds the nested category → subcategory → activity hierarchy
// Filters by searchQuery if provided; hides empty branches
// excludeActivityId: optionally removes one activity from the list (used in
// the secondary activity step to prevent selecting the same as primary)
function buildActivityHierarchy(
  lookupData: LookupData,
  searchQuery: string,
  locale: Locale,
  excludeActivityId?: number | null,
): CategoryNode[] {
  const query = searchQuery.toLowerCase().trim();

  return lookupData.categories
    .map((cat, index) => {
      const color = CATEGORY_COLORS[index % CATEGORY_COLORS.length];

      const subcategories = lookupData.subcategories
        .filter((sub) => sub.category_id === cat.category_id)
        .map((sub) => {
          const activities = lookupData.activities
            .filter((act) => act.subcategory_id === sub.subcategory_id)
            .filter((act) => act.activity_id !== excludeActivityId)
            .map((act) => ({
              activity_id: act.activity_id,
              name: getLocalizedName(act, locale),
            }))
            .filter((act) =>
              query ? act.name.toLowerCase().includes(query) : true,
            );

          return {
            subcategory_id: sub.subcategory_id,
            name: getLocalizedName(sub, locale),
            activities,
          };
        })
        .filter((sub) => sub.activities.length > 0); // hide empty subcategories

      return {
        category_id: cat.category_id,
        code: cat.code,
        name: getLocalizedName(cat, locale),
        color,
        subcategories,
      };
    })
    .filter((cat) => cat.subcategories.length > 0); // hide empty categories
}

type ActivitySelectorTranslate = ReturnType<
  typeof useTranslations<"activitySelector">
>;

// Returns the question text for each questionnaire step
function getStepQuestion(
  step: QuestionnaireStep,
  t: ActivitySelectorTranslate,
): string {
  switch (step) {
    case "primary_activity":
      return t("questions.primaryActivity");
    case "secondary_activity":
      return t("questions.secondaryActivity");
    case "digital_media":
      return t("questions.digitalMedia");
    case "digital_media_type":
      return t("questions.digitalMediaType");
    case "location_transport":
      return t("questions.locationTransport");
    case "social_context":
      return t("questions.socialContext");
    case "satisfaction":
      return t("questions.satisfaction");
  }
}

// Returns label and step index (1-based) out of total for the step indicator
function getStepMeta(
  step: QuestionnaireStep,
  t: ActivitySelectorTranslate,
): {
  index: number;
  total: number;
  label: string;
} {
  const steps: QuestionnaireStep[] = [
    "primary_activity",
    "secondary_activity",
    "digital_media",
    "digital_media_type",
    "location_transport",
    "social_context",
    "satisfaction",
  ];
  const labels: Record<QuestionnaireStep, string> = {
    primary_activity: t("stepLabels.primaryActivity"),
    secondary_activity: t("stepLabels.secondaryActivity"),
    digital_media: t("stepLabels.digitalMedia"),
    digital_media_type: t("stepLabels.digitalMediaType"),
    location_transport: t("stepLabels.locationTransport"),
    social_context: t("stepLabels.socialContext"),
    satisfaction: t("stepLabels.satisfaction"),
  };
  return {
    index: steps.indexOf(step) + 1,
    total: steps.length,
    label: labels[step],
  };
}

// Formats the selected slots for the header badge:
// time = "08:00 – 09:30", meta = "9 Felder · 1 Std 30 Min"
function formatSlotsRange(
  slots: Set<string>,
  t: ActivitySelectorTranslate,
): { time: string; meta: string } {
  if (slots.size === 0) return { time: "", meta: "" };
  const sorted = [...slots].sort();
  const firstSlot = sorted[0];
  const lastSlot = sorted[sorted.length - 1];
  const [lh, lm] = lastSlot.split(":").map(Number);
  const endTotal = lh * 60 + lm + 10;
  const endStr = `${Math.floor(endTotal / 60)
    .toString()
    .padStart(2, "0")}:${(endTotal % 60).toString().padStart(2, "0")}`;

  // Duration counts the selected slots, not the span, so gaps aren't included
  const totalMinutes = slots.size * 10;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const duration =
    hours === 0
      ? t("duration.minutes", { minutes })
      : minutes === 0
        ? t("duration.hours", { hours })
        : t("duration.hoursMinutes", { hours, minutes });

  return {
    time: t("slotsRange.time", { start: firstSlot, end: endStr }),
    meta: t("slotsRange.meta", { count: slots.size, duration }),
  };
}

function slotToMinutes(slot: string): number {
  const [hour, minute] = slot.split(":").map(Number);
  return hour * 60 + minute;
}

function minutesToSlot(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${Math.floor(normalized / 60)
    .toString()
    .padStart(2, "0")}:${(normalized % 60).toString().padStart(2, "0")}`;
}

// Groups contiguous 10-minute slots into compact ranges: ["08:00 - 09:30", "12:00 - 12:20"]
function formatMergedSlotRanges(slots: Set<string>): string[] {
  if (slots.size === 0) return [];

  const sortedMinutes = [...slots].map(slotToMinutes).sort((a, b) => a - b);

  const ranges: Array<{ start: number; endExclusive: number }> = [];
  let start = sortedMinutes[0];
  let previous = sortedMinutes[0];

  for (let i = 1; i < sortedMinutes.length; i++) {
    const current = sortedMinutes[i];
    if (current === previous + 10) {
      previous = current;
      continue;
    }

    ranges.push({ start, endExclusive: previous + 10 });
    start = current;
    previous = current;
  }

  ranges.push({ start, endExclusive: previous + 10 });

  return ranges.map((range) => {
    const startText = minutesToSlot(range.start);
    const endText = minutesToSlot(range.endExclusive);
    return `${startText} - ${endText}`;
  });
}

function findActivityById(
  lookupData: LookupData,
  activityId: number | null,
): LookupData["activities"][number] | null {
  if (activityId === null) return null;
  return (
    lookupData.activities.find((a) => a.activity_id === activityId) ?? null
  );
}

function findCategoryForActivity(
  lookupData: LookupData,
  activityId: number | null,
): LookupData["categories"][number] | null {
  const activity = findActivityById(lookupData, activityId);
  if (!activity) return null;

  const subcategory = lookupData.subcategories.find(
    (s) => s.subcategory_id === activity.subcategory_id,
  );
  if (!subcategory) return null;

  return (
    lookupData.categories.find(
      (c) => c.category_id === subcategory.category_id,
    ) ?? null
  );
}

function findNameById<T extends { name: string; name_en: string }>(
  rows: T[],
  idKey: keyof T,
  idValue: number | null,
  locale: Locale,
): string | null {
  if (idValue === null) return null;
  const row = rows.find((item) => item[idKey] === idValue);
  if (!row) return null;
  return getLocalizedName(row, locale);
}

// Mirrors findNameById but returns the language-neutral `code` instead —
// used to drive icon/grouping/sort logic so it doesn't depend on display language
function findCodeById<T extends Record<string, unknown>>(
  rows: T[],
  idKey: keyof T,
  idValue: number | null,
): string | null {
  if (idValue === null) return null;
  const row = rows.find((item) => item[idKey] === idValue);
  if (!row) return null;
  return typeof row.code === "string" ? row.code : null;
}

type SelectedSlotGroup = {
  start: number;
  endExclusive: number;
  entry: TimeEntryRecord | null;
};

function buildSelectedSlotGroups(
  selectedSlots: Set<string>,
  existingEntries: TimeEntryRecord[],
): SelectedSlotGroup[] {
  if (selectedSlots.size === 0) return [];

  const entryByStartTime = new Map(
    existingEntries.map((entry) => [entry.start_time, entry]),
  );

  const orderedMinutes = [...selectedSlots]
    .map(slotToMinutes)
    .sort((a, b) => a - b);

  const groups: SelectedSlotGroup[] = [];

  function getSignature(entry: TimeEntryRecord | null): string {
    if (!entry) return "__empty__";
    return JSON.stringify({
      p: entry.primary_activity_id,
      s: entry.secondary_activity_id,
      dm: entry.digital_media_used,
      dmt: [...entry.digital_media_type_ids].sort((a, b) => a - b),
      l: entry.location_transport_id,
      sc: [...entry.social_context_ids].sort((a, b) => a - b),
      sat: entry.satisfaction_id,
    });
  }

  let currentStart = orderedMinutes[0];
  let previousMinute = orderedMinutes[0];
  let currentEntry = entryByStartTime.get(minutesToSlot(currentStart)) ?? null;
  let currentSignature = getSignature(currentEntry);

  for (let i = 1; i < orderedMinutes.length; i++) {
    const minute = orderedMinutes[i];
    const entry = entryByStartTime.get(minutesToSlot(minute)) ?? null;
    const signature = getSignature(entry);
    const isContiguous = minute === previousMinute + 10;
    const isSameContent = signature === currentSignature;

    if (isContiguous && isSameContent) {
      previousMinute = minute;
      continue;
    }

    groups.push({
      start: currentStart,
      endExclusive: previousMinute + 10,
      entry: currentEntry,
    });

    currentStart = minute;
    previousMinute = minute;
    currentEntry = entry;
    currentSignature = signature;
  }

  groups.push({
    start: currentStart,
    endExclusive: previousMinute + 10,
    entry: currentEntry,
  });

  return groups;
}

// Keyed by the language-neutral HETUS/BFS classification `code` (not the
// display name, which becomes locale-dependent) so icons stay correct
// regardless of UI language.
const CATEGORY_VISUAL_BY_CODE: Record<string, CategoryVisual> = {
  "0": {
    primaryIcon: MoonStar,
    secondaryIcon: UtensilsCrossed,
    tertiaryIcon: HeartPulse,
  }, // Persönliche Pflege
  "1": { primaryIcon: Briefcase, secondaryIcon: Laptop, tertiaryIcon: Clock3 }, // Erwerbstätigkeit
  "2": {
    primaryIcon: GraduationCap,
    secondaryIcon: BookOpen,
    tertiaryIcon: Pencil,
  }, // Studium / Ausbildung
  "3": { primaryIcon: Home, secondaryIcon: CookingPot, tertiaryIcon: Baby }, // Haushalt und Familienarbeit
  "4": {
    primaryIcon: HandHeart,
    secondaryIcon: Users,
    tertiaryIcon: Calendar,
  }, // Freiwilligenarbeit und Treffen
  "5": {
    primaryIcon: MessageCircle,
    secondaryIcon: Music,
    tertiaryIcon: Film,
  }, // Soziales Leben und Unterhaltung
  "6": { primaryIcon: Dumbbell, secondaryIcon: TreePine, tertiaryIcon: Bike }, // Sport und Aktivitäten im Freien
  "7": {
    primaryIcon: Palette,
    secondaryIcon: Gamepad2,
    tertiaryIcon: Scissors,
  }, // Hobbys
  "8": { primaryIcon: Tv, secondaryIcon: Newspaper, tertiaryIcon: Headphones }, // Massenmedien
  "9": { primaryIcon: Bus, secondaryIcon: Car, tertiaryIcon: Footprints }, // Wegezeiten
  "99": {
    primaryIcon: HelpCircle,
    secondaryIcon: Clock,
    tertiaryIcon: NotebookPen,
  }, // Nicht spezifizierte Zeitnutzung
};

// Fallback rotation for any category code not in the map above (defensive —
// all 11 current categories are covered, this only matters if new ones are added)
const DEFAULT_CATEGORY_VISUALS: CategoryVisual[] = [
  { primaryIcon: BookOpen, secondaryIcon: Laptop, tertiaryIcon: Pencil },
  { primaryIcon: Briefcase, secondaryIcon: Wrench, tertiaryIcon: Clock3 },
  { primaryIcon: Home, secondaryIcon: ShoppingBag, tertiaryIcon: CookingPot },
  { primaryIcon: Users, secondaryIcon: HeartPulse, tertiaryIcon: Music },
  { primaryIcon: TreePine, secondaryIcon: Sparkles, tertiaryIcon: Bike },
];

function getCategoryVisual(categoryCode: string, index: number): CategoryVisual {
  return (
    CATEGORY_VISUAL_BY_CODE[categoryCode] ??
    DEFAULT_CATEGORY_VISUALS[index % DEFAULT_CATEGORY_VISUALS.length]
  );
}

function countActivities(subcategories: SubcategoryNode[]): number {
  return subcategories.reduce((sum, subcategory) => {
    return sum + subcategory.activities.length;
  }, 0);
}

function findSelectedActivityName(
  hierarchy: CategoryNode[],
  selectedActivityId: number | null,
): string | null {
  if (selectedActivityId === null) {
    return null;
  }

  for (const category of hierarchy) {
    for (const subcategory of category.subcategories) {
      const activity = subcategory.activities.find(
        (item) => item.activity_id === selectedActivityId,
      );
      if (activity) {
        return activity.name;
      }
    }
  }

  return null;
}

// ─── Step renderers ───────────────────────────────────────────────────────────

// Shared activity list used for both primary and secondary activity steps
// Renders category/subcategory headers with clickable activity buttons
function ActivityList({
  hierarchy,
  selectedActivityId,
  searchQuery,
  onSearchChange,
  onActivitySelect,
  activeCategoryId,
  onActiveCategoryChange,
  searchPlaceholder,
  topSlot,
  searchRowLeadingSlot,
}: {
  hierarchy: CategoryNode[];
  selectedActivityId: number | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onActivitySelect: (activityId: number) => void;
  activeCategoryId: number | null;
  onActiveCategoryChange: (categoryId: number | null) => void;
  searchPlaceholder: string;
  topSlot?: React.ReactNode; // optional slot for the "Keine" button in step 2
  searchRowLeadingSlot?: React.ReactNode; // e.g. the step's back button
}) {
  const t = useTranslations("activitySelector");
  const trimmedQuery = searchQuery.trim();
  const isSearching = trimmedQuery.length > 0;
  const activeCategory = hierarchy.find(
    (category) => category.category_id === activeCategoryId,
  );
  const selectedActivityName = findSelectedActivityName(
    hierarchy,
    selectedActivityId,
  );

  return (
    <div className="flex flex-col gap-3">
      {topSlot}

      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 p-3">
        <div className="flex items-center gap-2">
          {searchRowLeadingSlot}
          {!isSearching && activeCategory && (
            <button
              type="button"
              onClick={() => onActiveCategoryChange(null)}
              className="flex shrink-0 flex-col items-center gap-0.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 shadow-sm transition-colors hover:border-slate-400 dark:hover:border-slate-500 hover:text-slate-800 dark:hover:text-slate-100"
            >
              <span>←</span>
              <span className="text-[10px] font-normal text-slate-400 leading-none">
                {t("activityList.categoriesBackLabel")}
              </span>
            </button>
          )}
          <label className="relative block flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={
                activeCategory ? activeCategory.name : searchPlaceholder
              }
              className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 py-2 pl-9 pr-3 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/30"
            />
          </label>
        </div>
      </div>

      <div
        className="overflow-y-auto overflow-x-hidden scrollbar-thin"
        style={{ maxHeight: "min(620px, calc(100vh - 220px))" }}
      >
        {hierarchy.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-400">
            {t("activityList.noActivitiesFound")}
          </p>
        )}

        {!isSearching && !activeCategory && hierarchy.length > 0 && (
          // Column count follows the panel's own width (container query), not
          // the viewport, so cards stay compact wherever the selector is placed
          <div className="@container">
            <div className="grid grid-cols-2 gap-2 @xl:grid-cols-3 @3xl:grid-cols-4">
              {hierarchy.map((category, index) => {
                const visual = getCategoryVisual(category.code, index);
                const PrimaryIcon = visual.primaryIcon;
                const SecondaryIcon = visual.secondaryIcon;
                const TertiaryIcon = visual.tertiaryIcon;
                const isSelectedCategory = category.subcategories.some((sub) =>
                  sub.activities.some(
                    (activity) => activity.activity_id === selectedActivityId,
                  ),
                );

                return (
                  <button
                    key={category.category_id}
                    type="button"
                    data-tour-category={category.code}
                    onClick={() => onActiveCategoryChange(category.category_id)}
                    className={`group flex h-full flex-col overflow-hidden rounded-2xl border-2 bg-white dark:bg-slate-800 text-left shadow-sm transition-all hover:shadow-md ${
                      isSelectedCategory
                        ? "border-[color:var(--cat)]"
                        : "border-[color:color-mix(in_srgb,var(--cat)_35%,transparent)] hover:border-[color:var(--cat)]"
                    }`}
                    style={
                      {
                        "--cat": category.color,
                        // Outer 1px ring thickens the border on selection
                        // without shifting the layout like a wider border would
                        ...(isSelectedCategory && {
                          boxShadow: `0 0 0 1px ${category.color}`,
                        }),
                      } as CSSProperties
                    }
                  >
                    <div
                      className="flex flex-1 flex-col justify-between gap-3 p-3"
                      style={{
                        background: `linear-gradient(160deg, ${category.color}2e 0%, ${category.color}0d 100%)`,
                      }}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <h4 className="text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100">
                          {category.name}
                        </h4>
                        {isSelectedCategory && (
                          <span
                            className="mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                            style={{ backgroundColor: category.color }}
                          >
                            ✓
                          </span>
                        )}
                      </div>
                      {/* Pinned to the bottom by justify-between — cards in a
                          row share a height, so icons stay aligned */}
                      <div
                        className="flex items-center gap-2.5"
                        style={{ color: category.color }}
                      >
                        <PrimaryIcon className="h-5 w-5" />
                        <SecondaryIcon className="h-5 w-5" />
                        <TertiaryIcon className="h-5 w-5" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {((!isSearching && activeCategory) || isSearching) && (
          <div className="space-y-4">
            {
              !isSearching &&
                activeCategory &&
                null /* back button now in search bar */
            }

            {(isSearching
              ? hierarchy
              : activeCategory
                ? [activeCategory]
                : []
            ).map((category) => (
              <div
                key={category.category_id}
                className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm"
              >
                {isSearching && (
                  <div
                    className="mb-4 flex items-center gap-3 rounded-xl px-3 py-2"
                    style={{ backgroundColor: `${category.color}10` }}
                  >
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: category.color }}
                    />
                    <span className="text-sm font-semibold text-slate-800">
                      {category.name}
                    </span>
                    <span className="text-xs text-slate-500">
                      {t("activityList.matchCount", {
                        count: countActivities(category.subcategories),
                      })}
                    </span>
                  </div>
                )}

                <div className="space-y-2">
                  {category.subcategories.map((subcategory) => (
                    <div
                      key={subcategory.subcategory_id}
                      className="rounded-xl border p-3"
                      style={{
                        borderColor: `${category.color}50`,
                        backgroundColor: `${category.color}0d`,
                      }}
                    >
                      <p
                        className="mb-2 text-xs font-bold uppercase tracking-wide"
                        style={{ color: category.color }}
                      >
                        {subcategory.name}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {subcategory.activities.map((activity) => {
                          const isSelected =
                            selectedActivityId === activity.activity_id;
                          return (
                            <button
                              key={activity.activity_id}
                              type="button"
                              onClick={() =>
                                onActivitySelect(activity.activity_id)
                              }
                              className={`rounded-2xl border px-4 py-3 text-sm font-semibold leading-snug transition-all ${
                                isSelected
                                  ? "border-transparent text-white shadow-sm"
                                  : "hover:opacity-90 active:scale-95"
                              }`}
                              style={
                                isSelected
                                  ? { backgroundColor: category.color }
                                  : {
                                      backgroundColor: `${category.color}22`,
                                      color: category.color,
                                      borderColor: `${category.color}60`,
                                      filter: "brightness(0.92)",
                                    }
                              }
                            >
                              {activity.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ActivitySelector({
  step,
  pendingEntry,
  selectedSlots,
  existingEntries,
  lookupData,
  onStepComplete,
  onBack,
  onDeleteSelection,
  onDeleteSlots,
  onReselectSlots,
  showDeleteSelection,
  isDeletingSelection = false,
  askExtraRatings,
}: ActivitySelectorProps) {
  const t = useTranslations("activitySelector");
  const locale = useLocale() as Locale;
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [stepValidationError, setStepValidationError] = useState<string | null>(
    null,
  );
  // Open editor by default when the selection has no existing entries (fresh slots)
  const hasAnyExistingEntryInSelection =
    selectedSlots.size > 0 &&
    [...selectedSlots].some((slot) =>
      existingEntries.some((e) => e.start_time === slot),
    );
  const [isEditorVisible, setIsEditorVisible] = useState(
    !hasAnyExistingEntryInSelection,
  );

  // Reset editor visibility whenever the slot selection changes
  useEffect(() => {
    if (forceEditorOpenRef.current) {
      forceEditorOpenRef.current = false;
      setIsEditorVisible(true);
      return;
    }
    setIsEditorVisible(!hasAnyExistingEntryInSelection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSlots]);

  useEffect(() => {
    setSearchQuery("");
    setActiveCategoryId(null);
    setStepValidationError(null);
  }, [step]);

  useEffect(() => {
    if (searchQuery.trim().length > 0) {
      setActiveCategoryId(null);
    }
  }, [searchQuery]);

  const hierarchy = buildActivityHierarchy(lookupData, searchQuery, locale);
  const activeBrowsingCategory = hierarchy.find(
    (category) => category.category_id === activeCategoryId,
  );
  const mergedSlotRanges = formatMergedSlotRanges(selectedSlots);
  const selectedSlotGroups = buildSelectedSlotGroups(
    selectedSlots,
    existingEntries,
  );
  const uniqueSelectedSignatures = new Set(
    selectedSlotGroups.map((group) =>
      group.entry
        ? JSON.stringify({
            p: group.entry.primary_activity_id,
            s: group.entry.secondary_activity_id,
            dm: group.entry.digital_media_used,
            dmt: [...group.entry.digital_media_type_ids].sort((a, b) => a - b),
            l: group.entry.location_transport_id,
            sc: [...group.entry.social_context_ids].sort((a, b) => a - b),
            sat: group.entry.satisfaction_id,
          })
        : "__empty__",
    ),
  );
  const hasMixedSelectionContent = uniqueSelectedSignatures.size > 1;

  const primaryActivity = findActivityById(
    lookupData,
    pendingEntry.primary_activity_id,
  );
  const secondaryActivity = findActivityById(
    lookupData,
    pendingEntry.secondary_activity_id,
  );
  const primaryCategory = findCategoryForActivity(
    lookupData,
    pendingEntry.primary_activity_id,
  );
  const secondaryCategory = findCategoryForActivity(
    lookupData,
    pendingEntry.secondary_activity_id,
  );

  const locationName = findNameById(
    lookupData.locationTransports,
    "location_transport_id",
    pendingEntry.location_transport_id,
    locale,
  );
  const satisfactionName = findNameById(
    lookupData.satisfactions,
    "satisfaction_id",
    pendingEntry.satisfaction_id,
    locale,
  );

  const socialContextNames = lookupData.socialContexts
    .filter((item) =>
      pendingEntry.social_context_ids.includes(item.social_context_id),
    )
    .map((item) => getLocalizedName(item, locale));

  const digitalMediaTypeNames = lookupData.digitalMediaTypes
    .filter((item) =>
      pendingEntry.digital_media_type_ids.includes(item.digital_media_type_id),
    )
    .map((item) => getLocalizedName(item, locale));

  // ── Step content renderers ──────────────────────────────────────────────────

  // Step 1: select the main (required) activity
  function renderPrimaryActivityStep() {
    return (
      <ActivityList
        hierarchy={hierarchy}
        selectedActivityId={pendingEntry.primary_activity_id}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onActivitySelect={(activityId) =>
          onStepComplete({ primary_activity_id: activityId })
        }
        activeCategoryId={activeCategoryId}
        onActiveCategoryChange={setActiveCategoryId}
        searchPlaceholder={t("activityList.primarySearchPlaceholder")}
      />
    );
  }

  // Step 2: select an optional secondary activity
  // Includes a "no secondary activity" button at the top
  // The primary activity is excluded from the list to prevent check constraint violations
  function renderSecondaryActivityStep() {
    const primaryColor = primaryCategory
      ? getCategoryColor(primaryCategory.category_id, lookupData.categories)
      : "#94A3B8";
    const hierarchyWithoutPrimary = buildActivityHierarchy(
      lookupData,
      searchQuery,
      locale,
      pendingEntry.primary_activity_id,
    );

    return (
      <ActivityList
        hierarchy={hierarchyWithoutPrimary}
        selectedActivityId={pendingEntry.secondary_activity_id}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onActivitySelect={(activityId) =>
          onStepComplete({ secondary_activity_id: activityId })
        }
        activeCategoryId={activeCategoryId}
        onActiveCategoryChange={setActiveCategoryId}
        searchPlaceholder={t("activityList.secondarySearchPlaceholder")}
        topSlot={
          // Banner that sets this step apart from the (visually identical)
          // primary step: carries the question itself, confirms the primary
          // choice with a half-filled slot, and makes "no secondary activity"
          // the obvious default action
          <div className="flex flex-col gap-3 rounded-2xl border border-blue-200 dark:border-blue-800/50 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 p-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="relative h-10 w-14 shrink-0 overflow-hidden rounded-lg bg-white dark:bg-slate-700 shadow-sm ring-1 ring-slate-200 dark:ring-slate-600">
                <span
                  className="slot-tri-in-bl absolute inset-0"
                  style={{
                    background: primaryColor,
                    clipPath: "polygon(0 0, 0 100%, 100% 100%)",
                  }}
                />
                <Plus className="absolute right-1 top-1 h-3.5 w-3.5 text-slate-400" />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold leading-snug text-slate-900 dark:text-slate-100">
                  {t("questions.secondaryActivity")}{" "}
                  <span className="ml-0.5 inline-block translate-y-[-2px] rounded-full bg-white/80 dark:bg-slate-800/80 px-2 py-0.5 align-middle text-[11px] font-semibold text-blue-600 dark:text-blue-300 ring-1 ring-blue-200 dark:ring-blue-800/50">
                    {t("activityList.optionalBadge")}
                  </span>
                </p>
                {primaryActivity && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span className="truncate">
                      {t("overview.mainActivity", {
                        name: getLocalizedName(primaryActivity, locale),
                      })}
                    </span>
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              data-tour="no-secondary-button"
              onClick={() => onStepComplete({ secondary_activity_id: null })}
              className="shrink-0 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              {t("activityList.noSecondaryActivityButton")}
            </button>
          </div>
        }
        searchRowLeadingSlot={
          <button
            type="button"
            onClick={onBack}
            className="flex shrink-0 items-center gap-1 self-stretch rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 text-sm font-medium text-slate-600 dark:text-slate-300 shadow-sm transition-colors hover:border-slate-400 dark:hover:border-slate-500 hover:text-slate-800 dark:hover:text-slate-100"
          >
            <ChevronLeft className="h-4 w-4" />
            {t("backButton")}
          </button>
        }
      />
    );
  }

  // Step 3: yes/no — did the user use an electronic device?
  function renderDigitalMediaStep() {
    return (
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: t("digitalMedia.yes"), value: true, icon: "📱" },
          { label: t("digitalMedia.no"), value: false, icon: "🚫" },
        ].map(({ label, value, icon }) => {
          const isSelected = pendingEntry.digital_media_used === value;
          return (
            <button
              key={label}
              type="button"
              onClick={() => onStepComplete({ digital_media_used: value })}
              className={`
                flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-6
                font-medium transition-all
                ${
                  isSelected
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300"
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"
                }
              `}
            >
              <span className="text-3xl">{icon}</span>
              <span className="text-sm">{label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // Device-type visuals keyed by `code`: 0=Kein IT-Hilfsmittel, 9=Unbekannt
  const DIGITAL_MEDIA_TYPE_VISUAL_BY_CODE: Record<
    string,
    { icon: LucideIcon; chipClass: string }
  > = {
    "1": { icon: Smartphone, chipClass: "bg-cyan-50 text-cyan-700 ring-cyan-100" },
    "2": {
      icon: Laptop,
      chipClass: "bg-indigo-50 text-indigo-700 ring-indigo-100",
    },
    "3": {
      icon: Tablet,
      chipClass: "bg-violet-50 text-violet-700 ring-violet-100",
    },
    "4": { icon: Tv, chipClass: "bg-orange-50 text-orange-700 ring-orange-100" },
    "5": {
      icon: Gamepad2,
      chipClass: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-100",
    },
    "6": {
      icon: Watch,
      chipClass: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    },
  };

  const DEFAULT_DIGITAL_MEDIA_TYPE_VISUAL = {
    icon: HelpCircle,
    chipClass: "bg-slate-100 text-slate-700 ring-slate-200",
  };

  // Step 4 (conditional): which type of device was used?
  // Helper: map a digital_media_type `code` to icon + color
  function getDigitalMediaTypeVisual(code: string): {
    icon: LucideIcon;
    chipClass: string;
  } {
    return (
      DIGITAL_MEDIA_TYPE_VISUAL_BY_CODE[code] ??
      DEFAULT_DIGITAL_MEDIA_TYPE_VISUAL
    );
  }

  function renderDigitalMediaTypeStep() {
    // code "0" = "Kein IT-Hilfsmittel", redundant because the previous step already asks this.
    const filteredTypes = lookupData.digitalMediaTypes.filter(
      (type) => type.code !== "0",
    );

    const selectedIds = new Set(pendingEntry.digital_media_type_ids);
    const isContinueDisabled = selectedIds.size === 0;

    function toggleDevice(id: number) {
      const updated = new Set(selectedIds);
      if (updated.has(id)) {
        updated.delete(id);
      } else {
        updated.add(id);
      }
      setStepValidationError(null);
      onStepComplete({ digital_media_type_ids: [...updated] });
    }

    function handleContinue() {
      if (selectedIds.size === 0) {
        setStepValidationError(t("digitalMediaTypeStep.validationError"));
        return;
      }
      onStepComplete({
        digital_media_type_ids: [...selectedIds],
        _advance: true,
      } as any);
    }

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {filteredTypes.map((type) => {
            const isSelected = selectedIds.has(type.digital_media_type_id);
            const { icon: IconComponent, chipClass } =
              getDigitalMediaTypeVisual(type.code);

            return (
              <button
                key={type.digital_media_type_id}
                type="button"
                onClick={() => toggleDevice(type.digital_media_type_id)}
                className={`flex flex-col items-start gap-2 rounded-xl border-2 p-3 text-left transition-all ${
                  isSelected
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-500/15"
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"
                }`}
              >
                <div className="relative">
                  <span
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ring-1 ${isSelected ? "bg-blue-100 text-blue-600 ring-blue-200" : chipClass}`}
                  >
                    <IconComponent className="h-4 w-4" />
                  </span>
                  {isSelected && (
                    <Check className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-blue-500 text-white p-px" />
                  )}
                </div>
                <span
                  className={`text-sm font-medium leading-snug ${
                    isSelected ? "text-blue-700 dark:text-blue-300" : "text-slate-700 dark:text-slate-300"
                  }`}
                >
                  {getLocalizedName(type, locale)}
                </span>
              </button>
            );
          })}
        </div>
        {stepValidationError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {stepValidationError}
          </p>
        )}
        <button
          type="button"
          onClick={handleContinue}
          disabled={isContinueDisabled}
          className={`w-full rounded-lg py-2.5 text-sm font-medium transition-colors ${
            isContinueDisabled
              ? "cursor-not-allowed bg-slate-300 dark:bg-slate-600 text-slate-500 dark:text-slate-400"
              : "bg-slate-800 text-white hover:bg-slate-700"
          }`}
        >
          {t("continueButton")}
        </button>
      </div>
    );
  }

  // Location/transport visuals keyed by the language-neutral `code` column
  // (verified against the current data to reproduce the previous name-matching
  // logic exactly — see codes 29 and 0, which fall through to the DEFAULT bucket)
  const LOCATION_MAPPING_BY_CODE: Record<
    string,
    {
      icon: LucideIcon;
      secondaryIcon?: LucideIcon;
      category: string;
      chipClass: string;
    }
  > = {
    "10": {
      icon: MapPin,
      category: "orte",
      chipClass: "bg-slate-100 text-slate-500 ring-slate-200",
    }, // Nicht spezifizierter Ort (keine Reise)
    "11": {
      icon: Home,
      category: "orte",
      chipClass: "bg-blue-50 text-blue-600 ring-blue-100",
    }, // Zuhause
    "12": {
      icon: Hotel,
      category: "orte",
      chipClass: "bg-cyan-50 text-cyan-600 ring-cyan-100",
    }, // Wochenendhaus oder Ferienwohnung
    "13": {
      icon: Briefcase,
      category: "orte",
      chipClass: "bg-amber-50 text-amber-600 ring-amber-100",
    }, // Arbeitsplatz
    "14": {
      icon: Home,
      secondaryIcon: UserRound,
      category: "orte",
      chipClass: "bg-violet-50 text-violet-600 ring-violet-100",
    }, // Zuhause anderer Personen
    "15": {
      icon: UtensilsCrossed,
      category: "orte",
      chipClass: "bg-rose-50 text-rose-600 ring-rose-100",
    }, // Restaurant, Café oder Bar
    "16": {
      icon: ShoppingBag,
      category: "orte",
      chipClass: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    }, // Einkaufszentrum, Markt oder andere Geschäfte
    "17": {
      icon: Hotel,
      category: "orte",
      chipClass: "bg-sky-50 text-sky-600 ring-sky-100",
    }, // Hotel, Pension oder Campingplatz
    "18": {
      icon: GraduationCap,
      category: "orte",
      chipClass: "bg-indigo-50 text-indigo-600 ring-indigo-100",
    }, // Schule/Universität
    "19": {
      icon: MapPin,
      category: "orte",
      chipClass: "bg-slate-100 text-slate-500 ring-slate-200",
    }, // Anderer spezifizierter Ort (keine Reise) — hidden from the picker, see renderLocationStep
    "20": {
      icon: MapPin,
      category: "privateVerkehrsmittel",
      chipClass: "bg-slate-100 text-slate-500 ring-slate-200",
    }, // Nicht spezifizierter Transportmodus
    "21": {
      icon: Footprints,
      category: "privateVerkehrsmittel",
      chipClass: "bg-green-50 text-green-600 ring-green-100",
    }, // Zu Fuss
    "22": {
      icon: Bike,
      category: "privateVerkehrsmittel",
      chipClass: "bg-lime-50 text-lime-600 ring-lime-100",
    }, // Fahrrad
    "23": {
      icon: Gauge,
      category: "privateVerkehrsmittel",
      chipClass: "bg-orange-50 text-orange-600 ring-orange-100",
    }, // Moped, Motorrad oder Motorboot
    "24": {
      icon: Car,
      category: "privateVerkehrsmittel",
      chipClass: "bg-blue-50 text-blue-600 ring-blue-100",
    }, // Pkw / Auto
    "31": {
      icon: Bus,
      category: "oeffentlicherVerkehr",
      chipClass: "bg-teal-50 text-teal-600 ring-teal-100",
    }, // Öffentlicher Verkehr
  };

  const DEFAULT_LOCATION_MAPPING = {
    icon: MapPin,
    category: "sonstiges",
    chipClass: "bg-slate-100 text-slate-500 ring-slate-200",
  };

  // Helper: map a location_transport `code` to its icon/category/style
  function getLocationMappings(code: string): {
    icon: LucideIcon;
    secondaryIcon?: LucideIcon;
    category: string;
    chipClass: string;
  } {
    return LOCATION_MAPPING_BY_CODE[code] ?? DEFAULT_LOCATION_MAPPING;
  }

  function getLocationCategory(code: string): string {
    return getLocationMappings(code).category;
  }

  // Step 5: where was the user? (categorized with icons)
  function renderLocationStep() {
    // Group locations by category
    const grouped = new Map<string, typeof lookupData.locationTransports>();
    const categoryLabels: Record<string, string> = {
      orte: t("locationCategories.orte"),
      privateVerkehrsmittel: t("locationCategories.privateVerkehrsmittel"),
      oeffentlicherVerkehr: t("locationCategories.oeffentlicherVerkehr"),
      sonstiges: t("locationCategories.sonstiges"),
    };
    const categoryOrder = [
      "orte",
      "privateVerkehrsmittel",
      "oeffentlicherVerkehr",
      "sonstiges",
    ];

    for (const loc of lookupData.locationTransports) {
      // Hide "Anderer spezifizierter Ort (keine Reise)" on request
      if (loc.code === "19") {
        continue;
      }
      const cat = getLocationCategory(loc.code);
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push(loc);
    }

    return (
      <div className="space-y-3">
        {categoryOrder.map((category) => {
          const items = grouped.get(category);
          if (!items || items.length === 0) return null;

          return (
            <div
              key={category}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/60 p-3"
            >
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {categoryLabels[category]}
              </h4>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {items.map((loc) => {
                  const isSelected =
                    pendingEntry.location_transport_id ===
                    loc.location_transport_id;
                  const {
                    icon: IconComponent,
                    secondaryIcon: SecondaryIcon,
                    chipClass,
                  } = getLocationMappings(loc.code);

                  return (
                    <button
                      key={loc.location_transport_id}
                      type="button"
                      onClick={() =>
                        onStepComplete({
                          location_transport_id: loc.location_transport_id,
                        })
                      }
                      className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-all ${
                        isSelected
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-500/15"
                          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"
                      }`}
                    >
                      <div
                        className={`relative shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg ring-1 ${chipClass}`}
                      >
                        <IconComponent className="h-[18px] w-[18px]" />
                        {SecondaryIcon && (
                          <SecondaryIcon className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-white dark:bg-slate-800" />
                        )}
                      </div>
                      <span className="text-xs font-medium leading-snug text-slate-700 dark:text-slate-300">
                        {getLocalizedName(loc, locale)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Social-context visuals keyed by `code` (verified against current data —
  // codes 3/4/5 land on the "Home" household bucket, not the "child" one the
  // German name might suggest, because "Haushaltsmitglied" matches first)
  const SOCIAL_CONTEXT_VISUAL_BY_CODE: Record<
    string,
    { icon: LucideIcon; chipClass: string }
  > = {
    "1": { icon: UserX, chipClass: "bg-slate-100 text-slate-500 ring-slate-200" }, // Alleine
    "2": { icon: Heart, chipClass: "bg-amber-50 text-amber-600 ring-amber-100" }, // Partner / Ehepartner
    "3": { icon: Home, chipClass: "bg-amber-50 text-amber-600 ring-amber-100" }, // Eltern
    "4": { icon: Home, chipClass: "bg-amber-50 text-amber-600 ring-amber-100" }, // Haushaltsmitglied bis 9 Jahre
    "5": { icon: Home, chipClass: "bg-amber-50 text-amber-600 ring-amber-100" }, // Andere Haushaltsmitglieder
    "6": {
      icon: UserCheck,
      chipClass: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    }, // Andere bekannte Personen
  };

  const DEFAULT_SOCIAL_CONTEXT_VISUAL = {
    icon: Users,
    chipClass: "bg-slate-100 text-slate-500 ring-slate-200",
  };

  // Helper: map a social_context `code` to icon + color
  function getSocialContextVisual(code: string): {
    icon: LucideIcon;
    chipClass: string;
  } {
    return SOCIAL_CONTEXT_VISUAL_BY_CODE[code] ?? DEFAULT_SOCIAL_CONTEXT_VISUAL;
  }

  // Step 6: who was the user with? (multiple choice — needs explicit confirm)
  function renderSocialContextStep() {
    const selectedIds = new Set(pendingEntry.social_context_ids);
    const isContinueDisabled = selectedIds.size === 0;

    // Toggle a social context id in the pending selection
    function toggleSocialContext(id: number) {
      const updated = new Set(selectedIds);
      if (updated.has(id)) {
        updated.delete(id);
      } else {
        updated.add(id);
      }
      setStepValidationError(null);
      // Update pendingEntry directly without advancing step
      onStepComplete({ social_context_ids: [...updated] });
    }

    function handleContinue() {
      if (selectedIds.size === 0) {
        setStepValidationError(t("socialContextStep.validationError"));
        return;
      }
      onStepComplete({
        social_context_ids: [...selectedIds],
        _advance: true,
      } as any);
    }

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {lookupData.socialContexts.map((ctx) => {
            const isSelected = selectedIds.has(ctx.social_context_id);
            const { icon: IconComponent, chipClass } = getSocialContextVisual(
              ctx.code,
            );
            return (
              <button
                key={ctx.social_context_id}
                type="button"
                onClick={() => toggleSocialContext(ctx.social_context_id)}
                className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-all ${
                  isSelected
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-500/15"
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"
                }`}
              >
                <div
                  className={`relative shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg ring-1 ${isSelected ? "bg-blue-100 text-blue-600 ring-blue-200" : chipClass}`}
                >
                  <IconComponent className="h-[18px] w-[18px]" />
                  {isSelected && (
                    <Check className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-blue-500 text-white p-px" />
                  )}
                </div>
                <span className="text-xs font-medium leading-snug text-slate-700 dark:text-slate-300">
                  {getLocalizedName(ctx, locale)}
                </span>
              </button>
            );
          })}
        </div>

        {stepValidationError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {stepValidationError}
          </p>
        )}

        {/* Confirm multi-selection and advance to next step */}
        {/* _advance flag tells the parent this is a step transition, not a toggle update */}
        <button
          type="button"
          onClick={handleContinue}
          disabled={isContinueDisabled}
          className={`w-full rounded-lg py-2.5 text-sm font-medium transition-colors ${
            isContinueDisabled
              ? "cursor-not-allowed bg-slate-300 dark:bg-slate-600 text-slate-500 dark:text-slate-400"
              : "bg-slate-800 text-white hover:bg-slate-700"
          }`}
        >
          {t("continueButton")}
        </button>
      </div>
    );
  }

  // Satisfaction scale keyed by `code`: 1=sehr gut … 5=sehr schlecht
  const SATISFACTION_EMOJI_BY_CODE: Record<string, string> = {
    "1": "😄",
    "2": "🙂",
    "3": "😐",
    "4": "😟",
    "5": "😢",
  };

  const SATISFACTION_SORT_RANK_BY_CODE: Record<string, number> = {
    "1": 4,
    "2": 3,
    "3": 2,
    "4": 1,
    "5": 0,
  };

  // Helper: map a satisfaction `code` to emoji
  function getSmileyForSatisfaction(code: string): string {
    return SATISFACTION_EMOJI_BY_CODE[code] ?? "😐";
  }

  // Returns a sort rank for a satisfaction `code`: sehr schlecht=0 … sehr gut=4
  function getSatisfactionSortRank(code: string): number {
    return SATISFACTION_SORT_RANK_BY_CODE[code] ?? 2;
  }

  // Meaningfulness/Stressfulness scales are keyed ascending low→high
  // (1=very low … 5=very high) — unlike satisfaction, no rank remapping needed.
  const MEANINGFULNESS_EMOJI_BY_CODE: Record<string, string> = {
    "1": "🍂",
    "2": "🌱",
    "3": "🌿",
    "4": "🌳",
    "5": "🌻",
  };

  const STRESSFULNESS_EMOJI_BY_CODE: Record<string, string> = {
    "1": "😌",
    "2": "🙂",
    "3": "😐",
    "4": "😰",
    "5": "🤯",
  };

  // Generic emoji grid, shared by the satisfaction/meaningfulness/stressfulness
  // rating groups on the final step
  function renderRatingGrid<T extends { code: string; name: string; name_en: string }>(
    options: T[],
    selectedId: number | null,
    getId: (option: T) => number,
    emojiByCode: Record<string, string>,
    onSelect: (id: number) => void,
  ) {
    return (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3">
        {options.map((option) => {
          const id = getId(option);
          const isSelected = selectedId === id;
          const emoji = emojiByCode[option.code] ?? "🙂";
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              className={`
                flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-3 transition-all
                ${
                  isSelected
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-500/15"
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"
                }
              `}
            >
              <div className="text-4xl">{emoji}</div>
              <div className="text-center text-xs font-semibold text-slate-700 dark:text-slate-300">
                {getLocalizedName(option, locale)}
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  // Step 7 (final): how did the user feel? (emoji grid with labels below)
  // When askExtraRatings is on for the course, two more rating groups
  // (Stressfulness, then Meaningfulness) render on the same screen, and a "Save"
  // button finalizes — taps become non-advancing selections in that case
  // (see page.tsx's handleStepComplete: isIntermediateUpdate now also covers
  // the satisfaction step while askExtraRatings is true). When the flag is
  // off (the default), this behaves exactly as before: a single tap saves
  // immediately, no extra groups or button render at all.
  function renderSatisfactionStep() {
    const sortedSatisfactions = [...lookupData.satisfactions].sort(
      (a, b) =>
        getSatisfactionSortRank(a.code) - getSatisfactionSortRank(b.code),
    );
    const sortedMeaningfulness = [...lookupData.meaningfulnesses].sort(
      (a, b) => Number(a.code) - Number(b.code),
    );
    const sortedStressfulness = [...lookupData.stressfulnesses].sort(
      (a, b) => Number(a.code) - Number(b.code),
    );

    if (!askExtraRatings) {
      return renderRatingGrid(
        sortedSatisfactions,
        pendingEntry.satisfaction_id,
        (sat) => sat.satisfaction_id,
        SATISFACTION_EMOJI_BY_CODE,
        (id) => onStepComplete({ satisfaction_id: id }),
      );
    }

    const isReadyToSave =
      pendingEntry.satisfaction_id !== null &&
      pendingEntry.meaningfulness_id !== null &&
      pendingEntry.stressfulness_id !== null;

    return (
      <div className="space-y-5">
        {/* No inline label here: the step's outer heading (getStepQuestion)
            already shows the satisfaction question text above this grid */}
        <div>
          {renderRatingGrid(
            sortedSatisfactions,
            pendingEntry.satisfaction_id,
            (sat) => sat.satisfaction_id,
            SATISFACTION_EMOJI_BY_CODE,
            (id) => onStepComplete({ satisfaction_id: id }),
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            {t("questions.stressfulness")}
          </p>
          {renderRatingGrid(
            sortedStressfulness,
            pendingEntry.stressfulness_id,
            (s) => s.stressfulness_id,
            STRESSFULNESS_EMOJI_BY_CODE,
            (id) => onStepComplete({ stressfulness_id: id }),
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            {t("questions.meaningfulness")}
          </p>
          {renderRatingGrid(
            sortedMeaningfulness,
            pendingEntry.meaningfulness_id,
            (m) => m.meaningfulness_id,
            MEANINGFULNESS_EMOJI_BY_CODE,
            (id) => onStepComplete({ meaningfulness_id: id }),
          )}
        </div>

        <button
          type="button"
          onClick={() => onStepComplete({ _advance: true } as any)}
          disabled={!isReadyToSave}
          className={`w-full rounded-lg py-2.5 text-sm font-medium transition-colors ${
            !isReadyToSave
              ? "cursor-not-allowed bg-slate-300 dark:bg-slate-600 text-slate-500 dark:text-slate-400"
              : "bg-slate-800 text-white hover:bg-slate-700"
          }`}
        >
          {t("continueButton")}
        </button>
      </div>
    );
  }

  // Render the correct step content
  function renderStepContent() {
    switch (step) {
      case "primary_activity":
        return renderPrimaryActivityStep();
      case "secondary_activity":
        return renderSecondaryActivityStep();
      case "digital_media":
        return renderDigitalMediaStep();
      case "digital_media_type":
        return renderDigitalMediaTypeStep();
      case "location_transport":
        return renderLocationStep();
      case "social_context":
        return renderSocialContextStep();
      case "satisfaction":
        return renderSatisfactionStep();
    }
  }

  const stepMeta = getStepMeta(step, t);
  const slotsRange = formatSlotsRange(selectedSlots, t);
  const isFirstStep = step === "primary_activity";
  const isSecondaryStep = step === "secondary_activity";

  const containerRef = useRef<HTMLDivElement>(null);
  const forceEditorOpenRef = useRef(false);

  function openEditor(groupSlots?: string[]) {
    if (groupSlots) {
      forceEditorOpenRef.current = true;
      onReselectSlots(groupSlots);
    }
    setIsEditorVisible(true);
    setTimeout(() => {
      containerRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden"
    >
      {/* Header: time range badge + step progress inline */}
      <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-700 px-4 py-3">
        <div className="flex shrink-0 items-center gap-2.5 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/20 px-3 py-1.5 ring-1 ring-blue-100 dark:ring-blue-800/40">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm dark:bg-blue-500">
            <Clock3 className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold tabular-nums text-blue-900 dark:text-blue-100">
              {slotsRange.time}
            </p>
            <p className="text-[11px] font-medium text-blue-600/80 dark:text-blue-300/80">
              {slotsRange.meta}
            </p>
          </div>
        </div>

        {isEditorVisible && (
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                {stepMeta.label}
              </span>
              <span className="shrink-0 text-xs font-medium tabular-nums text-slate-400">
                {stepMeta.index}/{stepMeta.total}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {Array.from({ length: stepMeta.total }, (_, i) => {
                const done = i < stepMeta.index - 1;
                const active = i === stepMeta.index - 1;
                return (
                  <div
                    key={i}
                    className={`flex-1 rounded-full transition-all duration-300 ${
                      active
                        ? "h-2 bg-gradient-to-r from-blue-500 to-indigo-500 shadow-sm shadow-blue-500/30"
                        : done
                          ? "h-1.5 bg-blue-500 dark:bg-blue-400"
                          : "h-1.5 bg-slate-200 dark:bg-slate-600"
                    }`}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Back button — only shown when editor is open and not on first step.
          The secondary step shows it inline next to its search field instead. */}
      {isEditorVisible && !isFirstStep && !isSecondaryStep && (
        <div className="px-4 pt-2 pb-1 flex">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-2.5 py-1 text-xs text-slate-500 dark:text-slate-400 shadow-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-600"
            title={t("backButton")}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-3 w-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
            {t("backButton")}
          </button>
        </div>
      )}

      {/* Selection overview: time-led list only */}
      {hasAnyExistingEntryInSelection && !isEditorVisible && (
        <div className="mx-4 mb-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 p-3">
          <div className="hidden">
            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 xl:col-span-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {t("overview.timeLabel")}
              </p>
              <div className="mt-1.5 flex max-h-36 flex-wrap gap-1.5 overflow-auto pr-1">
                {mergedSlotRanges.length > 0 ? (
                  mergedSlotRanges.map((range) => (
                    <span
                      key={range}
                      className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300 ring-1 ring-blue-100 dark:ring-blue-800/30"
                    >
                      <Clock3 className="h-3.5 w-3.5" />
                      {range}
                    </span>
                  ))
                ) : (
                  <p className="text-xs text-slate-400">{t("overview.noTimeSlots")}</p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 xl:col-span-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {t("overview.categoryLabel")}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {primaryCategory && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100">
                    <BookOpen className="h-3.5 w-3.5" />
                    {t("overview.mainCategory", { name: getLocalizedName(primaryCategory, locale) })}
                  </span>
                )}
                {activeBrowsingCategory && !primaryCategory && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-sky-100">
                    <BookOpen className="h-3.5 w-3.5" />
                    {t("overview.selectedCategory", { name: activeBrowsingCategory.name })}
                  </span>
                )}
                {primaryActivity && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100">
                    <Briefcase className="h-3.5 w-3.5" />
                    {t("overview.mainActivity", { name: getLocalizedName(primaryActivity, locale) })}
                  </span>
                )}
                {secondaryCategory && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700 ring-1 ring-teal-100">
                    <BookOpen className="h-3.5 w-3.5" />
                    {t("overview.secondaryCategory", { name: getLocalizedName(secondaryCategory, locale) })}
                  </span>
                )}
                {secondaryActivity && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700 ring-1 ring-teal-100">
                    <Briefcase className="h-3.5 w-3.5" />
                    {t("overview.secondaryActivity", { name: getLocalizedName(secondaryActivity, locale) })}
                  </span>
                )}
                {!primaryCategory &&
                  !primaryActivity &&
                  !secondaryCategory &&
                  !secondaryActivity && (
                    <p className="text-xs text-slate-400">
                      {t("overview.nothingSelected")}
                    </p>
                  )}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 xl:col-span-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {t("overview.contextLabel")}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {locationName && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-100">
                    <MapPin className="h-3.5 w-3.5" />
                    {t("overview.locationTransport", { name: locationName })}
                  </span>
                )}
                {socialContextNames.map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-100"
                  >
                    <Users className="h-3.5 w-3.5" />
                    {t("overview.social", { name })}
                  </span>
                ))}
                {!locationName && socialContextNames.length === 0 && (
                  <p className="text-xs text-slate-400">
                    {t("overview.nothingSelected")}
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 xl:col-span-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {t("overview.mediaLabel")}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {digitalMediaTypeNames.map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1.5 rounded-md bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-100"
                  >
                    <Smartphone className="h-3.5 w-3.5" />
                    {name}
                  </span>
                ))}
                {digitalMediaTypeNames.length === 0 && (
                  <p className="text-xs text-slate-400">
                    {t("overview.nothingSelected")}
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 xl:col-span-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {t("overview.moodLabel")}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {satisfactionName ? (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-rose-100">
                    <Heart className="h-3.5 w-3.5" />
                    {satisfactionName}
                  </span>
                ) : (
                  <p className="text-xs text-slate-400">
                    {t("overview.nothingSelected")}
                  </p>
                )}
              </div>
            </div>
          </div>

          {selectedSlotGroups.length > 0 && (
            <div className="mt-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2">
              <p className="hidden text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {t("overview.timeOrderedListing")}
              </p>
              <div className="mt-2 space-y-1.5">
                {selectedSlotGroups.map((group, index) => {
                  const timeRange = `${minutesToSlot(group.start)} - ${minutesToSlot(group.endExclusive)}`;

                  if (!group.entry) {
                    return (
                      <div
                        key={`${group.start}-${group.endExclusive}-${index}`}
                        className="flex items-center gap-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2 py-1.5"
                      >
                        <span className="shrink-0 text-xs font-semibold text-slate-700 dark:text-slate-200">
                          {timeRange}
                        </span>
                        <span className="flex-1 text-xs text-slate-400">
                          {t("overview.noEntry")}
                        </span>
                        <button
                          type="button"
                          title={t("overview.addEntryTitle")}
                          onClick={() => {
                            const groupSlots: string[] = [];
                            for (
                              let m = group.start;
                              m < group.endExclusive;
                              m += 10
                            ) {
                              groupSlots.push(minutesToSlot(m));
                            }
                            openEditor(groupSlots);
                          }}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-300 bg-blue-50 text-blue-700 shadow-sm transition-colors hover:bg-blue-100"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  }

                  const rowPrimaryCategory = findCategoryForActivity(
                    lookupData,
                    group.entry.primary_activity_id,
                  );
                  const rowPrimaryActivity = findActivityById(
                    lookupData,
                    group.entry.primary_activity_id,
                  );
                  const rowSecondaryActivity = findActivityById(
                    lookupData,
                    group.entry.secondary_activity_id,
                  );
                  const rowSecondaryCategory = findCategoryForActivity(
                    lookupData,
                    group.entry.secondary_activity_id,
                  );
                  const rowLocationName = findNameById(
                    lookupData.locationTransports,
                    "location_transport_id",
                    group.entry.location_transport_id,
                    locale,
                  );
                  const rowLocationCode = findCodeById(
                    lookupData.locationTransports,
                    "location_transport_id",
                    group.entry.location_transport_id,
                  );
                  const rowSatisfaction = findNameById(
                    lookupData.satisfactions,
                    "satisfaction_id",
                    group.entry.satisfaction_id,
                    locale,
                  );
                  const rowSatisfactionCode = findCodeById(
                    lookupData.satisfactions,
                    "satisfaction_id",
                    group.entry.satisfaction_id,
                  );
                  const rowMediaItems = lookupData.digitalMediaTypes
                    .filter((item) =>
                      group.entry?.digital_media_type_ids.includes(
                        item.digital_media_type_id,
                      ),
                    )
                    .map((item) => ({
                      name: getLocalizedName(item, locale),
                      ...getDigitalMediaTypeVisual(item.code),
                    }));
                  const rowSocialItems = lookupData.socialContexts
                    .filter((sc) =>
                      group.entry?.social_context_ids.includes(
                        sc.social_context_id,
                      ),
                    )
                    .map((sc) => ({
                      name: getLocalizedName(sc, locale),
                      ...getSocialContextVisual(sc.code),
                    }));

                  // Primary category: index → color + visual icons
                  const rowPriCatIdx = rowPrimaryCategory
                    ? lookupData.categories.findIndex(
                        (c) => c.category_id === rowPrimaryCategory.category_id,
                      )
                    : -1;
                  const rowPriVisual = rowPrimaryCategory
                    ? getCategoryVisual(rowPrimaryCategory.code, rowPriCatIdx)
                    : null;
                  const rowPriColor =
                    rowPriCatIdx >= 0
                      ? CATEGORY_COLORS[rowPriCatIdx % CATEGORY_COLORS.length]
                      : "#94A3B8";
                  const RowPriCatIcon = rowPriVisual?.primaryIcon ?? null;
                  const RowPriActIcon = rowPriVisual?.secondaryIcon ?? null;

                  // Secondary activity category
                  const rowSecCatIdx = rowSecondaryCategory
                    ? lookupData.categories.findIndex(
                        (c) =>
                          c.category_id === rowSecondaryCategory.category_id,
                      )
                    : -1;
                  const rowSecVisual = rowSecondaryCategory
                    ? getCategoryVisual(rowSecondaryCategory.code, rowSecCatIdx)
                    : null;
                  const rowSecColor =
                    rowSecCatIdx >= 0
                      ? CATEGORY_COLORS[rowSecCatIdx % CATEGORY_COLORS.length]
                      : "#94A3B8";
                  const RowSecActIcon = rowSecVisual?.primaryIcon ?? null;

                  // Location
                  const rowLocVisual = rowLocationCode
                    ? getLocationMappings(rowLocationCode)
                    : null;
                  const RowLocIcon = rowLocVisual?.icon ?? null;

                  // Satisfaction emoji
                  const rowSatisfactionEmoji = rowSatisfactionCode
                    ? getSmileyForSatisfaction(rowSatisfactionCode)
                    : null;

                  return (
                    <div
                      key={`${group.start}-${group.endExclusive}-${index}`}
                      className="flex items-center gap-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2 py-1.5"
                    >
                      <span className="shrink-0 text-xs font-semibold text-slate-700">
                        {timeRange}
                      </span>
                      <div className="flex flex-1 flex-wrap gap-1.5">
                        {rowPrimaryActivity && RowPriActIcon && (
                          <span
                            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold"
                            style={{
                              backgroundColor: `${rowPriColor}1a`,
                              color: rowPriColor,
                              border: `1px solid ${rowPriColor}40`,
                            }}
                          >
                            <RowPriActIcon className="h-3.5 w-3.5" />
                            {getLocalizedName(rowPrimaryActivity, locale)}
                          </span>
                        )}
                        {rowSecondaryActivity && RowSecActIcon && (
                          <span
                            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium"
                            style={{
                              backgroundColor: `${rowSecColor}1a`,
                              color: rowSecColor,
                              border: `1px solid ${rowSecColor}40`,
                            }}
                          >
                            <RowSecActIcon className="h-3.5 w-3.5" />
                            {getLocalizedName(rowSecondaryActivity, locale)}
                          </span>
                        )}
                        {rowLocationName && RowLocIcon && (
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ${rowLocVisual!.chipClass}`}
                          >
                            <RowLocIcon className="h-3.5 w-3.5" />
                            {rowLocationName}
                          </span>
                        )}
                        {rowSocialItems.map(({ name, icon: SocIcon }) => (
                          <span
                            key={name}
                            className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600 ring-1 ring-amber-100"
                          >
                            <SocIcon className="h-3.5 w-3.5" />
                            {name}
                          </span>
                        ))}
                        {rowMediaItems.map(({ name, icon: MediaIcon }) => (
                          <span
                            key={name}
                            className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-100"
                          >
                            <MediaIcon className="h-3.5 w-3.5" />
                            {name}
                          </span>
                        ))}
                        {rowSatisfaction && rowSatisfactionEmoji && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-rose-100">
                            <span className="text-sm leading-none">
                              {rowSatisfactionEmoji}
                            </span>
                            {rowSatisfaction}
                          </span>
                        )}
                      </div>
                      {/* Row actions: edit + delete */}
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          title={t("overview.editTitle")}
                          onClick={() => {
                            const groupSlots: string[] = [];
                            for (
                              let m = group.start;
                              m < group.endExclusive;
                              m += 10
                            ) {
                              groupSlots.push(minutesToSlot(m));
                            }
                            openEditor(groupSlots);
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 shadow-sm transition-colors hover:bg-slate-100 dark:hover:bg-slate-600"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title={t("overview.deleteTitle")}
                          onClick={() => {
                            const groupSlots: string[] = [];
                            for (
                              let m = group.start;
                              m < group.endExclusive;
                              m += 10
                            ) {
                              groupSlots.push(minutesToSlot(m));
                            }
                            void onDeleteSlots(groupSlots);
                          }}
                          disabled={isDeletingSelection}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-300 bg-red-50 text-red-600 shadow-sm transition-colors hover:bg-red-100 disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Back button for fresh (no existing entries) selection */}
      {!hasAnyExistingEntryInSelection && !isFirstStep && !isEditorVisible && (
        <div className="mx-4 mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 shadow-sm transition-colors hover:border-slate-400 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-600"
          >
            ← {t("backButton")}
          </button>
        </div>
      )}

      {/* Question + editor only shown on explicit edit action */}
      <div className={isEditorVisible ? "block" : "hidden"}>
        {/* Keyed by step so each new question fades in as a new screen */}
        <div key={step} className="step-in">
          {/* The secondary step's question lives in its banner instead */}
          {isSecondaryStep ? (
            <div className="pt-3" />
          ) : (
            <div className="px-4 pb-2 pt-3">
              <h3 className="text-base font-bold leading-snug text-slate-900 dark:text-slate-100">
                {getStepQuestion(step, t)}
              </h3>
            </div>
          )}

          {/* Step content (scrollable if needed) */}
          <div className="px-4 pb-4">{renderStepContent()}</div>
        </div>
      </div>
    </div>
  );
}
