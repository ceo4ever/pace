import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { home, app, sha, mod, evDir, save, verifyModules, cli, sameOwner, sleep } from './pace-p005-t03-common.mjs';
if (process.argv[2] !== '--after-user-relogon') {
  console.log('Requires a completed human sign-out/sign-in observation; no action performed.');
  process.exit(2);
}
try {
  const baseline = JSON.parse(fs.readFileSync(path.join(evDir(), 'human-relogon-baseline.json'), 'utf8'));
  if (!baseline.parallelCheckCompleted || baseline.parallelCheckExit !== 0 || !baseline.testGuardianDisarmedForFinalRunning) throw Error('parallel-test-not-complete');
  const { readLockInfo, readStatus, listenerPid } = await mod('src/daemon/instance.ts');
  const { runCommand } = await mod('src/core/console-decode.ts');
  const auto = await mod('src/daemon/autostart.ts');
  const env = { platform: process.platform, runner: runCommand, home, defaultHome: auto.defaultDataHome(), nodePath: process.execPath, binPath: path.join(app, 'bin/pace.ts') };
  let owner;
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const status = cli(['status'], 5000);
    const candidate = readLockInfo(home), detail = readStatus(home);
    if (status.status === 0 && candidate && detail?.state === 'running' && detail.pid === candidate.pid && detail.bootId === candidate.bootId && listenerPid(candidate.port) === candidate.pid) {
      owner = candidate; break;
    }
    await sleep(500);
  }
  const modules = verifyModules();
  const value = auto.registeredRunValue(env);
  const newBoot = Boolean(owner && sha(owner.bootId) !== baseline.oldBootIdSha256 && sha(JSON.stringify(owner)) !== baseline.oldOwnerSha256 && owner.startedAt > baseline.oldInstanceStartedAt);
  const configSame = sha(fs.readFileSync(path.join(home, 'daemon/config.json'))) === baseline.configSha256;
  const secretSame = sha(fs.readFileSync(path.join(home, 'secrets/telegram.json'))) === baseline.secretSha256;
  const launcherExact = fs.existsSync(auto.launcherPath(home)) && fs.readFileSync(auto.launcherPath(home)).equals(auto.buildLauncher(env));
  const registryExact = value !== null && auto.ownsRunValue(home, value);
  const result = { runningAfterHumanRelogon: Boolean(owner), newInstanceSinceBaseline: newBoot, runValueExact: registryExact, launcherExact, operationalConfigUnchanged: configSame, secretUnchanged: secretSame, modules, noManualStartInvokedByVerification: true, consoleHiddenRequiresUserConfirmation: true, approvedFinalRunningMaintained: Boolean(owner), scope: 'Human reports actual sign-out/sign-in separately. This script queries local state only and never starts, stops or registers the daemon.' };
  save('after-relogon-observations.json', result);
  console.log(JSON.stringify({ running: Boolean(owner), newInstance: newBoot, registryExact, launcherExact, configSame, secretSame, humanConsoleConfirmationStillRequired: true }));
  if (!owner || !newBoot || !registryExact || !launcherExact || !configSame || !secretSame) process.exitCode = 1;
} catch {
  console.log(JSON.stringify({ verificationFailed: true, detailsSuppressed: true, noOperationalMutation: true }));
  process.exitCode = 1;
}
