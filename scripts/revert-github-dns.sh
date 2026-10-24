#!/usr/bin/env bash
# Disposable hosted-runner test: reverse the DNS/proxy changes observed in this investigation.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo 'Run as root'; exit 1; }
backup_dir=$1
mkdir -p "$backup_dir"
cp -a /etc/resolv.conf "$backup_dir/resolv.conf.original"
readlink /etc/resolv.conf > "$backup_dir/resolv.conf.original-link" || true
if [ -e /etc/systemd/resolved.conf.d/90-egress-proxy.conf ]; then
  cp -a /etc/systemd/resolved.conf.d/90-egress-proxy.conf "$backup_dir/90-egress-proxy.conf.original"
fi
# Stop both known services before replacing their DNS configuration.
for unit in egress-dns-resolver.service egress-outbound-proxy.service; do
  if systemctl show "$unit" -p LoadState --value | grep -qv '^not-found$'; then
    systemctl stop "$unit"
  fi
  if systemctl is-active --quiet "$unit"; then
    echo "ERROR: $unit is still active"
    exit 1
  fi
done
rm -f /etc/systemd/resolved.conf.d/90-egress-proxy.conf
# Preserve standard systemd resolver behavior; Harden-Runner sets its upstream next.
systemctl restart systemd-resolved
test -f /run/systemd/resolve/stub-resolv.conf
ln -sfn /run/systemd/resolve/stub-resolv.conf /etc/resolv.conf
resolvectl flush-caches
test "$(readlink /etc/resolv.conf)" = /run/systemd/resolve/stub-resolv.conf
! grep -q '127.0.0.100' /etc/resolv.conf
test ! -e /etc/systemd/resolved.conf.d/90-egress-proxy.conf
echo 'REVERT_COMPLETE: proxy services stopped, clearing drop-in removed, resolv.conf restored to systemd stub, cache flushed.'
