"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

export default function ResetPasswordPage() {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    // Check if we have a valid session/token from the recovery link
    const checkToken = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setHasToken(true);
      } else {
        setStatus(
          "Ungültiger oder abgelaufener Recovery-Link. Bitte fordern Sie einen neuen an.",
        );
      }
    };

    checkToken();
  }, [supabase]);

  async function handleResetPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus("");

    if (password !== confirmPassword) {
      setStatus("Passwörter stimmen nicht überein.");
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setStatus("Passwort muss mindestens 6 Zeichen lang sein.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password: password,
    });

    if (error) {
      setStatus(error.message);
      setLoading(false);
    } else {
      setStatus("Passwort erfolgreich zurückgesetzt! Redirecting...");
      setTimeout(() => {
        router.push("/");
      }, 2000);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-[#02050b] via-[#050c1d] to-[#071426] text-slate-100">
      <header className="border-b border-white/10 bg-slate-950/40 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-slate-400">
              Supabase Auth
            </p>
            <h1 className="text-2xl font-semibold text-white">
              Passwort zurücksetzen
            </h1>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-12">
        <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-[32px] border border-white/10 bg-white/5 p-8 shadow-[0_25px_70px_rgba(2,6,23,0.65)] backdrop-blur">
            <p className="text-lg font-medium text-white/90">
              Setzen Sie ein neues Passwort
            </p>
            <p className="mt-2 text-sm text-slate-300">
              Geben Sie ein neues Passwort ein, um Ihren Account zu schützen.
            </p>
          </section>

          <div className="flex flex-col gap-6">
            {hasToken ? (
              <form
                className="relative overflow-hidden rounded-[32px] border border-emerald-500/30 bg-gradient-to-br from-[#05130d] via-[#04100c] to-[#0c2a21] p-8 text-slate-100 shadow-[0_35px_90px_rgba(2,6,23,0.65)]"
                onSubmit={handleResetPassword}
              >
                <div
                  className="pointer-events-none absolute -left-4 -top-4 -z-10 h-20 w-28 rounded-full bg-[radial-gradient(circle,_rgba(16,185,129,0.25),_transparent)] blur-lg"
                  aria-hidden="true"
                />
                <div
                  className="pointer-events-none absolute -bottom-10 right-2 -z-10 h-28 w-40 rounded-full bg-[linear-gradient(140deg,_rgba(45,212,191,0.32),_rgba(59,130,246,0.12))] blur-xl"
                  aria-hidden="true"
                />
                <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/70">
                      Credentials
                    </p>
                    <h3 className="text-xl font-semibold text-white">
                      Neues Passwort
                    </h3>
                  </div>
                </div>
                <div className="mt-6 space-y-4">
                  <label className="block text-sm font-medium text-slate-200">
                    Neues Passwort
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      minLength={6}
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-[#0b1b18] px-3 py-2.5 text-base text-white placeholder-slate-500 shadow-inner shadow-black/30 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
                      placeholder="Mindestens 6 Zeichen"
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-200">
                    Passwort bestätigen
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(event) =>
                        setConfirmPassword(event.target.value)
                      }
                      required
                      minLength={6}
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-[#0b1b18] px-3 py-2.5 text-base text-white placeholder-slate-500 shadow-inner shadow-black/30 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
                      placeholder="Wiederholen Sie das Passwort"
                    />
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-600/40"
                >
                  {loading ? "Wird zurückgesetzt..." : "Passwort zurücksetzen"}
                </button>
                {status && (
                  <p
                    className={`mt-4 text-sm ${
                      status.includes("erfolgreich")
                        ? "text-emerald-300"
                        : "text-slate-300"
                    }`}
                    role="status"
                    aria-live="polite"
                  >
                    {status}
                  </p>
                )}
              </form>
            ) : (
              <div className="rounded-[28px] border border-white/10 bg-white/5 p-7 text-slate-200 shadow-[0_25px_70px_rgba(2,6,23,0.65)] backdrop-blur">
                <p className="text-sm text-slate-400">
                  {status || "Wird überprüft..."}
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
