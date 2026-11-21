import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { home, app, sha, mod, evDir, save, verifyModules, cli, sameOwner, sleep, inputs } from './pace-p005-t03-common.mjs';

let stage = 'preflight';
const adoption = process.argv[2] === 'adopt-owned' ? JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'pace-p005-t03-owned-adoption.json'), 'utf8')) : null;
const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'pace-p005-t03-run-'));
fs.writeFileSync(path.join(os.tmpdir(), 'pace-p005-t03-run-root.txt'), root);
const control = { controllerPid: process.pid, deadlineAt: Date.now() + 1800000, owner: null, mode: 'testing' };
const writeControl = () => fs.writeFileSync(path.join(root, 'guard.json'), JSON.stringify(control));
writeControl();
let guardian, sampleTimer, mainTimer, checkChild;
const samples = [];
let sampling = false, sampleErrors = 0, sampleOverlaps = 0;
let currentOwner, initialProcessStart;
try {
  const modules = verifyModules();
  const { acquireInstance, readStatus, readLockInfo, listenerPid } = await mod('src/daemon/instance.ts');
  const { loadConfig, configFile } = await mod('src/daemon/config.ts');
  const { readTelegramSecret } = await mod('src/daemon/telegram/index.ts');
  const { runCommand } = await mod('src/core/console-decode.ts');
  const auto = await mod('src/daemon/autostart.ts');
  const env = { platform: process.platform, runner: runCommand, home, defaultHome: auto.defaultDataHome(), nodePath: process.execPath, binPath: path.join(app, 'bin/pace.ts') };
  const input = inputs(), config = loadConfig(home), secret = readTelegramSecret(home);
  if (!secret || secret.token !== input.token || secret.chatId !== input.chat || JSON.stringify(config.allowedUsers.telegram) !== JSON.stringify(input.users) || config.workspaces.length) throw Error('config-target');
  if (adoption) {
    const live = readLockInfo(home);
    if (!sameOwner(adoption.owner, live) || live.startedAt < adoption.requestedAt || listenerPid(live.port) !== live.pid) throw Error('adoption-identity-mismatch');
    control.owner = live; currentOwner = live; writeControl();
  } else {
    const instance = await acquireInstance(home);
    await instance.release();
  }
  const registryQuery = runCommand('reg', ['query', auto.RUN_KEY, '/v', auto.RUN_VALUE]);
  const registryParent = runCommand('reg', ['query', auto.RUN_KEY]);
  if (registryQuery.status !== 0 && registryParent.status !== 0) throw Error('registry-unverifiable');
  const priorValue = auto.registeredRunValue(env);
  if (priorValue !== null && !auto.ownsRunValue(home, priorValue)) throw Error('registration-conflict');
  if (auto.legacyTaskExists(env)) throw Error('legacy-task-present');
  const launcher = auto.launcherPath(home), expectedLauncher = auto.buildLauncher(env);
  const launcherExisted = fs.existsSync(launcher);
  if (launcherExisted && !fs.readFileSync(launcher).equals(expectedLauncher)) throw Error('launcher-conflict');
  const configHash = sha(fs.readFileSync(configFile(home)));
  const secretHash = sha(fs.readFileSync(path.join(home, 'secrets/telegram.json')));
  guardian = spawn(process.execPath, [path.join(import.meta.dirname, 'pace-p005-t03-guardian.mjs'), root], { detached: true, windowsHide: true, stdio: 'ignore' });
  guardian.unref();
  mainTimer = setTimeout(() => { control.stopRequested = true; writeControl(); }, 1800000);
  mainTimer.unref();
  const getOwner = () => {
    const status = cli(['status']);
    if (status.status !== 0) throw Error('status-not-running');
    const data = JSON.parse(status.stdout), owner = readLockInfo(home);
    if (!data.running || !owner || data.pid !== owner.pid || listenerPid(owner.port) !== owner.pid || readStatus(home)?.state !== 'running') throw Error('owner-unverifiable');
    return owner;
  };
  const claim = owner => { currentOwner = owner; control.owner = owner; writeControl(); };
  const waitForOwner = async () => {
    for (let attempt = 0; attempt < 30; attempt++) {
      try { return getOwner(); } catch {}
      await sleep(500);
    }
    throw Error('owner-ready-deadline');
  };
  stage = 'registration-start';
  const registrationRequestedAt = Date.now();
  const install = cli(['install', '--yes', '--start']);
  if (install.status !== 0) {
    const followup = cli(['status']);
    const late = readLockInfo(home);
    if (followup.status === 0 && late?.startedAt >= registrationRequestedAt && listenerPid(late.port) === late.pid) claim(late);
    save('start-confirmation-failure.json', { installExit: install.status, statusAfterConfirmationWindowExit: followup.status, ownedLateStartObserved: Boolean(control.owner), scope: 'A nonzero start confirmation is not treated as proof that no process started.' });
    throw Error('install-start-failed');
  }
  claim(await waitForOwner());
  if (auto.registeredRunValue(env) === null || !auto.ownsRunValue(home, auto.registeredRunValue(env)) || !fs.readFileSync(launcher).equals(expectedLauncher)) throw Error('registration-mismatch');
  const first = currentOwner;
  stage = 'duplicate';
  const secondStart = cli(['start']);
  if (secondStart.status !== 0 || !sameOwner(first, getOwner())) throw Error('second-start-changed-owner');
  const duplicate = cli(['run'], 15000);
  if (duplicate.status !== 2 || !sameOwner(first, getOwner())) throw Error('duplicate-run-not-blocked');
  stage = 'stop-restart';
  const stopped = cli(['stop'], 45000), stoppedStatus = cli(['status']);
  if (stopped.status !== 0 || stoppedStatus.status !== 3 || readStatus(home)?.state !== 'stopped' || readLockInfo(home) !== null) throw Error('stop-failed');
  const released = await acquireInstance(home); await released.release();
  control.owner = null; writeControl();
  const restarted = cli(['start']);
  if (restarted.status !== 0) {
    const followup = cli(['status']);
    if (followup.status === 0) claim(getOwner());
    save('restart-confirmation-failure.json', { startExit: restarted.status, statusAfterConfirmationWindowExit: followup.status, runningProcessObserved: followup.status === 0 });
    throw Error('restart-failed');
  }
  claim(await waitForOwner());
  if (currentOwner.bootId === first.bootId) throw Error('restart-boot-unchanged');
  save('lifecycle-observations.json', { installExit: install.status, startConfirmed: true, secondStartExit: secondStart.status, secondStartSamePidAndBoot: true, duplicateRunExit: duplicate.status, duplicateOwnerUnchanged: true, stopExit: stopped.status, stoppedStatusExit: stoppedStatus.status, stoppedState: true, lockReleased: true, portReleased: true, restartExit: restarted.status, restartNewBoot: true, runningAfterRestart: true, priorRunValueExisted: priorValue !== null, launcherExistedBefore: launcherExisted, registryOwnedExact: true, launcherMatchesInstalledNodeAndBin: true, launcherUtf16LeBom: expectedLauncher.subarray(0, 2).equals(Buffer.from([255, 254])), configUnchanged: sha(fs.readFileSync(configFile(home))) === configHash, devicePreserved: true, secretUnchangedAtThisCheckpoint: sha(fs.readFileSync(path.join(home, 'secrets/telegram.json'))) === secretHash, modules, realRelogon: 'not yet observed', consoleHiddenAtRelogon: 'not yet observed' });
  console.log(JSON.stringify({ lifecycle: 'passed', automaticStartupRegistered: true, daemonRunning: true, realRelogonPending: true }));
  async function sample(label) {
    if (sampling) { sampleOverlaps++; return; }
    sampling = true;
    try {
      const value = await new Promise((resolve, reject) => {
        const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(import.meta.dirname, 'pace-p005-t03-memory.ps1'), '-DaemonPid', String(currentOwner.pid)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '';
        p.stdout.on('data', data => { out += data; });
        p.on('error', reject);
        const timeout = setTimeout(() => { p.kill(); reject(Error('sample-timeout')); }, 20000);
        p.on('close', code => {
          clearTimeout(timeout);
          try { code === 0 ? resolve(JSON.parse(out)) : reject(Error('sample-failed')); }
          catch { reject(Error('sample-json-failed')); }
        });
      });
      if (!initialProcessStart) initialProcessStart = value.daemonProcessStartedAt;
      const status = readStatus(home);
      const ownerUnchanged = sameOwner(currentOwner, readLockInfo(home));
      samples.push({ label, ...value, ownerUnchanged, daemonStateRunning: status?.state === 'running', heartbeatAgeMs: status ? Date.now() - status.heartbeat : null, sameProcessStart: value.daemonProcessStartedAt === initialProcessStart });
      fs.writeFileSync(path.join(root, 'memory-samples.json'), JSON.stringify(samples));
      if (!value.processFound || !ownerUnchanged || value.daemonProcessStartedAt !== initialProcessStart) {
        control.stopRequested = true; writeControl();
      }
    } catch { sampleErrors++; }
    finally { sampling = false; }
  }
  stage = 'parallel-check';
  await sample('before-check');
  if (!samples.length) throw Error('no-baseline-sample');
  const checkStartedAt = new Date().toISOString();
  sampleTimer = setInterval(() => { sample('during-check'); }, 5000);
  const checkHome = path.join(root, 'check-home'), logPath = path.join(root, 'npm-check.log');
  const fd = fs.openSync(logPath, 'w');
  const npm = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  console.log('Check command: npm run check');
  const checkExit = await new Promise((resolve, reject) => {
    checkChild = spawn(process.execPath, [npm, 'run', 'check'], { windowsHide: true, stdio: ['ignore', fd, fd], env: { ...process.env, PACE_HOME: checkHome } });
    checkChild.on('error', reject);
    checkChild.on('close', resolve);
  });
  const checkEndedAt = new Date().toISOString();
  fs.closeSync(fd); clearInterval(sampleTimer);
  while (sampling) await sleep(100);
  await sample('after-check');
  const log = fs.readFileSync(logPath, 'utf8');
  if (log.includes(input.token)) throw Error('check-output-secret');
  fs.writeFileSync(path.join(evDir(), 'repository-check.log'), log);
  save('repository-check-result.json', { command: 'npm run check', exit: checkExit, checkStartedAt, checkEndedAt, rawSha256: sha(log), totals: log.split('\n').filter(line => /^\u2139 /.test(line)), skipLines: log.split('\n').filter(line => line.startsWith('\uFE63')) });
  const intervals = samples.slice(1).map((s, index) => Date.parse(s.observedAt) - Date.parse(samples[index].observedAt));
  const signalLines = log.split('\n').filter(line => /^FATAL ERROR:|^Error.*(?:out of memory|ENOMEM)|^.*ERR_WORKER_OUT_OF_MEMORY/.test(line));
  const memory = { targetIntervalMs: 5000, checkStartedAt, checkEndedAt, firstSampleAt: samples[0]?.observedAt, lastSampleAt: samples.at(-1)?.observedAt, sampleCount: samples.length, sampleErrors, skippedOverlappingIntervals: sampleOverlaps, minimumObservedAvailablePhysicalKiB: Math.min(...samples.map(s => s.availablePhysicalKiB)), maximumObservedDaemonWorkingSetBytes: Math.max(...samples.map(s => s.daemonWorkingSetBytes ?? 0)), actualMinimumIntervalMs: Math.min(...intervals), actualMaximumIntervalMs: Math.max(...intervals), allSamplesSameDaemon: samples.every(s => s.ownerUnchanged && s.processFound && s.sameProcessStart && s.daemonStateRunning), outputOomSignalCount: signalLines.length, checkExit, workload: 'Existing Codex worktree session plus idle operational Telegram daemon and one repository full check (Windows test concurrency 4). No two live model jobs.', scope: 'Observed samples only; no arbitrary memory threshold, no guarantee of between-sample instantaneous minimum or every system OOM.' };
  save('memory-samples.json', samples); save('memory-summary.json', memory);
  const eventScript = `$eventErrors=@(); $records=@(Get-WinEvent -FilterHashtable @{LogName='System';ProviderName='Microsoft-Windows-Resource-Exhaustion-Detector';StartTime=[datetime]'${checkStartedAt}';EndTime=[datetime]'${checkEndedAt}'} -ErrorAction SilentlyContinue -ErrorVariable eventErrors); $otherErrors=@($eventErrors | Where-Object {$_.FullyQualifiedErrorId -notlike 'NoMatchingEventsFound*'}); [pscustomobject]@{queryAvailable=($otherErrors.Count -eq 0);eventCount=if($otherErrors.Count -eq 0){$records.Count}else{$null};rawEventsRecorded=$false} | ConvertTo-Json -Compress`;
  const eventQuery = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', eventScript], { encoding: 'utf8', timeout: 30000, windowsHide: true });
  let eventObservation = { queryAvailable: false, eventCount: null, rawEventsRecorded: false };
  if (eventQuery.status === 0) { try { eventObservation = JSON.parse(eventQuery.stdout); } catch {} }
  save('system-memory-events.json', { ...eventObservation, checkStartedAt, checkEndedAt, scope: 'Only this provider and check interval; no claim that every system OOM is covered.' });
  stage = 'final-verification';
  if (checkExit !== 0 || !memory.allSamplesSameDaemon || signalLines.length || control.stopRequested) throw Error('parallel-check-failed');
  if (!sameOwner(currentOwner, getOwner())) throw Error('final-owner-changed');
  if (sha(fs.readFileSync(configFile(home))) !== configHash) throw Error('config-changed');
  verifyModules();
  const logs = cli(['logs', '-n', '1000']);
  if (logs.status !== 0) throw Error('logs-failed');
  const secretUnchanged = sha(fs.readFileSync(path.join(home, 'secrets/telegram.json'))) === secretHash;
  if (!secretUnchanged || !auto.ownsRunValue(home, auto.registeredRunValue(env) ?? '') || !fs.readFileSync(launcher).equals(expectedLauncher)) throw Error('final-registration-or-secret-changed');
  save('pre-relogon-final-state.json', { automaticStartupRegistered: true, runValueExact: true, launcherExact: true, normalDaemonRunning: true, sameInstanceThroughoutCheck: true, configUnchanged: true, devicePreserved: true, secretUnchanged, logOutputKnownTokenMatches: 0, realRelogonConfirmed: false, consoleHiddenAfterRelogonConfirmed: false, finalOperationalState: 'registered and running as approved', guardianDisarmedForApprovedFinalRunning: true });
  control.mode = 'final-running'; writeControl(); clearTimeout(mainTimer);
  console.log(JSON.stringify({ fullCheckExit: checkExit, memorySampleCount: memory.sampleCount, observedAvailableKiBMinimum: memory.minimumObservedAvailablePhysicalKiB, daemonMaintained: true, automaticStartupRegistered: true, finalRunning: true, humanRelogonPending: true }));
} catch {
  if (sampleTimer) clearInterval(sampleTimer);
  control.stopRequested = true; writeControl();
  try {
    const { readLockInfo, listenerPid, requestStop } = await mod('src/daemon/instance.ts');
    if (control.owner && sameOwner(readLockInfo(home), control.owner) && listenerPid(control.owner.port) === control.owner.pid) requestStop(home);
  } catch {}
  if (checkChild && checkChild.exitCode === null) checkChild.kill();
  save('execution-failure.json', { stage, detailsSuppressed: true, ownedStopRequested: Boolean(control.owner), automaticRegistrationMayRemainAsApproved: true });
  console.log(JSON.stringify({ failed: true, stage, ownedStopRequested: Boolean(control.owner), detailsSuppressed: true }));
  process.exitCode = 1;
}
