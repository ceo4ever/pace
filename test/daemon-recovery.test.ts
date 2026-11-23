import test from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { actor, harness, msg, type Harness } from "./daemon-helpers.ts";
import type { Task } from "../src/daemon/types.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const byPrompt = (h: Harness, p: string): Task => Object.values(h.store.state.tasks).find((t) => t.target.sessionKey !== undefined && (t.origin.messageId === p))!;

/** 읽기 R(a)·쓰기 W(b)가 실행 중이고, 쓰기 A는 승인 대기, Q는 R과 같은 경로라 대기인 상태를 만든다 */
async function crashScene(opts: { failSend?: boolean } = {}): Promise<Harness> {
  const h = await harness({ maxConcurrent: 2 });
  if (opts.failSend) h.adapter.failSend = true;
  await h.daemon.ingest(msg("/use a", "u-a", "u1", "ca"));
  await h.daemon.ingest(msg("/use b", "u-b", "u1", "cb"));
  await h.daemon.ingest(msg("/access write", "w-b", "u1", "cb"));
  await h.daemon.ingest(msg("R", "R", "u1", "ca"));
  await h.daemon.ingest(msg("W", "W", "u1", "cb"));
  const w = byPrompt(h, "W");
  await h.daemon.approval(w.approvalId!, actor("u1", "cb"), "approve");
  await h.runner.waitStarted("R");
  await h.runner.waitStarted("W");
  await h.daemon.ingest(msg("Q", "Q", "u1", "ca")); // R과 같은 경로 → 대기
  await h.daemon.ingest(msg("/use asub-none", "bad", "u1", "cc")); // 알 수 없는 대상 — 상태 영향 없음
  await h.daemon.ingest(msg("/access write", "w-c", "u1", "ca"));
  await h.daemon.ingest(msg("A", "A", "u1", "ca")); // 쓰기 — 승인 대기
  return h;
}

test("S-12 강제 종료 복구: 읽기→interrupted, 쓰기→needs_review+격리, 승인 대기→expired, 이전 승인 무효, 재실행 없음", async () => {
  const h = await crashScene();
  const startedBefore = [...h.runner.started];
  const confirm = { reap: async () => "confirmed" as const };
  // 격리를 확인하지 못하는 첫 복구
  const h2 = await h.restart({ reap: async () => "unconfirmed" });
  const r = byPrompt(h2, "R"), w = byPrompt(h2, "W"), a = byPrompt(h2, "A"), q = byPrompt(h2, "Q");
  assert.equal(r.status, "interrupted");
  assert.equal(w.status, "needs_review");
  assert.equal(w.summaryPending, true, "회수 확인 전에는 요약 대기");
  assert.equal(a.status, "expired");
  assert.equal(q.status, "interrupted");
  assert.ok(Object.values(h2.store.state.approvals).every((x) => x.state !== "pending"), "이전 승인은 모두 무효");
  assert.equal(Object.keys(h2.store.state.quarantine).length, 2, "running이던 두 경로 모두 격리");
  assert.deepEqual(h2.runner.started, startedBefore, "자동 재실행 없음");
  // 알림은 한 번씩
  const texts = h2.adapter.texts().join("\n");
  assert.match(texts, /확인이 필요/);
  assert.equal(h2.store.state.outbox.length, 0, "전송 뒤 outbox 비움");
  // 격리된 경로는 새 작업이 시작되지 않는다
  h2.runner.immediate.add("AFTER");
  await h2.daemon.ingest(msg("AFTER", "after", "u1", "ca"));
  await sleep(60);
  assert.ok(!h2.runner.started.includes("AFTER"));
  // 두 번째 복구에서 회수가 확인되면 자동 해제 + 요약 채움
  const h3 = await h2.restart(confirm);
  assert.equal(Object.keys(h3.store.state.quarantine).length, 0);
  assert.equal(byPrompt(h3, "W").summary, "요약");
  assert.equal(byPrompt(h3, "W").summaryPending, false);
  assert.equal((await h3.daemon.ingest(msg("R", "R", "u1", "ca"))).kind, "duplicate", "수신 중복 제거 유지");
});

test("S-33 복구 도중 다시 죽어도 격리는 남는다(회수 확인 못 하면 release까지)", async () => {
  const h = await crashScene();
  const h2 = await h.restart({ reap: async () => { throw new Error("회수 확인 중 오류"); } });
  assert.equal(Object.keys(h2.store.state.quarantine).length, 2);
  const h3 = await h2.restart({ reap: async () => "unconfirmed" });
  assert.equal(Object.keys(h3.store.state.quarantine).length, 2, "이미 needs_review인 이전 작업의 격리도 이어진다");
  assert.equal(byPrompt(h3, "W").summaryPending, true);
  assert.equal(await h3.daemon.release(h3.dirs.b!), true);
  assert.equal(Object.keys(h3.store.state.quarantine).length, 1);
});

test("S-31 알림은 outbox에 먼저 적재되어 전송이 실패해도 유실되지 않고 다음 기동에서 전송된다(최소 한 번)", async () => {
  const h = await crashScene();
  const failing = await h.restart({}); // 정상 어댑터로 한 번 복구해 outbox를 만든다
  void failing;
  const h0 = await crashScene();
  const h2 = await harness({ home: h0.home, runner: h0.runner, adapterFailSend: true });
  assert.ok(h2.store.state.outbox.length > 0, "전송 실패한 알림은 outbox에 남는다");
  const persisted = JSON.parse(readFileSync(h2.store.file, "utf8")).outbox.length;
  assert.ok(persisted > 0, "파일에도 영속");
  const h3 = await harness({ home: h0.home, runner: h0.runner });
  assert.match(h3.adapter.texts().join(String.fromCharCode(10)), /중단됐습니다|확인이 필요/);
  assert.equal(h3.store.state.outbox.length, 0);
});

test("S-13 drain 정지: 실행 중 작업 완료·대기 작업 표시·새 수신 거부", async () => {
  const h = await harness({ maxConcurrent: 1 });
  await h.daemon.ingest(msg("RUN", "m1"));
  await h.daemon.ingest(msg("WAIT", "m2"));
  await h.runner.waitStarted("RUN");
  const stopping = h.daemon.stop({ drain: true });
  await sleep(30);
  assert.equal((await h.daemon.ingest(msg("NEW", "m3"))).kind, "stopping");
  h.runner.release("RUN", { text: "정상 완료" });
  await stopping;
  assert.equal(byPrompt(h, "m1").status, "done");
  assert.equal(byPrompt(h, "m2").status, "interrupted");
  assert.ok(!h.runner.started.includes("WAIT"));
  assert.ok(h.adapter.texts().some((t) => /시작하지 못함/.test(t)));
});

test("S-13b drain 시간 초과: 읽기는 interrupted, 쓰기는 needs_review", async () => {
  const h = await harness({ maxConcurrent: 2, config: { drainTimeoutMs: 80 } });
  await h.daemon.ingest(msg("/use b", "ub", "u1", "cb"));
  await h.daemon.ingest(msg("/access write", "wb", "u1", "cb"));
  await h.daemon.ingest(msg("RD", "RD", "u1", "c1"));
  await h.daemon.ingest(msg("WR", "WR", "u1", "cb"));
  await h.daemon.approval(byPrompt(h, "WR").approvalId!, actor("u1", "cb"), "approve");
  await h.runner.waitStarted("RD");
  await h.runner.waitStarted("WR");
  await h.daemon.stop({ drain: true });
  assert.equal(byPrompt(h, "RD").status, "interrupted");
  assert.equal(byPrompt(h, "WR").status, "needs_review");
});

test("S-23 회수 미확인 격리는 재시작 뒤에도 조상·자손 경로를 막고 release 뒤 풀린다", async () => {
  const h = await harness({ maxConcurrent: 1 });
  await h.daemon.ingest(msg("RUN", "m1"));
  await h.runner.waitStarted("RUN");
  h.runner.release("RUN", { status: "done", text: "ok", cleanupUnconfirmed: true });
  await h.daemon.idle();
  assert.equal(Object.keys(h.store.state.quarantine).length, 1);
  await h.daemon.stop();
  const h2 = await h.restart();
  h2.runner.immediate.add("NEXT");
  await h2.daemon.ingest(msg("NEXT", "m2"));
  await sleep(60);
  assert.ok(!h2.runner.started.includes("NEXT"));
  assert.equal(await h2.daemon.release(h2.dirs.a!), true);
  await h2.daemon.idle();
  await sleep(40);
  assert.ok(h2.runner.started.includes("NEXT"));
});

test("실행자 예외는 failed+회수 미확인(안전 쪽)으로 격리한다", async () => {
  const h = await harness({ extra: { runner: async () => { throw new Error("폭발"); } } });
  await h.daemon.ingest(msg("X", "m1"));
  await h.daemon.idle();
  await sleep(40);
  const t = Object.values(h.store.state.tasks)[0]!;
  assert.equal(t.status, "failed");
  assert.equal(t.cleanup, "unconfirmed");
  assert.equal(Object.keys(h.store.state.quarantine).length, 1);
});

test("S-12w 격리된 경로의 새 쓰기는 시작 승인 뒤에도 queued로 남고 실행기를 부르지 않는다", async () => {
  const h = await crashScene();
  const h2 = await h.restart({ reap: async () => "unconfirmed" });
  assert.equal(byPrompt(h2, "W").status, "needs_review");
  const startedBefore = [...h2.runner.started];
  h2.runner.immediate.add("W2");
  await h2.daemon.ingest(msg("/access write", "w-b2", "u1", "cb"));
  await h2.daemon.ingest(msg("W2", "W2", "u1", "cb")); // W와 같은 격리 경로(b)의 쓰기
  const w2 = byPrompt(h2, "W2");
  assert.equal(w2.status, "awaiting_approval");
  assert.deepEqual(await h2.daemon.approval(w2.approvalId!, actor("u1", "cb"), "approve"), { ok: true });
  await sleep(80); // 승인 뒤 스케줄링이 돌 기회를 준다
  assert.equal(w2.status, "queued", "승인된 쓰기도 격리 경로면 대기");
  assert.ok(!h2.runner.started.includes("W2"), "격리 경로의 승인된 쓰기는 실행기 호출 0회");
  assert.deepEqual(h2.runner.started, startedBefore);
  // 운영자 해제 뒤에만 시작된다(검출 대조)
  assert.equal(await h2.daemon.release(byPrompt(h2, "W").target.worktree), true);
  await h2.runner.waitStarted("W2");
  await h2.daemon.idle();
});
