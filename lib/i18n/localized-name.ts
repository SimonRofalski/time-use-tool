import type { Locale } from "@/i18n/routing";

// Every lookup table (category, activity, satisfaction, ...) has a German
// `name` (unchanged, original column) and an English `name_en` (added for
// AFE2). This is the single place that picks between them.
export function getLocalizedName(
  row: { name: string; name_en: string },
  locale: Locale,
): string {
  return locale === "en" ? row.name_en : row.name;
}
