import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { once } from "node:events";
import { setTimeout } from "node:timers/promises";
import { parseAgentCall, type AgentCall } from "../src/project/agent-calls.ts";
import { runPace, sessionFreeEnv, spawnTestChild, PACE_BIN, tempDir } from "./helpers.ts";

const unknown = { value: null, source: "unknown" } as const;
const sourcePM = <T extends number | string>(value: T) => ({ value, source: "pm" } as const);
const isWindows = process.platform === "win32";
const POSIX = { skip: isWindows ? "POSIX 에이전트 실행 fixture" : false };

function fixture() {
  const cwd = tempDir("pace-call-repo-"), home = tempDir("pace-call-home-"), bin = tempDir("pace-call-bin-");
  const git = (...args: string[]) => {
    const result = spawnSync("git", ["-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", ...args], { cwd, encoding: "utf8", env: sessionFreeEnv() });
    assert.equal(result.status, 0, result.stderr);
  };
  git("init", "-q", "-b", "main");
  const path = (...parts: string[]) => join(cwd, ...parts);
  const project = path("projects", "P001_260101_fixture"), backlog = path("backlogs", "BL260101_01_fixture");
  const task = join(project, "tasks", "T01_fixture");
  mkdirSync(task, { recursive: true }); mkdirSync(backlog, { recursive: true });
  writeFileSync(join(project, "PROJECT.md"), "# P001 fixture\n\n- 상태: 진행\n\n## 태스크\n\n| T01 | fixture | 진행 | |\n");
  writeFileSync(join(task, "TASK.md"), "# T01 fixture\n\n- 상태: 진행\n");
  writeFileSync(join(backlog, "BACKLOG.md"), "# BL260101_01 fixture\n\n- 상태: 대기\n");
  const artifact = join(project, "fixture.md");
  writeFileSync(artifact, "synthetic artifact\n");
  git("add", "--all"); git("commit", "-qm", "fixture");
  const file = join(project, "calls", "log.jsonl");
  const env = { PATH: [bin, dirname(process.execPath), sessionFreeEnv().PATH].join(delimiter) };
  const run = (args: string[], input?: string) => runPace(args, { cwd, home, env, input });
  const start = (args: string[]) => spawnTestChild(process.execPath, [PACE_BIN, ...args], {
    cwd, env: { ...sessionFreeEnv(), ...env, USERPROFILE: home, HOME: home, PACE_HOME: home }, stdio: "ignore",
  });
  const rows = (dir = project): AgentCall[] => readFileSync(join(dir, "calls", "log.jsonl"), "utf8").trimEnd().split("\n").map((s) => parseAgentCall(JSON.parse(s)));
  const cli = (name: string, text: string) => {
    const command = join(bin, name);
    writeFileSync(command, "#!/usr/bin/env node\n" + text);
    chmodSync(command, 0o755);
    return command;
  };
  return { cwd, project, backlog, task, artifact, file, bin, home, git, run, start, rows, cli };
}

function row(extra: Partial<AgentCall> = {}): AgentCall {
  return { version: 1, id: "b".repeat(32), at: "2026-01-01T00:00:00.000Z", task: "T01", agent: "pace-reviewer", engine: "claude", route: "native",
    status: "completed", reason: null, replacement_reason: null, model: { requested: unknown, actual: unknown }, effort: { requested: unknown, actual: unknown },
    duration_ms: unknown, tokens: { input: unknown, output: unknown, total: unknown }, ref: null, ...extra };
}

function callFile(f: ReturnType<typeof fixture>, value: unknown, target = ["P001", "T01"], name = "input.json") {
  const path = join(f.home, name);
  writeFileSync(path, JSON.stringify(value));
  return ["project", "log", ...target, "--type", "agent_call", "--call-file", path, "--json"];
}

test("T03 S-1: PM 보강·역순·병렬 입력과 백로그 귀속", async () => {
  const f = fixture();
  const minimal = row(), rich = row({ duration_ms: sourcePM(0), ref: "fixture.md" });
  for (const [id, order] of [[minimal.id, [minimal, rich]], ["c".repeat(32), [rich, minimal]]] as const) {
    for (const value of order) {
      const r = f.run(callFile(f, { ...value, id }));
      assert.equal(r.status, 0, r.stderr);
      assert.equal(JSON.parse(r.stdout).id, id);
    }
  }
  const old = f.rows();
  assert.equal(old.length, 2);
  assert.deepEqual(old[0], { ...old[1], id: minimal.id });
  assert.deepEqual(old[0]?.duration_ms, sourcePM(0));
  assert.equal(old[0]?.ref, "fixture.md");
  const newId = "d".repeat(32);
  const children = [
    f.start(callFile(f, { ...minimal, id: newId }, undefined, "one.json")),
    f.start(callFile(f, { ...rich, id: newId }, undefined, "two.json")),
    f.start(callFile(f, { ...minimal, id: "e".repeat(32) }, undefined, "three.json")),
  ];
  assert.deepEqual(await Promise.all(children.map(async (child) => (await once(child, "exit"))[0])), [0, 0, 0]);
  assert.equal(f.rows().length, 4);
  assert.equal(f.rows().find(({ id }) => id === newId)?.duration_ms.value, 0);
  const previousOwner = spawnSync(process.execPath, ["-e", ""], { encoding: "utf8" });
  assert.equal(previousOwner.status, 0);
  const abandoned = join(dirname(f.file), ".write.local.json");
  writeFileSync(abandoned, `pace-agent-calls-v1 ${previousOwner.pid}\n`);
  assert.equal(f.run(callFile(f, minimal)).status, 0);
  assert.equal(existsSync(abandoned), false);
  const backlog = f.run(callFile(f, row({ task: null }), ["BL260101_01"]));
  assert.equal(backlog.status, 0, backlog.stderr);
  assert.equal(f.rows(f.backlog).length, 1);
  assert.equal(existsSync(join(f.project, "log.jsonl")), false);
});

test("T03 S-2: 잘못된 입력·충돌·손상 뒤 안전한 재시도", POSIX, () => {
  const f = fixture();
  assert.equal(f.run(callFile(f, row({ duration_ms: sourcePM(11) }))).status, 0);
  const before = readFileSync(f.file, "utf8");
  for (const invalid of [
    { ...row(), prompt: "synthetic text" }, { ...row(), response: "synthetic text" }, { ...row(), extra: 1 }, row({ duration_ms: sourcePM(-1) }),
    row({ model: { requested: sourcePM("sk-" + "x".repeat(50)), actual: unknown } }),
    row({ ref: "../outside" }), row({ ref: f.artifact }), row({ ref: ".git/config" }), row({ duration_ms: sourcePM(8) }),
    row({ at: "2025-01-01T00:00:00.000Z" }),
  ]) {
    assert.notEqual(f.run(callFile(f, invalid)).status, 0);
    assert.equal(readFileSync(f.file, "utf8"), before);
  }
  const duplicate = callFile(f, row());
  writeFileSync(duplicate[7]!, before.replace('"version":1', '"version":1,"version":1'));
  assert.notEqual(f.run(duplicate).status, 0);
  const outer = join(f.home, "outer");
  writeFileSync(outer, "outside");
  renameSync(f.file, f.file + ".backup");
  symlinkSync(outer, f.file);
  assert.notEqual(f.run(callFile(f, row())).status, 0);
  assert.equal(readFileSync(outer, "utf8"), "outside");
  unlinkSync(f.file);
  renameSync(f.file + ".backup", f.file);
  assert.equal(f.run(callFile(f, row())).status, 0);
  writeFileSync(f.file, before.slice(0, -1));
  assert.notEqual(f.run(callFile(f, row())).status, 0);
  const stats = f.run(["project", "stats", "P001", "--json"]);
  assert.equal(stats.status, 0, stats.stderr);
  assert.equal(JSON.parse(stats.stdout).agentCalls.state, "unreadable");
});

const claudeOK = (text = "synthetic assistant text") => `
require("fs").readFileSync(0);
console.log(JSON.stringify({type:"result", result:${JSON.stringify(text)}, modelUsage:{"claude-fixture":{}}, usage:{input_tokens:0,output_tokens:23}, is_error:false}));
`;
function codexOK(text = "pass") {
  const stderr = `OpenAI Codex\n--------\nmodel: gpt-6-fixture\nprovider: openai\nsandbox: read-only\nreasoning effort: medium\n--------\nuser\nfixture\n\ncodex\n${text}\ntokens used\n18\n`;
  return `require("fs").readFileSync(0);process.stdout.write(${JSON.stringify(text + "\n")});process.stderr.write(${JSON.stringify(stderr)});`;
}

test("T03 S-3: p·ACP·chain 정상 진입, 건너뜀·쓰기 스냅샷과 구분", POSIX, () => {
  const f = fixture();
  f.cli("claude", claudeOK());
  f.cli("codex", codexOK());
  const acp = new URL("./fake-acp-agent.mjs", import.meta.url).href;
  f.cli("claude-agent-acp", `process.argv = [process.argv[0], process.argv[1], 'ok', '', '', '0.81.1']; import(${JSON.stringify(acp)});`);
  const p = f.run(["agent", "run", "--agent", "claude", "--mode", "p", "--call-scope", "P001", "--call-task", "T01", "--call-agent", "pace-reviewer",
    "--model", "claude-request", "--effort", "high"], "synthetic user input");
  assert.equal(p.status, 0, p.stderr);
  assert.deepEqual(f.rows()[0]?.model, { requested: { value: "claude-request", source: "requested" }, actual: { value: "claude-fixture", source: "host" } });
  assert.deepEqual(f.rows()[0]?.effort.actual, unknown);
  assert.deepEqual(f.rows()[0]?.tokens.input, { value: 0, source: "tool" });
  const direct = f.rows()[0]!;
  assert.equal(f.run(callFile(f, direct)).status, 0);
  assert.deepEqual(f.rows(), [direct]);
  assert.doesNotMatch(readFileSync(f.file, "utf8"), /synthetic assistant|synthetic user/);
  f.git("switch", "-qc", "project/P001");
  const a = f.run(["agent", "run", "--agent", "claude", "--mode", "acp", "--model", "other-model"], "fixture");
  assert.equal(a.status, 0, a.stderr);
  assert.equal(f.rows()[1]?.route, "acp");
  assert.equal(f.rows()[1]?.task, "T01");
  assert.deepEqual(f.rows()[1]?.model, { requested: { value: "other-model", source: "requested" }, actual: unknown });
  const denied = f.run(["agent", "run", "--agent", "codex", "--mode", "p", "--resume", "not-saved"], "fixture");
  assert.notEqual(denied.status, 0);
  assert.equal(f.rows().length, 2);
  f.git("switch", "-q", "main");
  const unscoped = f.run(["agent", "run", "--agent", "claude", "--mode", "p", "--call-agent", "pace-reviewer"], "fixture");
  assert.notEqual(unscoped.status, 0);
  assert.equal(f.rows().length, 2);
  f.git("switch", "-q", "project/P001");
  f.cli("claude", 'require("fs").readFileSync(0);process.stderr.write("Claude AI usage limit reached|4102444800");process.exitCode=1;');
  f.cli("codex", `const rows = require("fs").readFileSync(${JSON.stringify(f.file)}, "utf8").trimEnd().split("\\n").map(JSON.parse);
if (rows.at(-1).replacement_reason !== "rate_limited") process.exit(9);
${codexOK()}`);
  const chain = join(f.home, "chain.json");
  writeFileSync(chain, JSON.stringify({ chains: { sample: { steps: [{ agent: "codex", mode: "acp" }, { agent: "claude", mode: "p" }, { agent: "codex", mode: "p", effort: "high" }] } } }));
  const c = f.run(["agent", "run", "--chain", "sample", "--chain-file", chain], "fixture");
  assert.equal(c.status, 0, c.stderr || c.stdout);
  assert.deepEqual(JSON.parse(c.stdout).attempts.map((step: { outcome: string }) => step.outcome), ["skipped", "fallback", "success"]);
  assert.deepEqual(f.rows().slice(2).map(({ engine, status, route, replacement_reason }) => [engine, status, route, replacement_reason]),
    [["claude", "failed", "chain", "rate_limited"], ["codex", "completed", "chain", null]]);
  assert.deepEqual(f.rows()[3]?.effort, { requested: { value: "high", source: "requested" }, actual: { value: "medium", source: "host" } });
});

test("T03 S-4·S-5: verify 대체 2행, 참조·측정 일치, 기존 집계와 독립", POSIX, () => {
  const f = fixture();
  f.cli("claude", 'require("fs").readFileSync(0); console.log("synthetic invalid stream");');
  f.cli("codex", codexOK());
  const args = ["agent", "verify", "--target", f.artifact, "--author-agent", "codex", "--purpose", "synthetic fixture", "--allow-same-provider", "--call-agent", "pace-reviewer"];
  const result = f.run(args);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = JSON.parse(result.stdout), calls = f.rows();
  assert.equal(output.cross, false);
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.status, "failed");
  assert.equal(calls[0]?.replacement_reason, "protocol_error");
  assert.equal(calls[0]?.ref, null);
  const record = calls[1]!;
  assert.equal(record.id, output.agent_call_id);
  assert.equal(record.ref, output.review.record);
  const ledger = readFileSync(join(f.project, "REVIEW-LOG.jsonl"), "utf8").trimEnd().split("\n").map((s) => JSON.parse(s)).find((r) => r.type === "review");
  assert.equal(record.duration_ms.value, ledger.duration_ms);
  assert.equal(record.tokens.input.value, ledger.usage.input_tokens);
  assert.equal(record.tokens.total.value, ledger.usage.output_tokens);
  assert.deepEqual(record.tokens.output, unknown);
  const stats = () => {
    const r = f.run(["project", "stats", "P001", "--json"]);
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
  };
  let withCalls = stats();
  assert.equal(withCalls.team, undefined);
  assert.equal(withCalls.agentCalls.attempts, 2);
  assert.deepEqual(withCalls.agentCalls.groups[1].totalTokens, { known: 18, unknown: 0 });
  assert.deepEqual(withCalls.agentCalls.groups[1].outputTokens, { known: null, unknown: 1 });
  const projectPath = join(f.project, "PROJECT.md");
  const original = readFileSync(projectPath, "utf8");
  writeFileSync(projectPath, original.replace("- 상태: 진행", "- 상태: 진행\n- 팀 측정: v1"));
  writeFileSync(join(f.project, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period: {
    start: null, end: new Date().toISOString(), unit: "representative-task", closed: false,
  } }));
  withCalls = stats();
  assert.ok(withCalls.team);
  renameSync(f.file, f.file + ".saved");
  const without = stats();
  assert.equal(without.agentCalls, undefined);
  assert.deepEqual(without.eventCounts, withCalls.eventCounts);
  assert.deepEqual(without.reviewLedger, withCalls.reviewLedger);
  without.team.snapshot.observed_at = withCalls.team.snapshot.observed_at;
  assert.deepEqual(without.team, withCalls.team);
  renameSync(f.file + ".saved", f.file);
});

test("T03 S-4: 호출 원장 오류는 검토 원장·결과를 막지 않는다", POSIX, () => {
  const f = fixture();
  f.cli("codex", codexOK());
  mkdirSync(dirname(f.file));
  writeFileSync(f.file, "incomplete");
  const r = f.run(["agent", "verify", "--target", f.artifact, "--author-agent", "claude", "--purpose", "synthetic fixture"]);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stderr, /에이전트 호출 기록에 실패/);
  assert.equal(JSON.parse(r.stdout).review.verdict, "pass");
  assert.equal(JSON.parse(r.stdout).agent_call_id, undefined);
  assert.equal(readFileSync(f.file, "utf8"), "incomplete");
  assert.match(readFileSync(join(f.project, "REVIEW-LOG.jsonl"), "utf8"), /"verdict":"pass"/);
  const clobber = f.run(["agent", "verify", "--target", f.artifact, "--author-agent", "claude", "--purpose", "synthetic fixture", "--out", f.file]);
  assert.equal(clobber.status, 2);
  assert.match(clobber.stdout, /호출 원장 폴더/);
  assert.equal(readFileSync(f.file, "utf8"), "incomplete");
  const other = join(f.cwd, "projects", "P002_260101_other");
  mkdirSync(join(other, "calls"), { recursive: true });
  const otherLog = join(other, "calls", "log.jsonl"), otherBefore = JSON.stringify(row({ task: null })) + "\n";
  writeFileSync(otherLog, otherBefore);
  const cross = f.run(["agent", "verify", "--target", f.artifact, "--author-agent", "claude", "--purpose", "synthetic fixture", "--out", otherLog]);
  assert.equal(cross.status, 2);
  assert.match(cross.stdout, /호출 원장 폴더/);
  assert.equal(readFileSync(otherLog, "utf8"), otherBefore);
});

test("T03 S-3: 실제 p 시간 제한과 중단은 시간만 알려진 각각의 행", POSIX, async () => {
  const f = fixture();
  const marker = join(f.home, "ready");
  f.cli("claude", `require("fs").writeFileSync(${JSON.stringify(marker)}, "ready"); setInterval(() => {}, 100);`);
  const args = ["agent", "run", "--agent", "claude", "--mode", "p", "--call-scope", "P001", "--call-task", "T01", "--prompt-file", f.artifact];
  const limited = f.run([...args, "--timeout-ms", "800"]);
  assert.equal(limited.status, 6, limited.stderr);
  assert.equal(f.rows()[0]?.reason, "timeout");
  unlinkSync(marker);
  const child = f.start(args), exited = once(child, "exit");
  for (let wait = 0; !existsSync(marker) && wait < 200; wait++) await setTimeout(20);
  assert.ok(existsSync(marker), "실행기가 시작된 뒤에만 중단");
  child.kill("SIGTERM");
  assert.equal((await exited)[0], 15);
  assert.deepEqual(f.rows().map(({ status, reason }) => [status, reason]), [["interrupted", "timeout"], ["interrupted", "cancelled"]]);
  assert.ok(f.rows().every(({ duration_ms, tokens }) => duration_ms.value !== null && tokens.input.value === null && tokens.output.value === null));
});

test("T03 S-4: 외부 검토 발급과 예산 차단은 백로그 실제 호출 행을 늘리지 않는다", POSIX, () => {
  const f = fixture();
  const target = join(f.backlog, "BR01_fixture.md");
  writeFileSync(target, "# BR01 fixture\n\n- 상태: 대기\n");
  const hand = ["agent", "review-hand", "--target", target, "--author-provider", "openai", "--purpose-file", f.artifact];
  const handed = f.run(hand);
  assert.equal(handed.status, 0, handed.stdout || handed.stderr);
  assert.equal(existsSync(join(f.backlog, "calls", "log.jsonl")), false);
  f.cli("claude", claudeOK('synthetic evidence\n```pace-review\n{"version":1,"findings":[]}\n```\npass'));
  const verify = ["agent", "verify", "--target", target, "--author-agent", "codex", "--purpose", "synthetic fixture", "--call-agent", "pace-backlog-planner"];
  const review = f.run(verify);
  assert.equal(review.status, 0, review.stdout || review.stderr);
  const entries = f.rows(f.backlog);
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.agent, "pace-backlog-planner");
  assert.match(entries[0]?.ref ?? "", /^review-records\/R\d+\.json$/);
  assert.equal(f.run(hand).status, 0);
  assert.equal(f.run(hand).status, 0);
  assert.equal(f.run(verify).status, 16);
  assert.deepEqual(f.rows(f.backlog), entries);
});

test("T03 S-3: 실행이 끝났으면 선택 raw 보관 오류에도 관측 행을 보존한다", POSIX, () => {
  const f = fixture();
  f.cli("claude", claudeOK());
  const acp = new URL("./fake-acp-agent.mjs", import.meta.url).href;
  f.cli("claude-agent-acp", `process.argv = [process.argv[0], process.argv[1], 'ok', '', '', '0.81.1']; import(${JSON.stringify(acp)});`);
  for (const mode of ["p", "acp"]) {
    const r = f.run(["agent", "run", "--agent", "claude", "--mode", mode, "--call-scope", "P001", "--raw-dir", f.artifact], "fixture");
    assert.notEqual(r.status, 0);
  }
  assert.deepEqual(f.rows().map(({ route, status }) => [route, status]), [["p", "completed"], ["acp", "completed"]]);
  assert.ok(f.rows().every(({ duration_ms, tokens }) => duration_ms.value !== null && tokens.output.value !== null));
});

test("T03 S-4·S-5: main에서 실행한 검토도 소유 worktree stats에서 한 번 보인다", POSIX, () => {
  const f = fixture();
  f.cli("claude", claudeOK());
  f.cli("codex", codexOK());
  const tree = join(f.home, "linked");
  f.git("worktree", "add", "-qb", "project/P001", tree);
  const listed = f.run(["agent", "run", "--agent", "claude", "--mode", "p", "--cwd", f.project], "fixture");
  assert.equal(listed.status, 0, listed.stderr);
  assert.equal(existsSync(f.file), false, "main의 경로 지정 실행은 실제 소유 worktree에 기록");
  const linked = join(tree, "projects", "P001_260101_fixture");
  assert.equal(f.rows(linked).length, 1);
  const verification = f.run(["agent", "verify", "--target", f.artifact, "--author-agent", "claude", "--purpose", "synthetic fixture"]);
  assert.equal(verification.status, 0, verification.stderr);
  assert.equal(f.rows()[0]?.ref, JSON.parse(verification.stdout).review.record);
  // Common history contains the same attempt in both checkouts until one is ahead.
  const mirrored = [f.rows()[0], f.rows(linked)[0]].map((value) => JSON.stringify(value)).join("\n") + "\n";
  writeFileSync(f.file, mirrored);
  const stats = f.run(["project", "stats", "P001", "--json"]);
  assert.equal(stats.status, 0, stats.stderr);
  assert.equal(JSON.parse(stats.stdout).agentCalls.attempts, 2);
});
