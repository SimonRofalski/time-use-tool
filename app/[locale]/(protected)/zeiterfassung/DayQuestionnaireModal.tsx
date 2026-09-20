"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Loader2, Save } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import type { Locale } from "@/i18n/routing";
import { getLocalizedName } from "@/lib/i18n/localized-name";
import type { Activity, TimeEntryRecord } from "./types";

// ─── Lookup row shapes (specific to this feature, not shared elsewhere) ──────

type LookupRow = {
  code: string;
  name: string;
  name_en: string;
};

type DiaryFillTiming = LookupRow & { diary_fill_timing_id: number };
type DayTypeContext = LookupRow & { day_type_context_id: number };
type TripType = LookupRow & { trip_type_id: number };
type DayAppreciation = LookupRow & { day_appreciation_id: number };

type DayQuestionnaireLookups = {
  fillTimings: DiaryFillTiming[];
  dayTypes: DayTypeContext[];
  tripTypes: TripType[];
  dayAppreciations: DayAppreciation[];
};

type FormState = {
  diaryFillTimingId: number | null;
  mostPleasantActivityId: number | null;
  mostUnpleasantActivityId: number | null;
  mostStressfulActivityId: number | null;
  dayAppreciationId: number | null;
  isUnusualDay: boolean | null;
  dayTypeContextId: number | null;
  tripTypeId: number | null;
};

const EMPTY_FORM: FormState = {
  diaryFillTimingId: null,
  mostPleasantActivityId: null,
  mostUnpleasantActivityId: null,
  mostStressfulActivityId: null,
  dayAppreciationId: null,
  isUnusualDay: null,
  dayTypeContextId: null,
  tripTypeId: null,
};

type DayQuestionnaireModalProps = {
  dayId: number;
  existingEntries: TimeEntryRecord[];
  activities: Activity[];
  onSaved: () => void;
};

// A small reusable option-card row, mirroring ProfileDetailsForm's visual style
function OptionCards<T extends string | number>({
  options,
  selectedValue,
  onSelect,
}: {
  options: { value: T; label: string }[];
  selectedValue: T | null;
  onSelect: (value: T) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {options.map((option) => {
        const selected = selectedValue === option.value;
        return (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => onSelect(option.value)}
            className={`flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left text-sm transition-all ${
              selected
                ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-500/10 dark:text-blue-300"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-700"
            }`}
          >
            <span>{option.label}</span>
            {selected && <Check size={18} className="shrink-0 text-blue-600" />}
          </button>
        );
      })}
    </div>
  );
}

function QuestionPanel({
  label,
  isAnswered,
  children,
}: {
  label: string;
  isAnswered: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        isAnswered
          ? "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40"
          : "border-amber-200 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10"
      }`}
    >
      <label className="mb-3 block text-sm font-semibold text-slate-800 dark:text-slate-100">
        {label}
      </label>
      {children}
    </div>
  );
}

export default function DayQuestionnaireModal({
  dayId,
  existingEntries,
  activities,
  onSaved,
}: DayQuestionnaireModalProps) {
  const t = useTranslations("dayQuestionnaire");
  const locale = useLocale() as Locale;
  const supabase = getSupabaseBrowserClient();

  const [lookups, setLookups] = useState<DayQuestionnaireLookups | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showValidation, setShowValidation] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadLookups() {
      const [fillTimingsRes, dayTypesRes, tripTypesRes, dayAppreciationsRes] =
        await Promise.all([
          supabase
            .from("diary_fill_timing")
            .select("*")
            .order("diary_fill_timing_id"),
          supabase.from("day_type_context").select("*").order("day_type_context_id"),
          supabase.from("trip_type").select("*").order("trip_type_id"),
          supabase
            .from("day_appreciation")
            .select("*")
            .order("day_appreciation_id"),
        ]);

      if (cancelled) return;
      setLookups({
        fillTimings: fillTimingsRes.data ?? [],
        dayTypes: dayTypesRes.data ?? [],
        tripTypes: tripTypesRes.data ?? [],
        dayAppreciations: dayAppreciationsRes.data ?? [],
      });
    }

    void loadLookups();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Distinct primary activities logged that day (secondary activities excluded),
  // in the order they first appear
  const dayActivityIds = [
    ...new Set(existingEntries.map((entry) => entry.primary_activity_id)),
  ];
  const dayActivityOptions = dayActivityIds
    .map((activityId) => activities.find((a) => a.activity_id === activityId))
    .filter((activity): activity is Activity => !!activity)
    .map((activity) => ({
      value: activity.activity_id,
      label: getLocalizedName(activity, locale),
    }));

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  const isComplete =
    form.diaryFillTimingId !== null &&
    form.mostPleasantActivityId !== null &&
    form.mostUnpleasantActivityId !== null &&
    form.mostStressfulActivityId !== null &&
    form.dayAppreciationId !== null &&
    form.isUnusualDay !== null &&
    form.dayTypeContextId !== null &&
    form.tripTypeId !== null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isComplete) {
      setShowValidation(true);
      return;
    }

    setSaving(true);
    setSaveError(null);

    const { error } = await supabase.from("day_questionnaire").upsert(
      {
        day_id: dayId,
        diary_fill_timing_id: form.diaryFillTimingId,
        most_pleasant_activity_id: form.mostPleasantActivityId,
        most_unpleasant_activity_id: form.mostUnpleasantActivityId,
        most_stressful_activity_id: form.mostStressfulActivityId,
        day_appreciation_id: form.dayAppreciationId,
        is_unusual_day: form.isUnusualDay,
        day_type_context_id: form.dayTypeContextId,
        trip_type_id: form.tripTypeId,
      },
      { onConflict: "day_id" },
    );

    if (error) {
      setSaveError(t("saveError", { message: error.message }));
      setSaving(false);
      return;
    }

    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm">
      <div className="relative z-10 max-h-[90vh] w-full max-w-3xl overflow-y-auto scrollbar-thin rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl transition-colors dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {t("title")}
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t("description")}
        </p>

        {!lookups ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={28} className="animate-spin text-blue-600" />
            <span className="ml-3 text-slate-500 dark:text-slate-400">
              {t("loading")}
            </span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <QuestionPanel
              label={t("questions.fillTiming")}
              isAnswered={!showValidation || form.diaryFillTimingId !== null}
            >
              <OptionCards
                options={lookups.fillTimings.map((option) => ({
                  value: option.diary_fill_timing_id,
                  label: getLocalizedName(option, locale),
                }))}
                selectedValue={form.diaryFillTimingId}
                onSelect={(value) => updateField("diaryFillTimingId", value)}
              />
            </QuestionPanel>

            <QuestionPanel
              label={t("questions.mostPleasant")}
              isAnswered={!showValidation || form.mostPleasantActivityId !== null}
            >
              <OptionCards
                options={dayActivityOptions}
                selectedValue={form.mostPleasantActivityId}
                onSelect={(value) => updateField("mostPleasantActivityId", value)}
              />
            </QuestionPanel>

            <QuestionPanel
              label={t("questions.mostUnpleasant")}
              isAnswered={!showValidation || form.mostUnpleasantActivityId !== null}
            >
              <OptionCards
                options={dayActivityOptions}
                selectedValue={form.mostUnpleasantActivityId}
                onSelect={(value) => updateField("mostUnpleasantActivityId", value)}
              />
            </QuestionPanel>

            <QuestionPanel
              label={t("questions.mostStressful")}
              isAnswered={!showValidation || form.mostStressfulActivityId !== null}
            >
              <OptionCards
                options={dayActivityOptions}
                selectedValue={form.mostStressfulActivityId}
                onSelect={(value) => updateField("mostStressfulActivityId", value)}
              />
            </QuestionPanel>

            <QuestionPanel
              label={t("questions.dayAppreciation")}
              isAnswered={!showValidation || form.dayAppreciationId !== null}
            >
              <OptionCards
                options={lookups.dayAppreciations.map((option) => ({
                  value: option.day_appreciation_id,
                  label: getLocalizedName(option, locale),
                }))}
                selectedValue={form.dayAppreciationId}
                onSelect={(value) => updateField("dayAppreciationId", value)}
              />
            </QuestionPanel>

            <QuestionPanel
              label={t("questions.unusualDay.label")}
              isAnswered={!showValidation || form.isUnusualDay !== null}
            >
              <OptionCards
                options={[
                  { value: "ordinary", label: t("questions.unusualDay.ordinary") },
                  { value: "unusual", label: t("questions.unusualDay.unusual") },
                ]}
                selectedValue={
                  form.isUnusualDay === null
                    ? null
                    : form.isUnusualDay
                      ? "unusual"
                      : "ordinary"
                }
                onSelect={(value) =>
                  updateField("isUnusualDay", value === "unusual")
                }
              />
            </QuestionPanel>

            <QuestionPanel
              label={t("questions.dayType")}
              isAnswered={!showValidation || form.dayTypeContextId !== null}
            >
              <OptionCards
                options={lookups.dayTypes.map((option) => ({
                  value: option.day_type_context_id,
                  label: getLocalizedName(option, locale),
                }))}
                selectedValue={form.dayTypeContextId}
                onSelect={(value) => updateField("dayTypeContextId", value)}
              />
            </QuestionPanel>

            <QuestionPanel
              label={t("questions.tripType")}
              isAnswered={!showValidation || form.tripTypeId !== null}
            >
              <OptionCards
                options={lookups.tripTypes.map((option) => ({
                  value: option.trip_type_id,
                  label: getLocalizedName(option, locale),
                }))}
                selectedValue={form.tripTypeId}
                onSelect={(value) => updateField("tripTypeId", value)}
              />
            </QuestionPanel>

            {showValidation && !isComplete && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                {t("missingFieldsError")}
              </p>
            )}
            {saveError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                {saveError}
              </p>
            )}

            <div className="sticky bottom-0 -mx-6 border-t border-slate-200 bg-white/95 px-6 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
              <button
                type="submit"
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-400 dark:focus:ring-offset-slate-900"
              >
                {saving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                {saving ? t("savingButton") : t("saveButton")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
