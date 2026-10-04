#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-status}"
STATE_ROOT="${TCE_AUTH_BROWSER_STATE_DIR:-/opt/tuan-ai/auth-browser}"
PROFILE_DIR="${STATE_ROOT}/facebook-recruitment-profile"
LOCK_FILE="${STATE_ROOT}/facebook-recruitment-bootstrap.lock"
SESSION_FILE="${STATE_ROOT}/facebook-recruitment-bootstrap-session"
CONTAINER="${FACEBOOK_LOGIN_BOOTSTRAP_CONTAINER:-tce-facebook-login-bootstrap}"
IMAGE="${FACEBOOK_LOGIN_BOOTSTRAP_IMAGE:-selenium/standalone-chromium:4.49.0}"
VNC_PORT="${FACEBOOK_LOGIN_BOOTSTRAP_VNC_PORT:-7900}"
WEBDRIVER_PORT="${FACEBOOK_LOGIN_BOOTSTRAP_WEBDRIVER_PORT:-4444}"
APP_UID="${TCE_APP_UID:-1001}"
APP_GID="${TCE_APP_GID:-1001}"

log() { printf '[Facebook login bootstrap] %s\n' "$*"; }
fail() { log "FAIL: $*"; exit 1; }

if [ "${EUID}" -ne 0 ]; then
  exec sudo -E bash "$0" "$@"
fi

status() {
  printf 'bootstrap_lock=%s\n' "$([ -f "$LOCK_FILE" ] && echo active || echo inactive)"
  if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    printf 'bootstrap_container=running\n'
  else
    printf 'bootstrap_container=stopped\n'
  fi
  printf 'novnc_bind=127.0.0.1:%s\n' "$VNC_PORT"
  printf 'webdriver_bind=127.0.0.1:%s\n' "$WEBDRIVER_PORT"
}

start() {
  mkdir -p "$STATE_ROOT" "$PROFILE_DIR"
  touch "$LOCK_FILE"

  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -f "$PROFILE_DIR/SingletonLock" "$PROFILE_DIR/SingletonCookie" "$PROFILE_DIR/SingletonSocket" || true

  # Temporary write access exists only during the human login bootstrap.
  chmod -R ugo+rwX "$PROFILE_DIR"

  log "Pulling pinned Selenium Chromium image"
  docker pull "$IMAGE" >/dev/null

  log "Starting local-only noVNC/WebDriver bootstrap container"
  docker run -d \
    --name "$CONTAINER" \
    --restart no \
    --shm-size=2g \
    -e SE_NODE_SESSION_TIMEOUT=3600 \
    -e SE_VNC_NO_PASSWORD=true \
    -p "127.0.0.1:${WEBDRIVER_PORT}:4444" \
    -p "127.0.0.1:${VNC_PORT}:7900" \
    -v "$PROFILE_DIR:/home/seluser/facebook-profile" \
    "$IMAGE" >/dev/null

  log "Waiting for WebDriver"
  python3 - "$WEBDRIVER_PORT" "$SESSION_FILE" <<'PY'
import json, sys, time, urllib.request
port, session_file = int(sys.argv[1]), sys.argv[2]
base = f"http://127.0.0.1:{port}"

def request(path, payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(
        base + path,
        data=data,
        headers={"Content-Type": "application/json"},
        method="GET" if payload is None else "POST",
    )
    with urllib.request.urlopen(req, timeout=15) as response:
        return json.load(response)

for _ in range(60):
    try:
        body = request("/status")
        if body.get("value", {}).get("ready") is True:
            break
    except Exception:
        pass
    time.sleep(1)
else:
    raise SystemExit("WebDriver did not become ready")

session = request("/session", {
    "capabilities": {
        "alwaysMatch": {
            "browserName": "chrome",
            "goog:chromeOptions": {
                "args": [
                    "--user-data-dir=/home/seluser/facebook-profile",
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                    "--window-size=1440,1100",
                ]
            }
        }
    }
})
session_id = session.get("value", {}).get("sessionId") or session.get("sessionId")
if not session_id:
    raise SystemExit("WebDriver session was not created")
with open(session_file, "w", encoding="utf-8") as fh:
    fh.write(session_id + "\n")
request(f"/session/{session_id}/url", {"url": "https://www.facebook.com/"})
print("session=ready")
PY

  chmod 600 "$SESSION_FILE"
  log "READY"
  log "noVNC is LOCALHOST ONLY. Create an SSH tunnel from the operator browser to VPS port $VNC_PORT."
  log "After Facebook login/MFA is complete, run: $0 stop"
}

stop() {
  log "Stopping temporary browser UI"
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -f "$SESSION_FILE"
  rm -f "$PROFILE_DIR/SingletonLock" "$PROFILE_DIR/SingletonCookie" "$PROFILE_DIR/SingletonSocket" || true
  chown -R "${APP_UID}:${APP_GID}" "$PROFILE_DIR"
  find "$PROFILE_DIR" -type d -exec chmod 700 {} +
  find "$PROFILE_DIR" -type f -exec chmod 600 {} +
  rm -f "$LOCK_FILE"
  log "Persistent profile returned to the TCE app worker."
  sleep 2
  curl -fsS "http://127.0.0.1:3000/api/internal/tce/browser/facebook-recruitment/probe" || true
  printf '\n'
}

case "$ACTION" in
  start) start ;;
  stop) stop ;;
  status) status ;;
  *)
    echo "Usage: $0 {start|stop|status}" >&2
    exit 2
    ;;
esac
