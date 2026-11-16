import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { daemonCommand } from "../src/daemon/cli.ts";
import { requestStop } from "../src/daemon/instance.ts";
import { runDaemon } from "../src/daemon/index.ts";
import { telegramSecretFile, telegramStateFile, writeTelegramSecret } from "../src/daemon/telegram/index.ts";
import { emptyTelegramState, loadTelegramState, saveTelegramState } from "../src/daemon/telegram/state.ts";
import type { Runner } from "../src/daemon/types.ts";
import { daemonHome, sleep, startFixtureDaemon, waitReady } from "./daemon-proc-helpers.ts";
import { MockTelegram } from "./telegram-mock.ts";
import { CHAT, TOKEN, U1, until } from "./telegram-helpers.ts";

const stateOf = (home: string) => JSON.parse(readFileSync(join(home, "daemon", "state.json"), "utf8")) as { tasks: Record<string, { origin: { messageId: string }; status: string }>; outbox: unknown[] };

test("S-17 실제 daemon 프로세스: 작업 수락 뒤 offset 저장 전 강제 종료 → 재기동·같은 update 재전달에도 재실행 없음, 중단 안내가 해당 토픽에 도착", async () => {
  const mock = await new MockTelegram().start();
  const { home } = daemonHome({ allowedUsers: { telegram: [String(U1)] } });
  writeTelegramSecret(home, { token: TOKEN, chatId: String(CHAT), apiBase: mock.base });
  saveTelegramState(telegramStateFile(home), { ...emptyTelegramState(), topics: { "11": "a" } });
  const first = startFixtureDaemon(home, { PACE_TELEGRAM_HOLD_OFFSET: "1" });
  let second: ReturnType<typeof startFixtureDaemon> | null = null;
  try {
    await waitReady(home, first);
    await until(() => mock.texts().some((x) => x.includes("연결됨")), 15_000, "연결 알림");
    const id = mock.text(CHAT, 11, U1, "sleep:60000", { message_id: 8001 });
    await until(() => Object.values(stateOf(home).tasks).some((t) => t.status === "running"), 15_000, "작업 실행 중");
    assert.equal(loadTelegramState(telegramStateFile(home))!.offset, 0, "offset 파일은 저장 전");
    first.kill();
    await first.exited;
    // 같은 update가 재전달된다
    mock.push({ message: { message_id: 8001, date: Math.floor(Date.now() / 1000), chat: { id: CHAT }, from: { id: U1, is_bot: false }, text: "sleep:60000", message_thread_id: 11 } }, id);
    mock.calls.length = 0;
    second = startFixtureDaemon(home);
    await waitReady(home, second);
    await until(() => mock.sent().some((c) => c.params.message_thread_id === 11 && /중단/.test(String(c.params.text))), 15_000, "중단 작업 안내가 해당 토픽으로");
    await until(() => loadTelegramState(telegramStateFile(home))!.offset === id + 1, 15_000, "재전달 update 확인");
    const tasks = Object.values(stateOf(home).tasks).filter((t) => t.origin.messageId === "m8001");
    assert.equal(tasks.length, 1, "작업은 하나뿐 — 재실행 없음");
    assert.ok(!mock.texts().some((x) => x.includes("시작 —")), "재기동 뒤 새 작업이 시작되지 않았다");
  } finally {
    first.kill();
    second?.kill();
    await sleep(100);
    await mock.close();
  }
});

test("S-18 `pace daemon telegram init`은 토큰을 표준 입력으로만 받아 0600 시크릿으로 저장하고 출력·기록에 노출하지 않는다", async () => {
  const { home } = daemonHome();
  process.env.PACE_HOME = home;
  try {
    const out: string[] = [];
    const code = await daemonCommand(["telegram", "init", "--chat-id", String(CHAT)], { out: (l) => out.push(l), readStdin: async () => `${TOKEN}\n` });
    assert.equal(code, 0);
    assert.ok(existsSync(telegramSecretFile(home)));
    assert.ok(!out.join("\n").includes(TOKEN) && !out.join("\n").includes("123456789"));
    if (process.platform !== "win32") assert.equal(statSync0600(telegramSecretFile(home)), true);
    await assert.rejects(() => daemonCommand(["telegram", "init", "--chat-id", String(CHAT)], { out: () => undefined, readStdin: async () => "형식이 틀림\n" }), /봇 토큰/);
    await assert.rejects(() => daemonCommand(["telegram", "init", "--chat-id", "abc"], { out: () => undefined, readStdin: async () => TOKEN }), /chat-id/);
    // reset-offset은 --yes 없이는 아무것도 하지 않는다
    saveTelegramState(telegramStateFile(home), { ...emptyTelegramState(), offset: 55, topics: { "9": "a" } });
    await daemonCommand(["telegram", "reset-offset"], { out: (l) => out.push(l) });
    assert.equal(loadTelegramState(telegramStateFile(home))!.offset, 55);
    await daemonCommand(["telegram", "reset-offset", "--yes"], { out: (l) => out.push(l) });
    const st = loadTelegramState(telegramStateFile(home))!;
    assert.equal(st.offset, 0); assert.deepEqual(st.topics, { "9": "a" });
  } finally { delete process.env.PACE_HOME; }
});

function statSync0600(file: string): boolean { return (require0().statSync(file).mode & 0o077) === 0; }
function require0(): typeof import("node:fs") { return globalThis.process.getBuiltinModule("node:fs") as typeof import("node:fs"); }

test("S-18 runDaemon은 시크릿이 있으면 Telegram 어댑터를 연결하고 없으면 건너뛰며, status·logs·출력에 토큰이 없다", async () => {
  const runner: Runner = async () => ({ status: "done", text: "ok", cleanupUnconfirmed: false });
  // 시크릿 없음 — 건너뜀
  const a = daemonHome();
  const outA: string[] = [];
  const pa = runDaemon({ home: a.home, runner, noSignals: true, out: (l) => outA.push(l) });
  await until(() => outA.some((l) => l.includes("pace daemon 시작")), 15_000, "기동(시크릿 없음)");
  requestStop(a.home);
  assert.equal(await pa, 0);
  assert.ok(!outA.some((l) => l.includes("Telegram")));
  // 시크릿 있음 — 연결, 토큰 비노출
  const mock = await new MockTelegram().start();
  const b = daemonHome({ allowedUsers: { telegram: [String(U1)] } });
  writeTelegramSecret(b.home, { token: TOKEN, chatId: String(CHAT), apiBase: mock.base });
  const outB: string[] = [];
  const pb = runDaemon({ home: b.home, runner, noSignals: true, out: (l) => outB.push(l) });
  try {
    await until(() => mock.sent("setMyCommands").length === 1, 15_000, "Telegram 연결");
    // setMyCommands 수신과 시작 로그 출력은 순서가 보장되지 않는다(부하가 큰 Linux 컨테이너에서 경합) — 로그를 기다린다
    await until(() => outB.some((l) => l.includes("Telegram 어댑터 시작")), 10_000, "Telegram 어댑터 시작 로그");
    const logFile = join(b.home, "daemon", "daemon.log");
    const everything = `${outB.join("\n")}\n${existsSync(logFile) ? readFileSync(logFile, "utf8") : ""}\n${readFileSync(join(b.home, "daemon", "status.json"), "utf8")}`;
    assert.ok(!everything.includes(TOKEN) && !everything.includes("123456789"));
    assert.ok(!readFileSync(join(b.home, "daemon", "state.json"), "utf8").includes("123456789"));
  } finally {
    requestStop(b.home);
    assert.equal(await pb, 0);
    await mock.close();
  }
});
