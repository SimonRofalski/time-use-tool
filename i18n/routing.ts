import { defineRouting } from "next-intl/routing";

// URLs never show a locale prefix (/zeiterfassung, not /de/zeiterfassung) —
// the locale is negotiated server-side in proxy.ts (profiles.locale for
// logged-in users, Accept-Language for everyone else) and kept in sync via
// the NEXT_LOCALE cookie next-intl reads.
export const routing = defineRouting({
  locales: ["de", "en"],
  defaultLocale: "de",
  localePrefix: "never",
});

export type Locale = (typeof routing.locales)[number];
