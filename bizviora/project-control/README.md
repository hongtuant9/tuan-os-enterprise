# BIZVIORA Project Control — M0-02 (staging contract only)

Authoritative source: `TASK-001` Google Sheet `TASK_MASTER!A162:Z180` (`1uVG0L9FzcPBgOCk5IyWNuYVneCCgupqg-SH0TcERSjM`). No snapshot may be accepted as LIVE task state.

`task-contract.mjs` is a pure, read-only parser. `normalizeRoadmap(rows)` rejects duplicate IDs, missing task count, and unexpected states. It never authenticates users, calls Google Sheets or renders customer data.

## Next integration gate

1. Authorize a **server-side read-only** Google Sheets connection with explicit owner consent. Never expose refresh tokens, service account keys or source spreadsheet credentials to browser, Git, logs or Drive.
2. Backend must verify the signed Supabase JWT and current `bv_is_platform_manager()` before retrieving `TASK_MASTER`. A browser-side check alone does not authorize access.
3. Server calls Google Sheets API with a least-privilege OAuth credential, maps the response using this contract and emits the minimal roadmap fields. No public endpoint or anonymous cache.
4. Fail closed on source errors, malformed rows, missing authority, or stale fetch. Never silently replace live source with synthetic defaults.
5. UAT: compare 19 IDs/statuses directly against source; change one approved task field, read again without deploy, observe it exactly once; verify anonymous/non-manager 401/403 and confirm no secrets leaked.
6. Only after signed-in staging UAT and the requisite approval should this module be promoted or M0-02 marked PASS.

Status: CONTRACT_TEST_PASS; GOOGLE_SHEETS_BACKEND_NOT_CONNECTED; AUTHORIZED_READ_NOT_TESTED; NO_DEPLOY; SECURITY_GATE_HOLD; PRODUCTION_HOLD.

## Staging API gate (isolated source, 2026-10-14)

`handler.mjs` defines GET-only endpoint logic with injected server-owned `verifyUser`, `verifyPlatformManager`, and `readSheet`. No source credential, OAuth token, service role key or browser-side Sheets API is included. Anonymous, invalid JWT and non-manager fail before source access. Every valid GET calls the source again; source/schema faults return 503 without stale fallback. See `handler.test.mjs`.

Integration is **NOT LIVE**. Wiring the staging API requires secure Sheets OAuth credential provisioning and real signed-JWT + non-manager E2E. Do not publish the endpoint or mark M0-02 PASS before those gates. Tests use only synthetic fixtures.
