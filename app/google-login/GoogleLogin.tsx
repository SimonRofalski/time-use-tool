"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { User } from "@supabase/supabase-js";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthPage } from "../components/AuthPage";

type GoogleLoginProps = {
  user: User | null;
};

export default function GoogleLogin({ user }: GoogleLoginProps) {
  const supabase = getSupabaseBrowserClient();
  const [currentUser, setCurrentUser] = useState<User | null>(user);

  const router = useRouter();

  async function handleSignOut() {
    await supabase.auth.signOut();
    setCurrentUser(null);
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

  // redirect to protected area when user becomes available
  useEffect(() => {
    if (currentUser) {
      router.push("/erfasste-zeit");
    }
  }, [currentUser, router]);

  async function handleGoogleLogin() {
    const { error, data } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/google-login`,
        skipBrowserRedirect: false,
      },
    });
    if (!error) {
      // Supabase will redirect back to this page, listener in effect will push to protected area
      router.push("/erfasste-zeit");
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
          <section className="relative overflow-hidden rounded-[32px] border border-[#5a8dee]/40 bg-gradient-to-br from-[#050a16] via-[#08142b] to-[#0f2446] p-8 text-slate-100 shadow-[0_35px_90px_rgba(2,6,23,0.65)]">
            <div
              className="pointer-events-none absolute -right-6 -top-8 -z-10 h-24 w-24 rounded-full bg-[radial-gradient(circle,_rgba(66,133,244,0.25),_rgba(234,67,53,0.06))] blur-xl"
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute bottom-2 right-10 -z-10 h-14 w-20 rounded-full bg-[radial-gradient(circle,_rgba(52,168,83,0.2),_transparent)] blur-lg"
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute -left-10 bottom-4 -z-10 h-20 w-32 rotate-12 rounded-full bg-[linear-gradient(120deg,_rgba(251,188,5,0.18),_rgba(66,133,244,0.12))] blur-lg"
              aria-hidden="true"
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0d1f3f] text-2xl font-semibold text-white shadow-lg shadow-blue-900/40 ring-2 ring-[#8ab4ff]/40">
                  G
                </span>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    OAuth
                  </p>
                  <h3 className="text-xl font-semibold text-white">
                    Continue with Google
                  </h3>
                </div>
              </div>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-[#fbbc05] shadow-sm">
                No password storage
              </span>
            </div>
            <p className="mt-4 text-sm text-slate-300">
              Supabase hosts the OAuth flow and returns a ready-to-use session.
            </p>
            <button
              type="button"
              onClick={handleGoogleLogin}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#1a73e8] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition hover:bg-[#1662c4]"
            >
              Continue with Google
            </button>
          </section>
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
