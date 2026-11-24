import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { AgentError, normalizeResult, runAgent, validateRequest, type PermissionInfo, type RunHooks } from "../src/agent/contract.ts";
import { claudeAcp, codexAcp, createAcpExecutor } from "../src/agent/acp-executor.ts";
import { claudeP, createPExecutor } from "../src/agent/p-executor.ts";
import { memoryCooldownStore, runChain, type ChainDef } from "../src/agent/chain.ts";
import { mcpToolName } from "../src/mcp/names.ts";
import { tempDir } from "./helpers.ts";

const FAKE = join(import.meta.dirname, "fake-acp-agent.mjs");
const trusted = { ...claudeAcp, readOnlyVersions: ["9.9.9"] };
const MCP_CMD = { command: process.execPath, args: ["/fake/pace.ts"] };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function exec(behavior: string, files: { log?: string; version?: string; resumeVariant?: string } = {}, extra: Record<string, unknown> = {}, adapter = trusted) {
  return createAcpExecutor(adapter, { command: process.execPath, args: [FAKE, behavior, files.log ?? "", "", files.version ?? "", files.resumeVariant ?? ""], graceMs: 300, mcpCommand: MCP_CMD, ...extra });
}
const req = (extra = {}) => ({ agent: "claude", mode: "acp", prompt: "검토해 줘", cwd: tempDir(), timeoutMs: 5000, ...extra });
const recv = (log: string, method: string): any[] =>
  readFileSync(log, "utf8").split("\n").filter((l) => l.startsWith(`recv ${method} `)).map((l) => JSON.parse(l.slice(`recv ${method} `.length)));
const choice = (text: string) => /choice=(\w+)/.exec(text)?.[1];

const MCP_READ = mcpToolName("memory_list");
const MCP_ADD = mcpToolName("memory_add");

test("S-8 paceMcp: 요청의 cwd·access로 mcpServers를 만들어 session/new에 싣고, 훅이 없으면 빈 배열", async () => {
  for (const access of ["read-only", "write"] as const) {
    const log = join(tempDir(), "log");
    const r = req({ access });
    await runAgent(exec("ok", { log }), r, { paceMcp: true });
    const [news] = recv(log, "session/new");
    assert.equal(news.mcpServers.length, 1);
    const server = news.mcpServers[0];
    assert.equal(server.name, "pace");
    assert.deepEqual(server.args, ["/fake/pace.ts", "mcp", "--workspace", r.cwd, "--access", access]);
    assert.ok(Array.isArray(server.env) && server.env.every((e: any) => typeof e.name === "string" && typeof e.value === "string"));
  }
  const log = join(tempDir(), "log");
  await runAgent(exec("ok", { log }), req());
  assert.deepEqual(recv(log, "session/new")[0].mcpServers, []);
});

async function permit(behavior: string, access: "read-only" | "write", hooks?: RunHooks, extra: Record<string, unknown> = {}) {
  const r = await runAgent(exec(behavior, {}, extra), req({ access }), hooks);
  return choice(r.text);
}

test("S-8 결정표: 읽기 전용은 읽기 MCP 도구만 허용, 변경·편집·실행은 강제 거절", async () => {
  const hooks = { paceMcp: true };
  assert.equal(await permit(`permx:other:${MCP_READ}`, "read-only", hooks), "yes");
  assert.equal(await permit(`permx:other:${MCP_ADD}`, "read-only", hooks), "no");
  assert.equal(await permit("permx:execute:Bash", "read-only", hooks), "no");
  assert.equal(await permit("permx:edit:Edit", "read-only", hooks), "no");
  assert.equal(await permit("permx:read:Read", "read-only", hooks), "no", "default 모드에서 권한 요청으로 오는 읽기(작업 폴더 밖)는 강제 거절");
  assert.equal(await permit(`permx:other:${MCP_READ}`, "read-only"), "no", "paceMcp 없이는 MCP 도구도 거절(현재 정책)");
  // 쓰기: 변경 MCP 도구와 편집 도구는 기본 허용
  assert.equal(await permit(`permx:other:${MCP_ADD}`, "write", hooks), "yes");
  assert.equal(await permit("permx:edit:Edit", "write", hooks), "yes");
  assert.equal(await permit("permx:edit:@Write", "write", hooks), "yes", "실측: 내장 Write는 toolCall.name에 이름이 온다");
  assert.equal(await permit("permx:edit:@Write", "read-only", hooks), "no");
  assert.equal(await permit("permx:execute:Bash", "write", hooks), "no", "목록 밖 도구는 기본 거절");
});

test("S-8a 식별 실패·목록 밖은 결정표대로 — 강제 거절은 콜백을 부르지 않는다", async () => {
  for (const access of ["read-only", "write"] as const) {
    const calls: PermissionInfo[] = [];
    const hooks: RunHooks = { paceMcp: true, onPermission: (i) => { calls.push(i); return "allow"; } };
    // 식별 실패: kind≠_meta.kind, 도구 이름 없음
    assert.equal(await permit("permx:edit:Edit:execute", access, hooks), "no", `표시 충돌 ${access}`);
    assert.equal(await permit("permx:other:none", access, hooks), "no", `이름 없음 ${access}`);
    assert.equal(await permit("permx:edit:Edit|Bash", access, hooks), "no", `이름 표시 모순 ${access}`);
    assert.equal(calls.length, 0, `식별 실패는 콜백을 부르지 않는다(${access})`);
  }
  // 읽기 전용: 다른 서버 접두·kind가 execute인 읽기 도구 이름·변경 도구 → 강제 거절, 콜백 미호출
  const calls: PermissionInfo[] = [];
  const hooks: RunHooks = { paceMcp: true, onPermission: (i) => { calls.push(i); return "allow"; } };
  assert.equal(await permit("permx:other:mcp__evil__memory_list", "read-only", hooks), "no");
  assert.equal(await permit(`permx:execute:${MCP_READ}`, "read-only", hooks), "no");
  assert.equal(await permit(`permx:other:${MCP_ADD}`, "read-only", hooks), "no");
  assert.equal(await permit("permx:other:MCP__OTHER__MEMORY_LIST", "read-only", hooks), "no");
  assert.equal(calls.length, 0, "읽기 전용의 강제 거절은 콜백 allow가 있어도 호출되지 않는다");
  // 쓰기: 식별됐지만 목록 밖인 도구 → 기본 거절, 콜백 allow가 있어야 허용
  assert.equal(await permit("permx:other:mcp__evil__memory_list", "write", { paceMcp: true }), "no");
  assert.equal(await permit("permx:other:mcp__evil__memory_list", "write", hooks), "yes");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.defaultDecision, "reject");
});

test("S-9 콜백: 기본 허용은 낮출 수만, 읽기 전용은 허용을 만들 수 없고, 쓰기의 기본 거절은 올릴 수 있다", async () => {
  const seen: PermissionInfo[] = [];
  const decide = (d: "allow" | "reject") => ({ paceMcp: true, onPermission: (i: PermissionInfo) => { seen.push(i); return d; } });
  // 쓰기 + 편집 도구(기본 허용) + 콜백 reject → 거절, 파일 쓰기 없음(가짜는 choice만 돌려줌)
  assert.equal(await permit("permx:edit:Edit", "write", decide("reject")), "no");
  assert.equal(seen[0]!.toolName, "Edit");
  assert.equal(seen[0]!.defaultDecision, "allow");
  assert.equal(seen[0]!.access, "write");
  // 읽기 전용 + 읽기 MCP 도구(기본 허용) + 콜백 reject → 거절 / allow → 그대로 허용
  assert.equal(await permit(`permx:other:${MCP_READ}`, "read-only", decide("reject")), "no");
  assert.equal(await permit(`permx:other:${MCP_READ}`, "read-only", decide("allow")), "yes");
  // 읽기 전용 + 콜백 allow로 편집·실행을 열 수 없다(강제 거절)
  assert.equal(await permit("permx:edit:Edit", "read-only", decide("allow")), "no");
  assert.equal(await permit("permx:execute:Bash", "read-only", decide("allow")), "no");
  // 쓰기 + 기본 거절 + 콜백
  assert.equal(await permit("permx:execute:Bash", "write", decide("allow")), "yes");
  assert.equal(await permit("permx:execute:Bash", "write", decide("reject")), "no");
  // 콜백이 던지거나 시간 초과면 거절
  assert.equal(await permit("permx:edit:Edit", "write", { onPermission: () => { throw new Error("콜백 오류"); } }), "no");
  assert.equal(await permit("permx:edit:Edit", "write", { onPermission: async () => { await sleep(600); return "allow" as const; }, permissionTimeoutMs: 100 }), "no", "늦은 allow는 적용되지 않는다");
  // 콜백 없음 = 지금 정책(편집 도구 허용)
  assert.equal(await permit("permx:edit:Edit", "write"), "yes");
});

test("S-9 취소 뒤 늦게 도착한 콜백 allow는 응답으로 나가지 않는다", async () => {
  const log = join(tempDir(), "log");
  const hooks: RunHooks = { onPermission: async () => { await sleep(900); return "allow" as const; } };
  await assert.rejects(runAgent(exec("permx:edit:Edit", { log }), req({ access: "write", timeoutMs: 400 }), hooks), (e: AgentError) => e.code === "timeout");
  await sleep(1100);
  assert.doesNotMatch(readFileSync(log, "utf8"), /"optionId":"yes"|"outcome":"selected"/, "닫힌 세션에 응답을 보내지 않는다");
});

test("S-10 이벤트: plan·tool_call·메시지·모르는 종류가 순서대로 전달되고 원본 저장과 일치한다", async () => {
  const raw = tempDir();
  const got: string[] = [];
  const r = await runAgent(exec("events"), req({ rawDir: raw }), { onEvent: (u) => { got.push(String(u.sessionUpdate)); } });
  assert.deepEqual(got, ["plan", "tool_call", "tool_call_update", "x_future_kind", "agent_message_chunk"]);
  assert.deepEqual(r.events, { delivered: 5, dropped: 0, failed: 0, consumerStuck: false });
  const original = readFileSync(r.raw_path!, "utf8").split("\n").filter((l) => l.startsWith("< ") && l.includes("session/update")).map((l) => JSON.parse(l.slice(2)).params.update.sessionUpdate);
  assert.deepEqual(original, got, "원본의 session/update 줄 순서와 같다");
  // 훅이 없으면 events 필드도 없다
  assert.equal((await runAgent(exec("events"), req())).events, undefined);
});

test("S-10b 던지는·멈춘·느린 콜백이 실행을 막지 않고 집계가 맞는다", async () => {
  const thrown = await runAgent(exec("events"), req(), { onEvent: () => { throw new Error("콜백 오류"); } });
  assert.deepEqual(thrown.events, { delivered: 0, dropped: 0, failed: 5, consumerStuck: false });
  assert.equal(thrown.text.length > 0, true);

  // 한 호출이 시간을 넘기면 소비자를 포기하고 이후 이벤트는 dropped — 동시에 도는 콜백은 하나뿐
  let inflight = 0, maxInflight = 0, calls = 0;
  const t0 = Date.now();
  const stuck = await runAgent(exec("events-many:30"), req(), {
    eventTimeoutMs: 50,
    onEvent: async () => { calls++; inflight++; maxInflight = Math.max(maxInflight, inflight); await new Promise(() => {}); },
  });
  assert.ok(Date.now() - t0 < 4000, "멈춘 콜백이 실행을 지연시키지 않는다");
  assert.equal(stuck.events!.consumerStuck, true);
  assert.equal(calls, 1);
  assert.equal(maxInflight, 1);
  assert.equal(stuck.events!.delivered + stuck.events!.dropped + stuck.events!.failed, 30);

  // 큐 상한 초과: 앞의 것만 순서대로 전달, 나머지는 dropped, 합이 방출 수
  const seqs: number[] = [];
  const over = await runAgent(exec("events-many:50", {}, { eventQueueLimit: 10 }), req(), { onEvent: async (u) => { seqs.push(Number(u.seq)); await sleep(5); } });
  assert.equal(over.events!.delivered + over.events!.dropped + over.events!.failed, 50);
  assert.ok(over.events!.dropped > 0, "상한을 넘어 일부 버렸다");
  assert.deepEqual([...seqs].sort((a, b) => a - b), seqs, "받은 이벤트의 순서가 뒤집히지 않는다");
});

test("S-10b 콜백이 받은 이벤트를 바꿔도 실행기의 본문·집계는 영향받지 않는다", async () => {
  const r = await runAgent(exec("events"), req(), { onEvent: (u) => { (u as any).sessionUpdate = "변조"; (u as any).content = { type: "text", text: "변조" }; } });
  assert.equal(r.text, "완료");
  assert.deepEqual(r.events, { delivered: 5, dropped: 0, failed: 0, consumerStuck: false });
});

test("S-10c 원본 기록이 상한에서 멈추고 잘림 표지를 남기되 이벤트 전달·종료는 정상", async () => {
  const raw = tempDir();
  const got: string[] = [];
  const r = await runAgent(exec("events-many:200", {}, { rawLimitBytes: 2000 }), req({ rawDir: raw }), { onEvent: (u) => { got.push(String(u.sessionUpdate)); } });
  assert.equal(got.length, 200, "이벤트는 전부 전달");
  const text = readFileSync(r.raw_path!, "utf8");
  assert.match(text, /# 원본 기록이 2000바이트를 넘어 여기서 멈췄다/);
  assert.ok(statSync(r.raw_path!).size < 2600, "상한 근처에서 멈춘다");
  assert.equal(r.text.length, 201, "본문은 전부 모은다");
});

test("S-11 정체성 맥락·요약은 새 세션의 첫 프롬프트 앞에만 붙고 resume에는 붙지 않는다", async () => {
  const log = join(tempDir(), "log");
  await runAgent(exec("ok", { log }), req(), { context: "[CTX]", handoffSummary: "요약 본문" });
  const [prompt] = recv(log, "session/prompt");
  assert.equal(prompt.prompt[0].text, "[CTX]\n\n[이전 대화 요약]\n요약 본문\n\n[현재 요청]\n검토해 줘");
  const log2 = join(tempDir(), "log");
  const r = req();
  await runAgent(exec("ok", { log: log2 }), { ...r, resume: "sess-1" }, { context: "[CTX]", handoffSummary: "요약", savedSession: { sessionId: "sess-1", agent: "claude", cwd: r.cwd, access: "read-only" } });
  assert.equal(recv(log2, "session/prompt")[0].prompt[0].text, "검토해 줘");
  // 훅이 없으면 프롬프트 그대로
  const log3 = join(tempDir(), "log");
  await runAgent(exec("ok", { log: log3 }), req());
  assert.equal(recv(log3, "session/prompt")[0].prompt[0].text, "검토해 줘");
});

test("S-12 resume: session/resume으로 같은 세션을 잇고 읽기 전용은 모드를 다시 설정한다", async () => {
  for (const access of ["read-only", "write"] as const) {
    const log = join(tempDir(), "log");
    const r = req({ access });
    const result = await runAgent(exec("ok", { log }), { ...r, resume: "sess-1" }, { paceMcp: true, savedSession: { sessionId: "sess-1", agent: "claude", cwd: r.cwd, access } });
    assert.equal(result.session_id, "sess-1");
    assert.equal(result.text, "안녕하세요");
    assert.equal(recv(log, "session/new").length, 0, "session/new를 보내지 않는다");
    const [resumed] = recv(log, "session/resume");
    assert.equal(resumed.sessionId, "sess-1");
    assert.deepEqual(resumed.mcpServers[0].args.slice(-4), ["--workspace", r.cwd, "--access", access], "이번 요청의 cwd·access로 새로 만든 MCP 설정");
    assert.equal(recv(log, "session/set_mode").length, access === "read-only" ? 1 : 0);
    assert.equal(recv(log, "session/prompt")[0].sessionId, "sess-1");
  }
});

test("S-12 resume 진입점: 저장 기록 없음·다른 세션 ID·불일치는 session_mismatch이고 어떤 ACP 메시지도 보내지 않는다", async () => {
  const r = req();
  const saved = { sessionId: "sess-1", agent: "claude" as const, cwd: r.cwd, access: "read-only" as const };
  const cases: [string, RunHooks | undefined][] = [
    ["저장 기록 없음", undefined],
    ["훅은 있으나 savedSession 없음", { paceMcp: true }],
    ["다른 sessionId", { savedSession: { ...saved, sessionId: "sess-OTHER" } }],
    ["다른 access", { savedSession: { ...saved, access: "write" } }],
    ["다른 cwd", { savedSession: { ...saved, cwd: tempDir() } }],
    ["다른 agent", { savedSession: { ...saved, agent: "codex" } }],
  ];
  for (const [label, hooks] of cases) {
    const log = join(tempDir(), "log");
    await assert.rejects(runAgent(exec("ok", { log }), { ...r, resume: "sess-1" }, hooks), (e: AgentError) => e.code === "session_mismatch" && e.started === false, label);
    assert.equal(existsSync(log), false, `${label}: 프로세스를 띄우지 않았다`);
  }
});

test("S-12 resume 미지원 어댑터(codex)와 -p 실행기는 unsupported_option", async () => {
  const codex = createAcpExecutor({ ...codexAcp, readOnlyVersions: ["9.9.9"] }, { command: process.execPath, args: [FAKE, "ok", "", "", ""] });
  const r = req({ agent: "codex", resume: "sess-1" });
  await assert.rejects(runAgent(codex, r), (e: AgentError) => e.code === "unsupported_option");
  await assert.rejects(codex.run(validateRequest(r), { savedSession: { sessionId: "sess-1", agent: "codex", cwd: r.cwd, access: "read-only" } }), (e: AgentError) => e.code === "unsupported_option" && e.started === false, "executor.run을 직접 불러도 거부");
  const p = createPExecutor(claudeP, { command: "/no/such/claude" });
  for (const hooks of [{ paceMcp: true }, { onEvent: () => {} }, { context: "x" }, { onPermission: () => "allow" as const }] as RunHooks[]) {
    await assert.rejects(p.run(validateRequest({ agent: "claude", mode: "p", prompt: "x", cwd: tempDir() }), hooks), (e: AgentError) => e.code === "unsupported_option" && e.started === false);
  }
});

test("S-12b resume 재적용을 확인하지 못하면 프롬프트를 보내지 않는다 — 읽기 전용은 전부, 쓰기는 resume 오류만 중단", async () => {
  const r = req();
  const saved = (access: "read-only" | "write") => ({ sessionId: "sess-1", agent: "claude" as const, cwd: r.cwd, access });
  const run = (variant: string, access: "read-only" | "write", log: string) => runAgent(exec("ok", { log, resumeVariant: variant }), { ...r, access, resume: "sess-1" }, { savedSession: saved(access) });
  for (const variant of ["nomodes", "seterr", "err"]) {
    const log = join(tempDir(), "log");
    await assert.rejects(run(variant, "read-only", log), (e: AgentError) => e.code === "read_only_unenforceable" && e.started === false, `읽기 전용 ${variant}`);
    assert.equal(recv(log, "session/prompt").length, 0, `읽기 전용 ${variant}: prompt 미전송`);
  }
  const logErr = join(tempDir(), "log");
  await assert.rejects(run("err", "write", logErr), (e: AgentError) => e.code === "agent_failed" && e.started === false);
  assert.equal(recv(logErr, "session/prompt").length, 0);
  const logOk = join(tempDir(), "log");
  assert.equal((await run("nomodes", "write", logOk)).text, "안녕하세요", "쓰기에서 modes 누락은 정상 진행");
  assert.equal(recv(logOk, "session/prompt").length, 1);
});

test("S-12c enforcement 문구가 콜백을 안전장치(실측 조합)와 정책 위임(강제 미확인)으로 구분한다", async () => {
  const onPermission = () => "reject" as const;
  const ro = await runAgent(exec("ok"), req(), { onPermission });
  assert.match(ro.enforcement, /콜백=안전장치\(실측 조합/);
  const rw = await runAgent(exec("ok"), req({ access: "write" }), { onPermission });
  assert.match(rw.enforcement, /콜백=정책 위임\(강제 미확인\)/);
  const codex = createAcpExecutor(codexAcp, { command: process.execPath, args: [FAKE, "ok", "", "", ""], graceMs: 300 });
  const cw = await runAgent(codex, req({ agent: "codex", access: "write" }), { onPermission });
  assert.match(cw.enforcement, /정책 위임/);
  await assert.rejects(runAgent(codex, req({ agent: "codex" }), { onPermission }), (e: AgentError) => e.code === "read_only_unenforceable");
  const plain = await runAgent(exec("ok"), req());
  assert.doesNotMatch(plain.enforcement, /콜백|MCP/);
  const mcp = await runAgent(exec("ok"), req(), { paceMcp: true });
  assert.match(mcp.enforcement, /MCP pace 서버 read-only/);
});

test("체인은 훅을 ACP 단계에만 넘긴다", async () => {
  const seen: { mode: string; hooks: RunHooks | undefined }[] = [];
  const mk = (mode: "acp" | "p") => ({
    agent: "claude" as const, mode, readOnlyEnforced: true,
    capabilities: { models: true, effort: true, systemPrompt: false, resume: false, writeAccess: true },
    async run(request: any, hooks?: RunHooks) {
      seen.push({ mode, hooks });
      if (mode === "acp") throw new AgentError("executor_unavailable", "없음", { started: false });
      return normalizeResult(request, { text: "p 성공" }, { durationMs: 1, enforcement: "fake" });
    },
  });
  const execs = [mk("acp"), mk("p")];
  const chain: ChainDef = { name: "c", steps: [{ agent: "claude", mode: "acp" }, { agent: "claude", mode: "p" }], fallbackOnTimeout: false, writeFallback: "never", defaultCooldownMinutes: 30 };
  const hooks: RunHooks = { paceMcp: true };
  const outcome: any = await runChain(chain, { prompt: "x", cwd: tempDir(), access: "write", timeoutMs: 5000 }, { find: (a, m) => execs.find((e) => e.agent === a && e.mode === m), cooldowns: memoryCooldownStore(), snapshot: () => ({}) as any, hooks });
  assert.equal(outcome.status, "ok");
  assert.deepEqual(seen.map((s) => [s.mode, s.hooks === hooks]), [["acp", true], ["p", false]]);
});
