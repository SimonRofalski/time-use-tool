"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import {
  type TimeEntryRecord,
  type LookupData,
  getCategoryColor,
} from "./types";

// ─── Helper functions ─────────────────────────────────────────────────────────

// Generates all 144 time slots as "HH:MM" strings in chronological order
// Result: ["00:00", "00:10", ..., "23:50"]
function generateAllSlots(): string[] {
  const slots: string[] = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let min = 0; min < 60; min += 10) {
      slots.push(
        `${hour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`
      );
    }
  }
  return slots;
}

// Returns all "HH:MM" slots that fall within an entry's time range
// start is inclusive, end is exclusive (e.g. "09:00" is not in a "08:00"–"09:00" entry)
function getSlotsForEntry(startTime: string, endTime: string): string[] {
  const slots: string[] = [];
  const [startHour, startMin] = startTime.split(":").map(Number);
  const [endHour, endMin] = endTime.split(":").map(Number);
  const startTotal = startHour * 60 + startMin;
  const endTotal = endHour * 60 + endMin;

  for (let min = startTotal; min < endTotal; min += 10) {
    slots.push(
      `${Math.floor(min / 60).toString().padStart(2, "0")}:${(min % 60).toString().padStart(2, "0")}`
    );
  }
  return slots;
}

// Builds a map from slot string → TimeEntryRecord for O(1) lookup per cell
function buildSlotToEntryMap(
  entries: TimeEntryRecord[]
): Map<string, TimeEntryRecord> {
  const map = new Map<string, TimeEntryRecord>();
  for (const entry of entries) {
    for (const slot of getSlotsForEntry(entry.start_time, entry.end_time)) {
      map.set(slot, entry);
    }
  }
  return map;
}

// Looks up the category_id for an activity by traversing activity → subcategory → category
function getCategoryIdForActivity(
  activityId: number,
  activities: LookupData["activities"],
  subcategories: LookupData["subcategories"]
): number | null {
  const activity = activities.find((a) => a.activity_id === activityId);
  if (!activity) return null;
  const subcategory = subcategories.find(
    (s) => s.subcategory_id === activity.subcategory_id
  );
  return subcategory?.category_id ?? null;
}

// Returns the CSS background style for a filled cell
// Single activity: solid color | Primary + secondary: top/bottom split
function getCellStyle(
  entry: TimeEntryRecord,
  lookupData: LookupData
): React.CSSProperties {
  const primaryCatId = getCategoryIdForActivity(
    entry.primary_activity_id,
    lookupData.activities,
    lookupData.subcategories
  );
  const primaryColor = primaryCatId
    ? getCategoryColor(primaryCatId, lookupData.categories)
    : "#94A3B8";

  if (!entry.secondary_activity_id) {
    return { backgroundColor: primaryColor };
  }

  // Two-tone: top half = primary, bottom half = secondary
  const secondaryCatId = getCategoryIdForActivity(
    entry.secondary_activity_id,
    lookupData.activities,
    lookupData.subcategories
  );
  const secondaryColor = secondaryCatId
    ? getCategoryColor(secondaryCatId, lookupData.categories)
    : "#94A3B8";

  return {
    background: `linear-gradient(to bottom, ${primaryColor} 50%, ${secondaryColor} 50%)`,
  };
}

// Builds the native tooltip text shown on hover: "08:30 – 08:40"
function getSlotTooltip(slot: string): string {
  const [hour, min] = slot.split(":").map(Number);
  const endTotal = hour * 60 + min + 10;
  const endStr = `${Math.floor(endTotal / 60).toString().padStart(2, "0")}:${(endTotal % 60).toString().padStart(2, "0")}`;
  return `${slot} – ${endStr}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

// Labels shown in the sticky header row (minute offsets per column)
const MINUTE_LABELS = [":00", ":10", ":20", ":30", ":40", ":50"];
// Labels shown on the left side (one per row = one per hour)
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) =>
  i.toString().padStart(2, "0")
);
// Pre-generated slot list (stable, never changes)
const ALL_SLOTS = generateAllSlots();

type TimeGridProps = {
  existingEntries: TimeEntryRecord[];
  selectedSlots: Set<string>;   // committed selection managed by parent
  lookupData: LookupData;
  onSlotsSelected: (slots: Set<string>) => void;
};

export default function TimeGrid({
  existingEntries,
  selectedSlots,
  lookupData,
  onSlotsSelected,
}: TimeGridProps) {
  // Ref tracks whether a drag is active — avoids state re-renders during drag
  const isDraggingRef = useRef(false);
  // Ref accumulates slots during drag for access inside the global mouseup handler
  const draggingSlotsRef = useRef(new Set<string>());
  // State drives visual update during drag (separate from ref for rendering)
  const [liveDraggingSlots, setLiveDraggingSlots] = useState(
    new Set<string>()
  );

  // Pre-built slot → entry map so each cell render is O(1)
  const slotToEntry = useMemo(
    () => buildSlotToEntryMap(existingEntries),
    [existingEntries]
  );

  // Global mouseup: finalizes the drag and passes the selection to the parent
  // Attached to document so mouseup outside the grid still ends the drag
  useEffect(() => {
    function handleGlobalMouseUp() {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      onSlotsSelected(new Set(draggingSlotsRef.current));
      draggingSlotsRef.current = new Set();
      setLiveDraggingSlots(new Set());
    }
    document.addEventListener("mouseup", handleGlobalMouseUp);
    return () => document.removeEventListener("mouseup", handleGlobalMouseUp);
  }, [onSlotsSelected]);

  // Start drag: clear previous live selection and add this slot
  function handleCellMouseDown(slot: string, event: React.MouseEvent) {
    event.preventDefault(); // prevent browser text-selection during drag
    isDraggingRef.current = true;
    draggingSlotsRef.current = new Set([slot]);
    setLiveDraggingSlots(new Set([slot]));
  }

  // Extend drag: add slot to live selection while mouse button is held
  function handleCellMouseEnter(slot: string) {
    if (!isDraggingRef.current) return;
    draggingSlotsRef.current.add(slot);
    setLiveDraggingSlots(new Set(draggingSlotsRef.current));
  }

  // A cell is highlighted if it is being dragged over OR in the committed selection
  function isCellHighlighted(slot: string): boolean {
    return liveDraggingSlots.has(slot) || selectedSlots.has(slot);
  }

  return (
    <div
      className="overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm select-none"
      style={{ maxHeight: "calc(100vh - 230px)" }}
    >
      {/* Sticky header row: minute-offset labels */}
      <div
        className="sticky top-0 z-10 grid bg-white border-b-2 border-slate-100"
        style={{ gridTemplateColumns: "2rem repeat(6, 1fr)" }}
      >
        <div className="h-8" /> {/* empty corner above hour labels */}
        {MINUTE_LABELS.map((label) => (
          <div
            key={label}
            className="h-8 flex items-center justify-center text-xs font-semibold text-slate-400"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Grid body: 24 rows, one per hour */}
      <div className="p-1.5 space-y-0.5">
        {HOUR_LABELS.map((hourLabel, hourIndex) => (
          <div
            key={hourLabel}
            className="grid items-center"
            style={{ gridTemplateColumns: "2rem repeat(6, 1fr)", gap: "2px" }}
          >
            {/* Hour label on the left */}
            <div className="text-xs font-medium text-slate-400 text-right pr-1.5 leading-none">
              {hourLabel}
            </div>

            {/* 6 slot cells for this hour */}
            {MINUTE_LABELS.map((_, minIndex) => {
              const slot = ALL_SLOTS[hourIndex * 6 + minIndex];
              const isHighlighted = isCellHighlighted(slot);
              const entry = slotToEntry.get(slot);
              const isFilled = !!entry;

              return (
                <div
                  key={slot}
                  title={getSlotTooltip(slot)}
                  onMouseDown={(e) => handleCellMouseDown(slot, e)}
                  onMouseEnter={() => handleCellMouseEnter(slot)}
                  className={`
                    rounded-sm cursor-pointer transition-all duration-75
                    ${isHighlighted
                      ? "ring-2 ring-blue-500 ring-inset brightness-75"
                      : isFilled
                        ? "hover:brightness-90"
                        : "bg-slate-100 hover:bg-slate-200"
                    }
                  `}
                  style={{
                    height: "26px",
                    ...(isFilled ? getCellStyle(entry, lookupData) : {}),
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
