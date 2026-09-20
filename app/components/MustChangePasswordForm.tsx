"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

type MustChangePasswordFormProps = {
  onSaved?: () => Promise<void> | void;
};

export default function MustChangePasswordForm({
  onSaved,
}: MustChangePasswordFormProps) {
  const t = useTranslations("mustChangePassword");
  const supabase = getSupabaseBrowserClient();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) {
      return;
    }

    setSaveError(null);

    if (newPassword.length < 6) {
      setSaveError(t("passwordTooShort"));
      return;
    }

    if (newPassword !== confirmPassword) {
      setSaveError(t("passwordMismatch"));
      return;
    }

    setSaving(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({ newPassword }),
      });

      let result: { error?: string } = {};
      try {
        result = (await response.json()) as { error?: string };
      } catch {
        result = { error: t("unexpectedServerResponse") };
      }

      if (!response.ok) {
        setSaveError(result.error ?? t("saveFailedError"));
        return;
      }

      await onSaved?.();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("networkError");
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {t("title")}
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t("description")}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            {t("newPasswordLabel")}
            <input
              type="password"
              value={newPassword}
              onChange={(event) => {
                setNewPassword(event.target.value);
                setSaveError(null);
              }}
              autoComplete="new-password"
              className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            {t("confirmPasswordLabel")}
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                setSaveError(null);
              }}
              autoComplete="new-password"
              className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>

          {saveError && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {saveError}
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-slate-800 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {saving ? t("savingButton") : t("saveButton")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
