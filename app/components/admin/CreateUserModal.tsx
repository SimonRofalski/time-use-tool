"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

type CreateUserModalProps = {
  onClose: () => void;
  onCreated: () => void;
};

function generateRandomPassword(): string {
  return Math.random().toString(36).slice(-5) + Math.random().toString(36).slice(-5);
}

export default function CreateUserModal({ onClose, onCreated }: CreateUserModalProps) {
  const t = useTranslations("nutzeruebersicht.createUserModal");
  const tCommon = useTranslations("common");
  const supabase = getSupabaseBrowserClient();

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError(null);
    setSaving(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch("/api/admin/users/create", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({
          email,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          temporaryPassword,
        }),
      });

      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(result.error ?? t("createFailedError"));
        return;
      }

      setCreatedPassword(temporaryPassword);
      onCreated();
    } catch {
      setError(t("networkError"));
    } finally {
      setSaving(false);
    }
  }

  if (createdPassword) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
            {t("createdTitle")}
          </h3>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {t("createdMessage", { email })}
          </p>
          <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
            {createdPassword}
          </p>
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              {tCommon("closeButton")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
          {t("title")}
        </h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t("description")}
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            {t("emailLabel")}
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              {t("firstNameLabel")}
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              {t("lastNameLabel")}
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
          </div>

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
              {saving ? t("creatingButton") : t("createButton")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
