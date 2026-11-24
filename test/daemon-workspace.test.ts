import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs, { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { test } from "node:test";
import { configFile, loadConfig, updateConfigFile } from "../src/daemon/config.ts";
import { runDaemon } from "../src/daemon/index.ts";
import { acquireInstance, logFile, readStatus, requestStop } from "../src/daemon/instance.ts";
import { StateStore } from "../src/daemon/store.ts";
import { telegramStateFile, writeTelegramSecret } from "../src/daemon/telegram/index.ts";
import { emptyTelegramState, loadTelegramState, saveTelegramState } from "../src/daemon/telegram/state.ts";
import { daemonWorkspaceCommand } from "../src/daemon/workspace-cli.ts";
import { approveWorkspacePlan, planWorkspaceAdd } from "../src/daemon/workspace.ts";
import { AGENT_BUDGET } from "../src/project/agent-definition.ts";
import { createCandidate, listCandidates, registerWorkspace, relocateWorkspace } from "../src/project/workspace-registry.ts";
import { rawSocket, tokenOf, wsConnect } from "./daemon-proc-helpers.ts";
import { runPace, tempDir } from "./helpers.ts";
import { CHAT, TOKEN, U1, until } from "./telegram-helpers.ts";
import { MockTelegram } from "./telegram-mock.ts";

test("workspace add는 하위 폴더에서 루트를 고르고, 승인 뒤에만 활성 등록과 daemon 설정을 기록한다", () => {
  const home = tempDir();
  const root = realpathSync.native(tempDir("pace-repository-"));
  execFileSync("git", ["-C", root, "init", "-q"]);
  const cwd = join(root, "sub");
  mkdirSync(cwd);
  const args = ["daemon", "workspace", "add"];

  const preview = runPace(args, { home, cwd });
  assert.equal(preview.status, 0, preview.stderr);
  const name = root.split(/[\\/]/).at(-1);
  for (const value of [JSON.stringify(root), "새 활성 등록", ".pace/AGENT.md: 새로 생성", "read-only", `토픽: ${name}`, "--yes"]) assert.ok(preview.stdout.includes(value), value);
  assert.deepEqual(listCandidates(home), []);
  assert.equal(existsSync(join(root, ".pace", "AGENT.md")), false);
  assert.equal(existsSync(join(home, "daemon", "config.json")), false);

  const added = runPace([...args, "--yes"], { home, cwd });
  assert.equal(added.status, 0, added.stderr);
  const [candidate] = listCandidates(home);
  assert.equal(candidate?.active, true);
  assert.equal(candidate?.path, root);
  assert.match(readFileSync(join(root, ".pace", "AGENT.md"), "utf8"), new RegExp(candidate!.id));
  assert.equal(loadConfig(home).workspaces[0]?.registryId, candidate?.id);
  assert.match(loadConfig(home).workspaces[0]?.registryIdentity?.ino ?? "", /^\d+$/);
  assert.match(added.stdout, /설정.*기록/);
  assert.match(added.stdout, /토픽.*미결속/);
  assert.equal(added.stdout.includes(root), false);
  const listed = runPace(["daemon", "workspace", "list"], { home, cwd });
  assert.equal(listed.status, 0, listed.stderr);
  assert.match(listed.stdout, /활성 등록/);
  assert.equal(listed.stdout.includes(root), false);
});

test("workspace CLI 도움말과 운영 문서는 승인·이동·결속 절차를 안내한다", () => {
  const home = tempDir();
  const help = runPace(["help"], { home });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /pace daemon workspace add .*--name.*--yes.*workspace list/);
  const docs = readFileSync(new URL("../docs/DAEMON.md", import.meta.url), "utf8");
  for (const guidance of ["Git 저장소의 최상위", "[y/N]", "--yes", "read-only", "다음 기동", "인증된 Gateway", "같은 ID", "/bind <이름>"]) {
    assert.ok(docs.includes(guidance), guidance);
  }
});

function definitionCopy(from: string, to: string): void {
  mkdirSync(join(to, ".pace"), { recursive: true });
  copyFileSync(join(from, ".pace", "AGENT.md"), join(to, ".pace", "AGENT.md"));
}

function commands(home: string) {
  return async (args: string[], options: Partial<Parameters<typeof daemonWorkspaceCommand>[1]> = {}) => {
    const lines: string[] = [];
    const code = await daemonWorkspaceCommand(args, { home, cwd: home, interactive: false, ask: async () => false, out: (line) => lines.push(line), ...options });
    return { code, output: lines.join("\n") };
  };
}

test("활성 등록만 재사용하며 미승인 이름·후보·복제 정의·깨진 정의는 daemon 설정을 바꾸지 않는다", async () => {
  const home = tempDir();
  const good = tempDir();
  const candidate = registerWorkspace(home, { path: good, name: "등록 이름", summary: "보존" }, AGENT_BUDGET);
  const cli = commands(home);
  const add = (path: string, ...args: string[]) => cli(["add", path, "--yes", ...args]);
  const invalidName = await add(good);
  assert.equal(invalidName.code, 2);
  assert.match(invalidName.output, /--name/);
  assert.equal(existsSync(configFile(home)), false);
  assert.equal((await add(good, "--name", "alpha")).code, 0);
  const expected = readFileSync(configFile(home), "utf8");
  assert.equal((await add(good)).code, 0, "재시도에서 이미 승인한 daemon 이름 사용");
  assert.deepEqual(listCandidates(home), [candidate]);

  const inactive = tempDir();
  createCandidate(home, { path: inactive, name: "inactive", summary: "" });
  const blocked = await add(inactive);
  assert.equal(blocked.code, 2);
  assert.match(blocked.output, /활성 등록/);
  assert.equal(existsSync(join(inactive, ".pace", "AGENT.md")), false);
  const other = tempDir();
  assert.match((await add(other, "--name", "alpha")).output, /--name/);
  assert.equal(existsSync(join(other, ".pace", "AGENT.md")), false);
  const copied = tempDir();
  definitionCopy(good, copied);
  assert.match((await add(copied, "--name", "copy")).output, /다른 경로/);
  writeFileSync(join(good, ".pace", "AGENT.md"), readFileSync(join(good, ".pace", "AGENT.md"), "utf8").replace(candidate.id, createCandidate(home, { path: other, name: "other", summary: "" }).id));
  assert.match((await add(good)).output, /AGENT.*등록 ID/);
  assert.equal(readFileSync(configFile(home), "utf8"), expected);

  const named = registerWorkspace(home, { path: tempDir(), name: "registry-name", summary: "" }, AGENT_BUDGET);
  assert.equal((await add(named.path)).code, 0);
  assert.equal(loadConfig(home).workspaces.find((entry) => entry.name === "registry-name")?.registryId, named.id);
  assert.deepEqual(listCandidates(home).find((entry) => entry.id === named.id), named);
});

test("대화형 확인에 포럼 이름을 표시하고, 거절 또는 등록부가 바뀐 뒤의 동의는 쓰지 않는다", async () => {
  const home = tempDir(), root = tempDir(), moved = tempDir();
  const entry = registerWorkspace(home, { path: root, name: "reviewed", summary: "" }, AGENT_BUDGET);
  definitionCopy(root, moved);
  writeTelegramSecret(home, { token: TOKEN, chatId: String(CHAT) });
  const cli = commands(home);
  const definitionsBefore = readFileSync(join(root, ".pace", "AGENT.md"), "utf8");
  const registrationsBefore = listCandidates(home);
  const telegramFetch: typeof fetch = async (_url, init) => {
    assert.equal(JSON.parse(String(init?.body)).chat_id, String(CHAT));
    return Response.json({ ok: true, result: { id: CHAT, is_forum: true, title: `시험 포럼 ${TOKEN}` } });
  };
  const declined = await cli(["add", root], { interactive: true, ask: async () => false, telegramFetch });
  for (const text of ["reviewed", "기존 활성 등록", "기존 정의 사용", "read-only", "시험 포럼", "취소했다"]) assert.ok(declined.output.includes(text), text);
  assert.equal(declined.output.includes(TOKEN), false);
  assert.equal(existsSync(configFile(home)), false);
  assert.deepEqual(listCandidates(home), registrationsBefore);
  assert.equal(readFileSync(join(root, ".pace", "AGENT.md"), "utf8"), definitionsBefore);

  const changed = await cli(["add", root], {
    interactive: true, telegramFetch,
    ask: async () => { relocateWorkspace(home, entry.id, moved, AGENT_BUDGET); return true; },
  });
  assert.equal(changed.code, 2);
  assert.equal(existsSync(configFile(home)), false);
});

test("인스턴스 포트를 다른 작업이 소유하면 기동과 add가 직접 쓰지 않는다", async () => {
  const home = tempDir(), root = tempDir();
  const owner = await acquireInstance(home);
  try {
    assert.equal(await runDaemon({ home, noSignals: true, out: () => {} }), 2);
    const blocked = await commands(home)(["add", root, "--name", "busy", "--yes"]);
    assert.equal(blocked.code, 2);
    assert.match(blocked.output, /Gateway를 확인할 수 없다/);
    assert.deepEqual(listCandidates(home), []);
    assert.equal(existsSync(configFile(home)), false);
  } finally { await owner.release(); }
  assert.equal((await commands(home)(["add", root, "--name", "busy", "--yes"])).code, 0);
});

test("정지 중 동일 경로 승인만 기존 결속을 등록 ID로 보강한다", async () => {
  const home = tempDir(), original = tempDir(), other = tempDir();
  const cli = commands(home);
  updateConfigFile(home, (raw) => { raw.workspaces = [{ name: "legacy", path: original }]; });
  saveTelegramState(telegramStateFile(home), { ...emptyTelegramState(), topics: { "11": "legacy" }, provisioning: { legacy: true } });
  const rejected = await cli(["add", other, "--name", "legacy", "--yes"]);
  assert.equal(rejected.code, 2);
  assert.equal(loadTelegramState(telegramStateFile(home))?.topics["11"], "legacy");
  assert.equal(loadConfig(home).workspaces[0]?.registryId, undefined);
  const adopted = await cli(["add", original, "--name", "legacy", "--yes"]);
  assert.equal(adopted.code, 0, adopted.output);
  const id = listCandidates(home)[0]!.id;
  assert.equal(loadConfig(home).workspaces[0]?.registryId, id);
  assert.deepEqual(loadTelegramState(telegramStateFile(home))?.topics["11"], { name: "legacy", registryId: id });
  assert.equal(loadTelegramState(telegramStateFile(home))?.provisioning.legacy, id);
});

test("재기동해도 같은 경로에 복제된 디렉터리를 새 승인 전에는 사용하지 않는다", async () => {
  const home = tempDir(), root = tempDir();
  const cli = commands(home);
  assert.equal((await cli(["add", root, "--name", "approved", "--yes"])).code, 0);
  const id = listCandidates(home)[0]!.id;
  const saved = join(home, "old-root");
  renameSync(root, saved);
  definitionCopy(saved, root);
  const output: string[] = [];
  const daemon = runDaemon({ home, noSignals: true, out: (line) => output.push(line) });
  try {
    await until(() => readStatus(home)?.state === "running");
    assert.ok(output.some((line) => /approved 제외.*승인한 디렉터리가 바뀌었다/.test(line)));
    const listed = await cli(["list"]);
    assert.match(listed.output, /승인한 디렉터리가 바뀌었다/);
    assert.equal((await cli(["add", root, "--yes"])).code, 0);
    assert.equal(loadConfig(home).workspaces[0]?.registryId, id);
    assert.match((await cli(["list"])).output, /활성 등록/);
  } finally {
    requestStop(home);
    assert.equal(await daemon, 0);
  }
});

test("실행 소유자가 Gateway를 인증하고 병렬 추가를 직렬화하며 저장 실패는 성공으로 보고하지 않는다", async () => {
  const home = tempDir(), one = tempDir(), two = tempDir(), three = tempDir();
  const cli = commands(home);
  saveTelegramState(telegramStateFile(home), { ...emptyTelegramState(), topics: { "11": "existing" } });
  const topicBefore = readFileSync(telegramStateFile(home), "utf8");
  const result = runDaemon({ home, noSignals: true, out: () => {} });
  try {
    await until(() => readStatus(home)?.state === "running");
    const port = readStatus(home)!.gatewayPort;
    const request = approveWorkspacePlan(home, planWorkspaceAdd(home, one, "one"));
    const denied = await wsConnect(port, null);
    denied.send({ type: "workspace_add", workspace: request });
    assert.equal(await denied.closed, 1008);
    const origin = await rawSocket(port, { Origin: "https://blocked.invalid" });
    assert.match(origin.status, /403/);
    origin.socket.destroy();
    assert.equal(existsSync(configFile(home)), false);

    const [a, b] = await Promise.all([cli(["add", one, "--name", "one", "--yes"]), cli(["add", two, "--name", "two", "--yes"])]);
    assert.equal(a.code, 0, a.output);
    assert.equal(b.code, 0, b.output);
    assert.match(a.output, /반영 완료.*미결속/);
    assert.deepEqual(loadConfig(home).workspaces.map((ws) => ws.name).sort(), ["one", "two"]);
    const client = await wsConnect(port, tokenOf(home));
    client.send({ type: "send", conversation: "probe", text: "/use two", id: "select" });
    assert.equal((await client.next((message) => message.id === "select")).result.kind, "command");
    const selected = StateStore.open(home).state.conversations["gateway:probe"];
    assert.equal(selected?.workspace, "two");

    const originalRegistration = registerWorkspace(home, { path: tempDir(), name: "stale", summary: "" }, AGENT_BUDGET);
    const stale = approveWorkspacePlan(home, planWorkspaceAdd(home, originalRegistration.path));
    const moved = tempDir();
    definitionCopy(originalRegistration.path, moved);
    relocateWorkspace(home, originalRegistration.id, moved, AGENT_BUDGET);
    client.send({ type: "workspace_add", id: "stale", workspace: stale });
    assert.match((await client.next((message) => message.id === "stale")).result.reason, /등록부 경로가 바뀌었다/);
    assert.equal(loadConfig(home).workspaces.some((entry) => entry.name === "stale"), false);

    const original = configFile(home);
    const configBefore = readFileSync(original, "utf8");
    const pending = approveWorkspacePlan(home, planWorkspaceAdd(home, three, "three"));
    const rename = fs.renameSync;
    const attemptedIds: string[] = [];
    fs.renameSync = (source, destination) => {
      if (destination === original) {
        const attempted = JSON.parse(readFileSync(source, "utf8")).workspaces.find((entry: { name: string }) => entry.name === "three");
        attemptedIds.push(attempted.registryId);
        throw Object.assign(new Error("injected config replacement failure"), { code: "EIO" });
      }
      rename(source, destination);
    };
    syncBuiltinESMExports();
    try {
      client.send({ type: "workspace_add", id: "reject", workspace: pending });
      const ack = await client.next((message) => message.id === "reject");
      assert.equal(ack.result.ok, false);
      assert.equal(JSON.stringify(ack).includes(three), false);
      const failedCli = await cli(["add", three, "--yes"]);
      assert.equal(failedCli.code, 2);
      assert.doesNotMatch(failedCli.output, /반영 완료|결속 완료/);
      assert.deepEqual(attemptedIds, [pending.registryId, pending.registryId], "유효한 임시 설정을 만든 뒤 실제 교체를 두 번 시도했다");
      client.send({ type: "send", conversation: "probe", text: "/use three", id: "unavailable" });
      await client.next((message) => message.id === "unavailable");
      assert.equal(StateStore.open(home).state.conversations["gateway:probe"]?.workspace, "two");
      assert.equal(readFileSync(original, "utf8"), configBefore);
      assert.equal(readFileSync(telegramStateFile(home), "utf8"), topicBefore);
    } finally {
      fs.renameSync = rename;
      syncBuiltinESMExports();
    }
    client.send({ type: "workspace_add", id: "retry", workspace: pending });
    assert.deepEqual((await client.next((message) => message.id === "retry")).result, { ok: true, bound: false });
    assert.equal(loadConfig(home).workspaces.find((entry) => entry.name === "three")?.registryId, pending.registryId);
    assert.equal((await cli(["add", three, "--yes"])).code, 0);
    assert.equal(readFileSync(telegramStateFile(home), "utf8"), topicBefore);
    client.close();
    for (const value of [one, two, three, tokenOf(home)]) assert.equal(readFileSync(logFile(home), "utf8").includes(value), false);
  } finally {
    requestStop(home);
    assert.equal(await result, 0);
  }
});

test("이동 뒤 옛 디렉터리가 남아 있어도 접수·조회·대기 실행을 거부하고 동일 ID의 기존 토픽만 이어진다", async () => {
  const home = tempDir(), oldRoot = tempDir(), newRoot = tempDir(), legacy = tempDir();
  const cli = commands(home);
  const registered = registerWorkspace(home, { path: oldRoot, name: "project", summary: "" }, AGENT_BUDGET);
  definitionCopy(oldRoot, newRoot);
  for (const [path, marker] of [[oldRoot, "OLD-MARKER"], [newRoot, "NEW-MARKER"], [legacy, "LEGACY-MARKER"]] as const) {
    mkdirSync(join(path, "backlogs"));
    writeFileSync(join(path, "backlogs", "BACKLOG.md"), marker);
  }
  updateConfigFile(home, (config) => {
    config.maxConcurrent = 1;
    config.allowedUsers = { telegram: [String(U1)] };
    config.workspaces = [{ name: "project", path: registered.path, registryId: registered.id, worktrees: { custom: registered.path } }, { name: "legacy", path: legacy }];
  });
  const mock = await new MockTelegram().start();
  const out: string[] = [], prompts: string[] = [];
  let release = () => {};
  const hold = new Promise<void>((done) => { release = done; });
  writeTelegramSecret(home, { token: TOKEN, chatId: String(CHAT), apiBase: mock.base });
  saveTelegramState(telegramStateFile(home), {
    ...emptyTelegramState(),
    topics: { "11": { name: "project", registryId: registered.id }, "12": "legacy", "13": { name: "legacy", registryId: registered.id } },
  });
  const start = () => runDaemon({
    home, noSignals: true, out: (line) => out.push(line),
    runner: async (job) => {
      prompts.push(job.prompt);
      if (job.prompt === "hold") await hold;
      return { status: "done", text: readFileSync(join(job.target.worktree, "backlogs", "BACKLOG.md"), "utf8"), cleanupUnconfirmed: false };
    },
  });
  let daemon = start();
  try {
    await until(() => readStatus(home)?.state === "running");
    mock.text(CHAT, 11, U1, "/use custom");
    await until(() => Object.values(StateStore.open(home).state.conversations).some((conv) => conv.worktreeName === "custom"));
    mock.text(CHAT, 11, U1, "hold");
    await until(() => prompts.includes("hold"));
    mock.text(CHAT, 11, U1, "queued-old");
    await until(() => Object.values(StateStore.open(home).state.tasks).some((task) => task.prompt === "queued-old" && task.status === "queued"));
    relocateWorkspace(home, registered.id, newRoot, AGENT_BUDGET);
    mock.text(CHAT, 11, U1, "rejected-old");
    mock.text(CHAT, 11, U1, "/backlog");
    await until(() => mock.texts().some((line) => line.includes("등록부 경로가 바뀌었다")) && mock.texts().some((line) => line.includes("조회할 수 없다")));
    release();
    await until(() => Object.values(StateStore.open(home).state.tasks).some((task) => task.status === "failed" && task.note?.includes("등록부 경로")));
    assert.deepEqual(prompts, ["hold"]);
    assert.equal(existsSync(join(oldRoot, "backlogs", "BACKLOG.md")), true);
    requestStop(home);
    assert.equal(await daemon, 0);

    daemon = start();
    await until(() => readStatus(home)?.state === "running");
    assert.ok(out.some((line) => line.includes("project 제외") && line.includes("등록부 경로")));
    mock.text(CHAT, 12, U1, "legacy-ok");
    mock.text(CHAT, 13, U1, "wrong-id");
    await until(() => mock.texts().some((line) => line.includes("LEGACY-MARKER")) && mock.texts().some((line) => line.includes("결속과 현재 워크스페이스")), 4000, "기존 설정 조회와 다른 ID 차단");
    const other = registerWorkspace(home, { path: tempDir(), name: "other", summary: "" }, AGENT_BUDGET);
    const collision = await cli(["add", other.path, "--name", "project", "--yes"]);
    assert.equal(collision.code, 2);
    assert.match(collision.output, /--name/);
    const again = await cli(["add", newRoot, "--yes"]);
    assert.equal(again.code, 0, again.output);
    assert.match(again.output, /결속 완료/);
    assert.deepEqual(Object.keys(loadConfig(home).workspaces.find((entry) => entry.name === "project")!.worktrees), ["main"]);
    mock.text(CHAT, 11, U1, "new-root");
    await until(() => mock.texts().some((line) => line.includes("NEW-MARKER")), 4000, "같은 토픽의 새 경로 조회");
    const beforeLookup = mock.texts().length;
    mock.text(CHAT, 11, U1, "/backlog");
    await until(() => mock.texts().slice(beforeLookup).some((line) => line.includes("NEW-MARKER")), 4000, "등록부가 적용된 파일 워커의 새 경로 조회");
    assert.deepEqual(prompts, ["hold", "legacy-ok", "new-root"]);
    assert.equal(mock.sent("createForumTopic").length, 0);
    assert.deepEqual(loadTelegramState(telegramStateFile(home))?.topics["11"], { name: "project", registryId: registered.id });
    for (const secret of [oldRoot, newRoot, TOKEN, String(CHAT)]) assert.equal(mock.texts().join("\n").includes(secret), false);

    requestStop(home);
    assert.equal(await daemon, 0);
    updateConfigFile(home, (raw) => { raw.workspaces = [{ name: "project", path: other.path, registryId: other.id }]; });
    daemon = start();
    await until(() => readStatus(home)?.state === "running");
    const repliesBefore = mock.texts().length;
    mock.text(CHAT, 11, U1, "/bind project");
    await until(() => mock.texts().slice(repliesBefore).some((line) => line.includes("결속과 현재 워크스페이스")));
    assert.deepEqual(loadTelegramState(telegramStateFile(home))?.topics["11"], { name: "project", registryId: registered.id });
    assert.deepEqual(prompts, ["hold", "legacy-ok", "new-root"]);
  } finally {
    release();
    requestStop(home);
    assert.equal(await daemon, 0);
    await mock.close();
  }
});
