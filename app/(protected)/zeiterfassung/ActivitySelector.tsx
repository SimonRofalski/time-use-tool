"use client";

import { useEffect, useState } from "react";
import {
  Baby,
  Bike,
  BookOpen,
  Briefcase,
  Building2,
  Bus,
  Calendar,
  Car,
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
  Scissors,
  Search,
  Smartphone,
  Tablet,
  ShoppingBag,
  Sparkles,
  Timer,
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
  lookupData: LookupData;
  onStepComplete: (data: Partial<PendingEntry>) => void;
  onBack: () => void;
  onCancel: () => void;
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
      return "Welche Haupttätigkeit hast du in dieser Zeit ausgeführt?";
    case "secondary_activity":
      return "Hast du gleichzeitig eine Nebentätigkeit ausgeführt?";
    case "digital_media":
      return "Hast du für die Aktivität ein IT-Gerät (z.B. Smartphone, Tablet oder ähnlich) genutzt?";
    case "digital_media_type":
      return "Welche Geräte hast du genutzt?";
    case "location_transport":
      return "Wo warst du während dieser Zeit?";
    case "social_context":
      return "War jemand anders mit dabei?";
    case "satisfaction":
      return "Wie hast du dich während dieser Zeit gefühlt?";
  }
}

// Returns a 0–100 progress value used to fill the progress bar
function getStepProgress(step: QuestionnaireStep): number {
  const progressMap: Record<QuestionnaireStep, number> = {
    primary_activity: 5,
    secondary_activity: 20,
    digital_media: 38,
    digital_media_type: 52,
    location_transport: 65,
    social_context: 80,
    satisfaction: 100,
  };
  return progressMap[step] ?? 0;
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
  lookupData,
  onStepComplete,
  onBack,
  onCancel,
}: ActivitySelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);

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
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
          >
            Ohne Nebentätigkeit weiter
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
    const n = name.toLowerCase();
    if (n.includes("alleine") || n.includes("allein"))
      return {
        icon: UserX,
        chipClass: "bg-slate-100 text-slate-500 ring-slate-200",
      };
    if (n.includes("partner") || n.includes("ehepartner"))
      return {
        icon: Heart,
        chipClass: "bg-rose-50 text-rose-500 ring-rose-100",
      };
    if (n.includes("eltern") || n.includes("mutter") || n.includes("vater"))
      return {
        icon: Users,
        chipClass: "bg-amber-50 text-amber-600 ring-amber-100",
      };
    if (n.includes("bis 9") || n.includes("kind") || n.includes("baby"))
      return {
        icon: Baby,
        chipClass: "bg-pink-50 text-pink-500 ring-pink-100",
      };
    if (n.includes("haushalt"))
      return {
        icon: Home,
        chipClass: "bg-blue-50 text-blue-600 ring-blue-100",
      };
    if (
      n.includes("freunde") ||
      n.includes("kollegen") ||
      n.includes("bekannte")
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

  const progressPercent = getStepProgress(step);
  const isFirstStep = step === "primary_activity";

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Header: selected time range + back/cancel actions */}
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-blue-700 ring-1 ring-blue-100">
            <Clock3 className="h-4 w-4 shrink-0" />
            <span className="text-sm font-semibold">
              {formatSlotsRange(selectedSlots)}
            </span>
          </div>
          {!isFirstStep && (
            <button
              type="button"
              onClick={onBack}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50"
            >
              ← Zurück
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-slate-400 hover:text-slate-600 transition-colors text-lg leading-none"
          title="Auswahl aufheben"
        >
          ✕
        </button>
      </div>

      {/* Progress bar */}
      <div className="px-4 pb-3">
        <div className="h-1 w-full rounded-full bg-slate-100">
          <div
            className="h-1 rounded-full bg-blue-500 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="px-4 pb-4 pt-1">
        <h3 className="text-lg font-bold text-slate-900 leading-snug">
          {getStepQuestion(step)}
        </h3>
      </div>

      {/* Step content (scrollable if needed) */}
      <div className="px-4 pb-4">{renderStepContent()}</div>
    </div>
  );
}
