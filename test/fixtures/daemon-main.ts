import { spawn } from "node:child_process";
import { startReaper } from "../../src/agent/process.ts";
import { runDaemon } from "../../src/daemon/index.ts";
import type { Runner } from "../../src/daemon/types.ts";

// 시험용 daemon 진입점 — 가짜 실행자. 프롬프트 "sleep:<ms>"는 실제 자식 프로세스 그룹을 띄우고 pid를 알린다.
const runner: Runner = async (job, ctl) => {
  const m = /^sleep:(\d+)/.exec(job.prompt);
  if (!m) return { status: "done", text: `ok:${job.prompt}`, cleanupUnconfirmed: false };
  const child = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { detached: process.platform !== "win32", stdio: "ignore" });
  ctl.onProcess({ pid: child.pid!, startedAt: Date.now() });
  if (process.platform !== "win32") startReaper(child.pid!, Date.now() + 120_000, 300);
  const end = Date.now() + Number(m[1]);
  await new Promise<void>((resolve) => {
    const t = setInterval(() => { if (Date.now() >= end || ctl.signal.aborted) { clearInterval(t); resolve(); } }, 30);
  });
  try { if (process.platform === "win32") child.kill(); else process.kill(-child.pid!, "SIGKILL"); } catch { /* 이미 없음 */ }
  return { status: ctl.signal.aborted ? "cancelled" : "done", text: "끝", cleanupUnconfirmed: false };
};

const code = await runDaemon({ home: process.env.PACE_HOME!, runner, out: (line) => { process.stderr.write(`${line}\n`); } });
process.exit(code);
