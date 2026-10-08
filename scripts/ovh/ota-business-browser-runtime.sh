#!/usr/bin/env bash
set -euo pipefail

IDENTITY="${1:-}"
ACTION="${2:-status}"
STATE_ROOT="${TCE_AUTH_BROWSER_STATE_DIR:-/opt/tuan-ai/auth-browser/business-profiles}"
IMAGE="${TCE_OTA_BUSINESS_BROWSER_IMAGE:-selenium/standalone-chrome:4.49.0}"
APP_CONTAINER="${TCE_APP_CONTAINER:-tce-control-center}"
WORKER_CONTAINER="tce-ota-browser-worker"
GUI_PORT="${TCE_OTA_GUI_PORT:-}"
PASSTHROUGH_SCRIPT="${TCE_OTA_CDP_PASSTHROUGH_SCRIPT:-/opt/tuan-ai/tce-control-center/scripts/ovh/cdp-tcp-passthrough.py}"

case "$IDENTITY" in
  hospitality-main|ruby) ;;
  *)
    echo "Usage: $0 {hospitality-main|ruby} {start|stop|restart|status}" >&2
    exit 2
    ;;
esac

PROFILE_DIR="$STATE_ROOT/$IDENTITY/chrome-data"
case "$IDENTITY" in
  hospitality-main) GUI_CONTAINER="tce-business-hospitality-main-browser" ;;
  ruby) GUI_CONTAINER="tce-business-ruby-browser" ;;
esac

log(){ printf '[OTA browser worker:%s] %s\n' "$IDENTITY" "$*"; }
if [ "${EUID}" -ne 0 ]; then exec sudo -E bash "$0" "$@"; fi

network_name(){
  docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' "$APP_CONTAINER"
}

start(){
  [ -d "$PROFILE_DIR" ] || { echo "Profile missing: $PROFILE_DIR" >&2; exit 1; }
  [ -f "$PASSTHROUGH_SCRIPT" ] || { echo "CDP passthrough missing: $PASSTHROUGH_SCRIPT" >&2; exit 1; }

  if docker ps --format '{{.Names}}' | grep -qx "$GUI_CONTAINER"; then
    echo "GUI browser still running: $GUI_CONTAINER. Stop it before starting worker." >&2
    exit 1
  fi

  docker rm -f "$WORKER_CONTAINER" >/dev/null 2>&1 || true
  rm -f "$PROFILE_DIR/SingletonLock" "$PROFILE_DIR/SingletonCookie" "$PROFILE_DIR/SingletonSocket" "$PROFILE_DIR/DevToolsActivePort" || true
  chown -R "${SELENIUM_UID:-1200}:${SELENIUM_GID:-1201}" "$PROFILE_DIR"

  local net
  net="$(network_name)"
  [ -n "$net" ] || { echo "Cannot resolve app Docker network" >&2; exit 1; }

  local port_args=()
  if [ -n "$GUI_PORT" ]; then
    port_args=(-p "127.0.0.1:${GUI_PORT}:7900")
  fi

  docker run -d \
    --name "$WORKER_CONTAINER" \
    --init \
    --restart unless-stopped \
    --network "$net" \
    --network-alias tce-ota-agoda-browser \
    --network-alias tce-ota-booking-browser \
    --shm-size=2g \
    "${port_args[@]}" \
    -e SE_SCREEN_WIDTH=1366 \
    -e SE_SCREEN_HEIGHT=768 \
    -e SE_SCREEN_DEPTH=24 \
    -e SE_SCREEN_DPI=96 \
    -e SE_FRAME_RATE=8 \
    -v "$PROFILE_DIR:/home/seluser/browser-profile" \
    -v "$PASSTHROUGH_SCRIPT:/opt/cdp-tcp-passthrough.py:ro" \
    "$IMAGE" >/dev/null

  sleep 5

  docker exec -d "$WORKER_CONTAINER" \
    python3 /opt/cdp-tcp-passthrough.py 0.0.0.0 9223 127.0.0.1 9222

  docker exec -u seluser -d "$WORKER_CONTAINER" bash -lc '
    export DISPLAY=:99.0
    exec /usr/bin/google-chrome \
      --user-data-dir=/home/seluser/browser-profile \
      --remote-debugging-address=127.0.0.1 \
      --remote-debugging-port=9222 \
      --no-first-run \
      --no-default-browser-check \
      --start-maximized \
      about:blank >/tmp/ota-worker-chrome.log 2>&1
  '

  for _ in $(seq 1 60); do
    if docker exec "$APP_CONTAINER" sh -lc \
      'wget -T 2 -qO- http://tce-ota-agoda-browser:9223/json/version >/dev/null'; then
      if [ -n "$GUI_PORT" ]; then
        log "READY — headed Chrome + localhost noVNC 127.0.0.1:${GUI_PORT}; profile=$PROFILE_DIR"
      else
        log "READY — headed Chrome, internal CDP only; profile=$PROFILE_DIR"
      fi
      return 0
    fi
    sleep 1
  done

  echo "OTA browser worker CDP did not become ready" >&2
  docker logs "$WORKER_CONTAINER" --tail 80 || true
  exit 1
}

stop(){
  docker rm -f "$WORKER_CONTAINER" >/dev/null 2>&1 || true
  rm -f "$PROFILE_DIR/SingletonLock" "$PROFILE_DIR/SingletonCookie" "$PROFILE_DIR/SingletonSocket" "$PROFILE_DIR/DevToolsActivePort" || true
}

status(){
  docker ps --format '{{.Names}} {{.Status}}' | grep "^$WORKER_CONTAINER " || true
  docker exec "$APP_CONTAINER" sh -lc \
    'wget -T 2 -qO- http://tce-ota-agoda-browser:9223/json/version | head -c 300' 2>/dev/null || true
  printf '\n'
}

case "$ACTION" in
  start) start ;;
  stop) stop ;;
  restart) stop; start ;;
  status) status ;;
  *) echo "Usage: $0 {hospitality-main|ruby} {start|stop|restart|status}" >&2; exit 2 ;;
esac
