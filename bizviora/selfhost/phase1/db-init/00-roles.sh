#!/bin/sh
set -eu
# Invoked only by the fresh isolated Docker PostgreSQL volume.
test -n "${BV_APP_PASSWORD:-}" && test -n "${BV_AUTH_DB_PASSWORD:-}"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_pwd="$BV_APP_PASSWORD" -v auth_pwd="$BV_AUTH_DB_PASSWORD" <<'SQL'
CREATE ROLE bv_api_member NOLOGIN NOBYPASSRLS;
SELECT format('CREATE ROLE bv_api_login LOGIN NOBYPASSRLS PASSWORD %L', :'app_pwd') \gexec
GRANT bv_api_member TO bv_api_login;
SELECT format('CREATE ROLE bv_auth_login LOGIN NOBYPASSRLS PASSWORD %L', :'auth_pwd') \gexec
CREATE DATABASE bizviora_auth OWNER bv_auth_login;
SQL
