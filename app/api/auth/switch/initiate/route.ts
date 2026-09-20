import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSwitchOidcConfig, getSwitchRedirectUri, oidc } from "@/lib/oidc/client";

// Short-lived PKCE/state/nonce cookies, cleared by the callback route once
// consumed. 5 minutes is generous for a redirect round-trip to the IdP.
const PKCE_COOKIE_MAX_AGE = 60 * 5;

export async function GET() {
  const config = await getSwitchOidcConfig();

  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();

  const authorizationUrl = oidc.buildAuthorizationUrl(config, {
    redirect_uri: getSwitchRedirectUri(),
    scope: "openid email profile",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    nonce,
  });

  const cookieStore = await cookies();
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: PKCE_COOKIE_MAX_AGE,
    path: "/",
  };
  cookieStore.set("switch_oidc_code_verifier", codeVerifier, cookieOptions);
  cookieStore.set("switch_oidc_state", state, cookieOptions);
  cookieStore.set("switch_oidc_nonce", nonce, cookieOptions);

  return NextResponse.redirect(authorizationUrl.href);
}
