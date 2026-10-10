# OVHcloud VPS-2 — Automated Backup Standard, owner screenshot and SSH verification
Date: 2026-10-11. Status: PROVIDER_BACKUP_LISTING_VISIBLE / RIGHT_VPS_MATCHED / INDEPENDENT_RESTORE_NOT_RUN / TIMER_DISABLED / NO_PROVIDER_ACTION.

## Screenshot supplied directly by owner
OVHcloud Control Panel, Bare Metal Cloud > Virtual private servers, VPS selected: `vps-a0ea185f.vps.ovh.net`. Screenshot dashboard URL showed this VPS dashboard. Host location London (UK), plan storage 75 GB nominal, and backup status:
- `Automated backup: Standard`, `made on: 10 October 2026 19:04` (UI timezone not independently established).
- `Snapshot: Disabled`. Automated backup and manual Snapshot are distinct services; "Disabled" in manual Snapshot does **not** negate Automated Backup.
- Additional disks: Disabled on this VPS dashboard.
- Renewal panel indicates `Manual renewal`, a continuity risk to track separately; no invoice, purchase or renewal performed.
- Left sidebar lists another VPS; caution against selecting it when checking recovery.

## Cross-check with TUAN OS production access
Read-only Desktop Commander (owner Mac) SSH config check: `tce-vps` alias resolves via DNS to same host network address(es) as selected OVH VPS domain (exact SSH hostname stored as IP); `ssh_alias_dns_matches_screenshot_vps=True`. No IP/credentials disclosed in file.
On authorized direct SSH to `tce-vps`:
- `systemctl is-active qemu-guest-agent` => `active`.
- `/dev/virtio-ports/org.qemu.guest_agent.0` => present.
- `tuan-ai-backup.timer`: still `inactive / disabled`. No changes to backup scripts, production containers, data, auth, OTA, domains or billing.

## Official OVHcloud product/manual notes
Official VPS overview: https://docs.ovhcloud.com/en/guides/bare-metal-cloud/virtual-private-servers/understand-vps-control-panel
Official VPS automated backup guide: https://docs.ovhcloud.com/en/guides/bare-metal-cloud/virtual-private-servers/using-automated-backups-on-a-vps
- For newer VPS range, Automated Backup **Standard** is one daily backup retained ~24 hours; Premium is seven daily backups. Confirm current plan and restore point list in account Control Panel.
- OVH Control Panel > VPS > Automated backup tab displays backup points with actions for `Restoration` and `Mounting`. Do NOT click either during read-only assessment.
- `Restoration` can overwrite active VPS data and is explicitly prohibited without owner L3 production recovery approval.
- `Mounting` can expose files without overwriting current root filesystem; OVH documentation explains it involves a mounted read-write copy and **unmount can reboot the VPS**. Mount/unmount is a production host change: do NOT execute without an approved maintenance window, rollback and owner L3.
- QEMU guest agent present and active supports snapshot filesystem readiness but does not establish application-consistent PostgreSQL/Docker volume state or success of restore.

## Gate interpretation
1. **PASS:** Official OVH dashboard visibly lists Automated Backup Standard and backup date on the correct VPS.
2. **PASS:** SSH endpoint corresponds to selected VPS domain per DNS.
3. **PASS:** qemu-guest-agent active / VirtIO device present.
4. **NOT YET VERIFIED:** current available recovery-point action listing/status after date, whether image is accessible for mount/restore, SHA/content of actual critical data, encrypted off-host durability beyond ~24h, independently tested restore.
5. **NO ACTIONS:** No provider backup/snapshot mount/restoration/order/delete or other control-panel changes. No internal backup run; no Docker cache deletion; no BIZVIORA production deployment.
6. **NEXT L0:** Owner opens `Automated backup` tab for this VPS (not three-dot `Snapshot`). Show recovery date and available actions without selecting `Restoration` or `Mounting`. Capture redacted screenshot; verify active recovery point and retention. Then request separate scoped L3 for safe mount/test in controlled window or off-host copy before supervising local backup as previously approved.
7. **IMPORTANT:** OVH Automated Backup 24h is a rolling safety net. It does not alone satisfy independent durable recovery/restore PASS, which remains the gate for approved supervised TUAN OS backup job.
Status: PROVIDER_AUTOBACKUP_EVIDENCE_PASS / QEMU_GUEST_READY / OFFHOST_RESTORE_NOT_TESTED / LOCAL_BACKUP_TIMER_DISABLED / BACKUP_RUN_NOT_EXECUTED / CLEANUP_HOLD.


## 11 October 2026 follow-up — recovery-point table screenshot CONFIRMED

The owner supplied a second screenshot explicitly showing the **Automated backup** tab of exactly `vps-a0ea185f.vps.ovh.net`.
- The schedule text says automated backups take place daily **at 19:03:00 UTC**.
- The recovery-point table has exactly **one visible row**, `Creation date: 10 October 2026 19:04`. The screenshot does not explicitly label the timezone for the table row, so do not infer it beyond displayed UI.
- The page says **"You don't currently have any restore points mounted."** This means none is mounted, not that no recovery point exists.
- The row has a three-dot action menu, **not opened**. Premium upsell says seven-day restoration, but no upgrade was ordered.
- This confirms an available *listed* OVH restore point as of the screenshot, improving the previous dashboard-only evidence. Its contents, exact retention deadline, snapshot action accessibility, application-consistent PostgreSQL/volume state and independent restore remain NOT VERIFIED.
- No Mounting, Restoration, order, upgrade or data transfer was initiated. Keep independent off-host protection/restore test gate HOLD. The owner should open only the **three-dot action menu for the recovery point** and share a screenshot of choices without selecting `Restoration`, `Mounting` or `Order Premium`.
- The internal `tuan-ai-backup.timer` was previously verified inactive/disabled; this screenshot does not alter that.
**New status: PROVIDER_RESTORE_POINT_ROW_VERIFIED / NO_RESTORE_ACTION / TIMER_OFF / INDEPENDENT_RESTORE_NOT_RUN / CLEANUP_HOLD.**
