# BIZVIORA Pilot 001 — Backup / Restore / Capacity — 11/10/2026

**Authority:** This is sanitized engineering evidence on isolated feature branch. TASK-001, APPROVAL-001 and Technical Build Guide remain governing sources. No production release approval is inferred.

## 1. Current verified infrastructure (L0)

- OVH primary VPS `vps-a0ea185f`: 4 vCPU; 7,746 MiB memory; root ~72 GiB filesystem, ~15 GiB free (80% used); 11 live Docker containers; PostgreSQL and Redis healthy.
- `tuan-ai-backup.timer` = inactive/disabled; do **not** re-enable without approval.
- Installed `/usr/local/sbin/tuan-ai-backup` corrected by prior explicit owner approval: size 879 bytes; SHA256 `0c0bd32d567fb083e68841c62f4a8a788b5140fb457c8f3d23efd3e08326c435`; installed script NOT changed in this milestone.
- Historical `tuan-ai-backup.service` failure record (203/EXEC) is not proof of a successful scheduled backup and is not erased.

## 2. Source archive classification correction

- Three existing `.tgz` files in `/opt/tuan-ai/backups/browser-profiles/`: 849,973,739 bytes total; **browser-profile archives, not comprehensive database backups**.
- A much older, small compose backup exists under `/opt/tuan-ai/backup/20260908_005559`.
- Do not treat browser archives or OVH Standard rolling recovery point as full verified database recovery.

## 3. Off-host protection and encrypted verification

- Owner's connected Mac uses FileVault and a private `0700` recovery directory with a `0600` private recipient key.
- Streamed authorized archive data over host-key-verified SSH into OpenSSL CMS AES-256-GCM ciphertext on Mac, with no plaintext archive created on Mac.
- CMS decrypt test PASS, tar structure readable (15 members), all three browser archives independently matched VPS SHA256 byte for byte.
- Separate new compose backup encrypted to Mac; decryption/tar listing verified (7 members).
- Recipient private key is **only on current Mac**: independent key escrow and disaster-proof recovery remain a future requirement; no key was posted to chat, GitHub or Google Drive.

## 4. Supervised non-retention backup (L3 previously approved)

- Approval `APP-BIZ-BACKUP-SUPERVISED-RUN-20261011-001`, decision `DEC-BIZ-20261011-019`. Scope: one non-destructive supervised backup after protecting historical archives.
- Safety-reviewed temporary one-shot variant omitted destructive retention line, used offline `alpine:3.20` with no network, memory/PID guard. The first stdin-streamed run produced only a valid PostgreSQL dump because the child command consumed stdin; this partial state was detected, not falsely classified PASS.
- Continued the **same new backup directory** under a root-only temporary continuation script, without running pg_dump again or deleting old data.
- New directory: `/opt/tuan-ai/backup/20261011_055119`; `postgres.dump` = 447,205 bytes; `config.tar.gz`, `n8n-data.tar.gz`, `redis-data.tar.gz`, `uptime-kuma-data.tar.gz`, plus `SHA256SUMS`.
- Manifest: **5/5 checksum PASS**; 4/4 gzip integrity PASS; `pg_restore --list` PASS. All contained files were then encrypted into protected Mac off-host backup and CMS decrypted/listed successfully.
- No timer re-enable, retention deletion, Docker prune, provider activity, billing or UI mutation.

## 5. Isolated restore (same physical host only)

- Spawned ephemeral `postgres:16-alpine` with `--network none`, no published ports, CPU/RAM/PID limits, read-only source bind and read-only container root.
- Fresh `postgres.dump` restored into an isolated new temporary database; **135 public tables** verified, exit code 0; disposable restore container auto-removed; production PostgreSQL unchanged.
- **This is `SAME_HOST_ISOLATED_RESTORE_PASS`, NOT `INDEPENDENT_OFFHOST_DISASTER_RESTORE_PASS`.**

## 6. Important scope gap: Supabase

- TUAN OS main production Supabase is an external managed PostgreSQL project, independent from the VPS local Docker Compose DB. Live read-only metadata: ~1,123 MB database and 82 public RLS-enabled tables.
- BIZVIORA staging Supabase: ~12 MB database and 10 public RLS-enabled tables; RLS policy presence is NOT signed-in two-tenant negative-test proof.
- Today's local compose backup **does not include** managed Supabase production data, auth, customer/channel records or an independent complete recovery of that managed system.
- Supabase organization plan is Free; do not assume a managed point-in-time restore or paid backup is available.

## 7. Disk cleanup and BIZVIORA co-location gates

- `docker system df`: Build Cache 171 entries / 20.91 GB reported total / 15.32 GB reported reclaimable private; not yet proven how much physical disk would be recovered. 102 images, 16 containers (11 running), 9 volumes (8 active).
- **No cache prune, container/volume deletion or storage mutation** because independent restore/production retention gate is still HOLD.
- Host memory available at final sample ~2,494 MiB. Previous target illustrative Core 1,536 MiB + Worker 2,048 MiB = 3,584 MiB, before additional operational headroom; co-location fails a conservative immediate headroom check. No Core or Browser Worker installed.
- Current staging RLS signed-in negative tests, owner-private boundary, provider safety and full-secret findings remain HOLD.
- No purchase, public-domain change, auth/provider transfer or customer-data migration.

## 8. Next authorized lane

1. Use an independently accessible trusted recovery device (prefer the existing owner Home Server `hongtuan`, currently offline; requires owner to bring it online) to establish a full off-host restore test and backup key escrow, without enabling provider traffic.
2. Design a safe authorized export/backup of the external Supabase production database (no passwords or connection strings in chat/Drive/Git); add secure archive and restore readback, preserve auth/privacy boundaries.
3. After whole-system backup/restore PASS, seek exact per-item approval for Docker BuildKit cache reclamation; verify space reclaimed and stability.
4. Test bounded synthetic BIZVIORA Core/Worker benchmark and signed-in two-tenant Auth/RLS; do not co-locate until measured headroom and security gates PASS. Existing OVH production is prioritized.
