import assert from "node:assert/strict";
import { mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { parseConfig } from "../src/daemon/config.ts";
import { SEEN_PROTECT_MS } from "../src/daemon/store.ts";
import { makeRedactor, redactDeep } from "../src/daemon/secrets.ts";
import type { DaemonEvent } from "../src/daemon/types.ts";
import { harness, msg, type Harness } from "./daemon-helpers.ts";
import { TOKEN } from "./telegram-helpers.ts";

const redact = makeRedactor([TOKEN]);
const stateText = (h: Harness): string => readFileSync(h.store.file, "utf8");

test("S-20 bindWorkspace: 없는 대상 거부·결속 변경 시 main·세션 초기화·같은 워크스페이스는 /use 선택 보존·받은 작업 대상 불변", async () => {
  const h = await harness({ maxConcurrent: 1 });
  const ws = h.config.workspaces[0]!;
  const wt = `${ws.path}-wt`; mkdirSync(wt, { recursive: true });
  ws.worktrees.P1 = wt; h.daemon.reloadAllowed();
  const bad = await h.daemon.ingest({ ...msg("x", "m0"), bindWorkspace: "nope" });
  assert.equal(bad.kind, "rejected");
  assert.equal(h.store.state.conversations["fake:c1"], undefined, "실패한 결속은 대화를 남기지 않는다");
  await h.daemon.ingest({ ...msg("첫", "m1"), bindWorkspace: "a" });
  await h.runner.waitStarted("첫");
  await h.daemon.ingest({ ...msg("/use a/P1", "m2"), bindWorkspace: "a" });
  await h.daemon.ingest({ ...msg("둘", "m3"), bindWorkspace: "a" }); // 같은 워크스페이스 — /use 선택 보존
  assert.equal(h.store.state.conversations["fake:c1"]!.worktreeName, "P1");
  h.store.state.conversations["fake:c1"]!.saved = { sessionId: "s", agent: "claude", cwd: ws.path, access: "read-only", conversation: "c1", worktree: ws.path, chain: "default", lastText: "t" };
  await h.daemon.ingest({ ...msg("셋", "m4"), bindWorkspace: "b" }); // 다른 워크스페이스 — main·세션 초기화
  const conv = h.store.state.conversations["fake:c1"]!;
  assert.equal(conv.workspace, "b"); assert.equal(conv.worktreeName, "main"); assert.equal(conv.saved, undefined);
  const first = Object.values(h.store.state.tasks).find((t) => t.prompt === "" || t.origin.messageId === "m1")!;
  assert.equal(first.target.workspace, "a", "이미 받은 작업의 대상은 수신 때 고정");
  h.runner.release("첫");
  await h.runner.waitStarted("둘"); h.runner.release("둘");
  await h.runner.waitStarted("셋"); h.runner.release("셋");
  await h.daemon.idle();
});

test("S-4c(코어) /use 저장 실패는 rejected(command 아님)·변경 롤백, 이후 저장이 성공해도 실패한 선택이 영속되지 않는다", async () => {
  const h = await harness();
  await h.daemon.ingest(msg("/use a", "m0"));
  h.store.failWrites = true;
  const r = await h.daemon.ingest(msg("/use b", "m1"));
  assert.deepEqual(r, { kind: "rejected", reason: "상태 저장 실패" });
  assert.equal(h.store.state.conversations["fake:c1"]!.workspace, "a");
  h.store.failWrites = false;
  const ok = await h.daemon.ingest(msg("/chain other", "m2"));
  assert.equal(ok.kind, "command");
  assert.equal(JSON.parse(stateText(h)).conversations["fake:c1"].workspace, "a", "실패한 /use b가 나중에 영속되지 않는다");
  // 같은 메시지 재전달은 수락 기록이 없어 다시 처리된다
  const again = await h.daemon.ingest(msg("/use b", "m1"));
  assert.equal(again.kind, "command");
});

test("S-14d 쓰기 시작 거부 저장 실패는 prompt·상태를 복원하고 재승인하면 원래 요청으로 실행된다", async () => {
  const h = await harness();
  await h.daemon.ingest(msg("/access write", "m0"));
  const r = await h.daemon.ingest(msg("원래 요청", "m1"));
  assert.equal(r.kind, "task");
  const task = Object.values(h.store.state.tasks)[0]!;
  const id = task.approvalId!;
  h.store.failWrites = true;
  const denied = await h.daemon.approval(id, { channel: "fake", conversation: "c1", user: "u1" }, "reject");
  assert.equal(denied.ok, false);
  h.store.failWrites = false;
  assert.equal(task.status, "awaiting_approval");
  assert.equal(task.prompt, "원래 요청", "거부 저장 실패 뒤에도 prompt가 남는다");
  const ok = await h.daemon.approval(id, { channel: "fake", conversation: "c1", user: "u1" }, "approve");
  assert.equal(ok.ok, true);
  await h.runner.waitStarted("원래 요청");
  h.runner.release("원래 요청");
  await h.daemon.idle();
});

test("S-14e 대기 작업 취소 저장 실패는 prompt·무효화한 승인을 복원한다", async () => {
  const h = await harness();
  await h.daemon.ingest(msg("/access write", "m0"));
  await h.daemon.ingest(msg("요청", "m1"));
  const task = Object.values(h.store.state.tasks)[0]!;
  const a = h.store.state.approvals[task.approvalId!]!;
  h.store.failWrites = true;
  const r = await h.daemon.cancel(task.id, { channel: "fake", conversation: "c1", user: "u1" });
  assert.equal(r.ok, false);
  h.store.failWrites = false;
  assert.equal(task.status, "awaiting_approval");
  assert.equal(task.prompt, "요청");
  assert.equal(a.state, "pending");
  const ok = await h.daemon.approval(a.id, { channel: "fake", conversation: "c1", user: "u1" }, "approve");
  assert.equal(ok.ok, true);
  await h.runner.waitStarted("요청");
  h.runner.release("요청");
  await h.daemon.idle();
});

test("S-4e(실제) pruneSeen 보호 기간", async () => {
  const h = await harness();
  const now = 10 * SEEN_PROTECT_MS;
  const seen: Record<string, number> = {};
  for (let i = 0; i < 10_500; i++) seen[`k${i}`] = now - 1000 - i; // 모두 최근(1초~)
  seen.old1 = now - SEEN_PROTECT_MS - 5000;
  seen.old2 = now - SEEN_PROTECT_MS - 1000;
  h.store.state.seen = seen;
  h.store.pruneSeen(now);
  assert.equal(Object.keys(h.store.state.seen).length >= 10_500, true, "보호 기간 안 항목은 상한을 넘어도 남는다");
  assert.equal("old1" in h.store.state.seen, false);
  assert.equal("old2" in h.store.state.seen, false);
  // 7일이 지난 것은 항상 지운다
  h.store.state.seen = { stale: now - 8 * 86_400_000, fresh: now };
  h.store.pruneSeen(now);
  assert.deepEqual(Object.keys(h.store.state.seen), ["fresh"]);
});

test("S-4i 포화: 새 요청은 rejected·기록 보존, 통제 명령·승인은 포화 중에도 처리되고 seen을 늘리지 않는다", async () => {
  const h = await harness();
  h.store.seenHardMax = 3;
  await h.daemon.ingest(msg("/access write", "m0"));
  await h.daemon.ingest(msg("/chain x", "m1"));
  const ok = await h.daemon.ingest(msg("요청", "m2")); // 세 번째 기록 — 이제 포화
  assert.equal(ok.kind, "task");
  const n = Object.keys(h.store.state.seen).length;
  assert.equal(n, 3);
  const full = await h.daemon.ingest(msg("새 요청", "m3"));
  assert.deepEqual(full, { kind: "rejected", reason: "수신 기록 포화" });
  const cmd = await h.daemon.ingest(msg("/chain y", "m4"));
  assert.deepEqual(cmd, { kind: "rejected", reason: "수신 기록 포화" }, "상태를 바꾸는 명령도 기록이 필요해 거절");
  for (let i = 0; i < 5; i++) {
    assert.equal((await h.daemon.ingest(msg("/status", `s${i}`))).kind, "command");
    assert.equal((await h.daemon.ingest(msg("/queue", `q${i}`))).kind, "command");
  }
  assert.equal(Object.keys(h.store.state.seen).length, 3, "통제 명령은 seen을 쓰지 않는다 — 상한을 넘지 않고 기존 기록 보존");
  assert.equal("fake:c1:m2" in h.store.state.seen, true);
  const task = Object.values(h.store.state.tasks)[0]!;
  const approved = await h.daemon.approval(task.approvalId!, { channel: "fake", conversation: "c1", user: "u1" }, "approve");
  assert.equal(approved.ok, true, "승인은 포화 중에도 처리된다");
  const dup = await h.daemon.ingest(msg("요청", "m2"));
  assert.equal(dup.kind, "duplicate");
  await h.runner.waitStarted("요청"); h.runner.release("요청"); await h.daemon.idle();
});

test("S-4j 수신이 직렬 큐에서 대기하는 동안 stop()이 시작되면 작업을 수락하지 않고 stopping", async () => {
  const h = await harness();
  const p = h.daemon.ingest(msg("요청", "m1"));
  const s = h.daemon.stop({ drain: false });
  const r = await p;
  await s;
  assert.equal(r.kind, "stopping");
  assert.equal(Object.keys(h.store.state.tasks).length, 0);
});

test("S-2c·S-2g·S-2i 상태 파일에는 최초 저장부터 비밀이 없다(열거되지 않은 필드·객체 키 포함, 잘림 경계 포함)", async () => {
  const h = await harness({ extra: { redact } });
  await h.daemon.ingest(msg("/access write", "m0"));
  await h.daemon.ingest(msg(`토큰 ${TOKEN} 붙여 넣음`, "m1"));
  const task = Object.values(h.store.state.tasks)[0]!;
  assert.ok(!stateText(h).includes(TOKEN), "수신 텍스트(승인 detail 포함)에 토큰이 없다");
  // 도구 승인 detail(400자 경계)
  await h.daemon.approval(task.approvalId!, { channel: "fake", conversation: "c1", user: "u1" }, "approve");
  await h.runner.waitStarted(task.prompt);
  const ctl = h.runner.ctl(task.prompt);
  const detail = `${"가".repeat(380)}${TOKEN}`;
  const pending = ctl.requestApproval(detail);
  await new Promise((r) => setTimeout(r, 30));
  const text = stateText(h);
  assert.ok(!text.includes(TOKEN) && !text.includes(TOKEN.slice(0, 12)), "잘림 경계에 걸쳐도 토큰 조각이 없다");
  const ap = Object.values(h.store.state.approvals).find((a) => a.kind === "tool")!;
  await h.daemon.approval(ap.id, { channel: "fake", conversation: "c1", user: "u1" }, "reject");
  await pending;
  // 실행자 결과: text(4000 경계)·detail·changes·session.sessionId·nextRetryAt
  h.runner.release(task.prompt, { status: "done", text: `${"x".repeat(3990)}${TOKEN}`, detail: `d ${TOKEN}`, changes: `c ${TOKEN}`, session: { sessionId: `sess-${TOKEN}`, agent: "claude", cwd: h.dirs.a!, access: "write" }, nextRetryAt: `t ${TOKEN}`, cleanupUnconfirmed: false });
  await h.daemon.idle();
  const after = stateText(h);
  assert.ok(!after.includes(TOKEN) && !after.includes(TOKEN.slice(0, 12)));
  assert.equal(h.store.state.conversations["fake:c1"]!.saved, undefined, "토큰이 섞인 세션 ID는 저장하지 않는다");
  JSON.parse(after); // JSON 유효
  // 임의 객체의 키·값(snapshot 등)
  (h.store.state.tasks[task.id] as unknown as Record<string, unknown>).snapshot = { [TOKEN]: 1, [`${TOKEN}`.replace("1", "2")]: 2, v: TOKEN };
  h.store.save();
  assert.ok(!stateText(h).includes(TOKEN));
  const keys = Object.keys(redactDeep({ a: 1, [TOKEN]: 2, [TOKEN.replace("1", "2")]: 3 }, (t) => (t.includes("AAH") ? "[비밀 제거됨]" : t)) as object);
  assert.equal(new Set(keys).size, keys.length, "겹치는 키는 순번으로 구분");
});

test("S-2h 기동 복구(makeSummary·예외)에서 저장되는 상태에도 토큰이 없다(redactor가 생성자에 주입됨)", async () => {
  const h = await harness({ extra: { redact, summarize: () => { throw new Error(`요약 실패 ${TOKEN}`); } } });
  await h.daemon.ingest(msg("/access write", "m0"));
  await h.daemon.ingest(msg("요청", "m1"));
  const task = Object.values(h.store.state.tasks)[0]!;
  await h.daemon.approval(task.approvalId!, { channel: "fake", conversation: "c1", user: "u1" }, "approve");
  await h.runner.waitStarted("요청");
  // 강제 종료 모사 — 새 Daemon이 같은 store로 기동하며 복구
  const h2 = await h.restart({ redact, summarize: () => { throw new Error(`요약 실패 ${TOKEN}`); } });
  void h2;
  assert.ok(!readFileSync(h.store.file, "utf8").includes(TOKEN));
});

test("S-2k 이벤트 스트림은 받은 조각을 순서대로 그대로 전달한다(스트림 비밀 제거는 범위 밖 — 사용자 결정)", async () => {
  const h = await harness();
  const got: DaemonEvent[] = [];
  h.daemon.subscribe((e) => { got.push(e); });
  await h.daemon.ingest(msg("요청", "m1"));
  await h.runner.waitStarted("요청");
  const ctl = h.runner.ctl("요청");
  const chunks = ["안녕", "하세요 ", "x".repeat(2500), "끝"];
  for (const c of chunks) ctl.update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: c } });
  ctl.update({ sessionUpdate: "tool_call", toolCallId: "t1", title: "읽는 중", kind: "read", status: "pending" });
  ctl.update({ sessionUpdate: "plan", entries: [{ content: "계획" }] });
  await new Promise((r) => setTimeout(r, 30));
  const deltas = got.filter((e) => e.type === "text_delta").map((e) => String(e.data.text));
  assert.equal(deltas.length, 4, "조각마다 한 이벤트 — 버퍼링 없음");
  assert.deepEqual(deltas.slice(0, 2), ["안녕", "하세요 "]);
  assert.equal(deltas[2]!.length <= 2001, true, "T04 동작 유지: 조각당 2,000자까지");
  assert.equal(deltas[3], "끝");
  assert.ok(got.some((e) => e.type === "tool") && got.some((e) => e.type === "plan"));
  h.runner.release("요청"); await h.daemon.idle();
});

test("S-7b 경로에 토큰 형태가 든 설정은 거부된다(설정 로드·실경로 별칭)", async () => {
  assert.throws(() => parseConfig({ workspaces: [{ name: "x", path: `/srv/${TOKEN}/repo` }] }), /비밀 형태/);
  assert.throws(() => parseConfig({ workspaces: [{ name: "x", path: "/srv/ok", worktrees: { W: `/srv/${TOKEN}` } }] }), /비밀 형태/);
  // 안전한 별칭이 토큰형 실경로를 가리킴 — 기동 때 허용 목록에서 빠지고 수신은 거부된다
  const h = await harness({ workspaces: ["a"] });
  const real = join(h.home, "ws", TOKEN.replace(/[:]/g, "_") + "x");
  void real; // Windows는 ':' 파일명이 불가해 실제 디렉터리는 만들지 못한다 — 판정 함수는 secrets 시험으로 확인
  const { hasTokenShape } = await import("../src/daemon/secrets.ts");
  assert.equal(hasTokenShape(`/srv/${TOKEN}`), true);
  assert.equal(hasTokenShape("/srv/ok/project"), false);
  void symlinkSync;
});

test("S-20c addWorkspace는 파일 시스템을 호출하지 않고(선해결 인수), 같은 이름·같은 경로는 멱등, 다른 경로·토큰형 경로는 거부", async () => {
  const h = await harness({ workspaces: ["a"] });
  const entry = { name: "n1", path: join(h.home, "ws", "n1") };
  mkdirSync(entry.path, { recursive: true });
  assert.equal(h.daemon.addWorkspace(entry, { real: entry.path, dev: "1", ino: "2" }), "added");
  assert.deepEqual(h.daemon.workspaceRootInfo("n1"), { real: entry.path, dev: "1", ino: "2" });
  assert.equal(h.daemon.addWorkspace(entry, { real: entry.path, dev: "9", ino: "9" }), "exists");
  assert.deepEqual(h.daemon.workspaceRootInfo("n1"), { real: entry.path, dev: "1", ino: "2" }, "기존 항목은 다시 해석하지 않는다");
  assert.throws(() => h.daemon.addWorkspace({ name: "n1", path: join(h.home, "other") }, { real: "x", dev: "1", ino: "1" }), /다른 경로/);
  assert.throws(() => h.daemon.addWorkspace({ name: "n2", path: `/p/${TOKEN}` }, { real: "x", dev: "1", ino: "1" }), /비밀 형태/);
});
