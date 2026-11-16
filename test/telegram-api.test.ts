import assert from "node:assert/strict";
import test from "node:test";
import { makeRedactor } from "../src/daemon/secrets.ts";
import { TelegramApi, TelegramApiError } from "../src/daemon/telegram/api.ts";
import { MockTelegram } from "./telegram-mock.ts";
import { OTHER_TOKEN, TOKEN } from "./telegram-helpers.ts";

const redact = makeRedactor([TOKEN]);
const api = (mock: MockTelegram, extra: Partial<ConstructorParameters<typeof TelegramApi>[0]> = {}) => new TelegramApi({ token: TOKEN, base: mock.base, redact, ...extra });

test("S-1 429는 retry_after만큼 기다린 뒤 재시도해 성공하고, 계속 429면 상한 뒤 오류", async () => {
  const mock = await new MockTelegram().start();
  try {
    const waits: number[] = [];
    mock.fault("sendMessage", { status: 429, times: 1, body: { ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 1 } } });
    const r = await api(mock, { sleep: async (ms) => { waits.push(ms); } }).call<{ message_id: number }>("sendMessage", { chat_id: 1, text: "x" });
    assert.ok(r.message_id > 0);
    assert.deepEqual(waits, [1000]);
    mock.fault("sendMessage", { status: 429, body: { ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 1 } } });
    const w2: number[] = [];
    await assert.rejects(() => api(mock, { sleep: async (ms) => { w2.push(ms); } }).call("sendMessage", { chat_id: 1, text: "x" }), (e: unknown) => e instanceof TelegramApiError && e.code === 429 && e.definite);
    assert.equal(w2.length, 3, "최대 3회 재시도");
  } finally { await mock.close(); }
});

test("S-2 오류·로그에 토큰이 없다(설명·연결 실패·다른 봇 형태)", async () => {
  const mock = await new MockTelegram().start();
  try {
    mock.fault("sendMessage", { status: 400, body: { ok: false, error_code: 400, description: `Bad Request: token ${TOKEN} and ${OTHER_TOKEN}` } });
    await assert.rejects(() => api(mock).call("sendMessage", {}), (e: unknown) => { const m = String((e as Error).message); return !m.includes(TOKEN) && !m.includes(OTHER_TOKEN) && !m.includes(TOKEN.slice(0, 12)); });
    await mock.close();
    const dead = new TelegramApi({ token: TOKEN, base: mock.base, redact });
    await assert.rejects(() => dead.call("getMe"), (e: unknown) => { const err = e as TelegramApiError; return !String(err.message).includes(TOKEN) && !String(err.stack ?? "").includes(TOKEN) && err.definite === false; });
  } finally { /* 이미 닫힘 */ }
});

test("S-4m 응답하지 않는 호출은 마감 안에 포기하고(결과 불명), 정지하면 즉시 abort", async () => {
  const mock = await new MockTelegram().start();
  try {
    mock.fault("createForumTopic", { hang: true });
    const t0 = Date.now();
    await assert.rejects(() => api(mock, { perCallMs: 150, totalMs: 400 }).call("createForumTopic", { name: "x" }), (e: unknown) => e instanceof TelegramApiError && e.definite === false);
    assert.ok(Date.now() - t0 < 2000);
    const a2 = api(mock, { perCallMs: 5000, totalMs: 10_000 });
    const p = a2.call("createForumTopic", { name: "y" });
    setTimeout(() => a2.abort(), 80);
    const t1 = Date.now();
    await assert.rejects(() => p, TelegramApiError);
    assert.ok(Date.now() - t1 < 1500, "정지는 대기·fetch를 즉시 중단");
  } finally { await mock.close(); }
});

test("S-4o retry_after가 남은 마감보다 길면 기다리지 않고 포기, 대기 중 정지는 즉시 abort", async () => {
  const mock = await new MockTelegram().start();
  try {
    mock.fault("sendMessage", { status: 429, body: { ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 20 } } });
    const t0 = Date.now();
    await assert.rejects(() => api(mock, { totalMs: 1000, sleep: async () => { throw new Error("기다리면 안 된다"); } }).call("sendMessage", {}), (e: unknown) => e instanceof TelegramApiError && e.code === 429);
    assert.ok(Date.now() - t0 < 1500);
    const a2 = new TelegramApi({ token: TOKEN, base: mock.base, redact, totalMs: 60_000 });
    mock.fault("sendMessage", { status: 429, body: { ok: false, error_code: 429, description: "x", parameters: { retry_after: 30 } } });
    const p = a2.call("sendMessage", {});
    setTimeout(() => a2.abort(), 100);
    const t1 = Date.now();
    await assert.rejects(() => p, TelegramApiError);
    assert.ok(Date.now() - t1 < 2000, "대기 중 정지는 즉시");
  } finally { await mock.close(); }
});
