"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

type Mode = "signin" | "signup" | "forgot-password";

type ResetQuestion = {
  questionId: number;
  questionText: string;
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function renderStatus(status: string, tone: "error" | "success") {
  if (!status) {
    return null;
  }

  return (
    <p
      className={`mt-3 text-center text-sm ${
        tone === "success" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
      }`}
      role="status"
    >
      {status}
    </p>
  );
}

export default function Home() {
  const t = useTranslations("login");
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<"error" | "success">("error");
  const [emailHasError, setEmailHasError] = useState(false);
  const [passwordHasError, setPasswordHasError] = useState(false);
  const [resetProfileId, setResetProfileId] = useState<string | null>(null);
  const [resetQuestions, setResetQuestions] = useState<ResetQuestion[]>([]);
  const [resetAnswers, setResetAnswers] = useState(["", ""]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [resetToken, setResetToken] = useState<string | null>(null);
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();

  const modeContent: Record<Mode, { title: string; submitLabel: string }> = {
    signin: {
      title: t("modes.signin.title"),
      submitLabel: t("modes.signin.submitLabel"),
    },
    signup: {
      title: t("modes.signup.title"),
      submitLabel: t("modes.signup.submitLabel"),
    },
    "forgot-password": {
      title: t("modes.forgotPassword.title"),
      submitLabel: t("modes.forgotPassword.submitLabel"),
    },
  };
  const currentMode = modeContent[mode];

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.push("/erfasste-zeit");
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) router.push("/erfasste-zeit");
      },
    );
    return () => listener?.subscription.unsubscribe();
  }, [supabase, router]);

  const handleModeChange = (newMode: Mode) => {
    setMode(newMode);
    setStatus("");
    setStatusTone("error");
    setEmail("");
    setPassword("");
    setResetProfileId(null);
    setResetQuestions([]);
    setResetAnswers(["", ""]);
    setNewPassword("");
    setConfirmNewPassword("");
    setResetToken(null);
    setEmailHasError(false);
    setPasswordHasError(false);
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim();

    setStatus("");
    setStatusTone("error");
    setEmailHasError(false);
    setPasswordHasError(false);

    if (!normalizedEmail) {
      setStatus(t("status.emailRequired"));
      setEmailHasError(true);
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setStatus(t("status.emailInvalid"));
      setEmailHasError(true);
      return;
    }

    if (mode === "forgot-password") {
      const response = await fetch("/api/password-reset/security-questions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const result = (await response.json()) as {
        error?: string;
        profileId?: string;
        questions?: ResetQuestion[];
      };

      if (!response.ok || !result.profileId || !result.questions) {
        setStatus(result.error ?? t("status.securityQuestionsLoadError"));
        setStatusTone("error");
      } else {
        setResetProfileId(result.profileId);
        setResetQuestions(result.questions);
        setStatus("");
      }
      return;
    }

    if (mode === "signup") {
      const { error, data } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
      });
      if (error) {
        setStatus(error.message);
        setStatusTone("error");
      } else if (data.session) {
        router.push("/erfasste-zeit");
      } else {
        setMode("signin");
        setPassword("");
        setPasswordHasError(false);
        setStatus(t("status.accountCreated"));
        setStatusTone("success");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          setStatus(t("status.wrongCredentials"));
          setStatusTone("error");
          setPasswordHasError(true);
        } else {
          setStatus(error.message);
          setStatusTone("error");
        }
      } else {
        router.push("/erfasste-zeit");
      }
    }
  }

  async function handleVerifySecurityAnswers(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!resetProfileId || resetQuestions.length !== 2) {
      setStatus(t("status.securityQuestionsLoadError"));
      setStatusTone("error");
      return;
    }

    if (resetAnswers.some((answer) => answer.trim().length === 0)) {
      setStatus(t("status.answerBothQuestions"));
      setStatusTone("error");
      return;
    }

    const response = await fetch("/api/password-reset/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        profileId: resetProfileId,
        answers: resetQuestions.map((question, index) => ({
          questionId: question.questionId,
          answer: resetAnswers[index],
        })),
      }),
    });

    const result = (await response.json()) as {
      error?: string;
      token?: string;
      profileId?: string;
    };

    if (!response.ok || !result.token) {
      setStatus(result.error ?? t("status.answersCheckError"));
      setStatusTone("error");
      return;
    }

    setResetToken(result.token);
    setStatus("");
  }

  async function handleCompletePasswordReset(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!resetToken || !resetProfileId) {
      setStatus(t("status.resetSessionExpired"));
      setStatusTone("error");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setStatus(t("status.passwordMismatch"));
      setStatusTone("error");
      return;
    }

    if (newPassword.length < 6) {
      setStatus(t("status.passwordTooShort"));
      setStatusTone("error");
      return;
    }

    const response = await fetch("/api/password-reset/complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: resetToken,
        profileId: resetProfileId,
        password: newPassword,
      }),
    });

    const result = (await response.json()) as { error?: string };

    if (!response.ok) {
      setStatus(result.error ?? t("status.passwordSetError"));
      setStatusTone("error");
      return;
    }

    setStatus(t("status.passwordResetSuccess"));
    setStatusTone("success");
    setMode("signin");
    setPassword("");
    setResetProfileId(null);
    setResetQuestions([]);
    setResetAnswers(["", ""]);
    setNewPassword("");
    setConfirmNewPassword("");
    setResetToken(null);
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/login-bg.svg')" }}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icon.svg"
            alt="Time Use Tool"
            className="h-16 w-16 drop-shadow-lg"
          />
          <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">
            {t("brand")}
          </h1>
        </div>

        {mode !== "forgot-password" && (
          <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 p-2 shadow-sm backdrop-blur-sm">
            <button
              type="button"
              onClick={() => handleModeChange("signin")}
              className={`rounded-lg px-4 py-3 text-left text-sm transition ${
                mode === "signin"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-100"
              }`}
            >
              <span className="block font-semibold">
                {t("modes.signin.title")}
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleModeChange("signup")}
              className={`rounded-lg px-4 py-3 text-left text-sm transition ${
                mode === "signup"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-100"
              }`}
            >
              <span className="block font-semibold">
                {t("modes.signup.title")}
              </span>
            </button>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm">
          <h2 className="mb-5 text-center text-lg font-semibold text-slate-900 dark:text-slate-100">
            {currentMode.title}
          </h2>

          {mode !== "forgot-password" && (
            <form onSubmit={handleSubmit} noValidate>
              <div className="space-y-4">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("emailLabel")}
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setStatus("");
                      setEmailHasError(false);
                    }}
                    required
                    inputMode="email"
                    autoComplete="email"
                    pattern="[^\s@]+@[^\s@]+\.[^\s@]+"
                    className={`mt-1.5 w-full rounded-md border bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 ${
                      emailHasError
                        ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                        : "border-slate-300 dark:border-slate-600 focus:border-blue-500 focus:ring-blue-500"
                    }`}
                    placeholder={t("emailPlaceholder")}
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("passwordLabel")}
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setStatus("");
                      setPasswordHasError(false);
                    }}
                    required
                    minLength={6}
                    className={`mt-1.5 w-full rounded-md border bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 ${
                      passwordHasError
                        ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                        : "border-slate-300 dark:border-slate-600 focus:border-blue-500 focus:ring-blue-500"
                    }`}
                    placeholder={t("passwordPlaceholder")}
                  />
                </label>
              </div>

              <button
                type="submit"
                className="mt-5 w-full rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                {currentMode.submitLabel}
              </button>

              {renderStatus(status, statusTone)}
            </form>
          )}

          {mode === "forgot-password" && resetQuestions.length === 0 && (
            <form onSubmit={handleSubmit} noValidate>
              <div className="space-y-4">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("emailLabel")}
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setStatus("");
                      setEmailHasError(false);
                    }}
                    required
                    inputMode="email"
                    autoComplete="email"
                    pattern="[^\s@]+@[^\s@]+\.[^\s@]+"
                    className={`mt-1.5 w-full rounded-md border bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 ${
                      emailHasError
                        ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                        : "border-slate-300 dark:border-slate-600 focus:border-blue-500 focus:ring-blue-500"
                    }`}
                    placeholder={t("emailPlaceholder")}
                  />
                </label>
              </div>

              <button
                type="submit"
                className="mt-5 w-full rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                {t("loadSecurityQuestionsButton")}
              </button>

              {renderStatus(status, statusTone)}
            </form>
          )}

          {mode === "forgot-password" &&
            resetQuestions.length === 2 &&
            !resetToken && (
              <form
                onSubmit={handleVerifySecurityAnswers}
                className="space-y-4"
              >
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("emailLabel")}
                  <input
                    type="email"
                    value={email}
                    readOnly
                    className="mt-1.5 w-full rounded-md border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-500 dark:text-slate-400"
                  />
                </label>

                {resetQuestions.map((question, index) => (
                  <label
                    key={question.questionId}
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    {question.questionText}
                    <input
                      type="text"
                      value={resetAnswers[index]}
                      onChange={(event) => {
                        const value = event.target.value;
                        setResetAnswers((previous) =>
                          previous.map((entry, entryIndex) =>
                            entryIndex === index ? value : entry,
                          ),
                        );
                        setStatus("");
                      }}
                      className="mt-1.5 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder={t("answerPlaceholder")}
                    />
                  </label>
                ))}

                <button
                  type="submit"
                  className="mt-1 w-full rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                >
                  {t("checkAnswersButton")}
                </button>

                {renderStatus(status, statusTone)}
              </form>
            )}

          {mode === "forgot-password" && resetToken && (
            <form onSubmit={handleCompletePasswordReset} className="space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                {t("emailLabel")}
                <input
                  type="email"
                  value={email}
                  readOnly
                  className="mt-1.5 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
                />
              </label>

              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t("newPasswordLabel")}
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => {
                    setNewPassword(event.target.value);
                    setStatus("");
                  }}
                  minLength={6}
                  className="mt-1.5 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder={t("passwordPlaceholder")}
                />
              </label>

              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t("confirmPasswordLabel")}
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(event) => {
                    setConfirmNewPassword(event.target.value);
                    setStatus("");
                  }}
                  minLength={6}
                  className="mt-1.5 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder={t("confirmPasswordPlaceholder")}
                />
              </label>

              <button
                type="submit"
                className="w-full rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                {t("setNewPasswordButton")}
              </button>

              {renderStatus(status, statusTone)}
            </form>
          )}

          <div className="mt-5 flex flex-col gap-3 border-t border-slate-200 dark:border-slate-700 pt-4 text-sm">
            {mode === "signin" ? (
              <>
                <button
                  type="button"
                  onClick={() => handleModeChange("signup")}
                  className="rounded-md border border-blue-200 dark:border-blue-600/40 bg-blue-50 dark:bg-blue-500/10 px-3 py-2 font-medium text-blue-700 dark:text-blue-300 transition hover:bg-blue-100 dark:hover:bg-blue-500/15"
                >
                  {t("noAccountButton")}
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange("forgot-password")}
                  className="text-center text-sm text-slate-500 dark:text-slate-400 transition hover:text-slate-700 dark:hover:text-slate-200"
                >
                  {t("forgotPasswordButton")}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleModeChange("signin")}
                  className="rounded-md border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-3 py-2 font-medium text-slate-700 dark:text-slate-200 transition hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  {t("backToSigninButton")}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
