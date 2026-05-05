"use client";

import { useEffect, useRef, useState } from "react";
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
  ChevronUp,
  Check,
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
  Palette,
  Pencil,
  Plus,
  Scissors,
  Search,
  Smartphone,
  Tablet,
  ShoppingBag,
  Sparkles,
  Timer,
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
};

// ─── Pure helper functions ────────────────────────────────────────────────────

// Builds the nested category → subcategory → activity hierarchy
// Filters by searchQuery if provided; hides empty branches
// excludeActivityId: optionally removes one activity from the list (used in
// the secondary activity step to prevent selecting the same as primary)
function buildActivityHierarchy(
  lookupData: LookupData,
  searchQuery: string,
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
            .filter((act) =>
              query ? act.name.toLowerCase().includes(query) : true,
            )
            .map((act) => ({ activity_id: act.activity_id, name: act.name }));

          return {
            subcategory_id: sub.subcategory_id,
            name: sub.name,
            activities,
          };
        })
        .filter((sub) => sub.activities.length > 0); // hide empty subcategories

      return {
        category_id: cat.category_id,
        name: cat.name,
        color,
        subcategories,
      };
    })
    .filter((cat) => cat.subcategories.length > 0); // hide empty categories
}

// Returns the German question text for each questionnaire step
function getStepQuestion(step: QuestionnaireStep): string {
  switch (step) {
    case "primary_activity":
      return "Welche Haupttätigkeit hast du ausgeführt?";
    case "secondary_activity":
      return "Hast du gleichzeitig eine Nebentätigkeit ausgeführt?";
    case "digital_media":
      return "Hast du ein Gerät genutzt? (Smartphone, Tablet, PC…)";
    case "digital_media_type":
      return "Welche Geräte hast du genutzt?";
    case "location_transport":
      return "Wo warst du während dieser Zeit?";
    case "social_context":
      return "War jemand anders mit dabei?";
    case "satisfaction":
      return "Wie hast du dich gefühlt?";
  }
}

// Returns label and step index (1-based) out of total for the step indicator
function getStepMeta(step: QuestionnaireStep): {
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
    primary_activity: "Haupttätigkeit",
    secondary_activity: "Nebentätigkeit",
    digital_media: "Gerät?",
    digital_media_type: "Geräteart",
    location_transport: "Ort",
    social_context: "Sozial",
    satisfaction: "Stimmung",
  };
  return {
    index: steps.indexOf(step) + 1,
    total: steps.length,
    label: labels[step],
  };
}

// Formats the selected slot range as a readable string: "08:00 – 09:30 (9 Felder)"
function formatSlotsRange(slots: Set<string>): string {
  if (slots.size === 0) return "";
  const sorted = [...slots].sort();
  const firstSlot = sorted[0];
  const lastSlot = sorted[sorted.length - 1];
  const [lh, lm] = lastSlot.split(":").map(Number);
  const endTotal = lh * 60 + lm + 10;
  const endStr = `${Math.floor(endTotal / 60)
    .toString()
    .padStart(2, "0")}:${(endTotal % 60).toString().padStart(2, "0")}`;
  return `${firstSlot} – ${endStr} · ${slots.size} Felder`;
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

function findNameById<T extends Record<string, unknown>>(
  rows: T[],
  idKey: keyof T,
  idValue: number | null,
): string | null {
  if (idValue === null) return null;
  const row = rows.find((item) => item[idKey] === idValue);
  if (!row) return null;
  return typeof row.name === "string" ? row.name : null;
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

function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss");
}

function getCategoryVisual(
  categoryName: string,
  index: number,
): CategoryVisual {
  const normalized = normalizeLabel(categoryName);

  if (normalized.includes("persoenliche pflege")) {
    return {
      primaryIcon: MoonStar,
      secondaryIcon: UtensilsCrossed,
      tertiaryIcon: HeartPulse,
    };
  }
  if (normalized.includes("erwerbstaetigkeit")) {
    return {
      primaryIcon: Briefcase,
      secondaryIcon: Laptop,
      tertiaryIcon: Clock3,
    };
  }
  if (normalized.includes("studium") || normalized.includes("ausbildung")) {
    return {
      primaryIcon: GraduationCap,
      secondaryIcon: BookOpen,
      tertiaryIcon: Pencil,
    };
  }
  if (
    normalized.includes("haushalt") ||
    normalized.includes("familienarbeit")
  ) {
    return { primaryIcon: Home, secondaryIcon: CookingPot, tertiaryIcon: Baby };
  }
  if (
    normalized.includes("freiwilligenarbeit") ||
    normalized.includes("treffen")
  ) {
    return {
      primaryIcon: HandHeart,
      secondaryIcon: Users,
      tertiaryIcon: Calendar,
    };
  }
  if (normalized.includes("soziales") || normalized.includes("unterhaltung")) {
    return {
      primaryIcon: MessageCircle,
      secondaryIcon: Music,
      tertiaryIcon: Film,
    };
  }
  if (normalized.includes("sport") || normalized.includes("im freien")) {
    return {
      primaryIcon: Dumbbell,
      secondaryIcon: TreePine,
      tertiaryIcon: Bike,
    };
  }
  if (normalized.includes("hobbys")) {
    return {
      primaryIcon: Palette,
      secondaryIcon: Gamepad2,
      tertiaryIcon: Scissors,
    };
  }
  if (normalized.includes("massenmedien")) {
    return {
      primaryIcon: Tv,
      secondaryIcon: Newspaper,
      tertiaryIcon: Headphones,
    };
  }
  if (
    normalized.includes("wegezeiten") ||
    normalized.includes("nicht spezifizierte")
  ) {
    return { primaryIcon: Bus, secondaryIcon: MapPin, tertiaryIcon: Timer };
  }

  const defaultVisuals: CategoryVisual[] = [
    { primaryIcon: BookOpen, secondaryIcon: Laptop, tertiaryIcon: Pencil },
    { primaryIcon: Briefcase, secondaryIcon: Wrench, tertiaryIcon: Clock3 },
    { primaryIcon: Home, secondaryIcon: ShoppingBag, tertiaryIcon: CookingPot },
    { primaryIcon: Users, secondaryIcon: HeartPulse, tertiaryIcon: Music },
    { primaryIcon: TreePine, secondaryIcon: Sparkles, tertiaryIcon: Bike },
  ];

  return defaultVisuals[index % defaultVisuals.length];
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
}) {
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

      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
        <div className="flex items-center gap-2">
          {!isSearching && activeCategory && (
            <button
              type="button"
              onClick={() => onActiveCategoryChange(null)}
              className="flex shrink-0 flex-col items-center gap-0.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm transition-colors hover:border-slate-400 hover:text-slate-800"
            >
              <span>←</span>
              <span className="text-[10px] font-normal text-slate-400 leading-none">
                Kategorien
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
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
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
            Keine Tätigkeiten gefunden.
          </p>
        )}

        {!isSearching && !activeCategory && hierarchy.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {hierarchy.map((category, index) => {
              const visual = getCategoryVisual(category.name, index);
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
                  onClick={() => onActiveCategoryChange(category.category_id)}
                  className={`group overflow-hidden rounded-2xl bg-white text-left shadow-sm transition-all hover:shadow-md ${
                    isSelectedCategory
                      ? "border-2"
                      : "border border-slate-200 hover:border-slate-300"
                  }`}
                  style={
                    isSelectedCategory
                      ? { borderColor: category.color }
                      : undefined
                  }
                >
                  <div
                    className="h-1.5 w-full shrink-0"
                    style={{ backgroundColor: category.color }}
                  />
                  <div
                    className="flex flex-col gap-3 p-3"
                    style={{
                      background: `linear-gradient(160deg, ${category.color}14 0%, rgba(255,255,255,1) 60%)`,
                    }}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <h4 className="text-sm font-semibold leading-snug text-slate-900">
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
                    <div className="flex items-center gap-1.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/80 text-slate-500 ring-1 ring-slate-200">
                        <PrimaryIcon className="h-4 w-4" />
                      </div>
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/80 text-slate-500 ring-1 ring-slate-200">
                        <SecondaryIcon className="h-4 w-4" />
                      </div>
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/80 text-slate-500 ring-1 ring-slate-200">
                        <TertiaryIcon className="h-4 w-4" />
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
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
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
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
                      {countActivities(category.subcategories)} Treffer
                    </span>
                  </div>
                )}

                <div className="space-y-2">
                  {category.subcategories.map((subcategory) => (
                    <div
                      key={subcategory.subcategory_id}
                      className="rounded-xl border p-3"
                      style={{
                        borderColor: `${category.color}30`,
                        backgroundColor: `${category.color}07`,
                      }}
                    >
                      <p
                        className="mb-2 text-xs font-semibold uppercase tracking-wide"
                        style={{ color: `${category.color}99` }}
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
                              className={`rounded-2xl border px-4 py-3 text-sm font-medium leading-snug transition-all ${
                                isSelected
                                  ? "border-transparent text-white shadow-sm"
                                  : "border-white text-slate-700 hover:opacity-80"
                              }`}
                              style={
                                isSelected
                                  ? { backgroundColor: category.color }
                                  : {
                                      backgroundColor: `${category.color}15`,
                                      color: category.color,
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
}: ActivitySelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
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
  }, [step]);

  useEffect(() => {
    if (searchQuery.trim().length > 0) {
      setActiveCategoryId(null);
    }
  }, [searchQuery]);

  const hierarchy = buildActivityHierarchy(lookupData, searchQuery);
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
  );
  const satisfactionName = findNameById(
    lookupData.satisfactions,
    "satisfaction_id",
    pendingEntry.satisfaction_id,
  );

  const socialContextNames = lookupData.socialContexts
    .filter((item) =>
      pendingEntry.social_context_ids.includes(item.social_context_id),
    )
    .map((item) => item.name);

  const digitalMediaTypeNames = lookupData.digitalMediaTypes
    .filter((item) =>
      pendingEntry.digital_media_type_ids.includes(item.digital_media_type_id),
    )
    .map((item) => item.name);

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
        searchPlaceholder="Haupttätigkeit oder Stichwort suchen..."
      />
    );
  }

  // Step 2: select an optional secondary activity
  // Includes a "Keine Nebentätigkeit" button at the top
  // The primary activity is excluded from the list to prevent check constraint violations
  function renderSecondaryActivityStep() {
    const hierarchyWithoutPrimary = buildActivityHierarchy(
      lookupData,
      searchQuery,
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
        searchPlaceholder="Nebentätigkeit oder Stichwort suchen..."
        topSlot={
          <button
            type="button"
            onClick={() => onStepComplete({ secondary_activity_id: null })}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            Keine Nebentätigkeit → Weiter
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
          { label: "Ja", value: true, icon: "📱" },
          { label: "Nein", value: false, icon: "🚫" },
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
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
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

  // Step 4 (conditional): which type of device was used?
  function getDigitalMediaTypeVisual(typeName: string): {
    icon: LucideIcon;
    chipClass: string;
  } {
    const normalized = normalizeLabel(typeName);

    if (normalized.includes("smartphone")) {
      return {
        icon: Smartphone,
        chipClass: "bg-cyan-50 text-cyan-700 ring-cyan-100",
      };
    }
    if (normalized.includes("computer") || normalized.includes("laptop")) {
      return {
        icon: Laptop,
        chipClass: "bg-indigo-50 text-indigo-700 ring-indigo-100",
      };
    }
    if (normalized.includes("tablet")) {
      return {
        icon: Tablet,
        chipClass: "bg-violet-50 text-violet-700 ring-violet-100",
      };
    }
    if (normalized.includes("tv") || normalized.includes("streaming")) {
      return {
        icon: Tv,
        chipClass: "bg-orange-50 text-orange-700 ring-orange-100",
      };
    }
    if (normalized.includes("spielkonsole") || normalized.includes("konsole")) {
      return {
        icon: Gamepad2,
        chipClass: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-100",
      };
    }
    if (normalized.includes("smartwatch") || normalized.includes("wearable")) {
      return {
        icon: Watch,
        chipClass: "bg-emerald-50 text-emerald-700 ring-emerald-100",
      };
    }

    return {
      icon: HelpCircle,
      chipClass: "bg-slate-100 text-slate-700 ring-slate-200",
    };
  }

  function renderDigitalMediaTypeStep() {
    const filteredTypes = lookupData.digitalMediaTypes.filter((type) => {
      const normalized = normalizeLabel(type.name);
      // "Kein IT-Hilfsmittel" is redundant because previous step already asks this.
      return !normalized.includes("kein it") && !normalized.includes("ohne it");
    });

    const selectedIds = new Set(pendingEntry.digital_media_type_ids);

    function toggleDevice(id: number) {
      const updated = new Set(selectedIds);
      if (updated.has(id)) {
        updated.delete(id);
      } else {
        updated.add(id);
      }
      onStepComplete({ digital_media_type_ids: [...updated] });
    }

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {filteredTypes.map((type) => {
            const isSelected = selectedIds.has(type.digital_media_type_id);
            const { icon: IconComponent, chipClass } =
              getDigitalMediaTypeVisual(type.name);

            return (
              <button
                key={type.digital_media_type_id}
                type="button"
                onClick={() => toggleDevice(type.digital_media_type_id)}
                className={`flex flex-col items-start gap-2 rounded-xl border-2 p-3 text-left transition-all ${
                  isSelected
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
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
                    isSelected ? "text-blue-700" : "text-slate-700"
                  }`}
                >
                  {type.name}
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() =>
            onStepComplete({
              digital_media_type_ids: [...selectedIds],
              _advance: true,
            } as any)
          }
          className="w-full rounded-lg bg-slate-800 py-2.5 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
        >
          Weiter
        </button>
      </div>
    );
  }

  // Helper: map location name to appropriate icon and category
  function getLocationMappings(locName: string): {
    icon: LucideIcon;
    secondaryIcon?: LucideIcon;
    category: string;
    chipClass: string;
  } {
    const normalized = locName.toLowerCase();

    // LOCATIONS (Orte)
    // Must check "zuhause anderer" BEFORE the generic "zuhause" check
    if (
      normalized.includes("anderer person") ||
      normalized.includes("zuhause anderer")
    )
      return {
        icon: Home,
        secondaryIcon: UserRound,
        category: "Orte",
        chipClass: "bg-violet-50 text-violet-600 ring-violet-100",
      };
    if (normalized.includes("zuhause") || normalized.includes("zu hause"))
      return {
        icon: Home,
        category: "Orte",
        chipClass: "bg-blue-50 text-blue-600 ring-blue-100",
      };
    if (
      normalized.includes("wochenendhaus") ||
      normalized.includes("ferienwohnung")
    )
      return {
        icon: Hotel,
        category: "Orte",
        chipClass: "bg-cyan-50 text-cyan-600 ring-cyan-100",
      };
    if (normalized.includes("arbeitsplatz"))
      return {
        icon: Briefcase,
        category: "Orte",
        chipClass: "bg-amber-50 text-amber-600 ring-amber-100",
      };
    if (
      normalized.includes("restaurant") ||
      normalized.includes("café") ||
      normalized.includes("cafe") ||
      normalized.includes("bar")
    )
      return {
        icon: UtensilsCrossed,
        category: "Orte",
        chipClass: "bg-rose-50 text-rose-600 ring-rose-100",
      };
    if (
      normalized.includes("einkaufs") ||
      normalized.includes("markt") ||
      normalized.includes("geschäfte")
    )
      return {
        icon: ShoppingBag,
        category: "Orte",
        chipClass: "bg-emerald-50 text-emerald-600 ring-emerald-100",
      };
    if (normalized.includes("hotel") || normalized.includes("camping"))
      return {
        icon: Hotel,
        category: "Orte",
        chipClass: "bg-sky-50 text-sky-600 ring-sky-100",
      };
    if (
      normalized.includes("schule") ||
      normalized.includes("universität") ||
      normalized.includes("universitaet")
    )
      return {
        icon: GraduationCap,
        category: "Orte",
        chipClass: "bg-indigo-50 text-indigo-600 ring-indigo-100",
      };
    if (
      normalized.includes("spezifizierter ort") &&
      !normalized.includes("transport")
    )
      return {
        icon: MapPin,
        category: "Orte",
        chipClass: "bg-slate-100 text-slate-500 ring-slate-200",
      };

    // PRIVATE TRANSPORT (Private Verkehrsmittel)
    if (normalized.includes("zu fuß") || normalized.includes("zu fuss"))
      return {
        icon: Footprints,
        category: "Private Verkehrsmittel",
        chipClass: "bg-green-50 text-green-600 ring-green-100",
      };
    if (normalized.includes("fahrrad"))
      return {
        icon: Bike,
        category: "Private Verkehrsmittel",
        chipClass: "bg-lime-50 text-lime-600 ring-lime-100",
      };
    if (
      normalized.includes("moped") ||
      normalized.includes("motorrad") ||
      normalized.includes("motorboot")
    )
      return {
        icon: Gauge,
        category: "Private Verkehrsmittel",
        chipClass: "bg-orange-50 text-orange-600 ring-orange-100",
      };
    if (normalized.includes("pkw") || normalized.includes("auto"))
      return {
        icon: Car,
        category: "Private Verkehrsmittel",
        chipClass: "bg-blue-50 text-blue-600 ring-blue-100",
      };
    if (
      normalized.includes("spezifizierter transportmodus") &&
      !normalized.includes("öffentlich")
    )
      return {
        icon: MapPin,
        category: "Private Verkehrsmittel",
        chipClass: "bg-slate-100 text-slate-500 ring-slate-200",
      };

    // PUBLIC TRANSPORT (Öffentlicher Verkehr)
    if (
      normalized.includes("öffentlich") ||
      normalized.includes("oeffentlich") ||
      normalized.includes("zug") ||
      normalized.includes("train") ||
      normalized.includes("bahn") ||
      normalized.includes("tram")
    )
      return {
        icon: Bus,
        category: "Öffentlicher Verkehr",
        chipClass: "bg-teal-50 text-teal-600 ring-teal-100",
      };

    // DEFAULT (fallback, shouldn't really happen)
    return {
      icon: MapPin,
      category: "Sonstiges",
      chipClass: "bg-slate-100 text-slate-500 ring-slate-200",
    };
  }

  // Helper: categorize locations/transport by ID range and assign icons
  function getLocationIcon(locId: number, locName: string): LucideIcon {
    return getLocationMappings(locName).icon;
  }

  function getLocationCategory(locId: number, locName: string): string {
    return getLocationMappings(locName).category;
  }

  // Step 5: where was the user? (categorized with icons)
  function renderLocationStep() {
    // Group locations by category
    const grouped = new Map<string, typeof lookupData.locationTransports>();
    const categoryOrder = [
      "Orte",
      "Private Verkehrsmittel",
      "Öffentlicher Verkehr",
      "Sonstiges",
    ];

    for (const loc of lookupData.locationTransports) {
      const normalizedName = normalizeLabel(loc.name);
      // Hide this option on request
      if (normalizedName.includes("anderer spezifizierter ort (keine reise)")) {
        continue;
      }
      const cat = getLocationCategory(loc.location_transport_id, loc.name);
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
              className="rounded-xl border border-slate-200 bg-slate-50/60 p-3"
            >
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {category}
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
                  } = getLocationMappings(loc.name);

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
                          ? "border-blue-500 bg-blue-50"
                          : "border-white bg-white hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div
                        className={`relative shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg ring-1 ${chipClass}`}
                      >
                        <IconComponent className="h-[18px] w-[18px]" />
                        {SecondaryIcon && (
                          <SecondaryIcon className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-white" />
                        )}
                      </div>
                      <span className="text-xs font-medium leading-snug text-slate-700">
                        {loc.name}
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

  // Helper: map social context name to icon + color
  function getSocialContextVisual(name: string): {
    icon: LucideIcon;
    chipClass: string;
  } {
    const n = normalizeLabel(name);
    if (n.includes("alleine") || n.includes("allein"))
      return {
        icon: UserX,
        chipClass: "bg-slate-100 text-slate-500 ring-slate-200",
      };
    if (
      n.includes("partner") ||
      n.includes("ehepartner") ||
      n.includes("haushalt") ||
      n.includes("haushaltsmitglied") ||
      n.includes("familie") ||
      n.includes("eltern") ||
      n.includes("mutter") ||
      n.includes("vater")
    )
      return {
        icon: n.includes("partner") || n.includes("ehepartner") ? Heart : Home,
        chipClass: "bg-amber-50 text-amber-600 ring-amber-100",
      };
    if (n.includes("bis 9") || n.includes("kind") || n.includes("baby"))
      return {
        icon: Baby,
        chipClass: "bg-pink-50 text-pink-500 ring-pink-100",
      };
    if (
      n.includes("freunde") ||
      n.includes("kollegen") ||
      n.includes("bekannte") ||
      n.includes("andere bekannte")
    )
      return {
        icon: UserCheck,
        chipClass: "bg-emerald-50 text-emerald-600 ring-emerald-100",
      };
    return {
      icon: Users,
      chipClass: "bg-slate-100 text-slate-500 ring-slate-200",
    };
  }

  // Step 6: who was the user with? (multiple choice — needs explicit confirm)
  function renderSocialContextStep() {
    const selectedIds = new Set(pendingEntry.social_context_ids);

    // Toggle a social context id in the pending selection
    function toggleSocialContext(id: number) {
      const updated = new Set(selectedIds);
      if (updated.has(id)) {
        updated.delete(id);
      } else {
        updated.add(id);
      }
      // Update pendingEntry directly without advancing step
      onStepComplete({ social_context_ids: [...updated] });
    }

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {lookupData.socialContexts.map((ctx) => {
            const isSelected = selectedIds.has(ctx.social_context_id);
            const { icon: IconComponent, chipClass } = getSocialContextVisual(
              ctx.name,
            );
            return (
              <button
                key={ctx.social_context_id}
                type="button"
                onClick={() => toggleSocialContext(ctx.social_context_id)}
                className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-all ${
                  isSelected
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
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
                <span className="text-xs font-medium leading-snug text-slate-700">
                  {ctx.name}
                </span>
              </button>
            );
          })}
        </div>

        {/* Confirm multi-selection and advance to next step */}
        {/* _advance flag tells the parent this is a step transition, not a toggle update */}
        <button
          type="button"
          onClick={() =>
            onStepComplete({
              social_context_ids: [...selectedIds],
              _advance: true,
            } as any)
          }
          className="w-full rounded-lg bg-slate-800 py-2.5 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
        >
          Weiter
        </button>
      </div>
    );
  }

  // Helper: map satisfaction name to emoji
  function getSmileyForSatisfaction(satisfactionName: string): string {
    const normalized = satisfactionName.toLowerCase();
    if (normalized.includes("sehr gut")) return "😄";
    if (normalized.includes("gut")) return "🙂";
    if (
      normalized.includes("mittelmäßig") ||
      normalized.includes("mittelmaessig")
    )
      return "😐";
    if (normalized.includes("schlecht") && !normalized.includes("sehr"))
      return "😟";
    if (normalized.includes("sehr schlecht")) return "😢";
    return "😐";
  }

  // Returns a sort rank for satisfaction names: sehr schlecht=0 … sehr gut=4
  function getSatisfactionSortRank(name: string): number {
    const n = name.toLowerCase();
    if (n.includes("sehr schlecht")) return 0;
    if (n.includes("schlecht")) return 1;
    if (n.includes("mittelmäßig") || n.includes("mittelmaessig")) return 2;
    if (n.includes("sehr gut")) return 4;
    if (n.includes("gut")) return 3;
    return 2;
  }

  // Step 7 (final): how did the user feel? (emoji grid with labels below)
  function renderSatisfactionStep() {
    const sortedSatisfactions = [...lookupData.satisfactions].sort(
      (a, b) =>
        getSatisfactionSortRank(a.name) - getSatisfactionSortRank(b.name),
    );
    return (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3">
        {sortedSatisfactions.map((sat) => {
          const isSelected =
            pendingEntry.satisfaction_id === sat.satisfaction_id;
          const emoji = getSmileyForSatisfaction(sat.name);
          return (
            <button
              key={sat.satisfaction_id}
              type="button"
              onClick={() =>
                onStepComplete({ satisfaction_id: sat.satisfaction_id })
              }
              className={`
                flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-3 transition-all
                ${
                  isSelected
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                }
              `}
            >
              <div className="text-4xl">{emoji}</div>
              <div className="text-center text-xs font-semibold text-slate-700">
                {sat.name}
              </div>
            </button>
          );
        })}
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

  const stepMeta = getStepMeta(step);
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
      className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"
    >
      {/* Header: time range badge */}
      <div className="flex items-center gap-3 px-4 pt-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-1.5 text-blue-700 ring-1 ring-blue-100">
          <Clock3 className="h-4 w-4 shrink-0" />
          <span className="text-sm font-semibold">
            {formatSlotsRange(selectedSlots)}
          </span>
        </div>
      </div>

      {/* Full-width step progress — only when editor is open */}
      {isEditorVisible && (
        <div className="px-4 pt-3 pb-1">
          {/* Label positioned above the active segment */}
          <div className="relative mb-1.5 h-4">
            <span
              className="absolute text-[11px] font-bold uppercase tracking-widest text-slate-500 transition-all duration-300 whitespace-nowrap -translate-x-1/2"
              style={{
                left: `${((stepMeta.index - 1) / stepMeta.total + 1 / (2 * stepMeta.total)) * 100}%`,
              }}
            >
              {step === "primary_activity"
                ? "Haupttätigkeit"
                : isSecondaryStep
                  ? "Nebentätigkeit"
                  : stepMeta.label}
            </span>
          </div>
          <div className="flex gap-1">
            {Array.from({ length: stepMeta.total }, (_, i) => {
              const done = i < stepMeta.index - 1;
              const active = i === stepMeta.index - 1;
              return (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                    active
                      ? "bg-blue-500"
                      : done
                        ? "bg-blue-300"
                        : "bg-slate-200"
                  }`}
                />
              );
            })}
          </div>
          {!isFirstStep && (
            <div className="mt-2 flex">
              <button
                type="button"
                onClick={onBack}
                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-500 shadow-sm transition-colors hover:bg-slate-50"
                title="Zurück"
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
                Zurück
              </button>
            </div>
          )}
        </div>
      )}

      {/* Selection overview: time-led list only */}
      {hasAnyExistingEntryInSelection && !isEditorVisible && (
        <div className="mx-4 mb-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <div className="hidden">
            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 xl:col-span-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Zeit
              </p>
              <div className="mt-1.5 flex max-h-36 flex-wrap gap-1.5 overflow-auto pr-1">
                {mergedSlotRanges.length > 0 ? (
                  mergedSlotRanges.map((range) => (
                    <span
                      key={range}
                      className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-100"
                    >
                      <Clock3 className="h-3.5 w-3.5" />
                      {range}
                    </span>
                  ))
                ) : (
                  <p className="text-xs text-slate-400">Keine Zeitslots</p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 xl:col-span-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Kategorie
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {primaryCategory && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100">
                    <BookOpen className="h-3.5 w-3.5" />
                    Hauptkategorie: {primaryCategory.name}
                  </span>
                )}
                {activeBrowsingCategory && !primaryCategory && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-sky-100">
                    <BookOpen className="h-3.5 w-3.5" />
                    Gewählte Kategorie: {activeBrowsingCategory.name}
                  </span>
                )}
                {primaryActivity && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100">
                    <Briefcase className="h-3.5 w-3.5" />
                    Haupttätigkeit: {primaryActivity.name}
                  </span>
                )}
                {secondaryCategory && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700 ring-1 ring-teal-100">
                    <BookOpen className="h-3.5 w-3.5" />
                    Nebenkategorie: {secondaryCategory.name}
                  </span>
                )}
                {secondaryActivity && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700 ring-1 ring-teal-100">
                    <Briefcase className="h-3.5 w-3.5" />
                    Nebentätigkeit: {secondaryActivity.name}
                  </span>
                )}
                {!primaryCategory &&
                  !primaryActivity &&
                  !secondaryCategory &&
                  !secondaryActivity && (
                    <p className="text-xs text-slate-400">
                      Noch nichts ausgewählt
                    </p>
                  )}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 xl:col-span-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Kontext
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {locationName && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-100">
                    <MapPin className="h-3.5 w-3.5" />
                    Ort/Transport: {locationName}
                  </span>
                )}
                {socialContextNames.map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-100"
                  >
                    <Users className="h-3.5 w-3.5" />
                    Sozial: {name}
                  </span>
                ))}
                {!locationName && socialContextNames.length === 0 && (
                  <p className="text-xs text-slate-400">
                    Noch nichts ausgewählt
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 xl:col-span-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Medien
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
                    Noch nichts ausgewählt
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 xl:col-span-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Stimmung
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {satisfactionName ? (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-rose-100">
                    <Heart className="h-3.5 w-3.5" />
                    {satisfactionName}
                  </span>
                ) : (
                  <p className="text-xs text-slate-400">
                    Noch nichts ausgewählt
                  </p>
                )}
              </div>
            </div>
          </div>

          {selectedSlotGroups.length > 0 && (
            <div className="mt-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
              <p className="hidden text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Zeitgeführte Auflistung
              </p>
              <div className="mt-2 space-y-1.5">
                {selectedSlotGroups.map((group, index) => {
                  const timeRange = `${minutesToSlot(group.start)} - ${minutesToSlot(group.endExclusive)}`;

                  if (!group.entry) {
                    return (
                      <div
                        key={`${group.start}-${group.endExclusive}-${index}`}
                        className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5"
                      >
                        <span className="shrink-0 text-xs font-semibold text-slate-700">
                          {timeRange}
                        </span>
                        <span className="flex-1 text-xs text-slate-400">
                          Kein Eintrag
                        </span>
                        <button
                          type="button"
                          title="Eintrag hinzufügen"
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
                          className="shrink-0 rounded-md border border-blue-200 bg-blue-50 p-1 text-blue-600 transition-colors hover:bg-blue-100"
                        >
                          <Plus className="h-3.5 w-3.5" />
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
                  );
                  const rowSatisfaction = findNameById(
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
                      name: item.name,
                      ...getDigitalMediaTypeVisual(item.name),
                    }));
                  const rowSocialItems = lookupData.socialContexts
                    .filter((sc) =>
                      group.entry?.social_context_ids.includes(
                        sc.social_context_id,
                      ),
                    )
                    .map((sc) => ({
                      name: sc.name,
                      ...getSocialContextVisual(sc.name),
                    }));

                  // Primary category: index → color + visual icons
                  const rowPriCatIdx = rowPrimaryCategory
                    ? lookupData.categories.findIndex(
                        (c) => c.category_id === rowPrimaryCategory.category_id,
                      )
                    : -1;
                  const rowPriVisual = rowPrimaryCategory
                    ? getCategoryVisual(rowPrimaryCategory.name, rowPriCatIdx)
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
                    ? getCategoryVisual(rowSecondaryCategory.name, rowSecCatIdx)
                    : null;
                  const rowSecColor =
                    rowSecCatIdx >= 0
                      ? CATEGORY_COLORS[rowSecCatIdx % CATEGORY_COLORS.length]
                      : "#94A3B8";
                  const RowSecActIcon = rowSecVisual?.primaryIcon ?? null;

                  // Location
                  const rowLocVisual = rowLocationName
                    ? getLocationMappings(rowLocationName)
                    : null;
                  const RowLocIcon = rowLocVisual?.icon ?? null;

                  // Satisfaction emoji
                  const rowSatisfactionEmoji = rowSatisfaction
                    ? getSmileyForSatisfaction(rowSatisfaction)
                    : null;

                  return (
                    <div
                      key={`${group.start}-${group.endExclusive}-${index}`}
                      className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5"
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
                            {rowPrimaryActivity.name}
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
                            {rowSecondaryActivity.name}
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
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          title="Bearbeiten"
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
                          className="rounded-md border border-slate-200 bg-white p-1 text-slate-500 transition-colors hover:bg-slate-100"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Löschen"
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
                          className="rounded-md border border-red-200 bg-red-50 p-1 text-red-500 transition-colors hover:bg-red-100 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50"
          >
            ← Zurück
          </button>
        </div>
      )}

      {/* Question + editor only shown on explicit edit action */}
      <div className={isEditorVisible ? "block" : "hidden"}>
        <div className="px-4 pb-2 pt-3">
          <h3 className="text-base font-bold leading-snug text-slate-900">
            {getStepQuestion(step)}
          </h3>
        </div>

        {/* Step content (scrollable if needed) */}
        <div className="px-4 pb-4">{renderStepContent()}</div>
      </div>
    </div>
  );
}
