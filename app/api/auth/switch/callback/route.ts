import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getPublicAppOrigin,
  getSwitchOidcConfig,
  getSwitchRedirectUri,
  oidc,
} from "@/lib/oidc/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import {
  OidcAccountConflictError,
  resolveOrProvisionProfile,
} from "@/lib/oidc/provision";

const PKCE_COOKIE_NAMES = [
  "switch_oidc_code_verifier",
  "switch_oidc_state",
  "switch_oidc_nonce",
] as const;

// Redirects use the public origin, not request.url (internal behind a proxy)
function errorRedirect(code: string) {
  const url = new URL("/", getPublicAppOrigin());
  url.searchParams.set("error", code);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const codeVerifier = cookieStore.get("switch_oidc_code_verifier")?.value;
  const expectedState = cookieStore.get("switch_oidc_state")?.value;
  const expectedNonce = cookieStore.get("switch_oidc_nonce")?.value;

  for (const name of PKCE_COOKIE_NAMES) {
    cookieStore.delete(name);
  }

  if (!codeVerifier || !expectedState || !expectedNonce) {
    return errorRedirect("oidc_missing_session");
  }

  let claims: Record<string, unknown>;
  try {
    const config = await getSwitchOidcConfig();
    // openid-client sends this URL (minus its query) as redirect_uri, so it
    // must be the registered public callback URL plus the IdP's parameters
    const callbackUrl = new URL(getSwitchRedirectUri());
    callbackUrl.search = request.nextUrl.search;
    const tokens = await oidc.authorizationCodeGrant(
      config,
      callbackUrl,
      { pkceCodeVerifier: codeVerifier, expectedState, expectedNonce },
    );
    const idTokenClaims = tokens.claims();
    if (!idTokenClaims) {
      return errorRedirect("oidc_missing_claims");
    }
    claims = idTokenClaims;
  } catch {
    return errorRedirect("oidc_exchange_failed");
  }

  const sub = typeof claims.sub === "string" ? claims.sub : undefined;
  const email = typeof claims.email === "string" ? claims.email : undefined;
  const firstName =
    typeof claims.given_name === "string" ? claims.given_name : undefined;
  const lastName =
    typeof claims.family_name === "string" ? claims.family_name : undefined;
  // Only an explicit false counts as unverified (claim may be absent)
  const emailVerified = claims.email_verified !== false;

  if (!sub || !email) {
    return errorRedirect("oidc_incomplete_identity");
  }

  const admin = createSupabaseAdminClient();

  try {
    await resolveOrProvisionProfile(admin, {
      sub,
      email,
      firstName,
      lastName,
      emailVerified,
    });
  } catch (error) {
    if (error instanceof OidcAccountConflictError) {
      return errorRedirect("oidc_account_conflict");
    }
    return errorRedirect("oidc_provisioning_failed");
  }

  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

  const hashedToken = linkData?.properties?.hashed_token;
  if (linkError || !hashedToken) {
    return errorRedirect("oidc_session_failed");
  }

  const supabase = await createSupabaseServerClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: hashedToken,
  });

  if (verifyError) {
    return errorRedirect("oidc_session_failed");
  }

  return NextResponse.redirect(new URL("/erfasste-zeit", getPublicAppOrigin()));
}
