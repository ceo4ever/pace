import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { collectProjectStats, formatProjectStats } from "../src/project/tokens.ts";
import type { ProjectRef, Repo } from "../src/project/harness.ts";
import { recordMetric } from "../src/project/metrics.ts";
import { tempDir } from "./helpers.ts";
function write(file: string, data: string): void { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, data); }
const at = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();
function fixture() {
  const home = tempDir(); const root = tempDir(); const dir = join(root, "projects", "P001_261024_test");
  write(join(dir, "PROJECT.md"), "# P001\n- 상태: 완료\n| T01 | one | — | 완료 | |\n| T02 | two | — | 완료 | |\n");
  const repo: Repo = { root, mainRoot: root, base: "main", branch: "project/P001", inWorktree: true };
  const ref: ProjectRef = { id: "P001", dir: "P001_261024_test", name: "test", branch: repo.branch, worktree: root };
  for (const [cmd, time, task] of [["start", 0], ["task", 10, "T01"], ["done", 30, "T01"], ["task", 30, "T02"], ["done", 50, "T02"], ["finish", 60]] as const) recordMetric(dir, { ts: at(time), project: "P001", cmd, task, ok: true });
  return { home, root, dir, repo, ref, collect: () => collectProjectStats(repo, ref, { home, env: {}, now: at(70) }) };
}
const jsonl = (rows: unknown[]) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
const tool = (stats: ReturnType<typeof collectProjectStats>, name: string, task?: number) => (task === undefined ? stats.tokens : stats.taskTokens[task]!.tokens).find((t) => t.tool === name)!;
test("tokens: Claude main/subagent, streaming duplicates, cwd filtering and time boundaries", () => {
  const f = fixture(); const project = join(f.home, ".claude_personal", "projects", f.root.replace(/[^a-zA-Z0-9]/g, "-"));
  const row = (id: string, time: number, output: number, cwd = f.root) => ({ cwd, timestamp: at(time), message: { id, usage: { input_tokens: 10, cache_read_input_tokens: 20, cache_creation_input_tokens: 30, output_tokens: output } } });
  write(join(project, "main.jsonl"), jsonl([row("m0", 10, 1), row("m1", 20, 2), row("m1", 20, 5), row("other", 22, 999, "/other"), row("m3", 61, 999)]));
  write(join(project, "main", "subagents", "agent.jsonl"), jsonl([row("m2", 30, 7)]));
  write(join(project, "copy.jsonl"), jsonl([row("m1", 20, 5)]));
  const stats = f.collect();
  assert.equal(tool(stats, "Claude Code").usage.output, 13);
  assert.deepEqual(tool(stats, "Claude Code", 0).usage, { input: 20, cachedInput: 40, cacheCreationInput: 60, output: 12, reasoningOutput: 0, tool: 0 });
  assert.equal(tool(stats, "Claude Code", 1).status, "missing");
});
test("tokens: Codex final cumulative subtraction, decreases never restart billing, session dedup and other cwd", () => {
  const f = fixture();
  const meta = (cwd: string, id = "session") => ({ type: "session_meta", payload: { cwd, id } });
  const row = (n: number, input: number, output: number) => ({ timestamp: at(n), type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: input, cached_input_tokens: input / 2, output_tokens: output, reasoning_output_tokens: output / 2 } } } });
  const rows = [meta(f.root), row(5, 100, 10), row(10, 120, 20), row(20, 180, 40), row(30, 200, 50), row(40, 10, 2), row(50, 30, 6), row(65, 1000, 100)];
  write(join(f.home, ".codex", "sessions", "one.jsonl"), jsonl(rows));
  write(join(f.home, ".codex_work", "sessions", "copy.jsonl"), jsonl(rows));
  write(join(f.home, ".codex", "sessions", "other.jsonl"), jsonl([meta("/other", "other"), row(20, 99999, 100)]));
  const stats = f.collect();
  assert.equal(tool(stats, "Codex").usage.input, 30);
  assert.equal(tool(stats, "Codex", 0).usage.input, 100);
  assert.equal(tool(stats, "Codex", 0).usage.output, 40);
  assert.equal(tool(stats, "Codex", 1).usage.input, 0);
  assert.equal(tool(stats, "Codex", 1).usage.output, 0);
  assert.equal(tool(stats, "Codex", 0).usage.cachedInput, 50);
});
test("tokens: Orca Codex home and explicit CODEX_HOME are discovered once", () => {
  const f = fixture(); const runtime = join(f.home, "Library", "Application Support", "orca", "codex-runtime-home", "home");
  write(join(runtime, "sessions", "one.jsonl"), jsonl([{ type: "session_meta", payload: { cwd: f.root, id: "orca" } }, { timestamp: at(20), type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 100, output_tokens: 5 } } } }]));
  const stats = collectProjectStats(f.repo, f.ref, { home: f.home, env: { CODEX_HOME: runtime }, now: at(70) });
  assert.equal(tool(stats, "Codex", 0).usage.input, 100);
});
test("tokens: Gemini marker, message counts, dedup, tool/thought fields and malformed chats", () => {
  const f = fixture(); const project = join(f.home, ".gemini", "tmp", "app");
  write(join(project, ".project_root"), f.root);
  const chat = { sessionId: "g1", messages: [{ id: "m", timestamp: at(20), tokens: { input: 100, cached: 40, output: 20, thoughts: 10, tool: 5, total: 135 }, content: "PRIVATE_TRANSCRIPT" }, { id: "n", timestamp: at(40), tokens: { input: 50, output: 5 } }] };
  write(join(project, "chats", "session-1.json"), JSON.stringify(chat));
  write(join(project, "chats", "session-copy.json"), JSON.stringify(chat));
  write(join(project, "chats", "session-broken.json"), "{");
  const other = join(f.home, ".gemini", "tmp", "other"); write(join(other, ".project_root"), "/other"); write(join(other, "chats", "session-other.json"), JSON.stringify(chat));
  const stats = f.collect();
  assert.deepEqual(tool(stats, "Gemini CLI", 0).usage, { input: 100, cachedInput: 40, cacheCreationInput: 0, output: 20, reasoningOutput: 10, tool: 5 });
  assert.equal(tool(stats, "Gemini CLI").usage.input, 150);
  assert.ok(!JSON.stringify(stats).includes("PRIVATE_TRANSCRIPT"));
});
test("tokens: missing histories, malformed lines, invalid counts, symlinks and read-only sources", () => {
  const f = fixture(); assert.ok(f.collect().tokens.every((t) => t.status === "missing"));
  const path = join(f.home, ".codex", "sessions", "bad.jsonl");
  const text = jsonl([{ type: "session_meta", payload: { cwd: f.root, id: "bad" } }]) + "broken\n" + jsonl([{ timestamp: at(20), type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: -3, output_tokens: "not-a-number" } } } }]);
  write(path, text);
  const stats = f.collect(); assert.equal(tool(stats, "Codex").usage.input, 0); assert.equal(readFileSync(path, "utf8"), text);
  const external = join(tempDir(), "copy.jsonl"); write(external, text); symlinkSync(external, join(dirname(path), "link.jsonl"));
  assert.equal(tool(f.collect(), "Codex").samples, 0);
  const output = formatProjectStats(stats);
  assert.match(output, /Cursor \| 기록 없음/); assert.ok(!output.includes(f.home)); assert.ok(!output.includes(f.root));
});

test("tokens: damaged cumulative sample never resets the baseline", () => {
  const f = fixture();
  const row = (n: number, input: unknown) => ({ timestamp: at(n), type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: input, output_tokens: 10 } } } });
  write(join(f.home, ".codex", "sessions", "one.jsonl"), jsonl([{ type: "session_meta", payload: { cwd: f.root, id: "s" } }, row(5, 100), row(15, -3), row(16, "bad"), row(20, 150)]));
  const s = f.collect();
  assert.equal(tool(s, "Codex").usage.input, 150);
  assert.equal(tool(s, "Codex", 0).usage.input, 50);
});

test("tokens: Gemini project symlink is not followed and FIFO marker does not block", () => {
  const f = fixture(); const outside = tempDir();
  write(join(outside, ".project_root"), f.root);
  write(join(outside, "chats", "session-one.json"), JSON.stringify({ sessionId: "outside", messages: [{ id: "m", timestamp: at(20), tokens: { input: 999, output: 1 } }] }));
  const tmp = join(f.home, ".gemini", "tmp"); mkdirSync(tmp, { recursive: true }); symlinkSync(outside, join(tmp, "linked"));
  assert.equal(tool(f.collect(), "Gemini CLI").status, "missing");
  if (process.platform !== "win32") {
    const { spawnSync } = process.getBuiltinModule("node:child_process");
    const project = join(tmp, "fifo"); mkdirSync(project);
    assert.equal(spawnSync("mkfifo", [join(project, ".project_root")]).status, 0);
    const script = `import {collectProjectStats} from ${JSON.stringify(new URL("../src/project/tokens.ts", import.meta.url).href)}; collectProjectStats(${JSON.stringify(f.repo)},${JSON.stringify(f.ref)}, {home:${JSON.stringify(f.home)},env:{}});`;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", timeout: 2000 });
    assert.equal(result.status, 0, String(result.error));
  }
});
test("tokens: merging later does not extend the project work interval beyond finish", () => {
  const f = fixture();
  const row = (time: number, input: number) => ({ timestamp: at(time), type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: input, output_tokens: 10 } } } });
  write(join(f.home, ".codex", "sessions", "one.jsonl"), jsonl([{ type: "session_meta", payload: { cwd: f.root, id: "merge" } }, row(20, 100), row(65, 1000)]));
  assert.equal(tool(f.collect(), "Codex").usage.input, 100);
  recordMetric(f.dir, { ts: at(70), project: "P001", cmd: "merge", ok: true });
  assert.equal(tool(f.collect(), "Codex").usage.input, 100);
});
test("tokens: rollout identity survives inherited parent metadata in all Codex homes", () => {
  const f = fixture();
  const meta = (id: string) => ({ type: "session_meta", payload: { cwd: f.root, id } });
  const row = (n: number, input: number, output: number) => ({ timestamp: at(n), type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: input, output_tokens: output } } } });
  const roots = [join(f.home, ".codex"), join(f.home, ".codex_work"), join(f.home, "Library", "Application Support", "orca", "codex-runtime-home", "home")];
  for (const [i, root] of roots.entries()) {
    const rows = [meta(`rollout-${i}`), meta("shared-parent"), row(5+i, 100 * (i+1), 10 * (i+1)), row(20+i, 200 * (i+1), 20 * (i+1)), row(20+i, 200 * (i+1), 20 * (i+1)), row(25+i, 200 * (i+1), 20 * (i+1)), row(40+i, 300 * (i+1), 30 * (i+1))];
    write(join(root, "sessions", "one.jsonl"), jsonl(rows));
    write(join(root, "sessions", "copy.jsonl"), jsonl(rows));
  }
  const stats = f.collect();
  assert.equal(tool(stats, "Codex").usage.input, 1800);
  assert.equal(tool(stats, "Codex").usage.output, 180);
  assert.equal(tool(stats, "Codex", 0).usage.input, 600);
  assert.equal(tool(stats, "Codex", 1).usage.input, 600);
});
test("tokens: Codex inclusive start and end subtract only the last sample strictly before start", () => {
  const f = fixture();
  const row = (n: number, input: number) => ({ timestamp: at(n), type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: input, output_tokens: input / 10 } } } });
  write(join(f.home, ".codex", "sessions", "one.jsonl"), jsonl([{ type: "session_meta", payload: { cwd: f.root, id: "boundary" } }, row(5, 100), row(10, 150), row(20, 200), row(30, 250), row(31, 900), row(50, 1000), row(51, 1500)]));
  const stats = f.collect();
  assert.equal(tool(stats, "Codex", 0).usage.input, 150);
  assert.equal(tool(stats, "Codex", 1).usage.input, 800);
  assert.equal(tool(stats, "Codex").usage.input, 1500);
});

test("tokens: removed worktree retains worker tokens and task rows, main tokens are separate", () => {
  const f = fixture(); const worker = join(f.root, "removed-worker");
  write(join(f.dir, "PROJECT.md"), readFileSync(join(f.dir, "PROJECT.md"), "utf8") + `\n- worktree: \`./removed-worker\`\n`);
  const rows = (cwd: string, id: string, output: number) => jsonl([
    { type: "session_meta", payload: { cwd, id } },
    { type: "event_msg", timestamp: at(20), payload: { type: "token_count", info: { total_token_usage: { input_tokens: 100, output_tokens: output } } } },
  ]);
  write(join(f.home, ".codex", "sessions", "worker.jsonl"), rows(worker, "worker", 12));
  write(join(f.home, ".codex", "sessions", "main.jsonl"), rows(f.root, "main", 99));
  const stats = f.collect();
  assert.equal(stats.tasks.length, 2);
  assert.equal(tool(stats, "Codex").usage.output, 12);
  assert.equal(tool(stats, "Codex", 0).usage.output, 12);
  assert.equal(stats.coordinatorTokens.find(t => t.tool === "Codex")!.usage.output, 99);
});


test("tokens: coordinator includes merge wait but stops at merge", () => {
  const f = fixture();
  write(join(f.dir, "PROJECT.md"), readFileSync(join(f.dir, "PROJECT.md"), "utf8") + "\n- worktree: `./removed-worker`\n");
  recordMetric(f.dir, { ts: at(65), project: "P001", cmd: "merge", ok: true });
  write(join(f.home, ".codex", "sessions", "main.jsonl"), jsonl([
    { type: "session_meta", payload: { cwd: f.root, id: "main" } },
    ...[5, 62, 68].map((n) => ({ type: "event_msg", timestamp: at(n), payload: { type: "token_count", info: { total_token_usage: { input_tokens: n, output_tokens: n } } } })),
  ]));
  assert.equal(f.collect().coordinatorTokens.find(t => t.tool === "Codex")!.usage.output, 62);
});
