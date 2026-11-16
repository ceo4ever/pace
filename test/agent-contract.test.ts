import test from "node:test";
import assert from "node:assert/strict";
import { AgentError, checkResume, errorCodes, runAgent, validateRequest, normalizeResult, type AgentName, type AgentRequest, type Capabilities, type Executor, type Mode } from "../src/agent/contract.ts";
import { runPace, tempDir } from "./helpers.ts";

const full: Capabilities = { models: true, effort: true, systemPrompt: true, resume: true, writeAccess: true };
const base = { agent: "claude", mode: "p", prompt: "검토해 줘", cwd: "/tmp" } as const;

/** 가짜 에이전트 — 방식·에이전트마다 서로 다른 원본 모양을 같은 사실로 넘긴다 */
function fake(agent: AgentName, mode: Mode, caps: Capabilities = full): Executor {
  return {
    agent, mode, capabilities: caps,
    async run(request: AgentRequest) {
      const raw = mode === "p" ? { text: "ok", model: "m-1", sessionId: "s1", isError: false, inputTokens: 3, outputTokens: 4 } : { text: "ok", stopReason: "end_turn" };
      return normalizeResult(request, raw, { durationMs: 12.4, enforcement: "fake" });
    },
  };
}

test("두 방식·두 에이전트가 같은 결과 형태를 낸다", async () => {
  const shapes = new Set<string>();
  for (const agent of ["claude", "codex"] as const) {
    for (const mode of ["p", "acp"] as const) {
      const r = await runAgent(fake(agent, mode), { ...base, agent, mode });
      shapes.add(Object.keys(r).sort().join(","));
      assert.equal(r.agent, agent);
      assert.equal(r.provider.value, agent === "claude" ? "anthropic" : "openai");
      assert.equal(r.provider.source, "table");
      assert.equal(r.access, "read-only");
      assert.equal(r.raw_path, null);
    }
  }
  assert.equal(shapes.size, 1);
});

test("모델 출처: 보고 > 요청 > 알 수 없음", async () => {
  const req = validateRequest({ ...base, model: "asked" });
  assert.deepEqual(normalizeResult(req, { text: "", model: "real" }, { durationMs: 1, enforcement: "x" }).model, { value: "real", source: "reported" });
  assert.deepEqual(normalizeResult(req, { text: "" }, { durationMs: 1, enforcement: "x" }).model, { value: "asked", source: "requested" });
  assert.deepEqual(normalizeResult(validateRequest(base), { text: "" }, { durationMs: 1, enforcement: "x" }).model, { value: null, source: "unknown" });
});

test("미지원 옵션은 조용히 무시하지 않고 오류", async () => {
  const noModel = fake("claude", "p", { ...full, models: false });
  await assert.rejects(runAgent(noModel, { ...base, model: "x" }), (e: AgentError) => e.code === "unsupported_option");
  const ro = fake("claude", "p", { ...full, writeAccess: false });
  await assert.rejects(runAgent(ro, { ...base, access: "write" }), (e: AgentError) => e.code === "unsupported_option");
  await assert.rejects(runAgent(fake("codex", "p"), base), (e: AgentError) => e.code === "executor_unavailable");
});

test("요청 검증: 빈 프롬프트·timeout 상한·잘못된 이름", () => {
  for (const bad of [{ prompt: " " }, { timeoutMs: 0 }, { timeoutMs: 3_600_001 }, { agent: "gemini" }, { mode: "x" }, { model: "" }]) {
    assert.throws(() => validateRequest({ ...base, ...bad } as never), (e: AgentError) => e.code === "invalid_request");
  }
  assert.equal(validateRequest(base).access, "read-only");
});

test("이어가기는 같은 에이전트·cwd·접근에서만", () => {
  const req = validateRequest({ ...base, resume: "s1" });
  checkResume(req, { cwd: req.cwd, access: "read-only", agent: "claude" });
  for (const saved of [{ cwd: "/other", access: "read-only", agent: "claude" }, { cwd: req.cwd, access: "write", agent: "claude" }, { cwd: req.cwd, access: "read-only", agent: "codex" }] as const) {
    assert.throws(() => checkResume(req, saved), (e: AgentError) => e.code === "session_mismatch");
  }
});

test("오류 코드는 서로 다른 종료 코드를 가진다", () => {
  const codes = Object.values(errorCodes);
  assert.equal(new Set(codes).size, codes.length);
  assert.ok(codes.every((c) => c >= 2));
});

test("pace agent run: 미지원 옵션은 JSON 오류와 종료 코드 3(프로세스 실행 전), 프롬프트 없으면 2", () => {
  const home = tempDir();
  const r = runPace(["agent", "run", "--agent", "codex", "--mode", "p", "--resume", "x"], { home, input: "hi" });
  assert.equal(r.status, errorCodes.unsupported_option);
  assert.equal(JSON.parse(r.stdout).error.code, "unsupported_option");
  const empty = runPace(["agent", "run", "--agent", "claude", "--mode", "p"], { home, input: "" });
  assert.equal(empty.status, errorCodes.invalid_request);
});
