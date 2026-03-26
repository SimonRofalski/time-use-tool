"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Mode = "signin" | "signup" | "forgot-password";

export default function Home() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();

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
    setEmail("");
    setPassword("");
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (mode === "forgot-password") {
      if (!email) {
        setStatus("Bitte E-Mail-Adresse eingeben.");
        return;
      }
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        setStatus(error.message);
      } else {
        setStatus("Ein Link zum Zurücksetzen wurde an Ihre E-Mail gesendet.");
      }
      return;
    }

    if (mode === "signup") {
      const { error, data } = await supabase.auth.signUp({
        email,
        password,
      });
      if (error) {
        setStatus(error.message);
      } else if (data.session) {
        router.push("/zeiterfassung");
      } else {
        setStatus("Account erstellt. Sie können sich jetzt anmelden.");
        handleModeChange("signin");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setStatus(
          error.message.includes("Invalid login credentials")
            ? "Falsches Passwort oder E-Mail."
            : error.message,
        );
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
          <p className="mt-1 text-sm text-slate-500">
            {mode === "signin"
              ? "Melden Sie sich an"
              : mode === "signup"
                ? "Neuen Account erstellen"
                : "Passwort zurücksetzen"}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              E-Mail
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="name@beispiel.de"
              />
            </label>

            {mode !== "forgot-password" && (
              <label className="block text-sm font-medium text-slate-700">
                Passwort
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Mindestens 6 Zeichen"
                />
              </label>
            )}
          </div>

          <button
            type="submit"
            className="mt-5 w-full rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            {mode === "signin"
              ? "Anmelden"
              : mode === "signup"
                ? "Account erstellen"
                : "Link senden"}
          </button>

          {status && (
            <p
              className="mt-3 text-center text-sm text-slate-600"
              role="status"
            >
              {status}
            </p>
          )}

          <div className="mt-4 flex justify-between text-xs">
            {mode === "signin" ? (
              <>
                <button
                  type="button"
                  onClick={() => handleModeChange("signup")}
                  className="font-medium text-blue-600 hover:text-blue-500 transition"
                >
                  Neuen Account erstellen
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange("forgot-password")}
                  className="text-slate-500 hover:text-slate-700 transition"
                >
                  Passwort vergessen?
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => handleModeChange("signin")}
                className="font-medium text-blue-600 hover:text-blue-500 transition"
              >
                Zurück zum Anmelden
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
