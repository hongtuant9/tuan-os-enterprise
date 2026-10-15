# BIZ20-009 — OVH QA Recovery Evidence and Independent Restore Gate

Status: PARTIAL_INVENTORY_ONLY / HOLD. Read-only inventory captured 2026-10-16 local.

## Runtime images (verified via docker inspect)
- QA API image: `sha256:230776fc70e77a9e345a8c4f09a26f0dad80fad3b47560d6a26929e33fe87f63`
- QA Core DB image: `sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685`
- QA Auth image: `sha256:5f3fb534cde6bf006d79f5912473e5d2c828c707cdfc52e16972803aca9d43dd`

All three containers were running when inspected; Core DB container reported healthy. Image hash alone does not prove the deployed application source revision.

## Existing recovery artifacts (metadata only)
- `recovery-backups/keycloak-auth-pre-recovery-20261015.dump`, about 212 KiB, restricted file permissions
- `recovery-backups/founder-api-pre-azp-f81960ab-20261015.mjs`, about 3.5 KiB

Neither artifact constitutes a verified full Core DB snapshot. No independent restore of Core DB or Auth DB has been witnessed. API code file is NOT equivalent to an immutable deployable prior image.

## Required HOLD release checks
1. Obtain owner-approved private backup storage destination, retention, and restricted recovery operator. Never move plaintext credentials or user data to GitHub.
2. Identify actual database/volume mapping for Core and Keycloak Auth, backup each separately, record SHA-256 and encrypted destination, and confirm backup completes without downtime.
3. Restore each into freshly provisioned, physically/logically separate QA recovery databases. Verify schema migrations, tenant/member/audit counts, Keycloak realm, issuer and audience without exposing tokens or sensitive rows.
4. Pin prior API image/build digest (do not assume an existing `.mjs` file can roll back service), run isolated duplicate service against restored databases, exercise health and signed JWT A/B negative tests.
5. Produce PASS/FAIL evidence with exact timestamps and rollback drill; only then request scoped approval to promote PR596 and wire PR597. Do not touch original QA or production during testing.

## Current gate
BACKUP_RESTORE_CORE_NOT_RUN; BACKUP_RESTORE_AUTH_NOT_RUN; API_ROLLBACK_NOT_RUN; SIGNED_AUTH_ADAPTER_DATABASE_E2E_NOT_RUN; SECURITY_GATE_HOLD; PRODUCTION_HOLD.
