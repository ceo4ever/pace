import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { join } from "node:path";
import { writeFileAtomic } from "../core/fsutil.ts";

// 기기당 daemon 하나 — OS가 소유권을 보유하는 loopback 인스턴스 포트(프로세스가 죽으면 OS가 해제, 인계 경합·오래된 잠금 없음).
// 포트는 정규화한 PACE_HOME의 해시 고정값이라 상태 저장소와 소유권 자원이 항상 1:1이다(재정의 없음).

export class InstanceBusyError extends Error {
  readonly pid: number | null;
  constructor(message: string, pid: number | null) { super(message); this.pid = pid; }
}

export function daemonDir(home: string): string { return join(home, "daemon"); }

export function normalizeHome(home: string): string {
  mkdirSync(home, { recursive: true });
  const real = realpathSync.native(home);
  return process.platform === "win32" ? real.replace(/\//g, "\\").toLowerCase() : real;
}

/** 인스턴스 포트 후보 — 해시 고정값(k=0)이 기본이고, OS가 쓰지 못하게 막은 포트(Windows 제외 범위의 EACCES)면 다음 후보(997칸 떨어진 포트 — 제외 범위는 수십~백 포트가 이어진다)를 쓴다 */
export function instancePortCandidate(home: string, k = 0): number {
  const digest = createHash("sha256").update(normalizeHome(home)).digest();
  return 49152 + ((digest.readUInt32BE(0) + k * 997) % 16000);
}

export const PORT_CANDIDATES = 8;

export function instancePort(home: string): number {
  return instancePortCandidate(home, 0);
}

/** 실행 중 daemon이 잡은 포트(정보 파일에 기록) — 없으면 기본 후보 */
export function activeInstancePort(home: string): number {
  const info = readLockInfo(home);
  return info?.port ?? instancePort(home);
}

export interface LockInfo { pid: number; startedAt: number; bootId: string; port?: number }

export function lockFile(home: string): string { return join(daemonDir(home), "daemon.lock"); }
export function statusFile(home: string): string { return join(daemonDir(home), "status.json"); }
export function stopRequestFile(home: string): string { return join(daemonDir(home), "stop-request"); }
export function logFile(home: string): string { return join(daemonDir(home), "daemon.log"); }

export function readLockInfo(home: string): LockInfo | null {
  try { return JSON.parse(readFileSync(lockFile(home), "utf8")) as LockInfo; } catch { return null; }
}

export interface Instance { port: number; release(): Promise<void> }

/** 인스턴스 포트를 잡는다. 이미 쓰는 쪽이 있으면(응답 없는 daemon 포함) 인계 없이 InstanceBusyError */
export async function acquireInstance(home: string): Promise<Instance> {
  for (let k = 0; ; k++) {
    const port = instancePortCandidate(home, k);
    const server: Server = createServer((socket) => socket.destroy());
    const outcome = await new Promise<"ok" | "denied">((resolve, reject) => {
      server.once("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "EADDRINUSE") {
          const info = readLockInfo(home);
          reject(new InstanceBusyError(`이미 실행 중인 daemon이 있다(인스턴스 포트 ${port}${info ? `, pid ${info.pid}` : ""}). 응답이 없으면 \`pace daemon stop --force\`로 정리한다`, info?.pid ?? null));
        } else if (error.code === "EACCES" && k + 1 < PORT_CANDIDATES) resolve("denied"); // OS가 막은 포트(Windows 제외 범위) — 같은 순서로 다음 후보. 모든 호출이 같은 순서라 소유권 판정은 그대로다
        else reject(error);
      });
      server.listen({ port, host: "127.0.0.1", exclusive: true }, () => resolve("ok"));
    });
    if (outcome === "ok") return { port, release: () => new Promise<void>((resolve) => { server.close(() => resolve()); }) };
  }
}

export function writeLockInfo(home: string, info: LockInfo): void { writeFileAtomic(lockFile(home), JSON.stringify(info)); }
export function removeLockInfo(home: string, bootId: string): void {
  const info = readLockInfo(home);
  if (info && info.bootId === bootId) rmSync(lockFile(home), { force: true });
}

export interface DaemonStatus { pid: number; bootId: string; startedAt: number; heartbeat: number; device: string; gatewayPort: number; running: number; queued: number; quarantined: number; state: "running" | "stopping" | "stopped" }

export function writeStatus(home: string, status: DaemonStatus): void { writeFileAtomic(statusFile(home), JSON.stringify(status)); }
export function readStatus(home: string): DaemonStatus | null {
  try { return JSON.parse(readFileSync(statusFile(home), "utf8")) as DaemonStatus; } catch { return null; }
}

export function requestStop(home: string): void { writeFileAtomic(stopRequestFile(home), JSON.stringify({ drain: true, at: Date.now() })); }
export function stopRequested(home: string): boolean { return existsSync(stopRequestFile(home)); }
export function clearStopRequest(home: string): void { rmSync(stopRequestFile(home), { force: true }); }

/** 로그 한 줄 — 이벤트 종류·ID·상태만. 프롬프트·응답 본문·토큰은 쓰지 않는다 */
export function makeLogger(home: string): (event: string, fields?: Record<string, unknown>) => void {
  mkdirSync(daemonDir(home), { recursive: true });
  const file = logFile(home);
  return (event, fields = {}) => {
    const safe = Object.entries(fields).map(([k, v]) => `${k}=${typeof v === "string" ? v.replace(/\s+/g, "_").slice(0, 120) : String(v)}`).join(" ");
    try {
      if (existsSync(file) && statSync(file).size > 5 * 1024 * 1024) rmSync(file, { force: true });
      appendFileSync(file, `${new Date().toISOString()} ${event}${safe ? ` ${safe}` : ""}\n`);
    } catch { /* 로그 실패가 daemon을 멈추지 않는다 */ }
  };
}

export function readLogTail(home: string, lines: number): string {
  try { return readFileSync(logFile(home), "utf8").split("\n").filter((l) => l !== "").slice(-lines).join("\n"); } catch { return ""; }
}

/** 포트를 실제로 잡고 있는 프로세스 pid를 OS 도구로 조회한다 — 못 하면 null */
export function listenerPid(port: number): number | null {
  try {
    if (process.platform === "win32") {
      const out = execFileSync("netstat", ["-ano", "-p", "TCP"], { encoding: "utf8", timeout: 10_000, windowsHide: true });
      for (const line of out.split(/\r?\n/)) {
        const m = new RegExp(`^\\s*TCP\\s+127\\.0\\.0\\.1:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)`, "i").exec(line);
        if (m) return Number(m[1]);
      }
      return null;
    }
    try {
      const out = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8", timeout: 10_000 });
      const pid = Number(out.split("\n")[0]);
      if (Number.isInteger(pid) && pid > 0) return pid;
    } catch { /* lsof 없음 → ss */ }
    const out = execFileSync("ss", ["-ltnpH", `sport = :${port}`], { encoding: "utf8", timeout: 10_000 });
    const m = /pid=(\d+)/.exec(out);
    return m ? Number(m[1]) : null;
  } catch { return null; }
}
