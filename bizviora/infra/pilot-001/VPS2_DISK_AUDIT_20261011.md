# BIZVIORA / TUAN OS — OVH VPS-2 live disk, Docker and backup audit

**Audit timestamp:** 2026-10-11 03:28–03:33 ICT (2026-10-10 20:28 UTC)
**Source:** authorized Mac Desktop Commander, SSH alias `tce-vps` with strict known host check, read-only Linux and Docker commands.
**State:** `VPS_DISK_MEASURED / CLEANUP_CANDIDATES_IDENTIFIED / BACKUP_FAILED / NO_DELETE / NO_MIGRATION`.

## 1. Verified physical host and filesystem

| Metric | Observed |
|---|---|
| OS | Linux |
| CPU | 4 online vCPU |
| Physical RAM `MemTotal` | 7,931,944 KiB ≈ 7.56 GiB |
| `free -m` | 7,746 MiB total, 5,085 MiB used, 2,660 MiB available; 303 MiB free |
| Swap | **0** |
| Root ext4 | `/dev/sda1`, `df -h`: 72G size / 58G used / 15G available / **80%** |
| `findmnt` measured root | 71.6G size / 57.1G used / 14.4G avail |
| Inodes | 18% of root inodes used |
| Uptime | 13 days at audit |
| CPU load average | 0.16 / 0.22 / 0.22 at audit; NOT a representative peak or SLA |

## 2. Docker space report (READ-ONLY)

Docker engine 29.1.3, Docker root `/var/lib/docker`, **11 running containers**.
`docker system df` observed:
- Images: **102 total, 11 active**, reported **47.58 GB** SIZE; RECLAIMABLE displayed **negative ~296 MB (0%)**. This inconsistent negative figure is **not a trustworthy reclaimable estimate** and cannot be treated as image deletion authorization.
- Containers: 16 total / 11 active, **1.948 GB**, reported 672.7 MB reclaimable (candidate only; stopped containers may carry essential service state).
- Local volumes: 9 total / 8 active, **129.7 MB**, reported 54.11 MB reclaimable (NOT SAFE to prune without owner/service classification).
- Build cache: **171 entries, 0 active**, **20.91 GB**, `docker system df` reported **15.32 GB reclaimable**.
- Separately, `docker buildx du` reported `Shared: 5.59 GB / Private: 15.32 GB / Reclaimable: 20.91 GB / Total: 20.91 GB`. This means tool views differ in the accounting of shared data; **do not sum or guarantee physical reclaim**. 15.32 GB private cache is the lead non-runtime cleanup candidate subject to backup/rebuild checks.
- OCI/layer accounting overlaps. `docker system df` image SIZE + cache SIZE **must not** be summed as physical used space.

Running containers at read-only inspection (no secret fields or env accessed): tce-control-center; tce-business-ruby-browser; tce-ota-browser-worker; tce-gbp-browser; tce-fb-auth-chrome; tce-caddy; compose-n8n-1; compose-postgres-1; compose-redis-1; compose-caddy-1; compose-uptime-kuma-1. Docker 11-running / 16-total.

## 3. Non-Docker application directories — size, not deletion permission

Measured from `du -x -m` (approx MB):
- `/opt/tuan-ai`: 6,830 MB aggregate
- `/opt/tuan-ai/kiotviet-finance-bot`: 2,309 MB (**KEEP pending dependency check**)
- `/opt/tuan-ai/kiotviet-inventory-bot`: 2,063 MB (**KEEP**)
- `/opt/tuan-ai/backups`: 811 MB (**KEEP, restoration not proven**)
- `/opt/tuan-ai/auth-browser`: 806 MB (**KEEP; credentials or profiles may be inside; do not read/copy/delete**)
- `/opt/tuan-ai/kiotviet-finance-bot-preflight`: 526 MB (**CANDIDATE only**)
- `/opt/tuan-ai/kiotviet-finance-bot-pr194`: 198 MB (**CANDIDATE only**)
- `/opt/tuan-ai/deploy-tmp`: 61 MB (**CANDIDATE only**)
- `/home/tuanadmin/tuan-os-migration`: 774 MB (**CANDIDATE only; may be migration recovery evidence**)
- `/var/log`: 575 MB; `journalctl --disk-usage` separately reported 40 MB under its vantage and `/var/log/journal` observed 493 MB via root du. **Discrepancy needs verification; do not truncate logs**.
- `/var/cache`: 149 MB.
- `/var/backups`: ~2 MB.

Open but unlinked files: `lsof +L1` output contained 1,151 handles. Grouped by device+inode to avoid counting duplicate handles, 491 unique entries totaling approximately **735,476,404 bytes (~701 MiB)**; highest groups are Chromium/Chrome/Xvfb/pulseaudio/Postgres. Most may be in-memory or allocated temporary storage, **not guaranteed recoverable disk**, and **restarting/stopping services to free them is NOT authorized**.

## 4. Critical backup failure

The timer `tuan-ai-backup.timer` is **ACTIVE** with recent trigger at 2026-10-11 02:18:52 ICT and next scheduled 2026-10-12 02:19:28 ICT.

But `systemctl show tuan-ai-backup.service` reports:
`ActiveState=failed`, `Result=exit-code`, **`ExecMainStatus=203`**. Status 203 is compatible with systemd EXEC-stage failure; precise cause/root fix **NOT VERIFIED**. A directory named `/opt/tuan-ai/backups` exists but file existence does not prove restore. OVH renewal emails mention an Auto Backup option, but no OVH snapshot has been restored and verified.

**MUST STOP all deletion, Docker prune, credential rotation, live migration, service restarts and cutover until independent backup/restoration is proven and a scoped owner approval is recorded.**

## 5. Prioritized candidate manifest (size estimates are overlapping/non-additive)

| ID | Candidate | Reported size | Decision | Gate |
|---|---|---:|---|---|
| CLEAN-01 | Private Docker BuildKit cache (171 total cache entries) | **15.32 GB private reported** | `CANDIDATE_REBUILDABLE` | Backup/restore PASS; identify active image/build ref/CI rollback; separate specific owner L3 approval; dry-run/impact design |
| CLEAN-02 | Stopped Docker containers (5 = 16 total - 11 active) | **672.7 MB reported reclaimable** | `CANDIDATE_UNKNOWN_STATE` | inspect service dependencies and state storage without secrets; backup/owner approval |
| CLEAN-03 | Unused Docker local volumes (1 = 9 total - 8 active) | **54.11 MB reported** | `PRESERVE_UNTIL_OWNER_AUDIT` | DO NOT prune blindly; possible persistent data |
| CLEAN-04 | Finance bot preflight directory | **526 MB** | `CANDIDATE_UNVERIFIED` | Compare build/deployment references; reproducibility, hash for nonsecret files |
| CLEAN-05 | Finance bot PR194 directory | **198 MB** | `CANDIDATE_UNVERIFIED` | Same |
| CLEAN-06 | `deploy-tmp` | **61 MB** | `CANDIDATE_UNVERIFIED` | Confirm not current rollback release |
| CLEAN-07 | `/home/tuanadmin/tuan-os-migration` | **774 MB** | `PRESERVE_FOR_MIGRATION` | Need mapping and restoration before removing |
| CLEAN-08 | Logs/journal | **575 MB `/var/log`** | `KEEP_AUDIT` | Fix backup, define retention and logging policy |
| CLEAN-09 | Open unlinked process files | **~701 MiB unique record sizes, uncertain disk usage** | `NO_DIRECT_CLEANUP` | Only consider after proven maintenance-window process restarts; no restart approved |
| KEEP-01 | Running browsers, n8n, PostgreSQL, Redis, active API services and profiles | variable | `KEEP` | Production dependency |
| KEEP-02 | `/opt/tuan-ai/backups` | 811 MB | `KEEP` | Failed backup service, must restore independently |
| KEEP-03 | `/opt/tuan-ai/auth-browser` | 806 MB | `KEEP` | Sensitive session profiles/credentials, migrate by authorized re-login/secret vault |

No cleanup done. **Actual reclaimed bytes = 0**.

## 6. Migration remains separately blocked

Source Supabase read-only baseline: 479 bookings all with NULL `property_id`, 288 conversations with no verified canonical booking link. BIZVIORA staging tenant `tuan-os-enterprise-001` exists but no target BU/property/message/booking schema. Before any production credential/session migration, map KiotViet property → tenant, verify bookings and conversation IDs, create properly permissioned staging tables only after approval, signed tenant A/B RLS checks, provider reauthorization without copying plaintext tokens. No customer records, API keys, cookies, OAuth values or OTA credentials were inspected or moved.

## 7. Audit and execution controls

- SSH alias uses existing owner-authorized host-key-verified account; no SSH keys exported.
- Only read-only `df`, `free`, `du`, `docker system df`, `docker buildx du`, `docker ps`, `systemctl show`, `lsof` executed. No `rm`, `prune`, `docker stop`, `docker restart`, `systemctl restart`, `VACUUM`, `DELETE`, or credential actions.
- Two subsequent metadata audit command bundles were refused by connected Desktop Commander safety guard; no bypass attempted.
- Next owner decision must specify backup-remediation scope first, followed by **named per-item deletion approval**, never blanket cleanup.

**Checkpoint:** `VPS2_DISK_AUDIT_PARTIAL_PASS / DOCKER_CACHE_CANDIDATE / BACKUP_EXEC_FAILED / DELETE_HOLD / PROVIDER_MIGRATION_HOLD / SECURITY_GATE_HOLD`.
