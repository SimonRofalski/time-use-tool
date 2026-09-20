"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

type SetPasswordModalProps = {
  userId: string;
  userLabel: string;
  isSwitchEduIdAccount: boolean;
  onClose: () => void;
  onSaved: () => void;
};

function generateRandomPassword(): string {
  return Math.random().toString(36).slice(-5) + Math.random().toString(36).slice(-5);
}

export default function SetPasswordModal({
  userId,
  userLabel,
  isSwitchEduIdAccount,
  onClose,
  onSaved,
}: SetPasswordModalProps) {
  const t = useTranslations("nutzeruebersicht.setPasswordModal");
  const tCommon = useTranslations("common");
  const supabase = getSupabaseBrowserClient();

  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [force, setForce] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsForceConfirm, setNeedsForceConfirm] = useState(false);

  async function submit(withForce: boolean) {
    setError(null);
    setSaving(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch("/api/admin/users/set-password", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({ userId, temporaryPassword, force: withForce }),
      });

      const result = (await response.json()) as { error?: string };

      if (response.status === 409 && !withForce) {
        setNeedsForceConfirm(true);
        return;
      }

      if (!response.ok) {
        setError(result.error ?? t("saveFailedError"));
        return;
      }

      onSaved();
    } catch {
      setError(t("networkError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    await submit(isSwitchEduIdAccount || force);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
          {t("title")}
        </h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t("description", { name: userLabel })}
        </p>

        {isSwitchEduIdAccount && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            {t("switchEduIdWarning")}
          </p>
        )}

        {needsForceConfirm ? (
          <div className="mt-4 space-y-3">
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              {t("switchEduIdWarning")}
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600"
              >
                {tCommon("cancelButton")}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setForce(true);
                  void submit(true);
                }}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {t("forceConfirmButton")}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              {t("temporaryPasswordLabel")}
              <div className="mt-1.5 flex gap-2">
                <input
                  type="text"
                  required
                  minLength={6}
                  value={temporaryPassword}
                  onChange={(e) => setTemporaryPassword(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => setTemporaryPassword(generateRandomPassword())}
                  className="whitespace-nowrap rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600"
                >
                  {t("generateButton")}
                </button>
              </div>
            </label>

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600"
              >
                {tCommon("cancelButton")}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {saving ? t("savingButton") : t("saveButton")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
