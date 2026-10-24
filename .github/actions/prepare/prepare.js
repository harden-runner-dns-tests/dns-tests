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
  if [ "$DNS_TEST_SETUP" = james-script ]; then
    sudo bash james-repro.sh > evidence/james-script.txt 2>&1
    rc=$?
    cat evidence/james-script.txt
    echo "script_exit=$rc" | tee -a evidence/james-script.txt
    sleep 3
    bash snapshot.sh after-script |& tee evidence/after-script.txt
    bash probe.sh after-script |& tee evidence/probe-after-script.txt
  fi
`], { cwd: dir, stdio: 'inherit' });
