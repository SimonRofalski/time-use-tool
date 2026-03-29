"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Mode = "signin" | "signup" | "forgot-password";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

const modeContent: Record<
  Mode,
  {
    title: string;
    submitLabel: string;
  }
> = {
  signin: {
    title: "Anmeldung",
    submitLabel: "Jetzt anmelden",
  },
  signup: {
    title: "Neuen Account erstellen",
    submitLabel: "Account erstellen",
  },
  "forgot-password": {
    title: "Passwort zurücksetzen",
    submitLabel: "Link senden",
  },
};

export default function Home() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<"error" | "success">("error");
  const [emailHasError, setEmailHasError] = useState(false);
  const [passwordHasError, setPasswordHasError] = useState(false);
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();
  const currentMode = modeContent[mode];

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.push("/zeiterfassung");
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) router.push("/zeiterfassung");
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
      setStatus("Bitte E-Mail-Adresse eingeben.");
      setEmailHasError(true);
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setStatus("Bitte eine gültige E-Mail-Adresse eingeben.");
      setEmailHasError(true);
      return;
    }

    if (mode === "forgot-password") {
      const { error } = await supabase.auth.resetPasswordForEmail(
        normalizedEmail,
        {
          redirectTo: `${window.location.origin}/reset-password`,
        },
      );
      if (error) {
        setStatus(error.message);
        setStatusTone("error");
      } else {
        setStatus("Ein Link zum Zurücksetzen wurde an Ihre E-Mail gesendet.");
        setStatusTone("success");
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
        router.push("/zeiterfassung");
      } else {
        setMode("signin");
        setPassword("");
        setPasswordHasError(false);
        setStatus("Account erstellt. Sie können sich jetzt anmelden.");
        setStatusTone("success");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          setStatus("Falsches Passwort oder E-Mail.");
          setStatusTone("error");
          setPasswordHasError(true);
        } else {
          setStatus(error.message);
          setStatusTone("error");
        }
      } else {
        router.push("/zeiterfassung");
      }
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
            Time Use Tool
          </h1>
        </div>

        {mode !== "forgot-password" && (
          <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white/90 p-2 shadow-sm backdrop-blur-sm">
            <button
              type="button"
              onClick={() => handleModeChange("signin")}
              className={`rounded-lg px-4 py-3 text-left text-sm transition ${
                mode === "signin"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-800"
              }`}
            >
              <span className="block font-semibold">Anmeldung</span>
            </button>
            <button
              type="button"
              onClick={() => handleModeChange("signup")}
              className={`rounded-lg px-4 py-3 text-left text-sm transition ${
                mode === "signup"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-800"
              }`}
            >
              <span className="block font-semibold">
                Neuen Account erstellen
              </span>
            </button>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          noValidate
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h2 className="mb-5 text-center text-lg font-semibold text-slate-900">
            {currentMode.title}
          </h2>

          <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              E-Mail
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
                className={`mt-1.5 w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 ${
                  emailHasError
                    ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                    : "border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                }`}
                placeholder="name@beispiel.de"
              />
            </label>

            {mode !== "forgot-password" && (
              <label className="block text-sm font-medium text-slate-700">
                Passwort
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
                  className={`mt-1.5 w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 ${
                    passwordHasError
                      ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                      : "border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                  }`}
                  placeholder="Mindestens 6 Zeichen"
                />
              </label>
            )}
          </div>

          <button
            type="submit"
            className="mt-5 w-full rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            {currentMode.submitLabel}
          </button>

          {status && (
            <p
              className={`mt-3 text-center text-sm ${
                statusTone === "success" ? "text-green-600" : "text-red-600"
              }`}
              role="status"
            >
              {status}
            </p>
          )}

          <div className="mt-5 flex flex-col gap-3 border-t border-slate-200 pt-4 text-sm">
            {mode === "signin" ? (
              <>
                <button
                  type="button"
                  onClick={() => handleModeChange("signup")}
                  className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 font-medium text-blue-700 transition hover:bg-blue-100"
                >
                  Noch kein Konto? Hier neuen Account erstellen
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange("forgot-password")}
                  className="text-center text-sm text-slate-500 transition hover:text-slate-700"
                >
                  Passwort vergessen?
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleModeChange("signin")}
                  className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2 font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  Zurück zur Anmeldung
                </button>
                {mode === "signup" && (
                  <p className="text-center text-xs text-slate-500">
                    Bereits registriert?
                  </p>
                )}
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
