// ─── Drill-down table types ───────────────────────────────────────────────────

// One row in the category-level drill-down table
export type CategoryRow = {
  categoryId: number;
  name: string;
  totalMinutes: number; // sum of all time entries in this category
  percentOfTotal: number; // share of all tracked time (0–100)
  isExpanded: boolean; // controls accordion open/close
  subcategories: SubcategoryRow[];
};

// One row in the subcategory-level drill-down (shown when category is expanded)
export type SubcategoryRow = {
  subcategoryId: number;
  name: string;
  totalMinutes: number;
  percentOfTotal: number; // share of all tracked time (not just the parent category)
  isExpanded: boolean;
  activities: ActivityRow[];
};

// One row in the activity-level drill-down (shown when subcategory is expanded)
export type ActivityRow = {
  activityId: number;
  name: string;
  totalMinutes: number;
  percentOfTotal: number;
  meta?: ActivityMetaStats;
};

export type ActivityMetaStats = {
  withDevicesMinutes: number;
  withoutDevicesMinutes: number;
  withPeopleMinutes: number;
  aloneMinutes: number;
  atHomeMinutes: number;
  elsewhereMinutes: number;
  satisfactionWeightedSum: number;
  satisfactionWeight: number;
  avgSatisfactionLabel: string;
};

export type MetaAggregateItem = {
  name: string;
  minutes: number;
};

export type MetaAggregates = {
  devices: MetaAggregateItem[];
  social: MetaAggregateItem[];
  locations: MetaAggregateItem[];
  avgSatisfactionLabel: string;
};

// ─── Bar chart types ──────────────────────────────────────────────────────────

// One bar in the daily stacked bar chart — one entry per course date
export type DayBarData = {
  date: string; // ISO date "YYYY-MM-DD"
  isSubmitted: boolean; // false → render as a grey placeholder bar
  // Dynamic keys: one per category name (e.g. "Schlaf": 420)
  // Values are minutes spent in that category on this day
  [categoryName: string]: number | string | boolean;
};

// ─── Course comparison types ──────────────────────────────────────────────────

// The three comparison topics available in the Kursvergleich tab
export type ComparisonTopicKey = "schlaf" | "sport" | "smartphone";

// Aggregated comparison data for one topic
export type ComparisonTopic = {
  key: ComparisonTopicKey;
  label: string; // German display name
  unit: string; // e.g. "h/Tag"
  // All participants' average hours/day (anonymous, used for distribution)
  allValues: number[];
  // The current user's average hours/day for this topic
  userValue: number;
};

// Per-category comparison: the user's Ø h/Tag vs. all qualifying participants
export type CategoryComparison = {
  categoryId: number;
  name: string;
  allValues: number[]; // anonymous Ø h/Tag of every qualifying participant
  userValue: number; // the current user's Ø h/Tag
};

// Generic "you vs. course" metric, rendered as paired bars in the Kursvergleich
export type ComparisonMetric = {
  key: string;
  label: string;
  description?: string; // short explanation under the label
  unit: "h/Tag" | "%" | "Punkte";
  scaleMax?: number; // fixed bar scale (100 for %, max rank for wellbeing); omit → max of values
  allValues: number[]; // anonymous per-participant values
  userValue: number;
};

export type ComparisonPairPercent = {
  leftPercent: number;
  rightPercent: number;
};

export type ComparisonMetaStats = {
  itDevice: {
    user: ComparisonPairPercent | null;
    course: ComparisonPairPercent | null;
  };
  social: {
    user: ComparisonPairPercent | null;
    course: ComparisonPairPercent | null;
  };
  location: {
    user: ComparisonPairPercent | null;
    course: ComparisonPairPercent | null;
  };
  wellbeing: {
    userLabel: string;
    courseLabel: string;
  };
};
