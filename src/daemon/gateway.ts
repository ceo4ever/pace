import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { Socket } from "node:net";
import { join } from "node:path";
import type { Daemon } from "./core.ts";
import type { ApprovalPrompt, Block, ChannelAdapter, ChannelSink } from "./types.ts";

// Gateway API 골격 (BR04) — 로컬 WebSocket + 토큰 인증. 127.0.0.1만 바인딩, node:http upgrade + RFC6455 부분집합을 직접 구현(의존성 0).
// 프로토콜 부분집합: 클라이언트→서버 프레임은 마스킹 필수·FIN=1 단일 텍스트 프레임·핑/퐁/닫기, 페이로드 ≤1MB·UTF-8 검증. 그 밖은 닫는다.
// 토큰 소지자는 기기 관리자 — 모든 대화의 작업을 보고 취소·승인할 수 있다(토큰 비밀 유지가 전제).

const MAX_PAYLOAD = 1024 * 1024;
const AUTH_TIMEOUT_MS = 5000;
const MAX_UNAUTH = 8;
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

export function gatewayTokenFile(home: string): string { return join(home, "secrets", "gateway-token"); }

/** 토큰 파일을 읽거나 없으면 랜덤으로 만든다(0600). 값은 로그·상태에 쓰지 않는다 */
export function ensureGatewayToken(home: string): string {
  const file = gatewayTokenFile(home);
  if (existsSync(file)) {
    const existing = readFileSync(file, "utf8").trim();
    if (!/^[0-9a-f]{64}$/.test(existing)) throw new Error(`Gateway 토큰 파일이 올바르지 않다(64자리 16진수가 아님): ${file} — 확인 뒤 지우면 새로 만든다`);
    return existing;
  }
  mkdirSync(join(home, "secrets"), { recursive: true, mode: 0o700 });
  const token = randomBytes(32).toString("hex");
  writeFileSync(file, `${token}\n`, { mode: 0o600, flag: "wx" });
  try { chmodSync(file, 0o600); } catch { /* Windows ACL은 미검증 한계 */ }
  return token;
}

function sameToken(a: string, b: string): boolean {
  if (a === "" || b === "") return false;
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

function frame(opcode: number, payload: Buffer): Buffer {
  const n = payload.length;
  const head = n < 126 ? Buffer.from([0x80 | opcode, n]) : n < 65536 ? Buffer.from([0x80 | opcode, 126, n >> 8, n & 255]) : (() => { const b = Buffer.alloc(10); b[0] = 0x80 | opcode; b[1] = 127; b.writeBigUInt64BE(BigInt(n), 2); return b; })();
  return Buffer.concat([head, payload]);
}

const utf8 = new TextDecoder("utf-8", { fatal: true });

/** 시험을 위해 내보낸다(Gateway 밖에서 쓰지 않는다) */
export class Conn {
  readonly socket: Socket;
  authed = false;
  subscription: { unsubscribe: () => void } | null = null;
  /** 이 연결이 받는 대화(없으면 전부) */
  conversation: string | null = null;
  subscribed = false;
  private buf = Buffer.alloc(0);
  closed = false;
  constructor(socket: Socket) { this.socket = socket; }
  maxBuffered = 4 * 1024 * 1024;
  /** 모든 송신은 이 경로를 거친다 — 추가할 프레임 크기까지 포함해 상한을 검사한다 */
  private write(buf: Buffer): boolean {
    if (this.closed) return false;
    if (this.socket.writableLength + buf.length > this.maxBuffered) { this.close(1013, "slow consumer"); return false; }
    try { this.socket.write(buf); return true; } catch { return false; }
  }
  /** 실제로 쓰기를 수락했으면 true — 상한으로 거부하거나 닫힌 연결이면 false */
  send(obj: unknown): boolean {
    return this.write(frame(1, Buffer.from(JSON.stringify(obj), "utf8")));
  }
  close(code: number, reason = ""): void {
    if (this.closed) return;
    this.closed = true;
    const r = Buffer.from(reason, "utf8").subarray(0, 100);
    const payload = Buffer.alloc(2 + r.length);
    payload.writeUInt16BE(code, 0);
    r.copy(payload, 2);
    try { this.socket.end(frame(8, payload)); } catch { /* 이미 닫힘 */ }
    this.subscription?.unsubscribe();
    setTimeout(() => this.socket.destroy(), 200).unref();
  }
  /** 수신 바이트를 프레임으로 파싱한다. 규칙 위반은 close하고 false */
  feed(chunk: Buffer, onText: (text: string) => void): void {
    this.buf = Buffer.concat([this.buf, chunk]);
    if (this.buf.length > MAX_PAYLOAD + 64) { this.close(1009, "too big"); return; }
    for (;;) {
      if (this.closed || this.buf.length < 2) return;
      const b0 = this.buf[0]!, b1 = this.buf[1]!;
      const fin = (b0 & 0x80) !== 0, rsv = b0 & 0x70, opcode = b0 & 0x0f, masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, offset = 2;
      if (rsv !== 0) { this.close(1002, "rsv"); return; }
      if (!masked) { this.close(1002, "unmasked"); return; }
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); offset = 4; }
      else if (len === 127) {
        if (this.buf.length < 10) return;
        const big = this.buf.readBigUInt64BE(2);
        if (big > BigInt(MAX_PAYLOAD)) { this.close(1009, "too big"); return; }
        len = Number(big); offset = 10;
      }
      if (len > MAX_PAYLOAD) { this.close(1009, "too big"); return; }
      if (opcode >= 8 && (len > 125 || !fin)) { this.close(1002, "bad control"); return; }
      if (this.buf.length < offset + 4 + len) return;
      const mask = this.buf.subarray(offset, offset + 4);
      const data = Buffer.from(this.buf.subarray(offset + 4, offset + 4 + len));
      for (let i = 0; i < data.length; i++) data[i] = data[i]! ^ mask[i % 4]!;
      this.buf = this.buf.subarray(offset + 4 + len);
      if (opcode === 8) { this.close(1000); return; }
      if (opcode === 9) { this.write(frame(10, data)); continue; }
      if (opcode === 10) continue;
      if (opcode !== 1 || !fin) { this.close(1003, "text only, no fragments"); return; }
      let text: string;
      try { text = utf8.decode(data); } catch { this.close(1007, "bad utf8"); return; }
      onText(text);
    }
  }
}

export interface GatewayOptions { daemon: Daemon; token: string; port: number; log?: (event: string, fields?: Record<string, unknown>) => void; /** 연결별 송신 버퍼 상한(바이트) — 넘으면 느린 소비자로 보고 닫는다 */ maxBufferedBytes?: number }

export class Gateway {
  private readonly o: GatewayOptions;
  private server: Server | null = null;
  private readonly conns = new Set<Conn>();
  readonly adapter: ChannelAdapter;
  port = 0;

  constructor(options: GatewayOptions) {
    this.o = options;
    const self = this;
    this.adapter = {
      name: "gateway",
      caps: { maxLength: 200_000, canEdit: false, buttons: false, richBlocks: true, commandPrefix: "/" },
      async connect(_sink: ChannelSink) {},
      async disconnect() {},
      async send(conversation: string, blocks: Block[]) { return self.deliver(conversation, { type: "message", conversation, blocks }); },
      async askApproval(conversation: string, prompt: ApprovalPrompt) { self.deliver(conversation, { type: "approval_request", conversation, prompt }); },
    };
  }

  /** 대화를 구독한 인증 연결에 보낸다. 받는 연결이 없으면 던진다(알림이 outbox에 남도록) */
  private deliver(conversation: string, payload: unknown): null {
    let n = 0;
    for (const c of this.conns) {
      if (!c.authed || !c.subscribed || (c.conversation !== null && c.conversation !== conversation)) continue;
      if (c.send(payload)) n++;
    }
    if (n === 0) throw new Error("연결된 Gateway 클라이언트가 없다");
    return null;
  }

  async listen(): Promise<number> {
    const server = createServer((_req, res) => { res.writeHead(404); res.end(); });
    server.on("upgrade", (req: IncomingMessage, socket: Socket) => this.upgrade(req, socket));
    this.server = server;
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(this.o.port, "127.0.0.1", () => resolve()); });
    this.port = (server.address() as { port: number }).port;
    return this.port;
  }

  async close(): Promise<void> {
    for (const c of this.conns) c.close(1001, "going away");
    await new Promise<void>((resolve) => { if (!this.server) return resolve(); this.server.close(() => resolve()); setTimeout(resolve, 500).unref(); });
  }

  private reject(socket: Socket, status: string): void {
    try { socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); } catch { /* 닫힘 */ }
  }

  private upgrade(req: IncomingMessage, socket: Socket): void {
    // 브라우저 발(Origin 헤더가 있는) 연결은 거부한다 — 다른 사이트가 로컬 Gateway에 붙지 못하게
    if (req.headers.origin !== undefined) return this.reject(socket, "403 Forbidden");
    const key = req.headers["sec-websocket-key"];
    if (typeof key !== "string" || req.headers.upgrade?.toLowerCase() !== "websocket" || req.headers["sec-websocket-version"] !== "13") return this.reject(socket, "400 Bad Request");
    if ([...this.conns].filter((c) => !c.authed).length >= MAX_UNAUTH) return this.reject(socket, "503 Service Unavailable");
    const accept = createHash("sha1").update(key + GUID).digest("base64");
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const conn = new Conn(socket);
    if (this.o.maxBufferedBytes !== undefined) conn.maxBuffered = this.o.maxBufferedBytes;
    this.conns.add(conn);
    const timer = setTimeout(() => { if (!conn.authed) conn.close(1008, "auth timeout"); }, AUTH_TIMEOUT_MS);
    timer.unref();
    socket.on("data", (chunk: Buffer) => conn.feed(chunk, (text) => { void this.onMessage(conn, text); }));
    socket.on("error", () => { /* 닫힘 처리는 close에서 */ });
    socket.on("close", () => { clearTimeout(timer); conn.closed = true; conn.subscription?.unsubscribe(); this.conns.delete(conn); });
  }

  private async onMessage(conn: Conn, text: string): Promise<void> {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(text) as Record<string, unknown>; } catch { conn.send({ type: "error", error: "JSON이 아니다" }); return; }
    if (typeof msg !== "object" || msg === null || typeof msg.type !== "string") { conn.send({ type: "error", error: "type이 필요하다" }); return; }
    if (!conn.authed) {
      if (msg.type !== "auth" || typeof msg.token !== "string" || !sameToken(msg.token, this.o.token)) { conn.close(1008, "unauthorized"); return; }
      conn.authed = true;
      conn.send({ type: "ready", device: "daemon", bootId: this.o.daemon.bootId });
      return;
    }
    const id = msg.id;
    const reply = (obj: Record<string, unknown>) => conn.send({ ...obj, id });
    const admin = { channel: "gateway", conversation: "*", user: "gateway:local", admin: true } as const;
    switch (msg.type) {
      case "send": {
        if (typeof msg.conversation !== "string" || typeof msg.text !== "string" || msg.conversation === "") { reply({ type: "error", error: "conversation·text가 필요하다" }); return; }
        const messageId = typeof msg.messageId === "string" && msg.messageId !== "" ? msg.messageId : randomBytes(8).toString("hex");
        const result = await this.o.daemon.ingest({ channel: "gateway", conversation: msg.conversation, user: "gateway:local", messageId, text: msg.text, admin: true });
        reply({ type: "ack", result });
        return;
      }
      case "cancel": {
        if (typeof msg.taskId !== "string") { reply({ type: "error", error: "taskId가 필요하다" }); return; }
        reply({ type: "ack", result: await this.o.daemon.cancel(msg.taskId, admin) });
        return;
      }
      case "approve": {
        if (typeof msg.approvalId !== "string" || (msg.decision !== "approve" && msg.decision !== "reject")) { reply({ type: "error", error: "approvalId·decision이 필요하다" }); return; }
        reply({ type: "ack", result: await this.o.daemon.approval(msg.approvalId, admin, msg.decision) });
        return;
      }
      case "release": {
        if (typeof msg.path !== "string") { reply({ type: "error", error: "path가 필요하다" }); return; }
        reply({ type: "ack", result: { ok: await this.o.daemon.release(msg.path) } });
        return;
      }
      case "subscribe": {
        conn.subscription?.unsubscribe();
        conn.conversation = typeof msg.conversation === "string" ? msg.conversation : null;
        const taskId = typeof msg.taskId === "string" ? msg.taskId : null;
        const conversation = conn.conversation;
        const sub = this.o.daemon.subscribe((event) => { conn.send({ type: "event", event }); }, (e) => (taskId === null || e.taskId === taskId) && (conversation === null || e.conversation === conversation || e.conversation === null));
        conn.subscription = sub;
        conn.subscribed = true;
        reply({ type: "ack", result: { ok: true } });
        void this.o.daemon.flushOutbox();
        return;
      }
      default:
        reply({ type: "error", error: `알 수 없는 type: ${String(msg.type)}` });
    }
  }
}
