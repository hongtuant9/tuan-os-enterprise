#!/usr/bin/env bash
set -euo pipefail

MARKER="/opt/tuan-ai/deploy-state/tce-automation-key-v3-20260927.installed"
PUBKEY='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICIb3nxzhZ8AD9scLnuMZ6hK/zSJ1mhsa0+zN7+Oe/ez tce-automation2-2026-09-27'

if [ -f "$MARKER" ]; then
  echo "[SSH bootstrap] already installed"
  exit 0
fi

install_key() {
  local user="$1"
  local home
  home="$(getent passwd "$user" | cut -d: -f6 || true)"
  [ -n "$home" ] || return 0
  install -d -m 700 -o "$user" -g "$user" "$home/.ssh"
  touch "$home/.ssh/authorized_keys"
  chown "$user:$user" "$home/.ssh/authorized_keys"
  chmod 600 "$home/.ssh/authorized_keys"
  if ! grep -Fqx "$PUBKEY" "$home/.ssh/authorized_keys"; then
    printf '%s\n' "$PUBKEY" >> "$home/.ssh/authorized_keys"
  fi
}

install_key ubuntu
install_key tuanadmin
install -d -m 700 "$(dirname "$MARKER")"
touch "$MARKER"
chmod 600 "$MARKER"
echo "[SSH bootstrap] PASS"
