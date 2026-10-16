#!/usr/bin/env bash
# Interactive QA runner. Do not run through chat/remote command with credentials.
# Run locally on authorized Mac in a private terminal. No secrets in arguments, files, logs or history.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
export BIZVIORA_STAGING_PROJECT_REF=oxakhhpyvvymujiwuvnm
export BIZVIORA_SUPABASE_URL=https://oxakhhpyvvymujiwuvnm.supabase.co
export BIZVIORA_STAGING_ACK=STAGING_ONLY
export BIZVIORA_STAGING_E2E_ACK=RUN_ON_ISOLATED_STAGING
read -r -s -p 'Staging publishable/anon key (hidden): ' BIZVIORA_SUPABASE_ANON_KEY; echo
read -r -p 'QA tenant A UUID: ' BIZVIORA_TEST_TENANT_A
read -r -p 'QA tenant B UUID: ' BIZVIORA_TEST_TENANT_B
read -r -s -p 'QA Owner A staging JWT (hidden): ' BIZVIORA_TEST_JWT_OWNER_A; echo
read -r -s -p 'QA Owner B staging JWT (hidden): ' BIZVIORA_TEST_JWT_OWNER_B; echo
export BIZVIORA_SUPABASE_ANON_KEY BIZVIORA_TEST_TENANT_A BIZVIORA_TEST_TENANT_B BIZVIORA_TEST_JWT_OWNER_A BIZVIORA_TEST_JWT_OWNER_B
trap 'unset BIZVIORA_SUPABASE_ANON_KEY BIZVIORA_TEST_JWT_OWNER_A BIZVIORA_TEST_JWT_OWNER_B' EXIT
node --test tests/tenant-settings-real-staging-readonly.e2e.mjs
