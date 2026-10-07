#!/usr/bin/env bash
set -euo pipefail

PROVIDER="${1:-}"
ACTION="${2:-status}"
STATE_ROOT="${TCE_AUTH_BROWSER_STATE_DIR:-/opt/tuan-ai/auth-browser}"
IMAGE="${TCE_OTA_BROWSER_IMAGE:-selenium/standalone-chromium:4.49.0}"
APP_CONTAINER="${TCE_APP_CONTAINER:-tce-control-center}"

case "$PROVIDER" in
  agoda)
    PROFILE_DIR="${STATE_ROOT}/ota-agoda-profile"
    CONTAINER="tce-ota-agoda-browser"
    ;;
  booking)
    PROFILE_DIR="${STATE_ROOT}/ota-booking-profile"
    CONTAINER="tce-ota-booking-browser"
    ;;
  *)
    echo "Usage: $0 {agoda|booking} {start|stop|restart|status}" >&2
    exit 2
    ;;
esac

log(){ printf '[OTA browser runtime:%s] %s\n' "$PROVIDER" "$*"; }
if [ "${EUID}" -ne 0 ]; then exec sudo -E bash "$0" "$@"; fi

network_name(){
  docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' "$APP_CONTAINER"
}

start(){
  mkdir -p "$PROFILE_DIR"
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -f "$PROFILE_DIR/SingletonLock" "$PROFILE_DIR/SingletonCookie" "$PROFILE_DIR/SingletonSocket" || true
  chown -R "${SELENIUM_UID:-1200}:${SELENIUM_GID:-1201}" "$PROFILE_DIR"
  find "$PROFILE_DIR" -type d -exec chmod 700 {} +
  find "$PROFILE_DIR" -type f -exec chmod 600 {} +
  local net
  net="$(network_name)"
  [ -n "$net" ] || { echo "Cannot resolve app docker network" >&2; exit 1; }

  docker pull "$IMAGE" >/dev/null
  docker run -d \
    --name "$CONTAINER" \
    --restart unless-stopped \
    --network "$net" \
    --shm-size=1g \
    --entrypoint sh \
    -v "$PROFILE_DIR:/home/seluser/ota-profile" \
    "$IMAGE" -lc '
      BROWSER=""
      for p in /usr/bin/chromium /usr/bin/chromium-browser /usr/bin/google-chrome /usr/bin/google-chrome-stable; do
        if [ -x "$p" ]; then BROWSER="$p"; break; fi
      done
      [ -n "$BROWSER" ] || { echo "Chromium executable not found" >&2; exit 1; }
      exec "$BROWSER" \
        --headless=new \
        --remote-debugging-address=0.0.0.0 \
        --remote-debugging-port=9222 \
        --user-data-dir=/home/seluser/ota-profile \
        --no-sandbox \
        --disable-dev-shm-usage \
        --disable-gpu \
        --no-first-run \
        --no-default-browser-check \
        about:blank
    ' >/dev/null

  for _ in $(seq 1 60); do
    if docker exec "$APP_CONTAINER" sh -lc "curl -fsS http://$CONTAINER:9222/json/version >/dev/null" 2>/dev/null; then
      log "READY — internal CDP only, persistent profile=$PROFILE_DIR"
      return 0
    fi
    sleep 1
  done
  echo "OTA CDP runtime did not become ready" >&2
  exit 1
}

stop(){
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -f "$PROFILE_DIR/SingletonLock" "$PROFILE_DIR/SingletonCookie" "$PROFILE_DIR/SingletonSocket" || true
}

status(){
  docker ps --format '{{.Names}} {{.Status}}' | grep "^$CONTAINER " || true
  docker exec "$APP_CONTAINER" sh -lc "curl -fsS http://$CONTAINER:9222/json/version 2>/dev/null | head -c 300" || true
  printf '\n'
}

case "$ACTION" in
  start) start ;;
  stop) stop ;;
  restart) stop; start ;;
  status) status ;;
  *) echo "Usage: $0 {agoda|booking} {start|stop|restart|status}" >&2; exit 2 ;;
esac
