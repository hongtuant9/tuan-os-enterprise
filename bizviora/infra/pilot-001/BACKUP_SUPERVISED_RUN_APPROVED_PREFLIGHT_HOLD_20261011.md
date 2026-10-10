# TUAN OS — Supervised backup approval / preflight HOLD

Date 2026-10-11 ICT. Owner explicitly approved APP-BIZ-BACKUP-SUPERVISED-RUN-20261011-001. Decision reference DEC-BIZ-20261011-019. This authorizes ONE supervised, non-destructive backup after safety preconditions; it does NOT establish that backup has run.

## Read-only live preflight
- Owner-authorized strict-host-key SSH; around 04:59 ICT. No production mutation.
- Timer tuan-ai-backup.timer remains inactive and disabled. Service failure is historical; no new run.
- Root filesystem 72G size, 58G used, 15G available (80%). RAM available 2631 MiB of 7746 MiB; swap 0. 11 Docker containers running, PostgreSQL/Redis reported healthy.
- The deployed executable has SHA-256 0c0bd32d567fb083e68841c62f4a8a788b5140fb457c8f3d23efd3e08326c435.
- It has one destructive retention command at line 19: find with -mindepth 1, -maxdepth 1, -type d, -mtime +14 and rm -rf. This line must NOT be included in the one-shot test.
- Its three Docker archive input mounts contain :ro markers. Docker run --rm deletes temporary containers, not production volumes.
- IN-MEMORY test derived a no-retention version by omitting ONLY line 19 of the verified 20-line source. Result 798 bytes SHA-256 8807abd6c1bd47b42fa47153f66bb0be8a4f0f35d595ce10ee7eef201fe13044; bash -n PASS. No script copy saved or executed, no archive written.
- Existing backup archives nested on current VPS: 3 .tgz, total 849973739 bytes, ages ~67–74h, zero symlinks.
- gzip -t read-only integrity checks PASS for all 3 archives (148415385, 235099016, and 466459338 bytes). CRC PASS does NOT establish database/volume restore.
- Only local root ext4 was found in simple mount report; no verified OVHcloud snapshot recovery point or independent encrypted off-host protection. OVH billing messages referencing Auto Backup do NOT prove an available restore point.
- Timer confirmed inactive/disabled after checks.

## Gate and next action
The prior approved runbook requires an independently restorable and permissioned OFF-HOST copy or equivalent tested OVH snapshot covering the current archives BEFORE executing a new live backup, particularly with only 15G root space. This evidence is MISSING. Therefore no supervised backup run was started despite owner approval.

Unblock options:
1) Read-only verify OVHcloud Control Panel snapshot/Auto Backup recovery point and test recoverability to authorized isolated environment. Do not assume the presence of paid backup or initiate spend.
2) Separately authorize encrypted off-host transfer of current backups to a trusted destination, exact scope and cost, maintaining secret protection.

Once independence is PASS: recheck VPS disk/process load; prepare a secure root-only one-shot copy with the precomputed no-retention SHA, validate database and Docker mounts and run once with monitored CPU/disk, timer still disabled; verify new archive checksum/dump and prepare independently authorized restore. No Docker pruning, real customer migration, OTA/API token copying, or automatic timer re-enable.

Current status: APPROVED_SCOPE / GZIP_CRC_ALL_PASS / NO_RETENTION_DRY_SYNTAX_PASS / INDEPENDENT_PROTECTION_HOLD / BACKUP_NOT_RUN / RESTORE_NOT_RUN / TIMER_DISABLED / NO_DELETE / SECURITY_GATE_HOLD.
