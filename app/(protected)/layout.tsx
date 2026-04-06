"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import EnrollmentModal from "@/app/components/EnrollmentModal";
import ProfileDetailsForm from "@/app/components/ProfileDetailsForm";
import KursuebersichtTab from "@/app/components/admin/KursuebersichtTab";
import NutzeruebersichtTab from "@/app/components/admin/NutzeruebersichtTab";
import StatistikenTab from "@/app/components/admin/StatistikenTab";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Calendar,
  ClipboardList,
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
  const touchStartXRef = useRef<number | null>(null);

  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [isEnrolled, setIsEnrolled] = useState<boolean | null>(null);
  const [needsProfileDetails, setNeedsProfileDetails] = useState<
    boolean | null
  >(null);
  const [accessCheckReady, setAccessCheckReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileModalMandatory, setProfileModalMandatory] = useState(false);
  const [profileFormIsEditing, setProfileFormIsEditing] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  const [adminMode, setAdminMode] = useState(false);
  const [activeAdminTab, setActiveAdminTab] = useState("kursuebersicht");
  // Role fetched from profiles.role (the authoritative source — not JWT metadata)
  const [profileRole, setProfileRole] = useState<string>("user");
  const [profileFirstName, setProfileFirstName] = useState("");
  const [profileLastName, setProfileLastName] = useState("");

  const isAdmin = profileRole === "admin";

  function handleMainTouchStart(e: React.TouchEvent) {
    touchStartXRef.current = e.touches[0].clientX;
  }

  function handleMainTouchEnd(e: React.TouchEvent) {
    if (touchStartXRef.current === null) return;
    const diff = touchStartXRef.current - e.changedTouches[0].clientX;
    touchStartXRef.current = null;
    if (Math.abs(diff) < 60) return; // ignore small swipes
    if (adminMode) {
      const idx = adminTabs.findIndex((t) => t.id === activeAdminTab);
      if (diff > 0 && idx < adminTabs.length - 1)
        setActiveAdminTab(adminTabs[idx + 1].id);
      if (diff < 0 && idx > 0) setActiveAdminTab(adminTabs[idx - 1].id);
    } else {
      const idx = tabs.findIndex((t) => t.path === pathname);
      if (diff > 0 && idx < tabs.length - 1) router.push(tabs[idx + 1].path);
      if (diff < 0 && idx > 0) router.push(tabs[idx - 1].path);
    }
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.push("/");
        return;
      }

      void initializeUserAccess(data.user);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session?.user) {
          router.push("/");
          return;
        }

        void initializeUserAccess(session.user);
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
        if (!profileModalMandatory) {
          setProfileModalOpen(false);
        }
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
  }, [profileMenuOpen, profileModalMandatory]);

  async function initializeUserAccess(authUser: SupabaseUser) {
    setUser(authUser);
    setAccessCheckReady(false);
    setNeedsProfileDetails(null);
    setIsEnrolled(null);

    // Fetch role from profiles table — this is the authoritative source
    const { data: profileData } = await supabase
      .from("profiles")
      .select("role, first_name, last_name")
      .eq("id", authUser.id)
      .single();
    const role = profileData?.role ?? "user";
    setProfileRole(role);
    setProfileFirstName(profileData?.first_name ?? "");
    setProfileLastName(profileData?.last_name ?? "");

    // Admins skip profile completion and course enrollment requirements
    if (role === "admin") {
      setNeedsProfileDetails(false);
      setIsEnrolled(true);
      setProfileModalMandatory(false);
      setProfileModalOpen(false);
      setAccessCheckReady(true);
      return;
    }

    const hasProfileDetails = await checkProfileDetails(authUser.id);
    setNeedsProfileDetails(!hasProfileDetails);

    if (!hasProfileDetails) {
      setProfileMenuOpen(false);
      setSettingsOpen(false);
      setProfileModalMandatory(true);
      setProfileModalOpen(true);
      setAccessCheckReady(true);
      return;
    }

    setProfileModalMandatory(false);
    setProfileModalOpen(false);
    await checkEnrollment(authUser.id);
    setAccessCheckReady(true);
  }

  async function checkProfileDetails(userId: string) {
    const { data, error } = await supabase
      .from("user_data")
      .select("user_data_id")
      .eq("profiles_id", userId)
      .limit(1);

    if (error) {
      return false;
    }

    return (data?.length ?? 0) > 0;
  }

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

  async function handleProfileSaved() {
    if (!user) {
      return;
    }

    const { data: profileData } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", user.id)
      .single();

    setProfileFirstName(profileData?.first_name ?? "");
    setProfileLastName(profileData?.last_name ?? "");

    setProfileModalOpen(false);
    setProfileModalMandatory(false);
    setNeedsProfileDetails(false);
    setAccessCheckReady(false);
    await checkEnrollment(user.id);
    setAccessCheckReady(true);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setAccessCheckReady(false);
    setNeedsProfileDetails(null);
    setIsEnrolled(null);
    setProfileFormIsEditing(false);
    setProfileModalMandatory(false);
    setProfileModalOpen(false);
    setProfileFirstName("");
    setProfileLastName("");
    router.push("/");
  }

  function handleProfileModalClose() {
    if (profileModalMandatory) {
      return;
    }

    if (profileFormIsEditing) {
      const shouldClose = window.confirm(
        "Die Profilbearbeitung ist noch nicht gespeichert. Wirklich schliessen?",
      );

      if (!shouldClose) {
        return;
      }
    }

    setProfileFormIsEditing(false);
    setProfileModalOpen(false);
  }

  function openProfileModal() {
    setProfileMenuOpen(false);
    setProfileModalMandatory(false);
    setProfileFormIsEditing(false);
    setProfileModalOpen(true);
  }

  if (
    !user ||
    !accessCheckReady ||
    needsProfileDetails === null ||
    (!needsProfileDetails && isEnrolled === null)
  ) {
    return null;
  }

  const fullName = [profileFirstName, profileLastName]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" ");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur transition-colors dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" className="h-8 w-8 shrink-0" />
            <h1 className="whitespace-nowrap text-base font-semibold text-slate-800 dark:text-slate-100 sm:text-lg">
              Time Use Tool
            </h1>
          </div>

          <div className="ml-3 flex shrink-0 items-center gap-2">
            {isAdmin &&
              (adminMode ? (
                <button
                  type="button"
                  aria-label="Zurück zum Zeittagebuch"
                  className="inline-flex min-w-[5.9rem] items-center justify-center gap-1.5 rounded-2xl border border-sky-200 bg-sky-50 px-2.5 py-2 text-xs font-semibold tracking-tight text-sky-700 shadow-sm transition-colors hover:border-sky-300 hover:bg-sky-100 hover:text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:border-sky-500/60 dark:hover:bg-sky-500/15 sm:min-w-[7.75rem] sm:gap-2 sm:px-3.5 sm:text-sm"
                  onClick={() => {
                    setAdminMode(false);
                    setSettingsOpen(false);
                  }}
                >
                  <ArrowLeft size={16} className="shrink-0" />
                  <span className="text-center leading-[1.05] sm:leading-none">
                    <span className="block sm:inline">Zuruck zur</span>
                    <span className="block sm:inline sm:ml-1">Eingabe</span>
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  aria-label="Admin-Center öffnen"
                  className="inline-flex min-w-[5.9rem] items-center justify-center gap-1.5 rounded-2xl border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs font-semibold tracking-tight text-amber-800 shadow-sm transition-colors hover:border-amber-400 hover:bg-amber-100 hover:text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:border-amber-500/60 dark:hover:bg-amber-500/15 sm:min-w-[7.75rem] sm:gap-2 sm:px-3.5 sm:text-sm"
                  onClick={() => {
                    setAdminMode(true);
                    setSettingsOpen(false);
                  }}
                >
                  <ShieldCheck size={16} className="shrink-0" />
                  <span className="text-center leading-[1.05] sm:leading-none">
                    <span className="block sm:inline">Admin-</span>
                    <span className="block sm:inline">Modus</span>
                  </span>
                </button>
              ))}

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
                      {fullName || "Profilname fehlt"}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-400 dark:text-slate-500">
                      {user.email}
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
          <div className="flex">
            {adminMode
              ? adminTabs.map((tab) => {
                  const isActive = activeAdminTab === tab.id;
                  const Icon = tab.icon;

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-3 text-xs font-medium transition-colors sm:gap-2 sm:px-4 sm:text-sm ${
                        isActive
                          ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-300"
                          : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-slate-100"
                      }`}
                      onClick={() => setActiveAdminTab(tab.id)}
                    >
                      <Icon size={16} className="shrink-0 sm:hidden" />
                      <Icon size={18} className="shrink-0 hidden sm:block" />
                      <span className="hidden sm:inline">{tab.label}</span>
                      <span className="sm:hidden text-xs font-semibold">
                        {tab.label.charAt(0) + tab.label.slice(1).toLowerCase()}
                      </span>
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
                      className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-3 text-xs font-medium transition-colors sm:gap-2 sm:px-4 sm:text-sm ${
                        isActive
                          ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-300"
                          : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-slate-100"
                      }`}
                    >
                      <Icon size={16} className="shrink-0 sm:hidden" />
                      <Icon size={18} className="shrink-0 hidden sm:block" />
                      <span className="hidden sm:inline">{tab.label}</span>
                      <span className="sm:hidden text-xs font-semibold">
                        {tab.label.charAt(0) + tab.label.slice(1).toLowerCase()}
                      </span>
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
            onClick={() => {
              handleProfileModalClose();
            }}
          />
          <div className="relative z-10 max-h-[90vh] w-full max-w-5xl overflow-y-auto scrollbar-thin rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl transition-colors dark:border-slate-800 dark:bg-slate-900">
            {!profileModalMandatory && (
              <div className="mb-4 flex justify-end">
                <button
                  type="button"
                  className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                  onClick={handleProfileModalClose}
                >
                  <X size={20} />
                </button>
              </div>
            )}
            <ProfileDetailsForm
              allowEditToggle={!profileModalMandatory}
              initialEditMode={profileModalMandatory ? true : false}
              showAccountInfoBar={false}
              showPopupHint={false}
              requireCompletion={profileModalMandatory}
              onEditStateChange={setProfileFormIsEditing}
              onSaved={handleProfileSaved}
            />
          </div>
        </div>
      )}

      {adminMode ? (
        <main
          className="mx-auto max-w-7xl px-4 py-6"
          onTouchStart={handleMainTouchStart}
          onTouchEnd={handleMainTouchEnd}
        >
          {activeAdminTab === "kursuebersicht" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="mb-6 text-lg font-semibold text-slate-900 dark:text-slate-100">
                Kursübersicht
              </h3>
              <KursuebersichtTab />
            </div>
          )}
          {activeAdminTab === "nutzeruebersicht" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="mb-6 text-lg font-semibold text-slate-900 dark:text-slate-100">
                Nutzerübersicht
              </h3>
              <NutzeruebersichtTab />
            </div>
          )}
          {activeAdminTab === "statistiken" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="mb-6 text-lg font-semibold text-slate-900 dark:text-slate-100">
                Statistiken
              </h3>
              <StatistikenTab />
            </div>
          )}
        </main>
      ) : (
        <main
          className="mx-auto max-w-7xl px-4 py-6"
          onTouchStart={handleMainTouchStart}
          onTouchEnd={handleMainTouchEnd}
        >
          {children}
        </main>
      )}

      {needsProfileDetails === false && isEnrolled === false && (
        <EnrollmentModal userId={user.id} onEnrolled={handleEnrolled} />
      )}
    </div>
  );
}
