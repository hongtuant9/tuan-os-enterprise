# BIZ20-009 — Tenant Settings Write Contract (draft only)

Status: SPEC_FOR_REVIEW. No migration executed, no backend writes enabled and no production release approved.

## Existing system

Use `bv_tenants`, `bv_business_units`, `bv_properties`, `bv_memberships`, `bv_audit_events` in the existing Biz2 Core. Do not create a second settings service or parallel source of truth. The current read-only `GET /v1/tenant-settings` is the base. UI PR #597 is a synthetic nonpersistent client.

## Proposed controlled writes (not implemented)

* `PATCH /v1/tenant-settings/profile`: requires authenticated membership for server-verified tenant, owner or admin; explicit `If-Match` version; allowlist `displayName`, `locale`, `timezone` only after source verification. No client-supplied privileged user/tenant fields may change identity.
* `PATCH /v1/tenant-settings/properties/:id`: owner/admin or specifically delegated property manager; tenant-scoped `property_id`, immutable tenant and business unit relation unless separately approved; normalized name, source verification and version required.
* `GET /v1/tenant-settings/changes`: tenant-scoped and role-filtered immutable audit of actor, correlation ID, old/new version, approval reference, timestamp.
* Contact data, rates, refunds, OAuth credentials, billing, access-control, agent automation and outbound sends remain outside this first write contract.

## Atomic write invariant

One transaction: resolve actor via signed JWT -> verify membership + RLS -> lock target row -> reject stale version (409) -> apply field allowlist -> increment version -> write append-only audit event containing nonsecret diff -> commit. Audit failure must rollback settings change. Never accept userId, tenantId, role, approval status or audit actor from request body. Tenant A attempts against B return 403/404 without existence disclosure. Temporary Auth outage, missing approval or missing source evidence fail closed.

## Schema changes requiring separate migration review

Versioning requires version field or dedicated revisions in existing Core tables; property settings may require additional verified metadata fields. Write an additive, reversible migration with explicit down/rollback plan, lock and index impact, and RLS policies. Do not apply to OVH QA or production before Gate A backup/restoration and owner scoped approval.

## QA acceptance (must be run, not asserted)

Two synthetic tenants A/B, each with property. Good Owner A changes only A, Manager can act only within permitted property, Staff denies. Forged tenant and property denies. Concurrent edits result in one commit and one conflict. Audit insert failure rolls back business write. Revision shows correct actor, timestamps, source/approval reference. Read-only service and old UIs remain compatible. Production HOLD, no direct KiotViet writes or pricing commitments.

Dependencies: PR #596, PR #597, BIZ20-001..017, Gate A, actual JWT/DB RLS E2E, independently restored backups and verified rollback.
