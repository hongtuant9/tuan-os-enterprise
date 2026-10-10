#!/usr/bin/env bash
# BIZVIORA / TUAN OS VPS DISK INVENTORY — READ ONLY
# Purpose: high-level disk/memory/container usage. This script NEVER deletes, copies,
# rewrites, truncates, prunes, restarts or reads file CONTENTS.
# Do not run on production without operator supervision and a light-load window.
set -u
export LC_ALL=C
printf '%s\n' "BIZVIORA_READONLY_VPS_AUDIT_V1"
printf '%s\n' "NO_CLEANUP_EXECUTED"
date -u '+UTC_DATE=%Y-%m-%dT%H:%M:%SZ'
printf '\n[CPU_COUNT]\n'
(command -v nproc >/dev/null && nproc) || true
printf '\n[MEMORY_MIB]\n'
if command -v free >/dev/null 2>&1; then free -m | head -n 3; fi
printf '\n[FILESYSTEM_CAPACITY]\n'
if command -v df >/dev/null 2>&1; then df -hPT | head -n 25; fi
printf '\n[BLOCK_DEVICES]\n'
if command -v lsblk >/dev/null 2>&1; then lsblk -e7 -o NAME,SIZE,FSTYPE,MOUNTPOINT | head -n 30; fi
printf '\n[TOP_LEVEL_DISK_USE_MIB] (timeout per directory, no filenames printed)\n'
for d in /var/log /var/cache /var/lib/docker /var/lib/containerd /var/lib/postgresql /var/backups /opt /srv /tmp /home /root; do
  [ -d "$d" ] || continue
  if command -v timeout >/dev/null 2>&1; then
    timeout 6s nice -n 15 du -xsm -- "$d" 2>/dev/null || printf 'UNMEASURED_OR_TIMED_OUT %s\n' "$d"
  else
    printf 'SKIP_DU_NO_TIMEOUT %s\n' "$d"
  fi
done
printf '\n[SYSTEMD_JOURNAL_USAGE]\n'
if command -v journalctl >/dev/null 2>&1 && command -v timeout >/dev/null 2>&1; then
 timeout 6s journalctl --disk-usage 2>/dev/null || printf '%s\n' 'UNAVAILABLE'
fi
printf '\n[DOCKER_SPACE_BREAKDOWN]\n'
if command -v docker >/dev/null 2>&1 && command -v timeout >/dev/null 2>&1; then
 timeout 12s docker system df 2>/dev/null || printf '%s\n' 'DOCKER_UNAVAILABLE_OR_TIMEOUT'
fi
printf '\n[FILESYSTEM_INODES]\n'
df -iPT | head -n 25
printf '\n[SUMMARY]\nREAD_ONLY_AUDIT_END; NO_DATA_MODIFIED; NO_SECRET_VALUES_READ\n'
