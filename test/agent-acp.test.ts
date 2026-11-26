import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { AgentError, runAgent } from "../src/agent/contract.ts";
import { claudeAcp, codexAcp, createAcpExecutor } from "../src/agent/acp-executor.ts";
import { reaperStats } from "../src/agent/process.ts";
import { tempDir } from "./helpers.ts";

const FAKE = join(import.meta.dirname, "fake-acp-agent.mjs");
const trusted = { ...claudeAcp, readOnlyVersions: ["9.9.9"] };
const exec = (behavior: string, files: { log?: string; pid?: string; version?: string } = {}, graceMs = 300, idleMs?: number) =>
  createAcpExecutor(trusted, { command: process.execPath, args: [FAKE, behavior, files.log ?? "", files.pid ?? "", files.version ?? ""], graceMs, idleMs });
const req = (extra = {}) => ({ agent: "claude", mode: "acp", prompt: "검토해 줘", cwd: tempDir(), timeoutMs: 5000, ...extra });

test("ACP 정상 흐름: 청크를 모으고 읽기 전용 모드를 확인한 뒤 종료한다", async () => {
  const dir = tempDir();
  const log = join(dir, "log");
  const r = await runAgent(exec("ok", { log }), req());
  const logged = readFileSync(log, "utf8");
  assert.equal(r.text, "안녕하세요");
  assert.equal(r.stop_reason, "end_turn");
  assert.deepEqual(r.usage, { input_tokens: 11, output_tokens: 22 });
  assert.equal(r.session_id, "sess-1");
  assert.deepEqual(r.model, { value: "fake-model", source: "reported" });
  assert.match(r.enforcement, /ACP 모드 default .*강제 거절\(어댑터가 묻는 요청\)/);
  assert.match(logged, /recv initialize .*"clientCapabilities":\{\}/, "빈 clientCapabilities");
  assert.match(logged, /set_mode .*"modeId":"default"/, "claude 어댑터는 default 모드 — plan은 밖 읽기를 권한 요청 없이 실행");
  assert.match(logged, /stdin-eof/);
  assert.match(logged, /session\/new .*"settingSources":\[\].*"allowDangerouslySkipPermissions":false/, "설정 격리·우회 금지 전달");
});

test("검증하지 않은 어댑터 버전은 읽기 전용 요청 거부, 쓰기는 진행", async () => {
  await assert.rejects(runAgent(exec("ok", { version: "1.0.0" }), req()), (e: AgentError) => e.code === "read_only_unenforceable" && /1\.0\.0/.test(e.message));
  assert.equal((await runAgent(exec("ok", { version: "1.0.0" }), req({ access: "write" }))).text, "안녕하세요");
});

test("읽기 전용 모드를 확인 못 한 어댑터는 거부", async () => {
  await assert.rejects(runAgent(exec("nomodes"), req()), (e: AgentError) => e.code === "read_only_unenforceable");
  // 쓰기 요청은 모드 없이도 진행(권한은 여전히 기본 거절)
  assert.equal((await runAgent(exec("nomodes"), req({ access: "write" }))).text, "안녕하세요");
});

test("권한 요청은 기본 거절(execute는 write여도 거절)", async () => {
  assert.equal((await runAgent(exec("perm"), req())).text, "choice=no");
  assert.equal((await runAgent(exec("perm"), req({ access: "write" }))).text, "choice=no");
});

test("쓰기 허용 권한: kind·_meta가 충돌하면 거절, 일치하고 허용 도구면 한 번 허용", async () => {
  assert.equal((await runAgent(exec("perm-conflict"), req({ access: "write" }))).text, "choice=no");
  assert.equal((await runAgent(exec("perm-edit"), req({ access: "write" }))).text, "choice=yes");
  assert.equal((await runAgent(exec("perm-edit"), req())).text, "choice=no", "읽기 전용에서는 허용 안 함");
  assert.equal((await runAgent(exec("perm-kind-only"), req({ access: "write" }))).text, "choice=no", "표시 하나(kind)만으로는 허용 안 함");
});

test("무출력이 idle 기한을 넘기면 취소한다", async () => {
  await assert.rejects(runAgent(exec("hang", {}, 300, 400), req({ timeoutMs: 5000 })), (e: AgentError) => e.code === "timeout" && /아무 메시지도/.test(e.message));
});

test("timeout: 초기화가 늦어도 요청 기한은 지키고 프로세스를 회수한다", async () => {
  // 600ms 내 초기화/로그 생성은 보장하지 않는다. timeout 자체와 회수만 검증한다.
  await assert.rejects(runAgent(exec("delayed:2000:hang"), req({ timeoutMs: 600 })), (e: AgentError) => e.code === "timeout" && !e.cleanupUnconfirmed);
});

test("준비 완료 뒤 취소: cancel → EOF → 그룹 종료, 말 안 듣는 어댑터와 자손도 회수", async () => {
  const dir = tempDir();
  const log = join(dir, "log");
  const cancelReady = async (behavior: string, files: { log?: string; pid?: string }) => {
    const controller = new AbortController();
    let markReady!: (update: Record<string, unknown>) => void;
    const ready = new Promise<Record<string, unknown>>((resolve) => { markReady = resolve; });
    const running = runAgent(exec(behavior, files), req({ timeoutMs: 15_000 }), {
      signal: controller.signal,
      onEvent: (update) => { if (update.sessionUpdate === "test_ready") markReady(update); },
    });
    try {
      const update = await Promise.race([ready, running.then(() => { throw new Error("준비 장벽 전에 실행이 끝났다"); })]);
      controller.abort();
      await assert.rejects(running, (e: AgentError) => e.code === "cancelled" && !e.cleanupUnconfirmed);
      return update;
    } finally { controller.abort(); await running.catch(() => {}); }
  };
  // 기존 600ms보다 늦게 시작해도 장벽 뒤의 취소 순서 단언은 그대로다.
  await cancelReady("delayed:900:hang-ready", { log });
  const logged = readFileSync(log, "utf8");
  const cancel = logged.indexOf("cancel"), eof = logged.indexOf("stdin-eof");
  assert.ok(cancel >= 0 && eof > cancel, "cancel과 EOF를 관측했고 cancel이 먼저다");

  const pidFile = join(dir, "pid");
  const stubborn = await cancelReady("stubborn-ready", { pid: pidFile });
  assert.ok(existsSync(pidFile));
  const childPid = Number(readFileSync(pidFile, "utf8"));
  assert.equal(stubborn.childPid, childPid, "준비 장벽은 실제 생성한 자손의 PID를 확인한다");
  assert.throws(() => process.kill(childPid, 0), /ESRCH/);
});

test("미지원 옵션과 없는 어댑터는 오류", async () => {
  await assert.rejects(runAgent(exec("ok"), req({ model: "x" })), (e: AgentError) => e.code === "unsupported_option");
  assert.deepEqual((await runAgent(exec("ok"), req({ model: "other-model" }))).model, { value: "other-model", source: "requested" });
  await assert.rejects(runAgent(exec("ok"), req({ effort: "high" })), (e: AgentError) => e.code === "unsupported_option");
  await assert.rejects(runAgent(createAcpExecutor(claudeAcp, { command: "/no/such/acp-adapter" }), req()), (e: AgentError) => e.code === "executor_unavailable");
});

test("시작 전 표지(started:false)는 프로세스를 띄우기 전 거부에만 붙는다 — 띄운 뒤의 거부(버전·모드)는 시작된 것으로 본다", async () => {
  // 프로세스 실행 전: 실측하지 못한 어댑터의 읽기 전용 요청, 실행 파일 없음
  await assert.rejects(runAgent(createAcpExecutor(codexAcp, { command: "/no/such" }), req({ agent: "codex" })), (e: AgentError) => e.code === "read_only_unenforceable" && e.started === false);
  await assert.rejects(runAgent(createAcpExecutor(claudeAcp, { command: "/no/such/acp-adapter" }), req()), (e: AgentError) => e.code === "executor_unavailable" && e.started === false);
  // 프로세스를 띄운 뒤: 어댑터 버전 불일치·읽기 전용 모드 없음 — 초기화·세션 생성 중 변경 가능성이 있어 시작된 것으로 본다
  await assert.rejects(runAgent(exec("ok", { version: "1.0.0" }), req()), (e: AgentError) => e.code === "read_only_unenforceable" && e.started === true && e.cleanupUnconfirmed === false);
  await assert.rejects(runAgent(exec("nomodes"), req()), (e: AgentError) => e.code === "read_only_unenforceable" && e.started === true);
});

test("S-16 ACP effort: 광고된 값은 set_config_option으로 지정하고, 광고 없거나 없는 값·effort 미지원 어댑터는 오류", async () => {
  const dir = tempDir();
  const log = join(dir, "log");
  const r = await runAgent(exec("effort", { log }), req({ effort: "high" }));
  assert.equal(r.text, "안녕하세요");
  assert.match(readFileSync(log, "utf8"), /recv session\/set_config_option .*"configId":"effort".*"value":"high"/);
  await assert.rejects(runAgent(exec("effort"), req({ effort: "xhigh" })), (e: AgentError) => e.code === "unsupported_option" && /광고하지 않은 effort/.test(e.message));
  await assert.rejects(runAgent(exec("ok"), req({ effort: "high" })), (e: AgentError) => e.code === "unsupported_option" && /광고 없음/.test(e.message));
  const codex = createAcpExecutor({ ...codexAcp, readOnlyVersions: ["9.9.9"] }, { command: process.execPath, args: [FAKE, "effort", "", "", ""] });
  await assert.rejects(runAgent(codex, req({ agent: "codex", effort: "high" })), (e: AgentError) => e.code === "unsupported_option" && /지원하지 않는다/.test(e.message));
  assert.equal(claudeAcp.effortConfig, true);
  assert.equal(codexAcp.effortConfig, undefined);
});

test("실측으로 강제를 확인하지 못한 어댑터(codex-acp)는 읽기 전용 요청을 실행 전에 거부", async () => {
  const dir = tempDir();
  const log = join(dir, "log");
  const unverified = createAcpExecutor(codexAcp, { command: process.execPath, args: [FAKE, "ok", log, ""] });
  await assert.rejects(runAgent(unverified, req({ agent: "codex" })), (e: AgentError) => e.code === "read_only_unenforceable");
  assert.equal(existsSync(log), false, "프로세스를 띄우지 않았다");
  assert.equal((await runAgent(unverified, req({ agent: "codex", access: "write" }))).text, "안녕하세요");
});

test("본문이 빈 정상 종료는 계약 위반 — 거절한 권한 요청 수와 함께 오류", async () => {
  await assert.rejects(runAgent(exec("perm-empty"), req()), (e: AgentError) => e.code === "agent_failed" && /비어 있다.*거절한 권한 요청 1건/.test(e.message));
});

test("독립 감시자는 요청마다 정확히 한 번만 만든다(메시지 수와 무관)", async () => {
  if (process.platform === "win32") return;
  const before = reaperStats.started;
  const r = await runAgent(exec("many"), req());
  assert.ok(r.text.length > 60, "청크 60개 이상을 받았다");
  assert.equal(reaperStats.started - before, 1);
});

test("Windows ACP: 회수 완료 뒤 감시자 종료 통지가 늦어도 성공한다", { skip: process.platform !== "win32" ? "Windows 감시자 경합" : false }, async () => {
  const dir = tempDir(), preload = join(dir, "delay-supervisor.mjs");
  writeFileSync(preload, `if (process.argv[1]?.endsWith('windows-supervisor.ts')) setTimeout(() => {}, 3000);`);
  const old = process.env.NODE_OPTIONS;
  try {
    process.env.NODE_OPTIONS = `--import=${pathToFileURL(preload).href}`;
    const result = await runAgent(exec("perm-edit"), req({ access: "write" }));
    assert.equal(result.text, "choice=yes");
  } finally {
    if (old === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = old;
  }
});
