import { NextRequest, NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import { hashSecurityAnswer } from "@/lib/security-questions-server";
import { getApiLocale } from "@/lib/i18n/api-locale";

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  return authHeader.slice(7).trim() || null;
}

export async function GET(request: NextRequest) {
  const t = await getTranslations({
    locale: getApiLocale(request),
    namespace: "apiErrors.securityQuestions",
  });
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: t("notAuthenticated") }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("user_security_question")
    .select("user_security_question_id")
    .eq("profiles_id", user.id);

  if (error) {
    return NextResponse.json({ error: t("loadError") }, { status: 500 });
  }

  return NextResponse.json({ hasCompleted: (data?.length ?? 0) === 2 });
}

export async function POST(request: NextRequest) {
  const t = await getTranslations({
    locale: getApiLocale(request),
    namespace: "apiErrors.securityQuestions",
  });

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user: cookieUser },
    } = await supabase.auth.getUser();

    let user = cookieUser;

    if (!user) {
      const bearerToken = getBearerToken(request);
      if (bearerToken) {
        const {
          data: { user: headerUser },
        } = await supabase.auth.getUser(bearerToken);
        user = headerUser;
      }
    }

    if (!user) {
      return NextResponse.json({ error: t("notAuthenticated") }, { status: 401 });
    }

    let body: {
      answers?: Array<{ questionId: number; answer: string }>;
    };

    try {
      body = (await request.json()) as {
        answers?: Array<{ questionId: number; answer: string }>;
      };
    } catch {
      return NextResponse.json(
        { error: t("invalidRequest") },
        { status: 400 },
      );
    }

    if (!body.answers || body.answers.length !== 2) {
      return NextResponse.json(
        { error: t("needTwoQuestions") },
        { status: 400 },
      );
    }

    const distinctQuestionIds = new Set(
      body.answers.map((entry) => entry.questionId),
    );

    if (
      distinctQuestionIds.size !== 2 ||
      body.answers.some(
        (entry) =>
          !Number.isInteger(entry.questionId) ||
          entry.questionId <= 0 ||
          entry.answer.trim().length === 0,
      )
    ) {
      return NextResponse.json(
        { error: t("needTwoDifferentQuestions") },
        { status: 400 },
      );
    }

    const { error: deleteError } = await supabase
      .from("user_security_question")
      .delete()
      .eq("profiles_id", user.id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    const { error: insertError } = await supabase
      .from("user_security_question")
      .insert(
        body.answers.map((entry) => ({
          profiles_id: user.id,
          security_question_id: entry.questionId,
          answer_hash: hashSecurityAnswer(entry.answer),
        })),
      );

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("security-questions POST error", error);
    return NextResponse.json(
      { error: t("internalError") },
      { status: 500 },
    );
  }
}
