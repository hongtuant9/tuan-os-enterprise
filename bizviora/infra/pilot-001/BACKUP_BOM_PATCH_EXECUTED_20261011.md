# TUAN OS production — approved 3-byte backup executable repair

**Decision:** owner approval directly in conversation on 2026-10-11. Scope: modify only the 3-byte UTF-8 BOM at the start of the backup executable, retain a private original and verify. Related `DEC-BIZ-20261011-016`, approval `APP-BIZ-BACKUP-ROOTCAUSE-REMEDIATION-20261011-001`, TASK-BIZ-20261011-009.
**Result:** `PATCH_EXECUTED_AND_INDEPENDENTLY_VERIFIED`. **NOT** `BACKUP_RESTORE_PASS`.

## Before
- OVH VPS-2 owner-authorized SSH through Mac; validated host key, BatchMode.
- UTC+7 server timestamp approximately 2026-10-11 04:05.
- Executable `/usr/local/sbin/tuan-ai-backup`: 882 bytes, mode 0750 root:root, inode 1410, SHA-256 `483e8e810fca99b2e944119ee5fa5e09bb8c178ee39f5a04944fdb5a28f11cdc`.
- Exact prefix: UTF-8 BOM `EF BB BF` followed by `#!/usr/bin/env bash\n`.
- `bash -n` passed on original when invoking Bash explicitly; direct systemd run previously failed `203/EXEC`.
- Timer `tuan-ai-backup.timer` active, next automatic run **2026-10-12 02:19:28 Asia/Ho_Chi_Minh**. The timer was NOT changed by this step.

## Implementation
1. Rechecked target hash, mode, owner, size, BOM and next timer schedule.
2. Stored the exact original bytes at `/root/tuan-ai-backup.pre-bom-fix.20261011.483e8e81.bak` with root-only 0600 permissions; fsync + SHA verification. The backup path is sensitive operational information but **does not include the script contents**.
3. Prepared in-memory new byte sequence by dropping exactly the leading 3 BOM bytes and no other edits.
4. Created a restricted temporary executable file on the same filesystem, preserved root:root 0750 and existing xattrs, fsync, `bash -n` PASS, SHA verified before atomic `os.replace`. Rechecked concurrent pre-image checksum and inode before replace, fsync the directory.
5. Executable after change: 879 bytes, mode 0750 root:root, SHA-256 `0c0bd32d567fb083e68841c62f4a8a788b5140fb457c8f3d23efd3e08326c435`. Original secure backup SHA still matches pre-image.
6. Independent second SSH readback verified `original_bytes == [EF BB BF] + new_bytes` **TRUE**, executable now starts at byte 0 with valid `#!/usr/bin/env bash\n`, and `bash -n` passes. Remote patch process **exit code 0**.
7. A mistaken top-level-only archive count was 0 because the existing archives are nested. Immediate recursive verification confirmed **3 .tgz files at depth 2 totaling 849,973,739 bytes**, exactly matching prior baseline; no backup archive was touched. Root `df -h` remained 72G/58G used/15G available (80%).

## Scope safety and unresolved release gates
- **NO** manual `systemctl start`, automatic timer manipulation, service restart/stop, Docker cache prune, PostgreSQL migration, provider authentication/OTA token transfer, secret export or new purchase.
- Service still reports **previous** failure `Result=exit-code ExecMainStatus=203` because no new run was authorized. This historical status is **not** evidence that the corrected executable still fails.
- **URGENT:** Timer is still **active**, next scheduled job on 2026-10-12 02:19:28 +07. The corrected executable will be eligible to run automatically then, and script contains `docker/pg_dump/tar` and retention cleanup `-mtime +14` + `rm -rf`. Must obtain **separate explicit approval to temporarily pause timer before next trigger**, or owner-supervise and authorize its run after reviewing side effects.
- Existing archives have never undergone independently verified restore; OVH external Auto Backup is also unverified. `BACKUP_RUN_PASS` and `RESTORE_PASS` remain **HOLD**.
- Do not delete any Docker cache or source files until restore + separate delete approval.

## Rollback for the changed script
After a new scoped L3 approval and under a controlled maintenance window, ensure current file matches the new SHA; restore the protected original copy with exact root:root 0750 and filesystem context. **Caveat:** the original contained the BOM and was non-executable by systemd, so rollback restores exact original bits but **does not restore functioning backups**. Consider another independently verified fixed revision if rollback for functional recovery is required. Never expose executable contents, env files, tokens or browser profiles.

**Checkpoint:** `OWNER_PATCH_APPROVED / THREE_BYTES_CHANGED_PASS / ROOT_ONLY_PREIMAGE_SAVED / POSTPATCH_SHA_AND_SYNTAX_PASS / TIMER_UNCHANGED_ACTIVE / BACKUP_RUN_NOT_TESTED / RESTORE_NOT_TESTED / DOCKER_DELETE_HOLD / SECURITY_GATE_HOLD`.
