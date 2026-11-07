import { createHash, createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { escapeLikePattern } from "@/lib/escape-like";

// ─── Shared server logic for the security-question password reset ──────────
// Used by app/api/password-reset/{security-questions,verify}. Goals (code
// review 2026-11-06):
//  - the responses never reveal whether an account exists for an email
//    (unknown emails get two stable decoy questions; answers to them fail),
//  - the internal profile ID never leaves the server,
//  - answers can't be brute-forced: 5 failed attempts within 15 minutes lock
//    further attempts for that email (also for unknown emails, so the lock
//    itself reveals nothing).

export const RESET_MAX_FAILED_ATTEMPTS = 5;
const RESET_LOCK_WINDOW_MINUTES = 15;

export function normalizeResetEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Attempts are stored per email hash, not per profile, so emails without an
// account are rate-limited the same way
export function hashResetEmail(email: string): string {
  return createHash("sha256").update(normalizeResetEmail(email)).digest("hex");
}

// Exact, case-insensitive email match (wildcards escaped). Falls back to the
// auth users list for older datasets where profiles.email isn't backfilled.
export async function resolveProfileIdByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<string | null> {
  const normalizedEmail = normalizeResetEmail(email);
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", escapeLikePattern(normalizedEmail))
    .maybeSingle();

  if (!profileError && profile) {
    return profile.id;
  }

  for (let page = 1; page <= 10; page += 1) {
    const { data: listedUsers, error: listUsersError } =
      await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listUsersError) return null;

    const matchedUser = listedUsers.users.find(
      (user) => user.email?.toLowerCase() === normalizedEmail,
    );
    if (matchedUser?.id) return matchedUser.id;
    if (listedUsers.users.length < 200) break;
  }

  return null;
}

// Two distinct questions picked deterministically from the email, so asking
// twice for the same unknown email shows the same questions (a random pick
// each time would give away that the account doesn't exist)
export function pickDecoyQuestionIds(
  email: string,
  availableQuestionIds: number[],
): number[] {
  if (availableQuestionIds.length < 2) return availableQuestionIds;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "decoy";
  const digest = createHmac("sha256", secret)
    .update(normalizeResetEmail(email))
    .digest();
  const sorted = [...availableQuestionIds].sort((a, b) => a - b);
  const first = digest[0] % sorted.length;
  const offset = 1 + (digest[1] % (sorted.length - 1));
  return [sorted[first], sorted[(first + offset) % sorted.length]];
}

export async function isResetLocked(
  admin: SupabaseClient,
  emailHash: string,
): Promise<boolean> {
  const since = new Date(
    Date.now() - RESET_LOCK_WINDOW_MINUTES * 60_000,
  ).toISOString();
  const { count, error } = await admin
    .from("security_question_reset_attempt")
    .select("attempt_id", { count: "exact", head: true })
    .eq("email_hash", emailHash)
    .gte("attempted_at", since);
  // Fail closed: if the counter can't be read, don't allow guessing
  if (error) return true;
  return (count ?? 0) >= RESET_MAX_FAILED_ATTEMPTS;
}

export async function recordFailedResetAttempt(
  admin: SupabaseClient,
  emailHash: string,
): Promise<void> {
  await admin
    .from("security_question_reset_attempt")
    .insert({ email_hash: emailHash });
}

export async function clearResetAttempts(
  admin: SupabaseClient,
  emailHash: string,
): Promise<void> {
  await admin
    .from("security_question_reset_attempt")
    .delete()
    .eq("email_hash", emailHash);
}
