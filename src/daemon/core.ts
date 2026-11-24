import { randomBytes } from "node:crypto";
import { realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { changedParts, summarizeChange, takeSnapshot, type Snapshot } from "../agent/snapshot.ts";
import type { DaemonConfig, WorkspaceEntry } from "./config.ts";
import { hasTokenShape, type Redactor } from "./secrets.ts";
import { StateStore } from "./store.ts";
import { approvedWorkspaceRoot, persistRegisteredWorkspace, sameWorkspaceRoot, WorkspaceError, workspaceErrorText, type WorkspaceAddRequest } from "./workspace.ts";
import {
  ACTIVE_STATUSES,
  type Access, type Actor, type Approval, type ApprovalKind, type ApprovalPrompt, type Block, type ChannelAdapter, type ChannelCaps, type ChannelSink, type Conversation,
  type DaemonEvent, type Inbound, type IngestResult, type Notice, type ProcRef, type QuarantineEntry, type RunCtl, type RunResult, type Runner, type Target, type Task, type TaskStatus,
} from "./types.ts";

// daemon 코어 (P035 T04, BR04) — 채널 무관. 모든 상태 변경은 단일 직렬 처리기(tx)를 거치고, 긴 작업(실행·준비·승인 대기)은
// 처리기 밖에서 돌다가 이벤트로 다시 들어온다. 안전 원칙: 판정이 불확실하면 시작하지 않고, 쓰기는 승인 뒤에만, 재시작 뒤 자동 재실행 없음.

export interface DaemonOptions {
  config: DaemonConfig;
  home?: string;
  store: StateStore;
  runner: Runner;
  bootId?: string;
  now?: () => number;
  /** 이전 기동에서 남은 실행의 회수를 확인한다 — 증명하지 못하면 unconfirmed */
  reap?: (task: Task) => Promise<"confirmed" | "unconfirmed">;
  snapshot?: (cwd: string) => Promise<Snapshot> | Snapshot;
  summarize?: (cwd: string, before: Snapshot) => Promise<string> | string;
  log?: (event: string, fields?: Record<string, unknown>) => void;
  sweepMs?: number;
  prepareTimeoutMs?: number;
  eventQueueLimit?: number;
  /** 상태·알림에 들어가는 외부 유래 문자열의 비밀 제거(생성자 주입 — 기동 복구 단계에도 적용) */
  redact?: Redactor;
  /** 진행 표시 편집 최소 간격(ms) */
  progressEditMs?: number;
}

const EXCERPT = 4000;

/** 명령 안내 — 명령 하나당 한 줄 `/명령 `<인자>` — 설명`(마크다운: 채널이 서식을 지원하면 굵게·코드로 보인다) */
const CORE_HELP = [
  "**명령**",
  "/status — 현황(LLM 없이 즉시)",
  "/queue — 진행·대기 작업 표",
  "/cancel `<작업 ID>` — 작업 취소",
  "/use `<워크스페이스[/워크트리]>` — 대상 바꾸기",
  "/chain `<이름>` — 체인 바꾸기",
  "/access `read-only|write` — 접근 기본값",
  "/approve `<승인 ID>` — 승인",
  "/deny `<승인 ID>` — 거부",
  "/help — 이 도움말",
  "",
  "그 밖의 문장은 에이전트에게 보내는 질문입니다.",
].join("\n");
const TERMINAL: TaskStatus[] = ["done", "failed", "cancelled", "handoff", "handoff_acknowledged", "interrupted", "needs_review", "denied", "expired"];

/** 잠금 비교 키 — realpath를 resolve하고 win32는 소문자·역슬래시로 통일 */
export function lockKeyOf(path: string): string {
  const p = resolve(path);
  return process.platform === "win32" ? p.replace(/\//g, "\\").toLowerCase() : p;
}

export function pathsRelated(a: string, b: string): boolean {
  const within = (x: string, y: string): boolean => {
    const rel = relative(x, y);
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  };
  return within(a, b) || within(b, a);
}

function excerpt(text: string, max = EXCERPT): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export class Subscription {
  private queue: DaemonEvent[] = [];
  private busy = false;
  dropped = 0;
  private readonly fn: (event: DaemonEvent) => void | Promise<void>;
  readonly filter: (event: DaemonEvent) => boolean;
  private readonly limit: number;
  constructor(fn: (event: DaemonEvent) => void | Promise<void>, filter: (event: DaemonEvent) => boolean, limit: number) {
    this.fn = fn; this.filter = filter; this.limit = limit;
  }
  push(event: DaemonEvent): void {
    if (!this.filter(event)) return;
    if (this.queue.length >= this.limit) { this.dropped++; return; }
    this.queue.push(event);
    void this.drain();
  }
  private async drain(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.queue.length > 0) {
        const event = this.queue.shift()!;
        try { await this.fn(event); } catch { /* 소비자 오류는 코어를 깨지 않는다 */ }
      }
    } finally { this.busy = false; }
  }
}

function toText(block: Block): string {
  switch (block.type) {
    case "text": return block.text;
    case "table": return [block.header.join(" | "), ...block.rows.map((r) => r.join(" | "))].join("\n");
    case "code": return `\`\`\`${block.lang ?? ""}\n${block.text}\n\`\`\``;
    case "diff": return `\`\`\`diff\n${block.text}\n\`\`\``;
    case "file": return `[파일] ${block.name ?? block.path}`;
    case "card": return `${block.title}\n${block.text}`;
    case "chart": return `[차트] ${block.title}`;
  }
}

/** 채널 능력에 맞게 블록을 내린다 — 리치 미지원이면 텍스트, 길이 상한 초과는 잘라 표시 */
export function renderForCaps(blocks: Block[], caps: ChannelCaps): Block[] {
  const fit = (text: string): string => (text.length > caps.maxLength ? `${text.slice(0, Math.max(0, caps.maxLength - 12))}…(잘림)` : text);
  return blocks.map((b) => {
    if (caps.richBlocks && b.type !== "text") return b;
    return { type: "text", text: fit(toText(b)) } as Block;
  });
}

export class Daemon implements ChannelSink {
  readonly bootId: string;
  private readonly o: DaemonOptions;
  private readonly now: () => number;
  private readonly adapters = new Map<string, ChannelAdapter>();
  private txq: Promise<unknown> = Promise.resolve();
  private readonly controllers = new Map<string, AbortController>();
  private readonly runs = new Map<string, Promise<void>>();
  private readonly toolWaiters = new Map<string, (ok: boolean) => void>();
  private readonly progressRefs = new Map<string, string | null>();
  private readonly queueNotified = new Set<string>();
  private readonly progressChain = new Map<string, Promise<unknown>>();
  private readonly progressClosed = new Set<string>();
  private readonly progressLast = new Map<string, number>();
  private readonly progressPending = new Map<string, string>();
  private readonly drainAborted = new Set<string>();
  private readonly subs = new Set<Subscription>();
  private seq = 0;
  private stopping = false;
  private sweeper: NodeJS.Timeout | null = null;
  readonly stats = { rejectedUsers: 0, duplicates: 0 };
  /** 기동 때 확정한 허용 경로(실경로·식별자) — 요청 때 현재 링크 목적지를 새 대상으로 받아들이지 않는다 */
  private allowedRoots = new Map<string, { real: string; dev: string; ino: string }>();

  constructor(options: DaemonOptions) {
    this.o = options;
    if (options.redact) options.store.redact = options.redact;
    this.reloadAllowed();
    this.bootId = options.bootId ?? randomBytes(8).toString("hex");
    this.now = options.now ?? Date.now;
  }

  /** 설정의 워크스페이스·워크트리 경로를 다시 확정한다(기동 때 한 번, 설정을 바꿀 때) */
  reloadAllowed(): void {
    this.allowedRoots = new Map();
    for (const ws of this.o.config.workspaces) {
      const problem = this.workspaceProblem(ws);
      if (problem) { this.log("workspace_excluded", { workspace: ws.name, reason: problem }); continue; }
      for (const [name, path] of Object.entries(ws.worktrees)) {
        try {
          const real = realpathSync.native(path);
          const st = statSync(real, { bigint: true });
          if (st.isDirectory() && !hasTokenShape(real)) this.allowedRoots.set(`${ws.name}/${name}`, { real, dev: String(st.dev), ino: String(st.ino) });
        } catch { /* 기동 때 확인되지 않은 경로는 허용 목록에 없다 */ }
      }
    }
  }

  private workspaceProblem(entry: WorkspaceEntry): string | null {
    if (!entry.registryId) return null;
    if (!this.o.home) return "전역 등록부 위치를 확인할 수 없다";
    try {
      const root = approvedWorkspaceRoot(this.o.home, entry);
      const expected = this.allowedRoots.get(`${entry.name}/main`);
      return expected && !sameWorkspaceRoot(root, expected) ? "승인한 디렉터리가 바뀌었다 — workspace add로 다시 승인한다" : null;
    } catch (error) { return workspaceErrorText(error); }
  }

  /** 비밀 제거 — 길이 자르기보다 먼저 적용한다(잘린 토큰 조각이 남지 않게) */
  scrub(text: string): string { return this.o.redact ? this.o.redact(text) : text; }
  private clean(text: string, max = EXCERPT): string { return excerpt(this.scrub(text), max); }

  private get state() { return this.o.store.state; }
  private log(event: string, fields: Record<string, unknown> = {}): void { this.o.log?.(event, fields); }

  private tx<T>(fn: () => T | Promise<T>): Promise<T> {
    const run = this.txq.then(fn);
    this.txq = run.catch(() => undefined);
    return run;
  }

  // ---- 수명 ----

  /** 기동 직후: 이전 기동의 비종료 작업을 정리하고(자동 재실행 없음) 회수를 확인한다. 어댑터 연결 전에 부른다 */
  async start(): Promise<void> {
    const recovered = await this.tx(() => this.recoverLocked());
    await this.verifyQuarantines(recovered);
    this.sweeper = setInterval(() => { void this.tx(() => this.sweepApprovalsLocked()); }, this.o.sweepMs ?? 1000);
    this.sweeper.unref();
  }

  private recoverLocked(): string[] {
    const s = this.state;
    const t = this.now();
    const ran: string[] = [];
    for (const task of Object.values(s.tasks)) {
      if (!ACTIVE_STATUSES.includes(task.status) || task.bootId === this.bootId) continue;
      const write = task.target.access === "write";
      if (task.status === "running") {
        // 접근과 무관하게 격리를 먼저 영속한다 — 복구 도중 다시 죽어도 회수 의무가 이어진다
        const key = lockKeyOf(task.target.worktree);
        s.quarantine[key] = { key, worktree: task.target.worktree, since: t, reason: "이전 기동에서 실행 중이던 작업의 회수 미확인", taskId: task.id };
        task.status = write ? "needs_review" : "interrupted";
        task.summaryPending = write;
        task.note = "daemon 강제 종료로 중단됨 — 자동 재실행하지 않음";
        ran.push(task.id);
      } else if (task.status === "awaiting_approval") {
        task.status = "expired";
        task.note = "daemon 재시작으로 승인 대기가 만료됨";
      } else {
        task.status = "interrupted";
        task.note = "daemon 재시작으로 시작하지 못함 — 다시 요청해야 한다";
      }
      task.prompt = "";
      task.updatedAt = t;
      this.enqueueNotice(task, this.recoveryText(task));
    }
    for (const a of Object.values(s.approvals)) if (a.state === "pending") { a.state = "invalidated"; a.decidedAt = t; }
    this.o.store.save();
    this.log("recovered", { running: ran.length });
    return ran;
  }

  private recoveryText(task: Task): string {
    const id = task.id;
    if (task.status === "needs_review") return `⚠ 작업 \`${id}\`가 daemon 강제 종료로 중단됐습니다. 쓰기 작업이라 자동 재실행하지 않았고 변경 여부 확인이 필요합니다(상태: 확인 필요).`;
    if (task.status === "expired") return `작업 \`${id}\`의 승인 대기가 daemon 재시작으로 만료됐습니다. 필요하면 다시 요청해 주세요.`;
    return `작업 \`${id}\`가 daemon 재시작으로 중단됐습니다. 자동 재실행하지 않았으니 필요하면 다시 요청해 주세요.`;
  }

  /** 격리 중인 경로의 회수를 확인한다 — 확인되면 자동 해제하고 쓰기 작업의 변경 요약을 만든다 */
  private async verifyQuarantines(_recovered: string[]): Promise<void> {
    const reap = this.o.reap ?? (async () => "unconfirmed" as const);
    for (const entry of Object.values(this.state.quarantine)) {
      const task = this.state.tasks[entry.taskId];
      let verdict: "confirmed" | "unconfirmed" = "unconfirmed";
      if (task) { try { verdict = await reap(task); } catch { verdict = "unconfirmed"; } }
      if (verdict === "confirmed") {
        await this.tx(() => { delete this.state.quarantine[entry.key]; this.o.store.save(); this.log("quarantine_released", { task: entry.taskId, by: "reap" }); });
      } else {
        this.log("quarantine_kept", { task: entry.taskId });
      }
    }
    // 요약은 회수 확인 뒤에만 — 격리가 남아 있는 작업은 "요약 대기"로 다음 기동에서 다시 시도한다
    for (const task of Object.values(this.state.tasks)) {
      if (!task.summaryPending || this.state.quarantine[lockKeyOf(task.target.worktree)]) continue;
      const summary = await this.makeSummary(task);
      await this.tx(() => { task.summary = summary; task.summaryPending = false; this.o.store.save(); });
    }
  }

  private async makeSummary(task: Task): Promise<string> {
    if (!task.snapshot) return "변경 요약 못 함(시작 스냅샷 없음)";
    try {
      if (this.o.summarize) return this.clean(await this.o.summarize(task.target.worktree, task.snapshot as Snapshot), 2000);
      const before = task.snapshot as Snapshot;
      const after = takeSnapshot(task.target.worktree);
      const parts = changedParts(before, after);
      if (parts.length === 0) return "관찰한 범위에서 변경 미검출";
      const sum = summarizeChange(task.target.worktree, before, after);
      return this.clean(`변경: ${sum.changed.join(", ")}${sum.commits.length ? `\n커밋: ${sum.commits.join("; ")}` : ""}${sum.diff_stat ? `\n${sum.diff_stat}` : ""}`, 2000);
    } catch (error) {
      return `변경 요약 못 함(${this.clean(String((error as Error).message ?? error), 200)})`;
    }
  }

  async stop(options: { drain: boolean } = { drain: true }): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    if (this.sweeper) clearInterval(this.sweeper);
    // 새 수신 거부는 stopping 플래그가, 아직 시작하지 않은 작업은 여기서 정리한다
    await this.tx(() => {
      const t = this.now();
      for (const task of Object.values(this.state.tasks)) {
        if (task.status === "queued" || task.status === "preparing") { task.status = "interrupted"; task.note = "daemon 정지로 시작하지 못함 — 다시 요청해야 한다"; }
        else if (task.status === "awaiting_approval") { task.status = "expired"; task.note = "daemon 정지로 승인 대기가 만료됨"; }
        else continue;
        task.prompt = ""; task.updatedAt = t;
        this.enqueueNotice(task, `⚠ 작업 \`${task.id}\`: ${task.note}`); // outbox에 먼저 남긴다 — 정지 중 전송이 끊겨도 다음 기동에서 전달된다(최소 한 번)
      }
      for (const a of Object.values(this.state.approvals)) if (a.state === "pending" && a.kind === "write_start") { a.state = "invalidated"; a.decidedAt = t; }
      this.o.store.save();
    });
    // 어댑터를 닫기 전에 안내를 짧은 제한 시간 안에 보낸다(실패하면 outbox에 남는다)
    await Promise.race([this.flushOutbox().catch(() => undefined), new Promise((r) => setTimeout(r, 5000).unref())]);
    const running = [...this.runs.values()];
    if (running.length > 0) {
      const drainMs = options.drain ? this.o.config.drainTimeoutMs : 0;
      let timer: NodeJS.Timeout | undefined;
      const all = Promise.allSettled(running).then(() => true);
      const timeout = new Promise<boolean>((r) => { timer = setTimeout(() => r(false), drainMs); });
      const finished = await Promise.race([all, timeout]);
      if (timer) clearTimeout(timer);
      if (!finished) {
        for (const id of this.controllers.keys()) { this.drainAborted.add(id); this.controllers.get(id)!.abort(); }
        for (const resolveWaiter of this.toolWaiters.values()) resolveWaiter(false);
        await Promise.race([all, new Promise((r) => setTimeout(r, 30_000).unref())]);
      }
    }
    await this.txq;
    for (const adapter of this.adapters.values()) { try { await adapter.disconnect(); } catch { /* 종료 중 */ } }
    this.log("stopped");
  }

  get isStopping(): boolean { return this.stopping; }

  // ---- 어댑터 ----

  async addAdapter(adapter: ChannelAdapter): Promise<void> {
    await adapter.connect(this); // 연결에 실패한 어댑터는 등록하지 않는다
    this.adapters.set(adapter.name, adapter);
    await this.flushOutbox();
  }

  /** outbox의 미전송 알림을 보낸다 — 성공한 것만 지운다(최소 한 번) */
  private flushing: Promise<void> | null = null;
  async flushOutbox(): Promise<void> {
    if (this.flushing) return this.flushing; // 동시 호출은 하나로 직렬화
    this.flushing = this.flushOutboxOnce().finally(() => { this.flushing = null; });
    return this.flushing;
  }

  private async flushOutboxOnce(): Promise<void> {
    const pending = [...this.state.outbox];
    for (const notice of pending) {
      const adapter = this.adapters.get(notice.channel);
      if (!adapter) continue;
      try {
        await adapter.send(notice.conversation, renderForCaps([{ type: "text", text: notice.text }], adapter.caps));
      } catch { continue; }
      await this.tx(() => {
        this.state.outbox = this.state.outbox.filter((n) => n.id !== notice.id);
        try { this.o.store.save(); } catch { /* 지우기 실패 → 다음에 중복 전송(최소 한 번) */ }
      });
    }
  }

  private enqueueNotice(task: Task, text: string): void {
    this.state.outbox.push({ id: randomBytes(6).toString("hex"), channel: task.origin.channel, conversation: task.origin.conversation, text: this.scrub(text) } satisfies Notice);
  }

  private async notify(task: Pick<Task, "origin">, blocks: Block[]): Promise<void> {
    const adapter = this.adapters.get(task.origin.channel);
    if (!adapter) return;
    try { await adapter.send(task.origin.conversation, renderForCaps(blocks, adapter.caps)); } catch (error) { this.log("notify_failed", { channel: task.origin.channel, error: String((error as Error).message).slice(0, 100) }); }
  }

  // ---- 이벤트 ----

  subscribe(fn: (event: DaemonEvent) => void | Promise<void>, filter: (event: DaemonEvent) => boolean = () => true): { unsubscribe: () => void; subscription: Subscription } {
    const sub = new Subscription(fn, filter, this.o.eventQueueLimit ?? 500);
    this.subs.add(sub);
    return { unsubscribe: () => { this.subs.delete(sub); }, subscription: sub };
  }

  private emit(type: DaemonEvent["type"], task: Pick<Task, "id" | "origin"> | null, data: Record<string, unknown> = {}): void {
    const event: DaemonEvent = { seq: ++this.seq, ts: this.now(), taskId: task?.id ?? null, channel: task?.origin.channel ?? null, conversation: task?.origin.conversation ?? null, type, data };
    for (const sub of this.subs) sub.push(event);
  }

  // ---- 수신 ----

  private allowed(m: Actor): boolean {
    return m.admin === true || (this.o.config.allowedUsers[m.channel] ?? []).includes(m.user);
  }

  /** 허용 사용자인가 — 채널 어댑터가 자체 명령·콜백 처리 전에 같은 정책을 쓰게 공개한다 */
  isAllowed(actor: Actor): boolean { return this.allowed(actor); }

  async message(m: Inbound): Promise<IngestResult> {
    return this.ingest(m);
  }

  async ingest(m: Inbound): Promise<IngestResult> {
    if (this.stopping) return { kind: "stopping" };
    if (!this.allowed(m)) { this.stats.rejectedUsers++; this.log("rejected_user", { channel: m.channel }); return { kind: "rejected", reason: "허용되지 않은 사용자" }; }
    const outcome = await this.tx(() => this.ingestLocked(m));
    if (outcome.after) await outcome.after();
    this.pump();
    return outcome.result;
  }

  private convKey(a: Pick<Actor, "channel" | "conversation">): string { return `${a.channel}:${a.conversation}`; }

  private getConversation(a: Pick<Actor, "channel" | "conversation">): Conversation {
    const key = this.convKey(a);
    let c = this.state.conversations[key];
    if (!c) {
      const first = this.o.config.workspaces.find((ws) => this.allowedRoots.has(`${ws.name}/main`) && !this.workspaceProblem(ws));
      c = { workspace: first?.name ?? "", worktreeName: "main", chain: this.o.config.defaultChain, access: "read-only" };
      this.state.conversations[key] = c;
    }
    return c;
  }

  private resolveTarget(conv: Conversation): Target | string {
    const ws = this.o.config.workspaces.find((w) => w.name === conv.workspace);
    if (!ws) return conv.workspace ? `등록되지 않은 워크스페이스: ${conv.workspace}` : "등록된 워크스페이스가 없다(설정 workspaces)";
    const problem = this.workspaceProblem(ws);
    if (problem) return problem;
    if (ws.registryId && !Object.hasOwn(ws.worktrees, conv.worktreeName)) {
      conv.worktreeName = "main";
      delete conv.saved;
    }
    const path = ws.worktrees[conv.worktreeName];
    if (!path) return `등록되지 않은 워크트리: ${conv.worktreeName}`;
    const root = this.allowedRoots.get(`${ws.name}/${conv.worktreeName}`);
    if (!root) return "기동 때 확인되지 않은 워크트리 경로";
    try {
      const real = realpathSync.native(path);
      const st = statSync(real, { bigint: true });
      if (!st.isDirectory()) return "워크트리가 디렉터리가 아니다";
      if (hasTokenShape(real)) return "워크트리 실경로에 비밀 형태 문자열이 있어 거부한다";
      if (lockKeyOf(real) !== lockKeyOf(root.real) || String(st.dev) !== root.dev || String(st.ino) !== root.ino) return "워크트리 경로가 기동 뒤 바뀌었다 — daemon을 다시 시작해야 한다";
      return { workspace: ws.name, worktreeName: conv.worktreeName, worktree: real, dev: String(st.dev), ino: String(st.ino), chain: conv.chain, access: conv.access, sessionKey: "" };
    } catch {
      return "워크트리 경로를 확인할 수 없다";
    }
  }

  /** 수신 기록(seen)을 만들지 않는 멱등 통제 명령 — 중복 처리돼도 결과가 같아 포화 중에도 처리된다 */
  private static readonly NO_SEEN_COMMANDS = new Set(["status", "queue", "help", "cancel", ""]);

  private async ingestLocked(m: Inbound): Promise<{ result: IngestResult; after?: () => Promise<void> }> {
    const s = this.state;
    if (this.stopping) return { result: { kind: "stopping" } }; // 직렬 구간 안에서 다시 확인 — 대기 중 stop()이 시작된 경우
    const key = `${m.channel}:${m.conversation}:${m.messageId}`;
    if (s.seen[key] !== undefined) { this.stats.duplicates++; return { result: { kind: "duplicate" } }; }
    const adapter = this.adapters.get(m.channel);
    const prefix = adapter?.caps.commandPrefix ?? "/";
    const text = m.text.trim();
    const t = this.now();
    const actor: Actor = { channel: m.channel, conversation: m.conversation, user: m.user, admin: m.admin };
    const convKey = this.convKey(m);
    const hadConv = s.conversations[convKey] !== undefined;
    const convBefore = hadConv ? structuredClone(s.conversations[convKey]!) : undefined;
    const conv = this.getConversation(m);
    // 대화 변경(결속·명령)은 수신 기록과 한 번에 저장하고, 실패하면 변경 전 값으로 되돌린다
    const restoreConv = (): void => { if (convBefore) s.conversations[convKey] = convBefore; else delete s.conversations[convKey]; };
    if (m.bindWorkspace !== undefined && conv.workspace !== m.bindWorkspace) {
      if (!this.o.config.workspaces.some((w) => w.name === m.bindWorkspace)) { restoreConv(); return { result: { kind: "rejected", reason: `등록되지 않은 워크스페이스: ${m.bindWorkspace}` } }; }
      conv.workspace = m.bindWorkspace; conv.worktreeName = "main"; delete conv.saved;
    }

    if (prefix && text.startsWith(prefix)) {
      const line = text.slice(prefix.length).trim();
      const cmd = line.split(/\s+/)[0] ?? "";
      const noSeen = Daemon.NO_SEEN_COMMANDS.has(cmd);
      if (!noSeen && this.o.store.seenSaturated()) { restoreConv(); return { result: { kind: "rejected", reason: "수신 기록 포화" } }; }
      const reply = this.runCommand(line, actor, conv);
      if (!noSeen) {
        s.seen[key] = t;
        this.o.store.pruneSeen(t);
      }
      try { this.o.store.save(); } catch { delete s.seen[key]; restoreConv(); return { result: { kind: "rejected", reason: "상태 저장 실패" } }; }
      return { result: { kind: "command", blocks: reply.blocks }, after: () => this.notify({ origin: { ...actor, messageId: m.messageId } }, reply.blocks) };
    }
    if (text === "") { restoreConv(); return { result: { kind: "rejected", reason: "빈 메시지" } }; }
    if (this.o.store.seenSaturated()) { restoreConv(); return { result: { kind: "rejected", reason: "수신 기록 포화" } }; }

    const target = this.resolveTarget(conv);
    if (typeof target === "string") {
      restoreConv();
      return { result: { kind: "rejected", reason: target }, after: () => this.notify({ origin: { ...actor, messageId: m.messageId } }, [{ type: "text", text: `요청을 받을 수 없습니다: ${target}` }]) };
    }
    target.sessionKey = `${this.convKey(m)}|${target.worktree}|${target.chain}|${target.access}`;
    const id = `t-${randomBytes(4).toString("hex")}`;
    const task: Task = { id, status: "queued", createdAt: t, updatedAt: t, origin: { ...actor, messageId: m.messageId }, prompt: this.scrub(text), target, bootId: this.bootId, procs: [] };
    let approval: Approval | null = null;
    if (target.access === "write") {
      approval = this.newApproval(task, "write_start", `쓰기 작업 시작 승인: ${this.clean(text, 200)}`);
      task.status = "awaiting_approval";
      task.approvalId = approval.id;
      s.approvals[approval.id] = approval;
    }
    s.tasks[id] = task;
    s.seen[key] = t;
    this.o.store.pruneSeen(t);
    try { this.o.store.save(); } catch {
      delete s.tasks[id]; delete s.seen[key]; if (approval) delete s.approvals[approval.id]; restoreConv();
      return { result: { kind: "rejected", reason: "상태 저장 실패" } };
    }
    this.emit("status", task, { status: task.status });
    return {
      result: { kind: "task", taskId: id, status: task.status },
      after: approval ? () => this.askApproval(task, approval!) : undefined,
    };
  }

  private newApproval(task: Task, kind: ApprovalKind, detail: string): Approval {
    const t = this.now();
    return {
      id: randomBytes(16).toString("hex"), taskId: task.id, kind, state: "pending", detail,
      scope: { access: task.target.access, worktree: task.target.worktree, chain: task.target.chain },
      requester: { channel: task.origin.channel, conversation: task.origin.conversation, user: task.origin.user },
      expiresAt: t + this.o.config.approvalTtlSeconds * 1000, bootId: this.bootId, createdAt: t,
    };
  }

  private async askApproval(task: Task, a: Approval): Promise<void> {
    this.emit("approval", task, { id: a.id, kind: a.kind, detail: a.detail, expiresAt: a.expiresAt });
    const adapter = this.adapters.get(task.origin.channel);
    if (!adapter) return;
    try {
      if (adapter.askApproval) await adapter.askApproval(task.origin.conversation, { id: a.id, taskId: task.id, kind: a.kind, detail: a.detail, expiresAt: a.expiresAt, access: a.scope.access, worktree: a.scope.worktree });
      else await adapter.send(task.origin.conversation, renderForCaps([{ type: "text", text: `**승인 요청** \`${a.id}\`\n${a.detail}\n/approve \`${a.id}\` — 승인\n/deny \`${a.id}\` — 거부` }], adapter.caps));
    } catch (error) { this.log("approval_notify_failed", { error: String((error as Error).message).slice(0, 100) }); }
  }

  // ---- 명령 ----

  private visible(task: Task, from: Actor): boolean {
    return from.admin === true || (task.origin.channel === from.channel && task.origin.conversation === from.conversation);
  }

  private runCommand(line: string, from: Actor, conv: Conversation): { blocks: Block[] } {
    const [cmd = "", ...args] = line.split(/\s+/);
    const text = (t: string): { blocks: Block[] } => ({ blocks: [{ type: "text", text: t }] });
    const mine = Object.values(this.state.tasks).filter((t) => this.visible(t, from));
    switch (cmd) {
      case "status": {
        const active = mine.filter((t) => t.status === "running" || t.status === "preparing").length;
        const queued = mine.filter((t) => t.status === "queued" || t.status === "awaiting_approval").length;
        const open = mine.filter((t) => ACTIVE_STATUSES.includes(t.status));
        return text([`**기기 ${this.o.config.device}**`, `실행 ${active} · 대기 ${queued}`, ...(open.length > 0 ? ["작업:", ...open.map((t) => `- \`${t.id}\` ${t.status}`)] : []), `대상: \`${conv.workspace}/${conv.worktreeName}\``, `체인: \`${conv.chain}\` · 접근: \`${conv.access}\``].join("\n"));
      }
      case "queue": {
        const open = mine.filter((t) => ACTIVE_STATUSES.includes(t.status));
        if (open.length === 0) return text("대기·실행 중인 작업이 없다");
        return text(["**작업**", ...open.map((t) => `- \`${t.id}\` ${t.status} — \`${t.target.workspace}/${t.target.worktreeName}\` · ${t.target.access}`)].join("\n"));
      }
      case "cancel": {
        const ref = args[0];
        if (!ref) return text("사용법\n/cancel `<작업 ID>` — 작업 취소");
        const r = this.cancelLocked(ref, from);
        return text(r.ok ? `취소 요청: ${ref}` : `취소할 수 없습니다: ${r.reason}`);
      }
      case "use": {
        const [wsName, wtName = "main"] = (args[0] ?? "").split("/");
        const ws = this.o.config.workspaces.find((w) => w.name === wsName);
        if (!ws || !ws.worktrees[wtName]) return text(["알 수 없는 대상. 사용 가능:", ...(this.o.config.workspaces.flatMap((w) => Object.keys(w.worktrees).map((n) => `- \`${w.name}/${n}\``))), ...(this.o.config.workspaces.length === 0 ? ["없음"] : [])].join("\n"));
        conv.workspace = ws.name; conv.worktreeName = wtName;
        delete conv.saved; // 다른 대상의 문맥을 이어가지 않는다 (저장은 수신 기록과 한 번에 — ingestLocked)
        return text(`대상 변경: \`${ws.name}/${wtName}\` (이미 받은 작업에는 영향 없음)`);
      }
      case "chain": {
        const name = args[0];
        if (!name || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(name)) return text("사용법\n/chain `<이름>` — 체인 바꾸기");
        conv.chain = name;
        delete conv.saved;
        return text(`체인 변경: \`${name}\``);
      }
      case "access": {
        if (args[0] !== "read-only" && args[0] !== "write") return text("사용법\n/access `read-only|write` — 접근 기본값 바꾸기");
        conv.access = args[0] as Access;
        return text(`접근 기본값: \`${args[0]}\`${args[0] === "write" ? " (쓰기 작업은 매번 승인이 필요합니다)" : ""}`);
      }
      case "approve":
      case "deny": {
        const id = args[0];
        if (!id) return text(`사용법\n/${cmd} \`<승인 ID>\` — ${cmd === "approve" ? "승인" : "거부"}`);
        const r = this.decideLocked(id, from, cmd === "approve" ? "approve" : "reject");
        return text(r.ok ? `${cmd === "approve" ? "승인" : "거부"} 처리됨` : `처리할 수 없습니다: ${r.reason}`);
      }
      default:
        return text(CORE_HELP);
    }
  }

  // ---- 승인 ----

  async approval(id: string, from: Actor, decision: "approve" | "reject"): Promise<{ ok: boolean; reason?: string }> {
    const r = await this.tx(() => this.decideLocked(id, from, decision));
    this.pump();
    return r;
  }

  private decideLocked(id: string, from: Actor, decision: "approve" | "reject"): { ok: boolean; reason?: string } {
    const a = this.state.approvals[id];
    const t = this.now();
    if (!a) return { ok: false, reason: "없는 승인" };
    const task = this.state.tasks[a.taskId];
    const owns = from.admin === true || (from.channel === a.requester.channel && from.conversation === a.requester.conversation && from.user === a.requester.user);
    if (!owns) return { ok: false, reason: "없는 승인" }; // 다른 대화·사용자에게는 존재를 드러내지 않는다
    if (a.bootId !== this.bootId) {
      if (a.state === "pending") { a.state = "invalidated"; try { this.o.store.save(); } catch { /* 표시만 */ } }
      return { ok: false, reason: "이전 기동에서 발급된 승인" };
    }
    if (a.state !== "pending") return { ok: false, reason: `이미 처리됨(${a.state})` };
    if (t > a.expiresAt) { this.expireApprovalLocked(a); return { ok: false, reason: "만료됨" }; }
    // 먼저 저장한 뒤 효과를 낸다 — 승인 상태와 작업 상태를 한 번의 원자적 쓰기로
    const prevTask = task ? { status: task.status, note: task.note, prompt: task.prompt, updatedAt: task.updatedAt } : null;
    a.state = decision === "approve" ? "approved" : "rejected";
    a.decidedAt = t;
    if (task) {
      if (a.kind === "write_start" && task.status === "awaiting_approval") {
        task.status = decision === "approve" ? "queued" : "denied";
        if (decision === "reject") { task.prompt = ""; task.note = "사용자가 거부"; }
      } else if (a.kind === "handoff" && decision === "approve" && task.status === "handoff") {
        task.status = "handoff_acknowledged";
      }
      task.updatedAt = t;
    }
    try { this.o.store.save(); } catch {
      a.state = "pending"; delete a.decidedAt;
      if (task && prevTask) { task.status = prevTask.status; task.note = prevTask.note; task.prompt = prevTask.prompt; task.updatedAt = prevTask.updatedAt; }
      return { ok: false, reason: "상태 저장 실패" };
    }
    if (a.kind === "tool") this.toolWaiters.get(a.id)?.(decision === "approve");
    this.toolWaiters.delete(a.id);
    if (task) this.emit("approval", task, { id: a.id, state: a.state });
    if (task && task.status === "denied") void this.notify(task, [{ type: "text", text: `🚫 작업 \`${task.id}\`: 거부되어 실행하지 않았습니다.` }]);
    return { ok: true };
  }

  private expireApprovalLocked(a: Approval): void {
    const task = this.state.tasks[a.taskId];
    a.state = "expired";
    a.decidedAt = this.now();
    if (task) {
      if (a.kind === "write_start" && task.status === "awaiting_approval") { task.status = "expired"; task.note = "승인 기한 초과"; task.prompt = ""; void this.notify(task, [{ type: "text", text: `⌛ 작업 \`${task.id}\`: 승인 기한이 지나 실행하지 않았습니다.` }]); }
      if (a.kind === "tool" && task.status === "running") { this.controllers.get(task.id)?.abort(); task.note = "도구 승인 기한 초과로 취소"; }
    }
    try { this.o.store.save(); } catch { /* 메모리 상태는 이미 만료 */ }
    this.toolWaiters.get(a.id)?.(false);
    this.toolWaiters.delete(a.id);
  }

  private sweepApprovalsLocked(): void {
    const t = this.now();
    for (const a of Object.values(this.state.approvals)) if (a.state === "pending" && a.bootId === this.bootId && t > a.expiresAt) this.expireApprovalLocked(a);
  }

  /** 시험·운영용: 만료 검사를 즉시 수행 */
  async sweep(): Promise<void> { await this.tx(() => this.sweepApprovalsLocked()); }

  // ---- 취소 ----

  async cancel(taskId: string, from: Actor): Promise<{ ok: boolean; reason?: string }> {
    const r = await this.tx(() => this.cancelLocked(taskId, from));
    this.pump();
    return r;
  }

  private cancelLocked(ref: string, from: Actor): { ok: boolean; reason?: string } {
    const matches = Object.values(this.state.tasks).filter((t) => this.visible(t, from) && (t.id === ref || t.id.startsWith(ref)));
    if (matches.length !== 1) return { ok: false, reason: "없는 작업" };
    const task = matches[0]!;
    if (TERMINAL.includes(task.status)) return { ok: false, reason: `이미 끝남(${task.status})` };
    const t = this.now();
    if (task.status === "running") {
      this.controllers.get(task.id)?.abort();
      task.note = "취소 요청";
      for (const a of Object.values(this.state.approvals)) if (a.taskId === task.id && a.state === "pending") { a.state = "invalidated"; a.decidedAt = t; this.toolWaiters.get(a.id)?.(false); this.toolWaiters.delete(a.id); }
      try { this.o.store.save(); } catch { /* 취소 요청은 메모리 신호가 본체 */ }
      return { ok: true };
    }
    // queued · awaiting_approval · preparing: 아직 실행하지 않았다 — 예약을 풀고 승인을 무효화한다
    const prev = { status: task.status, note: task.note, prompt: task.prompt, updatedAt: task.updatedAt };
    const invalidated: Approval[] = [];
    task.status = "cancelled"; task.note = "사용자가 취소"; task.prompt = ""; task.updatedAt = t;
    for (const a of Object.values(this.state.approvals)) if (a.taskId === task.id && a.state === "pending") { a.state = "invalidated"; a.decidedAt = t; invalidated.push(a); }
    try { this.o.store.save(); } catch {
      task.status = prev.status; task.note = prev.note; task.prompt = prev.prompt; task.updatedAt = prev.updatedAt;
      for (const a of invalidated) { a.state = "pending"; delete a.decidedAt; }
      return { ok: false, reason: "상태 저장 실패" };
    }
    this.emit("status", task, { status: "cancelled" });
    return { ok: true };
  }

  // ---- 대기열·실행 ----

  private pump(): void {
    if (this.stopping) return;
    void this.tx(() => this.pumpLocked()).catch(() => undefined);
  }

  private blocked(task: Task): boolean {
    const key = lockKeyOf(task.target.worktree);
    for (const other of Object.values(this.state.tasks)) {
      if (other.id === task.id || (other.status !== "preparing" && other.status !== "running")) continue;
      if (pathsRelated(key, lockKeyOf(other.target.worktree))) return true;
    }
    for (const q of Object.values(this.state.quarantine)) if (pathsRelated(key, q.key)) return true;
    return false;
  }

  private pumpLocked(): void {
    if (this.stopping) return;
    const s = this.state;
    let active = Object.values(s.tasks).filter((t) => t.status === "preparing" || t.status === "running").length;
    const queued = Object.values(s.tasks).filter((t) => t.status === "queued" && t.bootId === this.bootId).sort((a, b) => a.createdAt - b.createdAt);
    for (const task of queued) {
      if (active >= this.o.config.maxConcurrent) break;
      if (this.blocked(task)) continue; // 막힌 작업이 뒤의 풀린 작업을 막지 않는다
      if (task.target.access === "write") {
        const a = task.approvalId ? s.approvals[task.approvalId] : undefined;
        if (!a || a.state !== "approved" || a.bootId !== this.bootId) continue;
      }
      task.status = "preparing"; task.updatedAt = this.now();
      try { this.o.store.save(); } catch { task.status = "queued"; break; }
      active++;
      void this.prepare(task.id);
    }
    // 기다리게 된 작업은 한 번만 짧게 알린다(입력 중 표시 채널 — 실행 전에는 입력 중 표시를 보내지 않는다)
    for (const id of this.queueNotified) if (!queued.some((q) => q.id === id)) this.queueNotified.delete(id);
    for (const task of queued) {
      if (task.status !== "queued" || this.queueNotified.has(task.id) || !this.adapters.get(task.origin.channel)?.caps.typing) continue;
      this.queueNotified.add(task.id);
      void this.notify(task, [{ type: "text", text: `⏸ 작업 \`${task.id}\` 대기 중 — 앞선 작업이 끝나면 시작합니다.` }]);
    }
  }

  private setBusy(task: Task, on: boolean): void {
    try { this.adapters.get(task.origin.channel)?.busy?.(task.origin.conversation, task.id, on); } catch { /* 표시일 뿐 — 작업에 영향 없음 */ }
  }

  private checkIdentity(task: Task): string | null {
    const ws = this.o.config.workspaces.find((entry) => entry.name === task.target.workspace);
    if (ws?.registryId) {
      const problem = this.workspaceProblem(ws);
      if (problem) return problem;
      const allowed = this.allowedRoots.get(`${ws.name}/${task.target.worktreeName}`);
      if (!allowed || !sameWorkspaceRoot(allowed, { real: task.target.worktree, dev: task.target.dev, ino: task.target.ino })) {
        return "target_changed: 승인한 워크스페이스가 작업을 받은 뒤 바뀌었다";
      }
    }
    try {
      const real = realpathSync.native(task.target.worktree);
      const st = statSync(real, { bigint: true });
      if (lockKeyOf(real) !== lockKeyOf(task.target.worktree) || String(st.dev) !== task.target.dev || String(st.ino) !== task.target.ino) return "target_changed: 대상 디렉터리가 받은 뒤 바뀌었다";
      return null;
    } catch { return "target_changed: 대상 경로를 확인할 수 없다"; }
  }

  /** 처리기 밖 준비(경로 확인·시작 스냅샷) → 처리기에서 재확인 뒤 시작 확정 */
  private async prepare(id: string): Promise<void> {
    const task0 = this.state.tasks[id];
    if (!task0) return;
    let snapshot: Snapshot | null = null;
    let failure: string | null = this.checkIdentity(task0);
    if (!failure && task0.target.access === "write") {
      try {
        const take = this.o.snapshot ?? ((cwd: string) => takeSnapshot(cwd));
        let timer: NodeJS.Timeout | undefined;
        snapshot = await Promise.race([
          Promise.resolve().then(() => take(task0.target.worktree)),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("스냅샷 시간 초과")), this.o.prepareTimeoutMs ?? 10_000); }),
        ]);
        if (timer) clearTimeout(timer);
      } catch (error) { failure = `snapshot_failed: ${this.clean(String((error as Error).message ?? error), 200)}`; }
    }
    const confirmed = await this.tx(() => this.confirmStartLocked(id, snapshot, failure));
    if (confirmed) { this.runs.set(id, this.execute(id).finally(() => { this.runs.delete(id); })); }
    else this.pump();
  }

  private confirmStartLocked(id: string, snapshot: Snapshot | null, failure: string | null): boolean {
    const task = this.state.tasks[id];
    if (!task || task.status !== "preparing" || task.bootId !== this.bootId) return false; // 준비 중 취소·정지
    const t = this.now();
    const fail = (status: TaskStatus, note: string): false => {
      task.status = status; task.note = note; task.prompt = ""; task.updatedAt = t;
      try { this.o.store.save(); } catch { /* 메모리 상태 유지 */ }
      this.emit("status", task, { status });
      void this.notify(task, [{ type: "text", text: `⚠ 작업 \`${task.id}\`: 시작하지 못했습니다 — ${note}` }]);
      return false;
    };
    if (this.stopping) return fail("interrupted", "daemon 정지로 시작하지 못함");
    if (failure) return fail("failed", failure);
    const again = this.checkIdentity(task); // 재확인 — 준비 동안 바뀔 수 있다
    if (again) return fail("failed", again);
    const key = lockKeyOf(task.target.worktree);
    for (const q of Object.values(this.state.quarantine)) if (pathsRelated(key, q.key)) return fail("failed", "격리된 경로 — 운영자 확인(pace daemon release) 전에는 시작하지 않는다");
    if (task.target.access === "write") {
      const a = task.approvalId ? this.state.approvals[task.approvalId] : undefined;
      if (!a || a.state !== "approved" || a.bootId !== this.bootId) return fail("denied", "유효한 승인이 없다");
      if (!snapshot) return fail("failed", "snapshot_failed: 시작 스냅샷이 없다");
      task.snapshot = snapshot;
    }
    task.status = "running"; task.updatedAt = t; task.procs = [];
    try { this.o.store.save(); } catch {
      // 저장하지 못하면 시작하지 않는다 — 기록 없는 실행은 복구할 수 없다
      return fail("failed", "상태 저장 실패로 시작하지 않았다");
    }
    this.controllers.set(id, new AbortController());
    this.emit("status", task, { status: "running" });
    return true;
  }

  private async execute(id: string): Promise<void> {
    const task = this.state.tasks[id]!;
    const ac = this.controllers.get(id)!;
    const conv = this.getConversation(task.origin);
    const savedRec = conv.saved && conv.saved.conversation === task.origin.conversation && conv.saved.worktree === task.target.worktree && conv.saved.chain === task.target.chain && conv.saved.cwd === task.target.worktree ? conv.saved : null; // access가 다르면 실행자가 새 세션 + 요약으로 넘긴다(권한 상승 없음)
    const adapter = this.adapters.get(task.origin.channel);
    this.setBusy(task, true);
    if (adapter && !adapter.caps.typing) { try { this.progressRefs.set(id, await adapter.send(task.origin.conversation, renderForCaps([{ type: "text", text: `▶ 작업 \`${id}\` 시작\n대상: \`${task.target.workspace}/${task.target.worktreeName}\` · 접근: \`${task.target.access}\` · 체인: \`${task.target.chain}\`` }], adapter.caps))); } catch { this.progressRefs.set(id, null); } }
    const ctl: RunCtl = {
      signal: ac.signal,
      update: (u) => this.onAgentUpdate(task, u),
      onProcess: (p: ProcRef) => { void this.tx(() => { task.procs.push(p); try { this.o.store.save(); } catch { /* 식별 저장 실패 → 복구는 격리 쪽 */ } }); },
      requestApproval: (detail) => this.requestToolApproval(task, detail),
    };
    let result: RunResult;
    try {
      result = await this.o.runner({ taskId: id, prompt: task.prompt, target: task.target, conversation: task.origin.conversation, saved: savedRec }, ctl);
    } catch (error) {
      result = { status: "failed", text: "", detail: this.clean(String((error as Error).message ?? error), 300), cleanupUnconfirmed: true };
    }
    if (ac.signal.aborted && result.status !== "done") result = { ...result, status: "cancelled" };
    await this.tx(() => this.finishLocked(id, result));
    // drain 시간 초과로 needs_review가 되고 회수가 확인된 쓰기 작업은 종료 흐름 안에서 변경 요약을 만든다
    const after = this.state.tasks[id];
    if (after && after.status === "needs_review" && after.summaryPending && after.cleanup === "confirmed") {
      const summary = await this.makeSummary(after);
      await this.tx(() => { after.summary = summary; after.summaryPending = false; try { this.o.store.save(); } catch { /* 다음 기동에서 다시 */ } });
    }
    this.pump();
  }

  private onAgentUpdate(task: Task, update: Record<string, unknown>): void {
    const kind = String(update.sessionUpdate ?? "");
    if (kind === "agent_message_chunk") {
      const content = update.content as { text?: unknown } | undefined;
      this.emit("text_delta", task, { text: excerpt(typeof content?.text === "string" ? content.text : "", 2000) }); // 사용자 결정: 이벤트 스트림 비밀 제거는 범위 밖(받은 조각 그대로)
    } else if (kind === "tool_call" || kind === "tool_call_update") {
      this.emit("tool", task, { id: update.toolCallId ?? null, title: update.title ?? null, kind: update.kind ?? null, status: update.status ?? null });
      if (typeof update.title === "string" && update.title) this.progressEdit(task, update.title);
    } else if (kind === "plan") {
      this.emit("plan", task, { entries: update.entries ?? [] });
    } else {
      this.emit("raw", task, { sessionUpdate: kind || null });
    }
  }

  /** 실행 중 진행 표시(BR05) — canEdit 어댑터의 시작 메시지를 도구 제목으로 수정한다. 같은 작업 최소 간격, 마지막 이벤트만 반영, 최종 응답이 항상 우선 */
  private progressEdit(task: Task, title: string): void {
    const adapter = this.adapters.get(task.origin.channel);
    const ref = this.progressRefs.get(task.id);
    if (!adapter || !ref || !adapter.caps.canEdit || !adapter.edit || this.progressClosed.has(task.id)) return;
    const text = `⏳ 작업 \`${task.id}\` 진행 중\n${this.clean(title, 200).replace(/([\\*_~\`\[\]#>|])/g, "\\$1")}`;
    const gap = this.o.progressEditMs ?? 3000;
    const now = this.now();
    const last = this.progressLast.get(task.id) ?? 0;
    const run = (body: string): void => {
      if (this.progressClosed.has(task.id)) return;
      this.progressLast.set(task.id, this.now());
      const prior = this.progressChain.get(task.id) ?? Promise.resolve();
      const next = prior.then(() => this.progressClosed.has(task.id) ? undefined : adapter.edit!(task.origin.conversation, ref, renderForCaps([{ type: "text", text: body }], adapter.caps))).catch(() => this.log("progress_edit_failed", { task: task.id }));
      this.progressChain.set(task.id, next);
    };
    if (now - last >= gap) { this.progressPending.delete(task.id); run(text); return; }
    const had = this.progressPending.has(task.id);
    this.progressPending.set(task.id, text); // 마지막 이벤트만 남긴다
    if (had) return;
    const timer = setTimeout(() => { const body = this.progressPending.get(task.id); this.progressPending.delete(task.id); if (body) run(body); }, Math.max(0, gap - (now - last)));
    timer.unref();
  }

  private async requestToolApproval(task: Task, detail: string): Promise<boolean> {
    const a = await this.tx(() => {
      if (task.status !== "running") return null;
      const approval = this.newApproval(task, "tool", this.clean(detail, 400));
      this.state.approvals[approval.id] = approval;
      try { this.o.store.save(); } catch { delete this.state.approvals[approval.id]; return null; }
      return approval;
    });
    if (!a) return false;
    const waiter = new Promise<boolean>((resolveWaiter) => { this.toolWaiters.set(a.id, resolveWaiter); });
    this.setBusy(task, false); // 승인을 기다리는 동안은 입력 중 표시를 끈다
    await this.askApproval(task, a);
    const decided = await waiter;
    if (task.status === "running") this.setBusy(task, true);
    return decided;
  }

  private finishLocked(id: string, result: RunResult): void {
    const task = this.state.tasks[id];
    this.controllers.delete(id);
    if (task) this.setBusy(task, false);
    if (!task || task.status !== "running") return;
    const t = this.now();
    const unconfirmed = result.cleanupUnconfirmed !== false;
    const drained = this.drainAborted.has(id);
    const write = task.target.access === "write";
    let status: TaskStatus = result.status === "done" ? "done" : result.status === "handoff" ? "handoff" : result.status === "cancelled" ? "cancelled" : "failed";
    if (drained && status === "cancelled") status = write ? "needs_review" : "interrupted";
    task.cleanup = unconfirmed ? "unconfirmed" : "confirmed";
    if (unconfirmed) {
      const key = lockKeyOf(task.target.worktree);
      this.state.quarantine[key] = { key, worktree: task.target.worktree, since: t, reason: "실행 종료 때 프로세스 회수를 확인하지 못함", taskId: id } satisfies QuarantineEntry;
    }
    task.status = status;
    task.prompt = "";
    task.updatedAt = t;
    const rText = this.scrub(result.text);
    const rDetail = result.detail === undefined ? undefined : this.scrub(result.detail);
    const rChanges = result.changes === undefined ? undefined : this.scrub(result.changes);
    const rVia = result.via === undefined ? undefined : this.scrub(result.via);
    task.result = { text: excerpt(rText), detail: rDetail === undefined ? undefined : excerpt(rDetail, 2000), nextRetryAt: result.nextRetryAt ?? null, via: rVia };
    if (rChanges) task.summary = excerpt(rChanges, 2000);
    if (status === "needs_review") { task.summaryPending = true; task.note = "drain 시간 초과로 취소 — 확인 필요"; }
    if (result.session && status === "done" && this.scrub(result.session.sessionId) === result.session.sessionId) { // 토큰이 섞인 세션 ID는 저장하지 않는다(변형된 ID로 resume을 시도하지 않음)
      const conv = this.getConversation(task.origin);
      conv.saved = { ...result.session, conversation: task.origin.conversation, worktree: task.target.worktree, chain: task.target.chain, lastText: excerpt(rText, 4000) };
    }
    let handoff: Approval | null = null;
    if (status === "handoff") {
      handoff = this.newApproval(task, "handoff", this.clean(result.handoff ?? result.detail ?? "인계 필요", 1500));
      this.state.approvals[handoff.id] = handoff;
    }
    for (const a of Object.values(this.state.approvals)) if (a.taskId === id && a.state === "pending" && a.kind === "tool") { a.state = "invalidated"; a.decidedAt = t; this.toolWaiters.get(a.id)?.(false); this.toolWaiters.delete(a.id); }
    try { this.o.store.save(); } catch (error) { this.log("save_failed", { error: String((error as Error).message) }); }
    this.emit("final", task, { status, cleanup: task.cleanup });
    this.emit("status", task, { status });
    const blocks: Block[] = [];
    const head = status === "done" ? `✅ **작업 \`${id}\` 완료**` : `${status === "failed" ? "❌" : status === "cancelled" ? "⏹" : "⚠"} **작업 \`${id}\`**: ${status}`;
    blocks.push({ type: "text", text: `${head}${unconfirmed ? "\n⚠ 프로세스 회수를 확인하지 못해 이 경로를 격리했습니다(운영자 확인 필요)." : ""}` });
    if (rText) blocks.push({ type: "text", text: rText });
    if (rVia) blocks.push({ type: "text", text: `처리: ${rVia}` });
    if (rDetail && status !== "done") blocks.push({ type: "text", text: rDetail });
    if (result.nextRetryAt) blocks.push({ type: "text", text: `다음 시도 가능: ${result.nextRetryAt}` });
    if (rChanges) blocks.push({ type: "code", text: rChanges });
    if (handoff) blocks.push({ type: "text", text: `인계가 필요합니다. 확인하면 아래 명령을 보냅니다(자동 재실행은 하지 않습니다).\n/approve \`${handoff.id}\` — 인계 확인` });
    const adapter = this.adapters.get(task.origin.channel);
    const ref = this.progressRefs.get(id);
    this.progressRefs.delete(id);
    this.progressClosed.add(id); // 닫힘 — 이 뒤의 진행 편집은 건너뛴다
    const prior = this.progressChain.get(id) ?? Promise.resolve();
    if (adapter) {
      const rendered = renderForCaps(blocks, adapter.caps);
      // 최종 편집은 진행 편집 대기열 뒤에 붙는다 — 느린 진행 편집이 최종 결과를 덮지 못한다
      const send = prior.then(() => ref && adapter.caps.canEdit && adapter.edit ? adapter.edit(task.origin.conversation, ref, rendered) : adapter.send(task.origin.conversation, rendered).then(() => undefined));
      void Promise.resolve(send).catch(() => this.log("notify_failed", { task: id })).finally(() => { this.progressChain.delete(id); this.progressLast.delete(id); this.progressPending.delete(id); this.progressClosed.delete(id); });
    } else { this.progressChain.delete(id); this.progressClosed.delete(id); }
    if (handoff && adapter) void this.askApproval(task, handoff);
  }

  // ---- T05: 채널 어댑터 보조 ----

  /** Telegram 파일 워커가 등록부를 별도로 확인하는 경우에만 저장된 신원을 그대로 넘긴다. */
  workspaceRootInfo(name: string, revalidate = true): { real: string; dev: string; ino: string } | null {
    const ws = this.o.config.workspaces.find((entry) => entry.name === name);
    if (!ws || (revalidate && this.workspaceProblem(ws))) return null;
    const r = this.allowedRoots.get(`${name}/main`);
    return r ? { ...r } : null;
  }

  registerWorkspace(request: WorkspaceAddRequest, promoteLegacy: (entry: WorkspaceEntry) => void): Promise<WorkspaceEntry> {
    return this.tx(() => {
      if (this.stopping || !this.o.home) throw new WorkspaceError("daemon이 워크스페이스를 추가할 수 없는 상태다");
      const existing = this.o.config.workspaces.find((entry) => entry.name === request.name);
      if (existing && !existing.registryId) {
        const expected = this.allowedRoots.get(`${existing.name}/main`);
        if (!expected || !sameWorkspaceRoot(expected, request)) throw new WorkspaceError("기존 설정과 승인한 디렉터리 신원이 다르다 — --name을 지정한다");
      }
      const entry = persistRegisteredWorkspace(this.o.home, request, promoteLegacy);
      const previousRoot = this.allowedRoots.get(`${entry.name}/main`);
      if (previousRoot && !sameWorkspaceRoot(previousRoot, request)) {
        for (const conv of Object.values(this.state.conversations)) {
          if (conv.workspace !== entry.name) continue;
          conv.worktreeName = "main";
          delete conv.saved;
        }
      }
      if (existing) this.o.config.workspaces.splice(this.o.config.workspaces.indexOf(existing), 1, entry);
      else this.o.config.workspaces.push(entry);
      if (existing?.path !== entry.path && existing?.registryId) {
        for (const name of Object.keys(existing.worktrees)) this.allowedRoots.delete(`${entry.name}/${name}`);
      }
      this.allowedRoots.set(`${entry.name}/main`, { real: request.real, dev: request.dev, ino: request.ino });
      return entry;
    });
  }

  /** 이 채널의 이전 운영 흔적(대화·작업)이 상태에 있는가 — 어댑터가 offset 유실을 구분하는 데 쓴다 */
  hasChannelActivity(channel: string): boolean {
    return Object.keys(this.state.conversations).some((k) => k.startsWith(`${channel}:`)) || Object.values(this.state.tasks).some((t) => t.origin.channel === channel);
  }

  /** 기기 전체 현황(General 전용) — 일반 대화의 조회 범위는 넓히지 않는다 */
  overview(): { device: string; running: number; queued: number; quarantined: number; byWorkspace: Record<string, { running: number; queued: number }> } {
    const byWorkspace: Record<string, { running: number; queued: number }> = Object.create(null) as Record<string, { running: number; queued: number }>; // 'constructor' 같은 이름과 충돌하지 않게
    for (const t of Object.values(this.state.tasks)) {
      const w = (byWorkspace[t.target.workspace] ??= { running: 0, queued: 0 });
      if (t.status === "running" || t.status === "preparing") w.running++;
      else if (t.status === "queued" || t.status === "awaiting_approval") w.queued++;
    }
    return { device: this.o.config.device, ...this.counts(), byWorkspace };
  }

  /** 요청자 본인의 대기 승인(만료·이전 기동 제외) — 알림 전송이 실패했을 때 버튼을 다시 보내는 데 쓴다 */
  pendingApprovals(from: Actor): ApprovalPrompt[] {
    const t = this.now();
    return Object.values(this.state.approvals)
      .filter((a) => a.state === "pending" && a.bootId === this.bootId && t <= a.expiresAt && a.requester.channel === from.channel && a.requester.conversation === from.conversation && a.requester.user === from.user)
      .map((a) => ({ id: a.id, taskId: a.taskId, kind: a.kind, detail: a.detail, expiresAt: a.expiresAt, access: a.scope.access, worktree: a.scope.worktree }));
  }

  // ---- 조회·운영 ----

  getTask(id: string): Task | undefined { return this.state.tasks[id]; }

  async release(path: string): Promise<boolean> {
    return this.tx(() => {
      const key = lockKeyOf(path);
      const had = this.state.quarantine[key];
      if (!had) return false;
      delete this.state.quarantine[key];
      this.o.store.save();
      this.log("quarantine_released", { task: had.taskId, by: "operator" });
      return true;
    }).then((r) => { this.pump(); return r; });
  }

  counts(): { running: number; queued: number; quarantined: number } {
    const tasks = Object.values(this.state.tasks);
    return { running: tasks.filter((t) => t.status === "running" || t.status === "preparing").length, queued: tasks.filter((t) => t.status === "queued" || t.status === "awaiting_approval").length, quarantined: Object.keys(this.state.quarantine).length };
  }

  /** 시험용: 처리기 안의 모든 작업이 끝날 때까지 */
  async idle(): Promise<void> {
    for (let i = 0; i < 50; i++) {
      await this.txq;
      await Promise.allSettled([...this.runs.values()]);
      await this.txq;
      if (this.runs.size === 0) return;
    }
  }
}
