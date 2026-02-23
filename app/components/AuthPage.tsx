"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { User } from "@supabase/supabase-js";

type AuthPageProps = {
  title: string;
  intro: string;
  steps: string[];
  children: ReactNode;
  /** currently signed in user; when provided and onSignOut is passed we swap header action */
  user?: User | null;
  /** handler invoked when the header sign-out button is clicked */
  onSignOut?: () => void;
};

export function AuthPage({
  title,
  intro,
  steps,
  children,
  user,
  onSignOut,
}: AuthPageProps) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-[#02050b] via-[#050c1d] to-[#071426] text-slate-100">
      <header className="border-b border-white/10 bg-slate-950/40 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-slate-400">
              Supabase Auth
            </p>
            <h1 className="text-2xl font-semibold text-white">{title}</h1>
          </div>
          {user && onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center justify-center rounded-full bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              Sign out
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-12">
        <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-[32px] border border-white/10 bg-white/5 p-8 shadow-[0_25px_70px_rgba(2,6,23,0.65)] backdrop-blur">
            <p className="text-lg font-medium text-white/90">{intro}</p>
            <ol className="mt-5 list-decimal space-y-2 pl-5 text-sm text-slate-300">
              {steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>
          <div className="flex flex-col gap-6">{children}</div>
        </div>
      </main>
    </div>
  );
}
