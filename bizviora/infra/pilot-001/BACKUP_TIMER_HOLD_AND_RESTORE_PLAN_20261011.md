# TUAN OS production — Approved backup timer hold and independent restore plan

**Date/time:** 2026-10-11, 04:43 Asia/Ho_Chi_Minh.
**Owner authorization:** Explicit user instruction to temporarily pause **only** `tuan-ai-backup.timer`, verify stopped, inspect the script read-only, and draft separate supervised backup and independent restore approvals.
**Status:** `TIMER_PAUSED_VERIFIED / STATIC_SCRIPT_REVIEWED / BACKUP_RUN_NOT_AUTHORIZED / RESTORE_NOT_RUN / DELETE_HOLD`.
**Related:** DEC-BIZ-20261011-018 (to be recorded), TASK-BIZ-20261011-009, DEC-BIZ-20261011-017 (previous exactly-3-byte BOM patch).

## 1. Actual, verified production action

Before: `systemctl is-active tuan-ai-backup.timer` = `active`; `systemctl is-enabled tuan-ai-backup.timer` = `enabled`; the existing backup service = `failed` from a previous `203/EXEC`. No new backup run was triggered.

Approved action performed over the owner's host-key-verified SSH connection at **2026-10-11 04:43:07+07**:

```sh
sudo -n systemctl disable --now tuan-ai-backup.timer
```

Process completed **exit 0**. Independent direct SSH readback:
- `ActiveState=inactive`, `SubState=dead`
- `UnitFileState=disabled`
- `NextElapseUSecRealtime=` (blank)
- `systemctl is-active tuan-ai-backup.timer` => `inactive`
- `systemctl is-enabled tuan-ai-backup.timer` => `disabled`
- `systemctl is-active tuan-ai-backup.service` remains `failed` historical status, with NO new execution
- Root disk still 72G, 58G used, 15G available (80%).
- 3 nested existing `.tgz` backup archives remain: **849,973,739 bytes**; no archives were changed.

**The scheduled 2026-10-12 02:19:28+07 timer activation has been prevented.** The disabled state also persists across reboot until an explicitly approved re-enable. This action changes the timer only; no other service, container, Docker object, API credentials or filesystem contents were modified in this step. The previous approved script BOM-only repair remains in place.

## 2. Read-only script command review — NO values, secrets or script source exported

The installed executable is 20 lines, shebang at byte zero, `root:root` mode 0750, fixed SHA-256 `0c0bd32d567fb083e68841c62f4a8a788b5140fb457c8f3d23efd3e08326c435`.

Control flow and side effects, inferred from keyword/predicate checks on the VPS:
1. Shell uses `set -euo pipefail` and `umask 077`.
2. Creates and enters the timestamped backup destination, sources an environment/configuration file **whose values were never printed**.
3. Uses `docker compose exec` with `pg_dump` to generate a PostgreSQL dump. Before runtime testing verify source DB, scopes, compose project, consistency and failure behavior without revealing credentials.
4. Uses **three `docker run --rm` commands** that execute archive-producing `tar` work. **Clarification:** `--rm` here automatically removes a *temporary Docker container*; it is **not a command to delete production Docker volumes**. Before runtime testing, verify source mounts are the intended business-data volumes and archive paths resolve under a protected backup destination.
5. Generates a compressed archive and SHA-256 checksum. A checksum creation step does **not** prove backup completeness or independent restore.
6. Executes retention with **`find` scoped to `$BASE`, `-mindepth 1`, `-maxdepth 1`, `-type d`, `-mtime +14`, and recursive `rm -rf`**. This IS the destructive part; it may remove an entire old dated backup directory. Never run as-is under current gate until existing archives are preserved and expiration effects reviewed.

The script has not been executed, no cron/timer reactivated and no backup data loaded into any other application.

## 3. Proposal A — supervised non-destructive backup test (requires new L3 authorization)

Preconditions:
- Owner approves exact backup test scope **separately**; backup timer stays `disabled`.
- Acquire a verified offline/off-host protection copy of the current 3 archives with checksum and encryption, or an equivalent independently restorable snapshot with proven retention and access. Never move API/OTA secrets into GitHub, Drive, chat or untrusted systems.
- Inspect live Docker volume/mount names, relevant database health and the backup destination **without printing environment values**; keep their identifiers in an access-controlled ops log rather than ordinary documents.
- Confirm free disk/RAM/CPU headroom and bounded job execution. 15G free on root is a snapshot only, not a guarantee of safe full backup size.
- Prepare a restricted temporary *one-shot* tested copy of the patched script whose **retention deletion is disabled**, with its own hash and audit trail. Do not modify the installed production script unless separately approved.
- Run exactly one supervised backup job in the approved maintenance window; keep timer disabled. Limit resource impact, watch Docker/Postgres/n8n/OTA health, fail closed on errors and preserve all original archives.
- Verify all expected new artifacts, tar/gzip integrity, checksums, file counts, database dump sanity and logs. Record execution duration, size, CPU/RAM/disk peak, archive inventory; **BACKUP_RUN_PASS** is only possible after those checks.
- Stop on low disk, DB/volume inconsistency, unexpected mutation, partial export, health regression or any credential leakage.

## 4. Proposal B — independent encrypted restore (requires new L3 authorization)

- Choose an isolated trusted restore destination **NOT the active TUAN OS VPS-2 production runtime**, preferably a disposable encrypted recovery VM/host with no public web access and strictly scoped data permissions. The user must separately approve any spend and transfer of business data and secrets.
- Transfer only owner-authorized, encrypted backup artifacts over a protected channel; compare source/target SHA-256.
- Restore database and selected Docker volumes into isolated services, avoiding production network and outbound OTA/Email/Facebook/Zalo; never expose or run customer-messaging processes against live provider accounts.
- Test database schema, critical business records, record counts/checksums, key configuration dependencies, integrity of n8n/workflows as permitted, owner-private-data boundaries and restricted connectivity.
- Define and measure recovery point (RPO) and recovery time (RTO), document failed/partial restoration and ensure no tenant cross-exposure.
- Clean recovery resources only after owner approval and data-retention review; no snapshot/production deletion.
- Pass/fail must be grounded in saved logs and independent readback; `BACKUP_RUN_PASS` is not `RESTORE_PASS`.

## 5. Decision gates and rollback

- Current **GATE 1: TIMER_PAUSE_PASS**.
- Current **GATE 2: BACKUP_SCRIPT_STATIC_REVIEW_PASS** with retention risk identified.
- **GATE 3: PROTECTED_SOURCE_COPY_AND_RUN_APPROVAL_HOLD**.
- **GATE 4: SUPERVISED_BACKUP_RUN_NOT_STARTED**.
- **GATE 5: INDEPENDENT_RESTORE_NOT_STARTED**.
- **GATE 6: DOCKER_CACHE_DELETE_HOLD / BIZVIORA_CORE_DEPLOY_HOLD / OTA_API_MIGRATION_HOLD**.

Rollback of the **timer pause alone**, after an explicit owner decision and safe run verification, is `sudo systemctl enable --now tuan-ai-backup.timer`, then independently check `active/enabled` and next run. **Do not execute it now.** Do not start/stop the backup service merely to reset historical failed status. The script's 3-byte BOM patch is a separate already-approved change and is not rolled back with the timer.

No charges, purchases, credential changes or records migration performed.

**Primary evidence:** authorized direct VPS SSH + readback, Technical Build Guide checkpoint, APPROVAL-001, TASK-BIZ-20261011-009.
