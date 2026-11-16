import test from "node:test";
import assert from "node:assert/strict";
import { Gateway } from "../src/daemon/gateway.ts";
import { harness } from "./daemon-helpers.ts";
import { maskedFrame, rawSocket, sleep } from "./daemon-proc-helpers.ts";

test("Gateway: 읽지 않는 구독자의 송신 버퍼가 상한을 넘으면 서버가 그 연결을 닫는다(느린 소비자 격리)", async () => {
  const h = await harness();
  const token = "cd".repeat(32);
  const gateway = new Gateway({ daemon: h.daemon, token, port: 0, maxBufferedBytes: 32 * 1024 });
  const port = await gateway.listen();
  await h.daemon.addAdapter(gateway.adapter);
  const conns = (gateway as unknown as { conns: Set<unknown> }).conns;
  const s = await rawSocket(port);
  assert.match(s.status, /101/);
  s.write(maskedFrame(1, Buffer.from(JSON.stringify({ type: "auth", token }))));
  await sleep(100);
  s.write(maskedFrame(1, Buffer.from(JSON.stringify({ type: "subscribe", conversation: "room" }))));
  await sleep(100);
  assert.equal(conns.size, 1);
  s.socket.pause(); // 읽지 않는 클라이언트
  const huge = "y".repeat(190_000);
  let sent = 0;
  const end = Date.now() + 15_000;
  while (Date.now() < end && sent < 500 && conns.size > 0) {
    try { await gateway.adapter.send("room", [{ type: "text", text: huge }]); sent++; } catch { break; }
    await sleep(2);
  }
  for (let i = 0; i < 50 && conns.size > 0; i++) await sleep(100);
  assert.equal(conns.size, 0, `송신 ${sent}회 뒤 서버가 느린 소비자 연결을 정리해야 한다`);
  assert.ok(sent < 500, "무한히 쌓이지 않았다");
  // 코어는 막히지 않고 계속 처리한다
  h.runner.immediate.add("OK");
  assert.equal((await h.daemon.ingest({ channel: "gateway", conversation: "other", user: "gateway:local", messageId: "k1", text: "OK", admin: true })).kind, "task");
  await h.daemon.idle();
  s.socket.destroy();
  await gateway.close();
});

test("Conn: ping 응답도 송신 상한을 거치고, 이번 프레임으로 상한을 넘으면 즉시 닫는다", async () => {
  const { Conn } = await import("../src/daemon/gateway.ts");
  const writes: Buffer[] = [];
  let ended = false;
  const fake = { writableLength: 0, write: (b: Buffer) => { writes.push(b); fake.writableLength += b.length; return true; }, end: () => { ended = true; }, destroy: () => {} };
  const conn = new Conn(fake as never);
  conn.maxBuffered = 300;
  conn.authed = true;
  // 마스킹된 ping(페이로드 100바이트)을 연속으로 보낸다 — 응답이 쌓여 상한(300)을 넘으면 닫힌다
  for (let i = 0; i < 10 && !ended; i++) conn.feed(maskedFrame(9, Buffer.alloc(100, 1)), () => {});
  assert.equal(ended, true, "ping 응답으로도 상한을 넘으면 닫힌다");
  assert.ok(writes.reduce((n, b) => n + b.length, 0) <= 300 + 102, "상한을 크게 넘겨 쓰지 않았다");
  // 한 프레임이 상한보다 크면 쓰기 전에 닫는다
  const fake2 = { writableLength: 0, write: () => true, end: () => { ended = true; }, destroy: () => {} };
  ended = false;
  const big = new Conn(fake2 as never);
  big.maxBuffered = 100;
  big.send({ x: "z".repeat(500) });
  assert.equal(ended, true);
});

test("Gateway: 모든 수신자가 송신을 거부하면 알림 전달은 실패(던짐)해 outbox가 남는다", async () => {
  const h = await harness();
  const token = "ef".repeat(32);
  const gateway = new Gateway({ daemon: h.daemon, token, port: 0, maxBufferedBytes: 2000 });
  const port = await gateway.listen();
  const s = await rawSocket(port);
  s.write(maskedFrame(1, Buffer.from(JSON.stringify({ type: "auth", token }))));
  await sleep(100);
  s.write(maskedFrame(1, Buffer.from(JSON.stringify({ type: "subscribe", conversation: "room" }))));
  await sleep(100);
  await assert.rejects(gateway.adapter.send("room", [{ type: "text", text: "z".repeat(10_000) }]), /연결된 Gateway 클라이언트가 없다/);
  s.socket.destroy();
  await gateway.close();
});
