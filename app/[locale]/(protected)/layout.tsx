"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import EnrollmentModal from "@/app/components/EnrollmentModal";
import ProfileDetailsForm from "@/app/components/ProfileDetailsForm";
import SecurityQuestionsForm from "@/app/components/SecurityQuestionsForm";
import TutorialTour, {
  type TutorialStep,
} from "@/app/components/tutorial/TutorialTour";
import KursuebersichtTab from "@/app/components/admin/KursuebersichtTab";
import NutzeruebersichtTab from "@/app/components/admin/NutzeruebersichtTab";
import StatistikenTab from "@/app/components/admin/StatistikenTab";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Calendar,
  ClipboardList,
  Languages,
  LogOut,
  Moon,
  RotateCcw,
  Settings,
  ShieldCheck,
  SunMedium,
  User,
  Users,
  X,
} from "lucide-react";

function formatDateTime(value: string | null | undefined, locale: string) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString(locale === "en" ? "en-US" : "de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("protectedLayout");
  const tTutorial = useTranslations("tutorial");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const supabase = getSupabaseBrowserClient();
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  const tabs = [
    { path: "/zeiterfassung", label: t("tabs.zeiterfassung"), icon: ClipboardList },
    {
      path: "/erfasste-zeit",
      label: t("tabs.erfassteZeit"),
      icon: Calendar,
      tourId: "tab-erfasste-zeit",
    },
    {
      path: "/statistiken",
      label: t("tabs.statistiken"),
      icon: BarChart3,
      tourId: "tab-statistiken",
    },
  ];

  // Guided tour: an example (sleeping 00:00–06:00, no secondary activity)
  // walked through the questionnaire on the Zeiterfassung page, then the other
  // tabs and the settings panel. Targets are `data-tour` attributes; the
  // `demo` scenes are rendered by the Zeiterfassung page and never saved.
  const tutorialStep = (
    key: string,
    options: Omit<TutorialStep, "title" | "body">,
  ): TutorialStep => ({
    ...options,
    title: tTutorial(`steps.${key}.title`),
    body: tTutorial(`steps.${key}.body`),
  });
  const tutorialSteps: TutorialStep[] = [
    tutorialStep("welcome", { route: "/zeiterfassung", demo: "empty" }),
    tutorialStep("dayNav", {
      route: "/zeiterfassung",
      target: "day-nav",
      demo: "empty",
    }),
    tutorialStep("timeGrid", {
      route: "/zeiterfassung",
      // The example's selected cells (00:00–06:00), not the whole grid
      selector: '[data-tour="time-grid"] [data-selected]',
      placement: "right",
      demo: "select-night",
    }),
    tutorialStep("primaryActivity", {
      route: "/zeiterfassung",
      // "Persönliche Pflege" (category code 0), tapped on "Weiter"
      selector: '[data-tour-category="0"]',
      placement: "left",
      tapOnNext: true,
      demo: "select-night",
    }),
    tutorialStep("secondaryActivity", {
      route: "/zeiterfassung",
      target: "no-secondary-button",
      tapOnNext: true,
      demo: "primary-chosen",
    }),
    tutorialStep("device", {
      route: "/zeiterfassung",
      target: "activity-panel",
      demo: "device",
    }),
    tutorialStep("location", {
      route: "/zeiterfassung",
      target: "activity-panel",
      demo: "location",
    }),
    tutorialStep("social", {
      route: "/zeiterfassung",
      target: "activity-panel",
      demo: "social",
    }),
    tutorialStep("mood", {
      route: "/zeiterfassung",
      target: "activity-panel",
      demo: "satisfaction",
    }),
    tutorialStep("overview", {
      route: "/erfasste-zeit",
      target: "tab-erfasste-zeit",
      backdrop: "none",
    }),
    tutorialStep("statistics", {
      route: "/statistiken",
      target: "tab-statistiken",
      backdrop: "none",
    }),
    tutorialStep("settings", {
      target: "settings-panel",
      openSettings: true,
    }),
  ];

  const adminTabs = [
    { id: "kursuebersicht", label: t("adminTabs.kursuebersicht"), icon: BookOpen },
    { id: "nutzeruebersicht", label: t("adminTabs.nutzeruebersicht"), icon: Users },
    { id: "statistiken", label: t("adminTabs.statistiken"), icon: BarChart3 },
  ];

  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [isEnrolled, setIsEnrolled] = useState<boolean | null>(null);
  const [needsSecurityQuestions, setNeedsSecurityQuestions] = useState<
    boolean | null
  >(null);
  const [needsProfileDetails, setNeedsProfileDetails] = useState<
    boolean | null
  >(null);
  const [accessCheckReady, setAccessCheckReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [securityQuestionsModalOpen, setSecurityQuestionsModalOpen] =
    useState(false);
  const [securityQuestionsMandatory, setSecurityQuestionsMandatory] =
    useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileModalMandatory, setProfileModalMandatory] = useState(false);
  const [profileFormIsEditing, setProfileFormIsEditing] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  const [isChangingLocale, setIsChangingLocale] = useState(false);
  const [adminMode, setAdminMode] = useState(false);
  const [activeAdminTab, setActiveAdminTab] = useState("kursuebersicht");
  // Role fetched from profiles.role (the authoritative source — not JWT metadata)
  const [profileRole, setProfileRole] = useState<string>("user");
  const [profileFirstName, setProfileFirstName] = useState("");
  const [profileLastName, setProfileLastName] = useState("");
  const [activeCourseName, setActiveCourseName] = useState("");
  // null = unknown (still loading), then whether profiles.tutorial_completed_at is set
  const [tutorialSeen, setTutorialSeen] = useState<boolean | null>(null);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  // Bumped on every start so a restart always begins at step 1
  const [tutorialRunId, setTutorialRunId] = useState(0);

  const isAdmin = profileRole === "admin";

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
    setNeedsSecurityQuestions(null);
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

    // Separate query so a missing column (migration not yet applied) can't
    // break the role lookup above; on error treat the tour as seen rather than
    // re-showing it on every login
    const { data: tutorialData, error: tutorialError } = await supabase
      .from("profiles")
      .select("tutorial_completed_at")
      .eq("id", authUser.id)
      .single();
    setTutorialSeen(
      tutorialError ? true : !!tutorialData?.tutorial_completed_at,
    );

    // Admins skip profile completion and course enrollment requirements
    if (role === "admin") {
      setNeedsSecurityQuestions(false);
      setNeedsProfileDetails(false);
      setIsEnrolled(true);
      setSecurityQuestionsMandatory(false);
      setSecurityQuestionsModalOpen(false);
      setProfileModalMandatory(false);
      setProfileModalOpen(false);
      await checkEnrollment(authUser.id);
      setAccessCheckReady(true);
      return;
    }

    const hasSecurityQuestions = await checkSecurityQuestions(authUser.id);
    setNeedsSecurityQuestions(!hasSecurityQuestions);

    if (!hasSecurityQuestions) {
      setProfileMenuOpen(false);
      setSettingsOpen(false);
      setSecurityQuestionsMandatory(true);
      setSecurityQuestionsModalOpen(true);
      setProfileModalMandatory(false);
      setProfileModalOpen(false);
      // Prevent null-guard from blocking render while modal is open
      setNeedsProfileDetails(false);
      setIsEnrolled(false);
      setAccessCheckReady(true);
      return;
    }

    setSecurityQuestionsMandatory(false);
    setSecurityQuestionsModalOpen(false);

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

  async function checkSecurityQuestions(userId: string) {
    const { data, error } = await supabase
      .from("user_security_question")
      .select("user_security_question_id")
      .eq("profiles_id", userId);

    if (error) {
      return false;
    }

    return (data?.length ?? 0) === 2;
  }

  async function checkEnrollment(userId: string) {
    const { data } = await supabase
      .from("user_course")
      .select("user_course_id, course:course_id(name)")
      .eq("profiles_id", userId)
      .single();

    setIsEnrolled(!!data);
    let courseName = "";
    if (data?.course) {
      const c = data.course;
      if (Array.isArray(c)) {
        courseName = (c[0] as { name?: string })?.name ?? "";
      } else if (typeof c === "object" && c !== null) {
        courseName = (c as { name?: string }).name ?? "";
      }
    }
    setActiveCourseName(courseName);
  }

  function handleEnrolled() {
    if (user) {
      void checkEnrollment(user.id);
      return;
    }
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

  async function handleSecurityQuestionsSaved() {
    if (!user) {
      return;
    }

    setSecurityQuestionsModalOpen(false);
    setSecurityQuestionsMandatory(false);
    setNeedsSecurityQuestions(false);
    setAccessCheckReady(false);

    const hasProfileDetails = await checkProfileDetails(user.id);
    setNeedsProfileDetails(!hasProfileDetails);

    if (!hasProfileDetails) {
      setProfileModalMandatory(true);
      setProfileModalOpen(true);
      setIsEnrolled(null);
      setAccessCheckReady(true);
      return;
    }

    setProfileModalMandatory(false);
    setProfileModalOpen(false);
    await checkEnrollment(user.id);
    setAccessCheckReady(true);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setAccessCheckReady(false);
    setNeedsSecurityQuestions(null);
    setNeedsProfileDetails(null);
    setIsEnrolled(null);
    setSecurityQuestionsMandatory(false);
    setSecurityQuestionsModalOpen(false);
    setProfileFormIsEditing(false);
    setProfileModalMandatory(false);
    setProfileModalOpen(false);
    setProfileFirstName("");
    setProfileLastName("");
    setActiveCourseName("");
    setTutorialSeen(null);
    setTutorialOpen(false);
    router.push("/");
  }

  // Starts the tour on the Zeiterfassung page (its targets live there); the
  // tour keeps looking for targets while the page is still loading
  function startTutorial() {
    setSettingsOpen(false);
    setProfileMenuOpen(false);
    setAdminMode(false);
    if (pathname !== "/zeiterfassung") {
      router.push("/zeiterfassung");
    }
    setTutorialRunId((current) => current + 1);
    setTutorialOpen(true);
  }

  // Navigates / opens the settings panel for the step the tour just showed
  function handleTutorialStepChange(step: TutorialStep) {
    if (step.route && step.route !== pathname) {
      router.push(step.route);
    }
    setSettingsOpen(!!step.openSettings);
  }

  // Finishing and skipping both count as seen — it won't auto-start again.
  // Ends on the Zeiterfassung page so the user can start entering right away.
  async function handleTutorialFinish() {
    setTutorialOpen(false);
    setTutorialSeen(true);
    setSettingsOpen(false);
    if (pathname !== "/zeiterfassung") {
      router.push("/zeiterfassung");
    }
    if (!user) return;
    await supabase
      .from("profiles")
      .update({ tutorial_completed_at: new Date().toISOString() })
      .eq("id", user.id);
  }

  function handleProfileModalClose() {
    if (profileModalMandatory) {
      return;
    }

    if (profileFormIsEditing) {
      const shouldClose = window.confirm(t("confirmDiscardProfileEdit"));

      if (!shouldClose) {
        return;
      }
    }

    setProfileFormIsEditing(false);
    setProfileModalOpen(false);
  }

  function handleSecurityQuestionsModalClose() {
    if (securityQuestionsMandatory) {
      return;
    }

    setSecurityQuestionsModalOpen(false);
  }

  function openProfileModal() {
    setProfileMenuOpen(false);
    setProfileModalMandatory(false);
    setProfileFormIsEditing(false);
    setProfileModalOpen(true);
  }

  function openSecurityQuestionsModal() {
    setProfileMenuOpen(false);
    setSecurityQuestionsMandatory(false);
    setSecurityQuestionsModalOpen(true);
  }

  // Persists the chosen language to profiles.locale (the cross-device source
  // of truth, read by proxy.ts on every request) and to the NEXT_LOCALE
  // cookie next-intl reads, then reloads so the new locale takes effect.
  async function handleLocaleChange(newLocale: "de" | "en") {
    if (!user || newLocale === locale || isChangingLocale) return;
    setIsChangingLocale(true);
    await supabase.from("profiles").update({ locale: newLocale }).eq("id", user.id);
    document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=31536000`;
    window.location.reload();
  }

  // Auto-start once for regular users who are fully onboarded (security
  // questions, profile, course enrollment) and haven't seen the tour yet
  useEffect(() => {
    if (
      tutorialSeen === false &&
      !tutorialOpen &&
      !isAdmin &&
      accessCheckReady &&
      needsSecurityQuestions === false &&
      needsProfileDetails === false &&
      isEnrolled === true
    ) {
      startTutorial();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tutorialSeen,
    tutorialOpen,
    isAdmin,
    accessCheckReady,
    needsSecurityQuestions,
    needsProfileDetails,
    isEnrolled,
  ]);

  if (
    !user ||
    !accessCheckReady ||
    needsSecurityQuestions === null ||
    needsProfileDetails === null ||
    (!needsSecurityQuestions && !needsProfileDetails && isEnrolled === null)
  ) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
        <div className="mx-auto max-w-7xl px-4 py-16 text-center">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {t("loadingSession")}
          </p>
        </div>
      </div>
    );
  }

  const fullName = [profileFirstName, profileLastName]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" ");

  const showSecurityQuestionsGate = needsSecurityQuestions === true;
  const showProfileDetailsGate =
    needsSecurityQuestions === false && needsProfileDetails === true;
  const showEnrollmentGate =
    needsSecurityQuestions === false &&
    needsProfileDetails === false &&
    isEnrolled === false;
  const showOnboardingGate =
    showSecurityQuestionsGate || showProfileDetailsGate || showEnrollmentGate;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
      {!showOnboardingGate && (
        <>
          <header
            className={`sticky top-0 z-20 border-b backdrop-blur transition-colors ${
              adminMode
                ? "border-amber-200 bg-amber-50/95 dark:border-amber-800/60 dark:bg-amber-950/90"
                : "border-slate-200 bg-white/95 dark:border-slate-800 dark:bg-slate-950/95"
            }`}
          >
            <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icon.svg" alt="" className="h-8 w-8 shrink-0" />
                <h1 className="shrink-0 whitespace-nowrap text-base font-semibold text-slate-800 dark:text-slate-100 sm:text-lg">
                  Time Use Tool
                </h1>
                {activeCourseName && !adminMode && (
                  <>
                    <span className="shrink-0 text-slate-300 dark:text-slate-600">
                      ·
                    </span>
                    <span className="min-w-0 truncate text-xs font-medium text-slate-500 dark:text-slate-400 sm:text-sm">
                      {activeCourseName}
                    </span>
                  </>
                )}
              </div>

              {/* Admin mode badge — centered */}
              {adminMode && (
                <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100 px-3 py-1 dark:border-amber-600/50 dark:bg-amber-900/40">
                  <ShieldCheck
                    size={13}
                    className="shrink-0 text-amber-700 dark:text-amber-400"
                  />
                  <span className="text-xs font-semibold tracking-wide text-amber-800 dark:text-amber-300">
                    {t("adminModeBadge")}
                  </span>
                </div>
              )}

              <div className="ml-3 flex shrink-0 items-center gap-2">
                {isAdmin &&
                  (adminMode ? (
                    <button
                      type="button"
                      aria-label={t("backToEntryAriaLabel")}
                      className="inline-flex min-w-[5.9rem] items-center justify-center gap-1.5 rounded-2xl border border-sky-200 bg-sky-50 px-2.5 py-2 text-xs font-semibold tracking-tight text-sky-700 shadow-sm transition-colors hover:border-sky-300 hover:bg-sky-100 hover:text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:border-sky-500/60 dark:hover:bg-sky-500/15 sm:min-w-[7.75rem] sm:gap-2 sm:px-3.5 sm:text-sm"
                      onClick={() => {
                        setAdminMode(false);
                        setSettingsOpen(false);
                      }}
                    >
                      <ArrowLeft size={16} className="shrink-0" />
                      <span className="text-center leading-[1.05] sm:leading-none">
                        <span className="block sm:inline">
                          {t("backToEntryLine1")}
                        </span>
                        <span className="block sm:inline sm:ml-1">
                          {t("backToEntryLine2")}
                        </span>
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-label={t("adminCenterAriaLabel")}
                      className="inline-flex min-w-[5.9rem] items-center justify-center gap-1.5 rounded-2xl border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs font-semibold tracking-tight text-amber-800 shadow-sm transition-colors hover:border-amber-400 hover:bg-amber-100 hover:text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:border-amber-500/60 dark:hover:bg-amber-500/15 sm:min-w-[7.75rem] sm:gap-2 sm:px-3.5 sm:text-sm"
                      onClick={() => {
                        setAdminMode(true);
                        setSettingsOpen(false);
                      }}
                    >
                      <ShieldCheck size={16} className="shrink-0" />
                      <span className="text-center leading-[1.05] sm:leading-none">
                        <span className="block sm:inline">
                          {t("adminModeLine1")}
                        </span>
                        <span className="block sm:inline">
                          {t("adminModeLine2")}
                        </span>
                      </span>
                    </button>
                  ))}

                <div className="relative" ref={profileMenuRef}>
                  <div className="group relative">
                    <button
                      type="button"
                      aria-label={t("profileMenuAriaLabel")}
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
                      {t("profileTooltip")}
                    </span>
                  </div>

                  {profileMenuOpen && (
                    <div className="absolute right-0 mt-3 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-800 dark:bg-slate-900">
                      <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                          {fullName || t("profileNameMissing")}
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
                        {t("personalDetailsMenuItem")}
                      </button>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white"
                        onClick={openSecurityQuestionsModal}
                      >
                        <ShieldCheck size={16} />
                        {t("securityQuestionsMenuItem")}
                      </button>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-red-600 transition hover:bg-red-50 dark:hover:bg-red-500/10"
                        onClick={handleSignOut}
                      >
                        <LogOut size={16} />
                        {t("signOutMenuItem")}
                      </button>
                    </div>
                  )}
                </div>

                <div className="group relative">
                  <button
                    type="button"
                    data-tour="settings-button"
                    aria-label={t("settingsAriaLabel")}
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
                    {t("settingsTooltip")}
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
                          <Icon
                            size={18}
                            className="shrink-0 hidden sm:block"
                          />
                          <span className="hidden sm:inline">{tab.label}</span>
                          <span className="sm:hidden text-xs font-semibold">
                            {tab.label.charAt(0) +
                              tab.label.slice(1).toLowerCase()}
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
                          data-tour={tab.tourId}
                          className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-3 text-xs font-medium transition-colors sm:gap-2 sm:px-4 sm:text-sm ${
                            isActive
                              ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-300"
                              : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-slate-100"
                          }`}
                        >
                          <Icon size={16} className="shrink-0 sm:hidden" />
                          <Icon
                            size={18}
                            className="shrink-0 hidden sm:block"
                          />
                          <span className="hidden sm:inline">{tab.label}</span>
                          <span className="sm:hidden text-xs font-semibold">
                            {tab.label.charAt(0) +
                              tab.label.slice(1).toLowerCase()}
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
              <aside
                data-tour="settings-panel"
                className="flex h-full w-full max-w-sm flex-col border-l border-slate-200 bg-white p-5 shadow-2xl transition-colors dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {t("settingsPanelTitle")}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {t("settingsPanelDescription")}
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
                    setTheme((current) =>
                      current === "dark" ? "light" : "dark",
                    )
                  }
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {t("darkModeTitle")}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {t("darkModeDescription")}
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

                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {t("languageTitle")}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {t("languageDescription")}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={isChangingLocale}
                      onClick={() => handleLocaleChange("de")}
                      className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        locale === "de"
                          ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-500/10 dark:text-blue-300"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-500"
                      }`}
                    >
                      <Languages size={14} className="shrink-0" />
                      {t("languageDe")}
                    </button>
                    <button
                      type="button"
                      disabled={isChangingLocale}
                      onClick={() => handleLocaleChange("en")}
                      className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        locale === "en"
                          ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-500/10 dark:text-blue-300"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-500"
                      }`}
                    >
                      <Languages size={14} className="shrink-0" />
                      {t("languageEn")}
                    </button>
                  </div>
                </div>

                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {t("tutorialTitle")}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {t("tutorialDescription")}
                  </p>
                  <button
                    type="button"
                    onClick={startTutorial}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-blue-500 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-400 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20"
                  >
                    <RotateCcw size={14} className="shrink-0" />
                    {t("tutorialRestartButton")}
                  </button>
                </div>

                <div className="mt-auto rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-950">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    {t("accountSectionTitle")}
                  </p>
                  <dl className="mt-4 space-y-3 text-sm">
                    <div>
                      <dt className="text-xs text-slate-500 dark:text-slate-400">
                        {t("userIdLabel")}
                      </dt>
                      <dd className="mt-1 break-all font-mono text-xs text-slate-700 dark:text-slate-200">
                        {user.id}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500 dark:text-slate-400">
                        {t("lastLoginLabel")}
                      </dt>
                      <dd className="mt-1 text-slate-800 dark:text-slate-100">
                        {formatDateTime(user.last_sign_in_at, locale)}
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
              <div className="relative z-10 max-h-[90vh] w-full max-w-5xl overflow-y-auto scrollbar-thin rounded-3xl border border-slate-200 bg-white px-6 pb-6 shadow-2xl transition-colors dark:border-slate-800 dark:bg-slate-900">
                {!profileModalMandatory && (
                  <div className="mb-4 mt-4 flex justify-end">
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

          {securityQuestionsModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm">
              {!securityQuestionsMandatory && (
                <div
                  className="absolute inset-0"
                  onClick={handleSecurityQuestionsModalClose}
                />
              )}
              <div className="relative z-10 max-h-[90vh] w-full max-w-4xl overflow-y-auto scrollbar-thin rounded-3xl border border-slate-200 bg-white px-6 pb-6 shadow-2xl transition-colors dark:border-slate-800 dark:bg-slate-900">
                {!securityQuestionsMandatory && (
                  <div className="mb-4 mt-4 flex justify-end">
                    <button
                      type="button"
                      className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                      onClick={handleSecurityQuestionsModalClose}
                    >
                      <X size={20} />
                    </button>
                  </div>
                )}
                <SecurityQuestionsForm
                  allowEditToggle={!securityQuestionsMandatory}
                  requireCompletion={securityQuestionsMandatory}
                  onSaved={handleSecurityQuestionsSaved}
                />
              </div>
            </div>
          )}

          {tutorialOpen && (
            <TutorialTour
              key={tutorialRunId}
              steps={tutorialSteps}
              onFinish={handleTutorialFinish}
              onStepChange={handleTutorialStepChange}
            />
          )}

          {adminMode ? (
            <main className="mx-auto max-w-7xl px-4 py-6">
              {activeAdminTab === "kursuebersicht" && (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="mb-6 text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {t("kursuebersichtTitle")}
                  </h3>
                  <KursuebersichtTab />
                </div>
              )}
              {activeAdminTab === "nutzeruebersicht" && (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="mb-6 text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {t("nutzeruebersichtTitle")}
                  </h3>
                  <NutzeruebersichtTab />
                </div>
              )}
              {activeAdminTab === "statistiken" && (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="mb-6 text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {t("statistikenTitle")}
                  </h3>
                  <StatistikenTab />
                </div>
              )}
            </main>
          ) : (
            <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
          )}
        </>
      )}

      {showProfileDetailsGate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm">
          <div className="relative z-10 max-h-[90vh] w-full max-w-5xl overflow-y-auto scrollbar-thin rounded-3xl border border-slate-200 bg-white px-6 pb-6 shadow-2xl transition-colors dark:border-slate-800 dark:bg-slate-900">
            <ProfileDetailsForm
              allowEditToggle={false}
              initialEditMode={true}
              showAccountInfoBar={false}
              showPopupHint={false}
              requireCompletion={true}
              onEditStateChange={setProfileFormIsEditing}
              onSaved={handleProfileSaved}
            />
          </div>
        </div>
      )}

      {showSecurityQuestionsGate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm">
          <div className="relative z-10 max-h-[90vh] w-full max-w-4xl overflow-y-auto scrollbar-thin rounded-3xl border border-slate-200 bg-white px-6 pb-6 shadow-2xl transition-colors dark:border-slate-800 dark:bg-slate-900">
            <SecurityQuestionsForm
              allowEditToggle={false}
              requireCompletion={true}
              onSaved={handleSecurityQuestionsSaved}
            />
          </div>
        </div>
      )}

      {showEnrollmentGate && (
        <EnrollmentModal userId={user.id} onEnrolled={handleEnrolled} />
      )}
    </div>
  );
}
