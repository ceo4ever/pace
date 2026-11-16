import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { collectStats, recordMetric, readMetrics, failureReason } from "../src/project/metrics.ts";
import type { ProjectRef, Repo } from "../src/project/harness.ts";
import { tempDir } from "./helpers.ts";
function fixture() {
  const root = tempDir();
  const ref: ProjectRef = { id: "P001", dir: "P001_261024_test", name: "test", branch: "project/P001", worktree: root };
  const repo: Repo = { root, mainRoot: root, base: "main", branch: "project/P001", inWorktree: true };
  const dir = join(root, "projects", ref.dir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "PROJECT.md"), "- 상태: 진행\n| T01 | test | — | 진행 | |\n");
  return { repo, ref, dir };
}
test("metrics: exact intervals, retries, gate counts and malformed lines", () => {
  const { repo, ref, dir } = fixture();
  const record = (cmd: "start" | "task" | "done" | "check" | "finish" | "merge", second: number, ok = true, task?: string) => recordMetric(dir, { ts: new Date(100000 + second * 1000).toISOString(), project: ref.id, cmd, ok, task });
  record("start", 0); record("task", 10, true, "T01"); record("check", 20, false, "T01"); record("done", 30, true, "T01"); record("done", 40, true, "T01"); record("finish", 50); record("merge", 60);
  const stats = collectStats(repo, ref);
  assert.equal(stats.project.durationMs, 50000);
  assert.equal(stats.project.toMergeMs, 60000);
  assert.equal(stats.tasks[0]!.durationMs, 20000);
  assert.equal(stats.tasks[0]!.gateFailures, 1);
  writeFileSync(join(dir, "log.jsonl"), '{broken\n{"ts":"no"}\n');
  assert.deepEqual(readMetrics(dir), []);
});
test("metrics: fixed reasons, failed writes and symlinks never escape", () => {
  const { dir } = fixture();
  const raw = "private argument and /user/path";
  recordMetric(dir, { ts: new Date().toISOString(), project: "P001", cmd: "check", ok: false, reason: raw, task: raw });
  const text = readFileSync(join(dir, "log.jsonl"), "utf8");
  assert.ok(!text.includes(raw));
  assert.equal(JSON.parse(text).msg, "check: command");
  assert.equal(failureReason("TASK-CLOSE missing"), "contract");
  const other = fixture();
  const target = join(tempDir(), "outside"); writeFileSync(target, "keep");
  symlinkSync(target, join(other.dir, "log.jsonl"));
  assert.doesNotThrow(() => recordMetric(other.dir, { ts: new Date().toISOString(), project: "P001", cmd: "check", ok: true }));
  assert.equal(readFileSync(target, "utf8"), "keep");
  assert.deepEqual(readMetrics(other.dir), []);
  const blocked = fixture(); mkdirSync(join(blocked.dir, "log.jsonl"));
  assert.doesNotThrow(() => recordMetric(blocked.dir, { ts: new Date().toISOString(), project: "P001", cmd: "check", ok: true }));
});
test("metrics: old project uses git timestamps and unknown times remain null", () => {
  const { repo, ref, dir } = fixture();
  assert.equal(collectStats(repo, ref).project.durationMs, null);
  const git = (...args: string[]) => { const r = spawnSync("git", ["-C", repo.root, ...args], { encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); };
  git("init", "-q", "-b", "main"); git("config", "user.name", "test"); git("config", "user.email", "test@example.com");
  git("add", "."); git("commit", "-qm", "docs(P001): 定義");
  // The Korean commit marker used by the harness is part of the fallback contract.
  git("commit", "--allow-empty", "-qm", "docs(P001): 정의 — 착수");
  assert.equal(collectStats(repo, ref).project.source, "git");
  assert.ok(collectStats(repo, ref).project.start);
});
test("metrics: CLI boundaries, fixed failure reason, blocked logging preserves gate result", async () => {
  const { runPace } = await import("./helpers.ts");
  const { readdirSync } = await import("node:fs");
  const root = tempDir(); const home = tempDir();
  const git = (...args: string[]) => { const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); };
  git("init", "-q", "-b", "main"); git("config", "user.name", "test"); git("config", "user.email", "test@example.com");
  writeFileSync(join(root, "AGENTS.md"), "# test\n"); git("add", "."); git("commit", "-qm", "init");
  const runCli = (...args: string[]) => runPace(["project", ...args], { home, cwd: root });
  assert.equal(runCli("new", "metrics").status, 0);
  const dir = join(root, "projects", readdirSync(join(root, "projects"))[0]!);
  // Task commands also work for main-direct projects.
  assert.equal(runCli("task", "P001", "first").status, 0);
  assert.equal(runCli("check", "P001", "T01").status, 1);
  assert.equal(runCli("done", "P001", "T01").status, 1);
  let es = readMetrics(dir);
  assert.deepEqual(es.map((e) => [e.cmd, e.ok, e.task]), [["task", true, "T01"], ["check", false, "T01"], ["done", false, "T01"]]);
  assert.equal(es[1]!.reason, "contract");
  assert.ok(es.every((e) => e.project === "P001" && Number.isFinite(Date.parse(e.ts))));
  const target = join(dir, "tasks", readdirSync(join(dir, "tasks"))[0]!);
  writeFileSync(join(target, "TASK.md"), "# T01\n\n## 기준\n| # | 기준 |\n|---|---|\n| T-1 | ready |\n");
  writeFileSync(join(target, "TASK-CLOSE.md"), "- 태스크: T01 · 판정: 통과\n## 기준 대조\n| # | 결과 | 증거 |\n|---|---|---|\n| T-1 | 통과 | test |\n## 단위 테스트\npass\n## E2E\n해당 없음\n## 리뷰\nblocking 0\n## 남긴 것\n없음\n");
  assert.equal(runCli("check", "P001", "T01").status, 0);
  assert.equal(runCli("done", "P001", "T01").status, 0);
  assert.deepEqual(readMetrics(dir).slice(-2).map((e) => [e.cmd, e.ok]), [["check", true], ["done", true]]);
  assert.match(runCli("stats", "P001").stdout, /러닝 시간[\s\S]*T01/);
  git("add", "."); git("commit", "-qm", "feat(P001/T01): first");
  const { unlinkSync } = await import("node:fs"); unlinkSync(join(dir, "log.jsonl"));
  const old = JSON.parse(runCli("stats", "P001", "--json").stdout);
  assert.equal(old.tasks[0].source, "git");
  assert.ok(old.tasks[0].done); assert.equal(old.tasks[0].durationMs, 0);
  mkdirSync(join(dir, "log.jsonl"));
  const blocked = runCli("check", "P001", "T01");
  assert.equal(blocked.status, 0, blocked.stdout + blocked.stderr);
  assert.match(blocked.stderr, /지표.*기록 실패/);
});

test("metrics: dangling symlink does not create outside target", () => {
  const { dir } = fixture(); const target = join(tempDir(), "missing");
  symlinkSync(target, join(dir, "log.jsonl"));
  recordMetric(dir, { ts: new Date().toISOString(), project: "P001", cmd: "check", ok: true });
  assert.throws(() => readFileSync(target));
});

test("metrics: FIFO recording returns instead of blocking", () => {
  if (process.platform === "win32") return;
  const { dir } = fixture();
  assert.equal(spawnSync("mkfifo", [join(dir, "log.jsonl")]).status, 0);
  const script = `import {recordMetric} from ${JSON.stringify(new URL("../src/project/metrics.ts", import.meta.url).href)}; recordMetric(${JSON.stringify(dir)}, {ts:new Date().toISOString(),project:"P001",cmd:"check",ok:true});`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", timeout: 2000 });
  assert.equal(r.status, 0, String(r.error));
  assert.match(r.stderr, /지표.*기록 실패/);
});
test("metrics: git fallback uses first task commit through last, project finish through merge", () => {
  const { repo, ref, dir } = fixture();
  const git = (date: string, ...args: string[]) => { const r = spawnSync("git", ["-C", repo.root, ...args], { encoding: "utf8", env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: "2026-02-01T00:00:00.000Z" } }); assert.equal(r.status, 0, r.stderr); };
  const at = (seconds: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, seconds)).toISOString();
  git(at(0), "init", "-q", "-b", "main"); git(at(0), "config", "user.name", "test"); git(at(0), "config", "user.email", "test@example.com");
  writeFileSync(join(dir, "PROJECT.md"), "- 상태: 완료\n| T01 | test | — | 완료 | |\n");
  git(at(0), "add", "."); git(at(0), "commit", "-qm", "docs(P001): 정의 — 착수");
  git(at(10), "commit", "--allow-empty", "-qm", "feat(P001/T01): first");
  git(at(40), "commit", "--allow-empty", "-qm", "feat(P001/T01): last");
  git(at(50), "commit", "--allow-empty", "-qm", "chore(P001): 마감");
  git(at(70), "commit", "--allow-empty", "-qm", "chore(P001): 병합 완료");
  const stats = collectStats(repo, ref, at(100));
  assert.equal(stats.tasks[0]!.durationMs, 30000);
  assert.equal(stats.project.durationMs, 50000);
  assert.equal(stats.project.toMergeMs, 70000);
});
