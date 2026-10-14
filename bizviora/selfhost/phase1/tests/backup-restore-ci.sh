#!/usr/bin/env bash
# CI-only synthetic recovery rehearsal. Never targets a customer / production database.
set -euo pipefail
compose=(docker compose -f bizviora/selfhost/phase1/compose.yaml)
target="bv-phase1-restore-${GITHUB_RUN_ID:-local}-$$"
tmpdir="$(mktemp -d)"
cleanup(){
  docker rm -f -v "$target" >/dev/null 2>&1 || true
  rm -rf "$tmpdir"
}
trap cleanup EXIT
test -n "${LAB_DB_ROOT_PASSWORD:-}" || { echo "Missing synthetic restore secret"; exit 1; }
"${compose[@]}" exec -T db pg_dump -U postgres -Fc -d bizviora_phase1 > "$tmpdir/business.dump"
"${compose[@]}" exec -T db pg_dump -U postgres -Fc -d bizviora_auth > "$tmpdir/auth.dump"
test -s "$tmpdir/business.dump"
test -s "$tmpdir/auth.dump"
echo "SYNTHETIC_BACKUP_SHA256"
sha256sum "$tmpdir/business.dump" "$tmpdir/auth.dump" | sed "s|$tmpdir/||g"
network="bizviora-phase1-standalone-qa_isolated"
docker run -d --name "$target" --network "$network" \
  -e "POSTGRES_PASSWORD=$LAB_DB_ROOT_PASSWORD" postgres:16-alpine >/dev/null
ready=0
for i in $(seq 1 60); do
 if docker exec "$target" pg_isready -U postgres -d postgres >/dev/null 2>&1; then
  ready=1;break
 fi
 sleep 1
done
test "$ready" -eq 1 || { echo "ISOLATED_RESTORE_TARGET_NOT_READY"; exit 1; }
docker exec "$target" psql -U postgres -v ON_ERROR_STOP=1 \
  -c "CREATE ROLE bv_api_member NOLOGIN; CREATE ROLE bv_api_login LOGIN; CREATE ROLE bv_auth_login LOGIN;" >/dev/null
docker exec "$target" createdb -U postgres bizviora_phase1
docker exec "$target" createdb -U postgres bizviora_auth
docker exec -i "$target" pg_restore -U postgres --no-owner --no-acl -d bizviora_phase1 < "$tmpdir/business.dump"
docker exec -i "$target" pg_restore -U postgres --no-owner --no-acl -d bizviora_auth < "$tmpdir/auth.dump"

business_sql="SELECT (SELECT count(*) FROM bv_tasks)::text || ':' || (SELECT count(*) FROM bv_approvals)::text || ':' || (SELECT count(*) FROM bv_audit_events)::text;"
auth_sql="SELECT (SELECT count(*) FROM realm)::text || ':' || (SELECT count(*) FROM user_entity)::text;"
before_business=$("${compose[@]}" exec -T db psql -U postgres -d bizviora_phase1 -Atc "$business_sql" | tr -d '\r')
after_business=$(docker exec "$target" psql -U postgres -d bizviora_phase1 -Atc "$business_sql" | tr -d '\r')
before_auth=$("${compose[@]}" exec -T db psql -U postgres -d bizviora_auth -Atc "$auth_sql" | tr -d '\r')
after_auth=$(docker exec "$target" psql -U postgres -d bizviora_auth -Atc "$auth_sql" | tr -d '\r')
test "$before_business" = "$after_business" || { echo "CORE_RESTORE_COUNT_MISMATCH"; exit 1; }
test "$before_auth" = "$after_auth" || { echo "AUTH_RESTORE_COUNT_MISMATCH"; exit 1; }
core_tasks="${after_business%%:*}"
auth_users="${after_auth##*:}"
test "$core_tasks" -ge 52 || { echo "CORE_FIXTURES_MISSING"; exit 1; }
test "$auth_users" -ge 53 || { echo "KEYCLOAK_QA_FIXTURES_MISSING"; exit 1; }
echo "PASS: independent ephemeral PostgreSQL restore, business tasks/approvals/audit counts and Keycloak realm/user counts verified"
echo "SCOPE: CI database-only rehearsal, NOT worker/storage/config/offsite disaster recovery"
