import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getPublicAppOrigin,
  getSwitchOidcConfig,
  getSwitchRedirectUri,
  getSwitchScope,
  isPublicOriginHttps,
  oidc,
} from "@/lib/oidc/client";

// Short-lived PKCE/state/nonce cookies, cleared by the callback route once
// consumed. 5 minutes is generous for a redirect round-trip to the IdP.
const PKCE_COOKIE_MAX_AGE = 60 * 5;

export async function GET() {
  let config;
  try {
    config = await getSwitchOidcConfig();
  } catch (error) {
    // Missing SWITCH_OIDC_* env, IdP unreachable or no outbound network —
    // send the user back to the login page with a message instead of a raw 500
    console.error("SWITCH OIDC discovery failed", error);
    try {
      const url = new URL("/", getPublicAppOrigin());
      url.searchParams.set("error", "oidc_unavailable");
      return NextResponse.redirect(url);
    } catch {
      // SWITCH_OIDC_REDIRECT_URI itself is missing/invalid
      return NextResponse.json({ error: "oidc_unavailable" }, { status: 503 });
    }
  }

  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();

  const authorizationUrl = oidc.buildAuthorizationUrl(config, {
    redirect_uri: getSwitchRedirectUri(),
    scope: getSwitchScope(),
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    nonce,
  });

  const cookieStore = await cookies();
  const cookieOptions = {
    httpOnly: true,
    secure: isPublicOriginHttps(),
    sameSite: "lax" as const,
    maxAge: PKCE_COOKIE_MAX_AGE,
    path: "/",
  };
  cookieStore.set("switch_oidc_code_verifier", codeVerifier, cookieOptions);
  cookieStore.set("switch_oidc_state", state, cookieOptions);
  cookieStore.set("switch_oidc_nonce", nonce, cookieOptions);

  return NextResponse.redirect(authorizationUrl.href);
}
