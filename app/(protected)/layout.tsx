"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import EnrollmentModal from "@/app/components/EnrollmentModal";
import ProfileDetailsForm from "@/app/components/ProfileDetailsForm";
import {
  BarChart3,
  BookOpen,
  Calendar,
  ClipboardList,
  Clock,
  LogOut,
  Moon,
  Settings,
  ShieldCheck,
  SunMedium,
  User,
  Users,
  X,
} from "lucide-react";

const tabs = [
  { path: "/zeiterfassung", label: "EINGABE", icon: ClipboardList },
  { path: "/erfasste-zeit", label: "ÜBERSICHT", icon: Calendar },
  { path: "/statistiken", label: "STATISTIKEN", icon: BarChart3 },
];

const adminTabs = [
  { id: "kursuebersicht", label: "KURSÜBERSICHT", icon: BookOpen },
  { id: "nutzeruebersicht", label: "NUTZERÜBERSICHT", icon: Users },
  { id: "statistiken", label: "STATISTIKEN", icon: BarChart3 },
];

function formatDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatRole(rawRole: unknown) {
  if (typeof rawRole !== "string" || rawRole.trim().length === 0) {
    return "Nutzer";
  }

  return rawRole
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getUserRole(user: SupabaseUser | null) {
  if (!user) {
    return "Nutzer";
  }

  const roleCandidate =
    user.app_metadata?.role ??
    user.user_metadata?.role ??
    user.app_metadata?.roles?.[0] ??
    user.user_metadata?.roles?.[0];

  return formatRole(roleCandidate);
}

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = getSupabaseBrowserClient();
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [isEnrolled, setIsEnrolled] = useState<boolean | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  const [adminMode, setAdminMode] = useState(false);
  const [activeAdminTab, setActiveAdminTab] = useState("kursuebersicht");

  const userRole = getUserRole(user);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.push("/");
        return;
      }

      setUser(data.user);
      checkEnrollment(data.user.id);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session?.user) {
          router.push("/");
          return;
        }

        setUser(session.user);
        checkEnrollment(session.user.id);
      },
    );

    return () => listener?.subscription.unsubscribe();
  }, [router, supabase]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedTheme = window.localStorage.getItem("time-use-tool-theme");
    const prefersDarkMode = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    const nextTheme =
      storedTheme === "dark" || (!storedTheme && prefersDarkMode)
        ? "dark"
        : "light";

    setTheme(nextTheme);
  }, []);

  useEffect(() => {
    if (!theme || typeof window === "undefined") {
      return;
    }

    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem("time-use-tool-theme", theme);
  }, [theme]);

  useEffect(() => {
    setProfileMenuOpen(false);
    setSettingsOpen(false);
  }, [pathname]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target as Node)
      ) {
        setProfileMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setProfileMenuOpen(false);
        setProfileModalOpen(false);
        setSettingsOpen(false);
      }
    }

    if (profileMenuOpen) {
      document.addEventListener("mousedown", handlePointerDown);
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      if (profileMenuOpen) {
        document.removeEventListener("mousedown", handlePointerDown);
      }

      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [profileMenuOpen]);

  async function checkEnrollment(userId: string) {
    const { data } = await supabase
      .from("user_course")
      .select("user_course_id")
      .eq("profiles_id", userId)
      .single();

    setIsEnrolled(!!data);
  }

  function handleEnrolled() {
    setIsEnrolled(true);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  function openProfileModal() {
    setProfileMenuOpen(false);
    setProfileModalOpen(true);
  }

  if (!user || isEnrolled === null) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur transition-colors dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              Time Use Tool
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {adminMode
                ? "Admin Center"
                : "Zeittagebuch – 10-Minuten-Intervalle"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {adminMode ? (
              <button
                type="button"
                aria-label="Zurück zum Zeittagebuch"
                className="flex flex-col items-center gap-0.5 rounded-xl border border-slate-200 px-3 py-1.5 text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-white"
                onClick={() => {
                  setAdminMode(false);
                  setSettingsOpen(false);
                }}
              >
                <Clock size={16} />
                <span className="text-[10px] font-medium leading-none">
                  Zeittagebuch
                </span>
              </button>
            ) : (
              <button
                type="button"
                aria-label="Admin-Center öffnen"
                className="flex flex-col items-center gap-0.5 rounded-xl border border-slate-200 px-3 py-1.5 text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-white"
                onClick={() => {
                  setAdminMode(true);
                  setSettingsOpen(false);
                }}
              >
                <ShieldCheck size={16} />
                <span className="text-[10px] font-medium leading-none">
                  Admin-Center
                </span>
              </button>
            )}

            <div className="relative" ref={profileMenuRef}>
              <div className="group relative">
                <button
                  type="button"
                  aria-label="Profilmenü öffnen"
                  className={`rounded-full border p-2.5 transition-colors ${
                    profileMenuOpen || profileModalOpen
                      ? "border-blue-500 bg-blue-50 text-blue-600 dark:border-blue-400 dark:bg-blue-500/10 dark:text-blue-300"
                      : "border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-white"
                  }`}
                  onClick={() => setProfileMenuOpen((current) => !current)}
                >
                  <User size={18} />
                </button>
                <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-800 px-2 py-1 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100 dark:bg-slate-700">
                  Profil
                </span>
              </div>

              {profileMenuOpen && (
                <div className="absolute right-0 mt-3 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-800 dark:bg-slate-900">
                  <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {user.email}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {userRole}
                    </p>
                  </div>

                  <button
                    type="button"
                    className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white"
                    onClick={openProfileModal}
                  >
                    <User size={16} />
                    Persönliche Angaben
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-red-600 transition hover:bg-red-50 dark:hover:bg-red-500/10"
                    onClick={handleSignOut}
                  >
                    <LogOut size={16} />
                    Ausloggen
                  </button>
                </div>
              )}
            </div>

            <div className="group relative">
              <button
                type="button"
                aria-label="Einstellungen öffnen"
                className={`rounded-full border p-2.5 transition-colors ${
                  settingsOpen
                    ? "border-blue-500 bg-blue-50 text-blue-600 dark:border-blue-400 dark:bg-blue-500/10 dark:text-blue-300"
                    : "border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-white"
                }`}
                onClick={() => {
                  setProfileMenuOpen(false);
                  setSettingsOpen(true);
                }}
              >
                <Settings size={18} />
              </button>
              <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-800 px-2 py-1 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100 dark:bg-slate-700">
                Einstellungen
              </span>
            </div>
          </div>
        </div>
      </header>

      <nav className="sticky top-[73px] z-10 border-b border-slate-200 bg-white/95 backdrop-blur transition-colors dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {adminMode
              ? adminTabs.map((tab) => {
                  const isActive = activeAdminTab === tab.id;
                  const Icon = tab.icon;

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                        isActive
                          ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-300"
                          : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-slate-100"
                      }`}
                      onClick={() => setActiveAdminTab(tab.id)}
                    >
                      <Icon size={18} />
                      <span>{tab.label}</span>
                    </button>
                  );
                })
              : tabs.map((tab) => {
                  const isActive = pathname === tab.path;
                  const Icon = tab.icon;

                  return (
                    <Link
                      key={tab.path}
                      href={tab.path}
                      className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                        isActive
                          ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-300"
                          : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-slate-100"
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

      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="flex-1 bg-slate-950/45 backdrop-blur-sm"
            onClick={() => setSettingsOpen(false)}
          />
          <aside className="flex h-full w-full max-w-sm flex-col border-l border-slate-200 bg-white p-5 shadow-2xl transition-colors dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Einstellungen
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Darstellung und Kontoinformationen anpassen.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <button
              type="button"
              className="mt-8 flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600 dark:hover:bg-slate-800/80"
              onClick={() =>
                setTheme((current) => (current === "dark" ? "light" : "dark"))
              }
            >
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  Night Modus
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Schaltet zwischen heller und dunkler Darstellung um.
                </p>
              </div>
              <div
                className={`rounded-full p-3 ${
                  theme === "dark"
                    ? "bg-blue-500/15 text-blue-500 dark:text-blue-300"
                    : "bg-amber-100 text-amber-600 dark:bg-slate-700 dark:text-slate-200"
                }`}
              >
                {theme === "dark" ? (
                  <Moon size={18} />
                ) : (
                  <SunMedium size={18} />
                )}
              </div>
            </button>

            <div className="mt-auto rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-950">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Konto
              </p>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400">
                    User ID
                  </dt>
                  <dd className="mt-1 break-all font-mono text-xs text-slate-700 dark:text-slate-200">
                    {user.id}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400">
                    Letztes Login
                  </dt>
                  <dd className="mt-1 text-slate-800 dark:text-slate-100">
                    {formatDateTime(user.last_sign_in_at)}
                  </dd>
                </div>
              </dl>
            </div>
          </aside>
        </div>
      )}

      {profileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm">
          <div
            className="absolute inset-0"
            onClick={() => setProfileModalOpen(false)}
          />
          <div className="relative z-10 max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl transition-colors dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex justify-end">
              <button
                type="button"
                className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                onClick={() => setProfileModalOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <ProfileDetailsForm
              allowEditToggle={true}
              initialEditMode={false}
              showAccountInfoBar={false}
              showPopupHint={false}
            />
          </div>
        </div>
      )}

      {adminMode ? (
        <main className="mx-auto max-w-7xl px-4 py-6">
          {activeAdminTab === "kursuebersicht" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Kursübersicht
              </h3>
              <p className="mt-2 text-slate-500 dark:text-slate-400">
                Hier erscheint die Kursübersicht. Platzhalter.
              </p>
            </div>
          )}
          {activeAdminTab === "nutzeruebersicht" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Nutzerübersicht
              </h3>
              <p className="mt-2 text-slate-500 dark:text-slate-400">
                Hier erscheint die Nutzerübersicht. Platzhalter.
              </p>
            </div>
          )}
          {activeAdminTab === "statistiken" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Statistiken
              </h3>
              <p className="mt-2 text-slate-500 dark:text-slate-400">
                Hier erscheinen die Statistiken. Platzhalter.
              </p>
            </div>
          )}
        </main>
      ) : (
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      )}

      {!isEnrolled && (
        <EnrollmentModal userId={user.id} onEnrolled={handleEnrolled} />
      )}
    </div>
  );
}
