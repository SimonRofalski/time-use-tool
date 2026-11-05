import * as client from "openid-client";

// Pure OIDC relying-party config for SWITCH edu-ID. Deliberately has no
// Supabase imports — only app/api/auth/switch/callback/route.ts bridges the
// verified OIDC identity into a Supabase session, so this stays portable if
// the app later migrates off Supabase.

let configPromise: Promise<client.Configuration> | null = null;
let configFetchedAt = 0;

// SWITCH asks relying parties to re-fetch the discovery document regularly
// instead of relying on a static snapshot (e.g. for signing-key rotation).
// The server can run for weeks in Docker, so refresh once a day.
const DISCOVERY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export function getSwitchRedirectUri(): string {
  return getEnv("SWITCH_OIDC_REDIRECT_URI");
}

// Public origin of the app (e.g. https://timeuse.bfh.ch), derived from the
// registered redirect URI. Used instead of request.url, which behind a
// reverse proxy / in Docker is the internal address (e.g. http://0.0.0.0:3000).
export function getPublicAppOrigin(): string {
  return new URL(getSwitchRedirectUri()).origin;
}

// Cached across requests within a server process — discovery is a network
// call we don't want to repeat on every login attempt — but refreshed after
// DISCOVERY_MAX_AGE_MS.
export async function getSwitchOidcConfig(): Promise<client.Configuration> {
  const isStale = Date.now() - configFetchedAt > DISCOVERY_MAX_AGE_MS;
  if (!configPromise || isStale) {
    configFetchedAt = Date.now();
    const issuerUrl = getEnv("SWITCH_OIDC_ISSUER_URL");
    const clientId = getEnv("SWITCH_OIDC_CLIENT_ID");
    const clientSecret = getEnv("SWITCH_OIDC_CLIENT_SECRET");

    // openid-client only allows HTTPS. Plain HTTP is allowed solely for the
    // local mock provider (npm run mock-oidc) — never for SWITCH itself.
    const issuer = new URL(issuerUrl);
    const isLocalMock =
      issuer.protocol === "http:" &&
      (issuer.hostname === "localhost" || issuer.hostname === "127.0.0.1");

    configPromise = client.discovery(
      issuer,
      clientId,
      clientSecret,
      undefined,
      isLocalMock ? { execute: [client.allowInsecureRequests] } : undefined,
    ).catch((error) => {
      // Don't cache a failed discovery attempt (e.g. mock provider not
      // started yet) — the next request should retry.
      configPromise = null;
      throw error;
    });
  }
  return configPromise;
}

export { client as oidc };
