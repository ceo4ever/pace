import test from "node:test";
import assert from "node:assert/strict";
import { actor, harness, msg, type Harness } from "./daemon-helpers.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function writeTask(h: Harness, text = "W", id = "w1", user = "u1", conv = "c1") {
  await h.daemon.ingest(msg("/access write", `acc-${id}`, user, conv));
  const r = await h.daemon.ingest(msg(text, id, user, conv));
  assert.equal(r.kind, "task");
  const task = Object.values(h.store.state.tasks).find((t) => t.origin.messageId === id)!;
  return { task, approvalId: task.approvalId! };
}

test("S-7 쓰기는 승인 전 시작하지 않고 승인 뒤 실행된다", async () => {
  const h = await harness();
  const { task, approvalId } = await writeTask(h);
  assert.equal(task.status, "awaiting_approval");
  assert.equal(h.adapter.prompts.length, 1);
  await sleep(40);
  assert.equal(h.runner.started.length, 0);
  assert.deepEqual(await h.daemon.approval(approvalId, actor(), "approve"), { ok: true });
  await h.runner.waitStarted("W");
  assert.ok(task.snapshot, "쓰기 작업은 시작 스냅샷을 저장한다");
  h.runner.release("W");
  await h.daemon.idle();
  assert.equal(task.status, "done");
});

test("S-7b 읽기 전용은 승인 없이 실행된다", async () => {
  const h = await harness();
  h.runner.immediate.add("R");
  await h.daemon.ingest(msg("R", "r1"));
  await h.daemon.idle();
  assert.equal(h.runner.started.length, 1);
  assert.equal(Object.keys(h.store.state.approvals).length, 0);
});

test("S-7c 거부는 denied로 미실행, 만료는 expired로 미실행", async () => {
  const h = await harness({ config: { approvalTtlSeconds: 1 } });
  const a = await writeTask(h, "REJ", "r1");
  assert.equal((await h.daemon.approval(a.approvalId, actor(), "reject")).ok, true);
  assert.equal(a.task.status, "denied");
  assert.equal(a.task.prompt, "", "종료 상태에서 프롬프트를 비운다");
  const b = await writeTask(h, "EXP", "e1", "u1", "c2");
  await sleep(1300);
  assert.equal(b.task.status, "expired");
  assert.equal(h.runner.started.length, 0);
  assert.equal((await h.daemon.approval(b.approvalId, actor("u1", "c2"), "approve")).ok, false, "만료 뒤 승인 거부");
  await sleep(50); // 늦은 승인 뒤 스케줄링이 돌 기회를 준다
  assert.equal(b.task.status, "expired");
  assert.equal(h.runner.started.length, 0, "늦은 승인 처리·스케줄링 뒤에도 실행기 호출 0회");
});

test("S-8 중복·다른 사용자·다른 대화·이전 기동·만료 뒤 응답은 거부되고 상태가 변하지 않는다", async () => {
  const h = await harness();
  const a = await writeTask(h, "X", "x1");
  // 다른 사용자·다른 대화
  const other = await h.daemon.approval(a.approvalId, actor("u2", "c1"), "approve");
  assert.equal(other.ok, false);
  const otherConv = await h.daemon.approval(a.approvalId, actor("u1", "c9"), "approve");
  assert.equal(otherConv.ok, false);
  assert.equal(h.store.state.approvals[a.approvalId]!.state, "pending");
  assert.equal((await h.daemon.approval(a.approvalId, actor(), "approve")).ok, true);
  // 중복
  const dup = await h.daemon.approval(a.approvalId, actor(), "approve");
  assert.equal(dup.ok, false);
  assert.match(dup.reason ?? "", /이미 처리/);
  await h.runner.waitStarted("X");
  h.runner.release("X");
  await h.daemon.idle();
  // 이전 기동: 새 데몬이 같은 상태를 이어받으면 이전 승인은 무효
  const b = await writeTask(h, "Y", "y1", "u1", "c3");
  const h2 = await h.restart();
  assert.equal(h2.store.state.approvals[b.approvalId]!.state, "invalidated");
  const stale = await h2.daemon.approval(b.approvalId, actor("u1", "c3"), "approve");
  assert.equal(stale.ok, false);
  assert.equal(h2.runner.started.filter((p) => p === "Y").length, 0);
});

test("S-8b 관리자(Gateway)는 다른 대화의 승인을 처리할 수 있다", async () => {
  const h = await harness();
  const a = await writeTask(h, "G", "g1");
  assert.equal((await h.daemon.approval(a.approvalId, { channel: "gateway", conversation: "z", user: "gw", admin: true }, "approve")).ok, true);
  await h.runner.waitStarted("G");
  h.runner.release("G");
  await h.daemon.idle();
});

test("S-9 도구 승인은 콜백 결과로, 기한 초과는 거부+작업 취소, handoff 승인은 기록만", async () => {
  const h = await harness({ config: { approvalTtlSeconds: 1 } });
  await h.daemon.ingest(msg("T", "t1"));
  await h.runner.waitStarted("T");
  const ctl = h.runner.ctl("T");
  const p = ctl.requestApproval("Bash 실행");
  await sleep(30);
  const tool = Object.values(h.store.state.approvals).find((a) => a.kind === "tool")!;
  assert.equal((await h.daemon.approval(tool.id, actor(), "approve")).ok, true);
  assert.equal(await p, true);
  // 기한 초과 → false + 작업 취소
  const p2 = ctl.requestApproval("또 다른 도구");
  assert.equal(await p2, false);
  await h.daemon.idle();
  const task = Object.values(h.store.state.tasks)[0]!;
  assert.equal(task.status, "cancelled");
  // handoff
  const h2 = await harness();
  await h2.daemon.ingest(msg("H", "h1"));
  await h2.runner.waitStarted("H");
  h2.runner.release("H", { status: "handoff", handoff: "쓰기 변경이 있어 사람이 이어받아야 함", text: "" });
  await h2.daemon.idle();
  const ht = Object.values(h2.store.state.tasks)[0]!;
  assert.equal(ht.status, "handoff");
  const ha = Object.values(h2.store.state.approvals).find((a) => a.kind === "handoff")!;
  assert.equal((await h2.daemon.approval(ha.id, actor(), "approve")).ok, true);
  assert.equal(ht.status, "handoff_acknowledged");
  assert.equal(h2.runner.started.length, 1, "자동 재실행 없음");
});

test("S-22 승인·취소·정지가 겹쳐도 먼저 처리된 것이 이기고 취소된 작업은 시작하지 않는다", async () => {
  const h = await harness();
  const a = await writeTask(h, "RACE", "r1");
  const [approve, cancel] = await Promise.all([h.daemon.approval(a.approvalId, actor(), "approve"), h.daemon.cancel(a.task.id, actor())]);
  await sleep(80);
  await h.daemon.idle();
  if (a.task.status === "cancelled") assert.ok(!h.runner.started.includes("RACE"), "취소가 이기면 시작하지 않음");
  else { assert.equal(approve.ok, true); h.runner.release("RACE"); await h.daemon.idle(); }
  assert.ok(approve.ok || cancel.ok);
  // dequeue 직후 stop
  const h2 = await harness({ config: { drainTimeoutMs: 100 } });
  const b = await writeTask(h2, "STOPME", "s1");
  const approving = h2.daemon.approval(b.approvalId, actor(), "approve");
  const stopping = h2.daemon.stop({ drain: true });
  await Promise.all([approving, stopping]);
  // 먼저 처리된 쪽이 이긴다: 정지가 먼저면 시작하지 않고 interrupted, 승인이 먼저면 시작했다가 drain 시간 초과로 needs_review
  if (!h2.runner.started.includes("STOPME")) assert.equal(b.task.status, "interrupted");
  else assert.equal(b.task.status, "needs_review");
});

test("S-22b 저장 실패면 쓰기 작업을 시작하지 않는다", async () => {
  const h = await harness();
  const a = await writeTask(h, "NOSAVE", "n1");
  await h.daemon.approval(a.approvalId, actor(), "approve");
  await h.runner.waitStarted("NOSAVE");
  h.runner.release("NOSAVE");
  await h.daemon.idle();
  const h2 = await harness();
  const b = await writeTask(h2, "NOSAVE2", "n2");
  h2.store.failWrites = true;
  const r = await h2.daemon.approval(b.approvalId, actor(), "approve");
  assert.equal(r.ok, false, "저장 실패면 승인도 적용되지 않는다");
  assert.equal(h2.runner.started.length, 0);
  assert.equal(b.task.status, "awaiting_approval");
});

test("S-32 실행 중 도구 승인 대기와 취소·정지가 겹쳐도 처리기가 막히지 않는다", async () => {
  const h = await harness();
  await h.daemon.ingest(msg("BUSY", "b1"));
  await h.runner.waitStarted("BUSY");
  const p = h.runner.ctl("BUSY").requestApproval("도구");
  await sleep(30);
  const id = Object.keys(h.store.state.tasks)[0]!;
  assert.equal((await h.daemon.cancel(id, actor())).ok, true);
  assert.equal(await p, false, "취소하면 대기 중 도구 승인은 거부로 풀린다");
  await h.daemon.idle();
  assert.equal(h.daemon.getTask(id)!.status, "cancelled");
  const r = await h.daemon.ingest(msg("/status", "s1"));
  assert.equal(r.kind, "command");
});

test("S-8c 다른 기동 ID로 발급된(무효화 표시가 안 된) 승인도 결정 시점에 거부한다", async () => {
  const h = await harness();
  const a = await writeTask(h, "OLDBOOT", "o1");
  h.store.state.approvals[a.approvalId]!.bootId = "previous-boot"; // 무효화 표시 없이 남은 이전 기동 승인
  const r = await h.daemon.approval(a.approvalId, actor(), "approve");
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /이전 기동/);
  assert.equal(a.task.status, "awaiting_approval");
  assert.equal(h.runner.started.length, 0);
});
