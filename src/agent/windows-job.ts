import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer, type Server, type Socket } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveWindowsCommand } from './win-command.ts';

export interface WindowsJob {
  child: ChildProcessWithoutNullStreams;
  cleanup: 'best-effort-unverified';
  signal(signal: NodeJS.Signals): Promise<boolean>;
  alive(): Promise<boolean>;
  verifyGone(): Promise<boolean>;
  stopTracking(): void;
}

/** 독립 감시자 생성 여부를 실기 테스트에서 확인한다. */
export const windowsJobStats: { lastPid: number | null; lastChild: ChildProcessWithoutNullStreams | null } = { lastPid: null, lastChild: null };

/** 잡이 없는 에이전트는 실행하지 않는다. 명령·환경은 인증된 로컬 채널로만 보낸다. */
export async function startWindowsJob(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, deadline: number): Promise<WindowsJob> {
  if (!Number.isFinite(deadline) || deadline <= 0) throw new Error('감시 시간은 양수여야 한다');
  // libuv의 Windows spawn은 생략된 시스템 변수를 부모에서 보완한다. 직접 CreateProcess할 때도 같은 계약을 유지한다.
  const effectiveEnv: NodeJS.ProcessEnv = {};
  const names = new Set<string>();
  for (const key of Object.keys(env).sort()) {
    if (!names.has(key.toUpperCase()) && env[key] !== undefined) {
      names.add(key.toUpperCase()); effectiveEnv[key] = env[key];
    }
  }
  for (const key of ['HOMEDRIVE', 'HOMEPATH', 'LOGONSERVER', 'SYSTEMDRIVE', 'SYSTEMROOT', 'TEMP', 'USERDOMAIN', 'USERNAME', 'USERPROFILE', 'WINDIR']) {
    if (!Object.keys(effectiveEnv).some(k => k.toUpperCase() === key)) {
      const parentKey = Object.keys(process.env).find(k => k.toUpperCase() === key);
      if (parentKey && process.env[parentKey] !== undefined) effectiveEnv[key] = process.env[parentKey];
    }
  }
  const target = resolveWindowsCommand(command, args, effectiveEnv);
  const nonce = randomBytes(32).toString('hex');
  let server: Server, socket: Socket | undefined, child: ChildProcessWithoutNullStreams | undefined;
  const peers = new Set<Socket>();
  let ready = false, completed = false, reaped = false, stopSent = false;
  let finishDone!: (value: boolean) => void;
  const done = new Promise<boolean>(resolve => { finishDone = resolve; });
  let startupResolve!: () => void, startupReject!: (error: Error) => void;
  const startup = new Promise<void>((resolve, reject) => { startupResolve = resolve; startupReject = reject; });
  const fail = (reason: string) => {
    if (!ready) startupReject(new Error(`윈도우 감시자 준비 실패: ${reason}. PowerShell 실행 정책과 제한 언어 모드를 확인하고, 공식 Windows 환경에서 다시 시도한다.`));
    if (ready && !completed) {
      if (socket && !socket.destroyed) socket.write('STOP\n');
      for (const peer of peers) peer.destroy();
      if (server.listening) server.close();
      if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
    if (!completed) { completed = true; finishDone(false); }
  };
  server = createServer((peer) => {
    let buffer = '', authenticated = false;
    peers.add(peer);
    const authDeadline = setTimeout(() => { if (!authenticated) peer.destroy(); }, 2000);
    peer.on('error', () => { if (authenticated) fail('제어 채널 오류'); });
    peer.on('close', () => { clearTimeout(authDeadline); peers.delete(peer); if (authenticated && !completed) fail('제어 채널이 끊겼다'); });
    peer.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      if (buffer.length > 65536) { peer.destroy(); return; }
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, ''); buffer = buffer.slice(newline + 1);
        if (!authenticated) {
          if (line !== nonce || socket) { peer.destroy(); return; }
          authenticated = true; socket = peer; clearTimeout(authDeadline);
          if (!child?.pid) { fail('감시자 신원을 확인할 수 없다'); peer.destroy(); return; }
          peer.write(JSON.stringify({ parent: process.pid, supervisor: child.pid, command: target.command, args: target.args, cwd, env: effectiveEnv, deadline }) + '\n');
        } else if (line === 'READY' && !ready) {
          ready = true; peer.write('START\n'); startupResolve();
        } else if (line.startsWith('ERROR:')) {
          fail(line.slice(6));
        } else {
          const match = /^DONE:(\d+):([01])$/.exec(line);
          if (match && !completed) { completed = true; reaped = match[2] === '1'; finishDone(reaped); }
        }
      }
    });
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') { server.close(); throw new Error('로컬 감시자 제어 주소가 없다'); }
  const port = String(address.port);
  const root = process.env.SystemRoot ?? process.env.SYSTEMROOT;
  if (!root) { server.close(); throw new Error('Windows 시스템 경로가 없다. 공식 Windows 환경을 확인한다.'); }
  const ps = join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const supervisor = fileURLToPath(new URL('./windows-supervisor.ts', import.meta.url));
  try {
    child = spawn(process.execPath, [supervisor, port], {
      cwd: root, detached: true, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PACE_JOB_TOKEN: nonce, PACE_JOB_POWERSHELL: ps },
    });
    windowsJobStats.lastPid = child.pid ?? null;
    windowsJobStats.lastChild = child;
    let startupStderr = Buffer.alloc(0);
    const captureStartupError = (chunk: Buffer) => { if (startupStderr.length < 4096) startupStderr = Buffer.concat([startupStderr, chunk]).subarray(0, 4096); };
    child.stderr.on('data', captureStartupError);
    child.on('error', error => fail(error.message));
    child.on('close', () => {
      if (windowsJobStats.lastChild === child) windowsJobStats.lastChild = null;
      if (!completed) setTimeout(() => {
        if (!completed) {
          let detail = startupStderr.toString('utf8');
          if (detail.includes('\uFFFD')) {
            try { detail = new TextDecoder('euc-kr').decode(startupStderr); } catch { /* UTF-8 원문을 유지하고 준비 실패를 보고한다. */ }
          }
          fail(`감시자가 결과 없이 종료됐다 ${detail.trim()}`);
        }
      }, 500).unref();
    });
    const timeout = setTimeout(() => fail('감시자 연결 또는 준비 시간 초과'), 15000);
    try { await startup; } finally { clearTimeout(timeout); child.stderr.off('data', captureStartupError); }
    const watched = child;
    return {
      child: watched,
      cleanup: 'best-effort-unverified',
      async signal() {
        if (completed) return reaped;
        if (!socket || socket.destroyed) {
          if (watched.exitCode === null && watched.signalCode === null) watched.kill('SIGKILL');
          return false;
        }
        if (!stopSent) { stopSent = true; socket.write('STOP\n'); }
        return true;
      },
      async alive() { return !completed && watched.exitCode === null && watched.signalCode === null; },
      async verifyGone() { return completed ? reaped : await Promise.race([done, new Promise<boolean>(resolve => setTimeout(() => resolve(false), 5000))]); },
      stopTracking() {
        if (!completed && socket && !socket.destroyed) socket.write('STOP\n');
        for (const peer of peers) peer.destroy();
        if (server.listening) server.close();
      },
    };
  } catch (error) {
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    for (const peer of peers) peer.destroy(); if (server.listening) server.close(); throw error;
  }
}
