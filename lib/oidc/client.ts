import * as client from "openid-client";

// Pure OIDC relying-party config for SWITCH edu-ID. Deliberately has no
// Supabase imports — only app/api/auth/switch/callback/route.ts bridges the
// verified OIDC identity into a Supabase session, so this stays portable if
// the app later migrates off Supabase.

let configPromise: Promise<client.Configuration> | null = null;

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

// Cached across requests within a server process — discovery is a network
// call we don't want to repeat on every login attempt.
export async function getSwitchOidcConfig(): Promise<client.Configuration> {
  if (!configPromise) {
    const issuerUrl = getEnv("SWITCH_OIDC_ISSUER_URL");
    const clientId = getEnv("SWITCH_OIDC_CLIENT_ID");
    const clientSecret = getEnv("SWITCH_OIDC_CLIENT_SECRET");

    configPromise = client.discovery(
      new URL(issuerUrl),
      clientId,
      clientSecret,
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
