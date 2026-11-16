import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { agentEvent, readEvents, recordEvent, validateEvent } from "../src/project/event-log.ts";
import { collectStats, recordMetric, formatStats } from "../src/project/metrics.ts";
import { collectInsights, refreshProjectMetrics } from "../src/project/metrics-report.ts";
import type { ProjectEvent } from "../src/project/event-log.ts";
import type { Repo, ProjectRef } from "../src/project/harness.ts";
import { runPace, tempDir } from "./helpers.ts";
function fixture() {
  const root = tempDir(); const home = tempDir(); const name = "P001_261024_test"; const dir = join(root, "projects", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "PROJECT.md"), "# P001\n- 상태: 진행\n\n## 태스크\n\n| T | 이름 | 백로그 | 상태 | 커밋 |\n|---|---|---|---|---|\n| T01 | one | — | 완료 | |\n| T02 | two | — | 완료 | |\n\n## 결정·진행 메모\n\n| 날짜 | 내용 |\n|---|---|\n");
  const repo: Repo = { root, mainRoot: root, base: "main", branch: "project/P001", inWorktree: true };
  const ref: ProjectRef = { id: "P001", dir: name, name: "test", branch: repo.branch, worktree: root };
  return { root, home, dir, repo, ref };
}
const at = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();
test("project log: 다른 기록자가 최초 생성한 파일에도 현재 사건을 남긴다", () => {
  const f = fixture();
  const preload = join(tempDir(), "log-race.mjs");
  const log = join(f.dir, "log.jsonl");
  const first = { ts: at(0), p: "P001", type: "note", by: "agent", msg: "first" };
  writeFileSync(preload, `import fs from "node:fs"; import {syncBuiltinESMExports} from "node:module";
const open=fs.openSync, log=${JSON.stringify(log)}; let fired=false;
fs.openSync=function(path, flags, mode) {
  if(process.platform==="win32" && !fired && String(path)===log && (flags & fs.constants.O_EXCL)) {
    fired=true; const fd=open(path,flags,mode); fs.writeFileSync(fd,${JSON.stringify(JSON.stringify(first) + "\n")}); fs.closeSync(fd);
    throw Object.assign(new Error("another writer created the log"),{code:"EEXIST"});
  }
  return open(path,flags,mode);
}; syncBuiltinESMExports();`);
  const script = `import {recordEvent,readEvents} from ${JSON.stringify(new URL("../src/project/event-log.ts", import.meta.url).href)};
const dir=${JSON.stringify(f.dir)}; const ok=recordEvent(dir,{ts:${JSON.stringify(at(1))},p:"P001",type:"note",by:"agent",msg:"second"});
const messages=readEvents(dir).map(e=>e.msg); if(!ok || messages.join(",") !== (process.platform==="win32" ? "first,second" : "second")) throw Error(JSON.stringify({ok,messages}));`;
  const result = spawnSync(process.execPath, [`--import=${pathToFileURL(preload).href}`, "--input-type=module", "-e", script], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
test("project log: 최초 생성 경합 뒤 일반 파일이 아니면 쓰지 않는다", () => {
  const f = fixture();
  const log = join(f.dir, "log.jsonl");
  const preload = join(tempDir(), "log-race-directory.mjs");
  if (process.platform !== "win32") mkdirSync(log);
  writeFileSync(preload, `import fs from "node:fs"; import {syncBuiltinESMExports} from "node:module";
const open=fs.openSync, log=${JSON.stringify(log)}; let fired=false;
fs.openSync=function(path, flags, mode) {
  if(process.platform==="win32" && !fired && String(path)===log && (flags & fs.constants.O_EXCL)) {
    fired=true; fs.mkdirSync(log); throw Object.assign(new Error("directory substituted"),{code:"EEXIST"});
  }
  return open(path,flags,mode);
}; syncBuiltinESMExports();`);
  const script = `import {recordEvent} from ${JSON.stringify(new URL("../src/project/event-log.ts", import.meta.url).href)};
if(recordEvent(${JSON.stringify(f.dir)},{ts:${JSON.stringify(at(1))},p:"P001",type:"note",by:"agent",msg:"second"})) throw Error("directory accepted");`;
  const result = spawnSync(process.execPath, [`--import=${pathToFileURL(preload).href}`, "--input-type=module", "-e", script], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(process.getBuiltinModule("node:fs").lstatSync(log).isDirectory(), true);
});
test("project log: 최초 생성 충돌이 반복되면 제한된 횟수 뒤 실패한다", () => {
  const f = fixture();
  const log = join(f.dir, "log.jsonl");
  const preload = join(tempDir(), "log-race-loop.mjs");
  writeFileSync(preload, `import fs from "node:fs"; import {syncBuiltinESMExports} from "node:module";
const open=fs.openSync, log=${JSON.stringify(log)}; let attempts=0; process.on("exit",()=>console.log(attempts));
fs.openSync=function(path, flags, mode) { if(String(path)===log) { attempts++; throw Object.assign(new Error("collision"),{code:"EEXIST"}); } return open(path,flags,mode); }; syncBuiltinESMExports();`);
  const script = `import {recordEvent} from ${JSON.stringify(new URL("../src/project/event-log.ts", import.meta.url).href)};
if(recordEvent(${JSON.stringify(f.dir)},{ts:${JSON.stringify(at(1))},p:"P001",type:"note",by:"agent",msg:"second"})) throw Error("collision accepted");`;
  const result = spawnSync(process.execPath, [`--import=${pathToFileURL(preload).href}`, "--input-type=module", "-e", script], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stdout.trim(), process.platform === "win32" ? "3" : "1");
});
test("사용자 결정과 기존 루카스 결정 출처를 모두 허용한다", () => {
  const f = fixture();
  for (const src of ["사용자 결정", "루카스 결정"]) assert.doesNotThrow(() => agentEvent(f.dir, { p: "P001", type: "decision", by: "agent", msg: `합성 결정 ${src}`, src }));
});
test("project log: CLI decision/change synchronizes table once and review preserves verdict counts", () => {
  const f = fixture();
  const git = (...args: string[]) => { const r = spawnSync("git", ["-C", f.root, ...args], { encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); };
  git("init", "-q", "-b", "main"); git("config", "user.name", "test"); git("config", "user.email", "test@example.com"); git("add", "."); git("commit", "-qm", "init");
  const log = (...args: string[]) => runPace(["project", "log", "P001", ...args], { home: f.home, cwd: f.root });
  const decision = ["T01", "--type", "decision", "--msg", "로그를 통합한다", "--src", "루카스 결정", "--ref", "PROJECT.md"];
  assert.equal(log(...decision).status, 0); assert.equal(log(...decision).status, 0);
  assert.equal(log("T01", "--type", "change", "--msg", "작업 범위를 갱신한다", "--src", "main 판단").status, 0);
  assert.equal(log("T01", "--type", "review", "--msg", "reviewer fail blocking 2 should_fix 1", "--by", "coordinator").status, 0);
  const events = readEvents(f.dir); assert.equal(events.length, 3);
  assert.deepEqual(events.map((e) => e.type), ["decision", "change", "review"]);
  assert.equal(events[2]!.by, "coordinator"); assert.deepEqual(events[2]!.data, { blocking: 2, should_fix: 1, tester: 0, reviewer: 1, pass: 0, fail: 1 });
  const project = readFileSync(join(f.dir, "PROJECT.md"), "utf8");
  assert.equal((project.match(/로그를 통합한다/g) ?? []).length, 1); assert.match(project, /\(루카스 결정\) T01: 로그를 통합한다/); assert.match(project, /^\| \d{4}-\d{2}-\d{2} \d{2}:\d{2} \| \(루카스 결정\) T01: 로그를 통합한다 \|$/m, "결정 행은 작성일시(분 단위)로 시작한다"); assert.match(project, /\(main 판단\) T01: 작업 범위를 갱신한다/);
  const stats = JSON.parse(runPace(["project", "stats", "P001", "--json"], { home: f.home, cwd: f.root }).stdout);
  assert.deepEqual(stats.eventCounts, { decisions: 1, changes: 1, reviews: 1, questions: 0, answers: 0 });
  assert.equal(stats.tasks[0].eventCounts.reviews, 1);
  assert.equal(collectInsights(f.repo, f.ref).reviews[0]!.blocking, 2);
  const textStats = runPace(["project", "stats", "P001"], { home: f.home, cwd: f.root }).stdout;
  assert.match(textStats, /작업 경과 \| 승인\/질의 대기/);
  assert.match(textStats, /사건 수: 결정 1 · 변경 1 · 리뷰 1/);
  writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), "# close\n");
  refreshProjectMetrics(f.repo, f.ref, { home: f.home, env: {} });
  const rendered = readFileSync(join(f.dir, "METRICS.md"), "utf8");
  assert.match(rendered, /프로젝트 기준 집계/);
  assert.match(rendered, /\| 결정 \/ 변경 \/ 리뷰 사건 \| 1 \/ 1 \/ 1/);
  // A retry repairs the table if the event was durable before a table write failed.
  writeFileSync(join(f.dir, "PROJECT.md"), project.split("\n").filter((line) => !line.includes("로그를 통합한다")).join("\n"));
  assert.equal(log(...decision).status, 0); assert.equal(readEvents(f.dir).length, 3);
  assert.equal((readFileSync(join(f.dir, "PROJECT.md"), "utf8").match(/로그를 통합한다/g) ?? []).length, 1);
});
test("project log: wait intervals union, task scope, unfinished question and merge approval wait", () => {
  const f = fixture();
  const event = (type: ProjectEvent["type"], n: number, t?: string) => recordEvent(f.dir, { ts: at(n), p: "P001", t, type, by: "agent", msg: type });
  recordMetric(f.dir, { ts: at(0), project: "P001", cmd: "start", ok: true });
  recordMetric(f.dir, { ts: at(10), project: "P001", cmd: "task", task: "T01", ok: true });
  event("question", 15, "T01"); event("escalation", 20, "T01"); event("answer", 25, "T01"); event("answer", 30, "T01");
  recordMetric(f.dir, { ts: at(40), project: "P001", cmd: "done", task: "T01", ok: true });
  recordMetric(f.dir, { ts: at(40), project: "P001", cmd: "task", task: "T02", ok: true });
  event("question", 45, "T02");
  recordMetric(f.dir, { ts: at(50), project: "P001", cmd: "done", task: "T02", ok: true });
  recordMetric(f.dir, { ts: at(60), project: "P001", cmd: "finish", ok: true });
  let s = collectStats(f.repo, f.ref, at(80));
  assert.equal(s.project.durationMs, 60000); assert.equal(s.project.questionWaitMs, 30000); // [15,30] union + unfinished [45,60]
  assert.equal(s.project.workMs, 30000); assert.equal(s.project.mergeWaitMs, 20000); assert.equal(s.project.approvalWaitMs, 50000);
  assert.equal(s.tasks[0]!.questionWaitMs, 15000); assert.equal(s.tasks[0]!.workMs, 15000);
  assert.equal(s.tasks[1]!.questionWaitMs, 5000); assert.equal(s.tasks[1]!.workMs, 5000);
  assert.equal(s.contractApprovalWaitMs, null);
  assert.ok(formatStats(s).includes("| P001 | 1.0분 | 기록 없음 | 0 | events | 0.5분 | 0.8분 |"));
  recordMetric(f.dir, { ts: at(70), project: "P001", cmd: "merge", ok: true, data: { approved: 1, commits: 3 } });
  s = collectStats(f.repo, f.ref, at(80)); assert.equal(s.project.mergeWaitMs, 10000);
  const events = readEvents(f.dir); assert.equal(events.filter((e) => e.type === "gate").length, 3);
  assert.equal(events.filter((e) => e.type === "task_done").length, 2);
  assert.equal(s.project.gateFailures, 0);
});
test("project log: rejects secrets, paths, unknown actors/types, nonnumeric data and unstructured reviews", () => {
  const f = fixture(); const base = { p: "P001", type: "note", msg: "safe" };
  const privateMessage = "password" + "=" + "example-lowercase";
  for (const input of [{ ...base, msg: privateMessage }, { ...base, ref: "../outside" }, { ...base, ref: "/outside" }, { ...base, type: "gate" }, { ...base, by: "outsider" }, { ...base, src: "raw detail" }, { ...base, t: "T99" }, { ...base, type: "review", msg: "done" }]) assert.throws(() => agentEvent(f.dir, input));
  assert.deepEqual(readEvents(f.dir), []);
  assert.throws(() => validateEvent({ ts: at(1), p: "P001", type: "note", by: "agent", msg: "safe", data: { value: "raw" } as unknown as Record<string, number> }));
  assert.equal(recordEvent(f.dir, { ts: at(1), p: "P001", type: "note", by: "agent", msg: privateMessage }), false);
  assert.deepEqual(readEvents(f.dir), []);
});
test("project log: symlink write fails without decision table mutation", () => {
  const f = fixture(); const outside = join(tempDir(), "outside"); writeFileSync(outside, "keep"); symlinkSync(outside, join(f.dir, "log.jsonl"));
  const before = readFileSync(join(f.dir, "PROJECT.md"), "utf8");
  const result = agentEvent(f.dir, { p: "P001", type: "decision", msg: "safe" });
  assert.equal(result.recorded, false); assert.equal(readFileSync(outside, "utf8"), "keep"); assert.equal(readFileSync(join(f.dir, "PROJECT.md"), "utf8"), before);
});
test("project log: reopening after finish measures through now until a new finish", () => {
  const f = fixture();
  for (const [cmd, second, task] of [["start", 0], ["finish", 10], ["task", 20, "T01"]] as const) recordMetric(f.dir, { ts: at(second), project: "P001", cmd, task, ok: true });
  const s = collectStats(f.repo, f.ref, at(30));
  assert.equal(s.project.durationMs, 30000); assert.equal(s.project.finish, null); assert.equal(s.project.mergeWaitMs, 0);
});

test("project log: task-scoped reads reject linked or FIFO PROJECT before reading", () => {
  const f = fixture(); const outside = join(tempDir(), "outside.md");
  writeFileSync(outside, "# PRIVATE_DOCUMENT\n");
  const { unlinkSync } = process.getBuiltinModule("node:fs");
  unlinkSync(join(f.dir, "PROJECT.md")); symlinkSync(outside, join(f.dir, "PROJECT.md"));
  assert.throws(() => agentEvent(f.dir, { p: "P001", t: "T01", type: "note", msg: "safe" }), /일반 파일/);
  assert.equal(readFileSync(outside, "utf8"), "# PRIVATE_DOCUMENT\n");
  unlinkSync(join(f.dir, "PROJECT.md"));
  if (process.platform !== "win32") {
    assert.equal(spawnSync("mkfifo", [join(f.dir, "PROJECT.md")]).status, 0);
    const script = `import {agentEvent} from ${JSON.stringify(new URL("../src/project/event-log.ts", import.meta.url).href)}; try { agentEvent(${JSON.stringify(f.dir)}, {p:"P001", t:"T01",type:"note",msg:"safe"}); process.exit(2); } catch {process.exit(0);}`;
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", timeout: 2000 });
    assert.equal(r.status, 0, String(r.error));
  }
});

test("project log: automatic gate logging survives a missing contract", () => {
  const f = fixture(); const { unlinkSync } = process.getBuiltinModule("node:fs"); unlinkSync(join(f.dir, "PROJECT.md"));
  assert.equal(recordEvent(f.dir, { ts: at(1), p: "P001", type: "gate", by: "cli", msg: "check: contract", ok: false, data: { check: 1 } }), true);
  assert.equal(readEvents(f.dir)[0]!.type, "gate");
});
