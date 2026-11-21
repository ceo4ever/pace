import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { home, sha, mod, evDir, save, verifyModules, sameOwner, cli } from './pace-p005-t03-common.mjs';
try {
  const root = fs.readFileSync(path.join(os.tmpdir(), 'pace-p005-t03-run-root.txt'), 'utf8');
  const control = JSON.parse(fs.readFileSync(path.join(root, 'guard.json'), 'utf8'));
  const check = JSON.parse(fs.readFileSync(path.join(evDir(), 'repository-check-result.json'), 'utf8'));
  if (control.mode !== 'final-running' || check.exit !== 0) throw Error('not-ready-for-human-relogon');
  const { readLockInfo, readStatus, listenerPid } = await mod('src/daemon/instance.ts');
  const owner = readLockInfo(home), status = readStatus(home);
  if (!sameOwner(owner, control.owner) || status?.state !== 'running' || cli(['status']).status !== 0 || listenerPid(owner.port) !== owner.pid) throw Error('current-owner-unverified');
  const modules = verifyModules();
  save('human-relogon-baseline.json', {
    recordedAt: new Date().toISOString(),
    oldBootIdSha256: sha(owner.bootId), oldOwnerSha256: sha(JSON.stringify(owner)), oldInstanceStartedAt: owner.startedAt,
    configSha256: sha(fs.readFileSync(path.join(home, 'daemon/config.json'))),
    secretSha256: sha(fs.readFileSync(path.join(home, 'secrets/telegram.json'))),
    parallelCheckCompleted: true, parallelCheckExit: check.exit, checkLogSha256: check.rawSha256,
    testGuardianDisarmedForFinalRunning: true, normalDaemonRunning: true, modules,
    scope: 'Pre-sign-out baseline only; human sign-out/sign-in and console observation are still pending.',
  });
  console.log(JSON.stringify({ readyForHumanRelogon: true, running: true, fullCheckPassed: true, noSignOutPerformed: true }));
} catch {
  console.log(JSON.stringify({ readyForHumanRelogon: false, detailsSuppressed: true, noOperationalMutation: true }));
  process.exitCode = 1;
}
