import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { daemonCommand } from "../src/daemon/cli.ts";
import { launcherPath, RUN_VALUE } from "../src/daemon/autostart.ts";
import { normalizeDeviceName } from "../src/daemon/config.ts";
import { acquireInstance } from "../src/daemon/instance.ts";
import { readTelegramSecret } from "../src/daemon/telegram/index.ts";
import { FakeSystem } from "./fake-system.ts";
import { tempDir } from "./helpers.ts";

// P035 실사용 확인 후속(T06 수정): daemon start · 확인 질문 · Telegram 자동 찾기 · 기기 이름 · 워크스페이스 등록.
// 가짜 레지스트리(FakeSystem)·가짜 Bot API(fetch 가로채기)만 쓴다 — 실제 토큰·레지스트리·네트워크 없음.

type Rule = [RegExp, boolean | string];

function fakeBot(handlers: Record<string, unknown> = {}) {
  const calls: { method: string; body: Record<string, unknown>; url: string }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const method = u.split("/").pop()!;
    calls.push({ method, url: u, body: init?.body ? JSON.parse(String(init.body)) : {} });
    const result = handlers[method];
    if (result instanceof Error) return new Response(JSON.stringify({ ok: false, error_code: 409, description: result.message }), { status: 409 });
    return new Response(JSON.stringify({ ok: true, result: result ?? null }), { status: 200 });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

function setup(options: { interactive?: boolean; rules?: Rule[]; secret?: string; running?: boolean[]; cwd?: string; bot?: ReturnType<typeof fakeBot>; hostName?: string } = {}) {
  const home = tempDir("pace-home-");
  const profile = tempDir("pace-profile-");
  const chainFile = join(profile, "agent-chains.json");
  const sys = new FakeSystem();
  const out: string[] = [];
  const rules = options.rules ?? [];
  const questions: string[] = [];
  const running = [...(options.running ?? [])];
  const bot = options.bot ?? fakeBot();
  const cwd = options.cwd ?? tempDir("pace-cwd-");
  const find = (q: string): boolean | string | undefined => rules.find(([re]) => re.test(q))?.[1];
  const run = (args: string[]) => {
    process.env.PACE_HOME = home;
    return daemonCommand(args, {
      runner: sys.runner, out: (l) => out.push(l), platform: "win32", nodePath: "C:\\node.exe", binPath: "C:\\pace\\bin\\pace.ts",
      interactive: options.interactive ?? false, chainFile, cwd, hostName: options.hostName ?? "TEST-PC",
      ask: async (q) => { questions.push(q); const v = find(q); return typeof v === "boolean" ? v : false; },
      askLine: async (q, fallback) => { questions.push(q); const v = find(q); return typeof v === "string" ? v : fallback; },
      readSecret: async (q) => { questions.push(q); return options.secret ?? ""; },
      setupDeps: { npm: sys.npm },
      isRunning: async () => (running.length > 1 ? running.shift()! : running[0] ?? false),
      telegramFetch: bot.fetchImpl, pollMs: 1, pollTries: 3,
    });
  };
  return { home, profile, chainFile, sys, out, run, questions, bot, cwd };
}

const TOKEN = `123456789:${"A".repeat(35)}`;
const withChain = (s: { chainFile: string }) => writeFileSync(s.chainFile, JSON.stringify({ chains: { default: { steps: [{ agent: "codex", mode: "p" }] } } }));
const readConfig = (home: string) => JSON.parse(readFileSync(join(home, "daemon", "config.json"), "utf8"));
const NO_OPTIONAL: Rule = [/Telegram 채널|워크스페이스|지금 바로/, false];

test("daemon이 설정 쓰기 포트를 소유하면 install은 기기 설정을 덮어쓰지 않는다", async () => {
  const s = setup({ interactive: true, running: [true], rules: [NO_OPTIONAL] });
  withChain(s);
  const owner = await acquireInstance(s.home);
  try {
    assert.equal(await s.run(["install", "--yes"]), 0);
    assert.equal(existsSync(join(s.home, "daemon", "config.json")), false);
    assert.match(s.out.join("\n"), /설정을 바꾸려면 정지 후 install/);
  } finally { await owner.release(); }
});

test("S-19 대화형 수동 입력 — 시크릿·허용 사용자를 저장하고(토큰은 출력·질문에 없다), 거절하면 건너뛰고, 형식이 틀리면 API 없이 건너뛴다", async () => {
  const s = setup({ interactive: true, secret: TOKEN, bot: fakeBot({ getMe: { first_name: "봇", username: "pace_bot" }, getWebhookInfo: { url: "" } }),
    rules: [[/Telegram 채널/, true], [/보냈으면 Enter/, "m"], [/chat id/, "-1001234567890"], [/허용할 사용자 ID/, "42"]] });
  withChain(s);
  assert.equal(await s.run(["install", "--yes"]), 0);
  const secret = readTelegramSecret(s.home);
  assert.equal(secret?.token, TOKEN);
  assert.equal(secret?.chatId, "-1001234567890");
  assert.deepEqual(readConfig(s.home).allowedUsers, { telegram: ["42"] });
  assert.ok(!s.out.join("\n").includes(TOKEN) && !s.questions.join("\n").includes(TOKEN));
  assert.match(s.out.join("\n"), /봇 확인: 봇 \(@pace_bot\)/);
  assert.equal(s.sys.registry.size, 1);

  const declined = setup({ interactive: true, rules: [[/Telegram 채널/, false]] });
  withChain(declined);
  assert.equal(await declined.run(["install", "--yes"]), 0);
  assert.equal(readTelegramSecret(declined.home), null);
  assert.match(declined.out.join("\n"), /Telegram 설정은 건너뛴다/);

  const bad = setup({ interactive: true, secret: "nope", rules: [[/Telegram 채널/, true]] });
  withChain(bad);
  assert.equal(await bad.run(["install", "--yes"]), 0);
  assert.equal(readTelegramSecret(bad.home), null);
  assert.match(bad.out.join("\n"), /형식이 올바르지 않아/);
  assert.equal(bad.bot.calls.length, 0);
});

test("S-19b 자동 찾기 — getMe로 봇을 보이고 getUpdates에서 포럼 그룹·보낸 사람을 찾아 확인받고 저장한다", async () => {
  const updates = [
    { update_id: 1, message: { message_id: 1, chat: { id: 555, type: "private" }, from: { id: 555, first_name: "개인" } } },
    { update_id: 2, message: { message_id: 2, chat: { id: -100111, type: "supergroup", title: "일반 그룹" }, from: { id: 7, first_name: "다른" } } },
    { update_id: 3, message: { message_id: 3, is_topic_message: true, message_thread_id: 9, chat: { id: -100222, type: "supergroup", title: "PACE 포럼", is_forum: true }, from: { id: 1001, first_name: "캡", last_name: "틴" } } },
    { update_id: 4, message: { message_id: 4, chat: { id: -100222, type: "supergroup", title: "PACE 포럼", is_forum: true }, from: { id: 99, is_bot: true, first_name: "다른봇" } } },
  ];
  const bot = fakeBot({ getMe: { first_name: "알투", username: "r2_bot" }, getWebhookInfo: { url: "" }, getUpdates: updates });
  const s = setup({ interactive: true, secret: TOKEN, bot, rules: [[/Telegram 채널/, true], [/허용 사용자로 추가/, true]] });
  withChain(s);
  assert.equal(await s.run(["install", "--yes"]), 0);
  assert.deepEqual(bot.calls.map((c) => c.method), ["getMe", "getWebhookInfo", "getUpdates"]);
  assert.equal(readTelegramSecret(s.home)?.chatId, "-100222", "포럼 그룹이 먼저(기본 1번)");
  assert.deepEqual(readConfig(s.home).allowedUsers, { telegram: ["1001"] }, "봇·개인 채팅은 후보가 아니다");
  const text = s.out.join("\n");
  assert.match(text, /1\) PACE 포럼 \(chat id -100222\)/);
  assert.match(text, /2\) 일반 그룹 \(chat id -100111\).*확인되지 않았다/);
  assert.ok(!text.includes(TOKEN));
  const s2 = setup({ interactive: true, secret: TOKEN, bot: fakeBot({ getMe: { first_name: "알투" }, getWebhookInfo: { url: "" }, getUpdates: updates }), rules: [[/Telegram 채널/, true]] });
  withChain(s2);
  assert.equal(await s2.run(["install", "--yes"]), 0);
  assert.equal(readTelegramSecret(s2.home)?.chatId, "-100222");
  assert.equal(readConfig(s2.home).allowedUsers, undefined);
  assert.match(s2.out.join("\n"), /허용 사용자가 없어/);
});

test("S-19c webhook이 걸린 봇은 원인을 안내하고 직접 입력으로 이어 가며 getUpdates를 부르지 않는다(URL 경로는 표시하지 않는다)", async () => {
  const bot = fakeBot({ getMe: { first_name: "알투" }, getWebhookInfo: { url: "https://hooks.example.com/secret-path?x=1" } });
  const s = setup({ interactive: true, secret: TOKEN, bot, rules: [[/Telegram 채널/, true], [/chat id/, "-1005"], [/허용할 사용자 ID/, "8"]] });
  withChain(s);
  assert.equal(await s.run(["install", "--yes"]), 0);
  assert.ok(!bot.calls.some((c) => c.method === "getUpdates"));
  const text = s.out.join("\n");
  assert.match(text, /webhook이 걸려 있어\(hooks\.example\.com\)/);
  assert.doesNotMatch(text, /secret-path/);
  assert.equal(readTelegramSecret(s.home)?.chatId, "-1005");
  assert.deepEqual(readConfig(s.home).allowedUsers, { telegram: ["8"] });
});

test("S-19d getUpdates 실패(409)·메시지 없음이면 직접 입력으로 이어 가고 오류에 토큰이 없다", async () => {
  const bot = fakeBot({ getMe: { first_name: "알투" }, getWebhookInfo: { url: "" }, getUpdates: new Error(`Conflict: ${TOKEN} terminated by other getUpdates request`) });
  const s = setup({ interactive: true, secret: TOKEN, bot, rules: [[/Telegram 채널/, true], [/chat id/, "-1006"]] });
  withChain(s);
  assert.equal(await s.run(["install", "--yes"]), 0);
  assert.match(s.out.join("\n"), /메시지를 가져오지 못했다/);
  assert.ok(!s.out.join("\n").includes(TOKEN));
  assert.equal(readTelegramSecret(s.home)?.chatId, "-1006");
  const empty = setup({ interactive: true, secret: TOKEN, bot: fakeBot({ getMe: { first_name: "알투" }, getWebhookInfo: { url: "" }, getUpdates: [] }), rules: [[/Telegram 채널/, true], [/chat id/, "-1007"]] });
  withChain(empty);
  assert.equal(await empty.run(["install", "--yes"]), 0);
  assert.match(empty.out.join("\n"), /받은 그룹 메시지가 없다/);
  assert.equal(readTelegramSecret(empty.home)?.chatId, "-1007");
});

test("S-19e getMe 실패(토큰이 틀림)면 아무것도 저장하지 않는다", async () => {
  const s = setup({ interactive: true, secret: TOKEN, bot: fakeBot({ getMe: new Error("Unauthorized") }), rules: [[/Telegram 채널/, true]] });
  withChain(s);
  assert.equal(await s.run(["install", "--yes"]), 0);
  assert.equal(readTelegramSecret(s.home), null);
  assert.match(s.out.join("\n"), /토큰을 확인하지 못해/);
});

test("터미널이면 --yes 없이도 계획을 보인 뒤 [y/N] 확인을 받는다 — 거절하면 아무것도 바꾸지 않고, 승인하면 진행한다", async () => {
  const no = setup({ interactive: true, rules: [[/계획대로/, false]] });
  assert.equal(await no.run(["install"]), 0);
  assert.deepEqual(no.sys.calls, []);
  assert.deepEqual(readdirSync(no.home), []);
  assert.ok(!existsSync(no.chainFile));
  assert.match(no.out.join("\n"), /취소했다/);
  assert.match(no.out.join("\n"), /로그온 때 실행하는 시작 항목/, "계획은 먼저 보인다");
  assert.equal(no.questions.length, 1);
  const yes = setup({ interactive: true, rules: [[/계획대로/, true], NO_OPTIONAL] });
  withChain(yes);
  assert.equal(await yes.run(["install"]), 0);
  assert.equal(yes.sys.registry.size, 1);
  assert.ok(existsSync(launcherPath(yes.home)));
  const un = setup({ interactive: true, rules: [[/계획대로/, true]] });
  un.sys.registry.set(RUN_VALUE, `wscript.exe //B //Nologo "${launcherPath(un.home)}"`);
  assert.equal(await un.run(["uninstall"]), 0);
  assert.equal(un.sys.registry.size, 0);
  const unNo = setup({ interactive: true, rules: [[/계획대로/, false]] });
  unNo.sys.registry.set(RUN_VALUE, `wscript.exe //B //Nologo "${launcherPath(unNo.home)}"`);
  assert.equal(await unNo.run(["uninstall"]), 0);
  assert.equal(unNo.sys.registry.size, 1);
});

test("--start 없이 비대화형이면 시작하지 않고 `pace daemon start` 안내만 낸다", async () => {
  const s = setup();
  withChain(s);
  assert.equal(await s.run(["install", "--yes"]), 0);
  assert.equal(s.sys.started, 0);
  assert.match(s.out.join("\n"), /pace daemon start/);
});

test("--start는 등록 뒤 wscript로 숨김 기동하고 응답을 확인한다(이미 실행 중이면 다시 시작하지 않는다)", async () => {
  const s = setup({ running: [false, false, true] });
  withChain(s);
  assert.equal(await s.run(["install", "--yes", "--start"]), 0);
  assert.equal(s.sys.started, 1);
  const call = s.sys.calls.find((c) => c.command === "wscript.exe")!;
  assert.deepEqual(call.args, ["//B", "//Nologo", launcherPath(s.home)]);
  assert.ok(s.sys.calls.findIndex((c) => c.command === "wscript.exe") > s.sys.calls.findIndex((c) => c.command === "reg" && c.args[0] === "add"));
  assert.match(s.out.join("\n"), /daemon이 시작됐다/);
  const again = setup({ running: [true] });
  withChain(again);
  assert.equal(await again.run(["install", "--yes", "--start"]), 0);
  assert.equal(again.sys.started, 0);
  assert.match(again.out.join("\n"), /이미 실행 중이다/);
  await assert.rejects(() => again.run(["uninstall", "--start", "--yes"]));
});

test("대화형: 등록 뒤 시작할지 묻고, 이미 실행 중이고 설정이 바뀌었으면 재시작을 안내한다(자동 중지 없음)", async () => {
  const s = setup({ interactive: true, running: [false, false, true], rules: [[/지금 바로/, true], NO_OPTIONAL] });
  withChain(s);
  assert.equal(await s.run(["install", "--yes"]), 0);
  assert.equal(s.sys.started, 1);
  const busy = setup({ interactive: true, running: [true], rules: [[/지금 바로/, true], NO_OPTIONAL] });
  withChain(busy);
  assert.equal(await busy.run(["install", "--yes"]), 0);
  assert.equal(busy.sys.started, 0);
  assert.ok(!busy.questions.some((q) => /지금 바로/.test(q)));
  assert.match(busy.out.join("\n"), /이미 실행 중이라 바꾼 설정은 아직 적용되지 않았다.*daemon stop.*daemon start/);
  assert.ok(busy.sys.calls.every((c) => c.command !== "taskkill"));
});

test("pace daemon start — 떠 있으면 건너뛰고, 아니면 wscript로 시작하고, 실패·무응답은 1", async () => {
  const s = setup({ running: [false, true] });
  assert.equal(await s.run(["start"]), 0);
  assert.equal(s.sys.started, 1);
  assert.ok(existsSync(launcherPath(s.home)), "런처가 없으면 파일만 만든다");
  assert.equal(s.sys.registry.size, 0, "start는 레지스트리를 바꾸지 않는다");
  const up = setup({ running: [true] });
  assert.equal(await up.run(["start"]), 0);
  assert.equal(up.sys.started, 0);
  const fail = setup({ running: [false] });
  fail.sys.wscriptFails = true;
  assert.equal(await fail.run(["start"]), 1);
  const silent = setup({ running: [false] });
  assert.equal(await silent.run(["start"]), 1);
  assert.match(silent.out.join("\n"), /아직 응답하지 않는다/);
  await assert.rejects(() => s.run(["start", "x"]));
});

test("기기 이름 — 컴퓨터 이름을 형식에 맞게 정규화해 기본으로 묻고 저장한다(이미 있으면 묻지 않는다)", async () => {
  const s = setup({ interactive: true, hostName: "My PC.local", rules: [NO_OPTIONAL] });
  withChain(s);
  assert.equal(await s.run(["install", "--yes"]), 0);
  assert.equal(readConfig(s.home).device, "My-PC.local");
  const typed = setup({ interactive: true, rules: [[/기기의 이름/, "내 컴퓨터"], NO_OPTIONAL] });
  withChain(typed);
  assert.equal(await typed.run(["install", "--yes"]), 0);
  assert.equal(readConfig(typed.home).device, "device");
  const has = setup({ interactive: true, rules: [NO_OPTIONAL] });
  withChain(has);
  mkdirSync(join(has.home, "daemon"), { recursive: true });
  writeFileSync(join(has.home, "daemon", "config.json"), JSON.stringify({ device: "DEV-AP1" }));
  assert.equal(await has.run(["install", "--yes"]), 0);
  assert.equal(readConfig(has.home).device, "DEV-AP1");
  assert.ok(!has.questions.some((q) => /기기의 이름/.test(q)));
  assert.equal(normalizeDeviceName("  __캡틴"), "device");
  assert.equal(normalizeDeviceName("a".repeat(60)).length, 40);
});

test("워크스페이스 — git 저장소 폴더면 기본 제안하고 이름·경로를 확인받아 등록한다(이미 등록된 것은 건드리지 않는다)", async () => {
  const repo = tempDir("pace-ws-repo-");
  mkdirSync(join(repo, ".git"));
  const sub = join(repo, "src"); mkdirSync(sub);
  const s = setup({ interactive: true, cwd: sub, rules: [[/Telegram 채널|지금 바로/, false], [/git 저장소다/, true], [/워크스페이스 이름/, "pace"]] });
  withChain(s);
  assert.equal(await s.run(["install", "--yes"]), 0);
  assert.deepEqual(readConfig(s.home).workspaces, [{ name: "pace", path: resolve(repo) }]);
  assert.ok(s.questions.some((q) => q.includes(resolve(repo))), "제안에 저장소 루트를 보인다");
  assert.match(s.out.join("\n"), /\/bind pace/);
  const s2 = setup({ interactive: true, cwd: repo, rules: [[/Telegram 채널|지금 바로/, false], [/git 저장소다/, true]] });
  withChain(s2);
  mkdirSync(join(s2.home, "daemon"), { recursive: true });
  writeFileSync(join(s2.home, "daemon", "config.json"), JSON.stringify({ workspaces: [{ name: "already", path: resolve(repo) }] }));
  assert.equal(await s2.run(["install", "--yes"]), 0);
  assert.ok(!s2.questions.some((q) => /git 저장소다/.test(q)));
  assert.deepEqual(readConfig(s2.home).workspaces, [{ name: "already", path: resolve(repo) }]);
  const s3 = setup({ interactive: true, cwd: repo, rules: [[/Telegram 채널|지금 바로/, false], [/git 저장소다/, false]] });
  withChain(s3);
  assert.equal(await s3.run(["install", "--yes"]), 0);
  assert.equal(readConfig(s3.home).workspaces, undefined);
  const s4 = setup({ interactive: true, cwd: repo, rules: [[/Telegram 채널|지금 바로/, false], [/git 저장소다/, true], [/워크스페이스 이름/, "dup"], [/다른 이름/, "dup"]] });
  withChain(s4);
  mkdirSync(join(s4.home, "daemon"), { recursive: true });
  writeFileSync(join(s4.home, "daemon", "config.json"), JSON.stringify({ workspaces: [{ name: "dup", path: resolve(tempDir("pace-other-")) }] }));
  assert.equal(await s4.run(["install", "--yes"]), 0);
  assert.equal(readConfig(s4.home).workspaces.length, 1);
  assert.match(s4.out.join("\n"), /건너뛴다/);
});

test("관리자 권한 안내 문구는 한 번만 나온다", async () => {
  const s = setup();
  withChain(s);
  assert.equal(await s.run(["install", "--yes"]), 0);
  assert.equal(s.out.join("\n").split("관리자 권한은 필요 없다").length - 1, 1);
});
