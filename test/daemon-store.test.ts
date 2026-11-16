import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DaemonConfigError, parseConfig } from "../src/daemon/config.ts";
import { ensureGatewayToken } from "../src/daemon/gateway.ts";
import { runDaemon } from "../src/daemon/index.ts";
import { StateError, StateStore } from "../src/daemon/store.ts";
import { daemonCommand } from "../src/daemon/cli.ts";
import { tempDir } from "./helpers.ts";

test("S-15 상태는 원자적으로 저장되고 임시 파일이 남지 않는다", () => {
  const home = tempDir();
  const store = StateStore.open(home);
  store.state.seen["a:b:c"] = 1;
  store.save();
  assert.ok(!readdirSync(join(home, "daemon")).some((f) => f.endsWith(".tmp")));
  assert.equal(StateStore.open(home).state.seen["a:b:c"], 1);
});

test("S-15 손상·잘못된 상태 파일은 기동을 거부하고 보존한다(빈 상태로 시작하지 않음)", async () => {
  const home = tempDir();
  StateStore.open(home).save();
  writeFileSync(join(home, "daemon", "state.json"), "{손상");
  assert.throws(() => StateStore.open(home), StateError);
  assert.ok(readdirSync(join(home, "daemon")).some((f) => f.includes(".corrupt-")));
  const home2 = tempDir();
  StateStore.open(home2).save();
  writeFileSync(join(home2, "daemon", "state.json"), JSON.stringify({ version: 1, tasks: { x: { id: "y" } }, conversations: {}, approvals: {}, seen: {}, quarantine: {}, outbox: [] }));
  assert.throws(() => StateStore.open(home2), /작업 x/);
  // runDaemon은 종료 코드 2로 거부한다
  const home3 = tempDir();
  StateStore.open(home3).save();
  writeFileSync(join(home3, "daemon", "state.json"), "{손상");
  const lines: string[] = [];
  assert.equal(await runDaemon({ home: home3, out: (l) => lines.push(l), noSignals: true }), 2);
  assert.match(lines.join("\n"), /손상 파일을 .*보존/);
  // 재기동만으로는 빈 상태로 시작하지 않는다(표식이 남아 있다)
  const again: string[] = [];
  assert.equal(await runDaemon({ home: home3, out: (l) => again.push(l), noSignals: true }), 2);
  assert.match(again.join("\n"), /손상이 감지돼 기동을 거부/);
  assert.throws(() => { rmSync(join(home3, "daemon", "state.corrupt")); StateStore.open(home3); }, /손상이 감지돼/, "표식만 지워도 보존 파일이 남아 있으면 계속 거부");
  for (const f of readdirSync(join(home3, "daemon"))) if (f.startsWith("state") && f !== "state.json") rmSync(join(home3, "daemon", f));
  assert.equal(StateStore.open(home3).state.version, 1, "운영자가 보존 파일과 표식을 정리한 뒤에만 새로 시작");
});

test("S-15 설정 검증: 알 수 없는 키·쓰기 기본값·rerun·중복 이름 거부", () => {
  assert.throws(() => parseConfig({ nope: 1 }), DaemonConfigError);
  assert.throws(() => parseConfig({ defaultAccess: "write" }), /read-only만/);
  assert.throws(() => parseConfig({ rerunInterruptedReadOnly: true }), /지원하지 않는다/);
  assert.throws(() => parseConfig({ maxConcurrent: 0 }), DaemonConfigError);
  assert.throws(() => parseConfig({ workspaces: [{ name: "a", path: "/x" }, { name: "a", path: "/y" }] }), /중복/);
  assert.throws(() => parseConfig({ workspaces: [{ name: "a", path: "상대" }] }), /절대 경로/);
  assert.throws(() => parseConfig({ gateway: { port: 1, token: "x" } }), /port/);
  const ok = parseConfig({ device: "box", maxConcurrent: 3, workspaces: [{ name: "a", path: process.platform === "win32" ? "C:\\x" : "/x", worktrees: { w1: process.platform === "win32" ? "C:\\y" : "/y" } }], allowedUsers: { telegram: ["1"] } });
  assert.equal(ok.defaultAccess, "read-only");
  assert.deepEqual(Object.keys(ok.workspaces[0]!.worktrees), ["main", "w1"]);
});

test("게이트웨이 토큰은 랜덤으로 만들어 재사용하고 로그·상태에 쓰지 않는다", () => {
  const home = tempDir();
  const t1 = ensureGatewayToken(home);
  assert.match(t1, /^[0-9a-f]{64}$/);
  assert.equal(ensureGatewayToken(home), t1);
  if (process.platform !== "win32") assert.equal(statSync(join(home, "secrets", "gateway-token")).mode & 0o077, 0);
});

test("install 계획 함수는 경로를 따옴표·XML 이스케이프한다", async () => {
  const { buildAutostartPlan } = await import("../src/daemon/autostart.ts");
  const runner = () => ({ status: 0, stdout: "", stderr: "" });
  const plan = buildAutostartPlan({ platform: "darwin", runner, nodePath: "/n&n/node", binPath: "/b<b>/pace.ts", home: "/h\"h", defaultHome: "/home/x/.pace", launchAgentsDir: "/la" });
  const content = String(plan.files[0]!.content);
  assert.match(content, /&amp;/);
  assert.match(content, /&lt;b&gt;/);
  assert.doesNotMatch(content, /<b>/);
});

test("기존 Gateway 토큰 파일이 비었거나 형식이 틀리면 거부한다(빈 토큰 인증 불가)", async () => {
  const home = tempDir();
  mkdirSync(join(home, "secrets"), { recursive: true });
  for (const bad of ["", "   ", "short", "z".repeat(64)]) {
    writeFileSync(join(home, "secrets", "gateway-token"), bad);
    assert.throws(() => ensureGatewayToken(home), /올바르지 않다/);
  }
  writeFileSync(join(home, "secrets", "gateway-token"), "ab".repeat(32));
  assert.equal(ensureGatewayToken(home), "ab".repeat(32));
  writeFileSync(join(home, "secrets", "gateway-token"), "");
  const lines: string[] = [];
  const code = await runDaemon({ home, out: (l) => lines.push(l), noSignals: true }).catch((e: Error) => { lines.push(e.message); return 2; });
  assert.equal(code, 2);
  assert.match(lines.join(" "), /올바르지 않다/);
});

test("offline release는 인스턴스 소유 구간 안에서만 상태를 고친다(소유를 못 잡으면 상태 파일을 직접 고치지 않는다)", async () => {
  const home = tempDir();
  const store = StateStore.open(home);
  const path = process.platform === "win32" ? "C:\\x" : "/x";
  const key = process.platform === "win32" ? "c:\\x" : "/x";
  store.state.quarantine[key] = { key, worktree: path, since: 1, reason: "t", taskId: "t1" };
  store.save();
  const { acquireInstance } = await import("../src/daemon/instance.ts");
  const held = await acquireInstance(home);
  const prev = process.env.PACE_HOME;
  process.env.PACE_HOME = home;
  try {
    const lines: string[] = [];
    const code = await daemonCommand(["release", path], { out: (l) => lines.push(l) });
    assert.notEqual(code, 0);
    assert.equal(StateStore.open(home).state.quarantine[key]?.taskId, "t1", "상태 파일은 그대로");
  } finally { if (prev === undefined) delete process.env.PACE_HOME; else process.env.PACE_HOME = prev; await held.release(); }
  // 소유를 잡을 수 있으면(daemon 없음) 해제된다
  process.env.PACE_HOME = home;
  try {
    const lines: string[] = [];
    assert.equal(await daemonCommand(["release", path], { out: (l) => lines.push(l) }), 0);
    assert.equal(StateStore.open(home).state.quarantine[key], undefined);
  } finally { if (prev === undefined) delete process.env.PACE_HOME; else process.env.PACE_HOME = prev; }
});

test("손상 표식 쓰기 전에 죽어 보존 파일만 남은 상태도 기동을 거부한다", () => {
  const home = tempDir();
  StateStore.open(home).save();
  rmSync(join(home, "daemon", "state.json"));
  writeFileSync(join(home, "daemon", "state.json.corrupt-123"), "{손상");
  assert.throws(() => StateStore.open(home), /손상이 감지돼 기동을 거부/);
  assert.ok(existsSync(join(home, "daemon", "state.corrupt")), "표식을 복원한다");
  assert.throws(() => StateStore.open(home), /손상이 감지돼/);
});
