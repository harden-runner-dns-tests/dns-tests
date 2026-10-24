echo actions-proxy-route-v1 >/opt/hca/egress-proxy-identity
systemd-run --unit egress-outbound-proxy -p StandardInput=file:/opt/hca/egress-proxy-identity \
  /opt/hca/outbound-proxy -actions-proxy 20.29.134.25:443 -intercepts api.github.com=127.0.0.2:443 -upstream 127.0.0.53:53

systemd-run --unit egress-dns-resolver \
  /opt/hca/dns-resolver -addr 127.0.0.100:53 -upstream 127.0.0.53:53 -intercepts api.github.com=127.0.0.2:443
/opt/hca/dns-resolver repoint-resolv-conf -addr 127.0.0.100:53