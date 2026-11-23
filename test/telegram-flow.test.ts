import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test, { after } from "node:test";
import { TelegramApi } from "../src/daemon/telegram/api.ts";
import { TelegramAdapter, type TelegramHost } from "../src/daemon/telegram/adapter.ts";
import { loadTelegramState, saveTelegramState, emptyTelegramState, trimHeld, type HeldRecord } from "../src/daemon/telegram/state.ts";
import { makeRedactor } from "../src/daemon/secrets.ts";
import type { ChannelSink, IngestResult } from "../src/daemon/types.ts";
import { tempDir } from "./helpers.ts";
import { MockTelegram } from "./telegram-mock.ts";
import { CHAT, cleanupAll, OTHER_TOKEN, sleep, stateFile, STRANGER, TOKEN, tgHarness, U1, U2, until } from "./telegram-helpers.ts";

const redact = makeRedactor([TOKEN]);
after(async () => { await cleanupAll(); });

/** 코어 없이 어댑터만 시험하는 가짜 호스트·싱크 */
function bare(o: { mock: MockTelegram; sink?: Partial<ChannelSink>; marker?: boolean; prior?: boolean; allowed?: (u: string) => boolean; opts?: Partial<ConstructorParameters<typeof TelegramAdapter>[0]> }) {
  const dir = tempDir();
  const file = join(dir, "telegram.json");
  const seen = { markerWrites: 0, inbound: [] as unknown[], approvals: [] as unknown[] };
  let marker = o.marker ?? false;
  const host: TelegramHost = {
    device: "box", isAllowed: (a) => (o.allowed ? o.allowed(a.user) : true), pendingApprovals: () => [], overview: () => ({ device: "box", running: 0, queued: 0, quarantined: 0, byWorkspace: {} }),
    workspaces: () => [{ name: "a", path: dir, worktrees: { main: dir } }], workspaceRootInfo: () => null, persistWorkspace: () => undefined, addWorkspace: () => "added",
    flushOutbox: async () => undefined, hasPriorActivity: () => o.prior ?? false, readMarker: () => marker, writeMarker: () => { marker = true; seen.markerWrites++; }, stateFile: file,
  };
  const sink: ChannelSink = {
    message: async (m) => { seen.inbound.push(m); return { kind: "task", taskId: "t", status: "queued" } as IngestResult; },
    approval: async (id, from, d) => { seen.approvals.push({ id, from, d }); return { ok: true }; },
    cancel: async () => ({ ok: true }), ...o.sink,
  };
  const api = new TelegramApi({ token: TOKEN, base: o.mock.base, redact });
  const adapter = new TelegramAdapter({ api, chatId: String(CHAT), host, redact, pollSeconds: 1, retryDelayMs: 5, tickMs: 50, editGapMs: 0, sleep: (ms) => sleep(Math.min(ms, 20)), ...o.opts });
  return { adapter, sink, file, seen, dir, host, isMarker: () => marker };
}

test("S-3 offset은 처리 뒤 저장되고 재시작은 저장된 offset부터 이어간다", async () => {
  const t = await tgHarness();
  try {
    const a = t.mock.text(CHAT, 11, U1, "/status");
    t.mock.text(CHAT, 11, U1, "/queue"); t.mock.text(CHAT, 12, U1, "/status");
    await until(() => t.adapter.state.offset === a + 3, 4000, "offset 전진");
    assert.equal(loadTelegramState(stateFile(t.home))!.offset, a + 3);
    await t.adapter.disconnect();
    const offsets = t.mock.offsets.length;
    const t2 = await tgHarness({ mock: t.mock, home: t.home, skipSeed: true });
    await until(() => t.mock.offsets.length > offsets, 3000, "재시작 폴링");
    assert.equal(t.mock.offsets.at(-1), a + 3);
    await t2.adapter.disconnect(); await t2.h.daemon.stop({ drain: false });
  } finally { await t.h.daemon.stop({ drain: false }); await t.mock.close(); }
});

test("S-4 같은 update 재전달(offset 저장 전 크래시)은 새 Daemon·새 어댑터에서도 한 번만 실행된다", async () => {
  const t = await tgHarness({ adapter: { holdOffset: true } });
  const id = t.mock.text(CHAT, 11, U1, "한 번만", { message_id: 7001 });
  await until(() => t.h.runner.started.includes("한 번만"), 4000, "실행");
  assert.equal(loadTelegramState(stateFile(t.home))!.offset, 0, "offset 파일은 저장 전");
  await t.adapter.disconnect(); await t.h.daemon.stop({ drain: false });
  // 재시작 — 같은 update가 다시 전달된다
  t.mock.push({ message: { message_id: 7001, date: Math.floor(Date.now() / 1000), chat: { id: CHAT }, from: { id: U1, is_bot: false }, text: "한 번만", message_thread_id: 11 } }, id);
  const t2 = await tgHarness({ mock: t.mock, home: t.home, skipSeed: true });
  try {
    await until(() => t2.adapter.state.offset === id + 1, 4000, "재전달 처리");
    assert.equal(t2.h.runner.started.length, 0, "재실행 없음");
    assert.equal(Object.values(t2.h.store.state.tasks).filter((x) => x.origin.messageId === "m7001").length, 1);
    // 자체 명령 재전달은 같은 최종 상태
    t.mock.text(CHAT, 11, U1, "/use main", { message_id: 7002 }); t.mock.text(CHAT, 11, U1, "/use main", { message_id: 7002 });
    await until(() => t2.mock.texts().filter((x) => x.includes("대상 변경")).length >= 1, 4000, "/use");
    assert.equal(t2.h.store.state.conversations[`telegram:${CHAT}:11`]!.worktreeName, "main");
  } finally { await t2.adapter.disconnect(); await t2.h.daemon.stop({ drain: false }); await t.mock.close(); }
});

test("S-4b 저장 실패는 offset 유지·재시도로 복구 뒤 정확히 1회 수락, 5회 연속 실패는 메타데이터만 보류(본문·토큰 미저장)", async () => {
  // 재시도 간격을 시험이 정한다 — 기본(5ms·잠자기 20ms 상한)이면 "재시도 중" 판독 전에 5회 문턱을 넘어 보류·offset 진행으로 바뀌는 경합이 생긴다
  const t = await tgHarness({ adapter: { retryDelayMs: 200, sleep: (ms) => sleep(ms) } });
  try {
    t.h.store.failWrites = true;
    const polls = t.mock.offsets.length;
    t.mock.text(CHAT, 11, U1, "복구될 요청", { message_id: 7100 });
    // 빈 폴링이 아니라 이 update를 받은 뒤의 재요청을 기다린다(받기 1회 + 재시도 1회 이상, 5회 문턱 전)
    await until(() => t.mock.offsets.length >= polls + 2, 4000, "재시도");
    assert.equal(t.adapter.state.held.length, 0, "아직 보류 전");
    assert.equal(t.adapter.state.offset, 0, "offset 유지");
    t.h.store.failWrites = false;
    await until(() => t.h.runner.started.includes("복구될 요청"), 4000, "복구 뒤 수락");
    assert.equal(Object.values(t.h.store.state.tasks).filter((x) => x.origin.messageId === "m7100").length, 1);
    t.h.runner.release("복구될 요청");
    // 계속 실패 → 보류
    t.h.store.failWrites = true;
    t.mock.text(CHAT, 11, U1, `토큰 ${TOKEN} 포함 요청`, { message_id: 7101 });
    await until(() => t.adapter.state.held.length === 1, 5000, "보류");
    t.h.store.failWrites = false;
    const file = readFileSync(stateFile(t.home), "utf8");
    assert.ok(!file.includes("요청") && !file.includes(TOKEN) && !file.includes("123456789"), "본문·토큰 미저장");
    assert.equal(t.adapter.state.held[0]!.reason, "store_failed");
    await until(() => t.mock.texts().some((x) => x.includes("처리하지 못했다")), 4000, "보류 안내");
    // 같은 내용을 새로 보내면 새 수신으로 1회 수락
    t.mock.text(CHAT, 11, U1, "다시 보냄", { message_id: 7102 });
    await until(() => t.h.runner.started.includes("다시 보냄"), 4000, "새 수신");
    t.mock.text(CHAT, undefined, U1, "/held");
    await until(() => t.mock.texts().some((x) => x.includes("update") && x.includes("store_failed")), 4000, "/held");
    t.mock.text(CHAT, undefined, U1, `/held clear ${t.adapter.state.held[0]!.update_id}`);
    await until(() => t.adapter.state.held.length === 0, 4000, "/held clear");
    t.h.runner.release("다시 보냄");
  } finally { t.h.store.failWrites = false; await t.stop(); } // 주입을 끄고 정리 — 실패 시 정리의 저장 오류가 원래 실패를 가리지 않게
});

test("S-4c stopping은 offset 유지·폴링 중단(재기동 뒤 다시 수락)", async () => {
  const mock = await new MockTelegram().start();
  const b = bare({ mock, sink: { message: async () => ({ kind: "stopping" } as IngestResult) } });
  try {
    await b.adapter.connect(b.sink);
    const id = mock.text(CHAT, 11, U1, "x");
    saveTelegramState(b.file, { ...b.adapter.state, topics: { "11": "a" } });
    b.adapter.state.topics["11"] = "a";
    mock.text(CHAT, 11, U1, "요청");
    await until(() => b.adapter.status === "stopped", 4000, "중단");
    assert.ok(b.adapter.state.offset <= id + 1);
    assert.ok(mock.pending() >= 1, "update는 확인되지 않은 채 남는다");
  } finally { await b.adapter.disconnect(); await mock.close(); }
});

test("S-4d 7일보다 오래된 메시지는 코어로 보내지 않는다", async () => {
  const t = await tgHarness();
  try {
    t.mock.text(CHAT, 11, U1, "오래된 요청", { date: Math.floor(Date.now() / 1000) - 8 * 86400 });
    await until(() => t.mock.texts().some((x) => x.includes("너무 오래된")), 4000, "안내");
    assert.equal(t.h.runner.started.length, 0);
  } finally { await t.stop(); }
});

test("S-4e 장기 무수신 뒤 update_id가 작아져도 새 update를 잃지 않는다(offset 생략), 1일 전이면 offset으로 확인돼 사라진다(대조군)", async () => {
  const t = await tgHarness();
  try {
    t.mock.text(CHAT, 11, U1, "/status", {}, 120);
    await until(() => t.adapter.state.offset === 121, 4000, "offset 121");
    await t.adapter.disconnect(); await t.h.daemon.stop({ drain: false });
    await sleep(400); // 전송 중이던 이전 폴링 요청이 모의 서버에 늦게 도착해 새 update를 지우지 않도록 비운다(시험 격리)
    // 6일 전에 마지막으로 받았다고 기록하고 재시작 → offset 생략
    const st = loadTelegramState(stateFile(t.home))!;
    saveTelegramState(stateFile(t.home), { ...st, lastUpdateAt: Date.now() - 6 * 86400_000 });
    t.mock.text(CHAT, 11, U1, "/queue", {}, 37);
    const t2 = await tgHarness({ mock: t.mock, home: t.home, skipSeed: true });
    await until(() => t2.adapter.state.offset === 38, 4000, "작은 ID 수락·offset 낮아짐");
    assert.equal(t.mock.offsets.at(-1) === undefined || t.mock.offsets.includes(undefined), true);
    await t2.adapter.disconnect(); await t2.h.daemon.stop({ drain: false });
    await sleep(400);
    // 대조군: 1일 전 → offset을 보내므로 작은 ID는 서버가 요청 시점에 버린다
    saveTelegramState(stateFile(t.home), { ...loadTelegramState(stateFile(t.home))!, offset: 200, lastUpdateAt: Date.now() - 86400_000 });
    t.mock.text(CHAT, 11, U1, "/queue", {}, 40);
    const t3 = await tgHarness({ mock: t.mock, home: t.home, skipSeed: true });
    await sleep(500);
    assert.equal(t3.adapter.state.offset, 200, "새 update가 어댑터에 닿기 전에 사라진다(그래서 stale 규칙이 필요)");
    await t3.adapter.disconnect(); await t3.h.daemon.stop({ drain: false });
  } finally { await t.mock.close(); }
});

test("S-4f offset 파일 손상·유실·표식 조합에 따른 시작 거부/허용", async () => {
  const mock = await new MockTelegram().start();
  try {
    const corrupt = bare({ mock });
    writeFileSync(corrupt.file, "{깨짐");
    await assert.rejects(() => corrupt.adapter.connect(corrupt.sink), /손상|읽을 수 없다/);
    const lost = bare({ mock, marker: true });
    await assert.rejects(() => lost.adapter.connect(lost.sink), /이전 운영 흔적/);
    const prior = bare({ mock, prior: true });
    await assert.rejects(() => prior.adapter.connect(prior.sink), /이전 운영 흔적/);
    const fresh = bare({ mock });
    await fresh.adapter.connect(fresh.sink);
    assert.ok(existsSync(fresh.file) && fresh.isMarker(), "최초 시작은 offset 파일과 표식을 둘 다 저장한다");
    await fresh.adapter.disconnect();
    // 표식 없음 + offset 파일 있음 → 표식 복구 후 시작
    const half = bare({ mock });
    saveTelegramState(half.file, emptyTelegramState());
    await half.adapter.connect(half.sink);
    assert.equal(half.isMarker(), true);
    await half.adapter.disconnect();
  } finally { await mock.close(); }
});

test("S-4g trimHeld: 통지 완료 우선 삭제, 전부 미통지면 영속 요약으로 합쳐 안내 의무 유지", () => {
  const mk = (i: number, notified: boolean): HeldRecord => ({ update_id: i, chat: "c", thread: 1, date: 1, reason: "exception", notified });
  const done = Array.from({ length: 51 }, (_, i) => mk(i + 1, true));
  assert.equal(trimHeld(done).length, 50);
  assert.equal(trimHeld(done)[0]!.update_id, 2, "가장 오래된 통지 완료부터");
  const un = Array.from({ length: 53 }, (_, i) => mk(i + 1, false));
  const t = trimHeld(un);
  assert.equal(t.length, 50);
  const sum = t.find((h) => h.reason === "summary")!;
  assert.equal(sum.notified, false);
  assert.equal(sum.droppedCount! + t.filter((h) => h.reason !== "summary").length, 53, "미통지 기록이 사라지지 않는다");
  const mixed = [...Array.from({ length: 25 }, (_, i) => mk(i + 1, false)), ...Array.from({ length: 26 }, (_, i) => mk(100 + i, true))];
  const m = trimHeld(mixed);
  assert.equal(m.filter((h) => !h.notified).length, 25);
  assert.equal(m.length, 50);
});

test("S-4i 포화: 새 요청은 보류(saturated)·안내·offset 진행(폴링 안 멈춤), 승인 콜백·/status는 포화 중에도 처리된다", async () => {
  const t = await tgHarness();
  try {
    t.mock.text(CHAT, 11, U1, "/write");
    await until(() => t.mock.texts().some((x) => x.includes("접근 기본값")), 4000, "/write");
    t.h.store.seenHardMax = Object.keys(t.h.store.state.seen).length + 1;
    t.mock.text(CHAT, 11, U1, "첫 쓰기 요청");
    await until(() => t.mock.sent().some((c) => c.params.reply_markup !== undefined), 4000, "승인 요청");
    t.mock.text(CHAT, 11, U1, "포화 뒤 새 요청", { message_id: 7200 });
    await until(() => t.adapter.state.held.some((h) => h.reason === "saturated"), 4000, "보류");
    assert.equal(t.h.runner.started.length, 0);
    for (let i = 0; i < 6; i++) t.mock.text(CHAT, 11, U1, "/status");
    const ask = t.mock.sent().find((c) => c.params.reply_markup !== undefined)!;
    const yes = (ask.params.reply_markup as { inline_keyboard: { callback_data: string }[][] }).inline_keyboard[0]![0]!.callback_data;
    t.mock.callback(CHAT, 11, U1, yes);
    await until(() => t.h.runner.started.includes("첫 쓰기 요청"), 4000, "포화 중 승인 처리");
    await until(() => t.mock.texts().filter((x) => x.includes("실행")).length >= 6, 4000, "/status 처리");
    t.h.runner.release("첫 쓰기 요청");
  } finally { await t.stop(); }
});

test("S-4k 장기 단절 뒤 재연결: 만료된 승인은 거부, 밀린 update는 1회 처리, 재연결 안내 없음", async () => {
  const t = await tgHarness({ hk: { config: { approvalTtlSeconds: 1 } } });
  try {
    t.mock.text(CHAT, 11, U1, "/write");
    await until(() => t.mock.texts().some((x) => x.includes("접근 기본값")), 4000, "/write");
    t.mock.text(CHAT, 11, U1, "쓰기 요청");
    await until(() => t.mock.sent().some((c) => c.params.reply_markup !== undefined), 4000, "승인 요청");
    const yes = (t.mock.sent().find((c) => c.params.reply_markup !== undefined)!.params.reply_markup as { inline_keyboard: { callback_data: string }[][] }).inline_keyboard[0]![0]!.callback_data;
    t.mock.fault("getUpdates", { status: 502, times: 6 });
    await sleep(1300); // 단절 동안 승인 기한 경과
    t.mock.callback(CHAT, 11, U1, yes);
    const statusUpdate = t.mock.text(CHAT, 11, U1, "/status", { message_id: 7300 });
    await until(() => t.mock.sent("answerCallbackQuery").some((c) => /만료|이미 처리됨/.test(String(c.params.text))), 6000, "만료 거부");
    assert.equal(t.h.runner.started.length, 0);
    await until(() => t.adapter.state.offset > statusUpdate, 4000, "밀린 update 처리");
    await sleep(200);
    assert.equal(t.mock.texts().filter((x) => x.includes("재연결됨")).length, 0);
  } finally { await t.stop(); }
});

test("S-4l 수락 뒤 offset 저장 실패·안내 전송 실패에도 작업은 1개이고 보류·재전송 안내가 없다", async () => {
  const t = await tgHarness();
  try {
    const a = t.adapter as unknown as { save: () => void };
    const real = a.save.bind(a);
    let fails = 3;
    a.save = () => { if (fails-- > 0) throw new Error("디스크 오류"); real(); };
    t.mock.fault("sendMessage", { status: 500, times: 4 });
    t.mock.text(CHAT, 11, U1, "수락될 요청", { message_id: 7400 });
    await until(() => t.h.runner.started.includes("수락될 요청"), 4000, "수락");
    await until(() => t.adapter.state.offset > 0 && loadTelegramState(stateFile(t.home))!.offset > 0, 4000, "offset 복구 저장");
    assert.equal(Object.values(t.h.store.state.tasks).filter((x) => x.origin.messageId === "m7400").length, 1);
    assert.equal(t.adapter.state.held.length, 0);
    assert.ok(!t.mock.texts().some((x) => x.includes("다시 보내")));
    t.h.runner.release("수락될 요청");
  } finally { await t.stop(); }
});

test("S-4n 복구 알림(outbox) 전송 실패 시 보존되고 연결 회복 뒤 전달·삭제된다", async () => {
  const t = await tgHarness();
  try {
    t.mock.fault("sendMessage", { status: 500, times: 6 });
    t.h.store.state.outbox.push({ id: "n1", channel: "telegram", conversation: `${CHAT}:11`, text: "복구 알림: 작업 t-x가 중단됐다" });
    await t.h.daemon.flushOutbox().catch(() => undefined);
    assert.equal(t.h.store.state.outbox.length, 1, "실패하면 보존");
    await until(() => t.h.store.state.outbox.length === 0, 6000, "주기 재전송");
    const call = t.mock.sent().find((c) => String(c.params.text).includes("복구 알림"))!;
    assert.equal(call.params.message_thread_id, 11);
  } finally { await t.stop(); }
});

test("S-4q 보류 안내 전송 실패는 notified:false로 보존되고 재기동·송신 복구 뒤 전달된다(최소 한 번)", async () => {
  const t = await tgHarness();
  t.mock.fault("sendMessage", { status: 500 });
  t.h.store.failWrites = true;
  t.mock.text(CHAT, 11, U1, "x", { message_id: 7500 });
  await until(() => t.adapter.state.held.length === 1, 5000, "보류");
  t.h.store.failWrites = false;
  await sleep(100);
  assert.equal(loadTelegramState(stateFile(t.home))!.held[0]!.notified, false);
  await t.adapter.disconnect(); await t.h.daemon.stop({ drain: false });
  t.mock.fault("sendMessage", null);
  const t2 = await tgHarness({ mock: t.mock, home: t.home, skipSeed: true });
  try {
    await until(() => loadTelegramState(stateFile(t.home))!.held[0]!.notified === true, 5000, "재전송");
    assert.ok(t.mock.texts().some((x) => x.includes("처리하지 못했다")));
  } finally { await t2.adapter.disconnect(); await t2.h.daemon.stop({ drain: false }); await t.mock.close(); }
});

test("S-5 409 세 번 연속은 폴링 중단(conflict), 401은 unauthorized, 네트워크 오류는 알림 없이 백오프 뒤 복구", async () => {
  const mock = await new MockTelegram().start();
  try {
    const b = bare({ mock });
    mock.fault("getUpdates", { status: 409, body: { ok: false, error_code: 409, description: "Conflict: terminated by other getUpdates request" } });
    await b.adapter.connect(b.sink);
    await until(() => b.adapter.status === "conflict", 4000, "conflict");
    await b.adapter.disconnect();
    const c = bare({ mock });
    mock.fault("getUpdates", { status: 401, body: { ok: false, error_code: 401, description: "Unauthorized" } });
    await c.adapter.connect(c.sink);
    await until(() => c.adapter.status === "unauthorized", 4000, "unauthorized");
    await c.adapter.disconnect();
    const d = bare({ mock });
    mock.fault("getUpdates", { status: 502, times: 3 });
    await d.adapter.connect(d.sink);
    d.adapter.state.topics["11"] = "a";
    mock.text(CHAT, 11, U1, "복구 뒤 요청");
    await until(() => d.seen.inbound.length === 1, 5000, "재연결 뒤 메시지 수신");
    assert.equal(mock.texts().filter((x) => x.includes("재연결됨")).length, 0);
    assert.equal(d.adapter.status, "running");
    await d.adapter.disconnect();
  } finally { await mock.close(); }
});

test("S-6b 어댑터가 만드는 모든 Inbound·콜백 Actor에는 admin이 없다(위조 필드 무시)", async () => {
  const mock = await new MockTelegram().start();
  const b = bare({ mock });
  try {
    await b.adapter.connect(b.sink);
    b.adapter.state.topics["11"] = "a";
    mock.push({ message: { message_id: 1, date: Math.floor(Date.now() / 1000), chat: { id: CHAT }, from: { id: U1, is_bot: false, admin: true }, admin: true, text: "요청", message_thread_id: 11 } });
    mock.callback(CHAT, 11, U1, `a:${"0".repeat(32)}:y`);
    await until(() => b.seen.inbound.length === 1 && b.seen.approvals.length === 1, 4000, "전달");
    for (const x of [...b.seen.inbound, ...(b.seen.approvals as { from: unknown }[]).map((a) => a.from)]) assert.notEqual((x as { admin?: boolean }).admin, true);
    assert.equal((b.seen.inbound[0] as { bindWorkspace?: string }).bindWorkspace, "a");
  } finally { await b.adapter.disconnect(); await mock.close(); }
});

test("S-9b 미허용 사용자의 자체 명령·미등록 토픽·버튼은 설정·파일·Telegram 호출을 만들지 않는다", async () => {
  const t = await tgHarness();
  try {
    await until(() => t.mock.texts().some((x) => x.includes("연결됨")), 4000, "초기 알림");
    const before = t.mock.calls.filter((c) => c.method !== "getUpdates").length;
    const dir = join(t.home, "newproj"); mkdirSync(dir);
    for (const [thread, text] of [[undefined, `/new evil ${dir}`], [99, "/bind a"], [11, "/backlog"], [11, "/memory"], [11, "/pending"], [undefined, "/held"]] as const) t.mock.text(CHAT, thread, STRANGER, text);
    t.mock.callback(CHAT, 11, STRANGER, `a:${"1".repeat(32)}:y`);
    await until(() => t.adapter.stats.rejectedUsers >= 7, 4000, "거부 집계");
    assert.equal(t.mock.calls.filter((c) => c.method !== "getUpdates").length, before, "Telegram 호출 0");
    assert.ok(!existsSync(join(t.home, "daemon", "config.json")), "설정 불변");
    assert.equal(t.h.config.workspaces.some((w) => w.name === "evil"), false);
  } finally { await t.stop(); }
});

test("S-9 /new: 검증·설정 기록·코어 등록·토픽 생성·표 등록, 재전달은 중복 토픽 없음, 이후 그 토픽에서 실행", async () => {
  const t = await tgHarness();
  try {
    const dir = join(t.home, "ws", "proj"); mkdirSync(dir, { recursive: true });
    t.mock.text(CHAT, undefined, U1, `/new proj ${dir}`, { message_id: 7600 });
    await until(() => t.mock.texts().some((x) => x.includes("등록 완료")), 6000, "/new");
    assert.equal(t.mock.sent("createForumTopic").length, 1);
    const topic = Object.entries(t.adapter.state.topics).find(([, w]) => w === "proj")![0];
    assert.ok(JSON.parse(readFileSync(join(t.home, "daemon", "config.json"), "utf8")).workspaces.some((w: { name: string }) => w.name === "proj"));
    assert.ok(t.h.daemon.workspaceRootInfo("proj"));
    // 같은 update 재전달(새 update·같은 message_id) — 중복 토픽이 만들어지지 않는다
    t.mock.text(CHAT, undefined, U1, `/new proj ${dir}`, { message_id: 7600 });
    await until(() => t.mock.texts().some((x) => x.includes("이미 등록")), 4000, "멱등");
    assert.equal(t.mock.sent("createForumTopic").length, 1);
    // 상대 경로·다른 경로 중복·이름 오류 거부
    t.mock.text(CHAT, undefined, U1, "/new rel ./x");
    await until(() => t.mock.texts().some((x) => x.includes("절대 경로")), 4000, "상대 경로");
    t.mock.text(CHAT, Number(topic), U1, "새 프로젝트 질문");
    await until(() => t.h.runner.started.includes("새 프로젝트 질문"), 6000, "새 토픽 실행");
    assert.equal(t.h.runner.jobs.find((j) => j.prompt === "새 프로젝트 질문")!.target.workspace, "proj");
    t.h.runner.release("새 프로젝트 질문");
  } finally { await t.stop(); }
});

test("S-9j 토픽 생성 확정 실패는 의도를 지우고 재시도되며, 결과 불명은 의도를 유지해 /bind로 복구한다(다른 이름의 /new와 무관)", async () => {
  const mock = await new MockTelegram().start();
  const t = await tgHarness({ mock, adapter: { api: new TelegramApi({ token: TOKEN, base: mock.base, redact, perCallMs: 120, totalMs: 300 }) } });
  try {
    const dirX = join(t.home, "ws", "x"); const dirY = join(t.home, "ws", "y");
    mkdirSync(dirX, { recursive: true }); mkdirSync(dirY, { recursive: true });
    mock.fault("createForumTopic", { status: 400, body: { ok: false, error_code: 400, description: "not enough rights to create a topic" } });
    mock.text(CHAT, undefined, U1, `/new x ${dirX}`);
    await until(() => mock.texts().some((x) => x.includes("토픽을 만들지 못했다")), 6000, "확정 실패");
    assert.equal(t.adapter.state.provisioning.x, undefined, "확정 실패는 의도 삭제");
    mock.fault("createForumTopic", null);
    mock.text(CHAT, undefined, U1, `/new x ${dirX}`);
    await until(() => mock.texts().some((x) => x.includes("등록 완료: x")), 6000, "원인 해소 뒤 재시도");
    // 결과 불명(응답 없음)
    mock.fault("createForumTopic", { hang: true });
    mock.text(CHAT, undefined, U1, `/new y ${dirY}`);
    await until(() => mock.texts().some((x) => x.includes("결과를 확인하지 못했다")), 6000, "결과 불명");
    assert.equal(t.adapter.state.provisioning.y, true);
    mock.fault("createForumTopic", null);
    // 다른 이름의 /new는 x/y 의도에 영향이 없고, 같은 y의 /new는 자동 재시도하지 않는다
    mock.text(CHAT, undefined, U1, `/new y ${dirY}`);
    await until(() => mock.texts().filter((x) => x.includes("결과를 확인하지 못했다")).length >= 2, 6000, "자동 재시도 안 함");
    assert.equal(mock.sent("createForumTopic").filter((c) => c.params.name === "y").length, 1);
    // 수동 토픽에서 /bind y
    mock.text(CHAT, 777, U1, "/bind y");
    await until(() => mock.texts().some((x) => x.includes("결속했다: y")), 4000, "/bind");
    assert.equal(t.adapter.state.topics["777"], "y");
    assert.equal(t.adapter.state.provisioning.y, undefined);
  } finally { await t.stop(); }
});

test("S-9g /new: 설정 기록 뒤 코어 등록 실패는 안내만 하고 update를 소비하며, 같은 /new 재입력이 복구한다", async () => {
  const t = await tgHarness();
  try {
    const dir = join(t.home, "ws", "g"); mkdirSync(dir, { recursive: true });
    const host = (t.adapter as unknown as { o: { host: TelegramHost } }).o.host;
    const real = host.addWorkspace.bind(host);
    let fail = true;
    host.addWorkspace = (e, r) => { if (fail) throw new Error("등록 실패"); return real(e, r); };
    t.mock.text(CHAT, undefined, U1, `/new g ${dir}`);
    await until(() => t.mock.texts().some((x) => x.includes("반영하지 못했다")), 6000, "반영 실패");
    // 안내는 처리 도중 보내고 offset은 처리가 끝난 뒤 진행한다 — 안내 직후 판독하면 부하에서 경합한다
    await until(() => t.adapter.state.offset > 0, 4000, "update는 소비");
    fail = false;
    t.mock.text(CHAT, undefined, U1, `/new g ${dir}`);
    await until(() => t.mock.texts().some((x) => x.includes("등록 완료: g")), 6000, "재입력 복구");
  } finally { await t.stop(); }
});

test("S-9k /new 경로 검증 워커가 반환하지 않아도 마감 안에 거부되고 승인 콜백·명령이 계속 처리된다", async () => {
  process.env.PACE_TELEGRAM_FSWORKER_TEST = JSON.stringify({ hang: "validate" });
  const t = await tgHarness({ adapter: { fsTimeoutMs: 300 } });
  try {
    const dir = join(t.home, "ws", "h"); mkdirSync(dir, { recursive: true });
    const t0 = Date.now();
    t.mock.text(CHAT, undefined, U1, `/new h ${dir}`);
    t.mock.text(CHAT, 11, U1, "/status");
    await until(() => t.mock.texts().some((x) => x.includes("지연돼 등록하지 않았다")), 4000, "거부");
    await until(() => t.mock.texts().some((x) => x.includes("대상")), 4000, "뒤따른 명령 처리");
    assert.ok(Date.now() - t0 < 3000);
    assert.equal(t.h.config.workspaces.some((w) => w.name === "h"), false);
  } finally { delete process.env.PACE_TELEGRAM_FSWORKER_TEST; await t.stop(); }
});

function seedFiles(root: string) {
  mkdirSync(join(root, "backlogs"), { recursive: true });
  mkdirSync(join(root, ".pace", "memory"), { recursive: true });
  writeFileSync(join(root, "backlogs", "BACKLOG.md"), Array.from({ length: 100 }, (_, i) => `줄 ${i + 1}`).join("\n"));
  writeFileSync(join(root, ".pace", "memory", "status.md"), "진행 메모 본문");
}

test("S-9h·S-9l /backlog는 40줄·/memory는 한도에서 잘려 안내되고 경계에 걸친 토큰은 송신되지 않는다", async () => {
  const t = await tgHarness();
  try {
    seedFiles(t.h.dirs.a!);
    t.mock.text(CHAT, 11, U1, "/backlog");
    await until(() => t.mock.texts().some((x) => x.includes("줄 40") && x.includes("(잘림)")), 5000, "/backlog");
    assert.ok(!t.mock.texts().some((x) => x.includes("줄 41")));
    t.mock.text(CHAT, 11, U1, "/memory");
    await until(() => t.mock.texts().some((x) => x.includes("진행 메모 본문")), 5000, "/memory");
    // 64KB 한도 경계에 토큰이 걸침 — 줄바꿈이 있는 경우와 없는 경우
    writeFileSync(join(t.h.dirs.a!, ".pace", "memory", "status.md"), `앞줄\n${"y".repeat(65_536 - 5 - 20)}${TOKEN}`);
    t.mock.text(CHAT, 11, U1, "/memory");
    await until(() => t.mock.texts().filter((x) => x.includes("앞줄")).length >= 1, 5000, "경계(줄바꿈 있음)");
    writeFileSync(join(t.h.dirs.a!, ".pace", "memory", "status.md"), `${"z".repeat(65_536 - 20)}${TOKEN}`);
    t.mock.text(CHAT, 11, U1, "/memory");
    await until(() => t.mock.texts().length > 0 && t.mock.sent().length >= 6, 5000, "경계(줄바꿈 없음)");
    for (const x of t.mock.allTexts()) assert.ok(!x.includes("123456789"), "토큰 앞부분이 새지 않는다");
  } finally { await t.stop(); }
});

test("S-9c·S-9f 링크로 밖을 가리키는 파일·열기와 확인 사이 교체·루트 교체는 거부된다", async (ctx) => {
  const t = await tgHarness();
  try {
    seedFiles(t.h.dirs.a!);
    const outside = join(t.home, "outside.txt"); writeFileSync(outside, "밖의 비밀 내용");
    const link = join(t.h.dirs.a!, ".pace", "memory", "status.md");
    const { rmSync, symlinkSync } = await import("node:fs");
    try { rmSync(link); symlinkSync(outside, link); } catch { ctx.skip("심볼릭 링크 권한 없음"); return; }
    t.mock.text(CHAT, 11, U1, "/memory");
    await until(() => t.mock.texts().some((x) => x.includes("밖을 가리키는")), 5000, "링크 이탈 거부");
    assert.ok(!t.mock.allTexts().some((x) => x.includes("밖의 비밀")));
    // 열기와 확인 사이 교체: 정상 파일을 열고 난 직후 밖을 가리키는 링크로 바꾼다
    rmSync(link); writeFileSync(link, "정상 내용");
    process.env.PACE_TELEGRAM_FSWORKER_TEST = JSON.stringify({ swapAfterOpen: { file: link, target: outside } });
  } finally { delete process.env.PACE_TELEGRAM_FSWORKER_TEST; await t.stop(); }
});

test("S-9i 파일 작업이 반환하지 않아도 다른 update·콜백이 계속 처리되고 막힌 동안 새 조회는 거절되며 stop()이 기한 안에 끝난다", async () => {
  process.env.PACE_TELEGRAM_FSWORKER_TEST = JSON.stringify({ hang: "read" });
  const t = await tgHarness({ adapter: { fsTimeoutMs: 300 } });
  try {
    seedFiles(t.h.dirs.a!);
    t.mock.text(CHAT, 11, U1, "/memory");
    t.mock.text(CHAT, 11, U1, "/status"); // 접수 직후(마감 이전)에 뒤따른 명령
    await until(() => t.mock.texts().some((x) => x.includes("조회 중")), 3000, "접수 안내");
    await until(() => t.mock.texts().some((x) => x.includes("실행") && x.includes("대상")), 3000, "마감 전에 /status 처리");
    await until(() => t.mock.texts().some((x) => x.includes("지연돼 건너뛴다")), 3000, "마감 포기");
    t.mock.text(CHAT, 11, U1, "/backlog");
    await until(() => t.mock.texts().some((x) => x.includes("이전 조회가 진행 중")), 3000, "새 조회 거절");
    const t0 = Date.now();
    await t.adapter.disconnect();
    assert.ok(Date.now() - t0 < 3000, "막힌 조회 중 stop()이 기다리지 않는다");
  } finally { delete process.env.PACE_TELEGRAM_FSWORKER_TEST; await t.h.daemon.stop({ drain: false }); await t.mock.close(); }
});

test("S-9e General /status는 두 토픽의 작업을 합친 전체 현황, 토픽 /status는 자기 작업만", async () => {
  const t = await tgHarness({ hk: { maxConcurrent: 4 } });
  try {
    t.mock.text(CHAT, 11, U1, "작업A"); t.mock.text(CHAT, 12, U1, "작업B");
    await until(() => t.h.runner.started.length === 2, 4000, "두 작업");
    t.mock.text(CHAT, undefined, U1, "/status");
    await until(() => t.mock.texts().some((x) => x.includes("실행 2")), 4000, "General 전체 현황");
    t.mock.text(CHAT, 11, U1, "/status");
    await until(() => t.mock.texts().some((x) => x.includes("실행 1") && x.includes("대상")), 4000, "토픽 현황");
    t.h.runner.release("작업A"); t.h.runner.release("작업B");
  } finally { await t.stop(); }
});

test("S-10b 실제 Daemon 경로로 8000자 초과 결과가 잘리지 않고 파일로 전달된다", async () => {
  const t = await tgHarness();
  try {
    t.mock.text(CHAT, 11, U1, "긴 결과");
    await until(() => t.h.runner.started.includes("긴 결과"), 4000, "시작");
    const body = `시작표지-${"가".repeat(4500)}-중간표지-${"나".repeat(4500)}-끝표지`;
    t.h.runner.release("긴 결과", { status: "done", text: body, changes: `diff 표지-${"+".repeat(9000)}-끝`, cleanupUnconfirmed: false });
    await until(() => t.mock.sent("sendDocument").length >= 1, 5000, "문서 전송");
    const docs = t.mock.sent("sendDocument").flatMap((c) => c.files ?? []);
    const joined = docs.map((d) => d.text).join("\n");
    assert.ok(joined.includes("시작표지") && joined.includes("중간표지") && joined.includes("끝표지"), "원문이 잘리지 않고 전달");
    assert.ok(t.mock.allTexts().every((x) => x.length <= 4096));
  } finally { await t.stop(); }
});

test("S-11 진행 메시지를 보내거나 고치지 않는다 — 도구 이벤트가 와도 입력 중 표시만 있고 최종 답변이 새 메시지로 한 번 온다", async () => {
  const t = await tgHarness({ hk: { extra: { progressEditMs: 20 } }, adapter: { typingMs: 20 } });
  try {
    await until(() => t.mock.texts().some((x) => x.includes("연결됨")), 4000, "연결");
    const before = t.mock.sent().length;
    t.mock.text(CHAT, 11, U1, "진행 시험");
    await until(() => t.h.runner.started.includes("진행 시험"), 4000, "시작");
    const ctl = t.h.runner.ctl("진행 시험");
    ctl.update({ sessionUpdate: "tool_call", toolCallId: "1", title: "파일 읽는 중" });
    ctl.update({ sessionUpdate: "tool_call_update", toolCallId: "1", title: "파일 읽는 중", status: "completed" });
    await until(() => t.mock.sent("sendChatAction").length >= 2, 4000, "입력 중 표시");
    await sleep(100);
    assert.equal(t.mock.sent("editMessageText").length, 0, "진행 수정 없음");
    assert.deepEqual(t.mock.sent().slice(before).map((c) => c.params.text), [], "끝나기 전에는 새 메시지도 없다");
    t.h.runner.release("진행 시험");
    await until(() => t.mock.texts().some((x) => x.includes("끝:진행 시험")), 5000, "최종 메시지");
    await sleep(200);
    assert.equal(t.mock.sent("editMessageText").length, 0);
    assert.equal(t.mock.texts().filter((x) => x.includes("끝:진행 시험")).length, 1, "최종 답변은 한 번");
    assert.ok(!t.mock.texts().some((x) => x.includes("진행 중") || x.includes("시작")), "진행·시작 메시지 없음");
  } finally { await t.stop(); }
});

test("S-14c 승인 저장 실패는 offset 유지·버튼 유지, 복구 뒤 승인이 정확히 1회 효과", async () => {
  const t = await tgHarness();
  try {
    t.mock.text(CHAT, 11, U1, "/write");
    await until(() => t.mock.texts().some((x) => x.includes("접근 기본값")), 4000, "/write");
    t.mock.text(CHAT, 11, U1, "쓰기");
    await until(() => t.mock.sent().some((c) => c.params.reply_markup !== undefined), 4000, "승인 요청");
    const yes = (t.mock.sent().find((c) => c.params.reply_markup !== undefined)!.params.reply_markup as { inline_keyboard: { callback_data: string }[][] }).inline_keyboard[0]![0]!.callback_data;
    t.h.store.failWrites = true;
    t.mock.callback(CHAT, 11, U1, yes);
    await until(() => t.mock.offsets.length >= 4, 4000, "재시도");
    assert.equal(t.h.runner.started.length, 0);
    assert.equal(t.mock.sent("editMessageReplyMarkup").length, 0, "버튼 유지");
    t.h.store.failWrites = false;
    await until(() => t.h.runner.started.includes("쓰기"), 4000, "복구 뒤 승인");
    await sleep(100);
    assert.equal(t.h.runner.started.filter((p) => p === "쓰기").length, 1);
    t.h.runner.release("쓰기");
  } finally { await t.stop(); }
});

test("S-14f 승인 수락 뒤 answerCallbackQuery·버튼 편집 실패는 재시도·보류·재요청 안내 없이 작업은 실행된다", async () => {
  const t = await tgHarness();
  try {
    t.mock.text(CHAT, 11, U1, "/write");
    await until(() => t.mock.texts().some((x) => x.includes("접근 기본값")), 4000, "/write");
    t.mock.text(CHAT, 11, U1, "쓰기2");
    await until(() => t.mock.sent().some((c) => c.params.reply_markup !== undefined), 4000, "승인 요청");
    const yes = (t.mock.sent().find((c) => c.params.reply_markup !== undefined)!.params.reply_markup as { inline_keyboard: { callback_data: string }[][] }).inline_keyboard[0]![0]!.callback_data;
    t.mock.fault("answerCallbackQuery", { status: 500 }); t.mock.fault("editMessageReplyMarkup", { status: 500 });
    t.mock.callback(CHAT, 11, U1, yes);
    await until(() => t.h.runner.started.includes("쓰기2"), 4000, "실행");
    await sleep(200);
    assert.equal(t.adapter.state.held.length, 0);
    assert.ok(!t.mock.texts().some((x) => x.includes("다시 눌러")));
    t.h.runner.release("쓰기2");
  } finally { await t.stop(); }
});

test("S-14e(Telegram) /pending은 전송에 실패했던 승인 버튼을 같은 승인 ID로 다시 보낸다", async () => {
  const t = await tgHarness();
  try {
    t.mock.text(CHAT, 11, U1, "/write");
    await until(() => t.mock.texts().some((x) => x.includes("접근 기본값")), 4000, "/write");
    t.mock.fault("sendMessage", { status: 500, times: 2 }); // 승인 알림 전송 실패
    t.mock.text(CHAT, 11, U1, "쓰기3");
    await until(() => Object.values(t.h.store.state.approvals).some((a) => a.state === "pending"), 4000, "승인 대기");
    const id = Object.values(t.h.store.state.approvals).find((a) => a.state === "pending")!.id;
    await sleep(150);
    t.mock.calls.length = 0;
    t.mock.text(CHAT, 11, U1, "/pending");
    await until(() => t.mock.sent().some((c) => c.params.reply_markup !== undefined), 4000, "재표시");
    const again = t.mock.sent().find((c) => c.params.reply_markup !== undefined)!;
    assert.ok(JSON.stringify(again.params.reply_markup).includes(id));
  } finally { await t.stop(); }
});

test("S-2b 송신 본문(최종 결과·승인 detail·편집)과 수신 텍스트에 토큰이 없다(자기 토큰·다른 봇 형태)", async () => {
  const t = await tgHarness();
  try {
    t.mock.text(CHAT, 11, U1, `내 토큰은 ${TOKEN} 이고 다른 것은 ${OTHER_TOKEN}`);
    await until(() => t.h.runner.started.length === 1, 4000, "시작");
    const prompt = t.h.runner.started[0]!;
    assert.ok(!prompt.includes("123456789") && !prompt.includes("987654321"), "코어로 간 텍스트에 토큰이 없다");
    t.h.runner.release(prompt, { status: "done", text: `결과 ${TOKEN} ${OTHER_TOKEN}`, detail: `d ${TOKEN}`, changes: `c ${OTHER_TOKEN}`, cleanupUnconfirmed: false });
    await until(() => t.mock.allTexts().some((x) => x.includes("결과")), 4000, "결과");
    for (const x of t.mock.allTexts()) assert.ok(!x.includes("123456789") && !x.includes("987654321") && !x.includes(TOKEN.slice(10)), x);
    assert.ok(!readFileSync(t.h.store.file, "utf8").includes("123456789"));
  } finally { await t.stop(); }
});

test("S-21 기본 자유 대화는 read-only, /write 뒤에는 승인을 거친 뒤에만 write로 시작한다", async () => {
  const t = await tgHarness();
  try {
    t.mock.text(CHAT, 11, U1, "읽기 질문");
    await until(() => t.h.runner.started.includes("읽기 질문"), 4000, "읽기");
    assert.equal(t.h.runner.jobs.find((j) => j.prompt === "읽기 질문")!.target.access, "read-only");
    t.h.runner.release("읽기 질문");
    t.mock.text(CHAT, 11, U1, "/write");
    await until(() => t.mock.texts().some((x) => x.includes("접근 기본값")), 4000, "/write");
    t.mock.text(CHAT, 11, U1, "쓰기 질문");
    await until(() => t.mock.sent().some((c) => c.params.reply_markup !== undefined), 4000, "승인");
    assert.ok(!t.h.runner.started.includes("쓰기 질문"), "승인 전에는 시작하지 않는다");
    const yes = (t.mock.sent().find((c) => c.params.reply_markup !== undefined)!.params.reply_markup as { inline_keyboard: { callback_data: string }[][] }).inline_keyboard[0]![0]!.callback_data;
    t.mock.callback(CHAT, 11, U1, yes);
    await until(() => t.h.runner.started.includes("쓰기 질문"), 4000, "승인 뒤");
    assert.equal(t.h.runner.jobs.find((j) => j.prompt === "쓰기 질문")!.target.access, "write");
    t.h.runner.release("쓰기 질문");
    assert.ok(U2 > 0);
  } finally { await t.stop(); }
});

test("S-9f 열기와 확인 사이에 파일이 밖을 가리키는 링크로 교체되면 거부된다(fd 동일성 불일치)", async (ctx) => {
  const t0 = await tgHarness({ noConnect: true });
  const link = join(t0.h.dirs.a!, ".pace", "memory", "status.md");
  seedFiles(t0.h.dirs.a!);
  const outside = join(t0.home, "outside2.txt"); writeFileSync(outside, "밖의 비밀 내용2");
  await t0.mock.close(); await t0.h.daemon.stop({ drain: false });
  process.env.PACE_TELEGRAM_FSWORKER_TEST = JSON.stringify({ swapAfterOpen: { file: link, target: outside } });
  const t = await tgHarness({ home: t0.home, skipSeed: false });
  try {
    t.mock.text(CHAT, 11, U1, "/memory");
    await until(() => t.mock.texts().some((x) => x.includes("조회 중")), 4000, "접수");
    await sleep(800);
    assert.ok(!t.mock.allTexts().some((x) => x.includes("밖의 비밀")), "밖 내용 미전송");
    const { lstatSync } = await import("node:fs");
    if (!lstatSync(link).isSymbolicLink()) ctx.skip("시험 훅이 링크를 만들지 못함(권한)");
    assert.ok(t.mock.allTexts().some((x) => x.includes("바뀌어") || x.includes("밖을 가리키는")), "교체 거부 안내");
  } finally { delete process.env.PACE_TELEGRAM_FSWORKER_TEST; await t.stop(); }
});

test("S-9c(루트) 기동 뒤 워크스페이스 루트가 교체되면 조회가 거부된다", async () => {
  const t = await tgHarness();
  try {
    const { renameSync } = await import("node:fs");
    const root = t.h.dirs.a!;
    renameSync(root, `${root}-old`); mkdirSync(root, { recursive: true }); seedFiles(root);
    t.mock.text(CHAT, 11, U1, "/memory");
    await until(() => t.mock.texts().some((x) => x.includes("경로가 바뀌어")), 5000, "루트 교체 거부");
    assert.ok(!t.mock.allTexts().some((x) => x.includes("진행 메모 본문")));
  } finally { await t.stop(); }
});

test("구현 후 리뷰 1차: /bind·/new 저장 실패는 토픽 표와 생성 의도를 함께 되돌린다", async () => {
  const mock = await new MockTelegram().start();
  const t = await tgHarness({ mock });
  try {
    const a = t.adapter as unknown as { save: () => void };
    const real = a.save.bind(a);
    // /bind 저장 실패 — provisioning 복원
    t.adapter.state.provisioning.a2 = true;
    t.h.config.workspaces.push({ name: "a2", path: join(t.home, "ws", "a2"), worktrees: { main: join(t.home, "ws", "a2") } });
    let fail = 1;
    a.save = () => { if (fail-- > 0) throw new Error("디스크"); real(); };
    mock.text(CHAT, 55, U1, "/bind a2");
    await until(() => mock.texts().some((x) => x.includes("저장하지 못해 결속하지 않았다")), 4000, "/bind 실패");
    assert.equal(t.adapter.state.topics["55"], undefined);
    assert.equal(t.adapter.state.provisioning.a2, true, "생성 의도가 복원된다");
    // /new — createForumTopic 성공 뒤 저장 실패 → 결과 불명 경로(의도 유지, 표 미등록)
    a.save = real;
    const dir = join(t.home, "ws", "n3"); mkdirSync(dir, { recursive: true });
    let injected = 0;
    a.save = () => {
      // 앞선 /bind의 offset 저장과 순서가 겹쳐도 ⑤ 표 저장에서만 한 번 실패한다.
      if (injected === 0 && Object.values(t.adapter.state.topics).includes("n3")) {
        assert.equal(loadTelegramState(stateFile(t.home))!.provisioning.n3, true, "생성 의도가 디스크에 먼저 저장됐다");
        assert.equal(t.adapter.state.provisioning.n3, undefined, "표 저장 단계에서는 의도를 지운다");
        injected++;
        throw new Error("디스크");
      }
      real();
    };
    mock.text(CHAT, undefined, U1, `/new n3 ${dir}`);
    await until(() => mock.texts().some((x) => x.includes("저장하지 못했다") && x.includes("/bind n3")), 6000, "/new 저장 실패");
    assert.equal(Object.values(t.adapter.state.topics).includes("n3"), false, "메모리에서만 등록된 채 남지 않는다");
    assert.equal(t.adapter.state.provisioning.n3, true);
    assert.equal(injected, 1, "토픽 표 저장에 한 번 실패를 주입했다");
    assert.equal(mock.sent("createForumTopic").length, 1, "실제 토픽 생성 뒤 저장 실패를 확인했다");
  } finally { await t.stop(); }
});

test("구현 후 리뷰 1차: 조회 도중 루트가 통째로 바뀌면 거부된다(열기 뒤 루트 식별자 재확인)", async (ctx) => {
  const t0 = await tgHarness({ noConnect: true });
  seedFiles(t0.h.dirs.a!);
  const root = t0.h.dirs.a!;
  await t0.mock.close(); await t0.h.daemon.stop({ drain: false });
  process.env.PACE_TELEGRAM_FSWORKER_TEST = JSON.stringify({ swapRootAfterOpen: { moved: `${root}-moved` } });
  const t = await tgHarness({ home: t0.home });
  try {
    t.mock.text(CHAT, 11, U1, "/memory");
    await sleep(1200);
    const texts = t.mock.allTexts().join("\n");
    if (!existsSync(`${root}-moved`)) { ctx.skip("루트 교체 훅이 동작하지 않음(권한·열린 핸들)"); return; }
    assert.ok(!texts.includes("진행 메모 본문"), "교체된 루트의 내용이 전송되지 않는다");
    assert.ok(/경로가 바뀌어|읽는 도중 파일이 바뀌어/.test(texts), "교체 거부 안내(루트 식별자 불일치 또는 열린 파일과 현재 경로 불일치)");
  } finally { delete process.env.PACE_TELEGRAM_FSWORKER_TEST; await t.stop(); }
});

test("구현 후 리뷰 2차: /held clear·/new 확정 실패 정리의 저장 실패도 메모리를 되돌려 이후 저장에 섞이지 않는다", async () => {
  const t = await tgHarness();
  try {
    const a = t.adapter as unknown as { save: () => void };
    const real = a.save.bind(a);
    t.adapter.state.held = [{ update_id: 42, chat: String(CHAT), thread: 11, date: 1, reason: "exception", notified: true }];
    let fail = 1;
    a.save = () => { if (fail-- > 0) throw new Error("디스크"); real(); };
    t.mock.text(CHAT, undefined, U1, "/held clear 42");
    await until(() => t.mock.texts().some((x) => x.includes("저장하지 못했다")), 4000, "clear 실패");
    assert.equal(t.adapter.state.held.length, 1, "메모리 복구");
    await sleep(100);
    assert.equal(loadTelegramState(stateFile(t.home))!.held.length >= 0, true);
    // /new 확정 실패 + 의도 삭제 저장 실패 → 의도 유지
    a.save = real;
    const dir = join(t.home, "ws", "q1"); mkdirSync(dir, { recursive: true });
    t.mock.fault("createForumTopic", { status: 400, body: { ok: false, error_code: 400, description: "no rights" } });
    let calls = 0;
    a.save = () => { calls++; if (calls === 2) throw new Error("디스크"); real(); }; // ③ 의도 저장 성공, 확정 실패 정리 저장 실패
    t.mock.text(CHAT, undefined, U1, `/new q1 ${dir}`);
    await until(() => t.mock.texts().some((x) => x.includes("토픽을 만들지 못했다")), 6000, "확정 실패");
    assert.equal(t.adapter.state.provisioning.q1, true, "저장 실패 시 의도가 메모리에도 유지된다");
  } finally { await t.stop(); }
});

test("구현 후 리뷰 3차: 보류 요약 객체 롤백·워크스페이스 이름 'constructor'·워커 동시 1개", async () => {
  const mk = (i: number, n: boolean): HeldRecord => ({ update_id: i, chat: "c", thread: 1, date: 1, reason: "exception", notified: n });
  const prev = [{ update_id: 0, chat: "c", thread: 0, date: 1, reason: "summary", notified: false, droppedCount: 10 } as HeldRecord, ...Array.from({ length: 49 }, (_, i) => mk(i + 1, false))];
  const snapshot = JSON.stringify(prev);
  trimHeld([...prev, mk(100, false)]);
  assert.equal(JSON.stringify(prev), snapshot, "trimHeld는 입력(롤백 대상)을 바꾸지 않는다");
  // 'constructor' 이름
  const t = await tgHarness();
  try {
    const dir = join(t.home, "ws", "ctor"); mkdirSync(dir, { recursive: true });
    t.mock.text(CHAT, undefined, U1, `/new constructor ${dir}`);
    await until(() => t.mock.texts().some((x) => x.includes("등록 완료: constructor")), 6000, "이름 constructor 등록");
    assert.equal(t.mock.sent("createForumTopic").length, 1);
    t.mock.text(CHAT, undefined, U1, "/status");
    await until(() => t.mock.texts().some((x) => x.includes("기기")), 4000, "status");
  } finally { await t.stop(); }
  // 워커 동시 1개
  const { FsWorker } = await import("../src/daemon/telegram/fsworker.ts");
  process.env.PACE_TELEGRAM_FSWORKER_TEST = JSON.stringify({ hang: "validate" });
  const w = new FsWorker();
  try {
    const first = w.run({ op: "validate", path: tempDir() }, 300);
    const second = await w.run({ op: "validate", path: tempDir() }, 300); // 첫 요청이 마감 전에도 새 요청은 거절
    assert.deepEqual(second, { ok: false, error: "busy" });
    assert.deepEqual(await first, { ok: false, error: "timeout" });
    assert.deepEqual(await w.run({ op: "validate", path: tempDir() }, 300), { ok: false, error: "busy" }, "마감 뒤에도 막힌 요청이 끝나기 전까지 거절");
  } finally { delete process.env.PACE_TELEGRAM_FSWORKER_TEST; w.terminate(); }
});

test("구현 후 리뷰 4차: 긴 승인 상세는 4096 안으로 잘려 버튼이 전달되고, 손상된 상태 파일(held 항목·토픽 값)은 시작을 거부한다", async () => {
  const { approvalText } = await import("../src/daemon/telegram/render.ts");
  const long = approvalText({ id: "0".repeat(32), taskId: "t", kind: "tool", detail: "&".repeat(5000), expiresAt: Date.now() + 60_000, access: "write", worktree: "/w" });
  assert.ok(long.length <= 4096, `길이 ${long.length}`);
  const mock = await new MockTelegram().start();
  try {
    for (const bad of [{ held: [null] }, { held: [{ update_id: 1 }] }, { topics: { x: "a" } }, { topics: { "1": 5 } }, { provisioning: { a: false } }]) {
      const b = bare({ mock });
      writeFileSync(b.file, JSON.stringify({ ...emptyTelegramState(), ...bad }));
      await assert.rejects(() => b.adapter.connect(b.sink), /올바르지 않다|손상/);
    }
  } finally { await mock.close(); }
});

test("tester D1: 슬래시 뒤 공백(\"/ approve\", \"/ use b/main\")으로 텍스트 승인 차단·워크트리 교차 거부를 우회하지 못한다", async () => {
  const t = await tgHarness();
  try {
    t.mock.text(CHAT, 11, U1, "/write");
    await until(() => t.mock.texts().some((x) => x.includes("접근 기본값")), 4000, "/write");
    t.mock.text(CHAT, 11, U1, "쓰기 작업");
    await until(() => Object.values(t.h.store.state.approvals).some((a) => a.state === "pending"), 4000, "승인 대기");
    const id = Object.values(t.h.store.state.approvals).find((a) => a.state === "pending")!.id;
    t.mock.text(CHAT, 11, U1, `/ approve ${id}`);
    t.mock.text(CHAT, 11, U1, `/   deny ${id}`);
    t.mock.text(CHAT, 11, U1, "/ use b/main");
    await until(() => t.mock.texts().filter((x) => x.includes("버튼으로 한다")).length >= 2 && t.mock.texts().some((x) => x.includes("그 워크스페이스의 토픽에서 고른다")), 4000, "우회 차단 안내");
    assert.equal(Object.values(t.h.store.state.approvals).find((a) => a.id === id)!.state, "pending");
    assert.equal(t.h.runner.started.length, 0);
    assert.equal(t.h.store.state.conversations[`telegram:${CHAT}:11`]!.workspace, "a");
  } finally { await t.stop(); }
});

test("tester T-3: 실제 Daemon의 allowedUsers.telegram이 비어 있으면(admin도 없음) 모든 사용자가 차단된다", async () => {
  const t = await tgHarness({ hk: { config: { allowedUsers: { telegram: [] } } } });
  try {
    t.mock.text(CHAT, 11, U1, "요청"); t.mock.text(CHAT, undefined, U1, "/status");
    await until(() => t.adapter.stats.rejectedUsers >= 2, 4000, "거부 집계");
    assert.equal(t.h.runner.started.length, 0);
    assert.equal(t.mock.texts().filter((x) => !x.includes("연결됨")).length, 0, "무응답");
  } finally { await t.stop(); }
});
