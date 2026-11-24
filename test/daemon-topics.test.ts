import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs, { copyFileSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { test } from "node:test";
import { configFile, loadConfig, updateConfigFile } from "../src/daemon/config.ts";
import { runDaemon } from "../src/daemon/index.ts";
import { logFile, readStatus, requestStop } from "../src/daemon/instance.ts";
import { StateStore } from "../src/daemon/store.ts";
import { telegramStateFile, writeTelegramSecret } from "../src/daemon/telegram/index.ts";
import { forumProof } from "../src/daemon/telegram/provisioning.ts";
import { loadTelegramState } from "../src/daemon/telegram/state.ts";
import { daemonWorkspaceCommand } from "../src/daemon/workspace-cli.ts";
import { approveWorkspacePlan, planWorkspaceAdd } from "../src/daemon/workspace.ts";
import { AGENT_BUDGET } from "../src/project/agent-definition.ts";
import { listCandidates, registerWorkspace, relocateWorkspace } from "../src/project/workspace-registry.ts";
import { rawSocket, tokenOf, wsConnect } from "./daemon-proc-helpers.ts";
import { PACE_BIN, sessionFreeEnv, spawnTestChild, tempDir } from "./helpers.ts";
import { CHAT, STRANGER, TOKEN, U1, until } from "./telegram-helpers.ts";
import { MockTelegram } from "./telegram-mock.ts";

const FIRST_THREAD = 876543210;
const RECOVERY_THREAD = 769483215;

async function cli(home: string, cwd: string, ...args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const proc = spawnTestChild(process.execPath, [PACE_BIN, "daemon", "workspace", ...args], {
    cwd, env: { ...sessionFreeEnv(), PACE_HOME: home, HOME: home, USERPROFILE: home, PACE_PROFILE: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "", stderr = "";
  proc.stdout!.setEncoding("utf8").on("data", (data: string) => { stdout += data; });
  proc.stderr!.setEncoding("utf8").on("data", (data: string) => { stderr += data; });
  return new Promise((done, fail) => {
    proc.once("error", fail);
    proc.once("close", (code) => done({ code, stdout, stderr }));
  });
}

test("저장소 하위 폴더에서 로컬 add 뒤 실행 중 포럼에 결속되고 첫 조회가 표식에 답한다", async () => {
  const home = tempDir(), root = realpathSync.native(tempDir("pace-topic-repo-"));
  execFileSync("git", ["-C", root, "init", "-q"]);
  const cwd = join(root, "sub");
  mkdirSync(cwd);
  writeFileSync(join(root, "marker.txt"), "TOPIC-PROJECT-MARKER");
  updateConfigFile(home, (raw) => { raw.allowedUsers = { telegram: [String(U1)] }; });
  const mock = await new MockTelegram(FIRST_THREAD).start();
  writeTelegramSecret(home, { token: TOKEN, chatId: String(CHAT), apiBase: mock.base });
  mock.fault("getChat", { status: 200, body: { ok: true, result: { id: CHAT, is_forum: true, title: "확인용 포럼" } } });
  const running = runDaemon({
    home, noSignals: true, out: () => {},
    runner: async (job) => {
      assert.equal(job.target.access, "read-only");
      return { status: "done", text: readFileSync(join(job.target.worktree, "marker.txt"), "utf8"), cleanupUnconfirmed: false };
    },
  });
  try {
    await until(() => readStatus(home)?.state === "running");
    const preview = await cli(home, cwd, "add", "--name", "test-topic");
    assert.equal(preview.code, 0, preview.stderr);
    assert.match(preview.stdout, /확인용 포럼/);
    assert.deepEqual(listCandidates(home), []);
    const result = await cli(home, cwd, "add", "--name", "test-topic", "--yes");
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /설정 반영 완료.*토픽 결속 완료/);
    const id = listCandidates(home).find((record) => record.path === root)?.id;
    assert.ok(id);
    const state = loadTelegramState(telegramStateFile(home));
    const entry = Object.entries(state?.topics ?? {}).find(([, topic]) => typeof topic !== "string" && topic.registryId === id);
    assert.ok(entry);
    assert.equal(mock.sent("createForumTopic").length, 1);
    assert.deepEqual(mock.sent("createForumTopic")[0]?.params, { chat_id: CHAT, name: "test-topic" });
    const thread = Number(entry[0]);
    mock.text(CHAT, thread, U1, "이 저장소의 표식을 읽어 줘");
    await until(() => mock.sent().some((call) => call.params.message_thread_id === thread && String(call.params.text).includes("TOPIC-PROJECT-MARKER")));

    const topicsBeforeRetry = loadTelegramState(telegramStateFile(home))?.topics;
    mock.fault("getChat", { status: 503, body: { ok: false }, times: 1 });
    const retry = await cli(home, cwd, "add", "--name", "test-topic", "--yes");
    assert.equal(retry.code, 0, retry.stderr);
    assert.match(retry.stdout, /설정 반영 완료.*토픽 기존 결속/);
    assert.match(retry.stdout, /포럼을 대조할 수 없다/);
    assert.equal(mock.sent("createForumTopic").length, 1);
    assert.deepEqual(loadTelegramState(telegramStateFile(home))?.topics, topicsBeforeRetry);
    hiddenValues(home, mock, [result.stdout, result.stderr, retry.stdout, retry.stderr], [root], [thread]);
  } finally {
    requestStop(home);
    assert.equal(await running, 0);
    await mock.close();
  }
});

function configureForum(home: string, mock: MockTelegram) {
  const secret = { token: TOKEN, chatId: String(CHAT), apiBase: mock.base };
  writeTelegramSecret(home, secret);
  updateConfigFile(home, (raw) => { raw.allowedUsers = { telegram: [String(U1)] }; });
  return secret;
}

async function stop(home: string, running: Promise<number>): Promise<void> {
  requestStop(home);
  assert.equal(await running, 0);
}

function hiddenValues(home: string, mock: MockTelegram, outputs: string[], privatePaths: string[], threads: number[] = []): void {
  const visible = [...outputs, readFileSync(logFile(home), "utf8"), ...mock.texts()].join("\n");
  for (const value of [home, ...privatePaths, TOKEN, String(CHAT)]) assert.equal(visible.includes(value), false, "감춰야 하는 값이 출력에 포함됐다");
  for (const thread of threads) assert.doesNotMatch(visible, new RegExp(`(?:^|\\D)${thread}(?!\\d)`), "토픽 ID가 보이는 본문에 포함됐다");
  for (const call of mock.sent("createForumTopic")) {
    assert.deepEqual(Object.keys(call.params).sort(), ["chat_id", "name"]);
    for (const value of [...privatePaths, TOKEN]) assert.equal(String(call.params.name).includes(value), false);
  }
}

test("정지·어댑터 미설정·포럼 변경은 설정 반영과 토픽 결속을 구분한다", async () => {
  const home = tempDir(), local = tempDir(), unavailable = tempDir(), unconfirmed = tempDir(), mismatch = tempDir(), changed = tempDir();
  const offline = await cli(home, local, "add", ".", "--name", "offline", "--yes");
  const outcomes = [offline.stdout, offline.stderr];
  assert.equal(offline.code, 0);
  assert.match(offline.stdout, /설정 기록 완료.*다음 daemon 기동.*토픽 미결속/);
  let running = runDaemon({ home, noSignals: true, out: () => {} });
  try {
    await until(() => readStatus(home)?.state === "running");
    const noAdapter = await cli(home, unavailable, "add", ".", "--name", "no-adapter", "--yes");
    outcomes.push(noAdapter.stdout, noAdapter.stderr);
    assert.equal(noAdapter.code, 0);
    assert.match(noAdapter.stdout, /설정 반영 완료.*토픽 미결속/);
    assert.match(noAdapter.stdout, /어댑터를 사용할 수 없다/);
  } finally { await stop(home, running); }

  const mock = await new MockTelegram(FIRST_THREAD).start();
  const secret = configureForum(home, mock);
  running = runDaemon({ home, noSignals: true, out: () => {} });
  try {
    await until(() => readStatus(home)?.state === "running");
    mock.fault("getChat", { status: 200, body: { ok: true, result: { id: CHAT, is_forum: false, title: "일반 그룹" } }, times: 1 });
    const noProof = await cli(home, unconfirmed, "add", ".", "--name", "unconfirmed", "--yes");
    assert.equal(noProof.code, 0);
    assert.match(noProof.stdout, /설정 반영 완료.*토픽 미결속/);
    assert.match(noProof.stdout, /포럼을 대조할 수 없다/);
    assert.equal(mock.sent("createForumTopic").length, 0);
    assert.ok(loadConfig(home).workspaces.some((ws) => ws.name === "unconfirmed"));
    outcomes.push(noProof.stdout, noProof.stderr);
    const output: string[] = [];
    const wrongForum = await daemonWorkspaceCommand(["add", ".", "--name", "wrong-forum"], {
      home, cwd: mismatch, interactive: true, out: (line) => output.push(line),
      ask: async () => {
        assert.ok(output.some((line) => line.includes("포럼: 시험 포럼")));
        writeTelegramSecret(home, { ...secret, chatId: String(CHAT - 5) });
        return true;
      },
    });
    assert.equal(wrongForum, 0);
    const result = output.filter((line) => !line.startsWith("실경로:")).join("\n");
    outcomes.push(result);
    assert.match(result, /설정 반영 완료.*토픽 미결속/);
    assert.match(result, /포럼을 대조할 수 없다/);
    assert.equal(mock.sent("createForumTopic").length, 0);
    assert.ok(loadConfig(home).workspaces.some((ws) => ws.name === "wrong-forum"));
    await stop(home, running);

    const out: string[] = [];
    running = runDaemon({ home, noSignals: true, out: (line) => out.push(line) });
    await until(() => readStatus(home)?.state === "running");
    assert.ok(out.some((line) => line.includes("저장된 토픽 결속의 포럼이 설정과 다르다")));
    const rebound = await cli(home, changed, "add", ".", "--name", "changed-forum", "--yes");
    assert.match(rebound.stdout, /어댑터를 사용할 수 없다/);
    assert.equal(mock.sent("createForumTopic").length, 0);
    outcomes.push(rebound.stdout, rebound.stderr, ...out);
    hiddenValues(home, mock, outcomes, [local, unavailable, unconfirmed, mismatch, changed]);
    assert.ok(outcomes.every((line) => !line.includes(String(CHAT - 5))));
  } finally { await stop(home, running); await mock.close(); }
});

test("General은 daemon 설정 이름만 노출하고 미허용 chat·사용자와 쓰기 승인 경계를 유지한다", async () => {
  const home = tempDir(), offered = tempDir(), notOffered = tempDir();
  const mock = await new MockTelegram(FIRST_THREAD).start();
  configureForum(home, mock);
  const stale = registerWorkspace(home, { path: tempDir(), name: "stale", summary: "" }, AGENT_BUDGET);
  const moveTarget = tempDir();
  mkdirSync(join(moveTarget, ".pace"));
  copyFileSync(join(stale.path, ".pace", "AGENT.md"), join(moveTarget, ".pace", "AGENT.md"));
  updateConfigFile(home, (raw) => { raw.workspaces = [{ name: "offered", path: offered }, { name: "stale", path: stale.path, registryId: stale.id }]; });
  registerWorkspace(home, { path: notOffered, name: "registered-only", summary: "" }, AGENT_BUDGET);
  const runAccess: string[] = [];
  const running = runDaemon({
    home, noSignals: true, out: () => {},
    runner: async (job) => {
      runAccess.push(job.target.access);
      return { status: "done", text: "READ-ONLY-MARKER", cleanupUnconfirmed: false };
    },
  });
  try {
    await until(() => readStatus(home)?.state === "running");
    const port = readStatus(home)!.gatewayPort;
    const noAuth = await wsConnect(port, null);
    noAuth.send({ type: "workspace_add" });
    assert.equal(await noAuth.closed, 1008);
    const origin = await rawSocket(port, { Origin: "https://untrusted.invalid" });
    assert.match(origin.status, /403/);
    origin.socket.destroy();
    const invalid = await wsConnect(port, tokenOf(home));
    const workspace = approveWorkspacePlan(home, planWorkspaceAdd(home, notOffered));
    invalid.send({ type: "workspace_add", id: "invalid", workspace, forum: "invalid-forum-value" });
    assert.equal((await invalid.next((message) => message.id === "invalid")).type, "error");
    invalid.close();
    const configBefore = readFileSync(configFile(home), "utf8");
    const registryBefore = listCandidates(home);
    const stateBefore = loadTelegramState(telegramStateFile(home))!;
    mock.text(CHAT, undefined, U1, `/new offered ${offered}`);
    await until(() => mock.texts().some((line) => line.includes("pace daemon workspace add")));
    assert.equal(readFileSync(configFile(home), "utf8"), configBefore);
    assert.deepEqual(listCandidates(home), registryBefore);
    const stateAfter = loadTelegramState(telegramStateFile(home))!;
    assert.deepEqual(stateAfter.topics, stateBefore.topics);
    assert.deepEqual(stateAfter.provisioning, stateBefore.provisioning);
    mock.text(CHAT - 100, undefined, U1, "/new offered");
    mock.text(CHAT, undefined, STRANGER, "/new offered");
    mock.text(CHAT, undefined, U1, "/new registered-only");
    await until(() => mock.texts().some((line) => line.includes("daemon에 등록된 워크스페이스가 아니다")));
    assert.equal(mock.sent("createForumTopic").length, 0);
    assert.deepEqual(loadConfig(home).workspaces.map((ws) => ws.name), ["offered", "stale"]);
    relocateWorkspace(home, stale.id, moveTarget, AGENT_BUDGET);
    mock.text(CHAT, undefined, U1, "/new stale");
    await until(() => mock.texts().some((line) => line.includes("승인 경로를 확인할 수 없다")));
    assert.equal(mock.sent("createForumTopic").length, 0);

    mock.text(CHAT, undefined, U1, "/new offered");
    await until(() => mock.texts().some((line) => line.includes("등록 완료")));
    const stored = loadTelegramState(telegramStateFile(home));
    const thread = Number(Object.entries(stored!.topics).find(([, value]) => value === "offered")![0]);
    mock.text(CHAT, thread, U1, "첫 조회");
    await until(() => mock.sent().some((call) => call.params.message_thread_id === thread && String(call.params.text).includes("READ-ONLY-MARKER")));
    assert.ok(mock.sent().filter((call) => String(call.params.text).includes("READ-ONLY-MARKER")).every((call) => call.params.message_thread_id === thread));
    hiddenValues(home, mock, [], [offered, notOffered, stale.path], [thread]);
    mock.text(CHAT, thread, U1, "/write");
    mock.text(CHAT, thread, U1, "쓰기 요청");
    await until(() => Object.values(StateStore.open(home).state.tasks).some((task) => task.status === "awaiting_approval"));
    await until(() => mock.sent().some((call) => call.params.message_thread_id === thread && call.params.reply_markup !== undefined && String(call.params.text).includes("승인 요청")));
    assert.deepEqual(runAccess, ["read-only"]);
    assert.equal(mock.sent("createForumTopic").length, 1);
  } finally { await stop(home, running); await mock.close(); }
});

test("응답 유실·General 경합·다른 add가 겹쳐도 설정과 토픽이 한 번씩 남는다", async () => {
  const home = tempDir(), firstRoot = tempDir(), secondRoot = tempDir();
  const mock = await new MockTelegram(FIRST_THREAD).start();
  const secret = configureForum(home, mock);
  const running = runDaemon({ home, noSignals: true, out: () => {} });
  let unblock = () => {};
  const barrier = new Promise<void>((resolve) => { unblock = resolve; });
  mock.fault("createForumTopic", { times: 1, wait: barrier });
  try {
    await until(() => readStatus(home)?.state === "running");
    const port = readStatus(home)!.gatewayPort;
    const request = approveWorkspacePlan(home, planWorkspaceAdd(home, firstRoot, "shared"));
    const lost = await wsConnect(port, tokenOf(home));
    lost.send({ type: "workspace_add", id: "lost", workspace: request, forum: forumProof(secret) });
    await until(() => mock.sent("createForumTopic").length === 1);
    assert.equal(loadTelegramState(telegramStateFile(home))?.provisioning.shared, request.registryId, "Bot API 수신 때 생성 의도가 디스크에 있다");
    lost.close();
    await lost.closed;
    mock.text(CHAT, undefined, U1, "/new shared");
    await until(() => readFileSync(logFile(home), "utf8").includes("telegram_topic_request_joined workspace=shared"));
    const other = await cli(home, secondRoot, "add", ".", "--name", "other", "--yes");
    assert.match(other.stdout, /토픽 결속 완료/);
    assert.deepEqual(loadConfig(home).workspaces.map((ws) => ws.name).sort(), ["other", "shared"]);
    assert.deepEqual(loadConfig(home).allowedUsers, { telegram: [String(U1)] });
    unblock();
    await until(() => mock.texts().some((line) => line.includes("등록 완료: shared")));
    const replay = await cli(home, firstRoot, "add", ".", "--name", "shared", "--yes");
    assert.match(replay.stdout, /설정 반영 완료.*토픽 기존 결속/);
    assert.deepEqual(mock.sent("createForumTopic").map((call) => call.params.name).sort(), ["other", "shared"]);
    const topics = Object.keys(loadTelegramState(telegramStateFile(home))!.topics).map(Number);
    assert.equal(topics.length, 2);
    hiddenValues(home, mock, [other.stdout, other.stderr, replay.stdout, replay.stderr], [firstRoot, secondRoot], topics);
  } finally { unblock(); await stop(home, running); await mock.close(); }
});

test("확정 실패는 의도를 지우고, 응답 불명·결속 저장 실패는 재기동 뒤에도 생성하지 않는다", async () => {
  const home = tempDir(), rejected = tempDir(), unknown = tempDir(), unrecorded = tempDir(), unwritten = tempDir();
  const mock = await new MockTelegram(FIRST_THREAD).start();
  configureForum(home, mock);
  const start = () => runDaemon({ home, noSignals: true, out: () => {} });
  let running = start();
  const outputs: string[] = [];
  const add = async (root: string, name: string) => {
    const result = await cli(home, root, "add", ".", "--name", name, "--yes");
    outputs.push(result.stdout, result.stderr);
    return result;
  };
  const readState = () => loadTelegramState(telegramStateFile(home))!;
  try {
    await until(() => readStatus(home)?.state === "running");
    const failureBody = { ok: false, description: `외부 오류 ${home} ${TOKEN} ${CHAT} thread=${FIRST_THREAD}` };
    mock.fault("createForumTopic", { status: 400, body: { ...failureBody, error_code: 400 }, times: 1 });
    const definitive = await add(rejected, "retry-topic");
    assert.match(definitive.stdout, /토픽 생성을 거부/);
    assert.equal(readState().provisioning["retry-topic"], undefined);
    for (const [description, expected] of [
      ["Bad Request: not enough rights to create a topic", /토픽 관리 권한/],
      ["Bad Request: the chat is not a forum", /토픽\(포럼\)이 꺼져/],
    ] as const) {
      mock.fault("createForumTopic", { status: 400, body: { ok: false, error_code: 400, description }, times: 1 });
      const fault = await add(rejected, "retry-topic");
      assert.match(fault.stdout, expected);
      assert.equal(readState().provisioning["retry-topic"], undefined);
    }
    assert.match((await add(rejected, "retry-topic")).stdout, /토픽 결속 완료/);

    mock.fault("createForumTopic", { drop: true, times: 1 });
    const ambiguous = await add(unknown, "unknown-topic");
    assert.match(ambiguous.stdout, /결과를 확인하지 못했다.*\/bind unknown-topic/);
    assert.match(readFileSync(logFile(home), "utf8"), /telegram_topic_result_unknown reason=api_uncertain$/m);
    const unknownId = loadConfig(home).workspaces.find((ws) => ws.name === "unknown-topic")!.registryId;
    assert.equal(readState().provisioning["unknown-topic"], unknownId);

    const rename = fs.renameSync;
    let injected = 0;
    fs.renameSync = (source, destination) => {
      if (destination === telegramStateFile(home)) {
        const next = JSON.parse(readFileSync(source, "utf8"));
        if (Object.hasOwn(next.provisioning, "intent-topic") ||
          Object.values(next.topics).some((value) => typeof value === "object" && value !== null && "name" in value && value.name === "save-topic")) {
          injected++;
          throw Object.assign(new Error(`쓰기 장애 ${home}`), { code: "EIO" });
        }
      }
      rename(source, destination);
    };
    syncBuiltinESMExports();
    let failedSave, failedIntent;
    try {
      const beforeIntent = mock.sent("createForumTopic").length;
      failedIntent = await add(unwritten, "intent-topic");
      assert.equal(failedIntent.code, 0);
      assert.match(failedIntent.stdout, /상태를 저장하지 못해 토픽을 만들지 않았다/);
      assert.equal(mock.sent("createForumTopic").length, beforeIntent);
      assert.equal(readState().provisioning["intent-topic"], undefined);
      failedSave = await add(unrecorded, "save-topic");
    } finally { fs.renameSync = rename; syncBuiltinESMExports(); }
    assert.equal(injected, 2);
    assert.match(failedSave.stdout, /토픽은 만들었으나 저장하지 못했다.*\/bind save-topic/);
    const saveId = loadConfig(home).workspaces.find((ws) => ws.name === "save-topic")!.registryId;
    assert.equal(readState().provisioning["save-topic"], saveId);
    const requests = mock.sent("createForumTopic").length;
    await stop(home, running);

    running = start();
    await until(() => readStatus(home)?.state === "running");
    assert.match((await add(unknown, "unknown-topic")).stdout, /\/bind unknown-topic/);
    assert.match((await add(unrecorded, "save-topic")).stdout, /\/bind save-topic/);
    assert.equal(mock.sent("createForumTopic").length, requests);
    assert.equal(readFileSync(logFile(home), "utf8").match(/telegram_topic_result_unknown/g)?.length, 1);
    mock.text(CHAT, RECOVERY_THREAD, U1, "/bind save-topic");
    await until(() => mock.texts().some((line) => line.includes("결속했다: save-topic")));
    assert.deepEqual(readState().topics[String(RECOVERY_THREAD)], { name: "save-topic", registryId: saveId });
    assert.equal(readState().provisioning["save-topic"], undefined);
    await stop(home, running);

    const unrelated = registerWorkspace(home, { path: tempDir(), name: "another", summary: "" }, AGENT_BUDGET);
    updateConfigFile(home, (raw) => {
      const entries = raw.workspaces as Record<string, unknown>[];
      raw.workspaces = entries.map((ws) => ws.name === "unknown-topic" ? { name: ws.name, registryId: unrelated.id, path: unrelated.path } : ws);
    });
    running = start();
    await until(() => readStatus(home)?.state === "running");
    mock.text(CHAT, RECOVERY_THREAD + 1, U1, "/bind unknown-topic");
    await until(() => mock.texts().some((line) => line.includes("토픽 생성 의도와 현재 워크스페이스 등록이 일치하지 않는다")));
    assert.equal(readState().topics[String(RECOVERY_THREAD + 1)], undefined);
    assert.equal(readState().provisioning["unknown-topic"], unknownId);
    hiddenValues(home, mock, outputs, [rejected, unknown, unrecorded, unwritten, unrelated.path], [FIRST_THREAD, FIRST_THREAD + 1, RECOVERY_THREAD, RECOVERY_THREAD + 1]);
  } finally { await stop(home, running); await mock.close(); }
});

test("생성 호출이 진행 중인 상태에서 멈추면 기동 뒤에도 같은 요청을 재발행하지 않는다", async () => {
  const home = tempDir(), root = tempDir();
  const mock = await new MockTelegram(FIRST_THREAD).start();
  const secret = configureForum(home, mock);
  const start = () => runDaemon({ home, noSignals: true, out: () => {} });
  let running = start();
  let release = () => {};
  const barrier = new Promise<void>((done) => { release = done; });
  mock.fault("createForumTopic", { wait: barrier, times: 1 });
  try {
    await until(() => readStatus(home)?.state === "running");
    const workspace = approveWorkspacePlan(home, planWorkspaceAdd(home, root, "interrupted"));
    const gateway = await wsConnect(readStatus(home)!.gatewayPort, tokenOf(home));
    gateway.send({ type: "workspace_add", workspace, forum: forumProof(secret) });
    await until(() => mock.sent("createForumTopic").length === 1);
    assert.equal(loadTelegramState(telegramStateFile(home))?.provisioning.interrupted, workspace.registryId);
    await stop(home, running);
    release();
    await gateway.closed;
    running = start();
    await until(() => readStatus(home)?.state === "running");
    const repeated = await cli(home, root, "add", ".", "--name", "interrupted", "--yes");
    assert.match(repeated.stdout, /결과를 확인하지 못했다.*\/bind interrupted/);
    assert.equal(mock.sent("createForumTopic").length, 1);
    assert.equal(loadTelegramState(telegramStateFile(home))?.provisioning.interrupted, workspace.registryId);
    hiddenValues(home, mock, [repeated.stdout, repeated.stderr], [root], [FIRST_THREAD]);
  } finally { release(); await stop(home, running); await mock.close(); }
});
