// ─── Shared types and constants for the Zeiterfassung feature ────────────────

// One distinct color per category, assigned by category index (0–10)
// Both TimeGrid and ActivitySelector use this array
export const CATEGORY_COLORS: string[] = [
  "#6366F1", // indigo
  "#059669", // emerald
  "#D97706", // amber
  "#DC2626", // red
  "#7C3AED", // violet
  "#0891B2", // cyan
  "#EA580C", // orange
  "#DB2777", // pink
  "#0D9488", // teal
  "#65A30D", // lime
  "#64748B", // slate — nicht spezifizierte Zeitnutzung
];

// Returns the hex color for a category by its position in the sorted list
// Falls back to slate-400 if the category is not found
export function getCategoryColor(
  categoryId: number,
  categories: Category[],
): string {
  const index = categories.findIndex((c) => c.category_id === categoryId);
  return index >= 0
    ? CATEGORY_COLORS[index % CATEGORY_COLORS.length]
    : "#94A3B8";
}

// ─── Lookup table types (static reference data from DB) ──────────────────────

export type Category = {
  category_id: number;
  code: string;
  name: string;
  name_en: string;
};

export type Subcategory = {
  subcategory_id: number;
  category_id: number;
  code: string;
  name: string;
  name_en: string;
};

export type Activity = {
  activity_id: number;
  subcategory_id: number;
  code: string;
  name: string;
  name_en: string;
};

export type LocationTransport = {
  location_transport_id: number;
  code: string;
  name: string;
  name_en: string;
};

export type SocialContext = {
  social_context_id: number;
  code: string;
  name: string;
  name_en: string;
};

export type DigitalMediaType = {
  digital_media_type_id: number;
  code: string;
  name: string;
  name_en: string;
};

export type Satisfaction = {
  satisfaction_id: number;
  code: string;
  name: string;
  name_en: string;
};

export type Meaningfulness = {
  meaningfulness_id: number;
  code: string;
  name: string;
  name_en: string;
};

export type Stressfulness = {
  stressfulness_id: number;
  code: string;
  name: string;
  name_en: string;
};

// All lookup tables bundled together for convenient passing between components
export type LookupData = {
  categories: Category[];
  subcategories: Subcategory[];
  activities: Activity[];
  locationTransports: LocationTransport[];
  socialContexts: SocialContext[];
  digitalMediaTypes: DigitalMediaType[];
  satisfactions: Satisfaction[];
  meaningfulnesses: Meaningfulness[];
  stressfulnesses: Stressfulness[];
};

// ─── Core data types ──────────────────────────────────────────────────────────

// A time entry as stored in the database, normalized for use in the frontend
// start_time and end_time are "HH:MM" strings (seconds stripped from DB format)
export type TimeEntryRecord = {
  entry_id: number;
  day_id: number;
  start_time: string;
  end_time: string;
  primary_activity_id: number;
  secondary_activity_id: number | null;
  satisfaction_id: number | null;
  meaningfulness_id: number | null;
  stressfulness_id: number | null;
  location_transport_id: number | null;
  digital_media_used: boolean;
  digital_media_type_ids: number[];
  social_context_ids: number[];
};

// Entry being built step-by-step in the questionnaire before it is saved
export type PendingEntry = {
  slots: string[]; // sorted "HH:MM" slot strings
  primary_activity_id: number | null;
  secondary_activity_id: number | null;
  digital_media_used: boolean;
  digital_media_type_ids: number[];
  location_transport_id: number | null;
  social_context_ids: number[];
  satisfaction_id: number | null;
  meaningfulness_id: number | null;
  stressfulness_id: number | null;
};

// The ordered steps in the questionnaire flow
// digital_media_type is only shown when digital_media_used = true
export type QuestionnaireStep =
  | "primary_activity"
  | "secondary_activity"
  | "digital_media"
  | "digital_media_type"
  | "location_transport"
  | "social_context"
  | "satisfaction";
