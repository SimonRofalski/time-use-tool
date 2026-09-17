"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

export default function ResetPasswordPage() {
  const t = useTranslations("resetPassword");
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    // Check if we have a valid session/token from the recovery link
    const checkToken = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setHasToken(true);
      } else {
        setStatus(t("invalidToken"));
      }
    };

    checkToken();
  }, [supabase, t]);

  async function handleResetPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus("");
    setIsSuccess(false);

    if (password !== confirmPassword) {
      setStatus(t("passwordMismatch"));
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setStatus(t("passwordTooShort"));
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password: password,
    });

    if (error) {
      const msg = error.message.includes("different from the old")
        ? t("samePasswordError")
        : error.message;
      setStatus(msg);
      setLoading(false);
    } else {
      setStatus(t("successMessage"));
      setIsSuccess(true);
      setTimeout(() => {
        router.push("/");
      }, 2000);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/login-bg.svg')" }}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-slate-800">
            {t("brand")}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{t("subtitle")}</p>
        </div>

        {hasToken ? (
          <form
            onSubmit={handleResetPassword}
            className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                {t("newPasswordLabel")}
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={6}
                  className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder={t("newPasswordPlaceholder")}
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                {t("confirmPasswordLabel")}
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  minLength={6}
                  className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder={t("confirmPasswordPlaceholder")}
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-5 w-full rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {loading ? t("submitButtonLoading") : t("submitButton")}
            </button>

            {status && (
              <p
                className={`mt-3 text-center text-sm ${
                  isSuccess ? "text-green-600" : "text-slate-600"
                }`}
                role="status"
              >
                {status}
              </p>
            )}
          </form>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-center text-sm text-slate-500">
              {status || t("checking")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
