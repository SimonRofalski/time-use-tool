"use client";

import { useState } from "react";
import {
  type PendingEntry,
  type QuestionnaireStep,
  type LookupData,
  type Category,
  getCategoryColor,
  CATEGORY_COLORS,
} from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

// Hierarchical structure built for rendering the activity tree
type ActivityNode = {
  activity_id: number;
  name: string;
};

type SubcategoryNode = {
  subcategory_id: number;
  name: string;
  activities: ActivityNode[];
};

type CategoryNode = {
  category_id: number;
  name: string;
  color: string;
  subcategories: SubcategoryNode[];
};

type ActivitySelectorProps = {
  step: QuestionnaireStep;
  pendingEntry: PendingEntry;
  selectedSlots: Set<string>;
  lookupData: LookupData;
  onStepComplete: (data: Partial<PendingEntry>) => void;
  onBack: () => void;
  onCancel: () => void;
};

// ─── Pure helper functions ────────────────────────────────────────────────────

// Builds the nested category → subcategory → activity hierarchy
// Filters by searchQuery if provided; hides empty branches
// excludeActivityId: optionally removes one activity from the list (used in
// the secondary activity step to prevent selecting the same as primary)
function buildActivityHierarchy(
  lookupData: LookupData,
  searchQuery: string,
  excludeActivityId?: number | null,
): CategoryNode[] {
  const query = searchQuery.toLowerCase().trim();

  return lookupData.categories
    .map((cat, index) => {
      const color = CATEGORY_COLORS[index % CATEGORY_COLORS.length];

      const subcategories = lookupData.subcategories
        .filter((sub) => sub.category_id === cat.category_id)
        .map((sub) => {
          const activities = lookupData.activities
            .filter((act) => act.subcategory_id === sub.subcategory_id)
            .filter((act) => act.activity_id !== excludeActivityId)
            .filter((act) =>
              query ? act.name.toLowerCase().includes(query) : true,
            )
            .map((act) => ({ activity_id: act.activity_id, name: act.name }));

          return {
            subcategory_id: sub.subcategory_id,
            name: sub.name,
            activities,
          };
        })
        .filter((sub) => sub.activities.length > 0); // hide empty subcategories

      return {
        category_id: cat.category_id,
        name: cat.name,
        color,
        subcategories,
      };
    })
    .filter((cat) => cat.subcategories.length > 0); // hide empty categories
}

// Returns the German question text for each questionnaire step
function getStepQuestion(step: QuestionnaireStep): string {
  switch (step) {
    case "primary_activity":
      return "Welche Haupttätigkeit hast du in dieser Zeit ausgeführt?";
    case "secondary_activity":
      return "Hast du gleichzeitig eine Nebentätigkeit ausgeführt?";
    case "digital_media":
      return "Hast du während dieser Zeit ein elektronisches Gerät benutzt?";
    case "digital_media_type":
      return "Welches Gerät hast du hauptsächlich benutzt?";
    case "location_transport":
      return "Wo warst du während dieser Zeit?";
    case "social_context":
      return "Mit wem warst du während dieser Zeit?";
    case "satisfaction":
      return "Wie hast du dich während dieser Zeit gefühlt?";
  }
}

// Returns a 0–100 progress value used to fill the progress bar
function getStepProgress(step: QuestionnaireStep): number {
  const progressMap: Record<QuestionnaireStep, number> = {
    primary_activity: 5,
    secondary_activity: 20,
    digital_media: 38,
    digital_media_type: 52,
    location_transport: 65,
    social_context: 80,
    satisfaction: 100,
  };
  return progressMap[step] ?? 0;
}

// Formats the selected slot range as a readable string: "08:00 – 09:30 (9 Felder)"
function formatSlotsRange(slots: Set<string>): string {
  if (slots.size === 0) return "";
  const sorted = [...slots].sort();
  const firstSlot = sorted[0];
  const lastSlot = sorted[sorted.length - 1];
  const [lh, lm] = lastSlot.split(":").map(Number);
  const endTotal = lh * 60 + lm + 10;
  const endStr = `${Math.floor(endTotal / 60)
    .toString()
    .padStart(2, "0")}:${(endTotal % 60).toString().padStart(2, "0")}`;
  return `${firstSlot} – ${endStr} · ${slots.size} Felder`;
}

// ─── Step renderers ───────────────────────────────────────────────────────────

// Shared activity list used for both primary and secondary activity steps
// Renders category/subcategory headers with clickable activity buttons
function ActivityList({
  hierarchy,
  selectedActivityId,
  searchQuery,
  onSearchChange,
  onActivitySelect,
  topSlot,
}: {
  hierarchy: CategoryNode[];
  selectedActivityId: number | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onActivitySelect: (activityId: number) => void;
  topSlot?: React.ReactNode; // optional slot for the "Keine" button in step 2
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* Optional top content (e.g. "Keine Nebentätigkeit" button) */}
      {topSlot}

      {/* Search input */}
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Tätigkeit suchen..."
        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
      />

      {/* Scrollable activity list grouped by category and subcategory */}
      <div className="overflow-y-auto space-y-3" style={{ maxHeight: "380px" }}>
        {hierarchy.length === 0 && (
          <p className="text-center text-sm text-slate-400 py-6">
            Keine Tätigkeiten gefunden.
          </p>
        )}

        {hierarchy.map((cat) => (
          <div key={cat.category_id}>
            {/* Category header with colored left border */}
            <div
              className="flex items-center gap-2 mb-1.5 px-1"
              style={{
                borderLeft: `3px solid ${cat.color}`,
                paddingLeft: "8px",
              }}
            >
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {cat.name}
              </span>
            </div>

            {cat.subcategories.map((sub) => (
              <div key={sub.subcategory_id} className="mb-2 pl-3">
                {/* Subcategory label */}
                <p className="text-xs font-medium text-slate-400 mb-1">
                  {sub.name}
                </p>

                {/* Activity buttons */}
                <div className="flex flex-wrap gap-1.5">
                  {sub.activities.map((act) => {
                    const isSelected = selectedActivityId === act.activity_id;
                    return (
                      <button
                        key={act.activity_id}
                        type="button"
                        onClick={() => onActivitySelect(act.activity_id)}
                        className={`
                          rounded-full px-3 py-1 text-xs font-medium transition-all
                          ${
                            isSelected
                              ? "text-white shadow-sm scale-105"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }
                        `}
                        style={isSelected ? { backgroundColor: cat.color } : {}}
                      >
                        {act.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ActivitySelector({
  step,
  pendingEntry,
  selectedSlots,
  lookupData,
  onStepComplete,
  onBack,
  onCancel,
}: ActivitySelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // When step changes, reset the search field
  // (handled by the parent changing the step prop)
  const hierarchy = buildActivityHierarchy(lookupData, searchQuery);

  // ── Step content renderers ──────────────────────────────────────────────────

  // Step 1: select the main (required) activity
  function renderPrimaryActivityStep() {
    return (
      <ActivityList
        hierarchy={hierarchy}
        selectedActivityId={pendingEntry.primary_activity_id}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onActivitySelect={(activityId) => {
          setSearchQuery("");
          onStepComplete({ primary_activity_id: activityId });
        }}
      />
    );
  }

  // Step 2: select an optional secondary activity
  // Includes a "Keine Nebentätigkeit" button at the top
  // The primary activity is excluded from the list to prevent check constraint violations
  function renderSecondaryActivityStep() {
    const hierarchyWithoutPrimary = buildActivityHierarchy(
      lookupData,
      searchQuery,
      pendingEntry.primary_activity_id,
    );
    return (
      <ActivityList
        hierarchy={hierarchyWithoutPrimary}
        selectedActivityId={pendingEntry.secondary_activity_id}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onActivitySelect={(activityId) => {
          setSearchQuery("");
          onStepComplete({ secondary_activity_id: activityId });
        }}
        topSlot={
          <button
            type="button"
            onClick={() => onStepComplete({ secondary_activity_id: null })}
            className="w-full rounded-lg border-2 border-slate-400 py-2 text-sm font-medium text-slate-600 hover:border-slate-600 hover:text-slate-800 transition-colors"
          >
            Keine Nebentätigkeit
          </button>
        }
      />
    );
  }

  // Step 3: yes/no — did the user use an electronic device?
  function renderDigitalMediaStep() {
    return (
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Ja", value: true, icon: "📱" },
          { label: "Nein", value: false, icon: "🚫" },
        ].map(({ label, value, icon }) => {
          const isSelected = pendingEntry.digital_media_used === value;
          return (
            <button
              key={label}
              type="button"
              onClick={() => onStepComplete({ digital_media_used: value })}
              className={`
                flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-6
                font-medium transition-all
                ${
                  isSelected
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                }
              `}
            >
              <span className="text-3xl">{icon}</span>
              <span className="text-sm">{label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // Step 4 (conditional): which type of device was used?
  function renderDigitalMediaTypeStep() {
    return (
      <div className="space-y-2">
        {lookupData.digitalMediaTypes.map((type) => {
          const isSelected =
            pendingEntry.digital_media_type_id === type.digital_media_type_id;
          return (
            <button
              key={type.digital_media_type_id}
              type="button"
              onClick={() =>
                onStepComplete({
                  digital_media_type_id: type.digital_media_type_id,
                })
              }
              className={`
                w-full rounded-lg border px-4 py-3 text-left text-sm font-medium transition-all
                ${
                  isSelected
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                }
              `}
            >
              {type.name}
            </button>
          );
        })}
      </div>
    );
  }

  // Step 5: where was the user? (2-column grid so all options fit without scrolling)
  function renderLocationStep() {
    return (
      <div className="grid grid-cols-2 gap-2">
        {lookupData.locationTransports.map((loc) => {
          const isSelected =
            pendingEntry.location_transport_id === loc.location_transport_id;
          return (
            <button
              key={loc.location_transport_id}
              type="button"
              onClick={() =>
                onStepComplete({
                  location_transport_id: loc.location_transport_id,
                })
              }
              className={`
                rounded-lg border px-3 py-2 text-left text-xs font-medium leading-tight transition-all
                ${
                  isSelected
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                }
              `}
            >
              {loc.name}
            </button>
          );
        })}
      </div>
    );
  }

  // Step 6: who was the user with? (multiple choice — needs explicit confirm)
  function renderSocialContextStep() {
    const selectedIds = new Set(pendingEntry.social_context_ids);

    // Toggle a social context id in the pending selection
    function toggleSocialContext(id: number) {
      const updated = new Set(selectedIds);
      if (updated.has(id)) {
        updated.delete(id);
      } else {
        updated.add(id);
      }
      // Update pendingEntry directly without advancing step
      onStepComplete({ social_context_ids: [...updated] });
    }

    return (
      <div className="space-y-3">
        <div className="space-y-2">
          {lookupData.socialContexts.map((ctx) => {
            const isSelected = selectedIds.has(ctx.social_context_id);
            return (
              <button
                key={ctx.social_context_id}
                type="button"
                onClick={() => toggleSocialContext(ctx.social_context_id)}
                className={`
                  w-full rounded-lg border px-4 py-3 text-left text-sm font-medium
                  flex items-center justify-between transition-all
                  ${
                    isSelected
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                  }
                `}
              >
                <span>{ctx.name}</span>
                {isSelected && (
                  <span className="text-blue-500 font-bold">✓</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Confirm multi-selection and advance to next step */}
        {/* _advance flag tells the parent this is a step transition, not a toggle update */}
        <button
          type="button"
          onClick={() =>
            onStepComplete({
              social_context_ids: [...selectedIds],
              _advance: true,
            } as any)
          }
          className="w-full rounded-lg bg-slate-800 py-2.5 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
        >
          Weiter
        </button>
      </div>
    );
  }

  // Step 7 (final): how did the user feel? (single choice — selecting saves immediately)
  function renderSatisfactionStep() {
    return (
      <div className="space-y-2">
        {lookupData.satisfactions.map((sat) => {
          const isSelected =
            pendingEntry.satisfaction_id === sat.satisfaction_id;
          return (
            <button
              key={sat.satisfaction_id}
              type="button"
              onClick={() =>
                onStepComplete({ satisfaction_id: sat.satisfaction_id })
              }
              className={`
                w-full rounded-lg border px-4 py-3 text-left text-sm font-medium transition-all
                ${
                  isSelected
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                }
              `}
            >
              {sat.name}
            </button>
          );
        })}
      </div>
    );
  }

  // Render the correct step content
  function renderStepContent() {
    switch (step) {
      case "primary_activity":
        return renderPrimaryActivityStep();
      case "secondary_activity":
        return renderSecondaryActivityStep();
      case "digital_media":
        return renderDigitalMediaStep();
      case "digital_media_type":
        return renderDigitalMediaTypeStep();
      case "location_transport":
        return renderLocationStep();
      case "social_context":
        return renderSocialContextStep();
      case "satisfaction":
        return renderSatisfactionStep();
    }
  }

  const progressPercent = getStepProgress(step);
  const isFirstStep = step === "primary_activity";

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Header: selected time range + cancel button */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <span className="text-xs font-medium text-slate-400">
          {formatSlotsRange(selectedSlots)}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="text-slate-400 hover:text-slate-600 transition-colors text-lg leading-none"
          title="Auswahl aufheben"
        >
          ✕
        </button>
      </div>

      {/* Progress bar */}
      <div className="px-4 pb-3">
        <div className="h-1 w-full rounded-full bg-slate-100">
          <div
            className="h-1 rounded-full bg-blue-500 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="px-4 pb-3">
        <h3 className="text-sm font-semibold text-slate-800">
          {getStepQuestion(step)}
        </h3>
      </div>

      {/* Step content (scrollable if needed) */}
      <div className="px-4 pb-4">{renderStepContent()}</div>

      {/* Footer: back button (hidden only on the first step) */}
      {!isFirstStep && (
        <div className="px-4 pb-4">
          <button
            type="button"
            onClick={onBack}
            className="text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors"
          >
            ← Zurück
          </button>
        </div>
      )}
    </div>
  );
}
