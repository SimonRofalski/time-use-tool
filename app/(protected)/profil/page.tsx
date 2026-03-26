"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { User as SupabaseUser } from "@supabase/supabase-js";
import { User, Save } from "lucide-react";

interface ProfileFormData {
  geschlecht: string;
  alter: string;
  zivilstand: string;
  erwachsenePersonImHaushalt: string;
  anzahlKinder: string;
  bildungsabschluss: string;
  erwerbsstatus: string[];
  stellungImBeruf: string;
  wochenarbeitszeit: string;
  hauptarbeitsort: string;
  gesundheitszustand: string;
  staatsangehoerigkeit: string;
  region: string;
  urbanitaet: string;
}

const STORAGE_KEY = "time-use-tool-profile";

export default function ProfilPage() {
  const supabase = getSupabaseBrowserClient();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [saved, setSaved] = useState(false);
  const [formData, setFormData] = useState<ProfileFormData>({
    geschlecht: "",
    alter: "",
    zivilstand: "",
    erwachsenePersonImHaushalt: "",
    anzahlKinder: "",
    bildungsabschluss: "",
    erwerbsstatus: [],
    stellungImBeruf: "",
    wochenarbeitszeit: "",
    hauptarbeitsort: "",
    gesundheitszustand: "",
    staatsangehoerigkeit: "",
    region: "",
    urbanitaet: "",
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      },
    );

    // Load saved profile from localStorage
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setFormData(JSON.parse(stored));
      } catch {
        // ignore invalid JSON
      }
    }

    return () => {
      listener?.subscription.unsubscribe();
    };
  }, [supabase]);

  const updateField = (field: keyof ProfileFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const renderOptionButtons = (
    field: keyof ProfileFormData,
    options: { value: string; label: string }[],
    columns: number = 2,
  ) => {
    const gridClass = `grid grid-cols-1 ${
      columns === 2
        ? "md:grid-cols-2"
        : columns === 3
          ? "md:grid-cols-3"
          : columns === 4
            ? "md:grid-cols-4"
            : "md:grid-cols-5"
    } gap-3`;

    return (
      <div className={gridClass}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => updateField(field, option.value)}
            className={`px-4 py-3 text-sm rounded-lg border transition-all text-left ${
              formData[field] === option.value
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-slate-700 border-slate-300 hover:border-blue-400 hover:bg-blue-50"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Profile form card */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <User className="text-blue-600" size={28} />
          <div>
            <h2 className="text-xl font-semibold text-slate-800">Profil</h2>
            <p className="text-sm text-slate-500">Ihre persönlichen Angaben</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Geschlecht */}
          <div>
            <label className="block text-sm text-slate-700 mb-2">
              Geschlecht <span className="text-red-500">*</span>
            </label>
            {renderOptionButtons(
              "geschlecht",
              [
                { value: "1", label: "Männlich" },
                { value: "2", label: "Weiblich" },
                { value: "3", label: "Andere / divers" },
                { value: "9", label: "Keine Angabe" },
              ],
              4,
            )}
          </div>

          {/* Alter */}
          <div>
            <label className="block text-sm text-slate-700 mb-2">
              Alter <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={formData.alter}
              onChange={(e) => updateField("alter", e.target.value)}
              placeholder="z.B. 35"
              min="0"
              max="120"
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Zivilstand / Familienstand */}
          <div>
            <label className="block text-sm text-slate-700 mb-2">
              Zivilstand / Familienstand <span className="text-red-500">*</span>
            </label>
            {renderOptionButtons(
              "zivilstand",
              [
                { value: "1", label: "Ledig" },
                { value: "2", label: "Verheiratet" },
                { value: "3", label: "Eingetragene Partnerschaft" },
                { value: "4", label: "Geschieden" },
                { value: "5", label: "Verwitwet" },
                { value: "6", label: "Getrennt lebend" },
              ],
              2,
            )}
          </div>

          {/* Lebt eine erwachsene Person im selben Haushalt */}
          <div>
            <label className="block text-sm text-slate-700 mb-2">
              Lebt eine erwachsene Person im selben Haushalt{" "}
              <span className="text-red-500">*</span>
            </label>
            {renderOptionButtons(
              "erwachsenePersonImHaushalt",
              [
                { value: "1", label: "Ja" },
                { value: "2", label: "Nein" },
              ],
              2,
            )}
          </div>

          {/* Anzahl Kinder im Haushalt */}
          <div>
            <label className="block text-sm text-slate-700 mb-2">
              Anzahl Kinder im Haushalt <span className="text-red-500">*</span>
            </label>
            {renderOptionButtons(
              "anzahlKinder",
              [
                { value: "0", label: "0" },
                { value: "1", label: "1" },
                { value: "2", label: "2" },
                { value: "3", label: "3" },
                { value: "4", label: "4 oder mehr" },
              ],
              5,
            )}
          </div>

          {/* Höchster abgeschlossener Bildungsabschluss */}
          <div>
            <label className="block text-sm text-slate-700 mb-2">
              Höchster abgeschlossener Bildungsabschluss{" "}
              <span className="text-red-500">*</span>
            </label>
            {renderOptionButtons(
              "bildungsabschluss",
              [
                { value: "1", label: "Keine formale Ausbildung" },
                { value: "2", label: "Primarschule" },
                { value: "3", label: "Sekundarstufe I" },
                {
                  value: "4",
                  label: "Sekundarstufe II (Berufsbildung / Gymnasium)",
                },
                {
                  value: "5",
                  label: "Tertiärstufe (Bachelor / FH / Universität)",
                },
                { value: "6", label: "Master / Doktorat" },
              ],
              2,
            )}
          </div>

          {/* Aktueller Erwerbsstatus (Mehrfachauswahl) */}
          <div>
            <label className="block text-sm text-slate-700 mb-2">
              Aktueller Erwerbsstatus <span className="text-red-500">*</span>
              <span className="text-slate-500 text-xs ml-2">
                (Mehrfachauswahl möglich)
              </span>
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { value: "1", label: "Erwerbstätig (Vollzeit)" },
                { value: "2", label: "Erwerbstätig (Teilzeit)" },
                { value: "3", label: "Selbständig" },
                { value: "4", label: "Arbeitslos" },
                { value: "5", label: "Schüler / Student" },
                { value: "6", label: "Pensioniert" },
                { value: "7", label: "Hausarbeit / Betreuung" },
                { value: "8", label: "Dauerhaft arbeitsunfähig" },
                { value: "9", label: "Sonstiges" },
              ].map((option) => {
                const selected = formData.erwerbsstatus.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setFormData((prev) => ({
                        ...prev,
                        erwerbsstatus: selected
                          ? prev.erwerbsstatus.filter((v) => v !== option.value)
                          : prev.erwerbsstatus.length < 2
                            ? [...prev.erwerbsstatus, option.value]
                            : prev.erwerbsstatus,
                      }));
                    }}
                    className={`px-4 py-3 text-sm rounded-lg border transition-all text-left ${
                      selected
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-slate-700 border-slate-300 hover:border-blue-400 hover:bg-blue-50"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Stellung im Beruf */}
          <div>
            <label className="block text-sm text-slate-700 mb-2">
              Stellung im Beruf <span className="text-red-500">*</span>
            </label>
            {renderOptionButtons(
              "stellungImBeruf",
              [
                { value: "1", label: "Angestellte / Angestellter" },
                { value: "2", label: "Selbständig ohne Angestellte" },
                { value: "3", label: "Selbständig mit Angestellten" },
                { value: "4", label: "Mithelfendes Familienmitglied" },
              ],
              2,
            )}
          </div>

          {/* Übliche Wochenarbeitszeit */}
          <div>
            <label className="block text-sm text-slate-700 mb-2">
              Übliche Wochenarbeitszeit <span className="text-red-500">*</span>
              <span className="text-slate-500 text-xs ml-2">
                (Stundenangabe pro Woche)
              </span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={formData.wochenarbeitszeit}
                onChange={(e) =>
                  updateField("wochenarbeitszeit", e.target.value)
                }
                placeholder="z.B. 40"
                min="0"
                max="100"
                className="w-32 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-500">
                {formData.wochenarbeitszeit
                  ? `≈ ${Math.round(
                      (parseFloat(formData.wochenarbeitszeit) / 41) * 100,
                    )}% Pensum (Basis: 41 h/Woche CH)`
                  : "Pensum wird berechnet"}
              </span>
            </div>
          </div>

          {/* Hauptarbeitsort */}
          <div>
            <label className="block text-sm text-slate-700 mb-2">
              Hauptarbeitsort <span className="text-red-500">*</span>
            </label>
            {renderOptionButtons(
              "hauptarbeitsort",
              [
                {
                  value: "1",
                  label: "Arbeitsplatz ausserhalb des Hauses",
                },
                { value: "2", label: "Zuhause (Homeoffice)" },
                { value: "3", label: "Wechselnde Arbeitsorte" },
                {
                  value: "4",
                  label: "Kein Arbeitsplatz (nicht erwerbstätig)",
                },
              ],
              2,
            )}
          </div>

          {/* Allgemeiner Gesundheitszustand */}
          <div>
            <label className="block text-sm text-slate-700 mb-2">
              Allgemeiner Gesundheitszustand{" "}
              <span className="text-red-500">*</span>
            </label>
            {renderOptionButtons(
              "gesundheitszustand",
              [
                { value: "1", label: "Sehr gut" },
                { value: "2", label: "Gut" },
                { value: "3", label: "Mittel" },
                { value: "4", label: "Schlecht" },
                { value: "5", label: "Sehr schlecht" },
              ],
              5,
            )}
          </div>

          {/* Staatsangehörigkeit */}
          <div>
            <label className="block text-sm text-slate-700 mb-2">
              Staatsangehörigkeit
              <span className="text-slate-500 text-xs ml-2">(Landcode)</span>
            </label>
            <input
              type="text"
              value={formData.staatsangehoerigkeit}
              onChange={(e) =>
                updateField("staatsangehoerigkeit", e.target.value)
              }
              placeholder="z.B. CH, DE, AT"
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Region / Wohnort */}
          <div>
            <label className="block text-sm text-slate-700 mb-2">
              Region / Wohnort <span className="text-red-500">*</span>
              <span className="text-slate-500 text-xs ml-2">
                (Region / Kanton)
              </span>
            </label>
            <input
              type="text"
              value={formData.region}
              onChange={(e) => updateField("region", e.target.value)}
              placeholder="z.B. Zürich, Bern, Wien"
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Urbanität */}
          <div>
            <label className="block text-sm text-slate-700 mb-2">
              Urbanität <span className="text-red-500">*</span>
            </label>
            {renderOptionButtons(
              "urbanitaet",
              [
                { value: "1", label: "Stadt / urban" },
                { value: "2", label: "Vorort" },
                { value: "3", label: "Ländlich" },
              ],
              3,
            )}
          </div>

          {/* Submit Button */}
          <div className="pt-4 border-t border-slate-200 flex items-center gap-4">
            <button
              type="submit"
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Save size={18} />
              Profil speichern
            </button>
            {saved && (
              <span className="text-sm text-green-600 font-medium">
                Profil gespeichert!
              </span>
            )}
          </div>
        </form>
      </div>

      {/* Account info card */}
      <div className="mt-6 bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">
          Kontoinformationen
        </h3>
        {user ? (
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <span className="text-slate-500 w-28 shrink-0">User ID</span>
              <span className="font-mono text-xs text-slate-700 break-all">
                {user.id}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-slate-500 w-28 shrink-0">Email</span>
              <span className="text-slate-700">{user.email}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-slate-500 w-28 shrink-0">Last sign in</span>
              <span className="text-slate-700">
                {user.last_sign_in_at
                  ? new Date(user.last_sign_in_at).toLocaleString()
                  : "—"}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Lade Kontoinformationen…</p>
        )}
      </div>
    </div>
  );
}
