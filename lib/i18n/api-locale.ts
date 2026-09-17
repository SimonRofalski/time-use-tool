import type { NextRequest } from "next/server";
import { hasLocale } from "next-intl";
import { routing, type Locale } from "@/i18n/routing";

// API routes are excluded from the proxy's next-intl routing (see proxy.ts),
// so they can't rely on request-scoped locale detection — they must read the
// NEXT_LOCALE cookie directly to know which language to respond in.
export function getApiLocale(request: NextRequest): Locale {
  const cookieLocale = request.cookies.get("NEXT_LOCALE")?.value;
  return hasLocale(routing.locales, cookieLocale)
    ? cookieLocale
    : routing.defaultLocale;
}
