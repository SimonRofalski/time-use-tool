"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { User } from "@supabase/supabase-js";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthPage } from "../components/AuthPage";

type EmailPasswordProps = {
  user: User | null;
};

type Mode = "signup" | "signin" | "forgot-password";

export default function EmailPassword({ user }: EmailPasswordProps) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const supabase = getSupabaseBrowserClient();
  const [currentUser, setCurrentUser] = useState<User | null>(user);

  const router = useRouter();

  const handleModeChange = (newMode: Mode) => {
    setMode(newMode);
    setStatus("");
    setEmail("");
    setPassword("");
  };

  async function handleForgotPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email) {
      setStatus("Bitte geben Sie Ihre E-Mail-Adresse ein.");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setStatus(error.message);
    } else {
      setStatus(
        "Recovery-Link wurde an Ihre E-Mail sent. Bitte überprüfen Sie Ihren Posteingang.",
      );
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setStatus("Signed out successfully");
    router.push("/");
  }

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setCurrentUser(session?.user ?? null);
      },
    );

    return () => {
      listener?.subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (mode == "signup") {
      const { error, data } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/welcome`,
        },
      });
      if (error) {
        setStatus(error.message);
      } else {
        setStatus("Check your inbox to confirm the new account.");
      }
    } else {
      const { error, data } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          setStatus("Falsches Passwort oder E-Mail eingegeben.");
        } else {
          setStatus(error.message);
        }
      } else {
        setStatus("Signed in successfully");
        router.push("/erfasste-zeit");
      }
    }
  }

  return (
    <AuthPage
      title="Email + Password"
      intro="Classic credentials—users enter details, Supabase secures the rest while getSession + onAuthStateChange keep the UI live."
      steps={[
        "Toggle between sign up and sign in.",
        "Submit to watch the session card refresh instantly.",
        "Sign out to reset the listener.",
      ]}
      user={currentUser}
      onSignOut={handleSignOut}
    >
      {!currentUser && (
        <>
          <form
            className="relative overflow-hidden rounded-[32px] border border-emerald-500/30 bg-gradient-to-br from-[#05130d] via-[#04100c] to-[#0c2a21] p-8 text-slate-100 shadow-[0_35px_90px_rgba(2,6,23,0.65)]"
            onSubmit={
              mode === "forgot-password" ? handleForgotPassword : handleSubmit
            }
          >
            <div
              className="pointer-events-none absolute -left-4 -top-4 -z-10 h-20 w-28 rounded-full bg-[radial-gradient(circle,_rgba(16,185,129,0.25),_transparent)] blur-lg"
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute -bottom-10 right-2 -z-10 h-28 w-40 rounded-full bg-[linear-gradient(140deg,_rgba(45,212,191,0.32),_rgba(59,130,246,0.12))] blur-xl"
              aria-hidden="true"
            />
            <div className="absolute inset-x-8 top-6 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.3em] text-emerald-300/80">
              <span>Primary</span>
              <span>Flow</span>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/70">
                  Credentials
                </p>
                <h3 className="text-xl font-semibold text-white">
                  {mode === "signin"
                    ? "Anmelden"
                    : mode === "signup"
                      ? "Account erstellen"
                      : "Passwort zurücksetzen"}
                </h3>
              </div>
            </div>
            <div className="mt-6 space-y-4">
              <label className="block text-sm font-medium text-slate-200">
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-[#0b1b18] px-3 py-2.5 text-base text-white placeholder-slate-500 shadow-inner shadow-black/30 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
                  placeholder="you@email.com"
                />
              </label>
              {mode !== "forgot-password" && (
                <label className="block text-sm font-medium text-slate-200">
                  Password
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    minLength={6}
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-[#0b1b18] px-3 py-2.5 text-base text-white placeholder-slate-500 shadow-inner shadow-black/30 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
                    placeholder="At least 6 characters"
                  />
                </label>
              )}
            </div>
            <button
              type="submit"
              className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-600/40"
            >
              {mode === "signin"
                ? "Anmelden"
                : mode === "signup"
                  ? "Account erstellen"
                  : "Recovery-Link senden"}
            </button>
            <div className="mt-3 flex gap-3">
              {mode === "signin" ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleModeChange("signup")}
                    className="flex-1 text-xs font-medium text-emerald-300 hover:text-emerald-200 transition"
                  >
                    Neuen Account erstellen
                  </button>
                  <button
                    type="button"
                    onClick={() => handleModeChange("forgot-password")}
                    className="flex-1 text-xs font-medium text-slate-400 hover:text-slate-300 transition"
                  >
                    Passwort vergessen
                  </button>
                </>
              ) : mode === "signup" ? (
                <button
                  type="button"
                  onClick={() => handleModeChange("signin")}
                  className="w-full text-xs font-medium text-slate-400 hover:text-slate-300 transition"
                >
                  Zurück zum Anmelden
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleModeChange("signin")}
                  className="w-full text-xs font-medium text-slate-400 hover:text-slate-300 transition"
                >
                  Zurück zum Anmelden
                </button>
              )}
            </div>
            {status && (
              <p
                className="mt-4 text-sm text-slate-300"
                role="status"
                aria-live="polite"
              >
                {status}
              </p>
            )}
          </form>
        </>
      )}
      <section className="rounded-[28px] border border-white/10 bg-white/5 p-7 text-slate-200 shadow-[0_25px_70px_rgba(2,6,23,0.65)] backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Session</h3>
            <p className="mt-1 text-sm text-slate-400">
              {currentUser
                ? "Hydrated by getSession + onAuthStateChange."
                : "Sign in to hydrate this panel instantly."}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              currentUser
                ? "bg-emerald-500/20 text-emerald-200"
                : "bg-white/10 text-slate-400"
            }`}
          >
            {currentUser ? "Active" : "Idle"}
          </span>
        </div>
        {currentUser ? (
          <>
            <dl className="mt-5 space-y-3 text-sm text-slate-200">
              <div className="flex items-center justify-between gap-6">
                <dt className="text-slate-400">User ID</dt>
                <dd className="font-mono text-xs">{currentUser.id}</dd>
              </div>
              <div className="flex items-center justify-between gap-6">
                <dt className="text-slate-400">Email</dt>
                <dd>{currentUser.email}</dd>
              </div>
              <div className="flex items-center justify-between gap-6">
                <dt className="text-slate-400">Last sign in</dt>
                <dd>
                  {currentUser.last_sign_in_at
                    ? new Date(currentUser.last_sign_in_at).toLocaleString()
                    : "—"}
                </dd>
              </div>
            </dl>
            <button
              className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
              onClick={handleSignOut}
            >
              Sign out
            </button>
          </>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-slate-900/50 p-5 text-sm text-slate-400">
            Session metadata will show up here after a successful sign in.
          </div>
        )}
      </section>
    </AuthPage>
  );
}
