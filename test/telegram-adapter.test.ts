import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { callbackData } from "../src/daemon/telegram/render.ts";
import { CHAT, STRANGER, tgHarness, U1, U2, until } from "./telegram-helpers.ts";

test("S-7 두 토픽이 각각 자기 워크스페이스에서 실행되고 응답이 각 토픽으로 간다", async () => {
  const t = await tgHarness();
  try {
    t.mock.text(CHAT, 11, U1, "질문 a");
    t.mock.text(CHAT, 12, U1, "질문 b");
    await until(() => t.h.runner.started.length === 2, 4000, "두 작업 시작");
    const byPrompt = new Map(t.h.runner.jobs.map((j) => [j.prompt, j.target.workspace]));
    assert.equal(byPrompt.get("질문 a"), "a");
    assert.equal(byPrompt.get("질문 b"), "b");
    t.h.runner.release("질문 a"); t.h.runner.release("질문 b");
    await until(() => t.mock.allTexts().filter((x) => x.includes("끝:")).length >= 2, 4000, "완료 메시지(진행 메시지를 수정)");
    assert.equal(t.mock.sent("editMessageText").length, 0, "진행 메시지를 만들지 않으므로 고치지도 않는다(최종 답변은 새 메시지)");
    assert.ok(t.mock.sent().some((c) => c.params.message_thread_id === 11) && t.mock.sent().some((c) => c.params.message_thread_id === 12));
  } finally { await t.stop(); }
});

test("S-6 경계: 다른 chat·봇·편집·비텍스트·미허용 사용자·미등록 토픽·General 자유 대화는 실행하지 않는다", async () => {
  const t = await tgHarness();
  try {
    t.mock.text(-999, 11, U1, "다른 chat");
    t.mock.push({ message: { message_id: 1, date: Math.floor(Date.now() / 1000), chat: { id: CHAT }, from: { id: U1, is_bot: true }, text: "봇", message_thread_id: 11 } });
    t.mock.push({ message: { message_id: 2, date: Math.floor(Date.now() / 1000), chat: { id: CHAT }, from: { id: U1, is_bot: false }, message_thread_id: 11 } }); // 텍스트 없음
    t.mock.text(CHAT, 11, STRANGER, "낯선 사용자");
    t.mock.text(CHAT, 99, U1, "미등록 토픽");
    t.mock.text(CHAT, undefined, U1, "General 자유 대화");
    await until(() => t.mock.pending() === 0 || t.adapter.state.offset > 5, 4000, "처리");
    await until(() => t.mock.texts().some((x) => x.includes("등록되지 않았다")) && t.mock.texts().some((x) => x.includes("General에서는 쓸 수 없다")), 4000, "안내 두 건");
    assert.equal(t.h.runner.started.length, 0);
    assert.equal(t.adapter.stats.rejectedUsers, 1);
    const texts = t.mock.texts().join("\n");
    assert.match(texts, /등록되지 않았다/);
    assert.match(texts, /General에서는 쓸 수 없다/);
    assert.ok(!texts.includes("낯선"), "미허용 사용자에게는 응답하지 않는다");
  } finally { await t.stop(); }
});

test("S-8 한 토픽에서 워크트리를 번갈아 지시하고 대기 중 /use는 받은 작업에 영향이 없다", async () => {
  const t = await tgHarness({ hk: { maxConcurrent: 1 } });
  try {
    const ws = t.h.config.workspaces[0]!;
    const { mkdirSync } = await import("node:fs");
    const wt = `${ws.path}-wt`;
    mkdirSync(wt, { recursive: true });
    ws.worktrees.P1 = wt;
    t.h.daemon.reloadAllowed();
    t.mock.text(CHAT, 11, U1, "첫 요청");
    await until(() => t.h.runner.started.includes("첫 요청"), 4000, "첫 작업");
    t.mock.text(CHAT, 11, U1, "/use P1");
    t.mock.text(CHAT, 11, U1, "둘째 요청");
    await until(() => t.mock.texts().some((x) => x.includes("대상 변경")), 4000, "대상 변경");
    t.h.runner.release("첫 요청");
    await until(() => t.h.runner.started.includes("둘째 요청"), 4000, "둘째 작업");
    const j1 = t.h.runner.jobs.find((j) => j.prompt === "첫 요청")!;
    const j2 = t.h.runner.jobs.find((j) => j.prompt === "둘째 요청")!;
    assert.equal(j1.target.worktreeName, "main");
    assert.equal(j2.target.worktreeName, "P1");
    t.h.runner.release("둘째 요청");
    t.mock.text(CHAT, 11, U1, "/use b/main"); // 다른 워크스페이스 교차 거부
    await until(() => t.mock.texts().some((x) => x.includes("그 워크스페이스의 토픽에서 고른다")), 4000, "교차 거부");
  } finally { await t.stop(); }
});

test("S-13·S-14 승인 버튼: ✅/❌, callback_data는 승인 ID뿐, 두 번 누름·다른 토픽·미허용 사용자는 거부", async () => {
  const t = await tgHarness();
  try {
    t.mock.text(CHAT, 11, U1, "/write");
    await until(() => t.mock.texts().some((x) => x.includes("접근 기본값")), 4000, "/write");
    t.mock.text(CHAT, 11, U1, "쓰기 작업");
    await until(() => t.mock.sent().some((c) => c.params.reply_markup !== undefined), 4000, "승인 요청");
    const ask = t.mock.sent().find((c) => c.params.reply_markup !== undefined)!;
    const kb = (ask.params.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] }).inline_keyboard[0]!;
    assert.equal(kb.length, 2);
    assert.ok(kb.every((b) => Buffer.byteLength(b.callback_data) <= 64));
    assert.match(String(ask.params.text), /쓰기 시작/);
    const yes = kb[0]!.callback_data;
    const id = yes.split(":")[1]!;
    assert.equal(yes, callbackData(id, "y"));
    // 미허용 사용자·다른 chat·미등록 토픽·위치 없는 콜백은 무응답
    const before = t.mock.calls.length;
    t.mock.callback(CHAT, 11, STRANGER, yes);
    t.mock.callback(-999, 11, U1, yes);
    t.mock.callback(CHAT, 77, U1, yes);
    t.mock.push({ callback_query: { id: "x", from: { id: U1 }, data: yes } });
    await until(() => t.mock.pending() === 0 && t.adapter.state.offset > 0, 4000, "무시된 콜백 소진");
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(t.mock.sent("answerCallbackQuery").length, 0, "무응답");
    assert.equal(t.h.runner.started.length, 0);
    // 다른 토픽(등록됨)에서 누름 → 코어가 없는 승인으로 거부하고 안내
    t.mock.callback(CHAT, 12, U1, yes);
    await until(() => t.mock.sent("answerCallbackQuery").length === 1, 4000, "다른 토픽 거부 안내");
    assert.equal(t.h.runner.started.length, 0);
    // 허용된 다른 사용자 u2는 요청자가 아니라 거부
    t.mock.callback(CHAT, 11, U2, yes);
    await until(() => t.mock.sent("answerCallbackQuery").length === 2, 4000, "다른 사용자 거부 안내");
    assert.equal(t.h.runner.started.length, 0);
    // 요청자의 첫 승인만 실행
    t.mock.callback(CHAT, 11, U1, yes);
    await until(() => t.h.runner.started.includes("쓰기 작업"), 4000, "승인 뒤 실행");
    t.mock.callback(CHAT, 11, U1, yes);
    await until(() => t.mock.sent("answerCallbackQuery").some((c) => /이미 처리/.test(String(c.params.text))), 4000, "두 번째 누름 거부");
    assert.equal(t.h.runner.started.filter((p) => p === "쓰기 작업").length, 1);
    assert.ok(t.mock.sent("editMessageReplyMarkup").length >= 1, "처리된 버튼은 비활성화");
    assert.ok(before >= 0);
    t.h.runner.release("쓰기 작업");
  } finally { await t.stop(); }
});

test("S-15 명령은 실행자를 부르지 않고 /write·/read가 대화 access를 바꾼다", async () => {
  const t = await tgHarness();
  try {
    for (const c of ["/status", "/queue", "/help", "/workspaces", "/write", "/read", "/pending", "/approve x", "/new x /tmp", "/bind a", "/backlog"]) t.mock.text(CHAT, 11, U1, c);
    await until(() => t.mock.texts().length >= 9, 5000, "명령 응답");
    assert.equal(t.h.runner.started.length, 0);
    const conv = t.h.store.state.conversations[`telegram:${CHAT}:11`];
    assert.equal(conv?.access, "read-only");
  } finally { await t.stop(); }
});

test("S-16 연결하면 setMyCommands와 General 기기 알림을 보낸다", async () => {
  const t = await tgHarness();
  try {
    await until(() => t.mock.sent("setMyCommands").length === 1 && t.mock.texts().some((x) => x.includes("기기") && x.includes("연결됨")), 4000, "메뉴·알림");
    const general = t.mock.sent().find((c) => String(c.params.text).includes("연결됨"))!;
    assert.equal(general.params.message_thread_id, undefined);
    assert.equal(readFileSync(t.home + "/daemon/telegram.json", "utf8").includes("offset"), true);
  } finally { await t.stop(); }
});
