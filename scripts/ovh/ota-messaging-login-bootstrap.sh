#!/usr/bin/env bash
set -euo pipefail

PROVIDER="${1:-}"
ACTION="${2:-status}"
STATE_ROOT="${TCE_AUTH_BROWSER_STATE_DIR:-/opt/tuan-ai/auth-browser}"
IMAGE="${TCE_OTA_BROWSER_IMAGE:-selenium/standalone-chromium:4.49.0}"
SELENIUM_UID="${TCE_OTA_BROWSER_UID:-1200}"
SELENIUM_GID="${TCE_OTA_BROWSER_GID:-1201}"

case "$PROVIDER" in
  agoda)
    PROFILE_DIR="${STATE_ROOT}/ota-agoda-profile"
    LOCK_FILE="${STATE_ROOT}/ota-agoda-bootstrap.lock"
    CONTAINER="tce-ota-agoda-login-bootstrap"
    VNC_PORT="${TCE_OTA_AGODA_LOGIN_VNC_PORT:-7902}"
    START_URL="https://portal.agoda.com/mldc/vi-vn/app/inbox/multiproperty"
    ;;
  booking)
    PROFILE_DIR="${STATE_ROOT}/ota-booking-profile"
    LOCK_FILE="${STATE_ROOT}/ota-booking-bootstrap.lock"
    CONTAINER="tce-ota-booking-login-bootstrap"
    VNC_PORT="${TCE_OTA_BOOKING_LOGIN_VNC_PORT:-7903}"
    START_URL="https://admin.booking.com/"
    ;;
  *)
    echo "Usage: $0 {agoda|booking} {start|stop|status}" >&2
    exit 2
    ;;
esac

log(){ printf '[OTA login bootstrap:%s] %s\n' "$PROVIDER" "$*"; }
if [ "${EUID}" -ne 0 ]; then exec sudo -E bash "$0" "$@"; fi

status(){
  printf 'bootstrap_lock=%s\n' "$([ -f "$LOCK_FILE" ] && echo active || echo inactive)"
  docker ps --format '{{.Names}}' | grep -qx "$CONTAINER" && echo 'bootstrap_container=running' || echo 'bootstrap_container=stopped'
  printf 'novnc_bind=127.0.0.1:%s\n' "$VNC_PORT"
}

start(){
  mkdir -p "$STATE_ROOT" "$PROFILE_DIR"
  touch "$LOCK_FILE"
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -f "$PROFILE_DIR/SingletonLock" "$PROFILE_DIR/SingletonCookie" "$PROFILE_DIR/SingletonSocket" || true
  chown -R "${SELENIUM_UID:-1200}:${SELENIUM_GID:-1201}" "$PROFILE_DIR"
  find "$PROFILE_DIR" -type d -exec chmod 700 {} +
  find "$PROFILE_DIR" -type f -exec chmod 600 {} +

  docker pull "$IMAGE" >/dev/null
  docker run -d \
    --name "$CONTAINER" \
    --restart no \
    --shm-size=2g \
    -e SE_VNC_NO_PASSWORD=true \
    -p "127.0.0.1:${VNC_PORT}:7900" \
    -v "$PROFILE_DIR:/home/seluser/ota-profile" \
    "$IMAGE" >/dev/null

  for _ in $(seq 1 60); do
    if docker exec "$CONTAINER" sh -lc 'test -S /tmp/.X11-unix/X99 || pgrep -f "Xvfb.*:99" >/dev/null' >/dev/null 2>&1; then break; fi
    sleep 1
  done

  docker exec -u seluser "$CONTAINER" sh -lc "
    export DISPLAY=:99
    BROWSER=''
    for p in /usr/bin/chromium /usr/bin/chromium-browser /usr/bin/google-chrome /usr/bin/google-chrome-stable; do
      if [ -x \"\$p\" ]; then BROWSER=\"\$p\"; break; fi
    done
    [ -n \"\$BROWSER\" ] || exit 1
    nohup \"\$BROWSER\" \
      --user-data-dir=/home/seluser/ota-profile \
      --no-sandbox --disable-dev-shm-usage --start-maximized \
      --no-first-run --no-default-browser-check \
      '$START_URL' >/tmp/ota-human-browser.log 2>&1 &
  "
  sleep 3
  log "READY — localhost-only noVNC on port $VNC_PORT"
  log "Use an SSH tunnel; complete login/MFA manually; then run: $0 $PROVIDER stop"
}

stop(){
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -f "$PROFILE_DIR/SingletonLock" "$PROFILE_DIR/SingletonCookie" "$PROFILE_DIR/SingletonSocket" || true
  chown -R "$SELENIUM_UID:$SELENIUM_GID" "$PROFILE_DIR"
  find "$PROFILE_DIR" -type d -exec chmod 700 {} +
  find "$PROFILE_DIR" -type f -exec chmod 600 {} +
  rm -f "$LOCK_FILE"
  log "Persistent profile returned to VPS runtime."
}

case "$ACTION" in
  start) start ;;
  stop) stop ;;
  status) status ;;
  *) echo "Usage: $0 {agoda|booking} {start|stop|status}" >&2; exit 2 ;;
esac
