import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeAcp, createAcpExecutor } from "../src/agent/acp-executor.ts";
import { memoryCooldownStore } from "../src/agent/chain.ts";
import { createChainRunner } from "../src/daemon/runner.ts";
import type { RunCtl, RunJob } from "../src/daemon/types.ts";
import { tempDir } from "./helpers.ts";

const FAKE = join(import.meta.dirname, "fake-acp-agent.mjs");
const trusted = { ...claudeAcp, readOnlyVersions: ["9.9.9"], resumeMethod: "session/resume" as const };

function setup(behavior: string, log = "") {
  const home = tempDir();
  const chainFile = join(home, "chains.json");
  writeFileSync(chainFile, JSON.stringify({ chains: { default: { steps: [{ agent: "claude", mode: "acp" }], write_fallback: "never" } } }));
  const exec = createAcpExecutor(trusted, { command: process.execPath, args: [FAKE, behavior, log, "", ""], graceMs: 300 });
  const runner = createChainRunner({ home, chainFile, find: (a, m) => (a === "claude" && m === "acp" ? exec : undefined), cooldowns: memoryCooldownStore(), identity: () => "[정체성]", timeoutMs: 10_000 });
  const cwd = tempDir();
  const job = (extra: Partial<RunJob> = {}, access: "read-only" | "write" = "read-only"): RunJob => ({ taskId: "t1", prompt: "질문", conversation: "c1", saved: null, target: { workspace: "a", worktreeName: "main", worktree: cwd, dev: "0", ino: "0", chain: "default", access, sessionKey: "k" }, ...extra });
  const updates: Record<string, unknown>[] = [];
  const approvals: string[] = [];
  const ac = new AbortController();
  const ctl = (answer = true): RunCtl => ({ signal: ac.signal, update: (u) => updates.push(u), onProcess: () => {}, requestApproval: async (d) => { approvals.push(d); return answer; } });
  return { runner, job, ctl, updates, approvals, ac, cwd, log };
}

test("S-18 체인·ACP 훅 결선: 이벤트가 전달되고 ACP 세션이 보관 정보로 돌아온다", async () => {
  const s = setup("events");
  const r = await s.runner(s.job(), s.ctl());
  assert.equal(r.status, "done");
  assert.equal(r.cleanupUnconfirmed, false);
  assert.deepEqual(r.session, { sessionId: "sess-1", agent: "claude", cwd: s.cwd, access: "read-only" });
  const kinds = s.updates.map((u) => u.sessionUpdate);
  for (const k of ["plan", "tool_call", "agent_message_chunk", "x_future_kind"]) assert.ok(kinds.includes(k), k);
});

test("S-18 기본 거절 도구만 사용자 승인을 묻고, 거부하면 거절된다(쓰기)", async () => {
  const s = setup("permx:other:Bash");
  const denied = await s.runner(s.job({}, "write"), s.ctl(false));
  assert.equal(s.approvals.length, 1);
  assert.match(s.approvals[0]!, /Bash/);
  assert.equal(denied.status === "done" || denied.status === "failed", true);
  const s2 = setup("permx:other:Bash");
  const allowed = await s2.runner(s2.job({}, "write"), s2.ctl(true));
  assert.equal(allowed.status, "done");
  assert.match(allowed.text, /choice=yes/);
  // 기본 허용(편집 도구)은 사용자에게 묻지 않는다
  const s3 = setup("perm-edit");
  const ok = await s3.runner(s3.job({}, "write"), s3.ctl(false));
  assert.equal(s3.approvals.length, 0);
  assert.match(ok.text, /choice=yes/);
});

test("S-28 보관 세션은 대화·워크트리·agent·cwd·access·체인이 모두 같을 때만 resume한다", async () => {
  const log = join(tempDir(), "log");
  const s = setup("ok", log);
  const saved = { sessionId: "sess-1", agent: "claude" as const, cwd: s.cwd, access: "read-only" as const, conversation: "c1", worktree: s.cwd, chain: "default", lastText: "직전 응답" };
  const resumed = await s.runner(s.job({ saved }), s.ctl());
  assert.equal(resumed.status, "done");
  assert.match(readFileSync(log, "utf8"), /recv session\/resume/);
  assert.doesNotMatch(readFileSync(log, "utf8"), /이전 대화 요약/);
  // 읽기→쓰기 전환: 같은 세션을 쓰지 않고 새 세션 + 요약
  const log2 = join(tempDir(), "log");
  const s2 = setup("ok", log2);
  const saved2 = { ...saved, cwd: s2.cwd, worktree: s2.cwd };
  const switched = await s2.runner(s2.job({ saved: saved2 }, "write"), s2.ctl());
  assert.equal(switched.status, "done");
  const logged = readFileSync(log2, "utf8");
  assert.doesNotMatch(logged, /recv session\/resume/);
  assert.match(logged, /recv session\/new/);
  assert.match(logged, /이전 대화 요약.*직전 응답/s);
});

test("취소 신호: ACP 단계가 취소되면 cancelled로 끝난다", async () => {
  const s = setup("hang");
  setTimeout(() => s.ac.abort(), 400);
  const r = await s.runner(s.job(), s.ctl());
  assert.equal(r.status, "cancelled");
  assert.equal(r.cleanupUnconfirmed, false);
});

test("체인 설정 오류는 failed(시작 전)로 돌아온다", async () => {
  const home = tempDir();
  const runner = createChainRunner({ home, chainFile: join(home, "없음.json"), find: () => undefined });
  const s = setup("ok");
  const r = await runner(s.job(), s.ctl());
  assert.equal(r.status, "failed");
  assert.equal(r.cleanupUnconfirmed, false);
  assert.match(r.detail ?? "", /체인 설정/);
});

test("S-12 처리 단계 표시(via)와 도구 권한 요청에 kind가 담긴다", async () => {
  const { describeVia } = await import("../src/daemon/runner.ts");
  assert.equal(describeVia([{ agent: "claude", mode: "acp", outcome: "success" }]), "claude/acp");
  assert.equal(describeVia([{ agent: "claude", mode: "acp", outcome: "fallback" }, { agent: "codex", mode: "p", outcome: "skipped" }, { agent: "codex", mode: "acp", outcome: "success" }]), "claude/acp(한도·실패) → codex/-p(건너뜀) → codex/acp");
  assert.equal(describeVia([{ agent: "claude", mode: "acp", outcome: "stopped" }]), "");
  const s = setup("events");
  const r = await s.runner(s.job(), s.ctl());
  assert.equal(r.via, "claude/acp");
  const s2 = setup("permx:other:Bash");
  await s2.runner(s2.job({}, "write"), s2.ctl(true));
  assert.match(s2.approvals[0]!, /\(kind: other\)/);
});

test("S-2l 런너의 오류 문자열은 자르기 전에 비밀을 제거한다(300자 경계에 걸친 토큰)", async () => {
  const { makeRedactor } = await import("../src/daemon/secrets.ts");
  const token = "123456789:AAH-test_token_value_0123456789abcdefXYZ";
  const home = tempDir();
  const chainFile = join(home, "chains.json");
  writeFileSync(chainFile, JSON.stringify({ chains: { default: { steps: [{ agent: "claude", mode: "acp" }], write_fallback: "never" } } }));
  const runner = createChainRunner({ home, chainFile, redact: makeRedactor([token]), find: () => { throw new Error(`${"x".repeat(290)}${token}`); }, cooldowns: memoryCooldownStore(), identity: () => "", timeoutMs: 5000 });
  const cwd = tempDir();
  const job: RunJob = { taskId: "t1", prompt: "q", conversation: "c1", saved: null, target: { workspace: "a", worktreeName: "main", worktree: cwd, dev: "0", ino: "0", chain: "default", access: "read-only", sessionKey: "k" } };
  const r = await runner(job, { signal: new AbortController().signal, update: () => {}, onProcess: () => {}, requestApproval: async () => false });
  const all = JSON.stringify(r);
  assert.ok(!all.includes("123456") && !all.includes(token), all);
});
