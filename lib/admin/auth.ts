import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";

// ─── Admin guard for route handlers ──────────────────────────────────────────
// Verifies the calling session belongs to an admin (profiles.role = 'admin')
// and hands back a service-role client for server-side aggregation.
//
// Datenschutz: Admins dürfen laut Ethikprüfung keine personenbezogenen
// Zeitnutzungsdaten einsehen. Deshalb werden Statistiken und Exporte NUR
// serverseitig berechnet und ausschliesslich aggregiert / de-identifiziert
// an den Browser zurückgegeben. Die Rohdaten verlassen den Server nie mit
// einem Personenbezug.

type AdminContext = {
  userId: string;
  admin: SupabaseClient;
};

export async function requireAdmin(): Promise<
  { ok: true; ctx: AdminContext } | { ok: false; response: NextResponse }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 }),
    };
  }

  // Role is read with the caller's own (RLS-restricted) client — users can
  // always read their own profile row, so this cannot be spoofed via JWT metadata.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Keine Berechtigung." },
        { status: 403 },
      ),
    };
  }

  return { ok: true, ctx: { userId: user.id, admin: createSupabaseAdminClient() } };
}
