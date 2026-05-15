"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

type SecurityQuestionOptionRow = {
  security_question_id: number;
  question_text: string;
};

type ExistingUserSecurityQuestionRow = {
  user_security_question_id: string;
  security_question_id: number;
};

type SecurityQuestionsFormProps = {
  requireCompletion?: boolean;
  allowEditToggle?: boolean;
  onSaved?: () => Promise<void> | void;
};

type FormRow = {
  questionId: string;
  answer: string;
};

const INITIAL_ROWS: FormRow[] = [
  { questionId: "", answer: "" },
  { questionId: "", answer: "" },
];

export default function SecurityQuestionsForm({
  requireCompletion = false,
  allowEditToggle = false,
  onSaved,
}: SecurityQuestionsFormProps) {
  const supabase = getSupabaseBrowserClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(requireCompletion);
  const [options, setOptions] = useState<SecurityQuestionOptionRow[]>([]);
  const [existingRows, setExistingRows] = useState<
    ExistingUserSecurityQuestionRow[]
  >([]);
  const [rows, setRows] = useState<FormRow[]>(INITIAL_ROWS);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setSaveError(null);

    const [{ data: userData }, { data: optionRows, error: optionError }] =
      await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from("security_question")
          .select("security_question_id, question_text")
          .order("sort_order", { ascending: true })
          .order("security_question_id", { ascending: true }),
      ]);

    if (optionError || !optionRows) {
      setSaveError("Sicherheitsfragen konnten nicht geladen werden.");
      setLoading(false);
      return;
    }

    const currentUser = userData.user;

    setOptions(optionRows);

    if (!currentUser) {
      setSaveError("Nutzer konnte nicht geladen werden.");
      setLoading(false);
      return;
    }

    const { data: existing, error: existingError } = await supabase
      .from("user_security_question")
      .select("user_security_question_id, security_question_id")
      .eq("profiles_id", currentUser.id)
      .order("created_at", { ascending: true });

    if (existingError) {
      setSaveError("Sicherheitsfragen konnten nicht geladen werden.");
      setLoading(false);
      return;
    }

    const normalizedExisting = existing ?? [];
    setExistingRows(normalizedExisting);
    setRows(
      normalizedExisting.length === 2
        ? normalizedExisting.map((entry) => ({
            questionId: String(entry.security_question_id),
            answer: "",
          }))
        : INITIAL_ROWS,
    );
    setLoading(false);
  }

  const isComplete = useMemo(
    () => rows.every((row) => row.questionId.trim() && row.answer.trim()),
    [rows],
  );

  const hasDuplicateQuestion = useMemo(() => {
    const selected = rows
      .map((row) => row.questionId)
      .filter((questionId) => questionId.length > 0);
    return new Set(selected).size !== selected.length;
  }, [rows]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) {
      return;
    }

    setSaveError(null);

    if (!isComplete) {
      setSaveError(
        "Bitte wähle zwei Fragen und gib beide Antworten an.",
      );
      return;
    }

    if (hasDuplicateQuestion) {
      setSaveError(
        "Bitte wähle zwei unterschiedliche Sicherheitsfragen aus.",
      );
      return;
    }

    setSaving(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const currentUser = userData.user;
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!currentUser) {
        setSaveError("Nutzer konnte nicht geladen werden.");
        return;
      }

      const payload = rows.map((row) => ({
        questionId: Number(row.questionId),
        answer: row.answer,
      }));

      const authHeaders = {
        ...(session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {}),
      };

      const response = await fetch("/api/security-questions", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({ answers: payload }),
      });

      let result: { error?: string } = {};
      try {
        result = (await response.json()) as { error?: string };
      } catch {
        result = { error: "Unerwartete Serverantwort beim Speichern." };
      }

      if (!response.ok) {
        setSaveError(
          result.error ??
            `Sicherheitsfragen konnten nicht gespeichert werden (Status ${response.status}).`,
        );
        return;
      }

      // Verify persistence so UI cannot show false positive success.
      const verifyResponse = await fetch("/api/security-questions", {
        method: "GET",
        credentials: "include",
        headers: authHeaders,
      });

      const verifyResult = (await verifyResponse.json()) as {
        hasCompleted?: boolean;
        error?: string;
      };

      if (!verifyResponse.ok || verifyResult.hasCompleted !== true) {
        setSaveError(
          verifyResult.error ??
            "Speichern wurde ausgeführt, konnte aber nicht bestätigt werden. Bitte erneut versuchen.",
        );
        return;
      }

      setExistingRows(
        payload.map((entry, index) => ({
          user_security_question_id: `${index}`,
          security_question_id: entry.questionId,
        })),
      );
      setRows(rows.map((row) => ({ ...row, answer: "" })));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      if (allowEditToggle && !requireCompletion) {
        setIsEditing(false);
      }
      await onSaved?.();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Netzwerkfehler beim Speichern der Sicherheitsfragen.";
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-slate-500">
        Sicherheitsfragen werden geladen…
      </div>
    );
  }

  const canEdit = requireCompletion || isEditing;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Sicherheitsfragen
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Wähle zwei unterschiedliche Fragen aus und beantworte
              sie möglichst mit einem kurzen Wort.
            </p>
            {existingRows.length === 2 && (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Sicherheitsfragen sind hinterlegt. Antworten werden aus
                Sicherheitsgründen nicht angezeigt und müssen bei einer Änderung
                neu eingegeben werden.
              </p>
            )}
          </div>
          {allowEditToggle && !requireCompletion && (
            <button
              type="button"
              onClick={() => {
                setIsEditing((current) => !current);
                setSaveError(null);
              }}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800"
            >
              {isEditing ? "Abbrechen" : "Bearbeiten"}
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {rows.map((row, index) => (
            <div
              key={`security-row-${index}`}
              className="grid gap-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]"
            >
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Frage {index + 1}
                <select
                  value={row.questionId}
                  onChange={(event) => {
                    const value = event.target.value;
                    setRows((previous) =>
                      previous.map((entry, entryIndex) =>
                        entryIndex === index
                          ? { ...entry, questionId: value }
                          : entry,
                      ),
                    );
                    setSaveError(null);
                  }}
                  disabled={!canEdit}
                  className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-800"
                >
                  <option value="">Bitte auswählen</option>
                  {options.map((option) => (
                    <option
                      key={option.security_question_id}
                      value={option.security_question_id}
                      disabled={rows.some(
                        (entry, entryIndex) =>
                          entryIndex !== index &&
                          entry.questionId ===
                            String(option.security_question_id),
                      )}
                    >
                      {option.question_text}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Antwort
                <input
                  type="text"
                  value={row.answer}
                  onChange={(event) => {
                    const value = event.target.value;
                    setRows((previous) =>
                      previous.map((entry, entryIndex) =>
                        entryIndex === index
                          ? { ...entry, answer: value }
                          : entry,
                      ),
                    );
                    setSaveError(null);
                  }}
                  disabled={!canEdit}
                  autoComplete="off"
                  className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-800"
                  placeholder={
                    canEdit
                      ? "Kurze Antwort"
                      : "Aus Sicherheitsgründen ausgeblendet"
                  }
                />
              </label>
            </div>
          ))}

          {saveError && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {saveError}
            </p>
          )}

          {saved && (
            <p className="text-sm text-green-600 dark:text-green-400">
              Sicherheitsfragen wurden gespeichert.
            </p>
          )}

          {canEdit && (
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-slate-800 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {saving ? "Wird gespeichert..." : "Sicherheitsfragen speichern"}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
