# BIZ20-001 audience correction — 2026-10-15

Review-only follow-up to PR #592 / e4aea2c. API resource audience is `bizviora-core-api`, independent of OAuth client `azp`. Server requires that exact audience (string or member of array); missing/wrong/type-invalid audience fails before Founder authorization. The two existing azp clients remain independently allowlisted.

Fresh disposable CI realm import adds the resource audience to access tokens only. This does not modify any running realm, OVH, DB/RLS or permissions. Existing PKCE live client needs a separately approved mapper and coordinated deployment before this code can be used there. Rollback candidate: e4aea2c, but it contains the demonstrated audience defect and is not a security-accepted release.

Local evidence: `node --test bizviora/selfhost/phase1/tests/signed-jwt-contract.test.mjs`: 20/20 PASS, including original failing regression, absent/wrong/array/type audiences and PKCE client separation. In-memory grant tests remain distinct from actual DB revocation. Old local-tests.tap preserves the original failing evidence.

SSOT read directly: TASK-001 tab BIZV20_PLAN_V1 rows 8–12, Master Blueprint and Technical Build Guide on 2026-10-15. BIZ20-001 explicitly requires OVH signed E2E: status remains BLOCKED regardless of local/CI PASS. BIZ20-002 currently READY_FOR_QA; SSOT reports installed OVH cron and zero-grant deadline rehearsal, superseding the earlier local assumption that watchdog installation was unverified. No active-grant expiry proof yet. BIZ20-003/004 READY_FOR_QA and 005 TODO. Hybrid Cloud target is planning only; no re-platforming under this fix.

SECURITY_GATE_HOLD / PRODUCTION_HOLD. Next: review CI to completion, record result in TASK-001, then independent watchdog/security work. No live deployment or grants authorized by this PR.
