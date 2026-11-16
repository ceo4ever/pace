import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AgentError, runAgent, type Executor } from "../src/agent/contract.ts";
import { claudeAcp, createAcpExecutor } from "../src/agent/acp-executor.ts";
import { claudeP, createPExecutor as createExecutor, type PAdapter } from "../src/agent/p-executor.ts";
import { memoryCooldownStore, runChain, parseChainConfig, resolveChain } from "../src/agent/chain.ts";
import { tempDir } from "./helpers.ts";

const FAKE = join(import.meta.dirname, "fake-acp-agent.mjs");
const trusted = { ...claudeAcp, readOnlyVersions: ["9.9.9"] };
const acp = () => createAcpExecutor(trusted, { command: process.execPath, args: [FAKE, "hang", "", "", ""], graceMs: 300 });
const base = (extra = {}) => ({ agent: "claude", mode: "acp", prompt: "x", cwd: tempDir(), timeoutMs: 20_000, ...extra });

function sleepyP(dir: string): Executor {
  const script = join(dir, "sleepy.js");
  writeFileSync(script, `#!/usr/bin/env node\nrequire("fs").readFileSync(0,"utf8");setInterval(()=>{},1000);\n`);
  chmodSync(script, 0o755);
  const adapter: PAdapter = { ...claudeP, build(request) { const inv = claudeP.build(request); return { ...inv, args: [script] }; } };
  return createExecutor(adapter, { command: process.execPath, sessionDir: join(dir, "s") });
}

test("ACP: 실행 중 abort하면 cancelled로 끝나고 오래 걸리지 않는다", async () => {
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 400);
  const started = Date.now();
  await assert.rejects(runAgent(acp(), base(), { signal: ac.signal }), (e: AgentError) => e.code === "cancelled" && !e.cleanupUnconfirmed);
  assert.ok(Date.now() - started < 8000);
});

test("ACP: 시작 전에 이미 abort된 신호는 시작하지 않는다", async () => {
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(runAgent(acp(), base(), { signal: ac.signal }), (e: AgentError) => e.code === "cancelled" && !e.started);
});

test("-p: signal만 있는 훅은 허용되고 abort하면 프로세스 그룹을 회수한다", async () => {
  const dir = tempDir();
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 500);
  await assert.rejects(runAgent(sleepyP(dir), base({ mode: "p" }), { signal: ac.signal }), (e: AgentError) => e.code === "cancelled");
});

test("-p: signal 외 훅은 여전히 unsupported_option", async () => {
  const dir = tempDir();
  await assert.rejects(runAgent(sleepyP(dir), base({ mode: "p" }), { paceMcp: true }), (e: AgentError) => e.code === "unsupported_option");
});

test("체인: abort는 폴백하지 않고 cancelled(종료 15)로 끝난다", async () => {
  const dir = tempDir();
  const config = parseChainConfig({ chains: { c: { steps: [{ agent: "claude", mode: "p" }, { agent: "claude", mode: "acp" }], write_fallback: "observed" } } });
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 500);
  const pExec = sleepyP(dir);
  let acpCalled = 0;
  const outcome = await runChain(resolveChain(config, "c"), { prompt: "x", cwd: dir, access: "write", timeoutMs: 20_000 }, {
    find: (agent, mode) => (mode === "p" ? pExec : { ...acp(), run: async () => { acpCalled++; throw new Error("호출되면 안 됨"); } }),
    cooldowns: memoryCooldownStore(),
    signal: ac.signal,
    snapshot: () => { throw new Error("비 git"); },
  });
  assert.equal(acpCalled, 0);
  assert.equal(outcome.status === "failed" || outcome.status === "handoff_required", true);
  if (outcome.status === "failed") assert.equal(outcome.error.code, "cancelled");
  else assert.ok(outcome.attempts.length === 1);
});
