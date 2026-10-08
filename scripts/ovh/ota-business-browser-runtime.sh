#!/usr/bin/env bash
set -euo pipefail

IDENTITY="${1:-}"
ACTION="${2:-status}"
STATE_ROOT="${TCE_AUTH_BROWSER_STATE_DIR:-/opt/tuan-ai/auth-browser/business-profiles}"
IMAGE="${TCE_OTA_BUSINESS_BROWSER_IMAGE:-selenium/standalone-chrome:4.49.0}"
APP_CONTAINER="${TCE_APP_CONTAINER:-tce-control-center}"
WORKER_CONTAINER="tce-ota-browser-worker"

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

  docker run -d \
    --name "$WORKER_CONTAINER" \
    --init \
    --restart unless-stopped \
    --network "$net" \
    --network-alias tce-ota-agoda-browser \
    --network-alias tce-ota-booking-browser \
    --shm-size=2g \
    --entrypoint bash \
    -v "$PROFILE_DIR:/home/seluser/browser-profile" \
    "$IMAGE" -lc '
      set -e
      BROWSER=/usr/bin/google-chrome
      [ -x "$BROWSER" ] || { echo "Google Chrome executable not found" >&2; exit 1; }

      python3 - <<PY &
import socket
import threading

def pump(src, dst):
    try:
        while True:
            data = src.recv(65536)
            if not data:
                break
            dst.sendall(data)
    except Exception:
        pass

def handle(client):
    upstream = None
    try:
        upstream = socket.create_connection(("127.0.0.1", 9222), timeout=5)
        threading.Thread(target=pump, args=(client, upstream), daemon=True).start()
        pump(upstream, client)
    except Exception:
        pass
    finally:
        try:
            client.close()
        except Exception:
            pass
        if upstream:
            try:
                upstream.close()
            except Exception:
                pass

server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
server.bind(("0.0.0.0", 9223))
server.listen(32)
while True:
    client, _ = server.accept()
    threading.Thread(target=handle, args=(client,), daemon=True).start()
PY

      exec "$BROWSER" \
        --headless=new \
        --remote-debugging-address=127.0.0.1 \
        --remote-debugging-port=9222 \
        --user-data-dir=/home/seluser/browser-profile \
        --no-first-run \
        --no-default-browser-check \
        --disable-dev-shm-usage \
        --disable-gpu \
        about:blank
    ' >/dev/null

  for _ in $(seq 1 60); do
    worker_ip="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$WORKER_CONTAINER" 2>/dev/null || true)"
    if [ -n "$worker_ip" ] && docker exec "$APP_CONTAINER" node -e "fetch('http://$worker_ip:9223/json/version').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" >/dev/null 2>&1; then
      log "READY — internal CDP only; profile=$PROFILE_DIR"
      return 0
    fi
    sleep 1
  done

  echo "OTA browser worker CDP did not become ready" >&2
  exit 1
}

stop(){
  docker rm -f "$WORKER_CONTAINER" >/dev/null 2>&1 || true
  rm -f "$PROFILE_DIR/SingletonLock" "$PROFILE_DIR/SingletonCookie" "$PROFILE_DIR/SingletonSocket" "$PROFILE_DIR/DevToolsActivePort" || true
}

status(){
  docker ps --format '{{.Names}} {{.Status}}' | grep "^$WORKER_CONTAINER " || true
  local worker_ip
  worker_ip="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$WORKER_CONTAINER" 2>/dev/null || true)"
  if [ -n "$worker_ip" ]; then
    docker exec "$APP_CONTAINER" node -e "fetch('http://$worker_ip:9223/json/version').then(async r=>{const t=await r.text();process.stdout.write(t.slice(0,300))}).catch(()=>process.exit(1))" 2>/dev/null || true
  fi
  printf '\n'
}

case "$ACTION" in
  start) start ;;
  stop) stop ;;
  restart) stop; start ;;
  status) status ;;
  *) echo "Usage: $0 {hospitality-main|ruby} {start|stop|restart|status}" >&2; exit 2 ;;
esac
