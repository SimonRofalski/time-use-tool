import { NextRequest, NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getApiLocale } from "@/lib/i18n/api-locale";

async function resolveProfileIdByEmail(
  email: string,
  supabase: ReturnType<typeof createSupabaseAdminClient>,
) {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  if (!profileError && profile) {
    return profile.id;
  }

  // Fallback for older datasets where profiles.email is not backfilled.
  const normalizedEmail = email.toLowerCase();
  let page = 1;

  while (page <= 10) {
    const { data: listedUsers, error: listUsersError } =
      await supabase.auth.admin.listUsers({
        page,
        perPage: 200,
      });

    if (listUsersError) {
      return null;
    }

    const matchedUser = listedUsers.users.find(
      (user) => user.email?.toLowerCase() === normalizedEmail,
    );

    if (matchedUser?.id) {
      return matchedUser.id;
    }

    if (listedUsers.users.length < 200) {
      break;
    }

    page += 1;
  }

  return null;
}

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

    const supabase = createSupabaseAdminClient();
    const profileId = await resolveProfileIdByEmail(email, supabase);

    if (!profileId) {
      return NextResponse.json(
        { error: t("accountNotFound") },
        { status: 404 },
      );
    }

    const { data: questions, error: questionError } = await supabase
      .from("user_security_question")
      .select(
        "security_question_id, security_question:security_question_id(question_text)",
      )
      .eq("profiles_id", profileId)
      .order("created_at", { ascending: true });

    if (questionError) {
      return NextResponse.json(
        { error: t("loadError") },
        { status: 500 },
      );
    }

    if ((questions?.length ?? 0) !== 2) {
      return NextResponse.json(
        { error: t("notTwoQuestionsSet") },
        { status: 409 },
      );
    }

    return NextResponse.json({
      profileId,
      questions: (questions ?? []).map((entry) => {
        const questionRelation = entry.security_question as
          | { question_text?: string }
          | { question_text?: string }[]
          | null;

        return {
          questionId: entry.security_question_id,
          questionText: Array.isArray(questionRelation)
            ? (questionRelation[0]?.question_text ?? "")
            : (questionRelation?.question_text ?? ""),
        };
      }),
    });
  } catch (error) {
    console.error("password-reset security-questions POST error", error);
    return NextResponse.json(
      { error: t("loadError") },
      { status: 500 },
    );
  }
}
