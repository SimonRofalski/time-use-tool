import { NextRequest, NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import {
  createResetChallengeToken,
  getResetChallengeExpirationDate,
  hashResetChallengeToken,
  verifySecurityAnswer,
} from "@/lib/security-questions-server";
import {
  clearResetAttempts,
  hashResetEmail,
  isResetLocked,
  recordFailedResetAttempt,
  resolveProfileIdByEmail,
} from "@/lib/password-reset-server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getApiLocale } from "@/lib/i18n/api-locale";

type VerifyBody = {
  email?: string;
  answers?: Array<{ questionId: number; answer: string }>;
};

// Checks the two answers. Unknown emails, accounts without questions and
// wrong answers all get the same response, and every failure counts towards
// the lock (5 within 15 minutes, see lib/password-reset-server.ts).
export async function POST(request: NextRequest) {
  const t = await getTranslations({
    locale: getApiLocale(request),
    namespace: "apiErrors.passwordResetVerify",
  });
  const body = (await request.json()) as VerifyBody;
  const email = body.email?.trim();

  if (!email || !body.answers || body.answers.length !== 2) {
    return NextResponse.json(
      { error: t("answerBothRequired") },
      { status: 400 },
    );
  }

  const admin = createSupabaseAdminClient();
  const emailHash = hashResetEmail(email);

  if (await isResetLocked(admin, emailHash)) {
    return NextResponse.json(
      { error: t("tooManyAttempts") },
      { status: 429 },
    );
  }

  const profileId = await resolveProfileIdByEmail(admin, email);
  const { data: storedRows } = profileId
    ? await admin
        .from("user_security_question")
        .select("security_question_id, answer_hash")
        .eq("profiles_id", profileId)
    : { data: null };

  const answerMap = new Map(
    body.answers.map((entry) => [entry.questionId, entry.answer]),
  );
  const allAnswersMatch =
    !!storedRows &&
    storedRows.length === 2 &&
    storedRows.every((row) => {
      const candidate = answerMap.get(row.security_question_id) ?? "";
      return verifySecurityAnswer(candidate, row.answer_hash);
    });

  if (!profileId || !allAnswersMatch) {
    await recordFailedResetAttempt(admin, emailHash);
    return NextResponse.json(
      { error: t("answersDontMatch") },
      { status: 401 },
    );
  }

  await clearResetAttempts(admin, emailHash);

  const rawToken = createResetChallengeToken();
  const tokenHash = hashResetChallengeToken(rawToken);

  await admin
    .from("security_question_reset_challenge")
    .delete()
    .eq("profiles_id", profileId)
    .is("consumed_at", null);

  const { error: insertError } = await admin
    .from("security_question_reset_challenge")
    .insert({
      profiles_id: profileId,
      token_hash: tokenHash,
      expires_at: getResetChallengeExpirationDate(),
    });

  if (insertError) {
    return NextResponse.json(
      { error: t("resetPrepareFailed") },
      { status: 500 },
    );
  }

  // Only the one-time token goes back — the complete step finds the profile
  // through the token, the profile ID never leaves the server
  return NextResponse.json({ token: rawToken });
}
