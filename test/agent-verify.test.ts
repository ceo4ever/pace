import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AgentError, normalizeResult, type AgentName, type Executor } from "../src/agent/contract.ts";
import { buildVerifyPrompt, crossVerify } from "../src/agent/verify.ts";
import { providerFromModel } from "../src/agent/contract.ts";
import { runPace, tempDir } from "./helpers.ts";

const calls: { agent: string; prompt: string; access: string }[] = [];
function fake(agent: AgentName, opts: { model?: string; fail?: AgentError; unconfirmed?: boolean } = {}): Executor {
  return {
    agent, mode: "p",
    capabilities: { models: true, effort: true, systemPrompt: true, resume: true, writeAccess: true },
    async run(request) {
      calls.push({ agent, prompt: request.prompt, access: request.access });
      if (opts.fail) throw opts.fail;
      return normalizeResult(request, { text: "revise", model: opts.model, provider: opts.unconfirmed ? undefined : agent === "codex" ? "openai" : "anthropic" }, { durationMs: 1, enforcement: "fake" });
    },
  };
}
const base = { authorAgent: "claude" as const, purpose: "상위 목적 문장", artifact: "산출물 본문", artifactName: "BACKLOG.md", cwd: "/tmp" };

test("다른 제공자 에이전트를 읽기 전용으로 골라 교차 검증한다", async () => {
  calls.length = 0;
  const o = await crossVerify({ ...base, executors: [fake("claude"), fake("codex")] });
  assert.ok(o.ran && o.cross && o.verifier === "codex");
  assert.deepEqual(calls.map((c) => [c.agent, c.access]), [["codex", "read-only"]]);
});

test("상위 목적이 산출물보다 먼저, 네 질문 포함", () => {
  const p = buildVerifyPrompt("상위 목적 문장", "BACKLOG.md", "산출물 본문");
  assert.ok(p.indexOf("상위 목적 문장") < p.indexOf("산출물 본문"));
  assert.match(p, /상위 목적과 맞는가[\s\S]*다른 길[\s\S]*빠진 것[\s\S]*추적/);
});

test("목표 대조는 작업 문서 전 1단계이며 결과 달성과 상향 수정을 별도로 묻는다", () => {
  const p = buildVerifyPrompt("사용자가 합의한 상위 목적", "산출물.md", "실제 결과");
  assert.match(p, /1단계/);
  assert.match(p, /작업 문서.*읽지/);
  assert.match(p, /결과가.*목표를.*이루는가/);
  assert.match(p, /독립 목표 대조/);
  assert.match(p, /상위 목적은.*기준.*목표/);
  assert.match(p, /2단계.*호출자/);
  assert.match(p, /산출물 안에 드러난 결정/);
  assert.match(p, /1단계 원문/);
  assert.match(p, /호스트 첨부.*노출 범위/);
});

test("다른 제공자를 쓸 수 없으면 같은 제공자로 몰래 대체하지 않고 미실행·질문", async () => {
  calls.length = 0;
  const o = await crossVerify({ ...base, executors: [fake("claude")] });
  assert.equal(o.ran, false);
  assert.ok(!o.ran && /교차 검증 미실행/.test(o.reason) && /사용자에게 묻는다/.test(o.ask));
  assert.equal(calls.length, 0);
  const failed = await crossVerify({ ...base, executors: [fake("claude"), fake("codex", { fail: new AgentError("read_only_unenforceable", "강제 불가") })] });
  assert.ok(!failed.ran && /read_only_unenforceable/.test(failed.reason));
});

test("제공자를 확인하지 못한 결과(고정표뿐)는 교차로 인정하지 않고 미실행", async () => {
  const o = await crossVerify({ ...base, executors: [fake("codex", { unconfirmed: true })] });
  assert.ok(!o.ran && /확인하지 못해/.test(o.reason));
});

test("단일 제공자 사용자: 허용하면 같은 제공자 새 맥락 검토를 '교차 아님'으로 기록", async () => {
  const o = await crossVerify({ ...base, allowSameProvider: true, executors: [fake("claude")] });
  assert.ok(o.ran && o.cross === false);
});

test("결과의 보고 모델이 작성자 제공자이면 교차로 인정하지 않는다", async () => {
  const o = await crossVerify({ ...base, executors: [fake("codex", { model: "claude-opus-5-5", unconfirmed: true })] });
  assert.equal(o.ran, false);
  assert.equal(providerFromModel("gpt-6-astra"), "openai");
  assert.equal(providerFromModel(null), null);
});

test("CLI: 검증자가 없으면 종료 10과 질문 문구(작성자 codex, claude도 PATH에 없음)", () => {
  const home = tempDir();
  const bin = join(home, "empty");
  mkdirSync(bin);
  writeFileSync(join(home, "a.md"), "x");
  const r = runPace(["agent", "verify", "--author-agent", "codex", "--target", join(home, "a.md"), "--purpose", "목적"], { home, env: { PATH: bin } });
  assert.equal(r.status, 10);
  assert.match(r.stdout, /교차 검증 미실행/);
});

test("구현 전 TASK 사전 검토(kind task)는 TASK.md를 결과물로 읽게 하고 작업 문서 열람 금지 문구를 넣지 않는다", () => {
  const goal = buildVerifyPrompt("목적", "TASK.md", "본문");
  const task = buildVerifyPrompt("목적", "TASK.md", "본문", "task");
  assert.match(goal, /작업 문서\(TASK·테스트 표/);
  assert.doesNotMatch(task, /작업 문서\(TASK·테스트 표·작성자 마감\/자체 판정·지적 대응\)는 받거나 읽지 않는다/);
  assert.match(task, /사전 검토/);
  assert.match(task, /TASK\.md\(목적·기준·테스트 표·접근\)가 검토할 결과물/);
  assert.match(task, /독립성 위반이 아니다/);
  assert.match(task, /이전 지적과 그 대응 문서는 받거나 읽지 않는다/);
  assert.match(task, /검출력/);
  assert.ok(task.indexOf("목적") < task.indexOf("본문"));
});
