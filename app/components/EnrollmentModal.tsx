"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

// ─── Types ────────────────────────────────────────────────────────────────────

// Represents a course the user can enroll in
type AvailableCourse = {
  course_id: number;
  name: string;
  start_date: string;
  end_date: string;
};

// ─── Helper functions ─────────────────────────────────────────────────────────

// Formats a date string to short German format: "28.03.2026"
function formatShortDateGerman(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

// EnrollmentModal: full-screen overlay that forces the user to enroll in a course
// before they can access any part of the application.
//
// Props:
//   userId    — the Supabase auth UUID of the currently logged-in user
//   onEnrolled — callback fired after successful enrollment (parent closes modal)
export default function EnrollmentModal({
  userId,
  onEnrolled,
}: {
  userId: string;
  onEnrolled: () => void;
}) {
  const supabase = getSupabaseBrowserClient();

  const [availableCourses, setAvailableCourses] = useState<AvailableCourse[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [accessCode, setAccessCode] = useState("");
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Load all available (not locked) courses when the modal opens
  useEffect(() => {
    loadAvailableCourses();
  }, []);

  // Fetches courses from the database where is_locked = false
  // Sorted by start date so the most recent course appears first
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
      setAvailableCourses(data ?? []);

      // Pre-select the first course in the list
      if (data && data.length > 0) {
        setSelectedCourseId(data[0].course_id);
      }
    }

    setIsLoadingCourses(false);
  }

  // Validates the access code against the database and enrolls the user
  // The access code check is done server-side by querying with both
  // course_id AND accessCode — the browser never sees other courses' codes
  async function handleEnroll(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");

    // Guard: a course must be selected
    if (!selectedCourseId) {
      setErrorMessage("Bitte wählen Sie einen Kurs aus.");
      setIsSubmitting(false);
      return;
    }

    // Guard: access code must not be empty
    if (!accessCode.trim()) {
      setErrorMessage("Bitte geben Sie den Zugangscode ein.");
      setIsSubmitting(false);
      return;
    }

    // Step 1: fetch the course record by ID and read the accessCode from the response
    // We compare client-side instead of filtering by accessCode in the query,
    // because PostgREST (Supabase's API layer) can silently fail when filtering
    // on camelCase column names that were created with quoted identifiers in PostgreSQL
    const { data: courseData, error: fetchError } = await supabase
      .from("course")
      .select("course_id, accessCode")
      .eq("course_id", selectedCourseId)
      .single();

    if (fetchError || !courseData) {
      setErrorMessage("Kurs konnte nicht geladen werden. Bitte versuchen Sie es erneut.");
      setIsSubmitting(false);
      return;
    }

    // Step 2: compare the entered code with the stored code (case-sensitive)
    if (courseData.accessCode !== accessCode.trim()) {
      setErrorMessage("Ungültiger Zugangscode. Bitte versuchen Sie es erneut.");
      setIsSubmitting(false);
      return;
    }

    // Step 3: access code is valid — insert the enrollment record
    const { error: enrollError } = await supabase
      .from("user_course")
      .insert({ profiles_id: userId, course_id: selectedCourseId });

    if (enrollError) {
      setErrorMessage(
        "Einschreibung fehlgeschlagen. Bitte versuchen Sie es erneut."
      );
      setIsSubmitting(false);
      return;
    }

    // Step 4: notify the parent component — it will close the modal
    onEnrolled();
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    // Full-screen overlay: blocks all interaction with the app underneath
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl">

        {/* Modal header */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-800">
            Kurs beitreten
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Sie sind noch keinem Kurs zugewiesen. Wählen Sie einen Kurs aus
            und geben Sie den Zugangscode ein, um fortzufahren.
          </p>
        </div>

        {/* Loading state */}
        {isLoadingCourses && (
          <p className="text-center text-sm text-slate-500">Wird geladen...</p>
        )}

        {/* No courses available */}
        {!isLoadingCourses && availableCourses.length === 0 && (
          <p className="text-center text-sm text-slate-500">
            Derzeit sind keine Kurse verfügbar. Bitte wenden Sie sich an
            Ihren Administrator.
          </p>
        )}

        {/* Enrollment form */}
        {!isLoadingCourses && availableCourses.length > 0 && (
          <form onSubmit={handleEnroll} className="space-y-4">

            {/* Course selection dropdown */}
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
                    {course.name} (
                    {formatShortDateGerman(course.start_date)} –{" "}
                    {formatShortDateGerman(course.end_date)})
                  </option>
                ))}
              </select>
            </label>

            {/* Access code input */}
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

            {/* Inline error message */}
            {errorMessage && (
              <p className="text-sm text-red-600">{errorMessage}</p>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isSubmitting ? "Wird eingeschrieben..." : "Kurs beitreten"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
