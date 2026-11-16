import test from "node:test";
import assert from "node:assert/strict";
import { ProcessGroup, type GroupEnv } from "../src/agent/proc-group.ts";
import { reapGroup } from "../src/agent/process.ts";

type Row = [ppid: number, created: number];

test("회수 확인 사이에 자손이 끝나면 최종 상태를 다시 확인한다", async () => {
  let checks = 0;
  let stopped = false;
  const group = {
    async verifyGone() { return ++checks > 1; },
    async alive() { return false; },
    async signal() { throw new Error("이미 끝난 프로세스에 신호를 보내면 안 된다"); },
    stopTracking() { stopped = true; },
  };
  assert.equal(await reapGroup(group), true);
  assert.equal(checks, 2);
  assert.equal(stopped, true);
});

test("이미 회수됐으면 신호 없이 추적을 끝낸다", async () => {
  let stopped = false;
  const group = {
    async verifyGone() { return true; },
    async alive() { throw new Error("불필요한 생존 확인"); },
    async signal() { throw new Error("불필요한 신호"); },
    stopTracking() { stopped = true; },
  };
  assert.equal(await reapGroup(group), true);
  assert.equal(stopped, true);
});

test("살아 있는 자손은 종료하고 최종 회수를 확인한다", async () => {
  let checks = 0;
  let aliveChecks = 0;
  const signals: string[] = [];
  const group = {
    async verifyGone() { return ++checks > 1; },
    async alive() { return ++aliveChecks === 1; },
    async signal(signal: NodeJS.Signals) { signals.push(signal); return true; },
    stopTracking() {},
  };
  assert.equal(await reapGroup(group), true);
  assert.deepEqual(signals, ["SIGKILL"]);
  assert.equal(checks, 2);
});

test("POSIX: 그룹 신호와 존재 확인은 음수 pid로", async () => {
  const sent: [number, unknown][] = [];
  const env: GroupEnv = { platform: "linux", kill: (pid, sig) => { sent.push([pid, sig]); if (sig === 0) throw Object.assign(new Error("x"), { code: "ESRCH" }); }, run: async () => ({ status: 0, stdout: "" }) };
  const g = new ProcessGroup(500, env);
  assert.equal(await g.alive(), false);
  assert.equal(await g.signal("SIGTERM"), true);
  assert.deepEqual(sent, [[-500, 0], [-500, "SIGTERM"]]);
  assert.equal(await g.verifyGone(), true);
});


test("Windows PID 전용 fallback은 조회·종료 없이 안전하게 실패한다", async () => {
  let calls = 0;
  const env: GroupEnv = { platform: "win32", kill() { calls++; }, async run() { calls++; return { status: 0, stdout: "" }; } };
  const group = new ProcessGroup(123, env);
  await group.track(); group.startTracking(); group.stopTracking();
  assert.equal(await group.signal("SIGKILL"), false);
  assert.equal(await group.verifyGone(), false);
  assert.equal(group.cleanup, "best-effort-unverified");
  assert.equal(calls, 0);
});