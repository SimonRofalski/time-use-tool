import type { SupabaseClient } from "@supabase/supabase-js";

export class OidcAccountConflictError extends Error {
  constructor() {
    super("SWITCH edu-ID account conflict");
    this.name = "OidcAccountConflictError";
  }
}

export type SwitchEduIdIdentity = {
  sub: string;
  email: string;
  firstName?: string;
  lastName?: string;
};

export type ProvisionResult = {
  userId: string;
  created: boolean;
  linked: boolean;
};

// Find-or-create the profile for a verified SWITCH edu-ID identity.
//
// Linking policy (deliberate v1 simplification, see project plan):
// - Returning edu-ID user (matched by the stable `sub` claim) -> reuse as-is.
// - First-ever edu-ID login whose email matches an existing password-based
//   profile -> link automatically (same auth.users.id, full history kept).
//   No extra confirmation step is required from the user for this v1.
// - Otherwise -> provision a brand-new account.
export async function resolveOrProvisionProfile(
  admin: SupabaseClient,
  identity: SwitchEduIdIdentity,
): Promise<ProvisionResult> {
  const { sub, email, firstName, lastName } = identity;

  const { data: bySub } = await admin
    .from("profiles")
    .select("id, auth_provider")
    .eq("switch_edu_id_sub", sub)
    .maybeSingle();

  if (bySub) {
    return { userId: bySub.id, created: false, linked: false };
  }

  const { data: byEmail } = await admin
    .from("profiles")
    .select("id, auth_provider, switch_edu_id_sub")
    .ilike("email", email)
    .maybeSingle();

  if (byEmail) {
    if (byEmail.switch_edu_id_sub && byEmail.switch_edu_id_sub !== sub) {
      // Same email, already linked to a *different* edu-ID identity —
      // shouldn't happen given switch_edu_id_sub is UNIQUE and looked up
      // first, but fail closed rather than silently reassigning accounts.
      throw new OidcAccountConflictError();
    }

    const { error: linkError } = await admin
      .from("profiles")
      .update({ auth_provider: "switch_edu_id", switch_edu_id_sub: sub })
      .eq("id", byEmail.id);

    if (linkError) {
      throw linkError;
    }

    return { userId: byEmail.id, created: false, linked: true };
  }

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { provisioned_via: "switch_edu_id" },
    });

  if (createError || !created?.user) {
    throw createError ?? new Error("Failed to provision SWITCH edu-ID user");
  }

  const { error: updateError } = await admin
    .from("profiles")
    .update({
      auth_provider: "switch_edu_id",
      switch_edu_id_sub: sub,
      ...(firstName ? { first_name: firstName } : {}),
      ...(lastName ? { last_name: lastName } : {}),
    })
    .eq("id", created.user.id);

  if (updateError) {
    throw updateError;
  }

  return { userId: created.user.id, created: true, linked: false };
}
