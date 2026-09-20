// Local mock SWITCH edu-ID provider for development, since the real SP
// registration with SWITCH (client id/secret) hasn't happened yet. Run with
// `npm run mock-oidc` alongside `npm run dev`, then use the "Mit SWITCH
// edu-ID anmelden" button on the login page.
//
// oidc-provider's dev interaction screen just asks for a "Subject
// identifier" — type one of the accounts below to log in as that scenario.
// See supabase/migrations/20260920000000_add_edu_id_login.sql and
// lib/oidc/provision.ts for what each scenario exercises:
//
//   new-user-1        -> brand-new edu-ID login, provisions a fresh account
//   returning-user-1  -> log in with this sub twice to see the second login
//                        skip provisioning (matched via switch_edu_id_sub)
//   collision-user-1  -> first create a password account with this exact
//                        email via the admin "Account anlegen" UI, then log
//                        in here to see it get linked instead of duplicated
//
// TEST_ACCOUNTS' emails can be edited freely for local testing.

import { Provider } from "oidc-provider";

const PORT = 9999;
const ISSUER = `http://localhost:${PORT}`;

const TEST_ACCOUNTS = {
  "new-user-1": {
    email: "new.user@example.org",
    email_verified: true,
    given_name: "Neu",
    family_name: "User",
  },
  "returning-user-1": {
    email: "returning.user@example.org",
    email_verified: true,
    given_name: "Rueck",
    family_name: "Kehrer",
  },
  "collision-user-1": {
    email: "collision@test.ch",
    email_verified: true,
    given_name: "Kollision",
    family_name: "Test",
  },
};

const configuration = {
  clients: [
    {
      client_id: "time-use-tool-dev",
      client_secret: "dev-secret",
      redirect_uris: ["http://localhost:3000/api/auth/switch/callback"],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_basic",
    },
  ],
  pkce: { required: () => true },
  features: {
    devInteractions: { enabled: true },
  },
  claims: {
    openid: ["sub"],
    email: ["email", "email_verified"],
    profile: ["given_name", "family_name"],
  },
  findAccount(_ctx, sub) {
    const account = TEST_ACCOUNTS[sub];
    if (!account) {
      return undefined;
    }
    return {
      accountId: sub,
      claims: () => ({ sub, ...account }),
    };
  },
};

const oidc = new Provider(ISSUER, configuration);

oidc.listen(PORT, () => {
  console.log(`Mock SWITCH edu-ID OIDC provider running at ${ISSUER}`);
  console.log("Test subjects: " + Object.keys(TEST_ACCOUNTS).join(", "));
});
