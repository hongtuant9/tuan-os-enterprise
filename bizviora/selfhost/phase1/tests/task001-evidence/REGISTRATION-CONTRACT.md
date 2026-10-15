# BIZ20-003 — API/schema reconciliation, 2026-10-15

This is a code-review evidence artifact derived from the authoritative Technical Build Guide (document 1-hU-KnOQqQe6rC0drO-BP4MgzowiUVudvp8GPoLyeEo, “PHASE A SPEC / EXECUTION GATE — 15/10/2026”) and TASK-001 BIZV20_PLAN_V1 rows 10–12. It does not replace those sources or approve a new contract. Baseline: PR594 a8b63b355da093348fb865adc513ec62707b84fd. No schema, RLS, live permission or migration changes in this patch.

## Observed API (current code, not proposed approval)

All /v1 routes require server-verified JWT. Client actor/role/tenant fields do not establish identity.

| Endpoint | Request / response | Authorization / errors |
|---|---|---|
| POST /v1/company-applications | companyName trimmed length 2–120; requestedSlug matches `^[a-z][a-z0-9-]{2,47}$`; 201 data: id, PENDING, company_name, requested_slug, created_at | Signed applicant; invalid input400; duplicate applicant+slug409; anonymous401 |
| GET /v1/company-applications | 200 data array: id, company_name, requested_slug, status, tenant_id, created_at, reviewed_at; newest first, limit100 | RLS self or platform manager; supplied userId query ignored; no pagination cursor |
| POST /v1/company-applications/decision | applicationId UUID, decision APPROVED or REJECTED; 200 data: application_id, decision_status, activated_tenant | Independent platform manager required; non-Founder403; malformed body400; terminal replay409 |
| GET /v1/founder/access | 200 platformManager:true, scope:STAGING_ONLY | Authenticated non-Founder403; missing gate503; no tenant membership implied |

Missing application at decision currently raises SQLSTATE22023, which pg-adapter does not map: generic server error, not documented404. Input empty/null/oversize/type/slug checks and forged identity fields are tested with repository spies; these are API boundary tests, not signed JWT or real DB evidence.

## Observed model / transaction

`bv_company_applications`: id UUID PK, applicant_user_id UUID, company_name, requested_slug, status CHECK PENDING/APPROVED/REJECTED, tenant_id UNIQUE FK, reviewed_by, decision_reason, created_at, reviewed_at; UNIQUE(applicant_user_id,requested_slug).

Submission inserts only verified user ID/name/slug; DB default PENDING. RLS requires same actor, PENDING, null tenant and reviewer. CREATED trigger participates in the insert transaction. `withActor` begins, sets local bv_api_member and actor, invokes parameterized SQL, commits; on error rolls back and releases connection. Runtime member is not BYPASSRLS.

Decision security-definer function rechecks platform manager, locks application FOR UPDATE, requires PENDING. Approval creates tenant + owner membership + terminal status + APPROVED audit in one transaction; rejection creates no tenant/member and records REJECTED. Terminal transitions are rejected. Audit insert failure rolls back business writes. Concurrent behavior is inferred from row locking, not independently demonstrated by a concurrent test in this patch. Concurrent revocation ordering must be separately tested.

## Authoritative requirement vs implementation gap

| Guide requirement | Current evidence / gap |
|---|---|
| Retry same idempotency key returns same result | No key accepted/stored; UNIQUE prevents duplicate effects, returns409. Do not call this response-idempotency PASS. |
| Concurrent approvals exactly one effect | FOR UPDATE present; two-session race test still needed. |
| TENANT_ACTIVATED / MEMBERSHIP_GRANTED audit events, request/correlation IDs | Current audit only CREATED/APPROVED/REJECTED; no explicit activation/member event, request ID or correlation ID. |
| Tenants ACTIVE/SUSPENDED; application version / identity policy | Current tenant has no lifecycle status, application no version/normalized identity; real identity policy not approved. |
| Non-Founder tenant Owner/Staff denied; Founder no private-finance privilege | Existing signed CI/SQL tests cover core boundaries; actual OVH acceptance still incomplete. |
| Synthetic valid request PENDING, duplicate handled | Existing signed CI covers creation; this patch adds duplicate409 with DB row/audit count exactly1 before decision. |

Do not silently change these semantics or represent omitted fields as implemented. Required changes should be designed against the SSOT, with migration/rollback draft and separate approval before applying to an existing database. Security/production holds remain.

## Verification / continuation

18/18 focused API tests PASS (10 new negative/forged-identity cases); full suite and CI must be recorded for this commit. Added signed CI duplicate request + database/audit cardinality check, pending CI execution. No isolated OVH HTTP writes performed. BIZ20-003 remains READY_FOR_QA; BIZ20-004 READY_FOR_QA; BIZ20-005 remains TODO until authoritative live acceptance, despite CI-only coverage.

Next eligible work: design response-idempotency and complete audit event contract/migration rollback for review; independent two-session concurrency harness; authorized active-grant expiry/revocation and signed OVH E2E. Never auto-merge or apply schema on live staging from this report. New sessions must read live TASK-001, PR heads, CI and checkpoint, not infer state solely from conversation.
