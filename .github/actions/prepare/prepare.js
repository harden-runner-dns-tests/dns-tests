const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(process.env.RUNNER_TEMP, 'dns-repro');
fs.mkdirSync(path.join(dir, 'evidence'), { recursive: true });
// Fetch only this run's committed test scripts; checkout has not executed yet.
for (const file of ['snapshot.sh', 'probe.sh', 'james-repro.sh']) {
  execFileSync('curl', ['-fsSL', '--retry', '2', '--max-time', '30',
    `https://raw.githubusercontent.com/${process.env.GITHUB_REPOSITORY}/${process.env.GITHUB_SHA}/scripts/${file}`,
    '-o', path.join(dir, file)], { stdio: 'inherit' });
}
execFileSync('bash', ['-c', `
  set -o pipefail
  bash snapshot.sh before |& tee evidence/before.txt
  bash probe.sh before |& tee evidence/probe-before.txt
  if [ "$DNS_TEST_SETUP" = james-script ] || [ "$DNS_TEST_SETUP" = dropin-control ] || [ "$DNS_TEST_SETUP" = dropin-delete ]; then
    sudo bash james-repro.sh > evidence/james-script.txt 2>&1
    rc=$?
    cat evidence/james-script.txt
    echo "script_exit=$rc" | tee -a evidence/james-script.txt
    sleep 3
    bash snapshot.sh after-script |& tee evidence/after-script.txt
    bash probe.sh after-script |& tee evidence/probe-after-script.txt
  fi
  if [[ "$DNS_TEST_SETUP" == dropin-* ]]; then
    if [ ! -x /opt/hca/dns-resolver ] || [ ! -x /opt/hca/outbound-proxy ]; then
      echo 'INVALID: missing proxy binaries' | tee evidence/fixture.txt
      exit 1
    fi
    if [ -f /etc/systemd/resolved.conf.d/90-egress-proxy.conf ]; then
      echo 'fixture_source=existing-after-script' | tee evidence/fixture.txt
    else
      echo 'fixture_source=synthetic-observed-DNS-reset' | tee evidence/fixture.txt
      sudo mkdir -p /etc/systemd/resolved.conf.d
      printf '[Resolve]\nDNS=\n' | sudo tee /etc/systemd/resolved.conf.d/90-egress-proxy.conf
      sudo systemctl restart systemd-resolved
    fi
    sudo cat /etc/systemd/resolved.conf.d/90-egress-proxy.conf | tee -a evidence/fixture.txt
    if [ "$DNS_TEST_SETUP" = dropin-delete ]; then
      sudo rm /etc/systemd/resolved.conf.d/90-egress-proxy.conf
      echo 'Removed drop-in; no resolver restart here. Harden-Runner will restart resolved.' | tee -a evidence/fixture.txt
    fi
    bash snapshot.sh before-harden |& tee evidence/before-harden.txt
  fi
`], { cwd: dir, stdio: 'inherit' });
