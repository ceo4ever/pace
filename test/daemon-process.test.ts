import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { instancePort, readLockInfo } from "../src/daemon/instance.ts";
import { daemonHome, maskedFrame, rawSocket, sleep, startFixtureDaemon, startRealDaemon, tokenOf, waitReady, wsConnect } from "./daemon-proc-helpers.ts";
import { runPace } from "./helpers.ts";

const stateOf = (home: string) => JSON.parse(readFileSync(join(home, "daemon", "state.json"), "utf8")) as { tasks: Record<string, any>; approvals: Record<string, any>; quarantine: Record<string, any>; outbox: any[]; seen: Record<string, number> };
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

test("S-14·S-26 두 번째 `pace daemon run`은 실패(종료 2)하고, 소유자가 죽으면 즉시 기동된다", async () => {
  const { home } = daemonHome();
  const first = startRealDaemon(home);
  await waitReady(home, first);
  const second = runPace(["daemon", "run"], { home, timeout: 15_000 });
  assert.equal(second.status, 2, second.stderr);
  assert.match(second.stderr, /이미 실행 중/);
  assert.ok(readLockInfo(home)?.pid === first.child.pid, "정보 파일은 첫 소유자의 것");
  first.kill();
  await first.exited;
  const third = startRealDaemon(home);
  await waitReady(home, third); // 잠금 정보 파일이 남아 있어도 인계 판정 없이 포트만으로 기동
  third.kill();
  await third.exited;
});

test("S-29 동시에 여러 번 기동해도 정확히 하나만 남는다", async () => {
  const { home } = daemonHome();
  const procs = [0, 1, 2, 3].map(() => startRealDaemon(home));
  const codes = await Promise.race([
    Promise.all(procs.map((p) => Promise.race([p.exited, sleep(6000).then(() => "alive" as const)]))),
    sleep(20_000).then(() => []),
  ]);
  const survivors = procs.filter((_, i) => codes[i] === "alive");
  assert.equal(survivors.length, 1, `생존 ${survivors.length}: ${JSON.stringify(codes)}`);
  assert.equal(codes.filter((c) => c === 2).length, 3);
  survivors[0]!.kill();
  await survivors[0]!.exited;
});

test("S-16 Gateway: 토큰 인증, 메시지 송신·이벤트 구독·승인·취소 왕복", async () => {
  const { home, dirs } = daemonHome();
  const d = startFixtureDaemon(home);
  const port = await waitReady(home, d);
  // 잘못된 토큰·인증 전 다른 메시지·지연
  const bad = await wsConnect(port, null);
  bad.send({ type: "auth", token: "wrong" });
  assert.equal(await bad.closed, 1008);
  const early = await wsConnect(port, null);
  early.send({ type: "send", conversation: "x", text: "hi" });
  assert.equal(await early.closed, 1008);
  // Origin이 있는 연결(브라우저 발)은 거부
  const origin = await rawSocket(port, { Origin: "http://evil.example" });
  assert.match(origin.status, /403/);
  // 정상 흐름
  const c = await wsConnect(port, tokenOf(home));
  c.send({ type: "subscribe", conversation: "room", id: 1 });
  await c.next((m) => m.type === "ack" && m.id === 1);
  c.send({ type: "send", conversation: "room", text: "안녕", messageId: "m1", id: 2 });
  const ack = await c.next((m) => m.type === "ack" && m.id === 2);
  assert.equal(ack.result.kind, "task");
  await c.next((m) => m.type === "event" && m.event.type === "final");
  const msgDone = await c.next((m) => m.type === "message" && JSON.stringify(m.blocks).includes("ok:안녕"));
  assert.ok(msgDone);
  // 같은 수신 ID 재전송 → duplicate
  c.send({ type: "send", conversation: "room", text: "안녕", messageId: "m1", id: 3 });
  assert.equal((await c.next((m) => m.id === 3)).result.kind, "duplicate");
  // 쓰기: 승인 요청 → 승인 → 실행
  c.send({ type: "send", conversation: "room", text: "/access write", messageId: "m2" });
  c.send({ type: "send", conversation: "room", text: "쓰기 작업", messageId: "m3", id: 4 });
  const req = await c.next((m) => m.type === "approval_request");
  c.send({ type: "approve", approvalId: req.prompt.id, decision: "approve", id: 5 });
  assert.equal((await c.next((m) => m.id === 5)).result.ok, true);
  await c.next((m) => m.type === "event" && m.event.type === "final" && m.event.data.status === "done");
  // 취소: 오래 걸리는 작업
  c.send({ type: "send", conversation: "room", text: "/access read-only", messageId: "m4" });
  c.send({ type: "send", conversation: "room", text: "sleep:20000", messageId: "m5", id: 6 });
  const task = (await c.next((m) => m.id === 6)).result.taskId as string;
  await c.next((m) => m.type === "event" && m.event.type === "status" && m.event.data.status === "running");
  c.send({ type: "cancel", taskId: task, id: 7 });
  assert.equal((await c.next((m) => m.id === 7)).result.ok, true);
  await c.next((m) => m.type === "event" && m.event.type === "final" && m.event.data.status === "cancelled");
  void dirs;
  c.close();
  d.kill();
  await d.exited;
});

test("Gateway: 인증 시간 초과·미인증 연결 상한", async () => {
  const { home } = daemonHome();
  const d = startFixtureDaemon(home);
  const port = await waitReady(home, d);
  const idle = await wsConnect(port, null);
  const code = await Promise.race([idle.closed, sleep(8000).then(() => -1)]);
  assert.equal(code, 1008, "5초 안에 인증하지 않으면 닫힌다");
  const held = [];
  for (let i = 0; i < 8; i++) held.push(await rawSocket(port));
  assert.ok(held.every((h) => /101/.test(h.status)));
  const ninth = await rawSocket(port);
  assert.match(ninth.status, /503/);
  for (const h of held) h.socket.destroy();
  d.kill();
  await d.exited;
});

test("S-27 Gateway: 마스킹 없음·분할·잘못된 opcode·비 UTF-8·과대 프레임은 닫는다", async () => {
  const { home } = daemonHome();
  const d = startFixtureDaemon(home);
  const port = await waitReady(home, d);
  const cases: [string, (s: Awaited<ReturnType<typeof rawSocket>>) => void, number][] = [
    ["마스킹 없음", (s) => s.write(Buffer.from([0x81, 0x02, 0x68, 0x69])), 1002],
    ["분할 프레임", (s) => s.write(maskedFrame(1, Buffer.from("{}"), false)), 1003],
    ["바이너리 opcode", (s) => s.write(maskedFrame(2, Buffer.from("{}"))), 1003],
    ["비 UTF-8", (s) => s.write(maskedFrame(1, Buffer.from([0xff, 0xfe, 0xfd]))), 1007],
    ["과대 길이", (s) => s.write(Buffer.from([0x81, 0xff, 0, 0, 0, 0, 0x01, 0, 0, 0x01, 0, 0, 0, 0])), 1009],
  ];
  for (const [name, act, expected] of cases) {
    const s = await rawSocket(port);
    assert.match(s.status, /101/, name);
    act(s);
    assert.equal(await s.closedCode(), expected, name);
    s.socket.destroy();
  }
  d.kill();
  await d.exited;
});

test("S-12·S-11·S-31 강제 종료 복구(실제 프로세스): 읽기→interrupted, 쓰기→needs_review, 승인 대기→expired, 재실행 없음, 중복 제거 유지, 자손 회수(POSIX)", async () => {
  const { home } = daemonHome();
  const d1 = startFixtureDaemon(home);
  const port = await waitReady(home, d1);
  const c = await wsConnect(port, tokenOf(home));
  c.send({ type: "subscribe", id: 0 });
  await c.next((m) => m.id === 0);
  c.send({ type: "send", conversation: "rd", text: "sleep:60000", messageId: "R", id: 1 });
  c.send({ type: "send", conversation: "wr", text: "/use b", messageId: "u1" });
  c.send({ type: "send", conversation: "wr", text: "/access write", messageId: "u2" });
  c.send({ type: "send", conversation: "wr", text: "sleep:60000", messageId: "W", id: 2 });
  const req = await c.next((m) => m.type === "approval_request");
  c.send({ type: "approve", approvalId: req.prompt.id, decision: "approve", id: 3 });
  await c.next((m) => m.id === 3);
  c.send({ type: "send", conversation: "ap", text: "/use c", messageId: "u3" });
  c.send({ type: "send", conversation: "ap", text: "/access write", messageId: "u4" });
  c.send({ type: "send", conversation: "ap", text: "승인 대기 작업", messageId: "A", id: 4 });
  await c.next((m) => m.id === 4);
  // 두 sleeper가 뜰 때까지
  const end = Date.now() + 10_000;
  let pids: number[] = [];
  while (Date.now() < end) { pids = Object.values(stateOf(home).tasks).filter((t) => t.status === "running").flatMap((t) => t.procs.map((p: any) => p.pid)); if (pids.length === 2) break; await sleep(50); }
  assert.equal(pids.length, 2, "읽기·쓰기 작업의 자식 pid가 기록돼 있다");
  d1.kill(); // 강제 종료
  await d1.exited;
  if (process.platform !== "win32") {
    const t0 = Date.now();
    while (pids.some(alive) && Date.now() - t0 < 6000) await sleep(100);
    assert.ok(!pids.some(alive), "독립 감시자가 daemon 사망 뒤 자손 그룹을 회수했다");
  }
  const d2 = startFixtureDaemon(home);
  const port2 = await waitReady(home, d2);
  const s = stateOf(home);
  const by = (id: string) => Object.values(s.tasks).find((t) => t.origin.messageId === id)!;
  assert.equal(by("R").status, "interrupted");
  assert.equal(by("W").status, "needs_review");
  assert.equal(by("A").status, "expired");
  assert.ok(Object.values(s.approvals).every((a) => a.state !== "pending"), "이전 승인은 무효");
  // 재실행 없음 — 실행 중 작업이 없고 새 sleeper가 없다
  assert.equal(Object.values(s.tasks).filter((t) => t.status === "running").length, 0);
  if (process.platform !== "win32") {
    assert.equal(Object.keys(s.quarantine).length, 0, "회수가 증명돼 격리가 자동 해제된다");
    assert.ok(by("W").summary, "요약이 만들어졌다");
  } else {
    assert.ok(Object.keys(s.quarantine).length > 0, "Windows는 회수를 증명하지 못해 격리가 남는다(기록)");
  }
  // 알림은 구독하면 받는다(한 번)
  const c2 = await wsConnect(port2, tokenOf(home));
  c2.send({ type: "subscribe", conversation: "wr", id: 9 });
  await c2.next((m) => m.id === 9);
  const notice = await c2.next((m) => m.type === "message" && JSON.stringify(m.blocks).includes("확인이 필요"));
  assert.ok(notice);
  // 수신 중복 제거 유지
  c2.send({ type: "send", conversation: "rd", text: "sleep:60000", messageId: "R", id: 10 });
  assert.equal((await c2.next((m) => m.id === 10)).result.kind, "duplicate");
  d2.kill();
  await d2.exited;
});

test("S-13 `pace daemon stop`: drain — 실행 중 작업이 끝난 뒤 정지하고 대기는 표시된다", async () => {
  const { home } = daemonHome({ maxConcurrent: 1 });
  const d = startFixtureDaemon(home);
  const port = await waitReady(home, d);
  const c = await wsConnect(port, tokenOf(home));
  c.send({ type: "send", conversation: "rd", text: "sleep:3000", messageId: "RUN", id: 1 });
  c.send({ type: "send", conversation: "rd", text: "대기 작업", messageId: "WAIT", id: 2 });
  await c.next((m) => m.id === 2);
  await c.next((m) => m.type === "ack" && m.id === 1);
  await sleep(300);
  const stop = runPace(["daemon", "stop"], { home, timeout: 40_000 });
  assert.equal(stop.status, 0, stop.stderr + stop.stdout);
  await d.exited;
  const s = stateOf(home);
  const by = (id: string) => Object.values(s.tasks).find((t) => t.origin.messageId === id)!;
  assert.equal(by("RUN").status, "done");
  assert.equal(by("WAIT").status, "interrupted");
  assert.ok(!existsSync(join(home, "daemon", "stop-request")));
  const status = runPace(["daemon", "status"], { home });
  assert.equal(status.status, 3, "정지 뒤 status는 실행 중이 아님");
  void instancePort; void writeFileSync;
});

test("`pace daemon status`·`logs`는 실행 중 daemon을 보여 주고 시크릿을 노출하지 않는다", async () => {
  const { home } = daemonHome();
  const d = startFixtureDaemon(home);
  const port = await waitReady(home, d);
  const st = runPace(["daemon", "status"], { home });
  assert.equal(st.status, 0, st.stderr);
  const parsed = JSON.parse(st.stdout);
  assert.equal(parsed.running, true);
  assert.equal(parsed.status.gatewayPort, port);
  assert.ok(!st.stdout.includes(tokenOf(home)));
  const logs = runPace(["daemon", "logs", "-n", "5"], { home });
  assert.match(logs.stdout, /started/);
  assert.ok(!logs.stdout.includes(tokenOf(home)));
  d.kill();
  await d.exited;
});
