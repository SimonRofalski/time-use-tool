import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { hashResetChallengeToken } from "@/lib/security-questions-server";

type CompleteBody = {
  token?: string;
  profileId?: string;
  password?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as CompleteBody;

  if (!body.token || !body.profileId || !body.password) {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  if (body.password.length < 6) {
    return NextResponse.json(
      { error: "Passwort muss mindestens 6 Zeichen lang sein." },
      { status: 400 },
    );
  }

  const adminSupabase = createSupabaseAdminClient();
  const tokenHash = hashResetChallengeToken(body.token);

  const { data: challenge, error: challengeError } = await adminSupabase
    .from("security_question_reset_challenge")
    .select("security_question_reset_challenge_id, expires_at, consumed_at")
    .eq("profiles_id", body.profileId)
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (challengeError || !challenge) {
    return NextResponse.json(
      { error: "Der Reset-Link ist ungültig oder abgelaufen." },
      { status: 401 },
    );
  }

  if (challenge.consumed_at || new Date(challenge.expires_at) < new Date()) {
    return NextResponse.json(
      { error: "Der Reset-Link ist ungültig oder abgelaufen." },
      { status: 401 },
    );
  }

  const { error: updateUserError } =
    await adminSupabase.auth.admin.updateUserById(body.profileId, {
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
