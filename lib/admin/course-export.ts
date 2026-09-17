import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

// ─── Server-side, de-identified course export ─────────────────────────────────
// Ergebnis der Ethikprüfung: Admins dürfen die Zuordnung von Zeitnutzungsdaten
// zu Personen nicht einsehen. Deshalb enthält kein Export Namen, E-Mails,
// User-IDs, Aliase oder Datumsangaben, und die Zeilen werden zufällig gemischt.
//
// Warum auch "Tage erfasst" und Datum fehlen: Der Admin sieht pro Person, welche
// Tage abgeschlossen sind. Eine Zeile mit "5 Tage" oder "Sa. 28.3." liesse sich
// damit wieder einer Person zuordnen. Aggregierte Werte werden deshalb pro
// abgegebenem Tag normalisiert (Ø h/Tag) statt als Summen ausgegeben.
//
// Mindestgrösse: Unter MIN_PARTICIPANTS_FOR_EXPORT Teilnehmenden mit Daten wäre
// jede Zeile trivial zuzuordnen — dann wird gar nicht exportiert.

export const MIN_PARTICIPANTS_FOR_EXPORT = 3;

export type ExportMode = "aggregiert" | "roh";
export type ExportRow = Record<string, string | number>;

export type CourseExportResult =
  | {
      ok: true;
      courseName: string;
      rows: ExportRow[];
      participants: number;
      submittedDays: number;
    }
  | { ok: false; reason: "COURSE_NOT_FOUND" }
  | { ok: false; reason: "TOO_FEW_PARTICIPANTS"; participants: number };

type RawEntry = {
  entry_id: number;
  day_id: number;
  start_time: string;
  end_time: string;
  primary_activity_id: number | null;
  secondary_activity_id: number | null;
  location_transport_id: number | null;
  satisfaction_id: number | null;
  digital_media_used: boolean | null;
  time_entry_digital_media_type?: { digital_media_type_id: number | null }[];
  time_entry_social_context?: { social_context_id: number | null }[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function minutesFromTimes(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh === 0 && em === 0 && startMin > 0 ? 1440 : eh * 60 + em;
  const mins = endMin - startMin;
  return mins > 0 ? mins : 0;
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

// Fisher-Yates with a CSPRNG so row order carries no information
function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function buildCourseExport(
  admin: SupabaseClient,
  courseId: number,
  mode: ExportMode,
): Promise<CourseExportResult> {
  const { data: course } = await admin
    .from("course")
    .select("course_id, name")
    .eq("course_id", courseId)
    .maybeSingle();
  if (!course) return { ok: false, reason: "COURSE_NOT_FOUND" };

  // Enrolled, non-excluded participants
  const { data: enrollments } = await admin
    .from("user_course")
    .select("profiles_id, is_excluded")
    .eq("course_id", courseId);
  const eligibleProfileIds = new Set(
    (enrollments ?? [])
      .filter((e) => !e.is_excluded)
      .map((e) => e.profiles_id as string),
  );

  // Submitted days of eligible participants
  const allDays = await fetchAllRows<{
    day_id: number;
    profiles_id: string;
    is_submitted: boolean;
  }>((from, to) =>
    admin
      .from("day")
      .select("day_id, profiles_id, is_submitted")
      .eq("course_id", courseId)
      .eq("is_submitted", true)
      .order("day_id")
      .range(from, to),
  );

  const submittedDays = allDays.filter((d) =>
    eligibleProfileIds.has(d.profiles_id),
  );
  const dayProfileMap: Record<number, string> = {};
  const submittedDaysByUser: Record<string, number> = {};
  for (const d of submittedDays) {
    dayProfileMap[d.day_id] = d.profiles_id;
    submittedDaysByUser[d.profiles_id] =
      (submittedDaysByUser[d.profiles_id] ?? 0) + 1;
  }

  const participantIds = Object.keys(submittedDaysByUser);
  if (participantIds.length < MIN_PARTICIPANTS_FOR_EXPORT) {
    return {
      ok: false,
      reason: "TOO_FEW_PARTICIPANTS",
      participants: participantIds.length,
    };
  }

  // Lookups
  const [
    categoriesRes,
    activitiesRes,
    locationsRes,
    socialContextsRes,
    digitalMediaTypesRes,
    satisfactionsRes,
  ] = await Promise.all([
    admin.from("category").select("category_id, name").order("category_id"),
    admin
      .from("activity")
      .select("activity_id, name, subcategory:subcategory_id(category_id)"),
    admin.from("location_transport").select("location_transport_id, name"),
    admin.from("social_context").select("social_context_id, name"),
    admin.from("digital_media_type").select("digital_media_type_id, name"),
    admin.from("satisfaction").select("satisfaction_id, name"),
  ]);

  const categoryNameById: Record<number, string> = {};
  const categoryIds: number[] = [];
  for (const c of categoriesRes.data ?? []) {
    categoryNameById[c.category_id] = c.name;
    categoryIds.push(c.category_id);
  }

  const activityToCategoryId: Record<number, number> = {};
  const activityNameById: Record<number, string> = {};
  for (const a of activitiesRes.data ?? []) {
    const sub = a.subcategory as unknown;
    const catId =
      sub && typeof sub === "object" && "category_id" in sub
        ? (sub as { category_id: number }).category_id
        : Array.isArray(sub) && sub.length > 0
          ? (sub[0] as { category_id: number }).category_id
          : null;
    if (catId != null) activityToCategoryId[a.activity_id] = catId;
    activityNameById[a.activity_id] = a.name;
  }

  const locationNameById: Record<number, string> = {};
  for (const l of locationsRes.data ?? [])
    locationNameById[l.location_transport_id] = l.name;
  const socialContextNameById: Record<number, string> = {};
  for (const s of socialContextsRes.data ?? [])
    socialContextNameById[s.social_context_id] = s.name;
  const digitalMediaTypeNameById: Record<number, string> = {};
  for (const m of digitalMediaTypesRes.data ?? [])
    digitalMediaTypeNameById[m.digital_media_type_id] = m.name;
  const satisfactionNameById: Record<number, string> = {};
  for (const s of satisfactionsRes.data ?? [])
    satisfactionNameById[s.satisfaction_id] = s.name;

  // Time entries of the submitted days
  // (chunked day-id lists keep request URLs short; paged to beat the 1000-row cap)
  const dayIds = submittedDays.map((d) => d.day_id);
  const entries: RawEntry[] = [];
  for (const ids of chunk(dayIds, 400)) {
    const batch = await fetchAllRows<RawEntry>((from, to) =>
      admin
        .from("time_entry")
        .select(
          "entry_id, day_id, start_time, end_time, primary_activity_id, secondary_activity_id, location_transport_id, satisfaction_id, digital_media_used, time_entry_digital_media_type(digital_media_type_id), time_entry_social_context(social_context_id)",
        )
        .in("day_id", ids)
        .order("entry_id")
        .range(from, to),
    );
    entries.push(...batch);
  }

  let rows: ExportRow[];

  if (mode === "aggregiert") {
    // Minutes per participant per category
    const minutesByUserCategory: Record<string, Record<number, number>> = {};
    for (const e of entries) {
      const profileId = dayProfileMap[e.day_id];
      if (!profileId || e.primary_activity_id == null) continue;
      const catId = activityToCategoryId[e.primary_activity_id];
      if (catId == null) continue;
      const mins = minutesFromTimes(e.start_time, e.end_time);
      if (mins <= 0) continue;
      if (!minutesByUserCategory[profileId])
        minutesByUserCategory[profileId] = {};
      minutesByUserCategory[profileId][catId] =
        (minutesByUserCategory[profileId][catId] ?? 0) + mins;
    }

    // One anonymous row per participant: Ø hours per submitted day
    const perParticipant = participantIds.map((profileId) => {
      const days = submittedDaysByUser[profileId] ?? 0;
      const row: ExportRow = { Zeile: "Teilnehmer:in (anonym)" };
      let total = 0;
      for (const catId of categoryIds) {
        const mins = minutesByUserCategory[profileId]?.[catId] ?? 0;
        const hoursPerDay = days > 0 ? mins / 60 / days : 0;
        total += hoursPerDay;
        row[`${categoryNameById[catId]} (h/Tag)`] = round(hoursPerDay, 2);
      }
      row["Erfasst gesamt (h/Tag)"] = round(total, 2);
      return row;
    });

    // Course mean across participants (mean of per-participant Ø values)
    const meanRow: ExportRow = { Zeile: "Kursdurchschnitt" };
    for (const key of Object.keys(perParticipant[0]).filter(
      (k) => k !== "Zeile",
    )) {
      const sum = perParticipant.reduce((s, r) => s + Number(r[key] ?? 0), 0);
      meanRow[key] = round(sum / perParticipant.length, 2);
    }

    rows = [...shuffle(perParticipant), meanRow];
  } else {
    // One row per time entry — no person, day or date reference, shuffled
    rows = shuffle(
      entries.map((e) => {
        const minutes = minutesFromTimes(e.start_time, e.end_time);
        const categoryId =
          e.primary_activity_id != null
            ? activityToCategoryId[e.primary_activity_id]
            : undefined;
        return {
          Start: e.start_time.slice(0, 5),
          Ende: e.end_time.slice(0, 5),
          "Dauer (min)": minutes,
          "Dauer (h)": round(minutes / 60, 2),
          Kategorie:
            categoryId != null ? (categoryNameById[categoryId] ?? "") : "",
          Aktivitaet:
            e.primary_activity_id != null
              ? (activityNameById[e.primary_activity_id] ?? "")
              : "",
          Nebenaktivitaet:
            e.secondary_activity_id != null
              ? (activityNameById[e.secondary_activity_id] ?? "")
              : "",
          "Digitale Medien genutzt": e.digital_media_used ? "Ja" : "Nein",
          Medienarten: (e.time_entry_digital_media_type ?? [])
            .map((m) => m.digital_media_type_id)
            .filter((id): id is number => typeof id === "number")
            .map((id) => digitalMediaTypeNameById[id] ?? `#${id}`)
            .join(", "),
          "Ort / Transport":
            e.location_transport_id != null
              ? (locationNameById[e.location_transport_id] ?? "")
              : "",
          "Sozialer Kontext": (e.time_entry_social_context ?? [])
            .map((s) => s.social_context_id)
            .filter((id): id is number => typeof id === "number")
            .map((id) => socialContextNameById[id] ?? `#${id}`)
            .join(", "),
          Zufriedenheit:
            e.satisfaction_id != null
              ? (satisfactionNameById[e.satisfaction_id] ?? "")
              : "",
        };
      }),
    );
  }

  return {
    ok: true,
    courseName: course.name,
    rows,
    participants: participantIds.length,
    submittedDays: submittedDays.length,
  };
}
