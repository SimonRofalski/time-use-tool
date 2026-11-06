import { NextRequest, NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getApiLocale } from "@/lib/i18n/api-locale";
import {
  pickDecoyQuestionIds,
  resolveProfileIdByEmail,
} from "@/lib/password-reset-server";

type QuestionRow = {
  security_question_id: number;
  question_text: string;
};

// Returns the two security questions for an email. Always answers the same
// way — for unknown emails (or accounts without two questions) it returns two
// stable decoy questions — so this endpoint can't be used to find out which
// emails have an account. The profile ID is never returned; the verify step
// takes the email again. See lib/password-reset-server.ts.
export async function POST(request: NextRequest) {
  const t = await getTranslations({
    locale: getApiLocale(request),
    namespace: "apiErrors.passwordResetSecurityQuestions",
  });

  try {
    const body = (await request.json()) as { email?: string };
    const email = body.email?.trim();

    if (!email) {
      return NextResponse.json(
        { error: t("emailRequired") },
        { status: 400 },
      );
    }

    const admin = createSupabaseAdminClient();

    const { data: allQuestions, error: allQuestionsError } = await admin
      .from("security_question")
      .select("security_question_id, question_text")
      .order("sort_order", { ascending: true });
    if (allQuestionsError || !allQuestions) {
      return NextResponse.json({ error: t("loadError") }, { status: 500 });
    }
    const questionById = new Map(
      (allQuestions as QuestionRow[]).map((q) => [q.security_question_id, q]),
    );

    let questionIds: number[] = [];
    const profileId = await resolveProfileIdByEmail(admin, email);
    if (profileId) {
      const { data: ownQuestions, error: ownQuestionsError } = await admin
        .from("user_security_question")
        .select("security_question_id")
        .eq("profiles_id", profileId)
        .order("created_at", { ascending: true });
      if (ownQuestionsError) {
        return NextResponse.json({ error: t("loadError") }, { status: 500 });
      }
      if (ownQuestions?.length === 2) {
        questionIds = ownQuestions.map((row) => row.security_question_id);
      }
    }

    if (questionIds.length !== 2) {
      questionIds = pickDecoyQuestionIds(
        email,
        (allQuestions as QuestionRow[]).map((q) => q.security_question_id),
      );
    }

    return NextResponse.json({
      questions: questionIds.map((id) => ({
        questionId: id,
        questionText: questionById.get(id)?.question_text ?? "",
      })),
    });
  } catch (error) {
    console.error("password-reset security-questions POST error", error);
    return NextResponse.json({ error: t("loadError") }, { status: 500 });
  }
}
