import assert from "node:assert/strict";
import test from "node:test";
import { CHAT, sleep, tgHarness, U1, until } from "./telegram-helpers.ts";
import { MockTelegram } from "./telegram-mock.ts";

// P035 실사용 확인 후속(수정 12·13) — 그룹의 `/명령@봇이름`과 빈 /queue.
// 모의 서버의 getMe username은 "mockbot".

const nonTyping = (t: Awaited<ReturnType<typeof tgHarness>>) => t.mock.texts().filter((x) => !x.includes("연결됨"));

test("M-1 /명령@이 봇 이름은 @를 떼고 General·토픽 모두에서 명령으로 처리한다(대소문자 무시, 인자 보존)", async () => {
  const t = await tgHarness();
  try {
    t.mock.text(CHAT, undefined, U1, "/status@mockbot");
    t.mock.text(CHAT, undefined, U1, "/workspaces@MockBot");
    t.mock.text(CHAT, 11, U1, "/status@mockbot");
    t.mock.text(CHAT, 11, U1, "/help@mockbot");
    t.mock.text(CHAT, 11, U1, "/use@mockbot b/main");
    t.mock.text(CHAT, 99, U1, "/bind@mockbot b");
    await until(() => nonTyping(t).length >= 6, 5000, "응답 6건");
    const texts = nonTyping(t);
    assert.match(texts[0]!, /^<b>기기 [^<]+<\/b>\n실행 \d+ · 대기 \d+ · 격리 \d+/, "General /status — 명령 안내(help)가 아니다");
    assert.match(texts[1]!, /^<b>워크스페이스<\/b>/);
    assert.match(texts[2]!, /^<b>기기 [^<]+<\/b>\n실행 \d+ · 대기 \d+\n대상: <code>a\/main<\/code>/, "토픽 /status는 코어 현황");
    assert.match(texts[3]!, /^<b>명령<\/b>\n\/status — /, "/help는 토픽 도움말");
    assert.match(texts[4]!, /그 워크스페이스의 토픽에서 고른다/, "/use 인자 보존");
    assert.match(texts[5]!, /결속했다: b|이미 다른 토픽|등록된 워크스페이스가 아니다/, "미등록 토픽의 /bind@봇도 명령");
    assert.ok(!texts.slice(0, 3).some((x) => x.includes("사용 가능한 명령")), "명령 안내가 나오지 않는다");
    assert.equal(t.h.runner.started.length, 0, "에이전트로 보내지 않는다");
  } finally { await t.stop(); }
});

test("M-2 다른 봇을 가리킨 명령은 응답하지 않고 실행도 하지 않는다(General·토픽 모두)", async () => {
  const t = await tgHarness();
  try {
    await until(() => t.mock.texts().some((x) => x.includes("연결됨")), 4000, "연결");
    t.mock.text(CHAT, undefined, U1, "/status@otherbot");
    t.mock.text(CHAT, 11, U1, "/status@otherbot");
    t.mock.text(CHAT, 11, U1, "/write@otherbot");
    t.mock.text(CHAT, 11, U1, "/status@mockbot"); // 뒤따른 정상 명령은 처리된다 — 앞의 것이 무시됐음을 확인
    await until(() => nonTyping(t).length >= 1, 5000, "정상 명령 응답");
    await sleep(100);
    assert.equal(nonTyping(t).length, 1, "다른 봇 명령에는 응답이 없다");
    assert.equal(t.h.runner.started.length, 0);
    const conv = t.h.store.state.conversations[`telegram:${CHAT}:11`];
    assert.notEqual(conv?.access, "write", "다른 봇의 /write는 반영되지 않는다");
    assert.ok(t.adapter.stats.ignored >= 3);
  } finally { await t.stop(); }
});

test("M-3 getMe로 username을 확인하지 못하면 @가 붙은 명령은 실행하지 않고(안전 쪽), @ 없는 명령은 처리하며, 확인이 복구되면 처리한다", async () => {
  const mock = await new MockTelegram().start();
  mock.fault("getMe", { status: 500 });
  const t = await tgHarness({ mock });
  try {
    t.mock.text(CHAT, 11, U1, "/write@otherbot");
    t.mock.text(CHAT, 11, U1, "/status@mockbot");
    t.mock.text(CHAT, 11, U1, "/status");
    await until(() => nonTyping(t).length >= 1 && t.adapter.stats.ignored >= 2 && t.mock.pending() === 0, 5000, "세 업데이트 모두 처리");
    assert.equal(nonTyping(t).length, 1, "@ 없는 /status만 응답");
    assert.match(nonTyping(t)[0]!, /<b>기기 /);
    assert.ok(t.mock.sent("getMe").length >= 3, "연결 때와 멘션 때마다 확인을 다시 시도");
    assert.notEqual(t.h.store.state.conversations[`telegram:${CHAT}:11`]?.access, "write", "다른 봇 대상 명령이 실행되지 않았다");
    mock.fault("getMe", null);
    t.mock.text(CHAT, 11, U1, "/status@mockbot");
    await until(() => nonTyping(t).length >= 2, 5000, "복구 뒤 처리");
  } finally { await t.stop(); }
});

test("Q-1 /queue가 비면 한 줄로 답하고(빈 표 없음), 있으면 한 작업 한 줄 — 작업 ID는 code", async () => {
  const t = await tgHarness();
  try {
    t.mock.text(CHAT, 11, U1, "/queue");
    await until(() => nonTyping(t).length >= 1, 4000, "빈 /queue");
    assert.equal(nonTyping(t)[0], "대기·실행 중인 작업이 없다");
    assert.ok(!t.mock.sent().some((c) => String(c.params.text).includes("<pre>")), "코드 블록 표가 없다");
    t.mock.text(CHAT, 11, U1, "질문 큐");
    t.mock.text(CHAT, 11, U1, "질문 큐 둘째");
    await until(() => t.h.runner.started.includes("질문 큐"), 4000, "시작");
    t.mock.text(CHAT, 11, U1, "/queue");
    await until(() => t.mock.texts().some((x) => x.startsWith("<b>작업</b>")), 4000, "채워진 /queue");
    const text = t.mock.texts().find((x) => x.startsWith("<b>작업</b>"))!;
    const lines = text.split("\n").slice(1);
    assert.equal(lines.length, 2);
    assert.match(lines[0]!, /^• <code>t-[0-9a-f]+<\/code> (running|queued) — <code>a\/main<\/code> · read-only$/);
    t.h.runner.release("질문 큐");
    await until(() => t.h.runner.started.includes("질문 큐 둘째"), 4000, "둘째 시작");
    t.h.runner.release("질문 큐 둘째");
  } finally { await t.stop(); }
});

test("Q-2 목록형 응답은 비어 있을 때 한 줄로 답한다(/pending·/held·/workspaces·/status)", async () => {
  const t = await tgHarness();
  try {
    t.mock.text(CHAT, undefined, U1, "/held");
    t.mock.text(CHAT, undefined, U1, "/workspaces");
    t.mock.text(CHAT, 11, U1, "/pending");
    await until(() => nonTyping(t).length >= 3, 4000, "응답");
    const texts = nonTyping(t);
    assert.equal(texts[0], "보류된 요청이 없다");
    assert.match(texts[1]!, /^<b>워크스페이스<\/b>/);
    assert.equal(texts[2], "대기 중인 승인이 없다");
  } finally { await t.stop(); }
});
