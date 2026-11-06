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
  // From the ID token's email_verified claim; linking an existing account by
  // email is only allowed for a verified address (prevents account takeover)
  emailVerified: boolean;
};

// ILIKE treats % and _ as wildcards — escape them so "a_b@x.ch" can't
// match (and link to) a different account like "axb@x.ch"
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

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
  const { sub, email, firstName, lastName, emailVerified } = identity;

  // Query errors must abort: treating a transient failure as "no match" would
  // fall through to createUser and fail (or duplicate) for an existing account.
  const { data: bySub, error: bySubError } = await admin
    .from("profiles")
    .select("id, auth_provider")
    .eq("switch_edu_id_sub", sub)
    .maybeSingle();

  if (bySubError) {
    throw bySubError;
  }

  if (bySub) {
    return { userId: bySub.id, created: false, linked: false };
  }

  const { data: emailMatches, error: byEmailError } = await admin
    .from("profiles")
    .select("id, auth_provider, switch_edu_id_sub")
    .ilike("email", escapeLikePattern(email))
    .limit(2);

  if (byEmailError) {
    throw byEmailError;
  }

  // Several profiles with the same address (case variants) — linking any one
  // of them would be a guess, so fail closed and let an admin sort it out
  if (emailMatches.length > 1) {
    throw new OidcAccountConflictError();
  }

  const byEmail = emailMatches[0];

  if (byEmail) {
    if (!emailVerified) {
      throw new OidcAccountConflictError();
    }
    if (byEmail.switch_edu_id_sub && byEmail.switch_edu_id_sub !== sub) {
      // Same email, already linked to a *different* edu-ID identity —
      // shouldn't happen given switch_edu_id_sub is UNIQUE and looked up
      // first, but fail closed rather than silently reassigning accounts.
      throw new OidcAccountConflictError();
    }

    // An admin-created account still carries must_change_password from its
    // temporary password; once it signs in via edu-ID there is no password
    // to change, so the forced password gate would only get in the way
    const { error: linkError } = await admin
      .from("profiles")
      .update({
        auth_provider: "switch_edu_id",
        switch_edu_id_sub: sub,
        must_change_password: false,
      })
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
