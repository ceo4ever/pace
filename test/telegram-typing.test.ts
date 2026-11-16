import assert from "node:assert/strict";
import test from "node:test";
import { callbackData } from "../src/daemon/telegram/render.ts";
import { CHAT, sleep, tgHarness, U1, until } from "./telegram-helpers.ts";

// P035 실사용 확인 후속(수정 11) — 진행 메시지 없이 입력 중 표시(sendChatAction typing)만 유지하고, 끝나면 최종 답변을 새 메시지로 보낸다.

const actions = (t: Awaited<ReturnType<typeof tgHarness>>, thread?: number) => t.mock.sent("sendChatAction").filter((c) => thread === undefined || c.params.message_thread_id === thread);

test("TY-1 실행 중에만 그 토픽에 입력 중 표시를 주기적으로 보내고 종료하면 멈춘다 — 완료 메시지는 1회", async () => {
  const t = await tgHarness({ adapter: { typingMs: 25 } });
  try {
    await until(() => t.mock.texts().some((x) => x.includes("연결됨")), 4000, "연결");
    assert.equal(actions(t).length, 0, "실행 전에는 보내지 않는다");
    t.mock.text(CHAT, 11, U1, "질문 가");
    await until(() => t.h.runner.started.includes("질문 가"), 4000, "시작");
    await until(() => actions(t, 11).length >= 3, 4000, "주기 전송");
    assert.ok(actions(t).every((c) => c.params.action === "typing" && c.params.message_thread_id === 11 && c.params.chat_id === CHAT), "typing·그 토픽·허용 chat");
    assert.equal(actions(t, 12).length, 0, "다른 토픽에는 보내지 않는다");
    t.h.runner.release("질문 가");
    await until(() => t.mock.texts().some((x) => x.includes("끝:질문 가")), 4000, "완료");
    await sleep(60);
    const n = actions(t).length;
    await sleep(150);
    assert.equal(actions(t).length, n, "종료 뒤에는 더 보내지 않는다");
    assert.equal(t.mock.texts().filter((x) => x.includes("끝:질문 가")).length, 1);
    assert.match(t.mock.texts().find((x) => x.includes("끝:질문 가"))!, /✅ <b>작업 <code>t-[0-9a-f]+<\/code> 완료<\/b>/, "완료 메시지에 작업 ID");
  } finally { await t.stop(); }
});

test("TY-2 실패·취소로 끝나도 입력 중 표시를 멈추고, 실패 안내에는 작업 ID가 있다", async () => {
  const t = await tgHarness({ adapter: { typingMs: 25 } });
  try {
    t.mock.text(CHAT, 11, U1, "실패할 질문");
    await until(() => t.h.runner.started.includes("실패할 질문"), 4000, "시작");
    await until(() => actions(t, 11).length >= 1, 4000, "표시");
    t.h.runner.release("실패할 질문", { status: "failed", text: "", detail: "도구 오류", cleanupUnconfirmed: false });
    await until(() => t.mock.texts().some((x) => x.includes("❌")), 4000, "실패 안내");
    assert.match(t.mock.texts().find((x) => x.includes("❌"))!, /<code>t-[0-9a-f]+<\/code>/);
    await sleep(60);
    const n = actions(t).length;
    await sleep(120);
    assert.equal(actions(t).length, n);
    t.mock.text(CHAT, 11, U1, "취소할 질문");
    await until(() => t.h.runner.started.includes("취소할 질문"), 4000, "두 번째 시작");
    const id = Object.values(t.h.store.state.tasks).find((x) => x.prompt === "취소할 질문")!.id;
    t.mock.text(CHAT, 11, U1, `/cancel ${id}`);
    await until(() => t.mock.texts().some((x) => x.includes("cancelled")), 4000, "취소 완료");
    await sleep(60);
    const m = actions(t).length;
    await sleep(120);
    assert.equal(actions(t).length, m, "취소 뒤 멈춤");
  } finally { await t.stop(); }
});

test("TY-3 대기열에서 기다리는 동안은 대기 한 줄만 보내고, 실행이 시작되면 입력 중 표시를 시작한다", async () => {
  const t = await tgHarness({ adapter: { typingMs: 25 } });
  try {
    t.mock.text(CHAT, 11, U1, "앞 작업");
    await until(() => t.h.runner.started.includes("앞 작업"), 4000, "앞 작업 시작");
    t.mock.text(CHAT, 11, U1, "뒤 작업");
    await until(() => t.mock.texts().some((x) => x.includes("대기 중")), 4000, "대기 안내");
    assert.match(t.mock.texts().find((x) => x.includes("대기 중"))!, /⏸ 작업 <code>t-[0-9a-f]+<\/code> 대기 중/);
    await sleep(150);
    assert.equal(t.mock.texts().filter((x) => x.includes("대기 중")).length, 1, "대기 안내는 한 번");
    assert.ok(!t.h.runner.started.includes("뒤 작업"));
    t.h.runner.release("앞 작업");
    await until(() => t.h.runner.started.includes("뒤 작업"), 4000, "뒤 작업 시작");
    t.h.runner.release("뒤 작업");
    await until(() => t.mock.texts().some((x) => x.includes("끝:뒤 작업")), 4000, "뒤 작업 완료");
    assert.equal(t.mock.texts().filter((x) => x.includes("대기 중")).length, 1);
  } finally { await t.stop(); }
});

test("TY-4 도구 승인을 기다리는 동안 입력 중 표시를 멈추고 승인 뒤 다시 켠다", async () => {
  const t = await tgHarness({ adapter: { typingMs: 25 } });
  try {
    t.mock.text(CHAT, 11, U1, "승인 질문");
    await until(() => t.h.runner.started.includes("승인 질문"), 4000, "시작");
    await until(() => actions(t, 11).length >= 2, 4000, "표시");
    const decided = t.h.runner.ctl("승인 질문").requestApproval("도구 권한 요청: x");
    await until(() => t.mock.sent().some((c) => c.params.reply_markup !== undefined), 4000, "승인 요청 메시지");
    await sleep(60);
    const n = actions(t).length;
    await sleep(150);
    assert.equal(actions(t).length, n, "승인 대기 중에는 보내지 않는다");
    const approvalId = Object.values(t.h.store.state.approvals).find((a) => a.kind === "tool")!.id;
    t.mock.callback(CHAT, 11, U1, callbackData(approvalId, "y"));
    assert.equal(await decided, true);
    await until(() => actions(t).length > n, 4000, "승인 뒤 재개");
    t.h.runner.release("승인 질문");
    await until(() => t.mock.texts().some((x) => x.includes("끝:승인 질문")), 4000, "완료");
  } finally { await t.stop(); }
});

test("TY-5 입력 중 표시가 실패하거나 429여도 작업은 그대로 끝난다(429는 쉰 뒤 재개)", async () => {
  const t = await tgHarness({ adapter: { typingMs: 25 } });
  try {
    t.mock.fault("sendChatAction", { status: 400, times: 3 });
    t.mock.text(CHAT, 11, U1, "오류 질문");
    await until(() => t.h.runner.started.includes("오류 질문"), 4000, "시작");
    await until(() => actions(t, 11).length >= 5, 4000, "실패 뒤에도 계속 시도");
    t.mock.fault("sendChatAction", { status: 429, body: { ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 1 } }, times: 1 });
    const n = actions(t, 11).length;
    await until(() => actions(t, 11).length > n + 1, 6000, "429 뒤 재개");
    const limited = actions(t, 11)[n]!, resumed = actions(t, 11)[n + 1]!;
    assert.ok(resumed.at - limited.at >= 900, `429의 retry_after(1초)만큼 쉰 뒤에 다시 보낸다: ${resumed.at - limited.at}ms`);
    t.h.runner.release("오류 질문");
    await until(() => t.mock.texts().some((x) => x.includes("끝:오류 질문")), 4000, "완료");
    assert.equal(t.mock.texts().filter((x) => x.includes("끝:오류 질문")).length, 1);
  } finally { await t.stop(); }
});

test("TY-6 /status는 진행 중·대기 작업의 ID를 보여 준다(/cancel 대상 찾기)", async () => {
  const t = await tgHarness({ adapter: { typingMs: 25 } });
  try {
    t.mock.text(CHAT, 11, U1, "상태 질문");
    await until(() => t.h.runner.started.includes("상태 질문"), 4000, "시작");
    const id = Object.values(t.h.store.state.tasks).find((x) => x.prompt === "상태 질문")!.id;
    t.mock.text(CHAT, 11, U1, "/status");
    await until(() => t.mock.texts().some((x) => x.includes("작업:")), 4000, "상태");
    assert.ok(t.mock.texts().find((x) => x.includes("작업:"))!.includes(`<code>${id}</code>`));
    t.h.runner.release("상태 질문");
  } finally { await t.stop(); }
});
