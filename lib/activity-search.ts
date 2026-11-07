import type { Locale } from "@/i18n/routing";

// Activity search: matches the visible (localized) activity name plus the
// hidden keywords for the current locale (activity.keywords_de / keywords_en).
// The keywords let users find old-fashioned HETUS names with everyday words,
// e.g. "duschen" → "Waschen und Anziehen", "gamen" → "Konsolenspiele".

type SearchableActivity = {
  keywords_de?: string[] | null;
  keywords_en?: string[] | null;
};

// Lowercases and folds umlauts/accents/ß so "fussball" matches "Fußball"
// and "kuche" still finds "Küche".
export function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

// Splits a query into normalized words; empty for a blank query.
export function tokenizeSearchQuery(query: string): string[] {
  return normalizeSearchText(query).split(/\s+/).filter(Boolean);
}

function getKeywords(activity: SearchableActivity, locale: Locale): string[] {
  const keywords = locale === "en" ? activity.keywords_en : activity.keywords_de;
  return keywords ?? [];
}

// True when every query word appears somewhere in the name or the keywords,
// so "zähne putzen" and "putzen zähne" both match. No tokens → always true.
export function matchesActivitySearch(
  activity: SearchableActivity,
  localizedName: string,
  queryTokens: string[],
  locale: Locale,
): boolean {
  if (queryTokens.length === 0) return true;

  const haystack = [localizedName, ...getKeywords(activity, locale)]
    .map(normalizeSearchText)
    .join(" | ");

  return queryTokens.every((token) => haystack.includes(token));
}
