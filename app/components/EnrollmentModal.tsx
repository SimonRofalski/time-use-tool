"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { useRouter } from "next/navigation";

type AvailableCourse = {
  course_id: number;
  name: string;
  start_date: string;
  end_date: string;
};

function formatShortDate(dateString: string, locale: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(locale === "en" ? "en-US" : "de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function EnrollmentModal({
  userId,
  onEnrolled,
}: {
  userId: string;
  onEnrolled: () => void;
}) {
  const t = useTranslations("enrollmentModal");
  const locale = useLocale();
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();

  async function handleBackToLogin() {
    await supabase.auth.signOut();
    router.push("/");
  }

  const [availableCourses, setAvailableCourses] = useState<AvailableCourse[]>(
    [],
  );
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [accessCode, setAccessCode] = useState("");
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    loadAvailableCourses();
  }, []);

  async function loadAvailableCourses() {
    setIsLoadingCourses(true);

    const { data, error } = await supabase
      .from("course")
      .select("course_id, name, start_date, end_date")
      .eq("is_locked", false)
      .order("start_date", { ascending: false });

    if (error) {
      setErrorMessage(t("loadCoursesError"));
    } else {
      const courses = (data ?? []) as AvailableCourse[];
      setAvailableCourses(courses);
      if (courses.length > 0) {
        setSelectedCourseId(courses[0].course_id);
      }
    }

    setIsLoadingCourses(false);
  }

  async function handleEnroll(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");

    if (!selectedCourseId) {
      setErrorMessage(t("selectCourseError"));
      setIsSubmitting(false);
      return;
    }

    if (!accessCode.trim()) {
      setErrorMessage(t("enterAccessCodeError"));
      setIsSubmitting(false);
      return;
    }

    // The access code is checked server-side — the codes are not readable
    // from the browser (see app/api/courses/enroll/route.ts)
    let errorCode: string | null = null;
    try {
      const response = await fetch("/api/courses/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: selectedCourseId,
          accessCode: accessCode.trim(),
        }),
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        errorCode = result.error ?? "enroll_failed";
      }
    } catch {
      errorCode = "enroll_failed";
    }

    if (errorCode) {
      setErrorMessage(
        errorCode === "invalid_code"
          ? t("invalidAccessCodeError")
          : errorCode === "course_load_failed"
            ? t("courseLoadRetryError")
            : t("enrollFailedError"),
      );
      setIsSubmitting(false);
      return;
    }

    onEnrolled();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-800">
            {t("title")}
          </h2>
          <p className="mt-1 text-sm text-slate-500">{t("description")}</p>
        </div>

        {isLoadingCourses && (
          <p className="text-center text-sm text-slate-500">{t("loading")}</p>
        )}

        {!isLoadingCourses && availableCourses.length === 0 && (
          <p className="text-center text-sm text-slate-500">
            {t("noCoursesAvailable")}
          </p>
        )}

        {!isLoadingCourses && availableCourses.length > 0 && (
          <form onSubmit={handleEnroll} className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              {t("selectCourseLabel")}
              <select
                value={selectedCourseId ?? ""}
                onChange={(e) => {
                  setSelectedCourseId(Number(e.target.value));
                  setErrorMessage("");
                }}
                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {availableCourses.map((course) => (
                  <option key={course.course_id} value={course.course_id}>
                    {course.name} ({formatShortDate(course.start_date, locale)} -{" "}
                    {formatShortDate(course.end_date, locale)})
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-slate-700">
              {t("accessCodeLabel")}
              <input
                type="text"
                value={accessCode}
                onChange={(e) => {
                  setAccessCode(e.target.value);
                  setErrorMessage("");
                }}
                placeholder={t("accessCodePlaceholder")}
                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </label>

            {errorMessage && (
              <p className="text-sm text-red-600">{errorMessage}</p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isSubmitting ? t("submittingButton") : t("submitButton")}
            </button>
          </form>
        )}

        <button
          type="button"
          onClick={handleBackToLogin}
          className="mt-4 w-full rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:bg-slate-50 hover:text-slate-800"
        >
          {t("backToLoginButton")}
        </button>
      </div>
    </div>
  );
}
