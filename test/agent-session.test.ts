import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AgentError, validateRequest } from "../src/agent/contract.ts";
import { buildIdentityContext, continueSession } from "../src/agent/hooks.ts";
import { createProfile } from "../src/profile/profile.ts";
import { registerWorkspace } from "../src/project/workspace-registry.ts";
import { ALTU, tempDir } from "./helpers.ts";

const request = (extra = {}) => validateRequest({ agent: "claude", mode: "acp", prompt: "다음 질문", cwd: tempDir(), ...extra });

test("S-13 continueSession: 같은 권한이고 resume 가능하면 resume + 저장 기록", () => {
  const r = request();
  const saved = { sessionId: "s1", agent: "claude" as const, cwd: r.cwd, access: "read-only" as const };
  const plan = continueSession(saved, r, "요약", { canResume: true });
  assert.equal(plan.mode, "resume");
  assert.equal(plan.request.resume, "s1");
  assert.deepEqual(plan.hooks, { savedSession: saved });
});

test("S-13 읽기→쓰기 전환은 새 세션 + 요약 인계(같은 세션 권한 상승 없음), 쓰기→읽기도 새 세션", () => {
  const r = request({ access: "write" });
  const saved = { sessionId: "s1", agent: "claude" as const, cwd: r.cwd, access: "read-only" as const };
  const up = continueSession(saved, r, "앞 대화 요약", { canResume: true });
  assert.equal(up.mode, "new-session");
  assert.equal(up.request.resume, undefined);
  assert.equal(up.hooks.handoffSummary, "앞 대화 요약");
  assert.equal(up.hooks.savedSession, undefined);
  assert.match(up.reason, /read-only → write/);
  const down = continueSession({ ...saved, access: "write" }, request({ cwd: r.cwd, access: "read-only" }), "요약", { canResume: true });
  assert.equal(down.mode, "new-session");
});

test("S-13 resume 미지원(codex)이면 요약, cwd·agent 불일치는 session_mismatch", () => {
  const r = request({ agent: "codex" });
  const saved = { sessionId: "s1", agent: "codex" as const, cwd: r.cwd, access: "read-only" as const };
  const plan = continueSession(saved, r, "요약", { canResume: false });
  assert.equal(plan.mode, "new-session");
  assert.equal(plan.hooks.handoffSummary, "요약");
  assert.throws(() => continueSession(saved, request({ agent: "codex", cwd: tempDir() }), "요약", { canResume: true }), (e: AgentError) => e.code === "session_mismatch");
  assert.throws(() => continueSession({ ...saved, agent: "claude" }, r, "요약", { canResume: true }), (e: AgentError) => e.code === "session_mismatch");
});

test("S-11 buildIdentityContext: 프로필 이름·프로젝트 정의를 담고 인사 지시는 뺀다", () => {
  const home = tempDir(), userHome = tempDir();
  createProfile(home, ALTU);
  const workspace = join(userHome, "workspace");
  mkdirSync(workspace);
  registerWorkspace(home, { path: workspace, name: "합성", summary: "" }, 1500);
  const agent = join(workspace, ".pace", "AGENT.md");
  writeFileSync(agent, `${readFileSync(agent, "utf8")}\nProject marker PROJ-777.\n`);
  const context = buildIdentityContext({ home, cwd: workspace, userHome, env: {} });
  assert.match(context, /^\[이 세션의 정체성·프로젝트 맥락/);
  assert.match(context, /알투/);
  assert.match(context, /PROJ-777/);
  assert.doesNotMatch(context, /첫 응답 지침/);
  assert.doesNotMatch(context, /캡틴에게 짧게 인사한다/);
  assert.match(context, /\[맥락 끝\]$/);
});

