import { NextRequest, NextResponse } from "next/server";
import {
  createResetChallengeToken,
  getResetChallengeExpirationDate,
  hashResetChallengeToken,
  verifySecurityAnswer,
} from "@/lib/security-questions-server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";

type VerifyBody = {
  profileId?: string;
  answers?: Array<{ questionId: number; answer: string }>;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as VerifyBody;

  if (!body.profileId || !body.answers || body.answers.length !== 2) {
    return NextResponse.json(
      { error: "Bitte beantworte beide Sicherheitsfragen." },
      { status: 400 },
    );
  }

  const adminSupabase = createSupabaseAdminClient();
  const { data: storedRows, error: storedError } = await adminSupabase
    .from("user_security_question")
    .select("security_question_id, answer_hash")
    .eq("profiles_id", body.profileId);

  if (storedError || (storedRows?.length ?? 0) !== 2) {
    return NextResponse.json(
      { error: "Sicherheitsfragen konnten nicht geprüft werden." },
      { status: 400 },
    );
  }

  const answerMap = new Map(
    body.answers.map((entry) => [entry.questionId, entry.answer]),
  );

  const allAnswersMatch = storedRows.every((row) => {
    const candidate = answerMap.get(row.security_question_id) ?? "";
    return verifySecurityAnswer(candidate, row.answer_hash);
  });

  if (!allAnswersMatch) {
    return NextResponse.json(
      {
        error:
          "Die Antworten stimmen nicht mit den hinterlegten Angaben überein.",
      },
      { status: 401 },
    );
  }

  const rawToken = createResetChallengeToken();
  const tokenHash = hashResetChallengeToken(rawToken);

  await adminSupabase
    .from("security_question_reset_challenge")
    .delete()
    .eq("profiles_id", body.profileId)
    .is("consumed_at", null);

  const { error: insertError } = await adminSupabase
    .from("security_question_reset_challenge")
    .insert({
      profiles_id: body.profileId,
      token_hash: tokenHash,
      expires_at: getResetChallengeExpirationDate(),
    });

  if (insertError) {
    return NextResponse.json(
      { error: "Reset konnte nicht vorbereitet werden." },
      { status: 500 },
    );
  }

  return NextResponse.json({ token: rawToken, profileId: body.profileId });
}
