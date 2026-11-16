import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { lockKeyOf, pathsRelated } from "../src/daemon/core.ts";
import { actor, harness, msg, type Harness } from "./daemon-helpers.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function use(h: Harness, target: string, id: string, conv = "c1") {
  await h.daemon.ingest(msg(`/use ${target}`, id, "u1", conv));
}

test("S-2 서로 다른 워크트리는 병렬로 실행된다", async () => {
  const h = await harness();
  await use(h, "a", "m0", "c1");
  await use(h, "b", "m0", "c2");
  await h.daemon.ingest(msg("A", "m1", "u1", "c1"));
  await h.daemon.ingest(msg("B", "m1", "u1", "c2"));
  await h.runner.waitStarted("A");
  await h.runner.waitStarted("B");
  assert.equal(h.runner.maxRunning, 2);
  h.runner.release("A"); h.runner.release("B");
  await h.daemon.idle();
  assert.equal(h.daemon.getTask(Object.keys(h.store.state.tasks)[0]!)!.status, "done");
});

test("S-3 같은 워크트리·조상/자손 경로는 직렬화되고 막힌 작업이 뒤의 풀린 작업을 막지 않는다", async () => {
  const h = await harness({ maxConcurrent: 4 });
  const sub = join(h.dirs.a!, "sub");
  mkdirSync(sub);
  h.config.workspaces.push({ name: "asub", path: sub, worktrees: { main: sub } });
  h.daemon.reloadAllowed();
  await use(h, "a", "m0", "c1");
  await use(h, "asub", "m0", "c2");
  await use(h, "b", "m0", "c3");
  await h.daemon.ingest(msg("A1", "m1", "u1", "c1"));
  await h.daemon.ingest(msg("A2", "m2", "u1", "c1")); // 같은 경로
  await h.daemon.ingest(msg("S1", "m1", "u1", "c2")); // 자손
  await h.daemon.ingest(msg("B1", "m1", "u1", "c3")); // 무관
  await h.runner.waitStarted("A1");
  await h.runner.waitStarted("B1");
  await sleep(50);
  assert.deepEqual([...h.runner.started].sort(), ["A1", "B1"], "A2·S1은 대기");
  h.runner.release("A1");
  await h.runner.waitStarted("A2");
  await sleep(30);
  assert.ok(!h.runner.started.includes("S1"), "A2가 끝나기 전에는 자손 경로도 대기");
  h.runner.release("A2");
  await h.runner.waitStarted("S1");
  h.runner.release("S1"); h.runner.release("B1");
  await h.daemon.idle();
});

test("lockKeyOf·pathsRelated: 조상·자손·같은 경로", () => {
  const a = lockKeyOf("/x/y");
  assert.ok(pathsRelated(a, lockKeyOf("/x/y/z")));
  assert.ok(pathsRelated(lockKeyOf("/x/y/z"), a));
  assert.ok(pathsRelated(a, lockKeyOf("/x/y")));
  assert.ok(!pathsRelated(a, lockKeyOf("/x/yy")));
});

test("S-3b 동시 실행 상한을 지킨다", async () => {
  const h = await harness({ maxConcurrent: 1 });
  await use(h, "a", "m0", "c1");
  await use(h, "b", "m0", "c2");
  await h.daemon.ingest(msg("A", "m1", "u1", "c1"));
  await h.daemon.ingest(msg("B", "m1", "u1", "c2"));
  await h.runner.waitStarted("A");
  await sleep(50);
  assert.ok(!h.runner.started.includes("B"));
  h.runner.release("A");
  await h.runner.waitStarted("B");
  h.runner.release("B");
  await h.daemon.idle();
  assert.equal(h.runner.maxRunning, 1);
});

test("S-4 대기 중 선택 변경은 이미 받은 작업 대상에 영향 없다", async () => {
  const h = await harness({ maxConcurrent: 1 });
  await use(h, "a", "m0", "c1");
  await use(h, "b", "m0", "c9");
  await h.daemon.ingest(msg("BLOCK", "m1", "u1", "c9")); // 슬롯 점유
  await h.runner.waitStarted("BLOCK");
  await h.daemon.ingest(msg("WAIT", "m2", "u1", "c1")); // a 대상으로 대기
  await h.daemon.ingest(msg("/use b", "m3", "u1", "c1")); // 대기 중 선택 변경
  await h.daemon.ingest(msg("/chain other", "m4", "u1", "c1"));
  h.runner.release("BLOCK");
  await h.runner.waitStarted("WAIT");
  assert.equal(h.runner.jobs.find((j) => j.prompt === "WAIT")!.target.worktree, h.dirs.a);
  assert.equal(h.runner.jobs.find((j) => j.prompt === "WAIT")!.target.chain, "default");
  h.runner.release("WAIT");
  await h.daemon.idle();
});

test("S-5 같은 수신 ID는 한 번만 실행되고 재시작 뒤에도 유지된다", async () => {
  const h = await harness();
  h.runner.immediate.add("X");
  const r1 = await h.daemon.ingest(msg("X", "same"));
  const r2 = await h.daemon.ingest(msg("X", "same"));
  assert.equal(r1.kind, "task");
  assert.equal(r2.kind, "duplicate");
  await h.daemon.idle();
  assert.equal(h.runner.started.length, 1);
  await h.daemon.stop();
  const h2 = await h.restart();
  const r3 = await h2.daemon.ingest(msg("X", "same"));
  assert.equal(r3.kind, "duplicate");
  assert.equal(h2.runner.started.length, 1);
  await h2.daemon.stop();
});

test("S-6 미허용 사용자·미등록 대상은 작업을 만들지 않는다", async () => {
  const h = await harness();
  const r = await h.daemon.ingest(msg("X", "m1", "intruder"));
  assert.equal(r.kind, "rejected");
  assert.equal(Object.keys(h.store.state.tasks).length, 0);
  assert.equal(h.daemon.stats.rejectedUsers, 1);
  const none = await harness({ workspaces: [] });
  assert.equal((await none.daemon.ingest(msg("X", "m1"))).kind, "rejected");
  const missing = await harness();
  rmSync(missing.dirs.a!, { recursive: true });
  assert.equal((await missing.daemon.ingest(msg("X", "m1"))).kind, "rejected");
});

test("S-10 대기·실행 중 취소와 회수 미확인 표시·격리", async () => {
  const h = await harness({ maxConcurrent: 1 });
  await h.daemon.ingest(msg("RUN", "m1"));
  await h.daemon.ingest(msg("QUEUED", "m2"));
  await h.runner.waitStarted("RUN");
  const queuedId = Object.values(h.store.state.tasks).find((t) => t.status === "queued")!.id;
  assert.equal((await h.daemon.cancel(queuedId, actor())).ok, true);
  assert.equal(h.daemon.getTask(queuedId)!.status, "cancelled");
  const runId = Object.values(h.store.state.tasks).find((t) => t.status === "running")!.id;
  h.runner.onAbort = { status: "cancelled", cleanupUnconfirmed: true };
  assert.equal((await h.daemon.cancel(runId, actor())).ok, true);
  await h.daemon.idle();
  assert.equal(h.daemon.getTask(runId)!.status, "cancelled");
  assert.equal(h.daemon.getTask(runId)!.cleanup, "unconfirmed");
  assert.equal(Object.keys(h.store.state.quarantine).length, 1);
  // 격리된 경로는 새 작업이 시작되지 않는다
  await h.daemon.ingest(msg("AFTER", "m3"));
  await sleep(60);
  assert.ok(!h.runner.started.includes("AFTER"));
  assert.equal(await h.daemon.release(h.dirs.a!), true);
  await h.runner.waitStarted("AFTER");
  h.runner.release("AFTER");
  await h.daemon.idle();
});

test("S-17 결정적 명령은 실행자를 부르지 않고 자유 텍스트만 부른다", async () => {
  const h = await harness();
  for (const [i, c] of ["/status", "/queue", "/help", "/nope", "/use a", "/chain x", "/access read-only"].entries()) {
    const r = await h.daemon.ingest(msg(c, `c${i}`));
    assert.equal(r.kind, "command", c);
  }
  assert.equal(h.runner.started.length, 0);
  h.runner.immediate.add("자유 대화");
  const r = await h.daemon.ingest(msg("자유 대화", "free"));
  assert.equal(r.kind, "task");
  await h.daemon.idle();
  assert.equal(h.runner.started.length, 1);
});

test("S-17b 이벤트 사상과 느린 소비자 격리", async () => {
  const h = await harness({ extra: { eventQueueLimit: 3 } });
  const seen: string[] = [];
  h.daemon.subscribe((e) => { seen.push(e.type); });
  const slow = h.daemon.subscribe(async () => { await sleep(200); });
  await h.daemon.ingest(msg("EV", "m1"));
  await h.runner.waitStarted("EV");
  const ctl = h.runner.ctl("EV");
  ctl.update({ sessionUpdate: "agent_message_chunk", content: { text: "안" } });
  ctl.update({ sessionUpdate: "tool_call", toolCallId: "t1", title: "Read" });
  ctl.update({ sessionUpdate: "plan", entries: [] });
  ctl.update({ sessionUpdate: "unknown_kind" });
  for (let i = 0; i < 10; i++) ctl.update({ sessionUpdate: "agent_message_chunk", content: { text: String(i) } });
  h.runner.release("EV");
  await h.daemon.idle();
  assert.ok(["text_delta", "tool", "plan", "raw"].every((t) => seen.includes(t)));
  assert.ok(slow.subscription.dropped > 0, "느린 소비자는 버린 건수만 늘고 코어는 막히지 않는다");
  assert.ok(seen.includes("final"));
});

test("S-24 다른 대화·사용자의 작업은 조회·취소할 수 없다(관리자는 가능)", async () => {
  const h = await harness({ maxConcurrent: 1 });
  await h.daemon.ingest(msg("MINE", "m1", "u1", "c1"));
  await h.runner.waitStarted("MINE");
  const id = Object.keys(h.store.state.tasks)[0]!;
  assert.equal((await h.daemon.cancel(id, actor("u2", "c2"))).ok, false);
  assert.equal((await h.daemon.cancel(id, actor("u1", "c2"))).ok, false);
  const q = await h.daemon.ingest(msg("/queue", "q1", "u2", "c2"));
  assert.ok(q.kind === "command" && q.blocks.length === 1 && q.blocks[0]!.type === "text" && (q.blocks[0] as { text: string }).text === "대기·실행 중인 작업이 없다", "다른 대화의 작업은 보이지 않고 빈 표가 아닌 한 줄로 답한다");
  const own = await h.daemon.ingest(msg("/queue", "q2", "u1", "c1"));
  assert.ok(own.kind === "command" && own.blocks[0]!.type === "text" && new RegExp(`- \`${id}\` running — `).test((own.blocks[0] as { text: string }).text), "내 작업은 한 줄에 하나(작업 ID는 code)");
  assert.equal((await h.daemon.cancel(id, { ...actor("gw", "gw"), admin: true })).ok, true);
  await h.daemon.idle();
});

test("S-25·S-30 경로가 대기 중 같은 이름의 다른 디렉터리로 교체되면 target_changed로 거부한다", async () => {
  const h = await harness({ maxConcurrent: 1 });
  await use(h, "a", "m0", "c1");
  await use(h, "b", "m0", "c2");
  await h.daemon.ingest(msg("BLOCK", "m1", "u1", "c2"));
  await h.runner.waitStarted("BLOCK");
  await h.daemon.ingest(msg("SWAP", "m1", "u1", "c1"));
  const id = Object.values(h.store.state.tasks).find((t) => t.status === "queued")!.id;
  renameSync(h.dirs.a!, `${h.dirs.a}-old`);
  mkdirSync(h.dirs.a!);
  h.runner.release("BLOCK");
  await sleep(100);
  await h.daemon.idle();
  assert.equal(h.daemon.getTask(id)!.status, "failed");
  assert.match(h.daemon.getTask(id)!.note ?? "", /target_changed/);
  assert.ok(!h.runner.started.includes("SWAP"));
});

test("허용 경로는 기동 때 확정한다 — 기동 뒤 설정 경로가 다른 디렉터리를 가리키면 거부한다", async () => {
  const h = await harness();
  renameSync(h.dirs.a!, `${h.dirs.a}-old`);
  mkdirSync(h.dirs.a!); // 같은 경로에 다른 디렉터리(다른 식별자)
  const r = await h.daemon.ingest(msg("X", "m1"));
  assert.equal(r.kind, "rejected");
  assert.match((r as { reason: string }).reason, /기동 뒤 바뀌었다/);
  assert.equal(h.runner.started.length, 0);
  h.daemon.reloadAllowed(); // 설정을 다시 확정하면 새 디렉터리를 허용한다
  h.runner.immediate.add("Y");
  assert.equal((await h.daemon.ingest(msg("Y", "m2"))).kind, "task");
  await h.daemon.idle();
});

test("읽기→쓰기 전환: 코어는 같은 워크트리·체인의 보관 세션(직전 응답 포함)을 access가 달라도 실행자에 넘긴다", async () => {
  const h = await harness();
  h.runner.immediate.add("첫 질문");
  await h.daemon.ingest(msg("첫 질문", "m1"));
  await h.daemon.idle();
  const conv = h.store.state.conversations["fake:c1"]!;
  conv.saved = { sessionId: "s1", agent: "claude", cwd: h.dirs.a!, access: "read-only", conversation: "c1", worktree: h.dirs.a!, chain: "default", lastText: "직전 응답" };
  await h.daemon.ingest(msg("/access write", "m2"));
  const r = await h.daemon.ingest(msg("쓰기 질문", "m3"));
  assert.equal(r.kind, "task");
  const approvalId = Object.values(h.store.state.tasks).find((t) => t.origin.messageId === "m3")!.approvalId!;
  await h.daemon.approval(approvalId, actor(), "approve");
  await h.runner.waitStarted("쓰기 질문");
  const job = h.runner.jobs.find((j) => j.prompt === "쓰기 질문")!;
  assert.equal(job.saved?.lastText, "직전 응답");
  assert.equal(job.saved?.access, "read-only");
  assert.equal(job.target.access, "write");
  h.runner.release("쓰기 질문");
  await h.daemon.idle();
  // 다른 워크트리로 /use하면 보관 세션은 버려진다
  assert.equal(h.store.state.conversations["fake:c1"]!.saved !== undefined, true);
  await h.daemon.ingest(msg("/use b", "m4"));
  assert.equal(h.store.state.conversations["fake:c1"]!.saved, undefined);
});
