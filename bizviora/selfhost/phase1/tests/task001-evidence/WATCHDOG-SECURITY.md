# BIZ20-002 — review-only security follow-up, 2026-10-15

Baseline: PR593 commit 7d6a62db01b6d031cdf4b07cc3653a8308b475ad; CI https://github.com/hongtuant9/tuan-os-enterprise/actions/runs/38694223949 SUCCESS, including signed Keycloak HTTP / PostgreSQL audit and restore smoke. BIZ20-001 evidence appended and read back in TASK-001 BIZV20_PLAN_V1 L8; status remains BLOCKED. No OVH claim.

## Implementation / evidence

Watchdog review source now revokes only the exact synthetic Founder on missing, empty, malformed or expired marker; unexpected grants keep cleanup failed, other users are preserved. Active-grant status is nonzero. DB errors return fixed classifications, not raw subprocess diagnostics. Empty-file read previously exited before revocation under set -e; missing marker previously silently returned success with an active grant. Decimal parsing handles leading zeros.

13/13 behavioral tests PASS using a temporary copy with only state-path substitution and fake Docker/flock commands. No Docker socket, home-directory override, cron installation, live grant, SSH or database access. Cases: arm private 0600 marker, repeated arm, pre-existing grant, future deadline, expiry, empty/malformed/leading-zero marker, lost marker, idle zero grant, unrelated grants, DB failure with secret canary, lock failure, active-grant status. These tests do NOT prove OS lock implementation, killed cron, SIGKILL cleanup or live DB availability.

CI no longer publishes raw DB/Auth/API logs on startup failure. Fresh CI DB initialization reads passwords via psql getenv instead of command-line arguments; no active DB modified. PostgreSQL process environment is still privileged-sensitive and this does not imply secret-vault security. CI Founder case uses finally to remove only its created identity's grant and read back zero; subsequent signed-token HTTP403 verifies authorization revocation. Forced process termination still relies on ephemeral runner cleanup; no claim about installed OVH watchdog.

Reproduction:

```sh
node --test bizviora/core/tests/*.test.mjs bizviora/selfhost/phase1/tests/*.test.mjs
bash -n bizviora/selfhost/phase1/tests/founder-qa-watchdog.sh
sh -n bizviora/selfhost/phase1/db-init/00-roles.sh
node --check bizviora/selfhost/phase1/tests/local-auth-http.e2e.mjs
python3 bizviora/selfhost/phase1/tests/task001-evidence/scan.py
git diff --check
```

Local: 132/132 tests PASS, syntax/diff PASS. Limited source-pattern scan: 64 files / 0 matches before this report; not history/log/credential audit. Original failed audience TAP is retained unchanged. CI for this follow-up must be checked independently before marking its changes validated.

## Status / resume

BIZ20-002 READY_FOR_QA, not accepted: live active-grant timeout/revocation and complete zero-leak evidence remain missing. Existing SSOT OVH cron zero-grant rehearsal remains historical evidence, not this session's action. SECURITY_GATE_HOLD / PRODUCTION_HOLD. Founder approval required YES for installing changed watchdog or modifying existing realm/grants; NO for additional review-only synthetic tests.

Next session: read TASK-001 BIZV20_PLAN_V1 and current PR heads; review this PR CI completion; verify SSOT update. Never rerun against an existing DB by assumption. Do not install cron or apply the new mapper on OVH without scope approval. Next independent eligible work is BIZ20-003 API/schema spec and negative-case reconciliation; BIZ20-004/005 live acceptance remains dependent on authorized JWT/Founder execution.
