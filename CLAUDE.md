# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start development server (localhost:3000)
npm run build      # Production build
npm run start      # Start production server
npm run lint       # Run ESLint
npm run mock-oidc  # Local mock SWITCH edu-ID OIDC provider (localhost:9999) — run alongside `dev` to test edu-ID login before the real SWITCH SP registration exists
```

## Architecture

**Stack:** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4 + Supabase

### Route Structure

All page routes live under `app/[locale]/...` (added 2026-09 for bilingual support — see Internationalization below). `localePrefix: "never"` means the locale segment is never visible in the URL; routes below are described by their visible path.

- `/` — Single-page login (sign in / sign up / forgot password modes combined), also handles security-question-based password reset
- `/reset-password` — Password reset via email link
- `/(protected)/zeiterfassung` — Time entry: 10-minute slot grid (`TimeGrid.tsx`) + activity picker (`ActivitySelector.tsx`)
- `/(protected)/erfasste-zeit` — Day-by-day overview/carousel of submitted entries with completion status
- `/(protected)/statistiken` — Two tabs: `ZeitverteilungTab` (time distribution) and `KursvergleichTab` (course comparison), built on `recharts`
- `/(protected)/admin` — Thin page shell; actual admin UI (Kursübersicht/Nutzerübersicht/Statistiken tabs) renders inside the protected layout itself, gated by `profiles.role === "admin"`
- `/(protected)/settings` — Stub page pointing users to the account/theme panel in the header (settings were moved there, see Navigation below)

There is no longer a separate `/profil` route — profile completion/editing happens via a modal (`ProfileDetailsForm`) opened from the header, and is mandatory on first login before a user can use the app.

The `(protected)` route group uses a client-side layout (`app/[locale]/(protected)/layout.tsx`) that listens to `onAuthStateChange` and redirects unauthenticated users to `/`. Server-side auth checks + locale negotiation happen in the project-root `proxy.ts`.

**Important Next.js 16 gotcha, found and fixed 2026-09:** the proxy/middleware file convention (`proxy.ts`, formerly `middleware.ts`) is only ever detected at the **project root** (or `src/`) — never inside `app/`. This file used to live at `app/proxy.ts` and was silently never invoked by Next.js at all (confirmed via Next's build source, and via `next build`'s route summary only listing "ƒ Proxy (Middleware)" after the move). Its auth-redirect logic being dead code is likely *why* that bug (checking a `/protected` path prefix that route groups never produce in the URL) went unnoticed — the whole file wasn't running. It now lives at `./proxy.ts` and both the locale negotiation and the (now-fixed) auth redirect are confirmed working.

### Supabase Integration

Two Supabase client instances:
- `lib/supabase/browser-client.ts` — Singleton for client components, uses `NEXT_PUBLIC_*` env vars
- `lib/supabase/server-client.ts` — Server-side instance using Next.js `cookies()` API for session persistence and token refresh

Sessions are stored in cookies and refreshed server-side on each request via the proxy. Password reset supports both the email-link flow (`/reset-password`) and a security-questions flow (`lib/security-questions.ts`, `lib/security-questions-server.ts`, `app/api/security-questions/`, `app/api/password-reset/security-questions/`, `app/api/password-reset/verify/`, `app/api/password-reset/complete/`) — this stays the recovery path for password-based accounts regardless of how they signed up.

### SWITCH edu-ID login (OIDC)

Added 2026-09 (Google OAuth was removed earlier and is not coming back). Two auth methods now coexist, tracked via `profiles.auth_provider` (`'password' | 'switch_edu_id'`):

- **SWITCH edu-ID** is the primary, prominent option on the login page (`app/[locale]/page.tsx`) — email/password is de-emphasized behind an "mit E-Mail & Passwort anmelden" disclosure link, for accounts that don't have edu-ID.
- The OIDC negotiation itself (`lib/oidc/client.ts`, `lib/oidc/provision.ts`, using `openid-client` v6's functional API) deliberately has **no Supabase imports** — only `app/api/auth/switch/callback/route.ts` bridges the verified identity into a Supabase session (via `auth.admin.generateLink({type:"magiclink"})` + `verifyOtp`). This is intentional: the team plans to migrate off Supabase to a custom Postgres/auth stack, and Supabase's own SSO/SAML product was deliberately avoided so this logic stays portable.
- **Account linking**: a first edu-ID login whose email matches an existing password-based profile links automatically (same `auth.users.id`, full history preserved) — see `lib/oidc/provision.ts`. No extra confirmation step from the user (a known v1 simplification).
- The real SWITCH SP registration (client id/secret) hasn't happened yet — it's an external process the team owns. Development runs against a local mock provider instead: `npm run mock-oidc` (`dev/mock-oidc-provider.mjs`, port 9999, a few seeded test accounts covering new-user / returning-user / email-collision scenarios). Swapping to production only requires changing the four `SWITCH_OIDC_*` env vars, no code changes.
- **Admin-managed password accounts**: since not everyone has edu-ID, admins can create password-based accounts and reset passwords from the Nutzerübersicht tab (`app/components/admin/NutzeruebersichtTab.tsx`, `CreateUserModal.tsx`, `SetPasswordModal.tsx`, backed by `app/api/admin/users/{create,set-password,delete}/`). Any admin-set password forces `profiles.must_change_password = true`, which gates the entire protected layout (`app/[locale]/(protected)/layout.tsx`, `MustChangePasswordForm.tsx`) until the user sets their own password — this check runs **before** the security-questions gate and applies to every role, no exceptions.
- `profiles.auth_provider`, `must_change_password`, and `switch_edu_id_sub` are locked to service-role-only writes via a Postgres trigger (`supabase/migrations/20260920000000_add_edu_id_login.sql`) — a user's own RLS "update own profile" policy has no column restriction, so without this trigger a user could flip `must_change_password` back to `false` themselves via a plain `supabase-js` call. Any code that needs to change these three columns must go through `lib/supabase/admin-client.ts`'s service-role client.

### Navigation

The protected layout renders a sticky top header + horizontal tab bar (not bottom navigation). Regular-user tabs are defined in the `tabs` array, admin-only tabs in `adminTabs`, both in `app/(protected)/layout.tsx`. Icons from `lucide-react`. `@heroicons/react` and `@heroui/react` are still listed in `package.json` but have no imports anywhere in `app/` or `lib/` — likely safe to remove, worth confirming with the team before doing so. The header also holds a profile menu (name, role, theme toggle, sign-out) and drives the mandatory profile-completion / course-enrollment modals on first login.

### Theme (Dark Mode)

Dark mode is a plain Tailwind `dark:` class toggle, not a library like `next-themes`. The preference is stored in `localStorage` under `time-use-tool-theme` and applied via an inline script in `app/layout.tsx` (runs before hydration to avoid a flash of the wrong theme, falling back to `prefers-color-scheme` when no preference is stored). The toggle itself lives in the protected layout's header panel. Because of this, any new page must include `dark:` variants for its styling rather than assuming the light-theme description below is still accurate everywhere.

### Internationalization (German/English)

Added for AFE2 — the tool is being made bilingual. Two independent pieces:

- **Static UI strings**: `next-intl`, config in `i18n/routing.ts` (locales `de`/`en`, `defaultLocale: "de"`, `localePrefix: "never"` so URLs never show `/de` or `/en`), `i18n/navigation.ts`, `i18n/request.ts`. Message catalogs live in `messages/de.json` / `messages/en.json`. All page routes moved under `app/[locale]/...` for this (see Route Structure above) — `next-intl`'s locale-scoped routing requires the dynamic segment even though it stays invisible in the URL.
- **Database lookup content** (category/activity/satisfaction/etc. names): each lookup table got an additive `name_en` column (migration `20260916000000_add_i18n_columns.sql`, backfilled in `20260916000001_backfill_i18n_names.sql`) — the original `name` column is untouched and still means German. `lib/i18n/localized-name.ts` (`getLocalizedName(row, locale)`) is the single place that picks between them; use it instead of reading `.name` directly on any lookup row.
- **Locale persistence**: `profiles.locale` (`'de' | 'en'`, default `'de'`) is the source of truth for logged-in users. `proxy.ts` reads it per-request and syncs it into the `NEXT_LOCALE` cookie before running next-intl's routing, so anonymous visitors fall back to `Accept-Language` negotiation and logged-in users always get their saved preference regardless of device/browser.
- Icon/grouping/sort logic that used to pattern-match on the (German) lookup `name` text (in `ActivitySelector.tsx` and similar files) was refactored to key off the lookup tables' language-neutral `code` column instead (HETUS/BFS classification codes for category/subcategory/activity, ISO codes for nationality, canton abbreviations for region) — this was necessary *before* `name` could safely become locale-dependent, otherwise that logic would silently break in English.

**Status as of 2026-09-16**: the routing/locale-negotiation foundation is built and verified end-to-end (build passes, locale negotiation confirmed via `x-middleware-rewrite` headers, login page verified pixel-identical in a live browser). Extracting the large volume of hardcoded German strings across the feature pages into `messages/*.json` (and wiring a locale switcher into the header) is still in progress — don't assume any given page's UI text is translated yet just because the routing exists.

### Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_PROJECT_ID
SUPABASE_SERVICE_ROLE_KEY     # server-only, used by lib/supabase/admin-client.ts

# SWITCH edu-ID OIDC (see "SWITCH edu-ID login" above) — local dev points
# these at `npm run mock-oidc`; production values come from the SWITCH SP
# registration. See .env.example for the local-dev placeholder values.
SWITCH_OIDC_ISSUER_URL
SWITCH_OIDC_CLIENT_ID
SWITCH_OIDC_CLIENT_SECRET
SWITCH_OIDC_REDIRECT_URI
```

### UI Conventions

- Bilingual UI (German/English) in progress, see Internationalization above — German remains the default and is still the only fully-translated language today. Informal "du" address (not formal "Sie") in German copy — e.g. "Du kannst dich jetzt anmelden." — carry the equivalent informal tone into English copy.
- Light theme by default (slate-50 background, white cards, blue accents), with a full dark-theme variant (slate-950/slate-900 surfaces) — see Theme section above. Write `dark:` variants alongside any new light-theme class.
- Login page uses `public/login-bg.svg` as a decorative background
- All pages share the same login card style (white rounded card, slate-800 submit button)

### Current State

Auth (including security-question-based password reset) and the Supabase schema are fully implemented — see the schema notes the team has documented separately. The core feature pages are implemented, not stubs:

- **Zeiterfassung** (`zeiterfassung/page.tsx`, ~1000 lines): the 10-minute time-slot grid and activity selection flow.
- **Erfasste Zeit** (`erfasste-zeit/page.tsx`, ~650 lines): day carousel with per-day completion/validity status and a summary bar.
- **Statistiken** (`statistiken/page.tsx`, ~1500 lines): `ZeitverteilungTab` and `KursvergleichTab`, charts via `recharts`.
- **Admin**: course overview (with PDF/Excel export via `jspdf`/`jspdf-autotable`/`xlsx` in `KursuebersichtTab.tsx`), user overview, and admin-facing statistics — rendered inside the protected layout, not the thin `admin/page.tsx` shell.
- **Settings**: functionality was consolidated into the header profile/settings panel; `settings/page.tsx` is now just a pointer to it.

Course logic (multi-period courses, date-range handling) is centralized in `lib/course-periods.ts` as shared source of truth for admin, user, and stats views.

Known stale/uncertain areas — verify against code before relying on them: the exact current shape of the mandatory profile-completion/enrollment flow in the layout, and whether `@heroicons/react`/`@heroui/react` are still needed as dependencies at all.

**SWITCH edu-ID login status (2026-09-20)**: implemented end-to-end against the local mock OIDC provider (build passes, `tsc --noEmit` clean) but **not yet manually verified in a live browser round-trip** — that's the next step before merging. Also not yet done: the actual SWITCH SP registration (external, owned by the team) and swapping the `SWITCH_OIDC_*` env vars from the mock to production values.
