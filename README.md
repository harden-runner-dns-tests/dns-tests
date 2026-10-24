# Harden-Runner DNS reproduction tests

Diagnostic comparison of native GitHub-hosted runners and [James’s reproduction commands](https://gist.github.com/jamesfrasca/87c55fa5fb07d9807b9f425886e6add6), captured on October 24, 2026.

## Findings

The script does not produce a uniform environment across the sampled runners. Its effect depends on the available resolver binary and existing services. Do not infer successful reproduction from the script exit code, Ubuntu label, or a green diagnostic job alone.

| Scenario | Observed result | Evidence |
| --- | --- | --- |
| Ubuntu latest, HCA `20261021.618`, eastus / centralus | No egress drop-in before the script. Running the unchanged script created `90-egress-proxy.conf` with `[Resolve]` and an empty `DNS=`. Before hardening, the HTTP probes succeeded. After hardening, checkout to explicitly allowed `github.com` failed. | [eastus](https://github.com/harden-runner-dns-tests/dns-tests/actions/runs/40103007552/job/120898841323), [centralus](https://github.com/harden-runner-dns-tests/dns-tests/actions/runs/40103007552/job/120898841293) |
| Ubuntu latest, HCA `20261012.601`, southcentralus / eastus | The same script did not create the drop-in. After hardening, github.com and proxy.golang.org passed, but api.github.com failed all three attempts with curl exit 35. The proxy journal reports refusal connecting to `20.29.134.25:443`; the agent logs that IP being dropped. | [southcentralus](https://github.com/harden-runner-dns-tests/dns-tests/actions/runs/40103128202/job/120899189247), [eastus](https://github.com/harden-runner-dns-tests/dns-tests/actions/runs/40103128202/job/120899189451) |
| Ubuntu 26.04 outside westus2, three script samples | `/opt/hca/outbound-proxy` and `/opt/hca/dns-resolver` were absent. The script exited 127. Passing traffic checks afterward do not establish compatibility because the proxy never started. | [westus](https://github.com/harden-runner-dns-tests/dns-tests/actions/runs/40103007552/job/120898841242), [eastus2](https://github.com/harden-runner-dns-tests/dns-tests/actions/runs/40103007552/job/120898841366), [westus repeat](https://github.com/harden-runner-dns-tests/dns-tests/actions/runs/40103128202/job/120899189347) |
| Ubuntu 26.04, westus2, HCA `20261021.618` | The binaries, drop-in, and services already existed before the script. Both service-start commands failed because the units already existed, yet the script returned 0 because its final command succeeded. After hardening, api.github.com and proxy.golang.org failed all three attempts; github.com passed. | [westus2](https://github.com/harden-runner-dns-tests/dns-tests/actions/runs/40103128202/job/120899189278) |
| Native controls outside westus2, eight samples across both labels | All three allowed hosts succeeded three times each after hardening; deliberately unlisted example.com was blocked. | [first run](https://github.com/harden-runner-dns-tests/dns-tests/actions/runs/40103007552), [repeat](https://github.com/harden-runner-dns-tests/dns-tests/actions/runs/40103128202) |

The four Ubuntu-latest script jobs reported the same runner image version, `20261012.334.1`, but different HCA versions. This is evidence of environment-dependent behavior, not proof that the HCA version number alone determines behavior. No binaries were swapped between hosts.

The westus2 sample logged the agent resolving proxy.golang.org to `142.250.73.81`, then dropping the application's connection to `142.250.73.113`. This provides a concrete allowed-domain/IP-mismatch example. It was an already-active experiment host, not a clean manual-proxy startup.

The claim “the script does not create the drop-in” is therefore too broad: it did create it on two sampled newer-HCA hosts, but not on two older-HCA hosts. The repoint command's implementation matters.

## Test method

- Harden-Runner v2.22.2 pinned to `dc2769abcc0fcfbadfc1df54081c1608579ef6b2`; logs confirm the Community `agent-oss` configuration.
- Harden-Runner initializes in a **pre-step**. The preparation action is deliberately placed before its pre-step. A normal shell step above `uses: step-security/harden-runner` runs too late to establish the same ordering.
- `scripts/james-repro.sh` is the unmodified gist retrieved for these tests, executed with sudo. The harness records failures rather than stopping evidence collection.
- Capture DNS state before the script, after the script, and after hardening: resolv.conf, resolved's combined configuration, resolver status, listening sockets, and service status. The repeat also records binary SHA-256 hashes.
- Run normal application DNS resolution and three curl requests per host at each stage. Explicitly allowed: github.com:443, api.github.com:443, proxy.golang.org:443. Deliberately unlisted: example.com.
- The first run used checkout after hardening. Checkout failed on both newer-HCA script jobs, limiting later probes. The repeat removed checkout and used pre-downloaded diagnostic scripts so that probes could still run.
- The same probes before hardening provide a connectivity baseline. The native controls were different randomly assigned VMs, not paired copies of the script hosts. These 16 jobs are diagnostic samples, not estimates of fleet failure rates.

## Interpreting job status

A green job means diagnostic collection completed, not that all probes passed. Check `RESULT` lines and `script_exit`, and inspect service-start errors even when the latter is zero. Curl exit 0 means a completed HTTP exchange; HTTP response codes are logged separately.

On the broader failure path, artifact upload and runner-control traffic can also be blocked. The first two script jobs and the westus2 repeat reached cleanup in their logs but remained displayed as running. Cancellation and force-cancellation were requested after logs were saved. Use the job's live logs when an artifact is unavailable. Job timeout is 12 minutes.

No DNS mitigation is applied by this test suite. This isolates the current behavior of the published action and the supplied script.

## Re-run

Use **Actions → DNS reproduction comparison → Run workflow**. This schedules eight jobs: two samples each of native/script on ubuntu-latest/ubuntu-26.04. Regions are allocated by GitHub; the suite cannot select westus2. Record the region and HCA version from each job's “Set up job” log.

## Questions supported by these results

1. Can GitHub provide a versioned reproduction environment or identify the expected binary hashes and HCA behavior, including whether repoint should create the DNS-clearing drop-in?
2. What should the reproduction procedure do when the binaries are absent or the services are already running?
3. Can the experiment be paused/reverted on affected hosts while DNS interception and proxy-backend compatibility are resolved?

## Deleting the drop-in before Harden-Runner: October 24 follow-up

[Workflow run 40106478450](https://github.com/harden-runner-dns-tests/dns-tests/actions/runs/40106478450) completed all four jobs. The workflow is `dropin-deletion.yml`.

| Setup | github.com | proxy.golang.org | api.github.com | Unlisted example.com |
| --- | --- | --- | --- | --- |
| Retain drop-in, two samples | One sample passed, one failed | Both failed | Both failed | Both blocked |
| Delete drop-in before Harden-Runner pre-step, two samples | Both passed | Both passed | Both failed | Both blocked |

Each host was probed three times; all three results agreed within each job. The jobs ran on separate randomly assigned VMs, so this is a comparison across samples rather than an identical-host crossover experiment.

One control and one deletion job used the drop-in created by the installed resolver when running James's script. The other pair explicitly created the observed `[Resolve]` / empty `DNS=` file because their older resolver did not create it; artifacts label these as synthetic fixtures. All four used James's active proxy setup. None of these four jobs landed in westus2.

Deletion jobs: [centralus, script-created drop-in](https://github.com/harden-runner-dns-tests/dns-tests/actions/runs/40106478450/job/120909114817), [eastus, synthetic drop-in](https://github.com/harden-runner-dns-tests/dns-tests/actions/runs/40106478450/job/120909114942).

Control jobs: [centralus, script-created drop-in](https://github.com/harden-runner-dns-tests/dns-tests/actions/runs/40106478450/job/120909114902), [westcentralus, synthetic drop-in](https://github.com/harden-runner-dns-tests/dns-tests/actions/runs/40106478450/job/120909114905).

After deletion, Harden-Runner's existing restart applied `DNS=127.0.0.1`; the file was not recreated during the measured interval. `/etc/resolv.conf` still pointed first to GitHub's resolver. For non-intercepted names, the script's resolver forwards to `127.0.0.53`, allowing those requests to reach StepSecurity once resolved is correctly configured.

The remaining api.github.com failure is a different path: GitHub's resolver returns its local proxy address, and outbound-proxy connects to `20.29.134.25:443`. Both deletion jobs logged that backend IP being dropped. The proxy journal recorded connection refusal and curl reported exit 35. Deleting the DNS drop-in does not authorize the backend connection.

Conclusion: deletion is a demonstrated partial mitigation for the DNS configuration conflict in this setup, not complete compatibility with the active proxy. It still requires validation against the live deployment, including whether GitHub recreates the file and how cleanup restores prior configuration. A StepSecurity-owned later override is easier to manage and reverse than deleting another component's file.

To avoid the previous stalled-run problem, this follow-up inserts unconditional IPv4 ACCEPT rules only **after** all DNS snapshots, probes, and journal capture. That recovery restores runner/artifact connectivity and is not part of the tested mitigation. The table and `verdict.json` describe only measurements before recovery. A green diagnostic job still does not mean all allowed hosts passed.
