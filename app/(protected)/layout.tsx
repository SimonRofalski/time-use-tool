"use client";

import { ReactNode, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import {
  ClipboardList,
  Calendar,
  BarChart3,
  User,
  Settings,
  ShieldCheck,
  Menu,
  X,
} from "lucide-react";

const tabs = [
  { path: "/zeiterfassung", label: "EINGABE", icon: ClipboardList },
  { path: "/erfasste-zeit", label: "ÜBERSICHT", icon: Calendar },
  { path: "/statistiken", label: "STATISTIKEN", icon: BarChart3 },
  { path: "/profil", label: "PROFIL", icon: User },
  { path: "/settings", label: "EINSTELLUNGEN", icon: Settings },
  { path: "/admin", label: "ADMIN", icon: ShieldCheck },
];

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [user, setUser] = useState<any>(null);
  const pathname = usePathname();
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
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">
              Time Use Tool
            </h1>
            <p className="text-slate-500 text-sm">
              Zeittagebuch – 10-Minuten-Intervalle
            </p>
          </div>
          <button
            type="button"
            className="p-2 text-slate-600 hover:text-slate-800"
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={24} />
          </button>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="bg-white border-b border-slate-200 sticky top-[73px] z-10">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {tabs.map((tab) => {
              const isActive = pathname === tab.path;
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.path}
                  href={tab.path}
                  className={`flex items-center gap-2 px-4 py-3 border-b-2 whitespace-nowrap transition-colors text-sm font-medium ${
                    isActive
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
                  }`}
                >
                  <Icon size={18} />
                  <span>{tab.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Sidebar Menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="flex-1 bg-black/40"
            onClick={() => setMenuOpen(false)}
          />
          <div className="w-64 bg-white p-4 shadow-lg">
            <div className="flex justify-end">
              <button
                onClick={() => setMenuOpen(false)}
                className="p-1 text-slate-600 hover:text-slate-800"
              >
                <X size={24} />
              </button>
            </div>
            <div className="mt-4 text-sm text-slate-500">{user?.email}</div>
            <button
              className="mt-4 w-full rounded-lg bg-slate-800 px-4 py-2 text-white text-sm hover:bg-slate-700 transition-colors"
              onClick={handleSignOut}
            >
              Abmelden
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
