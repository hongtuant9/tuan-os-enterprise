# BIZVIORA — TUAN OS Pilot 001 — Co-located OVH VPS-2

Status: ARCHITECTURE ONLY / NOT DEPLOYED / SECURITY_GATE_HOLD.
Related decision DEC-BIZ-20261011-014 (pending canonical recording), supersedes two-physical-VPS assumption of DEC-BIZ-20261011-013 only for Pilot 001.

## Co-located pilot target
One existing OVH VPS-2, contingent on verified actual hardware and headroom, hosts TWO independent logical components:
(A) BIZVIORA Core: UI runtime + Backend/API, Supabase staging Auth/RLS externally.
(B) BIZVIORA Browser Worker: separate process/container, initial OTA history backfill and daily authorized read-only reconciliation for TUAN OS Enterprise pilot 001.

Worker must NOT expose any inbound public port, share application secrets or writable directories, or run arbitrary OTA send/booking write actions. The Core and Worker communicate using an authenticated job/queue contract. Prefer a Postgres job table/lease mechanism in isolated Supabase if approved, avoid provisioning Redis before proven need. Queue interface must be network-independent so Worker can migrate to a new VPS later. Staging source and signed Auth/RLS remain release gates.

## Capacity and protection
IMPORTANT: The actual OVH VPS-2 specification, invoices, available RAM/CPU/disk and existing TUAN OS production load are NOT VERIFIED. No production mutation is permitted from this proposal. An 8-GiB host is the illustrative minimum candidate for co-location with a single browser slot if load allows; do NOT assume current VPS-2 has 8 GiB. Resource limits for a hypothetical otherwise idle 8-GiB test machine: Core ~1.5 GiB RAM; Worker ~2 GiB RAM; OS/services at least ~1.5 GiB; remaining RAM for existing TUAN OS workload plus headroom. These are estimates, not tested allocations. If existing production demand makes this infeasible or VPS-2 has less RAM, HOLD, don't co-locate.
- Worker initial concurrency = ONE browser execution job, add second only after measured stress test.
- Browser and Core separated using cgroups/container CPU, memory and PID limits, non-root where browser supports sandbox, isolated process/service identity, outbound-only worker.
- No plaintext session/password/API credentials in source, logs, Google Drive, or chat. At-rest encryption and tenant-specific credentials; encrypted session state backed up independently.
- No change to TUAN OS production paths, cron, TLS, DNS, service managers, runtime, firewall, SSH policy, or database.
- Keep worker from monopolizing CPU/memory; add alerts and automatic stop on OOM, service degradation, provider challenge or cross-tenant errors. Existing TUAN OS production gets priority.
- Initial trial = TUAN OS only; 50 outside businesses OFF. All third-party channel operations require provider permission.
- Owner approval to co-locate at architecture level is NOT approval for paid purchases, production cutover, new real provider access, auto-send, or customer onboarding.

## Benchmark, gates, acceptance
1. L0 inventory read-only: OVH VPS-2 true cores/RAM/disk/region, billing and renewal, host free RAM, historical peak memory/CPU, existing production services, backup and isolation.
2. Synthetic 1 browser context, measure maximum RSS/PSS Chromium, CPU p95, request latency, job throughput, swap/OOM, job retry. Verify Core still meets existing TUAN OS uptime. Design alarm if sustained host RAM >70–75%; final thresholds require real benchmark.
3. Verify separate execution accounts, encrypted sessions, OAuth/OTA permissions, staging signed Auth/RLS A/B, private finance exclusion, audit, idempotent jobs, successful independent restore and rollback. Continue fail-closed with pending bookings, pricing, refund or outbound messaging.
4. Get independent scoped L3 for any actual deployment or touching the current TUAN OS production VPS.

## Future separation — no code rewrite
Configure Worker with an external job endpoint and per-tenant secret scope, not localhost-only assumptions. Once pilot proves stable and a separate VPS is approved, deploy exactly the same Worker package on the new VPS; shadow-read only first; transfer one queue consumer/lease, verify no duplicate jobs, stop the old worker on VPS-2. Core DB schema and booking IDs stay unchanged. Before cutover, prepare rollback and backup/restore; after cutover, verify logs, CPU/RAM, and provider state.

## Planned operation
Retain Render Hobby Static Site for synthetic Founder and Account demo; no Render Pro subscription. Preserve existing TUAN OS production VPS untouched pending gate. No extra VPS cost is authorized during Pilot 001; existing billing continues and possible storage/backup/AI costs require separate approval. Do not convert hypothetical cost savings into ACTUAL financial statements.

Source decision: https://docs.google.com/document/d/1n6qoZiLMCqPzdnQCZDMnR3dl_BBGq__hvi4HVtThsVU/edit
Tech guide: https://docs.google.com/document/d/1-hU-KnOQqQe6rC0drO-BP4MgzowiUVudvp8GPoLyeEo/edit
