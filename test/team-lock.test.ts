import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, linkSync, mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runPace, sessionFreeEnv, spawnTestChild, tempDir } from "./helpers.ts";
import { ResourceLock, type ResourceLease } from "../src/team/resource-lock.ts";
import { parseResources, loadResource, resourceHash } from "../src/team/resources.ts";
import { inspectProcess, processIdentity, observeProcess, observeGroup, type Liveness } from "../src/team/resource-process.ts";
import { packageRoot } from "../src/core/paths.ts";
import { retryResourceGuard } from "../src/team/resource-cli.ts";

function fixture() {
  const root = tempDir("pace-resource-"), home = tempDir("pace-resource-home-");
  assert.equal(spawnSync("git", ["init", "-q", root]).status, 0);
  mkdirSync(join(root, ".pace/team"), { recursive: true });
  writeFileSync(join(root, ".pace/team/resources.md"), "# 공유 자원\n\n```json\n" + JSON.stringify({ version: 1, resources: [{ name: "studio", capacity: 1, scope: "repo", description: "시험용 단일 자원", probe: [process.execPath, "-e", "process.exit(0)"] }] }) + "\n```\n");
  return { root, home, run: (...args: string[]) => runPace(args, { cwd: root, home }) };
}
function writeResource(root: string, patch: Record<string, unknown> = {}) {
  const resource = { name: "studio", capacity: 1, scope: "repo", description: "시험용 단일 자원", probe: [process.execPath, "-e", "process.exit(0)"], ...patch };
  mkdirSync(join(root, ".pace/team"), { recursive: true });
  writeFileSync(join(root, ".pace/team/resources.md"), "# 자원\n```json\n" + JSON.stringify({ version: 1, resources: [resource] }) + "\n```\n");
}
const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
async function waitFor(predicate: () => boolean, ms = 5000) {
  const deadline = Date.now() + ms;
  while (!predicate() && Date.now() < deadline) await pause(20);
  assert.ok(predicate(), "실제 프로세스 관측 기한");
}

test("자원 메타파일은 역할이 아니며 상태 CLI는 아직 잠기지 않은 자원을 표시한다", () => {
  const f = fixture();
  assert.equal(f.run("team", "new", "maker", "--role", "maker").status, 0);
  const list = f.run("team", "list");
  assert.equal(list.status, 0, list.stderr);
  assert.match(list.stdout, /maker/);
  assert.doesNotMatch(list.stdout, /resources/);
  const status = f.run("team", "status", "studio");
  assert.equal(status.status, 0, status.stderr);
  const report = JSON.parse(status.stdout);
  assert.equal(report.active, false);
  assert.equal(report.scope, "repo");
  assert.equal(f.run("team", "sync").status, 0);
  assert.equal(f.run("team", "new", "resources", "--role", "maker").status, 2);
});

test("자원 JSON은 범위·동시1·argv·중복·모르는 키·크기·비밀 후보를 거부한다", () => {
  const base = { name: "studio", capacity: 1, scope: "repo", description: "공유" };
  const text = (resources: unknown, extra = {}) => "```json\n" + JSON.stringify({ version: 1, resources, ...extra }) + "\n```\n";
  assert.equal(parseResources(text([base]))[0]!.scope, "repo");
  for (const patch of [{ name: "../outside" }, { capacity: 2 }, { scope: "else" }, { probe: [] }, { probe: ["x", "\n"] }, { probe: "shell command" }, { typo: true }]) assert.throws(() => parseResources(text([{ ...base, ...patch }])));
  assert.throws(() => parseResources(text([base, base])));
  assert.throws(() => parseResources(text([base], { other: true })));
  assert.throws(() => parseResources("x".repeat(65537)));
  assert.throws(() => parseResources(text([base]) + text([base])));
  const resource = parseResources(text([base]))[0]!;
  assert.equal(resourceHash(resource), resourceHash({ ...resource, description: "설명만 변경" }));
});

test("소유자/자원 상태 행렬: stale heartbeat도 살아 있으면 거부하고 dead+free만 회수한다", () => {
  for (const owner of ["alive", "dead", "unknown"] as const) for (const use of ["free", "busy", "unknown"] as const) {
    const f = fixture(); let observed: Liveness = "alive", tick = 100;
    const lock = new ResourceLock(f.root, "studio", { home: f.home, process: () => observed, probe: () => use, now: () => tick });
    // Initial acquisition has a separate known-free observation.
    const setup = new ResourceLock(f.root, "studio", { home: f.home, process: () => "alive", probe: () => "free", now: () => tick });
    const initial = setup.acquire("P009"); assert.equal(initial.code, 0);
    tick += 1_000_000; observed = owner;
    const result = lock.acquire("P010");
    assert.equal(result.outcome, owner === "dead" && use === "free" ? "acquired" : owner === "alive" ? "busy" : "hold", `${owner}/${use}`);
    if (result.code === 0) assert.notEqual(result.lease!.acquisitionId, initial.lease!.acquisitionId);
    else assert.equal(JSON.parse(readFileSync(join(lock.stateDir, lock.stateName), "utf8")).acquisitionId, initial.lease!.acquisitionId);
  }
});

test("토큰 fencing: 구 토큰 해제·갱신은 새 획득을 바꾸지 않는다", () => {
  const f = fixture(); let owner: Liveness = "alive", now = 100;
  const lock = new ResourceLock(f.root, "studio", { home: f.home, process: () => owner, probe: () => "free", now: () => now });
  const first = lock.acquire("P009").lease!;
  now = 200; assert.equal(lock.renew(first.acquisitionId).code, 0);
  assert.equal(lock.status().lease!.heartbeat, 200);
  owner = "dead";
  const second = lock.acquire("P010").lease!;
  const bytes = readFileSync(join(lock.stateDir, lock.stateName), "utf8");
  assert.equal(lock.release(first.acquisitionId).code, 2);
  assert.equal(lock.renew(first.acquisitionId).code, 2);
  assert.equal(readFileSync(join(lock.stateDir, lock.stateName), "utf8"), bytes);
  assert.notEqual(first.acquisitionId, second.acquisitionId);
});

test("자기 갱신은 일시적 외부 시작 조회 실패로 작업을 중단하지 않고 감사 파일을 매번 늘리지 않는다", () => {
  const f = fixture(), self = processIdentity(process.pid)!;
  let tick = 100, observations = 0;
  const lock = new ResourceLock(f.root, "studio", { home: f.home, self: () => self, process: () => { observations++; return "unknown"; }, now: () => tick });
  const lease = lock.acquire("P009").lease!;
  const auditCount = readdirSync(join(lock.stateDir, "audit")).length;
  for (let i = 0; i < 20; i++) { tick += 5000; assert.equal(lock.renew(lease.acquisitionId).code, 0); }
  assert.equal(observations, 0, "자기 식별에 ps 재조회 없음");
  assert.equal(readdirSync(join(lock.stateDir, "audit")).length, auditCount);
  assert.equal(lock.status().lease!.heartbeat, tick);
  assert.deepEqual(inspectProcess(self, { check() {}, identity: () => null }), { state: "unknown", reason: "start-query-unavailable" });
  assert.deepEqual(inspectProcess(self, { check() { throw Object.assign(new Error("unavailable"), { code: "EPERM" }); }, identity: () => self }), { state: "unknown", reason: "pid-check-unavailable" });
});

test("살아 있는 소유자의 status는 probe를 실행하지 않고 짧은 guard 경합만 유한 재시도한다", async () => {
  const f = fixture(); let probes = 0;
  const lock = new ResourceLock(f.root, "studio", { home: f.home, process: () => "alive", probe: () => { probes++; return "free"; } });
  lock.acquire("P009"); const count = probes;
  assert.equal(lock.status().probeSkipped, true); assert.equal(probes, count);
  const g = fixture(), next = new ResourceLock(g.root, "studio", { home: g.home });
  const guard = join(next.machineDir, "studio.registry.guard"); mkdirSync(guard);
  setTimeout(() => rmdirSync(guard), 100);
  assert.equal((await retryResourceGuard(() => next.acquire("P010"), 1000)).code, 0);
  mkdirSync(guard);
  try { const held = await retryResourceGuard(() => next.release("wrong"), 50); assert.equal(held.code, 2); assert.equal(held.guardBusy, true); }
  finally { rmdirSync(guard); }
});

test("started 그룹은 모든 해제 경로에서 종료 확인하고 pre-start도 자원 확인은 생략하지 않는다", () => {
  const f = fixture(); let owner: Liveness = "alive", group: Liveness = "alive", use: "free" | "busy" | "unknown" = "free";
  const self = processIdentity(process.pid)!;
  const lock = new ResourceLock(f.root, "studio", { home: f.home, process: () => owner, group: () => group, probe: () => use });
  const lease = lock.acquire("P009").lease!;
  assert.equal(lock.started(lease.acquisitionId, { ...self, pid: self.pid + 100 }).code, 0);
  assert.equal(lock.release(lease.acquisitionId, { internal: true }).code, 2, "정상 자식 종료+손자 생존도 해제 금지");
  owner = "dead";
  assert.equal(lock.acquire("P010").code, 1, "래퍼 종료+그룹 생존");
  group = "unknown"; assert.equal(lock.acquire("P010").code, 2);
  group = "dead"; use = "busy"; assert.equal(lock.release(lease.acquisitionId).code, 2);
  use = "unknown"; assert.equal(lock.release(lease.acquisitionId).code, 2);
  use = "free"; assert.equal(lock.release(lease.acquisitionId).code, 0);
  owner = "alive"; const next = lock.acquire("P009").lease!;
  owner = "dead"; use = "unknown"; assert.equal(lock.acquire("P010").code, 2, "pre-start도 미사용 확인 필수");
  assert.equal(lock.release(next.acquisitionId, { confirmation: { by: "coordinator", evidence: "시험용 확인기로 사용 종료 대조" } }).code, 0);
});

test("확인기 없는 정상 완료와 전경 모드는 종료 후 근거 있는 수동 확인까지 잠금을 보존한다", () => {
  const f = fixture(); writeResource(f.root, { probe: undefined });
  let owner: Liveness = "alive";
  const lock = new ResourceLock(f.root, "studio", { home: f.home, process: () => owner, probe: () => "unknown" });
  const first = lock.acquire("P009", "manual").lease!;
  assert.equal(lock.release(first.acquisitionId, { internal: true }).code, 2);
  assert.equal(lock.release(first.acquisitionId, { confirmation: { by: "owner", evidence: "자원 미사용 확인" } }).code, 2, "수동 확인도 살아 있는 소유자는 우회하지 못함");
  owner = "dead";
  assert.equal(lock.acquire("P010").code, 2);
  assert.equal(lock.release(first.acquisitionId, { confirmation: { by: "owner", evidence: "시험용 자원 연결 없음 직접 확인" } }).code, 0);
  const logs = readdirSync(join(lock.stateDir, "audit")).map((p) => JSON.parse(readFileSync(join(lock.stateDir, "audit", p), "utf8")));
  assert.equal(logs.filter((x) => x.action === "release")[0]!.confirmation.by, "owner");
});

test("repo scope는 두 worktree 공통 위치, machine은 다른 저장소까지 공유하고 scope 불일치는 보류한다", () => {
  const f = fixture(), other = fixture();
  const git = (...args: string[]) => spawnSync("git", ["-C", f.root, ...args], { encoding: "utf8" });
  assert.equal(git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-qm", "fixture").status, 0);
  const worktree = join(tempDir(), "other");
  assert.equal(git("worktree", "add", "-qb", "other", worktree).status, 0);
  writeResource(worktree);
  const one = new ResourceLock(f.root, "studio", { home: f.home }), two = new ResourceLock(worktree, "studio", { home: f.home });
  assert.equal(one.stateDir, two.stateDir);
  const initial = one.acquire("P009"); assert.equal(initial.code, 0);
  assert.equal(two.acquire("P010").code, 1);
  assert.notEqual(new ResourceLock(other.root, "studio", { home: f.home }).stateDir, one.stateDir);
  writeResource(worktree, { scope: "machine" });
  assert.equal(new ResourceLock(worktree, "studio", { home: f.home }).acquire("P010").code, 2);
  const a = fixture(), b = fixture(); writeResource(a.root, { scope: "machine" }); writeResource(b.root, { scope: "machine" });
  const ma = new ResourceLock(a.root, "studio", { home: a.home }), mb = new ResourceLock(b.root, "studio", { home: a.home });
  assert.equal(ma.stateDir, mb.stateDir);
  assert.equal(ma.acquire("P009").code, 0);
  assert.equal(mb.acquire("P010").code, 1);
  writeResource(b.root, { scope: "repo" });
  assert.equal(new ResourceLock(b.root, "studio", { home: a.home }).acquire("P010").code, 2);
});

test("선언 지문 불일치는 released 상태에서도 막고 설명만 바꾸면 유지한다", () => {
  const f = fixture();
  const lock = new ResourceLock(f.root, "studio", { home: f.home });
  const first = lock.acquire("P009").lease!;
  assert.equal(lock.release(first.acquisitionId, { internal: true }).code, 0);
  writeResource(f.root, { description: "설명만 수정" });
  assert.equal(new ResourceLock(f.root, "studio", { home: f.home }).status().code, 0);
  writeResource(f.root, { probe: [process.execPath, "-e", "process.exit(1)"] });
  assert.equal(new ResourceLock(f.root, "studio", { home: f.home }).acquire("P010").code, 2);
});

test("운영자 승인 뒤의 재등록 절차는 참여자 중단·free·released 확인과 기존 근거 보관을 거친다", () => {
  const f = fixture(), lock = new ResourceLock(f.root, "studio", { home: f.home });
  const initial = lock.acquire("P009").lease!;
  assert.equal(lock.release(initial.acquisitionId, { internal: true }).code, 0);
  assert.equal(lock.status().active, false);
  // Simulate an authorized operator using only this test's isolated files. No product force API.
  renameSync(join(lock.repoDir, "studio.binding.json"), join(lock.repoDir, "studio.binding.archived.json"));
  renameSync(join(lock.stateDir, lock.stateName), join(lock.stateDir, "studio.archived.json"));
  writeResource(f.root, { probe: [process.execPath, "-e", "process.exitCode=0"] });
  const next = new ResourceLock(f.root, "studio", { home: f.home }).acquire("P010");
  assert.equal(next.code, 0);
  assert.notEqual(next.lease!.definition, initial.definition);
  assert.equal(JSON.parse(readFileSync(join(lock.stateDir, "studio.archived.json"), "utf8")).active, false);
});

test("손상 상태·PGID 0/1·링크·hardlink·중단 guard·감사 실패는 보류하고 바깥 파일을 바꾸지 않는다", () => {
  for (const damage of ["json", "group0", "group1", "link", "hardlink", "guard", "audit"] as const) {
    const f = fixture(); const lock = new ResourceLock(f.root, "studio", { home: f.home });
    const initial = lock.acquire("P009").lease!, path = join(lock.stateDir, lock.stateName), outside = join(f.home, "outside");
    const sentinel = JSON.stringify(initial); writeFileSync(outside, sentinel);
    if (damage === "json") writeFileSync(path, "{broken");
    if (damage.startsWith("group")) writeFileSync(path, JSON.stringify({ ...initial, phase: "started", child: { identity: initial.owner, group: damage === "group0" ? 0 : 1 } }));
    if (damage === "link" || damage === "hardlink") { unlinkSync(path); if (damage === "link") symlinkSync(outside, path); else linkSync(outside, path); }
    if (damage === "guard") mkdirSync(join(lock.repoDir, "studio.guard"));
    if (damage === "audit") {
      const audit = join(lock.stateDir, "audit");
      for (const file of readdirSync(audit)) unlinkSync(join(audit, file));
      rmdirSync(audit); writeFileSync(audit, "cannot append audit here");
    }
    let held = false;
    try { held = lock.release(initial.acquisitionId, { internal: true }).code === 2; } catch { held = true; }
    assert.ok(held, damage);
    assert.equal(readFileSync(outside, "utf8"), sentinel);
    if (damage === "audit") {
      assert.equal(JSON.parse(readFileSync(path, "utf8")).active, true);
      assert.equal(existsSync(join(lock.repoDir, "studio.guard")), true, "감사 실패는 guard를 남겨 실행을 막는다");
    }
  }
});

test("실제 래퍼는 명령을 START 기록 후 실행하고 자동 갱신하며 다른 worktree 요청을 거부한다", { skip: process.platform === "win32" ? "POSIX process group 실제 시험" : false }, async () => {
  const f = fixture(), ready = join(f.root, "ready"), done = join(f.root, "done");
  assert.equal(spawnSync("git", ["-C", f.root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-qm", "fixture"]).status, 0);
  const otherWorktree = join(tempDir(), "other");
  assert.equal(spawnSync("git", ["-C", f.root, "worktree", "add", "-qb", "other", otherWorktree]).status, 0);
  writeResource(otherWorktree);
  const env = { ...sessionFreeEnv(), PACE_HOME: f.home };
  const child = spawnTestChild(process.execPath, [join(packageRoot, "bin/pace.ts"), "team", "lock", "studio", "--by", "P009", "--", process.execPath, "-e", `require("fs").writeFileSync(${JSON.stringify(ready)},"yes");setTimeout(()=>require("fs").writeFileSync(${JSON.stringify(done)},"done"),5700)`], { cwd: f.root, env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = ""; child.stdout!.on("data", (x) => { stdout += x; }); child.stderr!.on("data", (x) => { stderr += x; });
  const ended = new Promise<number | null>((resolveExit) => child.once("exit", resolveExit));
  const lock = new ResourceLock(f.root, "studio", { home: f.home });
  await waitFor(() => existsSync(ready));
  const first = lock.status().lease!; assert.equal(first.phase, "started"); assert.ok(first.child);
  const events = readdirSync(join(lock.stateDir, "audit")).map((p) => JSON.parse(readFileSync(join(lock.stateDir, "audit", p), "utf8")));
  assert.ok(events.some((e) => e.action === "started-before-START"));
  assert.equal(runPace(["team", "lock", "studio", "--by", "P010", "--", process.execPath, "-e", "process.exit(99)"], { cwd: otherWorktree, home: f.home }).status, 1);
  await waitFor(() => JSON.parse(readFileSync(join(lock.stateDir, lock.stateName), "utf8")).heartbeat > first.heartbeat, 6500);
  assert.equal(await ended, 0, stderr + stdout);
  assert.equal(existsSync(done), true);
  assert.equal(lock.status().active, false);
  assert.match(stdout, /completed/);
});

test("OS 시작 식별은 TZ 변경에 안정적이고 PID 재사용·외부 호스트·잘못된 그룹은 보수적으로 구별한다", () => {
  const self = processIdentity(process.pid)!;
  assert.ok(self);
  assert.equal(observeProcess(self), "alive");
  assert.equal(observeProcess({ ...self, started: `${self.started}-other` }), "dead");
  assert.equal(observeProcess({ ...self, host: "a-different-host.invalid" }), "unknown");
  assert.equal(observeGroup(0), "unknown"); assert.equal(observeGroup(1), "unknown"); assert.equal(observeGroup(-1), "unknown");
  if (process.platform !== "win32") {
    for (const [code, expected] of [["ESRCH", "dead"], ["EPERM", "unknown"], ["EINVAL", "unknown"]]) {
      assert.equal(observeGroup(99999, () => { throw Object.assign(new Error("query failed"), { code }); }), expected);
    }
    assert.equal(observeGroup(99999, (pid) => { assert.equal(pid, -99999); }), "alive");
  }
  const previous = process.env.TZ;
  try { process.env.TZ = "Pacific/Honolulu"; assert.equal(processIdentity(process.pid)!.started, self.started); }
  finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});

test("실제 probe exit0/1/기타·실행 실패를 분리하고 알려진 역할의 미선언 자원 실행은 막는다", () => {
  const f = fixture();
  assert.equal(f.run("team", "new", "maker", "--role", "maker").status, 0);
  assert.equal(f.run("team", "lock", "studio", "--by", "maker", "--", process.execPath, "-e", "process.exit(99)").status, 2);
  for (const probe of [[process.execPath, "-e", "process.exit(1)"], [process.execPath, "-e", "process.exit(7)"], [join(f.root, "no-executable")]]) {
    const g = fixture(); writeResource(g.root, { probe });
    assert.equal(g.run("team", "lock", "studio", "--by", "P009", "--", process.execPath, "-e", "process.exit(99)").status, 2);
    assert.equal(existsSync(join(new ResourceLock(g.root, "studio", { home: g.home }).stateDir, "studio.json")), false);
  }
  const ok = f.run("team", "lock", "studio", "--by", "P009", "--", process.execPath, "-e", "process.exit(7)");
  if (process.platform === "win32") { assert.equal(ok.status, 2); return; }
  assert.equal(ok.status, 1, ok.stderr + ok.stdout);
  const result = JSON.parse(ok.stdout.trim().split("\n").at(-1)!);
  assert.equal(result.outcome, "child_failed"); assert.equal(result.childExitCode, 7);
});

test("실제 래퍼 SIGKILL 때 자식 생존은 보류하고 그룹 종료+free 뒤 CLI 회수한다", { skip: process.platform === "win32" ? "POSIX process group 실제 시험" : false }, async () => {
  const f = fixture(), ready = join(f.root, "ready");
  const wrapper = spawnTestChild(process.execPath, [join(packageRoot, "bin/pace.ts"), "team", "lock", "studio", "--by", "P009", "--", process.execPath, "-e", `require("fs").writeFileSync(${JSON.stringify(ready)},"yes");setInterval(()=>{},1000)`], { cwd: f.root, env: { ...sessionFreeEnv(), PACE_HOME: f.home }, stdio: "ignore" });
  const lock = new ResourceLock(f.root, "studio", { home: f.home });
  await waitFor(() => existsSync(ready));
  const lease = lock.status().lease!, group = lease.child!.group;
  try {
    const ended = new Promise<void>((done) => wrapper.once("exit", () => done())); wrapper.kill("SIGKILL"); await ended;
    assert.equal(observeGroup(group), "alive");
    assert.equal(lock.acquire("P010").code, 1);
    assert.equal(lock.release(lease.acquisitionId).code, 2);
  } finally { try { process.kill(-group, "SIGKILL"); } catch { /* only this test-created group */ } }
  await waitFor(() => observeGroup(group) === "dead");
  const recovered = join(f.root, "recovered-after-dead-owner");
  const next = f.run("team", "lock", "studio", "--by", "P010", "--", process.execPath, "-e", `require('fs').writeFileSync(${JSON.stringify(recovered)},'recovered')`);
  assert.equal(next.status, 0, next.stderr + next.stdout);
  assert.equal(existsSync(recovered), true);
  const audits = readdirSync(join(lock.stateDir, "audit")).map((p) => JSON.parse(readFileSync(join(lock.stateDir, "audit", p), "utf8")));
  assert.ok(audits.some((row) => row.action === "reclaim" && row.acquisitionId === lease.acquisitionId), "실제 종료·그룹 부재·free 후 CLI 회수 감사");
});

test("실제 자식 정상 종료+손자 생존+free probe도 정상 해제하지 않는다", { skip: process.platform === "win32" ? "POSIX process group 실제 시험" : false }, () => {
  const f = fixture(), descendant = join(f.root, "descendant");
  const script = `const c=require("child_process").spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});require("fs").writeFileSync(${JSON.stringify(descendant)},String(c.pid));c.unref()`;
  const result = f.run("team", "lock", "studio", "--by", "P009", "--", process.execPath, "-e", script);
  const lock = new ResourceLock(f.root, "studio", { home: f.home });
  const lease = JSON.parse(readFileSync(join(lock.stateDir, lock.stateName), "utf8")) as ResourceLease;
  try {
    assert.equal(result.status, 2, result.stderr + result.stdout);
    assert.equal(lease.active, true);
    assert.equal(observeGroup(lease.child!.group), "alive");
    assert.equal(lock.acquire("P010").code, 1);
  } finally { try { process.kill(-lease.child!.group, "SIGKILL"); } catch { /* only this test-created group */ } }
});

test("실제 SIGHUP은 자기 그룹으로 전달하고 무시하는 자식이 남으면 잠금을 보존한다", { skip: process.platform === "win32" ? "POSIX SIGHUP/process group 시험" : false }, async () => {
  for (const ignore of [false, true]) {
    const f = fixture(), ready = join(f.root, "ready");
    const script = `${ignore ? "process.on('SIGHUP',()=>{});" : ""}require('fs').writeFileSync(${JSON.stringify(ready)},'ready');setInterval(()=>{},1000)`;
    const wrapper = spawnTestChild(process.execPath, [join(packageRoot, "bin/pace.ts"), "team", "lock", "studio", "--by", "P009", "--", process.execPath, "-e", script], { cwd: f.root, env: { ...sessionFreeEnv(), PACE_HOME: f.home }, stdio: "ignore" });
    const lock = new ResourceLock(f.root, "studio", { home: f.home });
    await waitFor(() => existsSync(ready));
    const initial = lock.status().lease!, group = initial.child!.group;
    try {
      const exited = new Promise<number | null>((done) => wrapper.once("exit", done));
      wrapper.kill("SIGHUP"); const code = await exited;
      const lease = JSON.parse(readFileSync(join(lock.stateDir, lock.stateName), "utf8")) as ResourceLease;
      assert.equal(code, ignore ? 2 : 1);
      assert.equal(lease.active, ignore);
      if (ignore) assert.equal(observeGroup(group), "alive");
    } finally { try { process.kill(-group, "SIGKILL"); } catch { /* only the group this test created */ } }
  }
});

test("실제 START 재시도 중 SIGTERM이 오면 사용자 명령을 보내지 않고 잠금을 보존한다", { skip: process.platform === "win32" ? "POSIX bridge 중단 시험" : false }, async () => {
  const f = fixture(), ready = join(f.root, "retry-ready"), forbidden = join(f.root, "must-not-run");
  const source = `const {ResourceLock}=await import(${JSON.stringify(join(packageRoot, "src/team/resource-lock.ts"))});const {runResourceCommand}=await import(${JSON.stringify(join(packageRoot, "src/team/resource-cli.ts"))});const fs=await import('node:fs');const lock=new ResourceLock(process.cwd(),'studio');const original=lock.started.bind(lock);let calls=0;lock.started=(...args)=>{if(calls++<20){fs.writeFileSync(${JSON.stringify(ready)},'ready');return {outcome:'hold',reason:'controlled guard contention',code:2,scope:'repo',guardBusy:true,participation:'test fixture'}}return original(...args)};process.exitCode=await runResourceCommand(lock,'P009',[process.execPath,'-e',${JSON.stringify(`require('fs').writeFileSync(${JSON.stringify(forbidden)},'bad')`)}])`;
  const wrapper = spawnTestChild(process.execPath, ["--input-type=module", "-e", source], { cwd: f.root, env: { ...sessionFreeEnv(), PACE_HOME: f.home }, stdio: "ignore" });
  const exited = new Promise<number | null>((done) => wrapper.once("exit", done));
  await waitFor(() => existsSync(ready));
  wrapper.kill("SIGTERM");
  assert.equal(await exited, 2);
  assert.equal(existsSync(forbidden), false);
  const lock = new ResourceLock(f.root, "studio", { home: f.home });
  assert.equal(lock.status().active, true);
});
