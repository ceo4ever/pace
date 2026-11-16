import test from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { AgentError, normalizeResult, type AgentName, type AgentRequest, type Executor, type Mode } from "../src/agent/contract.ts";
import { ChainConfigError, checkChain, fileCooldownStore, memoryCooldownStore, normalizeEffort, outcomeExitCode, parseChainConfig, resolveChain, runChain, type ChainDef, type ChainDeps, type ChainOutcome } from "../src/agent/chain.ts";
import { classifyFailure, classifyText, parseResetAt } from "../src/agent/limits.ts";
import { SnapshotError } from "../src/agent/snapshot.ts";
import { tempDir } from "./helpers.ts";

const caps = { models: true, effort: true, systemPrompt: false, resume: false, writeAccess: true };

type Behavior = (request: AgentRequest) => Promise<{ text: string; isError?: boolean }> | { text: string; isError?: boolean };
interface Fake extends Executor { calls: AgentRequest[] }

function fake(agent: AgentName, mode: Mode, behavior: Behavior, opts: { readOnlyEnforced?: boolean } = {}): Fake {
  const calls: AgentRequest[] = [];
  return {
    agent, mode, capabilities: caps, readOnlyEnforced: opts.readOnlyEnforced ?? true, calls,
    async run(request) {
      calls.push(request);
      const r = await behavior(request);
      return normalizeResult(request, { text: r.text, isError: r.isError === true, model: "m-x" }, { durationMs: 5, enforcement: "fake" });
    },
  };
}
const limit = () => { throw new AgentError("agent_failed", "claude 종료 코드 1: Claude AI usage limit reached|4102444800"); };

function chain(steps: { agent: AgentName; mode: Mode; effort?: string }[], extra: Partial<ChainDef> = {}): ChainDef {
  return { name: "c", steps, fallbackOnTimeout: false, writeFallback: "observed", defaultCooldownMinutes: 30, ...extra };
}
function deps(execs: Executor[], extra: Partial<ChainDeps> = {}): ChainDeps {
  return { find: (a, m) => execs.find((e) => e.agent === a && e.mode === m), cooldowns: memoryCooldownStore(), ...extra };
}
const git = (cwd: string, ...args: string[]) => {
  const r = spawnSync("git", ["-c", "core.autocrlf=false", "-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
};
function repo(): string {
  const dir = tempDir();
  git(dir, "init", "-q");
  writeFileSync(join(dir, ".gitignore"), "ignored/\n");
  writeFileSync(join(dir, "a.txt"), "a\n");
  writeFileSync(join(dir, "b.txt"), "b\n");
  git(dir, "add", ".");
  git(dir, "commit", "-qm", "init");
  return dir;
}
const claudeP = (b: Behavior, o?: { readOnlyEnforced?: boolean }) => fake("claude", "p", b, o);
const codexP = (b: Behavior, o?: { readOnlyEnforced?: boolean }) => fake("codex", "p", b, o);
const ok = (text = "done") => () => ({ text });
const base = (cwd: string, extra = {}) => ({ prompt: "작업", cwd, access: "read-only" as const, ...extra });
const steps2 = [{ agent: "claude" as const, mode: "p" as const }, { agent: "codex" as const, mode: "p" as const }];

// ---- T-1 정의 ----
test("S-1 체인 정의: 정상 읽기, 잘못된 정의는 오류, 경고와 effort 정규화", () => {
  const config = parseChainConfig({ chains: { main: { steps: [{ agent: "claude", mode: "p", model: "sonnet", effort: "high" }, { agent: "codex", mode: "p", effort: "max" }] } }, limit_patterns: ["quota_x"] });
  const c = resolveChain(config, "main");
  assert.equal(c.writeFallback, "never", "기본은 never");
  assert.equal(c.fallbackOnTimeout, false);
  assert.equal(c.defaultCooldownMinutes, 30);
  assert.deepEqual(normalizeEffort("codex", "max"), { requested: "max", applied: "xhigh" });
  assert.deepEqual(normalizeEffort("claude", "max"), { requested: "max", applied: "max" });
  assert.deepEqual(normalizeEffort("claude", "xhigh"), { requested: "xhigh", applied: "xhigh" });
  assert.throws(() => normalizeEffort("claude", "minimal"), ChainConfigError);
  assert.ok(config.limitPatterns[0]!.test("QUOTA_X"));
  const check = checkChain(c, () => ({ agent: "claude", mode: "p", capabilities: caps, readOnlyEnforced: true, run: async () => { throw new Error("no"); } }));
  assert.deepEqual(check.steps.map((s) => s.effort_applied), ["high", "xhigh"]);
  assert.ok(check.warnings.some((w) => /외부 에이전트를 호출하지 않는다/.test(w)));
  for (const bad of [null, [], {}, { chains: [] }, { chains: { x: { steps: [] } } }, { chains: { "a b": { steps: [{ agent: "claude", mode: "p" }] } } },
    { chains: { x: { steps: [{ agent: "gemini", mode: "p" }] } } }, { chains: { x: { steps: [{ agent: "claude", mode: "x" }] } } },
    { chains: { x: { steps: [{ agent: "claude", mode: "p", effort: "turbo" }] } } },
    { chains: { x: { steps: [{ agent: "claude", mode: "p" }], write_fallback: "always" } } },
    { chains: { x: { steps: [{ agent: "claude", mode: "p" }], default_cooldown_minutes: 0 } } },
    { chains: { x: { steps: [{ agent: "claude", mode: "p" }] } }, limit_patterns: ["("] }]) {
    assert.throws(() => parseChainConfig(bad), ChainConfigError, JSON.stringify(bad));
  }
  assert.throws(() => resolveChain(config, "nope"), /없는 체인/);
});

test("S-1 정의 검사: 읽기 전용 미확인 단계 경고, 지원하지 않는 옵션은 오류, observed 경고", () => {
  const acp = fake("codex", "acp", ok(), { readOnlyEnforced: false });
  const noEffort: Executor = { ...fake("codex", "acp", ok(), { readOnlyEnforced: false }), capabilities: { ...caps, effort: false } };
  const c = chain([{ agent: "codex", mode: "acp" }]);
  const warnings = checkChain(c, () => acp).warnings;
  assert.ok(warnings.some((w) => /읽기 전용 강제를 실측으로 확인하지 못했다/.test(w)));
  assert.ok(warnings.some((w) => /observed/.test(w)));
  assert.throws(() => checkChain(chain([{ agent: "codex", mode: "acp", effort: "high" }]), () => noEffort), /effort를 지원하지 않는다/);
});

// ---- 분류 ----
test("분류: 한도·인증·작업 실패·원문 reset 파싱", () => {
  const f = (code: ConstructorParameters<typeof AgentError>[0], m: string) => classifyFailure(new AgentError(code, m));
  assert.equal(f("agent_failed", "claude 종료 코드 1: Claude AI usage limit reached|4102444800"), "rate_limited");
  assert.equal(f("agent_failed", "HTTP 429 Too Many Requests"), "rate_limited");
  assert.equal(f("agent_failed", "codex 종료 코드 1: usage_limit_reached"), "rate_limited");
  assert.equal(f("agent_failed", "Invalid API key · Please run /login"), "auth_failed");
  assert.equal(f("agent_failed", "compile error in file"), "failed");
  assert.equal(f("protocol_error", "429 rate limit"), "failed", "프로토콜 오류는 문구와 무관하게 폴백 대상이 아니다");
  assert.equal(f("invalid_request", "x"), "failed");
  assert.equal(f("timeout", "x"), "timeout");
  assert.equal(classifyText("custom_cap hit", [/custom_cap/]), "rate_limited");
  const now = 1_700_000_000_000;
  assert.equal(parseResetAt("limit|4102444800", now), 4102444800 * 1000);
  assert.equal(parseResetAt("resets 2100-01-01T00:00:00Z", now), Date.parse("2100-01-01T00:00:00Z"));
  assert.equal(parseResetAt("Retry-After: 120", now), now + 120_000);
  assert.equal(parseResetAt("limit|1000000000", now), null, "과거 시각은 무시");
  assert.equal(parseResetAt("문구만", now), null);
});

// ---- T-2 폴백 ----
test("S-2 한도면 다음 단계로 폴백하고 attempts에 원문을 남긴다(모사 입력)", async () => {
  const a = claudeP(limit), b = codexP(ok("둘째 성공"));
  const out = await runChain(chain(steps2), base(repo()), deps([a, b]));
  assert.equal(out.status, "ok");
  if (out.status !== "ok") return;
  assert.equal(out.result.text, "둘째 성공");
  assert.equal(out.attempts.length, 2);
  assert.equal(out.attempts[0]!.outcome, "fallback");
  assert.equal(out.attempts[0]!.reason, "rate_limited");
  assert.match(out.attempts[0]!.detail!, /usage limit reached/);
  assert.ok(out.attempts[0]!.cooldown_until);
  assert.equal(out.attempts[1]!.outcome, "success");
  assert.equal(outcomeExitCode(out), 0);
});

test("S-3 인증 실패·실행기 없음도 다음 단계로", async () => {
  const auth = claudeP(() => { throw new AgentError("agent_failed", "claude 종료 코드 1: Invalid API key · Please run /login"); });
  const gone = claudeP(() => { throw new AgentError("executor_unavailable", "claude 실행 파일을 찾지 못했다", { started: false }); });
  for (const first of [auth, gone]) {
    const second = codexP(ok());
    const out = await runChain(chain(steps2), base(repo()), deps([first, second]));
    assert.equal(out.status, "ok");
    assert.equal(second.calls.length, 1);
  }
  const out = await runChain(chain([{ agent: "claude", mode: "acp" }, { agent: "codex", mode: "p" }]), base(repo()), deps([codexP(ok())]));
  assert.equal(out.status, "ok", "등록되지 않은 실행기는 건너뛴다");
  if (out.status === "ok") assert.equal(out.attempts[0]!.reason, "executor_unavailable");
});

test("S-4 작업 실패·protocol_error는 폴백하지 않는다", async () => {
  for (const error of [new AgentError("agent_failed", "claude 종료 코드 1: 컴파일 실패"), new AgentError("protocol_error", "429 rate limit 같은 문구가 있어도 프로토콜 오류"), new AgentError("invalid_request", "잘못된 요청")]) {
    const second = codexP(ok());
    const out = await runChain(chain(steps2), base(repo()), deps([claudeP(() => { throw error; }), second]));
    assert.equal(out.status, "failed");
    assert.equal(second.calls.length, 0, "2단계 미실행");
    if (out.status === "failed") { assert.equal(out.attempts[0]!.outcome, "stopped"); assert.equal(out.error.code, error.code); }
  }
});

test("S-5 is_error 성공 반환도 한도면 폴백, 아니면 중단", async () => {
  const second = codexP(ok("둘째"));
  const out = await runChain(chain(steps2), base(repo()), deps([claudeP(() => ({ text: "usage limit reached, resets later", isError: true })), second]));
  assert.equal(out.status, "ok");
  const stop = await runChain(chain(steps2), base(repo()), deps([claudeP(() => ({ text: "도구 오류로 실패", isError: true })), codexP(ok())]));
  assert.equal(stop.status, "failed");
});

test("S-15 timeout은 기본 중단, 설정하면 폴백(변경 없을 때만)", async () => {
  const slow = () => { throw new AgentError("timeout", "600000ms 안에 끝나지 않아"); };
  const s1 = codexP(ok());
  assert.equal((await runChain(chain(steps2), base(repo()), deps([claudeP(slow), s1]))).status, "failed");
  assert.equal(s1.calls.length, 0);
  const s2 = codexP(ok());
  assert.equal((await runChain(chain(steps2, { fallbackOnTimeout: true }), base(repo()), deps([claudeP(slow), s2]))).status, "ok");
  assert.equal(s2.calls.length, 1);
});

// ---- T-3 쿨다운 ----
test("S-6 쿨다운: 재실행에서 한도 단계를 건너뛰고 시각이 지나면 다시 시도, 파일에 원자적으로 저장", async () => {
  const dir = tempDir();
  const store = fileCooldownStore(join(dir, "cool.json"), () => clock);
  let clock = 1_700_000_000_000;
  const a = claudeP(limit);
  const b = codexP(ok());
  const noReset = () => { throw new AgentError("agent_failed", "claude 종료 코드 1: rate limit exceeded"); };
  const a2 = claudeP(noReset);
  const run = (first: Executor) => runChain(chain(steps2), base(repo()), { find: (ag, m) => [first, b].find((e) => e.agent === ag && e.mode === m), cooldowns: store, now: () => clock });
  const first = await run(a2);
  assert.equal(first.status, "ok");
  assert.equal(a2.calls.length, 1);
  // reset을 못 읽으면 기본 30분
  const stored = JSON.parse(readFileSync(join(dir, "cool.json"), "utf8")) as Record<string, number>;
  assert.equal(stored["claude/p/-"], clock + 30 * 60_000);
  const second = await run(a2);
  assert.equal(a2.calls.length, 1, "쿨다운 중이라 1단계 건너뜀");
  assert.equal(second.status === "ok" && second.attempts[0]!.reason, "cooldown");
  clock += 31 * 60_000;
  await run(a2);
  assert.equal(a2.calls.length, 2, "시각 경과 뒤 다시 시도");
  // 원문 epoch가 있으면 그 시각
  const reset = new Date(Date.UTC(2100, 0, 1)).getTime();
  const store2 = memoryCooldownStore();
  await runChain(chain(steps2), base(repo()), { find: (ag, m) => [a, b].find((e) => e.agent === ag && e.mode === m), cooldowns: store2, now: () => 1_700_000_000_000 });
  assert.equal(store2.get("claude/p/-"), 4102444800 * 1000);
  void reset;
});

// ---- T-4 읽기 전용 ----
test("S-7 읽기 전용이면 강제 미확인 단계를 건너뛰고 쓰기 요청은 실행", async () => {
  const unverified = fake("codex", "acp", ok("acp 실행"), { readOnlyEnforced: false });
  const verified = claudeP(ok("p 실행"));
  const c = chain([{ agent: "codex", mode: "acp" }, { agent: "claude", mode: "p" }]);
  const d = deps([unverified, verified]);
  const ro = await runChain(c, base(repo()), d);
  assert.equal(unverified.calls.length, 0);
  assert.equal(ro.status === "ok" && ro.attempts[0]!.reason, "read_only_unenforceable");
  const dir = repo();
  const rw = await runChain(c, base(dir, { access: "write" }), deps([unverified, verified]));
  assert.equal(unverified.calls.length, 1, "쓰기 요청은 미확인 단계도 실행");
  assert.equal(rw.status === "ok" && rw.result.text, "acp 실행");
  const undefinedFlag: Executor = { ...fake("claude", "p", ok()), readOnlyEnforced: undefined };
  const skipped = await runChain(chain([{ agent: "claude", mode: "p" }]), base(repo()), deps([undefinedFlag]));
  assert.equal(skipped.status, "chain_exhausted", "증거 표시가 없으면 적격으로 인정하지 않는다");
});

// ---- T-5 변경 판정 ----
const handoffOf = (o: ChainOutcome) => { assert.equal(o.status, "handoff_required", JSON.stringify(o).slice(0, 400)); return o as Extract<ChainOutcome, { status: "handoff_required" }>; };

test("S-8·S-13 새 파일을 만든 뒤 한도 → handoff_required, 2단계 미실행, 요약 포함", async () => {
  const dir = repo();
  const second = codexP(ok());
  const out = handoffOf(await runChain(chain(steps2), base(dir, { access: "write", prompt: "원래 요청 본문" }), deps([claudeP((r) => { writeFileSync(join(r.cwd, "new.txt"), "x"); return limit(); }), second])));
  assert.equal(second.calls.length, 0);
  assert.match(out.reason, /changes_detected: .*worktree/);
  assert.equal(out.request.prompt, "원래 요청 본문");
  assert.equal(out.request.access, "write");
  assert.equal(out.request.cwd, dir);
  assert.equal(out.attempts.length, 1);
  assert.equal(out.attempts[0]!.outcome, "handoff");
  assert.ok(out.changes!.changed.includes("worktree"));
  assert.match(out.changes!.diff_stat, /new\.txt/);
  assert.match(out.observation_scope, /탐지하지 못한다/);
  assert.equal(out.last_error!.code, "agent_failed");
  assert.equal(outcomeExitCode(out), 12);
});

test("S-9 실행 전부터 M인 파일·이미 ??인 파일을 추가 수정해도 감지한다", async () => {
  for (const mode of ["tracked", "untracked"] as const) {
    const dir = repo();
    if (mode === "tracked") appendFileSync(join(dir, "a.txt"), "이미 수정\n");
    else writeFileSync(join(dir, "u.txt"), "처음\n");
    const second = codexP(ok());
    const out = handoffOf(await runChain(chain(steps2), base(dir, { access: "write" }), deps([claudeP((r) => { appendFileSync(join(r.cwd, mode === "tracked" ? "a.txt" : "u.txt"), "더\n"); return limit(); }), second])));
    assert.equal(second.calls.length, 0, mode);
    assert.ok(out.changes!.changed.includes("worktree"), mode);
  }
});

test("S-10 변경 없이 한도면(observed) 자동 폴백", async () => {
  const dir = repo();
  appendFileSync(join(dir, "a.txt"), "실행 전부터 M\n");
  writeFileSync(join(dir, "u.txt"), "실행 전부터 ??\n");
  const second = codexP(ok());
  const out = await runChain(chain(steps2), base(dir, { access: "write" }), deps([claudeP(limit), second]));
  assert.equal(out.status, "ok");
  assert.equal(second.calls.length, 1);
});

test("S-11 스테이징·커밋·삭제·.pace 변경을 각각 감지한다", async () => {
  const cases: [string, (cwd: string) => void, string][] = [
    ["스테이징", (cwd) => void git(cwd, "add", "a.txt"), "index"],
    ["커밋", (cwd) => { appendFileSync(join(cwd, "a.txt"), "c\n"); git(cwd, "commit", "-qam", "c"); }, "head"],
    ["삭제", (cwd) => rmSync(join(cwd, "b.txt")), "worktree"],
    [".pace", (cwd) => { mkdirSync(join(cwd, ".pace", "memory"), { recursive: true }); writeFileSync(join(cwd, ".pace", "memory", "m.md"), "x"); }, "pace"],
  ];
  for (const [name, mutate, part] of cases) {
    const dir = repo();
    if (name === ".pace") { mkdirSync(join(dir, ".pace", "memory"), { recursive: true }); writeFileSync(join(dir, ".pace", "memory", "m.md"), "원본"); writeFileSync(join(dir, ".gitignore"), "ignored/\n.pace/\n"); git(dir, "add", "."); git(dir, "commit", "-qm", "pace"); }
    if (name === "스테이징") appendFileSync(join(dir, "a.txt"), "m\n");
    const second = codexP(ok());
    const out = handoffOf(await runChain(chain(steps2), base(dir, { access: "write" }), deps([claudeP((r) => { mutate(r.cwd); return limit(); }), second])));
    assert.equal(second.calls.length, 0, name);
    assert.ok(out.changes!.changed.includes(part), `${name}: ${out.changes!.changed.join(",")}`);
    if (name === "커밋") assert.equal(out.changes!.commits.length, 1);
  }
});

test("S-12 판정이 불확실하면 폴백하지 않는다 — 비 git·스냅샷 실패·종료 확인 실패(표지)", async () => {
  // 비 git 폴더
  const second = codexP(ok());
  const out1 = handoffOf(await runChain(chain(steps2), { prompt: "작업", cwd: tempDir(), access: "write" as const }, deps([claudeP(limit), second])));
  assert.match(out1.reason, /^snapshot_failed/);
  assert.equal(second.calls.length, 0);
  // 스냅샷 실패 주입(이전 성공, 이후 실패)
  const dir = repo();
  let n = 0;
  const flaky = (cwd: string) => { if (++n > 1) throw new SnapshotError("시간 초과"); return { head: "h", index: "i", worktree: "w", pace: "o", ignored: "g" }; };
  const out2 = handoffOf(await runChain(chain(steps2), base(dir, { access: "write" }), deps([claudeP(limit), codexP(ok())], { snapshot: flaky })));
  assert.match(out2.reason, /^snapshot_failed.*시간 초과/);
  // 종료 확인 실패는 구조화 표지로만 판정한다 — 사유(rate_limited·timeout 폴백 설정)와 무관
  for (const [msg, cfg] of [["rate limit exceeded (종료 확인 실패)", {}], ["600000ms 안에 끝나지 않아", { fallbackOnTimeout: true }]] as const) {
    const code = cfg.fallbackOnTimeout ? "timeout" : "agent_failed";
    const next = codexP(ok());
    const flagged = handoffOf(await runChain(chain(steps2, { ...cfg }), base(repo(), { access: "write" }), deps([claudeP(() => { throw new AgentError(code, msg, { cleanupUnconfirmed: true }); }), next])));
    assert.equal(flagged.reason, "cleanup_unconfirmed");
    assert.equal(next.calls.length, 0);
  }
  // 같은 문구라도 표지가 없고 변경도 없으면 판정은 변경 기준(여기선 폴백)
  const next = codexP(ok());
  const plain = await runChain(chain(steps2), base(repo(), { access: "write" }), deps([claudeP(() => { throw new AgentError("agent_failed", "rate limit exceeded (종료 확인 실패)"); }), next]));
  assert.equal(plain.status, "ok");
});

test("S-14 읽기 전용: 변경 없으면 폴백, 선언과 달리 파일을 쓰면 read_only_violation", async () => {
  const dir = repo();
  assert.equal((await runChain(chain(steps2), base(dir), deps([claudeP(limit), codexP(ok())]))).status, "ok");
  const second = codexP(ok());
  const out = handoffOf(await runChain(chain(steps2), base(dir), deps([claudeP((r) => { writeFileSync(join(r.cwd, "sneaky.txt"), "x"); return limit(); }), second])));
  assert.equal(out.reason, "read_only_violation");
  assert.equal(second.calls.length, 0);
  // 성공 단계가 썼다면 결과는 돌려주되 경고
  const dir2 = repo();
  const done = await runChain(chain(steps2), base(dir2), deps([claudeP((r) => { writeFileSync(join(r.cwd, "sneaky.txt"), "x"); return { text: "성공" }; }), codexP(ok())]));
  assert.equal(done.status, "ok");
  if (done.status === "ok") assert.ok(done.warnings.some((w) => /read_only_violation/.test(w)));
});

test("S-20 폴백 사유 × 변경 교차: 어떤 사유든 변경 뒤에는 다음 단계를 시작하지 않는다", async () => {
  const reasons: [string, () => never, Partial<ChainDef>][] = [
    ["rate_limited", limit, {}],
    ["auth_failed", () => { throw new AgentError("agent_failed", "Invalid API key · Please run /login"); }, {}],
    ["read_only_unenforceable", () => { throw new AgentError("read_only_unenforceable", "sandbox가 read-only가 아니다"); }, {}],
    ["timeout", () => { throw new AgentError("timeout", "시간 초과"); }, { fallbackOnTimeout: true }],
  ];
  for (const [name, fail, cfg] of reasons) {
    const dir = repo();
    const second = codexP(ok());
    const first = claudeP((r) => { writeFileSync(join(r.cwd, "partial.txt"), "x"); return fail(); });
    const out = await runChain(chain(steps2, cfg), base(dir, { access: "write" }), deps([first, second]));
    assert.equal(out.status, "handoff_required", name);
    assert.equal(second.calls.length, 0, name);
  }
});

test("S-21 write_fallback 기본(never)·observed, 무시 경로 변경, 시작 전 실패", async () => {
  // 기본 never: 변경 관찰이 없어도 시작된 쓰기 단계의 실패는 handoff
  const dir = repo();
  const neverChain = chain(steps2, { writeFallback: "never" });
  const out = handoffOf(await runChain(neverChain, base(dir, { access: "write" }), deps([claudeP(limit), codexP(ok())])));
  assert.equal(out.reason, "write_fallback_never");
  // 시작 전 실패(실행기 없음)는 never여도 폴백
  const second = codexP(ok());
  const gone = await runChain(neverChain, base(repo(), { access: "write" }), deps([claudeP(() => { throw new AgentError("executor_unavailable", "없음", { started: false }); }), second]));
  assert.equal(gone.status, "ok");
  // 쿨다운 건너뜀도 never에서 폴백
  const cool = memoryCooldownStore();
  cool.set("claude/p/-", Date.now() + 60_000);
  const third = codexP(ok());
  assert.equal((await runChain(neverChain, base(repo(), { access: "write" }), deps([claudeP(ok()), third], { cooldowns: cool }))).status, "ok");
  // observed + 무시 경로(.gitignore 대상) 새 파일·수정은 지문으로 감지
  for (const mutate of [(cwd: string) => { mkdirSync(join(cwd, "ignored"), { recursive: true }); writeFileSync(join(cwd, "ignored", "x.bin"), "x"); }]) {
    const d = repo();
    mkdirSync(join(d, "ignored"));
    writeFileSync(join(d, "ignored", "old.bin"), "o");
    const s2 = codexP(ok());
    const o = handoffOf(await runChain(chain(steps2), base(d, { access: "write" }), deps([claudeP((r) => { mutate(r.cwd); writeFileSync(join(r.cwd, "ignored", "old.bin"), "수정됨 더 길게"); return limit(); }), s2])));
    assert.ok(o.changes!.changed.includes("ignored"));
    assert.equal(s2.calls.length, 0);
  }
  // 체인 설정의 기본값
  assert.equal(parseChainConfig({ chains: { x: { steps: [{ agent: "claude", mode: "p" }] } } }).chains.x!.writeFallback, "never");
});

test("S-12 읽기 전용도 관찰이 불확실하면(비 git·스냅샷 실패) 폴백하지 않는다", async () => {
  const second = codexP(ok());
  const out = handoffOf(await runChain(chain(steps2), { prompt: "질문", cwd: tempDir(), access: "read-only" }, deps([claudeP(limit), second])));
  assert.match(out.reason, /^snapshot_failed/);
  assert.equal(second.calls.length, 0);
});

test("시작 전 실패 표지(started:false)와 시작 후 read_only_unenforceable(sandbox 재확인)을 구분한다", async () => {
  // 실행 뒤 sandbox 재확인에서 난 read_only_unenforceable — 이미 변경이 있으면 폴백하지 않는다(기본 write_fallback never와 무관하게 읽기 전용 요청도)
  const dir = repo();
  const second = codexP(ok());
  const out = handoffOf(await runChain(chain(steps2), base(dir), deps([claudeP((r) => { writeFileSync(join(r.cwd, "wrote.txt"), "x"); throw new AgentError("read_only_unenforceable", "에이전트가 보고한 sandbox가 read-only가 아니다: workspace-write"); }), second])));
  assert.equal(out.reason, "read_only_violation");
  assert.equal(second.calls.length, 0);
  // 시작 전 거부(표지 있음)는 변경이 있을 수 없으므로 안전 판정 없이 폴백 — 쓰기 never 정책에서도
  const next = codexP(ok());
  const pre = await runChain(chain(steps2, { writeFallback: "never" }), base(repo(), { access: "write" }), deps([claudeP(() => { throw new AgentError("read_only_unenforceable", "강제 불가", { started: false }); }), next]));
  assert.equal(pre.status, "ok");
  assert.equal(next.calls.length, 1);
});

test("실제 ACP 실행기: 세션 생성 중 파일을 쓰고 읽기 전용 모드를 못 찾아 실패해도 시작된 것으로 보아 폴백하지 않는다", async () => {
  const dir = repo();
  const fakeAgent = join(import.meta.dirname, "fake-acp-agent.mjs");
  const acp = createAcpExecutor({ ...claudeAcp, readOnlyVersions: ["9.9.9"] }, { command: process.execPath, args: [fakeAgent, "nomodes-write", "", join(dir, "made-in-session-new.txt"), ""], graceMs: 300 });
  const second = codexP(ok());
  const out = handoffOf(await runChain(chain([{ agent: "claude", mode: "acp" }, ...steps2.slice(1)]), base(dir), deps([acp, second])));
  assert.equal(out.reason, "read_only_violation");
  assert.equal(second.calls.length, 0);
  assert.ok(out.changes!.changed.includes("worktree"));
});

test("하위 폴더를 cwd로 실행해도 무시 경로 지문이 저장소 루트 기준으로 계산된다", async () => {
  const dir = repo();
  mkdirSync(join(dir, "sub"));
  writeFileSync(join(dir, "sub", ".gitignore"), "cache.bin\n");
  writeFileSync(join(dir, "sub", "cache.bin"), "처음");
  writeFileSync(join(dir, "cache.bin"), "루트의 같은 이름 파일(무시 대상 아님)");
  git(dir, "add", ".");
  git(dir, "commit", "-qm", "sub");
  const second = codexP(ok());
  const out = handoffOf(await runChain(chain(steps2), base(join(dir, "sub"), { access: "write" }), deps([claudeP((r) => { writeFileSync(join(r.cwd, "cache.bin"), "무시된 파일을 더 길게 수정"); return limit(); }), second])));
  assert.ok(out.changes!.changed.includes("ignored"), out.changes!.changed.join(","));
  assert.equal(second.calls.length, 0);
});

test("쓰기 요청의 작업 실패(폴백 안 함)도 남긴 변경 요약을 함께 낸다", async () => {
  const dir = repo();
  const out = await runChain(chain(steps2), base(dir, { access: "write" }), deps([claudeP((r) => { writeFileSync(join(r.cwd, "half.txt"), "x"); throw new AgentError("agent_failed", "claude 종료 코드 1: 컴파일 실패"); }), codexP(ok())]));
  assert.equal(out.status, "failed");
  if (out.status === "failed") { assert.ok(out.changes!.changed.includes("worktree")); assert.match(out.changes!.diff_stat, /half\.txt/); }
});

test("S-23 소진·종료 코드 구분", async () => {
  const cool = memoryCooldownStore();
  const out = await runChain(chain(steps2), base(repo()), deps([claudeP(limit), codexP(limit)], { cooldowns: cool }));
  assert.equal(out.status, "chain_exhausted");
  if (out.status !== "chain_exhausted") return;
  assert.equal(out.attempts.length, 2);
  assert.ok(out.next_retry_at);
  assert.equal(outcomeExitCode(out), 13);
  const failed = await runChain(chain(steps2), base(repo()), deps([claudeP(() => { throw new AgentError("agent_failed", "작업 실패"); }), codexP(ok())]));
  const codes = new Set([outcomeExitCode(out), outcomeExitCode(failed), 0, 12]);
  assert.equal(codes.size, 4);
  assert.equal(outcomeExitCode(failed), 7);
  const none = await runChain(chain(steps2), base(repo()), deps([]));
  assert.equal(none.status === "chain_exhausted" && none.next_retry_at, null);
});

test("옵션 전달: 단계 모델·정규화한 effort가 실행기에 간다", async () => {
  const a = fake("codex", "p", ok());
  const out = await runChain(chain([{ agent: "codex", mode: "p", effort: "max" }]), base(repo()), deps([a]));
  assert.equal(out.status, "ok");
  assert.equal(a.calls[0]!.effort, "xhigh");
  if (out.status === "ok") { assert.equal(out.attempts[0]!.effort_requested, "max"); assert.equal(out.attempts[0]!.effort_applied, "xhigh"); }
});

// ---- S-22 timeout 뒤 지연 쓰기: 실제 -p 실행기가 자손까지 회수한다 ----
import { createPExecutor, type PAdapter } from "../src/agent/p-executor.ts";
import { claudeAcp, createAcpExecutor } from "../src/agent/acp-executor.ts";

test("S-22 timeout 뒤 자손의 지연 쓰기가 일어나지 않는다(회수 확인) — 폴백은 그 뒤에만", async () => {
  const dir = repo();
  const script = join(tempDir(), "hang.cjs");
  const late = join(dir, "late.txt");
  writeFileSync(script, `const { spawn } = require("node:child_process");\nspawn(process.execPath, ["-e", ${JSON.stringify(`setTimeout(()=>require("fs").writeFileSync(${JSON.stringify(late)},"late"),2500)`)}], { stdio: "ignore" });\nsetInterval(() => {}, 1000);\n`);
  const adapter: PAdapter = {
    agent: "claude", command: process.execPath, capabilities: { models: true, effort: true, systemPrompt: false, resume: false, writeAccess: true },
    build: () => ({ args: [script], enforcement: "test" }), parse: (stdout) => ({ text: stdout }),
  };
  const real = createPExecutor(adapter, { sessionDir: join(tempDir(), "s"), idleMs: 60_000 });
  const second = codexP(ok("뒤 단계"));
  const out = await runChain(chain(steps2, { fallbackOnTimeout: true }), base(dir, { access: "write", timeoutMs: 1000 }), deps([real, second]));
  await new Promise((resolve) => setTimeout(resolve, 3500));
  assert.equal(readFileSyncSafe(late), null, "자손이 회수돼 지연 쓰기가 일어나지 않았다");
  // 회수가 확인됐고 변경이 없으므로 폴백, 회수 확인이 안 되면 cleanup_unconfirmed handoff — 어느 쪽이든 2단계는 회수 뒤에만 시작
  if (out.status === "ok") assert.equal(second.calls.length, 1);
  else assert.equal(handoffOf(out).reason, "cleanup_unconfirmed");
});
function readFileSyncSafe(path: string): string | null { try { return readFileSync(path, "utf8"); } catch { return null; } }

// ---- S-17 CLI ----
import { runPace } from "./helpers.ts";

test("S-17 CLI: --chain 혼용·없는 체인·정의 오류는 사용법/정의 오류, 읽기 전용 미확인 단계만 있으면 소진(13)", () => {
  const home = tempDir();
  const file = join(home, "chains.json");
  writeFileSync(file, JSON.stringify({ chains: { only_acp: { steps: [{ agent: "codex", mode: "acp" }] } } }));
  writeFileSync(join(home, "bad.json"), JSON.stringify({ chains: { bad: { steps: [] } } }));
  const run = (args: string[]) => runPace(["agent", "run", ...args], { home, input: "질문", timeout: 20_000 });
  const mixed = run(["--chain", "only_acp", "--agent", "claude"]);
  assert.notEqual(mixed.status, 0);
  assert.match(mixed.stderr, /함께 쓸 수 없다/);
  assert.notEqual(run(["--chain-file", file]).status, 0);
  const missing = run(["--chain", "nope", "--chain-file", file]);
  assert.equal(missing.status, 2);
  assert.match(missing.stdout, /없는 체인/);
  assert.equal(run(["--chain", "only_acp", "--chain-file", join(home, "none.json")]).status, 2);
  const badDef = run(["--chain", "bad", "--chain-file", join(home, "bad.json")]);
  assert.equal(badDef.status, 2);
  assert.match(badDef.stdout, /steps가 비어 있다/);
  writeFileSync(join(home, "broken.json"), "{");
  assert.equal(run(["--chain", "x", "--chain-file", join(home, "broken.json")]).status, 2);
  const exhausted = run(["--chain", "only_acp", "--chain-file", file]);
  assert.equal(exhausted.status, 13, exhausted.stderr);
  const body = JSON.parse(exhausted.stdout);
  assert.equal(body.status, "chain_exhausted");
  assert.equal(body.attempts[0].reason, "read_only_unenforceable");
  assert.ok(body.definition_warnings.some((w: string) => /읽기 전용 강제를 실측으로 확인하지 못했다/.test(w)));
  // 단일 지정은 그대로 동작(없는 모드 오류 형식 유지)
  const single = run(["--agent", "claude", "--mode", "x"]);
  assert.equal(single.status, 2);
});
