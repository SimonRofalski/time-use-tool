"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { User as SupabaseUser } from "@supabase/supabase-js";
import { Check, Loader2, Pencil, Save, Search, User, X } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

interface LookupRow {
  id: number;
  code: string;
  name: string;
}

interface LookupTables {
  gender: LookupRow[];
  maritalStatus: LookupRow[];
  childrenInHousehold: LookupRow[];
  educationLevel: LookupRow[];
  employmentStatus: LookupRow[];
  occupationalStatus: LookupRow[];
  mainWorkplace: LookupRow[];
  healthStatus: LookupRow[];
  nationality: LookupRow[];
  region: LookupRow[];
  urbanity: LookupRow[];
}

interface FormData {
  genderId: string;
  age: string;
  maritalStatusId: string;
  partnerInHousehold: string;
  childrenInHouseholdId: string;
  educationLevelId: string;
  employmentStatusIds: string[];
  occupationalStatusId: string;
  weeklyWorkHours: string;
  mainWorkplaceId: string;
  healthStatusId: string;
  nationalityId: string;
  regionId: string;
  urbanityId: string;
}

const emptyForm: FormData = {
  genderId: "",
  age: "",
  maritalStatusId: "",
  partnerInHousehold: "",
  childrenInHouseholdId: "",
  educationLevelId: "",
  employmentStatusIds: [],
  occupationalStatusId: "",
  weeklyWorkHours: "",
  mainWorkplaceId: "",
  healthStatusId: "",
  nationalityId: "",
  regionId: "",
  urbanityId: "",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => getSupabaseBrowserClient() as any;

async function fetchLookup(table: string, idCol: string): Promise<LookupRow[]> {
  const { data } = await db()
    .from(table)
    .select(`${idCol}, code, name`)
    .order(idCol);

  if (!data) {
    return [];
  }

  return (data as Record<string, unknown>[]).map((row) => ({
    id: row[idCol] as number,
    code: row.code as string,
    name: row.name as string,
  }));
}

function userDataToForm(
  row: Record<string, unknown>,
  employmentStatusIds: number[],
): FormData {
  return {
    genderId: row.gender_id != null ? String(row.gender_id) : "",
    age: row.age != null ? String(row.age) : "",
    maritalStatusId:
      row.marital_status_id != null ? String(row.marital_status_id) : "",
    partnerInHousehold:
      row.partner_in_household === true
        ? "true"
        : row.partner_in_household === false
          ? "false"
          : "",
    childrenInHouseholdId:
      row.children_in_household_id != null
        ? String(row.children_in_household_id)
        : "",
    educationLevelId:
      row.education_level_id != null ? String(row.education_level_id) : "",
    employmentStatusIds: employmentStatusIds.map(String),
    occupationalStatusId:
      row.occupational_status_id != null
        ? String(row.occupational_status_id)
        : "",
    weeklyWorkHours:
      row.weekly_work_hours != null ? String(row.weekly_work_hours) : "",
    mainWorkplaceId:
      row.main_workplace_id != null ? String(row.main_workplace_id) : "",
    healthStatusId:
      row.health_status_id != null ? String(row.health_status_id) : "",
    nationalityId: row.nationality_id != null ? String(row.nationality_id) : "",
    regionId: row.region_id != null ? String(row.region_id) : "",
    urbanityId: row.urbanity_id != null ? String(row.urbanity_id) : "",
  };
}

function formToUserDataRow(form: FormData, profilesId: string) {
  const intOrNull = (value: string) => (value ? parseInt(value, 10) : null);
  const numOrNull = (value: string) => (value ? parseFloat(value) : null);

  return {
    profiles_id: profilesId,
    gender_id: intOrNull(form.genderId),
    age: intOrNull(form.age),
    marital_status_id: intOrNull(form.maritalStatusId),
    partner_in_household:
      form.partnerInHousehold === "true"
        ? true
        : form.partnerInHousehold === "false"
          ? false
          : null,
    children_in_household_id: intOrNull(form.childrenInHouseholdId),
    education_level_id: intOrNull(form.educationLevelId),
    occupational_status_id: intOrNull(form.occupationalStatusId),
    weekly_work_hours: numOrNull(form.weeklyWorkHours),
    main_workplace_id: intOrNull(form.mainWorkplaceId),
    health_status_id: intOrNull(form.healthStatusId),
    nationality_id: intOrNull(form.nationalityId),
    region_id: intOrNull(form.regionId),
    urbanity_id: intOrNull(form.urbanityId),
  };
}

function formatRole(role: string) {
  return role === "admin" ? "Admin" : "User";
}

function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  options: LookupRow[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((option) => String(option.id) === value);

  const filtered = useMemo(() => {
    if (!query) {
      return options.slice(0, 20);
    }

    const normalizedQuery = query.toLowerCase();
    return options
      .filter((option) => option.name.toLowerCase().includes(normalizedQuery))
      .slice(0, 20);
  }, [options, query]);

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type="text"
          value={open ? query : (selectedOption?.name ?? query)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (!disabled) {
              setOpen(true);
              setQuery("");
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full rounded-xl border px-4 py-3 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 ${
            disabled
              ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
              : "border-slate-300 bg-white focus:border-blue-500 focus:ring-blue-500"
          }`}
        />
      </div>
      {open && !disabled && (
        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-sm text-slate-400">
              Keine Treffer
            </div>
          ) : (
            filtered.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  onChange(String(option.id));
                  setQuery("");
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm transition-colors ${
                  value === String(option.id)
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-700 hover:bg-blue-50"
                }`}
              >
                <span>{option.name}</span>
                {value === String(option.id) && (
                  <Check size={16} className="text-blue-600" />
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function ProfileDetailsForm({
  allowEditToggle = false,
  initialEditMode = true,
  showAccountInfoBar = true,
  showPopupHint = true,
  onSaved,
}: {
  allowEditToggle?: boolean;
  initialEditMode?: boolean;
  showAccountInfoBar?: boolean;
  showPopupHint?: boolean;
  onSaved?: () => void;
}) {
  const supabase = getSupabaseBrowserClient();
  const savedFormData = useRef<string>(JSON.stringify(emptyForm));
  const userDataId = useRef<number | null>(null);

  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [role, setRole] = useState("");
  const [lookups, setLookups] = useState<LookupTables | null>(null);
  const [formData, setFormData] = useState<FormData>({ ...emptyForm });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(initialEditMode);

  const isDirty = JSON.stringify(formData) !== savedFormData.current;
  const isInteractive = allowEditToggle ? isEditing : true;
  const formId = useId();

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (cancelled) {
        return;
      }

      setUser(authUser);

      const [
        gender,
        maritalStatus,
        childrenInHousehold,
        educationLevel,
        employmentStatus,
        occupationalStatus,
        mainWorkplace,
        healthStatus,
        nationality,
        region,
        urbanity,
      ] = await Promise.all([
        fetchLookup("gender", "gender_id"),
        fetchLookup("marital_status", "marital_status_id"),
        fetchLookup("children_in_household", "children_in_household_id"),
        fetchLookup("education_level", "education_level_id"),
        fetchLookup("employment_status", "employment_status_id"),
        fetchLookup("occupational_status", "occupational_status_id"),
        fetchLookup("main_workplace", "main_workplace_id"),
        fetchLookup("health_status", "health_status_id"),
        fetchLookup("nationality", "nationality_id"),
        fetchLookup("region", "region_id"),
        fetchLookup("urbanity", "urbanity_id"),
      ]);

      if (cancelled) {
        return;
      }

      setLookups({
        gender,
        maritalStatus,
        childrenInHousehold,
        educationLevel,
        employmentStatus,
        occupationalStatus,
        mainWorkplace,
        healthStatus,
        nationality,
        region,
        urbanity,
      });

      if (authUser) {
        const [{ data: userData }, { data: profileRow }] = await Promise.all([
          db()
            .from("user_data")
            .select("*")
            .eq("profiles_id", authUser.id)
            .single(),
          db().from("profiles").select("role").eq("id", authUser.id).single(),
        ]);

        if (!cancelled && profileRow?.role) {
          setRole(profileRow.role);
        }

        let employmentStatusIds: number[] = [];
        if (userData) {
          userDataId.current = userData.user_data_id;
          const { data: employmentRows } = await db()
            .from("user_employment_status")
            .select("employment_status_id")
            .eq("user_data_id", userData.user_data_id);
          employmentStatusIds = (employmentRows ?? []).map(
            (row: { employment_status_id: number }) => row.employment_status_id,
          );
          const loadedForm = userDataToForm(userData, employmentStatusIds);
          if (!cancelled) {
            setFormData(loadedForm);
            savedFormData.current = JSON.stringify(loadedForm);
          }
        }
      }

      if (!cancelled) {
        setLoading(false);
      }
    }

    init();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      },
    );

    return () => {
      cancelled = true;
      listener?.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!isDirty || !isInteractive) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, isInteractive]);

  const updateField = (field: keyof FormData, value: string) => {
    if (!isInteractive) {
      return;
    }

    setFormData((previous) => ({ ...previous, [field]: value }));
  };

  const renderOptionCards = (field: keyof FormData, options: LookupRow[]) => (
    <div className="space-y-2">
      {options.map((option) => {
        const selected = formData[field] === String(option.id);
        return (
          <button
            key={option.id}
            type="button"
            disabled={!isInteractive}
            onClick={() => updateField(field, String(option.id))}
            className={`flex w-full items-center justify-between rounded-xl border-2 px-4 py-3 text-left text-sm transition-all ${
              selected
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : isInteractive
                  ? "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                  : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
            }`}
          >
            <span>{option.name}</span>
            {selected && <Check size={18} className="text-blue-600" />}
          </button>
        );
      })}
    </div>
  );

  const renderOptionCardsGrid = (
    field: keyof FormData,
    options: LookupRow[],
    cols: 2 | 3 | 4 = 2,
  ) => {
    const gridClass =
      cols === 3
        ? "grid grid-cols-1 gap-2 sm:grid-cols-3"
        : cols === 4
          ? "grid grid-cols-2 gap-2 sm:grid-cols-4"
          : "grid grid-cols-1 gap-2 sm:grid-cols-2";

    return (
      <div className={gridClass}>
        {options.map((option) => {
          const selected = formData[field] === String(option.id);
          return (
            <button
              key={option.id}
              type="button"
              disabled={!isInteractive}
              onClick={() => updateField(field, String(option.id))}
              className={`flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left text-sm transition-all ${
                selected
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : isInteractive
                    ? "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                    : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
              }`}
            >
              <span>{option.name}</span>
              {selected && <Check size={18} className="text-blue-600" />}
            </button>
          );
        })}
      </div>
    );
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !isInteractive) {
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      const row = formToUserDataRow(formData, user.id);

      if (userDataId.current) {
        const { error } = await db()
          .from("user_data")
          .update(row)
          .eq("user_data_id", userDataId.current);
        if (error) {
          throw error;
        }
      } else {
        const { data: inserted, error } = await db()
          .from("user_data")
          .insert(row)
          .select("user_data_id")
          .single();
        if (error) {
          throw error;
        }
        userDataId.current = inserted.user_data_id;
      }

      await db()
        .from("user_employment_status")
        .delete()
        .eq("user_data_id", userDataId.current);

      if (formData.employmentStatusIds.length > 0) {
        const junctionRows = formData.employmentStatusIds.map(
          (employmentStatusId) => ({
            user_data_id: userDataId.current!,
            employment_status_id: parseInt(employmentStatusId, 10),
          }),
        );
        const { error } = await db()
          .from("user_employment_status")
          .insert(junctionRows);
        if (error) {
          throw error;
        }
      }

      savedFormData.current = JSON.stringify(formData);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      if (allowEditToggle) {
        setIsEditing(false);
      }
      onSaved?.();
    } catch (error: unknown) {
      const message =
        error && typeof error === "object" && "message" in error
          ? (error as { message: string }).message
          : "Unbekannter Fehler";
      setSaveError(`Fehler beim Speichern: ${message}`);
    }

    setSaving(false);
  }

  function handleCancelEdit() {
    setFormData(JSON.parse(savedFormData.current) as FormData);
    setSaveError(null);
    setIsEditing(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={28} className="animate-spin text-blue-600" />
        <span className="ml-3 text-slate-500">Profil wird geladen…</span>
      </div>
    );
  }

  const lookupData = lookups!;

  return (
    <div className="mx-auto max-w-4xl">
      {showAccountInfoBar && user && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-900/50">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span>
              <span className="text-slate-400 dark:text-slate-500">Email:</span>{" "}
              <span className="text-slate-600 dark:text-slate-300">
                {user.email}
              </span>
            </span>
            <span>
              <span className="text-slate-400 dark:text-slate-500">
                User ID:
              </span>{" "}
              <span className="font-mono text-slate-600 dark:text-slate-300">
                {user.id}
              </span>
            </span>
            {role && (
              <span>
                <span className="text-slate-400 dark:text-slate-500">
                  Rolle:
                </span>{" "}
                <span
                  className={`font-medium ${role === "admin" ? "text-amber-600" : "text-slate-600 dark:text-slate-300"}`}
                >
                  {formatRole(role)}
                </span>
              </span>
            )}
            <span>
              <span className="text-slate-400 dark:text-slate-500">
                Letzter Login:
              </span>{" "}
              <span className="text-slate-600 dark:text-slate-300">
                {user.last_sign_in_at
                  ? new Date(user.last_sign_in_at).toLocaleString("de-DE")
                  : "-"}
              </span>
            </span>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="sticky top-0 z-20 -mx-6 -mt-6 mb-6 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
          <div className="flex items-center gap-3">
            <User className="text-blue-600" size={28} />
            <div>
              <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
                Profil
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Ihre persönlichen Angaben
              </p>
              {showPopupHint && (
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                  Die wichtigsten Kontodaten finden Sie zusätzlich im
                  Profil-Popup oben rechts.
                </p>
              )}
            </div>
          </div>

          {allowEditToggle && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {saved && (
                <span className="text-sm font-medium text-green-600">
                  Profil gespeichert!
                </span>
              )}
              {saveError && (
                <span className="text-sm font-medium text-red-600">
                  {saveError}
                </span>
              )}
              {!isEditing ? (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-blue-500 dark:hover:bg-blue-400 dark:focus:ring-offset-slate-900"
                >
                  <Pencil size={16} />
                  Bearbeiten
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800"
                  >
                    <X size={16} />
                    Abbrechen
                  </button>
                  <button
                    type="submit"
                    form={formId}
                    disabled={saving}
                    className="flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
                  >
                    {saving ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Save size={16} />
                    )}
                    {saving ? "Speichern..." : "Speichern"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <form id={formId} onSubmit={handleSubmit} className="space-y-8">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Geschlecht <span className="text-red-500">*</span>
              </label>
              {renderOptionCardsGrid("genderId", lookupData.gender, 2)}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Alter <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={formData.age}
                disabled={!isInteractive}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "" || value.length <= 4) {
                    updateField("age", value);
                  }
                }}
                className={`w-full rounded-xl border-2 px-4 py-3 text-sm focus:outline-none focus:ring-2 ${
                  isInteractive
                    ? "border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                    : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                }`}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Zivilstand / Familienstand{" "}
                <span className="text-red-500">*</span>
              </label>
              {renderOptionCards("maritalStatusId", lookupData.maritalStatus)}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Lebt ein/e Partner/in im selben Haushalt?{" "}
                <span className="text-red-500">*</span>
              </label>
              <div className="space-y-2">
                {[
                  { value: "true", label: "Ja" },
                  { value: "false", label: "Nein" },
                ].map((option) => {
                  const selected = formData.partnerInHousehold === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={!isInteractive}
                      onClick={() =>
                        updateField("partnerInHousehold", option.value)
                      }
                      className={`flex w-full items-center justify-between rounded-xl border-2 px-4 py-3 text-left text-sm transition-all ${
                        selected
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : isInteractive
                            ? "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                            : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                      }`}
                    >
                      <span>{option.label}</span>
                      {selected && (
                        <Check size={18} className="text-blue-600" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Anzahl Kinder im Haushalt <span className="text-red-500">*</span>
            </label>
            {renderOptionCardsGrid(
              "childrenInHouseholdId",
              lookupData.childrenInHousehold,
              Math.min(lookupData.childrenInHousehold.length, 4) as 2 | 3 | 4,
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Höchster abgeschlossener Bildungsabschluss{" "}
              <span className="text-red-500">*</span>
            </label>
            {renderOptionCards("educationLevelId", lookupData.educationLevel)}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Aktueller Erwerbsstatus <span className="text-red-500">*</span>
              <span className="ml-2 text-xs text-slate-400">
                (Mehrfachauswahl möglich)
              </span>
            </label>
            <div className="space-y-2">
              {lookupData.employmentStatus.map((option) => {
                const selected = formData.employmentStatusIds.includes(
                  String(option.id),
                );
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={!isInteractive}
                    onClick={() => {
                      if (!isInteractive) {
                        return;
                      }

                      setFormData((previous) => ({
                        ...previous,
                        employmentStatusIds: selected
                          ? previous.employmentStatusIds.filter(
                              (value) => value !== String(option.id),
                            )
                          : previous.employmentStatusIds.length < 2
                            ? [
                                ...previous.employmentStatusIds,
                                String(option.id),
                              ]
                            : previous.employmentStatusIds,
                      }));
                    }}
                    className={`flex w-full items-center justify-between rounded-xl border-2 px-4 py-3 text-left text-sm transition-all ${
                      selected
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : isInteractive
                          ? "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                          : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                    }`}
                  >
                    <span>{option.name}</span>
                    {selected && <Check size={18} className="text-blue-600" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Stellung im Beruf <span className="text-red-500">*</span>
              </label>
              {renderOptionCards(
                "occupationalStatusId",
                lookupData.occupationalStatus,
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Übliche Wochenarbeitszeit{" "}
                <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={formData.weeklyWorkHours}
                disabled={!isInteractive}
                onChange={(event) =>
                  updateField("weeklyWorkHours", event.target.value)
                }
                placeholder="z.B. 40"
                min="0"
                max="100"
                className={`w-full rounded-xl border-2 px-4 py-3 text-sm focus:outline-none focus:ring-2 ${
                  isInteractive
                    ? "border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                    : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                }`}
              />
              {formData.weeklyWorkHours && (
                <p className="mt-1 text-xs text-slate-400">
                  ≈{" "}
                  {Math.round(
                    (parseFloat(formData.weeklyWorkHours) / 41) * 100,
                  )}
                  % Pensum (Basis: 41 h/Woche CH)
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Hauptarbeitsort <span className="text-red-500">*</span>
            </label>
            {renderOptionCards("mainWorkplaceId", lookupData.mainWorkplace)}
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Allgemeiner Gesundheitszustand{" "}
                <span className="text-red-500">*</span>
              </label>
              {renderOptionCards("healthStatusId", lookupData.healthStatus)}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Urbanität <span className="text-red-500">*</span>
              </label>
              {renderOptionCards("urbanityId", lookupData.urbanity)}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Staatsangehörigkeit <span className="text-red-500">*</span>
              </label>
              <SearchableSelect
                options={lookupData.nationality}
                value={formData.nationalityId}
                onChange={(value) => updateField("nationalityId", value)}
                placeholder="Staatsangehörigkeit suchen…"
                disabled={!isInteractive}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Region / Wohnort <span className="text-red-500">*</span>
              </label>
              <SearchableSelect
                options={lookupData.region}
                value={formData.regionId}
                onChange={(value) => updateField("regionId", value)}
                placeholder="Region suchen…"
                disabled={!isInteractive}
              />
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
