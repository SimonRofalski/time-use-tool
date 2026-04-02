"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { useRouter } from "next/navigation";

type AvailableCourse = {
  course_id: number;
  name: string;
  start_date: string;
  end_date: string;
};

function formatShortDateGerman(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("de-DE", {
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
      setErrorMessage("Kurse konnten nicht geladen werden.");
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
      setErrorMessage("Bitte wählen Sie einen Kurs aus.");
      setIsSubmitting(false);
      return;
    }

    if (!accessCode.trim()) {
      setErrorMessage("Bitte geben Sie den Zugangscode ein.");
      setIsSubmitting(false);
      return;
    }

    const { data: courseData, error: fetchError } = await supabase
      .from("course")
      .select("course_id, accessCode")
      .eq("course_id", selectedCourseId)
      .single();

    if (fetchError || !courseData) {
      setErrorMessage(
        "Kurs konnte nicht geladen werden. Bitte versuchen Sie es erneut.",
      );
      setIsSubmitting(false);
      return;
    }

    if (courseData.accessCode !== accessCode.trim()) {
      setErrorMessage("Ungültiger Zugangscode. Bitte versuchen Sie es erneut.");
      setIsSubmitting(false);
      return;
    }

    const { error: enrollError } = await supabase
      .from("user_course")
      .insert({ profiles_id: userId, course_id: selectedCourseId });

    if (enrollError) {
      setErrorMessage(
        "Einschreibung fehlgeschlagen. Bitte versuchen Sie es erneut.",
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
            Kurs beitreten
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Sie sind noch keinem Kurs zugewiesen. Wählen Sie einen Kurs aus und
            geben Sie den Zugangscode ein, um fortzufahren.
          </p>
        </div>

        {isLoadingCourses && (
          <p className="text-center text-sm text-slate-500">Wird geladen...</p>
        )}

        {!isLoadingCourses && availableCourses.length === 0 && (
          <p className="text-center text-sm text-slate-500">
            Derzeit sind keine Kurse verfügbar. Bitte wenden Sie sich an Ihren
            Administrator.
          </p>
        )}

        {!isLoadingCourses && availableCourses.length > 0 && (
          <form onSubmit={handleEnroll} className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Kurs auswählen
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
                    {course.name} ({formatShortDateGerman(course.start_date)} -{" "}
                    {formatShortDateGerman(course.end_date)})
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Zugangscode
              <input
                type="text"
                value={accessCode}
                onChange={(e) => {
                  setAccessCode(e.target.value);
                  setErrorMessage("");
                }}
                placeholder="Zugangscode eingeben"
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
              {isSubmitting ? "Wird eingeschrieben..." : "Kurs beitreten"}
            </button>
          </form>
        )}

        <button
          type="button"
          onClick={handleBackToLogin}
          className="mt-4 w-full rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:bg-slate-50 hover:text-slate-800"
        >
          Zurück zum Login
        </button>
      </div>
    </div>
  );
}
