#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-status}"
STATE_ROOT="${TCE_AUTH_BROWSER_STATE_DIR:-/opt/tuan-ai/auth-browser}"
PROFILE_DIR="${STATE_ROOT}/google-business-profile"
CONTAINER="${TCE_GBP_BROWSER_CONTAINER:-tce-gbp-browser}"
IMAGE="${TCE_GBP_BROWSER_IMAGE:-selenium/standalone-chromium:4.49.0}"
APP_CONTAINER="${TCE_APP_CONTAINER:-tce-control-center}"

log(){ printf '[GBP browser runtime] %s\n' "$*"; }

if [ "${EUID}" -ne 0 ]; then exec sudo -E bash "$0" "$@"; fi

network_name(){
  docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' "$APP_CONTAINER"
}

start(){
  mkdir -p "$PROFILE_DIR"
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -f "$PROFILE_DIR/SingletonLock" "$PROFILE_DIR/SingletonCookie" "$PROFILE_DIR/SingletonSocket" || true
  chmod -R ugo+rwX "$PROFILE_DIR"
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
    -v "$PROFILE_DIR:/home/seluser/google-business-profile" \
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
        --user-data-dir=/home/seluser/google-business-profile \
        --no-sandbox \
        --disable-dev-shm-usage \
        --disable-gpu \
        --no-first-run \
        --no-default-browser-check \
        about:blank
    ' >/dev/null

  for _ in $(seq 1 60); do
    if docker exec "$APP_CONTAINER" sh -lc 'curl -fsS http://tce-gbp-browser:9222/json/version >/dev/null' 2>/dev/null; then
      log "READY — internal CDP only"
      return 0
    fi
    sleep 1
  done
  echo "GBP CDP runtime did not become ready" >&2
  exit 1
}

stop(){
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -f "$PROFILE_DIR/SingletonLock" "$PROFILE_DIR/SingletonCookie" "$PROFILE_DIR/SingletonSocket" || true
}

status(){
  docker ps --format '{{.Names}} {{.Status}}' | grep "^$CONTAINER " || true
  docker exec "$APP_CONTAINER" sh -lc 'curl -fsS http://tce-gbp-browser:9222/json/version 2>/dev/null | head -c 300' || true
  printf '\n'
}

case "$ACTION" in
  start) start ;;
  stop) stop ;;
  restart) stop; start ;;
  status) status ;;
  *) echo "Usage: $0 {start|stop|restart|status}" >&2; exit 2 ;;
esac
