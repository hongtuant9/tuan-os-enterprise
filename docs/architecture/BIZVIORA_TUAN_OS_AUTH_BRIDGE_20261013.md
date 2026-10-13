# BIZVIORA → TUAN OS customer interface: staging bridge assessment

Status: DESIGN_ONLY / NO_DEPLOY / AUTH_GATE_HOLD (2026-10-13)

## Verified source boundaries
- TUAN OS customer UI: Next.js `src/app/page.tsx`, `src/app/login/page.tsx`, dashboards and business pages. Preserve all original UI components.
- TUAN OS login: `src/app/login/page.tsx` uses `supabase.auth.signInWithPassword`; `src/proxy.ts` validates Supabase Auth via `getUser()` and SSR cookies.
- TUAN OS authorization: `src/server/auth/session.ts` obtains the user and profile via `UsersRepository`; role and businessUnitId derive from TUAN OS profile.
- BIZVIORA staging: distinct Supabase project `oxakhhpyvvymujiwuvnm` with browser sessionStorage and tenant/membership checks. A staging JWT is NOT a TUAN OS login session.

## Intended flow (no cross-project token copying)
1. BIZVIORA signs in user via Google OAuth on dedicated staging origin.
2. Backend validates BIZVIORA identity, explicit membership and tenant authorization. Identity by matching email alone MUST NOT authorize TUAN OS.
3. For TUAN OS customer UI, navigate to the original TUAN OS deployment via its own login/approved SSO, on an independently validated origin. Do not embed authenticated pages in iframe.
4. If true SSO is later required, design a backend-only short-lived one-time authorization exchange with explicit audience, issuer, nonce, PKCE/state, replay prevention, server-side principal mapping, tenant scope and audit. Require separate security approval and E2E tests.
5. Keep TUAN OS SSR cookie/session creation exclusively on TUAN OS origin; fail closed on mismatched identity or missing mapping.

## Non-negotiable test gates
- Original dashboard and navigation visually unchanged versus baseline.
- Existing TUAN OS password login and logout preserved.
- Wrong tenant, missing membership, unknown Google identity, replayed exchange and expired state are denied.
- No BIZVIORA tokens, refresh tokens, service role keys or cookies transferred via URL, logs, localStorage or iframe.
- Auth/JWT/RLS tests for two synthetic enterprises; logout/session expiry independently tested on both origins.
- Production and domain changes prohibited without separate L3 approval.

## Implementation blocker
Exact deployed TUAN OS production/staging origin and an independent isolated TUAN OS test deployment must be verified before redirect or SSO coding. The current task is inspection and workspace isolation, not a deploy-ready SSO.
