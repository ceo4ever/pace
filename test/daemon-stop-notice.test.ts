import assert from "node:assert/strict";
import test from "node:test";
import { harness, msg } from "./daemon-helpers.ts";

// P035 실사용 확인 후속(수정 17) — 정상 정지(daemon stop) 때 승인 대기·대기열 작업의 중단 안내를 잃지 않는다.

async function writeTaskAwaitingApproval(h: Awaited<ReturnType<typeof harness>>): Promise<string> {
  await h.daemon.ingest(msg("/access write", "c0"));
  const r = await h.daemon.ingest(msg("쓰기 요청", "m1"));
  assert.ok(r.kind === "task" && r.status === "awaiting_approval");
  return r.taskId;
}

test("ST-1 정지하면 승인 대기 작업의 만료 안내를 어댑터 종료 전에 보낸다", async () => {
  const h = await harness();
  const id = await writeTaskAwaitingApproval(h);
  await h.daemon.stop({ drain: false });
  const text = h.adapter.texts().find((x) => x.includes(id));
  assert.ok(text && text.includes("승인 대기가 만료"), h.adapter.texts().join("\n"));
  assert.equal(h.store.state.outbox.length, 0, "전달됐으니 outbox에 남지 않는다");
});

test("ST-2 정지 중 전송이 실패해도 안내는 outbox에 남아 다음 기동에서 전달된다", async () => {
  const h = await harness();
  const id = await writeTaskAwaitingApproval(h);
  h.adapter.failSend = true;
  await h.daemon.stop({ drain: false });
  assert.ok(h.store.state.outbox.some((n) => n.text.includes(id) && n.text.includes("승인 대기가 만료")), "outbox에 보존");
  const h2 = await h.restart();
  assert.ok(h2.adapter.texts().some((x) => x.includes(id) && x.includes("승인 대기가 만료")), "재기동 때 전달");
  await h2.daemon.stop({ drain: false });
});

test("ST-3 정지 때 대기열(시작 전) 작업도 중단 안내를 받는다", async () => {
  const h = await harness({ maxConcurrent: 1 });
  await h.daemon.ingest(msg("앞", "m1"));
  await h.runner.waitStarted("앞");
  const r = await h.daemon.ingest(msg("뒤", "m2"));
  assert.ok(r.kind === "task");
  const stopping = h.daemon.stop({ drain: true });
  await new Promise((res) => setTimeout(res, 100));
  h.runner.release("앞");
  await stopping;
  assert.ok(h.adapter.texts().some((x) => x.includes(r.taskId) && x.includes("시작하지 못함")), h.adapter.texts().join("\n"));
});
