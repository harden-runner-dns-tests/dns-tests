#!/usr/bin/env bash
set +e
echo "timestamp=$(date -u +%FT%TZ) stage=$1"
printf 'ImageOS=%s ImageVersion=%s\n' "$ImageOS" "$ImageVersion"
cat /etc/os-release
ls -l /etc/resolv.conf /opt/hca/outbound-proxy /opt/hca/dns-resolver
sha256sum /opt/hca/outbound-proxy /opt/hca/dns-resolver
cat /etc/resolv.conf
sudo systemd-analyze cat-config systemd/resolved.conf
resolvectl status
sudo ss -lntup | grep -E '(:53 |:443 )'
systemctl list-units --all --no-pager | grep -E 'egress|dns-resolver|outbound-proxy|agent.service'
for f in /etc/systemd/resolved.conf.d/*.conf /run/systemd/resolved.conf.d/*.conf; do
  [ -f "$f" ] && { echo "FILE=$f"; sudo cat "$f"; }
done
exit 0
