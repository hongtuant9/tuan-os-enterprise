# BIZVIORA Task 001 — review checkpoint, 2026-10-15

Status: SECURITY_GATE_HOLD / PRODUCTION_HOLD. Definition of Done is NOT fully met.
No OVH connection, customer data, deployment, DB/RLS/permission mutation, real credentials, or merge performed.

## Provenance and scope

- PR 589 head reviewed: d212edf9de44bc7180a81ef53a1e4b569687000e (Draft).
- PR 590 head reviewed: 4340cdf1485b155d25752e63c0986409dd24ecfc (Draft).
- Existing Task 001 PR 591 baseline: 9c6d4d5989c86d02652038472318e7f37d7e408b.
- Independent local branch: review/bizv20-task001-verification-20261015; proposed stacked PR base is review/bizv20-codex-task001-20261015.
- No canonical BIZ20-001/002 acceptance specification found in reviewed files or issue search. Mapping below is provisional against the user's task, not formal acceptance.

## Reproduction

Node v22.23.2. From repository root:

```sh
(cd bizviora/selfhost/phase1 && npm install --ignore-scripts --no-audit --no-fund --package-lock=false)
node --test bizviora/core/tests/*.test.mjs bizviora/selfhost/phase1/tests/*.test.mjs
bash -n bizviora/selfhost/phase1/tests/founder-qa-watchdog.sh
git diff --check
python3 bizviora/selfhost/phase1/tests/task001-evidence/scan.py
```

Expected current result: **exit 1, 112 tests: 111 PASS / 1 FAIL / 0 skipped / 0 TODO**. See local-tests.tap for every test result. The failure is intentional evidence, not an expected-failure annotation: wrong audience receives 200 instead of 401. Do not mark the task or CI PASS.

## Test matrix

| Case | Result | Evidence boundary |
|---|---|---|
| Founder signed JWT allowed | PASS | RS256 verifier + Core Request/Response; in-memory grant |
| Applicant A/B and Staff not Founder | PASS | Same signed verifier; synthetic authorization state |
| Wrong issuer | PASS | 401 before Founder guard |
| Wrong audience | **FAIL** | Actual 200, expected 401; azp is checked but aud is not |
| Expired / missing expiry / excessive lifetime | PASS | Signed tokens rejected before authorization |
| Wrong client / wrong signature | PASS | 401 |
| Missing token | PASS | 401 before authorization |
| Same JWT after grant removal | PASS | In-memory grant only; no real DB revocation evidence |
| Unsafe origins / modes / missing execute tokens | PASS | Zero fetch calls |
| Preflight | PASS | Exactly two anonymous GETs; no writes |
| Wrong health identity / redirects | PASS | Runner stops; redirect:error and timeout asserted via fetch stub |
| Watchdog shell syntax and source guard | PASS | Does not establish cron availability or revocation reliability |
| Keycloak HTTP + PostgreSQL signed E2E this session | NOT RUN | No container/DB permission changes authorized |
| OVH E2E / actual temporary grant + independent cleanup | NOT RUN | Requires separate Founder approval |

The test harness extracts the exact verifyBearer function from server.mjs and executes it with jose and an ephemeral RSA public key. It asserts source boundaries; no server startup, network, DB import or stored keys. It is NOT live HTTP/JWKS rotation/Keycloak/DB E2E.

## Changes and findings

- Fixed URL-to-filesystem conversion in runner and tests: paths containing spaces previously caused a real ENOENT and a false positive target-rejection test.
- Runner validates mode, origin and token presence before I/O; rejects userinfo/path/query/fragment, requires synthetic health identity, disables redirects, bounds requests to 10 seconds, and uses a fixed CLI failure message so exceptions cannot expose tokens.
- Added five runner behavior tests and thirteen signed-token contract tests. CI executes these before DB initialization; the audience failure blocks progression.
- Existing Founder guard reads the platform-manager state per request. This supports revocation, but SQL/cron failure and concurrent transactions remain unverified.
- Watchdog has no DB-enforced expiry. Missing deadline exits tick successfully; stopped cron/Docker/DB can prevent deletion. Source assertions are insufficient for BIZ20-002 acceptance.
- Existing CI masks generated credentials, but raw auth/API/DB logs in failure paths need stronger review. DB init passes passwords via psql arguments; masking does not establish process-list secrecy. Existing local-auth script grants Founder without a per-test finally revoke (ephemeral CI volume cleanup is the fallback).
- PKCE helper only decodes access-token claims for identity checks; the API verifies signature. ID-token nonce validation, timeout cleanup, and safe CLI entrypoint/path behavior still require targeted tests.

## Secret scan

Limited scanner: 61 files, 0 matches before this checkpoint was added; final count may increase. Rules cover private-key headers, GitHub token formats, AWS access-key IDs and literal JWTs. Output contains only paths/rule names, never matched values. This does NOT detect every password, encoded secret, historical commit, CI artifact or external log. Gitleaks/trufflehog unavailable. Comprehensive secret scan: NOT RUN. No real credentials used in tests.

## Acceptance and next session

- BIZ20-001: NOT ACCEPTED. Signed contract coverage improved, audience defect reproduced; actual Keycloak/HTTP/DB and OVH evidence absent.
- BIZ20-002: PARTIAL, NOT ACCEPTED. Runner gates tested; watchdog behavior, interruption cleanup and independent DB readback not proven.
- Start by reading this checkpoint and checking git status, commit and PR/CI head. Do not replace existing branches or trust prior claimed 94/94 as portability evidence.
- Agree API audience contract and add matching synthetic Keycloak mapper; patch verifier plus test missing/array audiences. These source/config changes are not in this test-focused PR. Do not alter a live realm or DB.
- Add isolated fake-command watchdog tests for missing/corrupt deadline, expiry, lock and DB failures, then seek separate approval for a new disposable DB/Keycloak stack and any real temporary grant.
- Run the full signed Keycloak/HTTP/DB flow and audit readback on a fresh explicitly authorized synthetic stack. Record cleanup independently.
- OVH requires separate approval. CI PASS never implies OVH E2E PASS. No auto merge.
