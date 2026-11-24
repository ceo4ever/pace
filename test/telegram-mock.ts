import { createServer, type IncomingMessage, type Server } from "node:http";

// Telegram Bot API 모의 서버 — 어댑터는 실제 fetch로 이 서버를 호출한다.
// 공식 문서(core.telegram.org/bots/api, 2026-11-12 확인)로 확정한 의미:
//  · getUpdates: offset보다 작은 update는 "요청 시점에" 삭제(확인)된다. offset 생략 시 가장 오래된 미확인 update부터 준다.
//  · update_id는 일주일 이상 무수신이면 순차가 아니라 무작위로 바뀐다(enqueue에서 id를 직접 줄 수 있다).
//  · 오류 응답은 {ok:false, error_code, description, parameters?:{retry_after}} 형태, 429는 retry_after를 준다.
// [추정] 롱폴링 대기 시간·편집 빈도 한도 같은 수치는 모사하지 않는다(시험은 짧은 대기만 쓴다).

export interface Call { method: string; params: Record<string, unknown>; at: number; files?: { name: string; size: number; text: string }[] }

export interface Fault { status?: number; body?: unknown; times?: number; hang?: boolean; drop?: boolean; delayMs?: number; wait?: Promise<void> }

export class MockTelegram {
  server!: Server;
  port = 0;
  calls: Call[] = [];
  private updates: Record<string, unknown>[] = [];
  private nextUpdateId = 1;
  private nextMessageId = 1000;
  private nextThread: number;
  private faults = new Map<string, Fault>();
  /** 응답을 막고 있는 요청 — close 때 풀어 준다 */
  private hanging = new Set<() => void>();
  /** 마지막으로 받은 getUpdates offset들 */
  offsets: (number | undefined)[] = [];

  constructor(firstThread = 500) { this.nextThread = firstThread; }

  get base(): string { return `http://127.0.0.1:${this.port}`; }

  async start(): Promise<this> {
    this.server = createServer((req, res) => { void this.handle(req, res); });
    await new Promise<void>((r) => this.server.listen(0, "127.0.0.1", () => r()));
    this.port = (this.server.address() as { port: number }).port;
    return this;
  }

  async close(): Promise<void> {
    for (const release of this.hanging) release();
    this.server.closeAllConnections();
    await new Promise<void>((r) => this.server.close(() => r()));
  }

  fault(method: string, f: Fault | null): void { if (f) this.faults.set(method, f); else this.faults.delete(method); }

  /** update를 큐에 넣는다. 반환값은 update_id */
  push(update: Record<string, unknown>, id?: number): number {
    const update_id = id ?? this.nextUpdateId++;
    if (id !== undefined && id >= this.nextUpdateId) this.nextUpdateId = id + 1;
    this.updates.push({ update_id, ...update });
    return update_id;
  }

  /** 텍스트 메시지 update */
  text(chat: number, thread: number | undefined, user: number, text: string, extra: Record<string, unknown> = {}, id?: number): number {
    const message_id = this.nextMessageId++;
    return this.push({ message: { message_id, date: Math.floor(Date.now() / 1000), chat: { id: chat, type: "supergroup" }, from: { id: user, is_bot: false }, text, ...(thread === undefined ? {} : { message_thread_id: thread }), ...extra } }, id);
  }

  callback(chat: number, thread: number | undefined, user: number, data: string, id?: number): number {
    return this.push({ callback_query: { id: `cq${this.nextMessageId++}`, from: { id: user, is_bot: false }, data, message: { message_id: this.nextMessageId++, chat: { id: chat, type: "supergroup" }, ...(thread === undefined ? {} : { message_thread_id: thread }) } } }, id);
  }

  pending(): number { return this.updates.length; }
  sent(method = "sendMessage"): Call[] { return this.calls.filter((c) => c.method === method); }
  texts(): string[] { return this.sent().map((c) => String(c.params.text)); }
  /** 새 메시지와 편집된 메시지의 본문 전부 */
  allTexts(): string[] { return this.calls.filter((c) => c.method === "sendMessage" || c.method === "editMessageText").map((c) => String(c.params.text)); }

  private async body(req: IncomingMessage): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    return Buffer.concat(chunks);
  }

  private async handle(req: IncomingMessage, res: import("node:http").ServerResponse): Promise<void> {
    const url = req.url ?? "";
    const m = /^\/bot[^/]+\/([A-Za-z]+)$/.exec(url);
    const method = m?.[1] ?? "";
    const raw = await this.body(req);
    let params: Record<string, unknown> = {};
    const files: Call["files"] = [];
    const ctype = String(req.headers["content-type"] ?? "");
    if (ctype.includes("application/json")) { try { params = JSON.parse(raw.toString("utf8")) as Record<string, unknown>; } catch { params = {}; } }
    else if (ctype.includes("multipart/form-data")) {
      const text = raw.toString("utf8");
      for (const part of text.split(/--[-\w]+/)) {
        const name = /name="([^"]+)"/.exec(part)?.[1];
        const filename = /filename="([^"]+)"/.exec(part)?.[1];
        const content = part.split(/\r?\n\r?\n/).slice(1).join("\n\n").replace(/\r?\n$/, "");
        if (name && filename) files.push({ name: filename, size: content.length, text: content });
        else if (name) params[name] = content.trim();
      }
    }
    const call: Call = { method, params, at: Date.now(), ...(files.length ? { files } : {}) };
    this.calls.push(call);
    const reply = (status: number, body: unknown): void => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    const f = this.faults.get(method);
    if (f) {
      if (f.times !== undefined) { f.times--; if (f.times <= 0) this.faults.delete(method); }
      if (f.delayMs) await new Promise((r) => setTimeout(r, f.delayMs));
      if (f.wait) await f.wait;
      if (f.hang) { await new Promise<void>((r) => { this.hanging.add(r); }); return; }
      if (f.drop) { res.destroy(); return; }
      if (f.status !== undefined) { reply(f.status, f.body ?? { ok: false, error_code: f.status, description: "mock fault" }); return; }
    }
    switch (method) {
      case "getUpdates": {
        const offset = typeof params.offset === "number" ? params.offset : undefined;
        this.offsets.push(offset);
        if (offset !== undefined) this.updates = this.updates.filter((u) => Number(u.update_id) >= offset); // 요청 시점에 확인(삭제)
        if (this.updates.length === 0) await new Promise((r) => setTimeout(r, 150));
        const out = this.updates.slice(0, Number(params.limit ?? 100));
        reply(200, { ok: true, result: out });
        return;
      }
      case "sendMessage": reply(200, { ok: true, result: { message_id: this.nextMessageId++, chat: { id: params.chat_id } } }); return;
      case "sendDocument": reply(200, { ok: true, result: { message_id: this.nextMessageId++ } }); return;
      case "editMessageText": case "editMessageReplyMarkup": reply(200, { ok: true, result: true }); return;
      case "answerCallbackQuery": case "setMyCommands": case "sendChatAction": reply(200, { ok: true, result: true }); return;
      case "createForumTopic": reply(200, { ok: true, result: { message_thread_id: this.nextThread++, name: params.name } }); return;
      case "getMe": reply(200, { ok: true, result: { id: 1, is_bot: true, username: "mockbot" } }); return;
      case "getChat": reply(200, { ok: true, result: { id: Number(params.chat_id), is_forum: true, title: "시험 포럼" } }); return;
      default: reply(404, { ok: false, error_code: 404, description: "Not Found" });
    }
  }
}
