import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { hostname } from "node:os";

export interface ProcessIdentity { pid: number; started: string; host: string; platform: string }
export type Liveness = "alive" | "dead" | "unknown";
export interface ProcessObservation { state: Liveness; reason: "other-host" | "pid-gone" | "pid-check-unavailable" | "start-query-unavailable" | "same-start" | "different-start" }

export function processIdentity(pid: number): ProcessIdentity | null {
  if (!Number.isSafeInteger(pid) || pid < 1) return null;
  try {
    let started: string;
    if (process.platform === "linux") {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      const ticks = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
      if (!ticks || !/^\d+$/.test(ticks)) return null;
      started = `${readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim()}:${ticks}`;
    } else if (process.platform === "darwin" || process.platform === "freebsd") {
      const r = spawnSync("ps", ["-p", String(pid), "-o", "lstart="], { encoding: "utf8", timeout: 3000, maxBuffer: 4096, env: { ...process.env, LC_ALL: "C", TZ: "UTC" } });
      if (r.status !== 0 || !r.stdout.trim()) return null;
      started = r.stdout.trim();
    } else if (process.platform === "win32") {
      const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().Ticks`], { encoding: "utf8", timeout: 5000, maxBuffer: 4096, windowsHide: true });
      if (r.status !== 0 || !/^\d+$/.test(r.stdout.trim())) return null;
      started = r.stdout.trim();
    } else return null;
    return { pid, started, host: hostname(), platform: process.platform };
  } catch { return null; }
}
export function inspectProcess(owner: ProcessIdentity, probe: { check(pid: number): void; identity(pid: number): ProcessIdentity | null } = { check: (pid) => { process.kill(pid, 0); }, identity: processIdentity }): ProcessObservation {
  if (owner.host !== hostname() || owner.platform !== process.platform) return { state: "unknown", reason: "other-host" };
  try { probe.check(owner.pid); }
  catch (error) { return (error as NodeJS.ErrnoException).code === "ESRCH" ? { state: "dead", reason: "pid-gone" } : { state: "unknown", reason: "pid-check-unavailable" }; }
  const current = probe.identity(owner.pid);
  return !current ? { state: "unknown", reason: "start-query-unavailable" } : current.started === owner.started ? { state: "alive", reason: "same-start" } : { state: "dead", reason: "different-start" };
}
export function observeProcess(owner: ProcessIdentity): Liveness { return inspectProcess(owner).state; }
export function observeGroup(pgid: number, check: (pid: number) => void = (pid) => { process.kill(pid, 0); }): Liveness {
  if (process.platform === "win32" || !Number.isSafeInteger(pgid) || pgid <= 1) return "unknown";
  try { check(-pgid); return "alive"; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "ESRCH" ? "dead" : "unknown"; }
}
