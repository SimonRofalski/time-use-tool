import { NextRequest, NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { hashResetChallengeToken } from "@/lib/security-questions-server";
import { getApiLocale } from "@/lib/i18n/api-locale";

type CompleteBody = {
  token?: string;
  password?: string;
};

export async function POST(request: NextRequest) {
  const t = await getTranslations({
    locale: getApiLocale(request),
    namespace: "apiErrors.passwordResetComplete",
  });
  const body = (await request.json()) as CompleteBody;

  if (!body.token || !body.password) {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }

  if (body.password.length < 6) {
    return NextResponse.json(
      { error: t("passwordTooShort") },
      { status: 400 },
    );
  }

  const adminSupabase = createSupabaseAdminClient();
  const tokenHash = hashResetChallengeToken(body.token);

  const { data: challenge, error: challengeError } = await adminSupabase
    .from("security_question_reset_challenge")
    // The profile comes from the challenge row (found via the token hash) —
    // the client never sends or sees a profile ID
    .select(
      "security_question_reset_challenge_id, profiles_id, expires_at, consumed_at",
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (challengeError || !challenge) {
    return NextResponse.json(
      { error: t("invalidOrExpiredLink") },
      { status: 401 },
    );
  }

  if (challenge.consumed_at || new Date(challenge.expires_at) < new Date()) {
    return NextResponse.json(
      { error: t("invalidOrExpiredLink") },
      { status: 401 },
    );
  }

  const { error: updateUserError } =
    await adminSupabase.auth.admin.updateUserById(challenge.profiles_id, {
      password: body.password,
    });

  if (updateUserError) {
    return NextResponse.json(
      { error: updateUserError.message },
      { status: 400 },
    );
  }

  await adminSupabase
    .from("security_question_reset_challenge")
    .update({ consumed_at: new Date().toISOString() })
    .eq(
      "security_question_reset_challenge_id",
      challenge.security_question_reset_challenge_id,
    );

  return NextResponse.json({ success: true });
}
