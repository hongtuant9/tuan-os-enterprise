#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-status}"
STATE_ROOT="${TCE_AUTH_BROWSER_STATE_DIR:-/opt/tuan-ai/auth-browser}"
PROFILE_DIR="${STATE_ROOT}/google-business-profile"
LOCK_FILE="${STATE_ROOT}/google-business-profile-bootstrap.lock"
SESSION_FILE="${STATE_ROOT}/google-business-profile-bootstrap-session"
CONTAINER="${GBP_LOGIN_BOOTSTRAP_CONTAINER:-tce-gbp-login-bootstrap}"
IMAGE="${GBP_LOGIN_BOOTSTRAP_IMAGE:-selenium/standalone-chromium:4.49.0}"
VNC_PORT="${GBP_LOGIN_BOOTSTRAP_VNC_PORT:-7901}"
WEBDRIVER_PORT="${GBP_LOGIN_BOOTSTRAP_WEBDRIVER_PORT:-4445}"
APP_UID="${TCE_APP_UID:-1001}"
APP_GID="${TCE_APP_GID:-1001}"

log(){ printf '[GBP login bootstrap] %s\n' "$*"; }

if [ "${EUID}" -ne 0 ]; then
  exec sudo -E bash "$0" "$@"
fi

status(){
  printf 'bootstrap_lock=%s\n' "$([ -f "$LOCK_FILE" ] && echo active || echo inactive)"
  docker ps --format '{{.Names}}' | grep -qx "$CONTAINER" && echo 'bootstrap_container=running' || echo 'bootstrap_container=stopped'
  printf 'novnc_bind=127.0.0.1:%s\n' "$VNC_PORT"
  printf 'webdriver_bind=127.0.0.1:%s\n' "$WEBDRIVER_PORT"
}

start(){
  mkdir -p "$STATE_ROOT" "$PROFILE_DIR"
  touch "$LOCK_FILE"
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -f "$PROFILE_DIR/SingletonLock" "$PROFILE_DIR/SingletonCookie" "$PROFILE_DIR/SingletonSocket" || true
  chmod -R ugo+rwX "$PROFILE_DIR"

  docker pull "$IMAGE" >/dev/null
  docker run -d \
    --name "$CONTAINER" \
    --restart no \
    --shm-size=2g \
    -e SE_NODE_SESSION_TIMEOUT=3600 \
    -e SE_VNC_NO_PASSWORD=true \
    -p "127.0.0.1:${WEBDRIVER_PORT}:4444" \
    -p "127.0.0.1:${VNC_PORT}:7900" \
    -v "$PROFILE_DIR:/home/seluser/google-business-profile" \
    "$IMAGE" >/dev/null

  python3 - "$WEBDRIVER_PORT" "$SESSION_FILE" <<'PY'
import json, sys, time, urllib.request
port, session_file = int(sys.argv[1]), sys.argv[2]
base=f"http://127.0.0.1:{port}"
def req(path,payload=None):
    data=None if payload is None else json.dumps(payload).encode()
    r=urllib.request.Request(base+path,data=data,headers={"Content-Type":"application/json"},method="GET" if payload is None else "POST")
    with urllib.request.urlopen(r,timeout=15) as resp: return json.load(resp)
for _ in range(60):
    try:
        if req("/status").get("value",{}).get("ready") is True: break
    except Exception: pass
    time.sleep(1)
else: raise SystemExit("WebDriver did not become ready")
session=req("/session",{"capabilities":{"alwaysMatch":{"browserName":"chrome","goog:chromeOptions":{"args":["--user-data-dir=/home/seluser/google-business-profile","--no-sandbox","--disable-dev-shm-usage","--window-size=1440,1100"]}}}})
sid=session.get("value",{}).get("sessionId") or session.get("sessionId")
if not sid: raise SystemExit("WebDriver session was not created")
open(session_file,"w",encoding="utf-8").write(sid+"\n")
req(f"/session/{sid}/url",{"url":"https://business.google.com/locations"})
print("session=ready")
PY
  chmod 600 "$SESSION_FILE"
  log "READY — localhost-only noVNC on port $VNC_PORT"
}

stop(){
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -f "$SESSION_FILE" "$PROFILE_DIR/SingletonLock" "$PROFILE_DIR/SingletonCookie" "$PROFILE_DIR/SingletonSocket" || true
  chown -R "${APP_UID}:${APP_GID}" "$PROFILE_DIR"
  find "$PROFILE_DIR" -type d -exec chmod 700 {} +
  find "$PROFILE_DIR" -type f -exec chmod 600 {} +
  rm -f "$LOCK_FILE"
  sleep 2
  curl -fsS "http://127.0.0.1:3000/health/google-business-profile" || true
  printf '\n'
}

case "$ACTION" in
  start) start ;;
  stop) stop ;;
  status) status ;;
  *) echo "Usage: $0 {start|stop|status}" >&2; exit 2 ;;
esac
