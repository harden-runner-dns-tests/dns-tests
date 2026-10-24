#!/usr/bin/env bash
set +e
stage=$1
for host in github.com api.github.com proxy.golang.org example.com; do
  echo "=== $stage $host $(date -u +%FT%TZ) ==="
  # Capture the application's normal resolver path before explicit diagnostic queries.
  getent ahostsv4 "$host"
  for attempt in 1 2 3; do
    curl -4 -sS -o /dev/null --connect-timeout 5 --max-time 12 \
      -w 'remote_ip=%{remote_ip} http=%{http_code}\n' "https://$host/"
    rc=$?
    echo "RESULT stage=$stage host=$host attempt=$attempt curl_exit=$rc"
    printf '%s\t%s\t%s\t%s\n' "$stage" "$host" "$attempt" "$rc" >> evidence/results.tsv
  done
done
exit 0
