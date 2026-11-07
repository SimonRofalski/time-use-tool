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
    // SWITCH (like the mock) releases email/name by default only via the
    // UserInfo endpoint — the ID token carries little more than `sub`.
    // fetchUserInfo also checks that UserInfo's sub matches the ID token's.
    const userInfo = await oidc.fetchUserInfo(
      config,
      tokens.access_token,
      idTokenClaims.sub,
    );
    claims = { ...idTokenClaims, ...userInfo };
  } catch (error) {
    console.error("SWITCH OIDC code exchange failed", error);
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

  let userId: string;
  try {
    ({ userId } = await resolveOrProvisionProfile(admin, {
      sub,
      email,
      firstName,
      lastName,
      emailVerified,
    }));
  } catch (error) {
    if (error instanceof OidcAccountConflictError) {
      return errorRedirect("oidc_account_conflict");
    }
    console.error("SWITCH edu-ID provisioning failed", error);
    return errorRedirect("oidc_provisioning_failed");
  }

  // Mint the session for the account that was resolved above, not for the
  // email in the current claims: a returning user matched by `sub` may have
  // changed their edu-ID email since, and generating a link for the new
  // address would log them into an empty (or someone else's) account.
  const { data: userData, error: userError } =
    await admin.auth.admin.getUserById(userId);
  const accountEmail = userData?.user?.email;
  if (userError || !accountEmail) {
    console.error("SWITCH edu-ID: resolved account has no email", userError);
    return errorRedirect("oidc_session_failed");
  }

  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email: accountEmail,
    });

  const hashedToken = linkData?.properties?.hashed_token;
  if (linkError || !hashedToken) {
    console.error("SWITCH edu-ID: generateLink failed", linkError);
    return errorRedirect("oidc_session_failed");
  }

  const supabase = await createSupabaseServerClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: hashedToken,
  });

  if (verifyError) {
    console.error("SWITCH edu-ID: verifyOtp failed", verifyError);
    return errorRedirect("oidc_session_failed");
  }

  return NextResponse.redirect(new URL("/erfasste-zeit", getPublicAppOrigin()));
}
