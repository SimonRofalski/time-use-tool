import type { PendingEntry } from "./types";

// The ICT focus question (focused vs. background use) is only asked when the
// course has it switched on, a device was used AND the entry has a secondary
// activity (tutor feedback 2026-11). Device use during a sole main activity
// counts as focused by definition, so it isn't asked and is saved as NULL
// ("not asked"). It has no step of its own: it is shown on the device-type
// screen, right below the device selection.
export function shouldAskIctAttention(
  askIctAttention: boolean,
  entry: Pick<PendingEntry, "digital_media_used" | "secondary_activity_id">,
): boolean {
  return (
    askIctAttention &&
    entry.digital_media_used &&
    entry.secondary_activity_id !== null
  );
}
