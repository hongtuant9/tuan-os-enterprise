# OVH VPS-2 — Root cause and gated recovery of TUAN OS backup service

**Date:** 2026-10-11 ICT. **Scope:** TUAN OS production `tuan-ai-backup.service`.
**State:** `ROOT_CAUSE_CONFIRMED / IN_MEMORY_PATCH_SYNTAX_PASS / NO_FILE_MODIFIED / RESTORE_NOT_TESTED / PRODUCTION_CHANGE_L3_PENDING`.

## Grounded findings (read-only through owner-authorized SSH)

- systemd service `tuan-ai-backup.service`: `Result=exit-code`, `ExecMainStatus=203`; timer remains active; last failed 2026-10-11 02:18:52 +07; next schedule 2026-10-12 02:19:28 +07.
- `ExecStart` references `/usr/local/sbin/tuan-ai-backup`. It exists, is a regular root:root file, mode `0750`, 882 bytes; executable by intended root service account. Root mount is ext4 **without noexec**. The nonroot SSH user lacks permission to execute that root-only file, which is expected and **not the systemd root cause**.
- Byte-level finding: script starts with **UTF-8 BOM** `EF BB BF` before the otherwise correct `#!/usr/bin/env bash`. The interpreter line is at byte offset 3 instead of 0. This prevents Linux's direct `execve`/systemd from identifying the shebang, consistent with `203/EXEC`.
- Script MIME `text/x-shellscript`; `bash -n` syntax check exit=0. **This does not prove runtime success, safe retention or successful backup.**
- **In-memory only dry patch** (no file written/executed): remove exactly 3 leading BOM bytes, 882 -> 879 bytes; resulting first line is standard `#!/usr/bin/env bash`, `bash -n` exit=0.
  - Original script SHA-256: `483e8e810fca99b2e944119ee5fa5e09bb8c178ee39f5a04944fdb5a28f11cdc`
  - Simulated corrected script SHA-256: `0c0bd32d567fb083e68841c62f4a8a788b5140fb457c8f3d23efd3e08326c435`
- Script static structure includes `docker`+ `pg_dump`, 3 `docker`+ `tar`+ `rm` lines and a cleanup command with `-mtime +14` and `rm -rf` targeting the backup base variable. **Do not run before validating these source and destination paths, retention impacts, Docker container targets and access scopes.** Secrets are loaded indirectly, not exported or printed in this report.
- Local directory `/opt/tuan-ai/backups` has **3 .tgz files**, approx 444.85 + 224.21 + 141.54 MiB = 810.60 MiB, ages about 65–73 hours. A file existing is NOT restore evidence and is NOT proof of an off-site backup. No file content or guest record was accessed.
- Existing OVH renewal email references Auto Backup option, but its actual subscription/restore test is NOT independently verified.
- Disk root ~72G, ~58G used, 15G free (80%), with RAM available ~2.6GiB, swap disabled. Any new backup may create disk/CPU pressure. Docker BuildKit private reported 15.32GB is cleanup candidate **only after backup recovery**.

## Proposed strict release sequence (requires separate owner L3 approval for production mutations)

1. **Authorize only the narrowly scoped backup-service repair**, not Docker cleanup or tenant migration. Verify no unscheduled production host changes, confirm scope and a rollback maintenance slot.
2. Prechange preserve the original script and unit definition securely **on a restricted, backed-up location**, record owner/mode/SHA, confirm snapshot/backups can be restored. Do not place script, cookies, tokens, provider secrets or password files into GitHub/Google Drive/chat.
3. Apply **only** a 3-byte BOM removal to the exact file under a controlled atomic file update; preserve root:root 0750, SELinux/AppArmor context where applicable and existing unit semantics. Stop if pre-image hash differs from the recorded SHA; do not overwrite changed script.
4. Confirm first bytes of installed script are now `#!/usr/bin/env bash`; confirm SHA is the simulated expected SHA and `bash -n` passes. Review `docker exec` commands, the backup directory targets, and the `-mtime +14` retention before any execution. The repair file change itself is distinct from an approved live backup run.
5. With owner approval, in a low-load window and adequate storage, perform **one supervised backup run** with bounded timeout, CPU/I/O guard, monitoring and explicit protection of all existing archives. Review logs *redacted*, result, archive checksums and timestamps. Failure => HOLD.
6. Restore **independently to an isolated recovery target** (not overriding production), test PostgreSQL integrity, required volumes/browser-session cryptographic protection, and application/service recovery; compare counts/hashes and document RPO/RTO. No restore of production secrets to shared or untrusted environments.
7. Only after the restore PASS and approval: reinstate monitored automated timer if held, ensure a subsequent scheduled run succeeds; separately request specific owner L3 approval for Docker Build Cache cleanup (`CLEAN-01`) or data migration.
8. Rollback scope: if patch or backup execution misbehaves, stop work, preserve logs/backups, follow owner-approved timer hold/rollback plan; restore script pre-image only if needed for configuration rollback (the pre-image is known to be non-runnable, so it is **not** an operational recovery). Never destroy good archives or production containers to revert.

## Do not confuse these gates

- **ROOT_CAUSE_PASS**: UTF-8 BOM before shebang confirmed.
- **SYNTAX_SIMULATION_PASS**: dry-run bytes validated in RAM, no source writes.
- **SERVICE_REPAIRED**: **NOT DONE**; production file is unchanged.
- **BACKUP_RUN_PASS**: **NOT RUN**.
- **OFFHOST_RESTORE_PASS**: **NOT RUN**.
- **DOCKER_CACHE_CLEANUP_APPROVED**: **NO**.
- **BIZVIORA_CORE_DEPLOY_APPROVED**: **NO**.
- **TUAN OS TENANT MIGRATION APPROVED**: **NO**.

References: TASK-BIZ-20261011-009, DEC-BIZ-20261011-015/016 (priority only), pending `APP-BIZ-BACKUP-ROOTCAUSE-REMEDIATION-20261011-001`; approved system design remains OVH Pilot co-location only after safety gates.
