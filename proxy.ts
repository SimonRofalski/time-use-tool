import { NextResponse, type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";

/**
 * Next.js proxy (formerly middleware) entry point: locale negotiation + auth gating.
 *
 * Runtime assumptions due to conflicting docs (Next.js 16):
 * - Proxy runs in the Node.js runtime by default (not Edge)
 * - Node runtime grants access to the shared cookie store used by Supabase
 *
 * What happens per request:
 * - For a logged-in user, sync their saved `profiles.locale` into the
 *   NEXT_LOCALE cookie so next-intl's middleware picks it up. Anonymous
 *   visitors fall back to next-intl's own Accept-Language negotiation.
 * - Run next-intl's routing (no visible URL prefix — see i18n/routing.ts).
 * - Instantiate the Supabase server client (shares cookies via `NextResponse`)
 * - Call `supabase.auth.getUser()` which refreshes tokens if necessary
 * - Redirect anonymous users away from the protected pages to `/`
 *
 * Add extra path checks or redirects here when you need more complex routing rules.
 */
const intlMiddleware = createIntlMiddleware(routing);

const PROTECTED_PATHS = [
  "/zeiterfassung",
  "/erfasste-zeit",
  "/statistiken",
  "/admin",
  "/settings",
];

export async function proxy(request: NextRequest) {
  // API routes aren't locale-scoped pages — skip straight through.
  if (request.nextUrl.pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("locale")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.locale) {
      request.cookies.set("NEXT_LOCALE", profile.locale);
    }
  }

  const response = intlMiddleware(request);

  const isProtectedPath = PROTECTED_PATHS.some((path) =>
    request.nextUrl.pathname.startsWith(path),
  );
  if (!user && isProtectedPath) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

// Skip framework internals and static files (extensions) — avoids running
// Supabase/locale checks on every JS chunk, image, etc.
export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
