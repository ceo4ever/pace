import fs from 'node:fs';
import path from 'node:path';
import { home, mod, sameOwner } from './pace-p005-t03-common.mjs';
const root = fs.realpathSync.native(process.argv[2]);
if (!path.basename(root).startsWith('pace-p005-t03-run-')) process.exit(2);
const { readLockInfo, listenerPid, requestStop } = await mod('src/daemon/instance.ts');
let stoppingAt = 0;
const timer = setInterval(() => {
  try {
    const control = JSON.parse(fs.readFileSync(path.join(root, 'guard.json'), 'utf8'));
    if (control.mode === 'final-running' || control.mode === 'finished') {
      clearInterval(timer);
      process.exit(0);
    }
    let parentAlive = true;
    try { process.kill(control.controllerPid, 0); } catch { parentAlive = false; }
    if (parentAlive && Date.now() < control.deadlineAt && !control.stopRequested) return;
    const owner = control.owner;
    if (!owner || !sameOwner(readLockInfo(home), owner)) {
      if (!parentAlive || Date.now() > control.deadlineAt) process.exit(0);
      return;
    }
    if (listenerPid(owner.port) !== owner.pid) return;
    if (!stoppingAt) {
      requestStop(home);
      stoppingAt = Date.now();
      fs.writeFileSync(path.join(root, 'guardian-result.json'), JSON.stringify({ ownedStopRequested: true }));
    } else if (Date.now() - stoppingAt > 35000 && sameOwner(readLockInfo(home), owner) && listenerPid(owner.port) === owner.pid) {
      process.kill(owner.pid, 'SIGTERM');
      fs.writeFileSync(path.join(root, 'guardian-result.json'), JSON.stringify({ ownedStopRequested: true, ownedSignalSent: true }));
      process.exit(1);
    }
  } catch {
    // Do not act on unknown ownership or malformed state.
  }
}, 1000);
