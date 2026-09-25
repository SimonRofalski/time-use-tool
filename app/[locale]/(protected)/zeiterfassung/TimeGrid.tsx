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
        `${hour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`,
      );
    }
  }
  return slots;
}

// Returns all "HH:MM" slots that fall within an entry's time range
// start is inclusive, end is exclusive (e.g. "09:00" is not in a "08:00"–"09:00" entry)
// Handles the midnight wrap: end_time "00:00" after a non-zero start means 1440 min
function getSlotsForEntry(startTime: string, endTime: string): string[] {
  const slots: string[] = [];
  const [startHour, startMin] = startTime.split(":").map(Number);
  const [endHour, endMin] = endTime.split(":").map(Number);
  const startTotal = startHour * 60 + startMin;
  const endTotal =
    endHour === 0 && endMin === 0 && startTotal > 0
      ? 1440
      : endHour * 60 + endMin;

  for (let min = startTotal; min < endTotal; min += 10) {
    slots.push(
      `${Math.floor(min / 60)
        .toString()
        .padStart(2, "0")}:${(min % 60).toString().padStart(2, "0")}`,
    );
  }
  return slots;
}

// Builds a map from slot string → TimeEntryRecord for O(1) lookup per cell
function buildSlotToEntryMap(
  entries: TimeEntryRecord[],
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
  subcategories: LookupData["subcategories"],
): number | null {
  const activity = activities.find((a) => a.activity_id === activityId);
  if (!activity) return null;
  const subcategory = subcategories.find(
    (s) => s.subcategory_id === activity.subcategory_id,
  );
  return subcategory?.category_id ?? null;
}

// Returns the category color for an activity (slate-400 if it can't be resolved)
function getActivityColor(activityId: number, lookupData: LookupData): string {
  const categoryId = getCategoryIdForActivity(
    activityId,
    lookupData.activities,
    lookupData.subcategories,
  );
  return categoryId
    ? getCategoryColor(categoryId, lookupData.categories)
    : "#94A3B8";
}

// Returns the CSS background style for a filled cell
// Single activity: solid color | Primary + secondary: diagonal split
function getCellStyle(
  entry: TimeEntryRecord,
  lookupData: LookupData,
): React.CSSProperties {
  const primaryColor = getActivityColor(entry.primary_activity_id, lookupData);

  if (!entry.secondary_activity_id) {
    return { backgroundColor: primaryColor };
  }

  // Two-tone, split along the top-left → bottom-right diagonal:
  // lower-left triangle = primary, upper-right triangle = secondary.
  // With a corner direction, the 50% line runs through the other two corners;
  // the 1px blend around it avoids a jagged edge.
  const secondaryColor = getActivityColor(
    entry.secondary_activity_id,
    lookupData,
  );

  return {
    background: `linear-gradient(to top right, ${primaryColor} calc(50% - 0.5px), ${secondaryColor} calc(50% + 0.5px))`,
  };
}

// Builds the native tooltip text shown on hover: "08:30 – 08:40"
function getSlotTooltip(slot: string): string {
  const [hour, min] = slot.split(":").map(Number);
  const endTotal = hour * 60 + min + 10;
  const endStr = `${Math.floor(endTotal / 60)
    .toString()
    .padStart(2, "0")}:${(endTotal % 60).toString().padStart(2, "0")}`;
  return `${slot} – ${endStr}`;
}

// Returns all slots between anchorSlot and currentSlot (inclusive, chronological order).
// This gives a range-select feel: dragging from 08:20 down to 09:20 selects all
// 7 slots in between regardless of the mouse path taken.
function getSlotsInRange(anchorSlot: string, currentSlot: string): Set<string> {
  const anchorIndex = ALL_SLOTS.indexOf(anchorSlot);
  const currentIndex = ALL_SLOTS.indexOf(currentSlot);
  const start = Math.min(anchorIndex, currentIndex);
  const end = Math.max(anchorIndex, currentIndex);
  return new Set(ALL_SLOTS.slice(start, end + 1));
}

// ─── Component ────────────────────────────────────────────────────────────────

// Labels shown in the sticky header row (left-edge markers, 7 items for 6 columns + end)
const MINUTE_LABELS = [":00", ":10", ":20", ":30", ":40", ":50", ":60"];
// Indices for the 6 data cells per row (separate from header labels)
const MINUTE_INDICES = [0, 1, 2, 3, 4, 5];
// Labels shown on the left side (one per row = one per hour)
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) =>
  i.toString().padStart(2, "0"),
);
// Pre-generated slot list (stable, never changes)
const ALL_SLOTS = generateAllSlots();

// The entry currently being filled in, previewed on the selected slots with
// the same diagonal split as saved entries
export type PendingSlotPreview = {
  primaryActivityId: number;
  secondaryActivityId: number | null;
  // true while the secondary question is still open: the upper-right triangle
  // stays empty so it's visible that a second activity can go there
  awaitingSecondary: boolean;
};

// Triangles on either side of the top-left -> bottom-right diagonal
const UPPER_RIGHT_TRIANGLE = "polygon(0 0, 100% 0, 100% 100%)";
const LOWER_LEFT_TRIANGLE = "polygon(0 0, 0 100%, 100% 100%)";
// Per-slot delay so a multi-slot selection fills in as a quick wave
const PREVIEW_STAGGER_MS = 20;
const PREVIEW_MAX_DELAY_MS = 240;

type TimeGridProps = {
  existingEntries: TimeEntryRecord[];
  selectedSlots: Set<string>; // committed selection managed by parent
  lookupData: LookupData;
  onSlotsSelected: (slots: Set<string>) => void;
  pendingPreview?: PendingSlotPreview | null;
};

export default function TimeGrid({
  existingEntries,
  selectedSlots,
  lookupData,
  onSlotsSelected,
  pendingPreview = null,
}: TimeGridProps) {
  // Ref tracks whether a drag is active — avoids state re-renders during drag
  const isDraggingRef = useRef(false);
  // Ref holds the slot where the drag started (the anchor for range calculation)
  const anchorSlotRef = useRef<string | null>(null);
  // State drives visual update during drag (separate from ref for rendering)
  const [liveDraggingSlots, setLiveDraggingSlots] = useState(new Set<string>());
  // Mirror ref so non-React touch listeners always read the latest value
  const liveDraggingSlotsRef = useRef(new Set<string>());
  // Ref to the scrollable container for attaching non-passive touch listeners
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Pre-built slot → entry map so each cell render is O(1)
  const slotToEntry = useMemo(
    () => buildSlotToEntryMap(existingEntries),
    [existingEntries],
  );

  // Position of each selected slot in chronological order (drives the stagger)
  const selectedSlotOrder = useMemo(
    () => new Map([...selectedSlots].sort().map((slot, i) => [slot, i])),
    [selectedSlots],
  );

  const previewPrimaryColor = pendingPreview
    ? getActivityColor(pendingPreview.primaryActivityId, lookupData)
    : null;
  const previewSecondaryColor =
    pendingPreview?.secondaryActivityId != null
      ? getActivityColor(pendingPreview.secondaryActivityId, lookupData)
      : null;
  // "No secondary activity" answered: the cell fills up completely
  const previewIsSolid =
    !!pendingPreview &&
    pendingPreview.secondaryActivityId === null &&
    !pendingPreview.awaitingSecondary;

  // Keeps both state and ref in sync
  function setDragging(slots: Set<string>) {
    liveDraggingSlotsRef.current = slots;
    setLiveDraggingSlots(new Set(slots));
  }

  // Global mouseup: finalizes the drag and commits the current live range to the parent
  // Attached to document so mouseup outside the grid still ends the drag
  useEffect(() => {
    function handleGlobalMouseUp() {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      onSlotsSelected(new Set(liveDraggingSlotsRef.current));
      anchorSlotRef.current = null;
      liveDraggingSlotsRef.current = new Set();
      setLiveDraggingSlots(new Set());
    }
    document.addEventListener("mouseup", handleGlobalMouseUp);
    return () => document.removeEventListener("mouseup", handleGlobalMouseUp);
  }, [onSlotsSelected]);

  // Touch handlers attached with { passive: false } so preventDefault() blocks
  // the page from scrolling while the user is dragging across cells
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function slotFromPoint(x: number, y: number): string | null {
      const el = document.elementFromPoint(x, y);
      return (
        (el?.closest("[data-slot]") as HTMLElement | null)?.dataset.slot ?? null
      );
    }

    function handleTouchStart(e: TouchEvent) {
      const slot = slotFromPoint(e.touches[0].clientX, e.touches[0].clientY);
      if (!slot) return;
      e.preventDefault();
      isDraggingRef.current = true;
      anchorSlotRef.current = slot;
      setDragging(new Set([slot]));
    }

    function handleTouchMove(e: TouchEvent) {
      if (!isDraggingRef.current || !anchorSlotRef.current) return;
      e.preventDefault();
      const slot = slotFromPoint(e.touches[0].clientX, e.touches[0].clientY);
      if (slot) setDragging(getSlotsInRange(anchorSlotRef.current, slot));
    }

    function handleTouchEnd() {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      onSlotsSelected(new Set(liveDraggingSlotsRef.current));
      anchorSlotRef.current = null;
      liveDraggingSlotsRef.current = new Set();
      setLiveDraggingSlots(new Set());
    }

    container.addEventListener("touchstart", handleTouchStart, {
      passive: false,
    });
    container.addEventListener("touchmove", handleTouchMove, {
      passive: false,
    });
    container.addEventListener("touchend", handleTouchEnd);
    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, [onSlotsSelected]);

  // Start drag: record the anchor slot and initialise a single-slot selection
  function handleCellMouseDown(slot: string, event: React.MouseEvent) {
    event.preventDefault(); // prevent browser text-selection during drag
    isDraggingRef.current = true;
    anchorSlotRef.current = slot;
    setDragging(new Set([slot]));
  }

  // Extend drag: recalculate the full range from anchor to the current slot
  // This means moving down from 08:20 to 09:20 selects all slots in between,
  // not just the ones the mouse physically passed over
  function handleCellMouseEnter(slot: string) {
    if (!isDraggingRef.current || !anchorSlotRef.current) return;
    setDragging(getSlotsInRange(anchorSlotRef.current, slot));
  }

  // A cell is highlighted if it is being dragged over OR in the committed selection
  function isCellHighlighted(slot: string): boolean {
    return liveDraggingSlots.has(slot) || selectedSlots.has(slot);
  }

  return (
    <div
      ref={containerRef}
      className="overflow-hidden overflow-x-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm select-none md:overflow-y-auto md:scrollbar-thin md:max-h-[calc(100vh-150px)]"
    >
      {/* Sticky header row: minute-offset labels at left edge of each column */}
      <div className="grid grid-cols-[1.5rem_repeat(6,minmax(0,1fr))_auto] border-b-2 border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 md:sticky md:top-0 md:z-10 md:grid-cols-[2rem_repeat(6,minmax(0,1fr))_auto]">
        <div className="h-6 md:h-8" /> {/* empty corner above hour labels */}
        {MINUTE_LABELS.map((label) => (
          <div
            key={label}
            className="flex h-6 items-center justify-start text-[10px] font-semibold text-slate-400 md:h-8 md:text-xs"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Grid body: 24 rows, one per hour */}
      <div className="space-y-px p-1 md:space-y-0.5 md:p-1.5">
        {HOUR_LABELS.map((hourLabel, hourIndex) => (
          <div
            key={hourLabel}
            className="grid grid-cols-[1.5rem_repeat(6,minmax(0,1fr))] items-center gap-px md:grid-cols-[2rem_repeat(6,minmax(0,1fr))] md:gap-[2px]"
          >
            {/* Hour label on the left */}
            <div className="pr-1 text-right text-[10px] font-medium leading-none text-slate-400 md:pr-1.5 md:text-xs">
              {hourLabel}
            </div>

            {/* 6 slot cells for this hour */}
            {MINUTE_INDICES.map((minIndex) => {
              const slot = ALL_SLOTS[hourIndex * 6 + minIndex];
              const isHighlighted = isCellHighlighted(slot);
              const entry = slotToEntry.get(slot);
              const isFilled = !!entry;
              const isPreview =
                previewPrimaryColor !== null &&
                selectedSlots.has(slot) &&
                !liveDraggingSlots.has(slot);
              const previewDelay = `${Math.min(
                (selectedSlotOrder.get(slot) ?? 0) * PREVIEW_STAGGER_MS,
                PREVIEW_MAX_DELAY_MS,
              )}ms`;

              return (
                <div
                  key={slot}
                  data-slot={slot}
                  title={getSlotTooltip(slot)}
                  onMouseDown={(e) => handleCellMouseDown(slot, e)}
                  onMouseEnter={() => handleCellMouseEnter(slot)}
                  className={`
                    relative overflow-hidden rounded-sm transition-all duration-75
                    cursor-pointer
                    ${
                      isPreview
                        ? "bg-slate-100 dark:bg-slate-700"
                        : isHighlighted
                          ? "ring-1 ring-blue-500 ring-inset brightness-75 md:ring-2"
                          : isFilled
                            ? "hover:brightness-90"
                            : "bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600"
                    }
                  `}
                  style={{
                    height: "24px",
                    ...(isFilled && !isPreview
                      ? getCellStyle(entry, lookupData)
                      : {}),
                  }}
                >
                  {isPreview && (
                    <>
                      {/* Solid fill sits *under* the primary triangle and is
                          unclipped, so the diagonal edge blends same colour
                          into same colour and no seam is visible */}
                      {previewIsSolid && (
                        <span
                          className="slot-tri-in-tr pointer-events-none absolute inset-0"
                          style={{
                            background: previewPrimaryColor,
                            animationDelay: previewDelay,
                          }}
                        />
                      )}
                      {/* Keyed by activity so changing it replays the fly-in */}
                      <span
                        key={`p-${pendingPreview?.primaryActivityId}`}
                        className="slot-tri-in-bl pointer-events-none absolute inset-0"
                        style={{
                          background: previewPrimaryColor,
                          clipPath: LOWER_LEFT_TRIANGLE,
                          animationDelay: previewDelay,
                        }}
                      />
                      {previewSecondaryColor && (
                        <span
                          key={`s-${pendingPreview?.secondaryActivityId}`}
                          className="slot-tri-in-tr pointer-events-none absolute inset-0"
                          style={{
                            background: previewSecondaryColor,
                            clipPath: UPPER_RIGHT_TRIANGLE,
                            animationDelay: previewDelay,
                          }}
                        />
                      )}
                      {/* Selection ring drawn above the triangles (an inset
                          ring on the cell itself would be covered by them) */}
                      <span className="pointer-events-none absolute inset-0 rounded-sm ring-1 ring-inset ring-blue-500 md:ring-2" />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
