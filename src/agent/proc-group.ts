import { execFile } from "node:child_process";

/** POSIX process group. Windows callers must use the handle-backed Job Object. */
export interface GroupEnv {
  platform: NodeJS.Platform;
  kill(pid: number, signal: NodeJS.Signals | 0): void;
  run(command: string, args: string[]): Promise<{ status: number | null; stdout: string }>;
}

export const defaultGroupEnv: GroupEnv = {
  platform: process.platform,
  kill: (pid, signal) => { process.kill(pid, signal); },
  run: (command, args) => new Promise((resolve) => {
    execFile(command, args, { encoding: "utf8", windowsHide: true, timeout: 15000 }, (error, stdout) => {
      const code = error ? ((error as NodeJS.ErrnoException & { code?: unknown }).code) : 0;
      resolve({ status: typeof code === "number" ? code : error ? 1 : 0, stdout: stdout ?? "" });
    }).unref();
  }),
};

export interface WinProc { pid: number; ppid: number; created: string; }
export function parseProcessTable(text: string): Map<number, WinProc> {
  const table = new Map<number, WinProc>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*$/.exec(line);
    if (m) table.set(Number(m[1]), { pid: Number(m[1]), ppid: Number(m[2]), created: m[3]! });
  }
  return table;
}

export class ProcessGroup {
  readonly root: number;
  private readonly env: GroupEnv;
  constructor(root: number, env: GroupEnv = defaultGroupEnv) { this.root = root; this.env = env; }
  get windows(): boolean { return this.env.platform === "win32"; }
  get cleanup(): "verified" | "best-effort-unverified" { return this.windows ? "best-effort-unverified" : "verified"; }
  get trackingFailed(): boolean { return this.windows; }
  track(): Promise<void> { return Promise.resolve(); }
  startTracking(): void {}
  stopTracking(): void {}
  async alive(): Promise<boolean> {
    if (this.windows) return true; // PID만으로 Windows 트리의 생존을 확정하지 않는다.
    try { this.env.kill(-this.root, 0); return true; }
    catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
  }
  async signal(signal: NodeJS.Signals): Promise<boolean> {
    if (this.windows) return false; // PID 기반 fallback은 무관 프로세스를 종료할 수 있다.
    try { this.env.kill(-this.root, signal); } catch { /* 이미 없음 */ }
    return true;
  }
  async verifyGone(): Promise<boolean> { return this.windows ? false : !(await this.alive()); }
}
