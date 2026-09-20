#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/tuan-ai/tce-control-center}"
ENV_FILE="${ENV_FILE:-/opt/tuan-ai/secrets/tce-app.env}"
REPO_URL="${REPO_URL:-https://github.com/hongtuant9/tuan-os-enterprise.git}"
MAIN_BRANCH="${MAIN_BRANCH:-main}"
APP_CONTAINER="${APP_CONTAINER:-tce-control-center}"
CANDIDATE_CONTAINER="${CANDIDATE_CONTAINER:-tce-control-center-candidate}"
APP_PORT="${APP_PORT:-3000}"
CANDIDATE_PORT="${CANDIDATE_PORT:-3300}"
STATE_DIR="${STATE_DIR:-/opt/tuan-ai/deploy-state}"
EXPECTED_RUNTIME="tce-executive-org-v1"
EXPECTED_AUTOPILOT="v1"

log() { printf '[TCE deploy] %s\n' "$*"; }
fail() { log "FAIL: $*"; exit 1; }

command -v git >/dev/null 2>&1 || fail "git missing"
command -v docker >/dev/null 2>&1 || fail "docker missing"
command -v curl >/dev/null 2>&1 || fail "curl missing"
[ -f "$ENV_FILE" ] || fail "env file missing: $ENV_FILE"

mkdir -p "$APP_ROOT" "$STATE_DIR"
if [ ! -d "$APP_ROOT/.git" ]; then
  log "Cloning repository"
  rm -rf "$APP_ROOT"/*
  git clone --branch "$MAIN_BRANCH" --depth 1 "$REPO_URL" "$APP_ROOT"
fi

cd "$APP_ROOT"
git fetch origin "$MAIN_BRANCH" --prune
git checkout "$MAIN_BRANCH"
git reset --hard "origin/$MAIN_BRANCH"
SHA="$(git rev-parse --short=12 HEAD)"
IMAGE="tce-control-center:$SHA"

log "Building image $IMAGE"
docker build --pull -t "$IMAGE" .

docker rm -f "$CANDIDATE_CONTAINER" >/dev/null 2>&1 || true
log "Starting candidate on 127.0.0.1:$CANDIDATE_PORT"
docker run -d --name "$CANDIDATE_CONTAINER" \
  --restart no \
  --env-file "$ENV_FILE" \
  -p "127.0.0.1:${CANDIDATE_PORT}:3000" \
  "$IMAGE" >/dev/null
candidate_ok=false
for _ in $(seq 1 30); do
  body="$(curl -fsS "http://127.0.0.1:${CANDIDATE_PORT}/health" 2>/dev/null || true)"
  if printf '%s' "$body" | grep -q '"status":"ok"' && printf '%s' "$body" | grep -q "\"runtime\":\"$EXPECTED_RUNTIME\""; then
    candidate_ok=true
    break
  fi
  sleep 2
done

if [ "$candidate_ok" != true ]; then
  docker logs "$CANDIDATE_CONTAINER" --tail 80 || true
  docker rm -f "$CANDIDATE_CONTAINER" >/dev/null 2>&1 || true
  fail "candidate health/runtime verification failed"
fi

PREVIOUS_IMAGE="$(docker inspect -f '{{.Config.Image}}' "$APP_CONTAINER" 2>/dev/null || true)"
if [ -n "$PREVIOUS_IMAGE" ]; then
  printf '%s\n' "$PREVIOUS_IMAGE" > "$STATE_DIR/previous-image"
fi
printf '%s\n' "$SHA" > "$STATE_DIR/candidate-sha"

log "Candidate PASS; switching primary container"
docker rm -f "$APP_CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$APP_CONTAINER" \
  --restart unless-stopped \
  --env-file "$ENV_FILE" \
  -p "127.0.0.1:${APP_PORT}:3000" \
  "$IMAGE" >/dev/null

primary_ok=false
for _ in $(seq 1 30); do
  body="$(curl -fsS "http://127.0.0.1:${APP_PORT}/health" 2>/dev/null || true)"
  if printf '%s' "$body" | grep -q '"status":"ok"' && printf '%s' "$body" | grep -q "\"runtime\":\"$EXPECTED_RUNTIME\""; then
    primary_ok=true
    break
  fi
  sleep 2
done

if [ "$primary_ok" != true ]; then
  log "Primary health failed; attempting rollback"
  docker rm -f "$APP_CONTAINER" >/dev/null 2>&1 || true
  if [ -n "$PREVIOUS_IMAGE" ]; then
    docker run -d --name "$APP_CONTAINER" --restart unless-stopped --env-file "$ENV_FILE" -p "127.0.0.1:${APP_PORT}:3000" "$PREVIOUS_IMAGE" >/dev/null || true
  fi
  docker rm -f "$CANDIDATE_CONTAINER" >/dev/null 2>&1 || true
  fail "primary verification failed; rollback attempted"
fi

docker rm -f "$CANDIDATE_CONTAINER" >/dev/null 2>&1 || true
printf '%s\n' "$SHA" > "$STATE_DIR/current-sha"
log "PASS sha=$SHA runtime=$EXPECTED_RUNTIME autopilot=$EXPECTED_AUTOPILOT desktop_dependency=false"
