# BIZVIORA AI Workforce V1.1 — Shadow Runtime Contract
**Status:** DRAFT CODE / STAGING PROTOTYPE / NO EXECUTION. This code is a policy kernel and test suite, **not** a deployed API or autonomous AI agent.

## Intended system boundary
Founder V2 -> authenticated Core API -> server-verified principal -> task policy/queue -> optional human-approved read-only worker -> append-only audit -> Founder. Do not implement direct model/provider calls from static HTML. The static demo only simulates task preparation; any Client-side checks are **not** security controls.

## Task envelope (future server-side)
\`{taskId,syntheticScope,agent,title,action,capabilities:[],priority,createdBy,approvalRef:null}\`
- \`syntheticScope\` for shadow tests must use a \`SYN-...\` identifier, never a real tenant identifier.
- Accepted shadow actions: \`analyze_fixture\`, \`draft_runbook\`, \`create_test_plan\`, \`classify_synthetic_ticket\`.
- All production data, customer IDs, credential refs, booking or payment payload, tools, outbound, model spend and live mutations are rejected.
- \`authorityVerified\` in the pure policy is not authentication! A future backend must verify Supabase signed JWT, confirmation and founder platform-manager claim itself, with tenant-aware authorization and durable audit. Do not trust browser-supplied claim fields.
- Security controls require least privilege, idempotent job states, queue retry limits, timeout, P0 escalation, signed approval records, logging and evidence. Never grant provider access merely because it exists.

## Explicit stages
1. Draft local task in browser RAM.
2. Front-end generates deterministic *policy preview* and displays HOLD or READY_FOR_MANUAL_WORK. Neither status means model execution.
3. Owner copies a human-readable handoff to ChatGPT Work; completing work requires opening Work and supplying task. Clipboard copy is NOT a completed job or evidence of a Work run.
4. A future backend will own durable task state and append-only audit only after scope/security acceptance, no duplicate TASK-001 truth. Founder agent task links reference canonical TASK-001 IDs.
5. Only after L2/L3 approval and security gates: enable a trusted worker for a single safe L0/L1 action, verify actual output and cost. Real customer usage stays OFF.

## Acceptance and hard stops
- Node \`node --test runtime-contract.test.mjs\` must pass.
- Staging route renders at desktop/mobile, four Agent profiles, no window JS errors, no external model or provider network calls.
- Any code that attempts production, customer data, secrets, financial or external send must HOLD.
- No VPS, Supabase schema/Auth, DNS, Render plan, OTA, or production service changes.
- Existing backup failure/restore gates unaffected; APP-BIZ-BACKUP-SUPERVISED-RUN-20261011-001 does **not** approve AI workload.
- Rollback: revert only new ai-workforce JS module to its prior commit, then manually redeploy static Render after comparing HEAD.
