"use client";

import { ReactNode, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import {
  Bars3Icon,
  XMarkIcon,
  ClockIcon,
  CalendarIcon,
  ChartBarIcon,
  UserIcon,
  CogIcon,
} from "@heroicons/react/24/outline";

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [user, setUser] = useState<any>(null);
  const pathname = usePathname();
  const titles: Record<string, string> = {
    "/zeiterfassung": "Zeiterfassung",
    "/erfasste-zeit": "Erfasste Zeit",
    "/leaderboard": "Leaderboard",
    "/profil": "Profil",
    "/settings": "Einstellungen",
  };
  const pageTitle = titles[pathname] || "";
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.push("/");
      } else {
        setUser(data.user);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_e, session) => {
        if (!session?.user) {
          router.push("/");
        } else {
          setUser(session.user);
        }
      },
    );
    return () => listener?.subscription.unsubscribe();
  }, [supabase, router]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  if (!user) {
    return null; // or some loader
  }

  return (
    <div className="flex flex-col min-h-screen">
      <header className="flex items-center justify-between border-b border-white/10 bg-slate-950/40 px-6 py-4">
        <button
          type="button"
          className="p-2 text-white"
          onClick={() => setMenuOpen(true)}
        >
          <Bars3Icon className="h-6 w-6" />
        </button>
        <span className="text-lg font-semibold text-white">{pageTitle}</span>
        <div style={{ width: 24 }} />
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="flex-1 bg-black/40"
            onClick={() => setMenuOpen(false)}
          />
          <div className="w-64 bg-white p-4">
            <div className="flex justify-end">
              <button onClick={() => setMenuOpen(false)}>
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            <button
              className="mt-4 w-full rounded bg-emerald-500 px-4 py-2 text-white"
              onClick={handleSignOut}
            >
              Sign out
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-auto">{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 bg-slate-900">
        <div className="flex justify-around py-3">
          <Link href="/zeiterfassung" className="text-white">
            <ClockIcon className="h-6 w-6" />
          </Link>
          <Link href="/erfasste-zeit" className="text-white">
            <CalendarIcon className="h-6 w-6" />
          </Link>
          <Link href="/leaderboard" className="text-white">
            <ChartBarIcon className="h-6 w-6" />
          </Link>
          <Link href="/profil" className="text-white">
            <UserIcon className="h-6 w-6" />
          </Link>
          <Link href="/settings" className="text-white">
            <CogIcon className="h-6 w-6" />
          </Link>
        </div>
      </nav>
    </div>
  );
}
