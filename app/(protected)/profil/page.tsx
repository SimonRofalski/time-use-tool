"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { User as SupabaseUser } from "@supabase/supabase-js";
import { User, Save, Loader2, Check, Search } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  SearchableSelect component                                         */
/* ------------------------------------------------------------------ */
function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: LookupRow[];
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => String(o.id) === value);

  const filtered = useMemo(() => {
    if (!query) return options.slice(0, 20);
    const q = query.toLowerCase();
    return options.filter((o) => o.name.toLowerCase().includes(q)).slice(0, 20);
  }, [options, query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
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
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          placeholder={placeholder}
          className="w-full pl-9 pr-4 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-sm text-slate-400">
              Keine Treffer
            </div>
          ) : (
            filtered.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  onChange(String(opt.id));
                  setQuery("");
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between px-4 py-3 text-sm text-left hover:bg-blue-50 transition-colors ${
                  value === String(opt.id)
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-700"
                }`}
              >
                <span>{opt.name}</span>
                {value === String(opt.id) && (
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

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => getSupabaseBrowserClient() as any;

/** Fetch a lookup table and normalise column names to { id, code, name }. */
async function fetchLookup(table: string, idCol: string): Promise<LookupRow[]> {
  const { data } = await db()
    .from(table)
    .select(`${idCol}, code, name`)
    .order(idCol);
  if (!data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: r[idCol] as number,
    code: r.code as string,
    name: r.name as string,
  }));
}

function userDataToForm(
  row: Record<string, unknown>,
  empIds: number[],
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
    employmentStatusIds: empIds.map(String),
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
  const intOrNull = (v: string) => (v ? parseInt(v, 10) : null);
  const numOrNull = (v: string) => (v ? parseFloat(v) : null);
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

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ProfilPage() {
  const supabase = getSupabaseBrowserClient();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savedFormData = useRef<string>("");
  const userDataId = useRef<number | null>(null);
  const [formData, setFormData] = useState<FormData>({ ...emptyForm });
  const [lookups, setLookups] = useState<LookupTables | null>(null);
  const [role, setRole] = useState<string>("");

  /* ---- Load user + lookups + existing user_data ---- */
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      setUser(authUser);

      // Fetch all lookup tables in parallel
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
      if (cancelled) return;
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

      // Fetch existing user_data + role
      if (authUser) {
        const [{ data: ud }, { data: profileRow }] = await Promise.all([
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

        let empIds: number[] = [];
        if (ud) {
          userDataId.current = ud.user_data_id;
          const { data: empRows } = await db()
            .from("user_employment_status")
            .select("employment_status_id")
            .eq("user_data_id", ud.user_data_id);
          empIds = (empRows ?? []).map(
            (r: { employment_status_id: number }) => r.employment_status_id,
          );
          const loaded = userDataToForm(ud, empIds);
          if (!cancelled) {
            setFormData(loaded);
            savedFormData.current = JSON.stringify(loaded);
          }
        } else if (!cancelled) {
          savedFormData.current = JSON.stringify(emptyForm);
        }
      }
      if (!cancelled) setLoading(false);
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

  /* ---- Dirty tracking ---- */
  const isDirty = JSON.stringify(formData) !== savedFormData.current;

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty) return;
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a");
      if (
        anchor &&
        anchor.href &&
        anchor.href.startsWith(window.location.origin) &&
        !anchor.href.includes("/profil")
      ) {
        if (
          !window.confirm(
            "Du hast ungespeicherte Änderungen. Möchtest du die Seite wirklich verlassen?",
          )
        ) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [isDirty]);

  /* ---- Field updaters ---- */
  const updateField = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  /* ---- Submit ---- */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    setSaveError(null);

    try {
      const row = formToUserDataRow(formData, user.id);

      if (userDataId.current) {
        // Update existing
        const { error } = await db()
          .from("user_data")
          .update(row)
          .eq("user_data_id", userDataId.current);
        if (error) throw error;
      } else {
        // Insert new
        const { data: inserted, error } = await db()
          .from("user_data")
          .insert(row)
          .select("user_data_id")
          .single();
        if (error) throw error;
        userDataId.current = inserted.user_data_id;
      }

      // Sync employment status junction table
      await db()
        .from("user_employment_status")
        .delete()
        .eq("user_data_id", userDataId.current);

      if (formData.employmentStatusIds.length > 0) {
        const junctionRows = formData.employmentStatusIds.map((id) => ({
          user_data_id: userDataId.current!,
          employment_status_id: parseInt(id, 10),
        }));
        const { error: jErr } = await db()
          .from("user_employment_status")
          .insert(junctionRows);
        if (jErr) throw jErr;
      }

      const json = JSON.stringify(formData);
      savedFormData.current = json;
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "Unbekannter Fehler";
      setSaveError("Fehler beim Speichern: " + msg);
    }
    setSaving(false);
  };

  /* ---- Render helpers ---- */
  const renderOptionCards = (field: keyof FormData, options: LookupRow[]) => {
    return (
      <div className="space-y-2">
        {options.map((opt) => {
          const selected = formData[field] === String(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => updateField(field, String(opt.id))}
              className={`w-full flex items-center justify-between px-4 py-3 text-sm rounded-xl border-2 transition-all text-left ${
                selected
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <span>{opt.name}</span>
              {selected && (
                <Check size={18} className="text-blue-600 flex-shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    );
  };

  const renderOptionCardsGrid = (
    field: keyof FormData,
    options: LookupRow[],
    cols: 2 | 3 | 4 = 2,
  ) => {
    const gridClass =
      cols === 3
        ? "grid grid-cols-1 sm:grid-cols-3 gap-2"
        : cols === 4
          ? "grid grid-cols-2 sm:grid-cols-4 gap-2"
          : "grid grid-cols-1 sm:grid-cols-2 gap-2";
    return (
      <div className={gridClass}>
        {options.map((opt) => {
          const selected = formData[field] === String(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => updateField(field, String(opt.id))}
              className={`flex items-center justify-between px-4 py-3 text-sm rounded-xl border-2 transition-all text-left ${
                selected
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <span>{opt.name}</span>
              {selected && (
                <Check size={18} className="text-blue-600 flex-shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    );
  };

  /* ---- Loading state ---- */
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto flex items-center justify-center py-20">
        <Loader2 size={28} className="animate-spin text-blue-600" />
        <span className="ml-3 text-slate-500">Profil wird geladen…</span>
      </div>
    );
  }

  const L = lookups!;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Account info bar */}
      {user && (
        <div className="mb-4 bg-slate-50 rounded-lg border border-slate-200 px-5 py-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-slate-500">
            <span>
              <span className="text-slate-400">Email:</span>{" "}
              <span className="text-slate-600">{user.email}</span>
            </span>
            <span>
              <span className="text-slate-400">User ID:</span>{" "}
              <span className="font-mono text-slate-600">{user.id}</span>
            </span>
            {role && (
              <span>
                <span className="text-slate-400">Rolle:</span>{" "}
                <span
                  className={`font-medium ${
                    role === "admin" ? "text-amber-600" : "text-slate-600"
                  }`}
                >
                  {role === "admin" ? "Admin" : "User"}
                </span>
              </span>
            )}
            <span>
              <span className="text-slate-400">Letzter Login:</span>{" "}
              <span className="text-slate-600">
                {user.last_sign_in_at
                  ? new Date(user.last_sign_in_at).toLocaleString()
                  : "—"}
              </span>
            </span>
          </div>
        </div>
      )}

      {/* Profile form card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <User className="text-blue-600" size={28} />
          <div>
            <h2 className="text-xl font-semibold text-slate-800">Profil</h2>
            <p className="text-sm text-slate-500">Ihre persönlichen Angaben</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Row 1: Geschlecht + Alter */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Geschlecht <span className="text-red-500">*</span>
              </label>
              {renderOptionCardsGrid("genderId", L.gender, 2)}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Alter <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={formData.age}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "" || val.length <= 4) {
                    updateField("age", val);
                  }
                }}
                className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Row 2: Zivilstand + Partner im Haushalt */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Zivilstand / Familienstand{" "}
                <span className="text-red-500">*</span>
              </label>
              {renderOptionCards("maritalStatusId", L.maritalStatus)}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Lebt ein/e Partner/in im selben Haushalt?{" "}
                <span className="text-red-500">*</span>
              </label>
              <div className="space-y-2">
                {[
                  { value: "true", label: "Ja" },
                  { value: "false", label: "Nein" },
                ].map((opt) => {
                  const selected = formData.partnerInHousehold === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        updateField("partnerInHousehold", opt.value)
                      }
                      className={`w-full flex items-center justify-between px-4 py-3 text-sm rounded-xl border-2 transition-all text-left ${
                        selected
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <span>{opt.label}</span>
                      {selected && (
                        <Check
                          size={18}
                          className="text-blue-600 flex-shrink-0"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Kinder im Haushalt */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Anzahl Kinder im Haushalt <span className="text-red-500">*</span>
            </label>
            {renderOptionCardsGrid(
              "childrenInHouseholdId",
              L.childrenInHousehold,
              Math.min(L.childrenInHousehold.length, 4) as 2 | 3 | 4,
            )}
          </div>

          {/* Bildung */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Höchster abgeschlossener Bildungsabschluss{" "}
              <span className="text-red-500">*</span>
            </label>
            {renderOptionCards("educationLevelId", L.educationLevel)}
          </div>

          {/* Erwerbsstatus (Mehrfach) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Aktueller Erwerbsstatus <span className="text-red-500">*</span>
              <span className="text-slate-400 text-xs ml-2">
                (Mehrfachauswahl möglich)
              </span>
            </label>
            <div className="space-y-2">
              {L.employmentStatus.map((opt) => {
                const selected = formData.employmentStatusIds.includes(
                  String(opt.id),
                );
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setFormData((prev) => ({
                        ...prev,
                        employmentStatusIds: selected
                          ? prev.employmentStatusIds.filter(
                              (v) => v !== String(opt.id),
                            )
                          : prev.employmentStatusIds.length < 2
                            ? [...prev.employmentStatusIds, String(opt.id)]
                            : prev.employmentStatusIds,
                      }));
                    }}
                    className={`w-full flex items-center justify-between px-4 py-3 text-sm rounded-xl border-2 transition-all text-left ${
                      selected
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <span>{opt.name}</span>
                    {selected && (
                      <Check
                        size={18}
                        className="text-blue-600 flex-shrink-0"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row: Stellung im Beruf + Arbeitszeit */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Stellung im Beruf <span className="text-red-500">*</span>
              </label>
              {renderOptionCards("occupationalStatusId", L.occupationalStatus)}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Übliche Wochenarbeitszeit{" "}
                <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={formData.weeklyWorkHours}
                onChange={(e) => updateField("weeklyWorkHours", e.target.value)}
                placeholder="z.B. 40"
                min="0"
                max="100"
                className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {formData.weeklyWorkHours && (
                <p className="text-xs text-slate-400 mt-1">
                  ≈{" "}
                  {Math.round(
                    (parseFloat(formData.weeklyWorkHours) / 41) * 100,
                  )}
                  % Pensum (Basis: 41 h/Woche CH)
                </p>
              )}
            </div>
          </div>

          {/* Hauptarbeitsort */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Hauptarbeitsort <span className="text-red-500">*</span>
            </label>
            {renderOptionCards("mainWorkplaceId", L.mainWorkplace)}
          </div>

          {/* Gesundheit + Urbanität */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Allgemeiner Gesundheitszustand{" "}
                <span className="text-red-500">*</span>
              </label>
              {renderOptionCards("healthStatusId", L.healthStatus)}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Urbanität <span className="text-red-500">*</span>
              </label>
              {renderOptionCards("urbanityId", L.urbanity)}
            </div>
          </div>

          {/* Staatsangehörigkeit + Region — Suchfelder */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Staatsangehörigkeit <span className="text-red-500">*</span>
              </label>
              <SearchableSelect
                options={L.nationality}
                value={formData.nationalityId}
                onChange={(val) => updateField("nationalityId", val)}
                placeholder="Staatsangehörigkeit suchen…"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Region / Wohnort <span className="text-red-500">*</span>
              </label>
              <SearchableSelect
                options={L.region}
                value={formData.regionId}
                onChange={(val) => updateField("regionId", val)}
                placeholder="Region suchen…"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="pt-4 border-t border-slate-200 flex items-center gap-4">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 bg-slate-800 text-white rounded-xl hover:bg-slate-700 transition-colors disabled:opacity-50 text-sm font-medium"
            >
              {saving ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Save size={18} />
              )}
              {saving ? "Speichern…" : "Profil speichern"}
            </button>
            {saved && (
              <span className="text-sm text-green-600 font-medium">
                Profil gespeichert!
              </span>
            )}
            {saveError && (
              <span className="text-sm text-red-600 font-medium">
                {saveError}
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
