import type { ApprovalPrompt, Actor, Block, ChannelAdapter, ChannelCaps, ChannelSink, IngestResult } from "../types.ts";
import { WORKSPACE_NAME, type WorkspaceEntry } from "../config.ts";
import type { Redactor } from "../secrets.ts";
import { sameWorkspaceRoot, WorkspaceError } from "../workspace.ts";
import { TelegramApi, TelegramApiError } from "./api.ts";
import { FsWorker } from "./fsworker.ts";
import { plainFromHtml } from "./markdown.ts";
import { approvalKeyboard, approvalText, CALLBACK_RE, escapeHtml, renderBlocks } from "./render.ts";
import { topicStateText, type TopicState } from "./provisioning.ts";
import { emptyTelegramState, loadTelegramState, promoteLegacyBinding, saveTelegramState, topicName, trimHeld, type HeldRecord, type TelegramState, TelegramStateError, type TopicBinding } from "./state.ts";

// Telegram 포럼 토픽 어댑터 (P035 T05, BR05). 채널 규격만 구현하고 코어를 모른다.
// 경계: 허용 chat → 허용 사용자(코어 정책 host.isAllowed) → 등록 토픽 순으로 통과한 입력만 처리한다.
// 어댑터가 만드는 Actor·Inbound에는 admin을 절대 넣지 않는다(코어의 admin 우회는 Gateway 토큰 소지자 전용).

export interface TelegramHost {
  device: string;
  registryHome?: string;
  isAllowed(actor: Actor): boolean;
  pendingApprovals(from: Actor): ApprovalPrompt[];
  overview(): { device: string; running: number; queued: number; quarantined: number; byWorkspace: Record<string, { running: number; queued: number }> };
  workspaces(): WorkspaceEntry[];
  workspaceRootInfo(name: string): { real: string; dev: string; ino: string } | null;
  matchesLegacyBinding?(entry: WorkspaceEntry, id: string): boolean;
  flushOutbox(): Promise<void>;
  /** 코어 상태에 이전 telegram 운영 흔적(대화·작업)이 있는가 */
  hasPriorActivity(): boolean;
  /** 시크릿 파일의 initializedAt 표식 */
  readMarker(): boolean;
  writeMarker(): void;
  stateFile: string;
}

export interface TelegramAdapterOptions {
  api: TelegramApi;
  chatId: string;
  forumKey?: string;
  host: TelegramHost;
  redact: Redactor;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  pollSeconds?: number;
  log?: (event: string, fields?: Record<string, unknown>) => void;
  fsWorker?: FsWorker;
  /** 재시도·재전송 주기(ms) — 시험에서 줄인다 */
  tickMs?: number;
  /** 입력 중 표시 전송 간격(ms, 기본 4000) */
  typingMs?: number;
  retryDelayMs?: number;
  /** 조회·경로 검증 워커 마감(ms), 기본 5000 */
  fsTimeoutMs?: number;
  /** 같은 메시지 연속 편집 최소 간격(ms) */
  editGapMs?: number;
  /** 시험 전용: offset 저장을 건너뛴다(작업 수락 뒤 offset 저장 전 크래시 구간 재현) */
  holdOffset?: boolean;
}

type Outcome = { kind: "done" } | { kind: "retry"; reason: HeldRecord["reason"] } | { kind: "stopping" } | { kind: "hold"; reason: HeldRecord["reason"] };

const DAY = 86_400_000;
const STALE_OFFSET_MS = 5 * DAY;
const MAX_AGE_S = 7 * 86_400;
const KINDS_TEXT: Record<string, string> = { backlog: "backlogs/BACKLOG.md", memory: ".pace/memory/status.md" };

/** 명령 안내 — 명령 하나당 한 줄 `/명령 `<인자>` — 설명`, 인자는 코드, 마지막은 문장 안내 한 줄 */
export function commandHelp(title: string, rows: readonly (readonly [string, string])[], footer: string): string {
  return [`**${title}**`, ...rows.map(([c, d]) => `${c} — ${d}`), "", footer].join("\n");
}

const GENERAL_HELP: readonly (readonly [string, string])[] = [
  ["/workspaces", "워크스페이스·토픽 목록"],
  ["/new `<이름>`", "daemon에 이미 추가한 워크스페이스의 토픽 생성"],
  ["/status", "기기 현황(LLM 없이 즉시)"],
  ["/held", "보류된 요청 보기"],
  ["/held clear `<update_id>`", "보류 기록 지우기"],
  ["/help", "이 도움말"],
];
const GENERAL_FOOTER = "General에서는 명령만 받는다 — 질문·작업은 프로젝트 토픽에서 보낸다.";
const LOCAL_WORKSPACE_ADD = "새 저장소를 등록하려면 로컬에서 `pace daemon workspace add`를 실행한다.";

const TOPIC_HELP: readonly (readonly [string, string])[] = [
  ["/status", "현황(LLM 없이 즉시)"],
  ["/queue", "진행·대기 작업 표"],
  ["/cancel `<작업 ID>`", "작업 취소"],
  ["/use `<워크트리>`", "이 토픽의 워크트리 선택(예: main, P035)"],
  ["/chain `<이름>`", "체인 바꾸기"],
  ["/write", "이 대화를 쓰기 허용으로(작업마다 승인)"],
  ["/read", "읽기 전용으로"],
  ["/pending", "대기 중인 승인 다시 표시"],
  ["/backlog", "백로그 보기"],
  ["/memory", "진행 메모 보기"],
  ["/workspaces", "워크스페이스·토픽 목록"],
  ["/help", "이 도움말"],
];
const TOPIC_FOOTER = "그 밖의 문장은 에이전트에게 보내는 질문입니다.";

/** API 원문에는 경로와 식별자가 들어갈 수 있어 결과 코드만 전달한다. */
function rejectedTopicState(error: TelegramApiError): TopicState {
  if (/not enough rights|rights to create|CHAT_ADMIN_REQUIRED|administrator rights|manage topics/i.test(error.message)) return "permission";
  if (/not a forum|topics? (are |is )?(disabled|not enabled)|forum.*(disabled|not enabled)/i.test(error.message)) return "not-forum";
  return "rejected";
}

function isParseError(error: unknown): boolean {
  return error instanceof TelegramApiError && error.definite && /can.?t parse entities|parse entities|unsupported start tag|unclosed|unmatched end tag/i.test(error.message);
}

export class TelegramAdapter implements ChannelAdapter {
  readonly name = "telegram";
  /** richBlocks=true·maxLength=Infinity — 코어가 text를 자르지 않게 하고 4096 분할은 어댑터가 한다 */
  // 진행 메시지를 보내거나 고치지 않는다 — 실행 중에는 입력 중 표시(busy)만 유지하고 최종 답변을 새 메시지로 보낸다
  readonly caps: ChannelCaps = { maxLength: Number.POSITIVE_INFINITY, canEdit: false, buttons: true, richBlocks: true, commandPrefix: "/", typing: true };
  private botUsername: string | undefined;
  private readonly typingState = new Map<string, { timer: NodeJS.Timeout; inflight: boolean; pauseUntil: number; warned: boolean }>();
  private readonly topicRequests = new Map<string, { registryId?: string; result: Promise<TopicState> }>();
  readonly stats = { rejectedUsers: 0, ignored: 0, held: 0 };
  state!: TelegramState;
  /** 폴링 상태: running · conflict(다른 기기가 같은 토큰을 씀) · unauthorized · stopped */
  status: "idle" | "running" | "conflict" | "unauthorized" | "stopped" = "idle";

  private readonly o: TelegramAdapterOptions;
  private sink!: ChannelSink;
  private stopped = false;
  private loopDone: Promise<void> = Promise.resolve();
  private tickTimer: NodeJS.Timeout | null = null;
  private readonly fs: FsWorker;
  private readonly attempts = new Map<number, number>();
  private readonly lastEdit = new Map<string, number>();
  private failing = false;
  private conflicts = 0;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: TelegramAdapterOptions) {
    this.o = options;
    this.fs = options.fsWorker ?? new FsWorker();
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => { const t = setTimeout(r, ms); t.unref(); }));
  }

  private now(): number { return (this.o.now ?? Date.now)(); }
  private log(event: string, fields: Record<string, unknown> = {}): void { this.o.log?.(`telegram_${event}`, fields); }
  private get chat(): string { return this.o.chatId; }
  private generalConv(): string { return `${this.chat}:0`; }
  private save(): void { saveTelegramState(this.o.host.stateFile, this.state); }

  /** 상태 변경 + 저장 — 저장이 실패하면 토픽 표·생성 의도·보류 기록을 변경 전 값으로 한꺼번에 되돌리고 false(실패한 변경이 이후 저장에 섞이지 않는다) */
  private commit(mutate: () => void): boolean {
    const snap = structuredClone({ topics: this.state.topics, provisioning: this.state.provisioning, held: this.state.held });
    mutate();
    try { this.save(); return true; }
    catch { this.state.topics = snap.topics; this.state.provisioning = snap.provisioning; this.state.held = snap.held; this.log("commit_failed", { reason: "state_write" }); return false; }
  }

  promoteLegacyWorkspace(name: string, id: string): void {
    const needsSave = Object.values(this.state.topics).includes(name) ||
      (Object.hasOwn(this.state.provisioning, name) && this.state.provisioning[name] === true);
    if (needsSave && !this.commit(() => { promoteLegacyBinding(this.state, name, id); })) {
      throw new WorkspaceError("기존 토픽 결속의 등록 ID를 기록하지 못했다");
    }
  }

  private bindingFor(ws: WorkspaceEntry): TopicBinding {
    return ws.registryId ? { name: ws.name, registryId: ws.registryId } : ws.name;
  }

  private bindingMatches(binding: TopicBinding, ws: WorkspaceEntry): boolean {
    if (topicName(binding) !== ws.name) return false;
    if (typeof binding === "string") return !ws.registryId;
    return ws.registryId === binding.registryId ||
      (!ws.registryId && this.o.host.matchesLegacyBinding?.(ws, binding.registryId) === true);
  }

  private topicWorkspace(binding: TopicBinding): WorkspaceEntry | undefined {
    return this.o.host.workspaces().find((ws) => this.bindingMatches(binding, ws));
  }

  isWorkspaceBound(entry: WorkspaceEntry): boolean {
    return Object.values(this.state.topics).some((binding) => this.bindingMatches(binding, entry));
  }

  // ---- 수명 ----

  /** 이 봇의 username(소문자 비교용) — 연결 때 getMe로 보관하고, 확인하지 못했으면 멘션이 올 때 한 번 더 시도한다. 모르면 null */
  private async botName(): Promise<string | null> {
    if (this.botUsername) return this.botUsername;
    try {
      const me = await this.o.api.call<{ username?: unknown }>("getMe");
      if (typeof me.username === "string" && me.username !== "") this.botUsername = me.username;
    } catch (error) { this.log("get_me_failed", { error: this.errText(error) }); }
    return this.botUsername ?? null;
  }

  async connect(sink: ChannelSink): Promise<void> {
    this.sink = sink;
    this.initState();
    this.stopped = false;
    this.status = "running";
    try { await this.o.api.call("setMyCommands", { scope: { type: "chat", chat_id: this.chatIdValue() }, commands: [
      { command: "status", description: "현황(LLM 없이 즉시)" }, { command: "workspaces", description: "워크스페이스·토픽 목록" }, { command: "use", description: "워크트리 선택" },
      { command: "write", description: "이 대화를 쓰기 허용으로(작업마다 승인)" }, { command: "read", description: "읽기 전용으로" }, { command: "cancel", description: "작업 취소" },
      { command: "pending", description: "대기 중인 승인 다시 표시" }, { command: "backlog", description: "백로그 보기" }, { command: "memory", description: "진행 메모 보기" }, { command: "help", description: "도움말" },
    ] }); } catch (error) { this.log("set_commands_failed", { error: this.errText(error) }); }
    void this.botName(); // username 확인(실패해도 계속)
    void this.notifyGeneral(`기기 ${this.o.host.device} 연결됨`);
    this.loopDone = this.loop();
    this.tickTimer = setInterval(() => { this.tick().catch((error) => this.log("tick_failed", { error: this.errText(error) })); }, this.o.tickMs ?? 60_000);
    this.tickTimer.unref();
  }

  async disconnect(): Promise<void> {
    this.stopped = true;
    this.status = this.status === "running" ? "stopped" : this.status;
    if (this.tickTimer) clearInterval(this.tickTimer);
    for (const st of this.typingState.values()) clearInterval(st.timer);
    this.typingState.clear();
    this.o.api.abort();
    this.fs.terminate();
    await Promise.race([this.loopDone, new Promise((r) => { const t = setTimeout(r, 5000); t.unref(); })]);
  }

  private chatIdValue(): number | string { return /^-?\d+$/.test(this.chat) ? Number(this.chat) : this.chat; }

  /** 시작 순서: 표식·offset 파일을 둘 다 저장한 뒤에만 처리를 시작한다. 손상·유실은 시작을 거부한다 */
  private initState(): void {
    const host = this.o.host;
    let loaded: TelegramState | null;
    try { loaded = loadTelegramState(host.stateFile); }
    catch (error) { throw new TelegramStateError(`${(error as Error).message} — 자동으로 비우지 않는다. 확인 뒤 \`pace daemon telegram reset-offset --yes\`로 초기화한다`); }
    const marker = host.readMarker();
    if (loaded) {
      if (loaded.forumKey && this.o.forumKey && loaded.forumKey !== this.o.forumKey) {
        throw new TelegramStateError("저장된 토픽 결속의 포럼이 설정과 다르다. 운영자가 기존 결속 상태를 확인해야 한다");
      }
      this.state = loaded;
      if (!loaded.forumKey && this.o.forumKey) {
        loaded.forumKey = this.o.forumKey;
        this.save();
      }
      if (!marker) host.writeMarker(); // 둘 중 하나만 저장된 채 종료된 경우 복구
      return;
    }
    if (marker || host.hasPriorActivity()) {
      throw new TelegramStateError("Telegram offset 파일이 없는데 이전 운영 흔적이 있어 시작하지 않는다(재전달 중복 방지). 의도한 초기화라면 `pace daemon telegram reset-offset --yes`");
    }
    this.state = emptyTelegramState();
    this.state.forumKey = this.o.forumKey;
    this.save();
    host.writeMarker();
  }

  // ---- 폴링 ----

  private async loop(): Promise<void> {
    let backoff = 1000;
    while (!this.stopped) {
      try {
        const stale = this.state.lastUpdateAt > 0 && this.now() - this.state.lastUpdateAt > STALE_OFFSET_MS;
        const params: Record<string, unknown> = { timeout: this.o.pollSeconds ?? 25, limit: 100, allowed_updates: ["message", "callback_query"] };
        if (this.state.offset > 0 && !stale) params.offset = this.state.offset; // 장기 무수신 뒤에는 offset을 생략해 무작위로 바뀐 update_id를 잃지 않는다
        const updates = await this.o.api.call<Record<string, unknown>[]>("getUpdates", params, { longPollSeconds: this.o.pollSeconds ?? 25 });
        this.conflicts = 0;
        backoff = 1000;
        // 수신 복구는 조용히 처리하고, 보류 중인 송신은 다시 시도한다.
        if (this.failing) { this.failing = false; this.tick().catch(() => undefined); }
        for (const u of updates) {
          if (this.stopped) break;
          const id = Number(u.update_id);
          let outcome: Outcome;
          try { outcome = await this.handleUpdate(u); }
          catch (error) { this.log("update_exception", { update_id: id, error: this.errText(error) }); outcome = { kind: "retry", reason: "exception" }; }
          if (outcome.kind === "stopping") { this.stopped = true; this.status = "stopped"; break; }
          if (outcome.kind === "retry") {
            const n = (this.attempts.get(id) ?? 0) + 1;
            this.attempts.set(id, n);
            if (n < 5) { await this.sleep(this.o.retryDelayMs ?? 1000); break; } // offset 유지 — 같은 update를 다시 받는다
            outcome = { kind: "hold", reason: outcome.reason };
          }
          if (outcome.kind === "hold") {
            if (!this.hold(u, outcome.reason)) { await this.sleep(this.o.retryDelayMs ?? 1000); break; } // 보류 저장 실패 — offset 진행 안 함
          }
          this.attempts.delete(id);
          await this.advance(id);
        }
      } catch (error) {
        if (this.stopped) break;
        const code = error instanceof TelegramApiError ? error.code : 0;
        if (code === 409) {
          if (++this.conflicts >= 3) { this.status = "conflict"; this.log("conflict", {}); this.stopped = true; break; }
        } else if (code === 401 || code === 403) {
          this.status = "unauthorized"; this.log("unauthorized", { code }); this.stopped = true; break;
        } else { this.failing = true; }
        this.log("poll_error", { code, error: this.errText(error) });
        await this.sleep(backoff);
        backoff = Math.min(backoff * 2, 30_000);
      }
    }
  }

  /** 마지막 update_id + 1로 offset을 갱신·저장한다(수락 뒤 저장 실패는 안내 없이 백오프 재시도) */
  private async advance(updateId: number): Promise<void> {
    this.state.offset = updateId + 1;
    this.state.lastUpdateAt = this.now();
    if (this.o.holdOffset) return;
    while (!this.stopped) {
      try { this.save(); return; } catch (error) { this.log("offset_save_failed", { error: this.errText(error) }); await this.sleep(this.o.retryDelayMs ?? 1000); }
    }
  }

  private hold(u: Record<string, unknown>, reason: HeldRecord["reason"]): boolean {
    const m = (u.message ?? (u.callback_query as { message?: unknown } | undefined)?.message) as { chat?: { id?: number }; message_thread_id?: number; date?: number } | undefined;
    const rec: HeldRecord = { update_id: Number(u.update_id), chat: String(m?.chat?.id ?? this.chat), thread: m?.message_thread_id ?? 0, date: Number(m?.date ?? Math.floor(this.now() / 1000)), reason, notified: false };
    const prev = this.state.held;
    this.state.held = trimHeld([...prev, rec]);
    try { this.save(); } catch (error) { this.state.held = prev; this.log("held_save_failed", { error: this.errText(error) }); return false; }
    this.stats.held++;
    void this.notifyHeld();
    return true;
  }

  /** 안내를 마치지 못한 보류 기록의 안내를 보낸다 — 성공해야 notified:true (최소 한 번 전달) */
  private async notifyHeld(): Promise<void> {
    for (const h of [...this.state.held]) {
      if (h.notified) continue;
      const text = h.reason === "summary" ? `처리하지 못한 요청 ${h.droppedCount ?? 0}건의 기록이 합쳐졌다 — 해당 토픽에 다시 보내 달라`
        : `update ${h.update_id}를 처리하지 못했다(${h.reason}) — 그 토픽에 다시 보내 달라`;
      try { await this.sendBlocks(this.generalConv(), [{ type: "text", text }]); } catch { return; }
      h.notified = true;
      try { this.save(); } catch { /* 다음 주기에 다시(중복 안내 가능 — 최소 한 번 전달) */ }
    }
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    try { await this.o.host.flushOutbox(); } catch (error) { this.log("flush_failed", { error: this.errText(error) }); }
    await this.notifyHeld();
  }

  // ---- 수신 ----

  private actorOf(conversation: string, user: string): Actor { return { channel: "telegram", conversation, user }; } // admin 없음(고정)

  private async handleUpdate(u: Record<string, unknown>): Promise<Outcome> {
    if (u.callback_query && typeof u.callback_query === "object") return this.handleCallback(u.callback_query as Record<string, unknown>);
    const m = u.message as Record<string, unknown> | undefined;
    if (!m || typeof m !== "object") { this.stats.ignored++; return { kind: "done" }; }
    const chat = m.chat as { id?: number | string; type?: string } | undefined;
    if (!chat || String(chat.id) !== this.chat) { this.stats.ignored++; return { kind: "done" }; }
    const from = m.from as { id?: number | string; is_bot?: boolean } | undefined;
    if (!from || from.is_bot === true || from.id === undefined || typeof m.text !== "string") { this.stats.ignored++; return { kind: "done" }; }
    const threadRaw = typeof m.message_thread_id === "number" ? m.message_thread_id : 0;
    const thread = threadRaw === 1 ? 0 : threadRaw;
    const conversation = `${this.chat}:${thread}`;
    const actor = this.actorOf(conversation, String(from.id));
    if (!this.o.host.isAllowed(actor)) { this.stats.rejectedUsers++; return { kind: "done" }; } // 완전 무응답
    const messageId = typeof m.message_id === "number" ? m.message_id : Number(u.update_id);
    const date = typeof m.date === "number" ? m.date : 0;
    if (date > 0 && Math.floor(this.now() / 1000) - date > MAX_AGE_S) { await this.say(conversation, "너무 오래된 메시지라 처리하지 않았다. 다시 보내 달라."); return { kind: "done" }; }
    let text = this.o.redact(m.text).trim();
    if (text.startsWith("/")) text = `/${text.slice(1).trimStart()}`; // "/ approve"처럼 슬래시 뒤 공백으로 명령 판별을 우회하지 못하게 정규화(코어도 트림 뒤 해석한다)
    // 그룹에서는 명령 메뉴 선택 때 `/status@봇이름`이 붙는다 — 이 봇을 가리키면 떼고, 다른 봇을 가리키면 응답하지 않는다(username은 getMe로 확인).
    // username을 확인하지 못했으면 누구를 가리키는지 알 수 없으므로 실행하지 않는다(안전 쪽 — `@` 없이 보내거나 getMe가 복구된 뒤 다시 보낸다)
    const mention = /^\/([A-Za-z0-9_]+)@([A-Za-z0-9_]+)(?=\s|$)/.exec(text);
    if (mention) {
      const me = await this.botName();
      if (me === null || me.toLowerCase() !== mention[2]!.toLowerCase()) { this.stats.ignored++; if (me === null) this.log("mention_unverified", {}); return { kind: "done" }; }
      text = `/${mention[1]}${text.slice(mention[0].length)}`;
    }
    const cmd = text.startsWith("/") ? text.slice(1).split(/\s+/)[0]!.toLowerCase() : null;
    const rest = cmd === null ? "" : text.slice(1 + text.slice(1).split(/\s+/)[0]!.length).trim();
    const key = `m${messageId}`;
    if (thread === 0) return this.general(conversation, cmd, rest);
    const binding = this.state.topics[String(thread)];
    if (!binding) return this.unregistered(conversation, thread, cmd, rest);
    const ws = this.topicWorkspace(binding);
    if (!ws) { await this.say(conversation, "토픽 결속과 현재 워크스페이스 등록이 일치하지 않는다"); return { kind: "done" }; }
    return this.topic(actor, ws.name, key, text, cmd, rest);
  }

  // ---- General ----

  private async general(conv: string, cmd: string | null, rest: string): Promise<Outcome> {
    switch (cmd) {
      case "workspaces": await this.say(conv, this.workspacesText()); break;
      case "status": {
        const o = this.o.host.overview();
        const lines = [`**기기 ${o.device}**`, `실행 ${o.running} · 대기 ${o.queued} · 격리 ${o.quarantined}`, ...Object.entries(o.byWorkspace).map(([n, v]) => `- \`${n}\` — 실행 ${v.running} · 대기 ${v.queued}`)];
        await this.say(conv, lines.join("\n")); break;
      }
      case "help": await this.say(conv, commandHelp("General 명령", GENERAL_HELP, GENERAL_FOOTER)); break;
      case "held": await this.heldCommand(conv, rest); break;
      case "new": await this.newCommand(conv, rest); break;
      default: await this.say(conv, commandHelp("General에서는 쓸 수 없다. 사용 가능한 명령", GENERAL_HELP, GENERAL_FOOTER));
    }
    return { kind: "done" };
  }

  private workspacesText(): string {
    const rows = this.o.host.workspaces().map((w) => `- \`${w.name}\` (${Object.keys(w.worktrees).join(", ")}) — ${this.isWorkspaceBound(w) ? "토픽 결속" : "토픽 없음"}${Object.hasOwn(this.state.provisioning, w.name) ? " [생성 결과 불명: 토픽에서 /bind]" : ""}`);
    return rows.length ? ["**워크스페이스**", ...rows].join("\n") : `등록된 워크스페이스가 없다.\n${LOCAL_WORKSPACE_ADD}`;
  }

  private async heldCommand(conv: string, rest: string): Promise<void> {
    const [sub, id] = rest.split(/\s+/);
    if (sub === "clear" && id) {
      const n = Number(id);
      const before = this.state.held.length;
      if (!this.commit(() => { this.state.held = this.state.held.filter((h) => h.update_id !== n); })) { await this.say(conv, "저장하지 못했다"); return; }
      await this.say(conv, before === this.state.held.length ? "그 기록이 없다" : "지웠다");
      return;
    }
    const rows = this.state.held.map((h) => h.reason === "summary" ? `· 합쳐진 기록 ${h.droppedCount ?? 0}건` : `· update ${h.update_id} (${h.reason}${h.notified ? "" : ", 안내 대기"})`);
    await this.say(conv, rows.length ? `${rows.join("\n")}
/held clear \`<update_id>\` — 기록 지우기` : "보류된 요청이 없다");
  }

  /** 경로 생략은 daemon 설정의 공개 목록에 있는 대상만 사용한다. */
  private async newCommand(conv: string, rest: string): Promise<void> {
    if (!WORKSPACE_NAME.test(rest)) {
      await this.say(conv, `사용법\n/new \`<이름>\` — daemon에 추가된 워크스페이스의 토픽 생성\n${LOCAL_WORKSPACE_ADD}`);
      return;
    }
    const ws = this.o.host.workspaces().find((entry) => entry.name === rest);
    if (!ws) { await this.say(conv, `daemon에 등록된 워크스페이스가 아니다: ${rest}`); return; }
    await this.say(conv, topicStateText(await this.ensureWorkspaceTopic(ws), ws.name));
  }

  /** Gateway와 General이 쓰는 공통 생성 경로. 검증한 CLI 승인 요청은 코어에서 이미 신원을 대조했다. */
  ensureWorkspaceTopic(ws: WorkspaceEntry, rootVerified = false): Promise<TopicState> {
    if (this.stopped || this.status !== "running") return Promise.resolve("unavailable");
    const existing = this.topicRequests.get(ws.name);
    if (existing) {
      const intent = this.currentIntent(ws.name);
      if (existing.registryId !== ws.registryId && !(existing.registryId === undefined && intent === ws.registryId)) {
        return Promise.resolve("conflict");
      }
      this.log("topic_request_joined", { workspace: ws.name });
      return existing.result;
    }
    const result = this.createWorkspaceTopic(ws, rootVerified).catch((): TopicState => {
      this.log("topic_request_failed", { workspace: ws.name });
      return this.currentIntent(ws.name) === undefined ? "unavailable-workspace" : "unknown";
    }).finally(() => this.topicRequests.delete(ws.name));
    this.topicRequests.set(ws.name, { registryId: ws.registryId, result });
    return result;
  }

  private currentIntent(name: string): true | string | undefined {
    return Object.hasOwn(this.state.provisioning, name) ? this.state.provisioning[name] : undefined;
  }

  private async createWorkspaceTopic(ws: WorkspaceEntry, rootVerified: boolean): Promise<TopicState> {
    const { name, registryId } = ws;
    if (!rootVerified && !await this.workspaceRootAvailable(ws)) return "unavailable-workspace";
    if (this.stopped || this.status !== "running") return "unavailable";
    const current = this.o.host.workspaces().find((item) => item.name === name);
    if (!current || current.registryId !== registryId || current.path !== ws.path) return "unavailable-workspace";
    if (this.isWorkspaceBound(current)) return "already-bound";
    if (Object.values(this.state.topics).some((binding) => topicName(binding) === name)) return "conflict";
    const intent = this.currentIntent(name);
    if (intent !== undefined) return intent === (registryId ?? true) ? "unknown" : "conflict";
    if (!this.commit(() => { this.state.provisioning[name] = registryId ?? true; })) return "intent-write-failed";
    const unknown = (reason: "api_uncertain" | "invalid_result" | "thread_in_use" | "intent_changed"): TopicState => {
      this.log("topic_result_unknown", { reason });
      return "unknown";
    };
    try {
      const topic = await this.o.api.call<{ message_thread_id: number; name: string }>("createForumTopic", { chat_id: this.chatIdValue(), name });
      if (topic?.name !== name || !Number.isSafeInteger(topic.message_thread_id) || topic.message_thread_id <= 1) return unknown("invalid_result");
      const thread = String(topic.message_thread_id);
      if (Object.hasOwn(this.state.topics, thread)) return unknown("thread_in_use");
      const entry = this.o.host.workspaces().find((item) => item.name === name);
      if (!entry || this.currentIntent(name) !== (entry.registryId ?? true)) return unknown("intent_changed");
      return this.commit(() => { this.state.topics[thread] = this.bindingFor(entry); delete this.state.provisioning[name]; })
        ? "bound" : "binding-write-failed";
    } catch (error) {
      if (!(error instanceof TelegramApiError) || !error.definite) return unknown("api_uncertain");
      // 확정 거부의 정리 저장이 실패하면 기존 의도가 유지돼 중복 요청을 막는다.
      this.commit(() => { delete this.state.provisioning[name]; });
      return rejectedTopicState(error);
    }
  }

  // ---- 미등록 토픽 ----

  private async unregistered(conv: string, thread: number, cmd: string | null, rest: string): Promise<Outcome> {
    if (cmd === "bind") {
      const name = rest.split(/\s+/)[0] ?? "";
      const ws = this.o.host.workspaces().find((w) => w.name === name);
      if (!ws) await this.say(conv, `등록된 워크스페이스가 아니다: ${name || "(이름 없음)"}`);
      else if (ws.registryId && !await this.workspaceRootAvailable(ws)) await this.say(conv, "워크스페이스의 활성 등록을 확인할 수 없다");
      else if (this.topicRequests.has(name)) await this.say(conv, "토픽 생성 요청을 처리 중이다. 결과를 확인한 뒤 /bind를 다시 보낸다");
      else if (Object.values(this.state.topics).some((binding) => topicName(binding) === name)) await this.say(conv, "그 워크스페이스는 이미 다른 토픽에 결속돼 있다");
      else {
        const intent = this.currentIntent(name);
        if (intent !== undefined && intent !== (ws.registryId ?? true)) {
          await this.say(conv, "토픽 생성 의도와 현재 워크스페이스 등록이 일치하지 않는다");
          return { kind: "done" };
        }
        if (this.commit(() => { this.state.topics[String(thread)] = this.bindingFor(ws); delete this.state.provisioning[name]; })) await this.say(conv, `결속했다: ${name}`);
        else await this.say(conv, "저장하지 못해 결속하지 않았다");
      }
      return { kind: "done" };
    }
    await this.say(conv, ["이 토픽은 등록되지 않았다.", "/bind `<워크스페이스 이름>` — 이미 만든 토픽이면 여기서 결속", "General에서 /new `<이름>` — daemon에 추가된 워크스페이스의 토픽 생성", LOCAL_WORKSPACE_ADD].join("\n"));
    return { kind: "done" };
  }

  private async workspaceRootAvailable(ws: WorkspaceEntry): Promise<boolean> {
    const root = this.o.host.workspaceRootInfo(ws.name);
    const home = this.o.host.registryHome;
    if (!root || (ws.registryId && !home)) return false;
    const registration = ws.registryId && home ? { home, registryId: ws.registryId, root } : undefined;
    const result = await this.fs.run({ op: "validate", path: ws.path, registration }, this.o.fsTimeoutMs ?? 5000);
    return result.ok && "real" in result && sameWorkspaceRoot(root, result);
  }

  // ---- 등록 토픽 ----

  /** 토픽의 /use — 이 토픽의 워크스페이스 안 워크트리만 고른다(`<워크트리>` 또는 `<이 워크스페이스>/<워크트리>`). 다른 워크스페이스는 그 토픽에서 하라고 안내하고, 목록에는 이 토픽의 워크트리만 보인다 */
  private useTarget(ws: string, rest: string): { ok: true; name: string } | { ok: false; text: string } {
    const names = Object.keys(this.o.host.workspaces().find((w) => w.name === ws)?.worktrees ?? {});
    const list = [`이 토픽(\`${ws}\`)의 워크트리:`, ...names.map((n) => `- \`${n}\``)];
    const arg = rest.split(/\s+/)[0] ?? "";
    if (arg === "") return { ok: false, text: ["사용법", `/use \`<워크트리>\` — 이 토픽의 워크트리 선택(예: ${names.find((n) => n !== "main") ?? "main"})`, ...list].join("\n") };
    let name = arg;
    if (arg.includes("/")) {
      const [w, n = ""] = arg.split("/");
      if (w !== ws) return { ok: false, text: [`워크스페이스 \`${w}\`는 그 워크스페이스의 토픽에서 고른다. 이 토픽에서는 \`${ws}\`의 워크트리만 고를 수 있다.`, ...list].join("\n") };
      name = n === "" ? "main" : n;
    }
    if (!names.includes(name)) return { ok: false, text: [`알 수 없는 워크트리: \`${name}\``, ...list].join("\n") };
    return { ok: true, name };
  }

  private async topic(actor: Actor, ws: string, key: string, text: string, cmd: string | null, rest: string): Promise<Outcome> {
    const conv = actor.conversation;
    let forward = text;
    if (cmd !== null) {
      switch (cmd) {
        case "workspaces": await this.say(conv, this.workspacesText()); return { kind: "done" };
        case "help": await this.say(conv, commandHelp("명령", TOPIC_HELP, TOPIC_FOOTER)); return { kind: "done" };
        case "backlog": case "memory": this.lookup(conv, ws, cmd); return { kind: "done" };
        case "pending": await this.pending(actor); return { kind: "done" };
        case "approve": case "deny": await this.say(conv, "승인·거부는 버튼으로 한다(버튼이 안 보이면 /pending)"); return { kind: "done" };
        case "new": case "held": await this.say(conv, "General에서만 쓸 수 있는 명령이다"); return { kind: "done" };
        case "bind": await this.say(conv, "이 토픽은 이미 등록돼 있다"); return { kind: "done" };
        case "write": forward = "/access write"; break;
        case "read": forward = "/access read-only"; break;
        case "use": {
          const r = this.useTarget(ws, rest);
          if (!r.ok) { await this.say(conv, r.text); return { kind: "done" }; }
          forward = `/use ${ws}/${r.name}`; break;
        }
        case "status": case "queue": case "cancel": case "chain": case "access": case "approve": case "deny": break; // 코어 결정적 명령
        default: await this.say(conv, commandHelp("알 수 없는 명령 — 사용 가능한 명령", TOPIC_HELP, TOPIC_FOOTER)); return { kind: "done" };
      }
    }
    const r: IngestResult = await this.sink.message({ ...actor, messageId: key, text: forward, bindWorkspace: ws });
    return this.classify(r);
  }

  private classify(r: IngestResult): Outcome {
    switch (r.kind) {
      case "task": case "command": case "duplicate": return { kind: "done" };
      case "stopping": return { kind: "stopping" };
      case "rejected":
        if (r.reason === "상태 저장 실패") return { kind: "retry", reason: "store_failed" };
        if (r.reason === "수신 기록 포화") return { kind: "hold", reason: "saturated" };
        return { kind: "done" }; // 판정 거절(대상 없음 등) — 코어가 사용자에게 알렸다
    }
  }

  private async pending(actor: Actor): Promise<void> {
    const list = this.o.host.pendingApprovals(actor);
    if (list.length === 0) { await this.say(actor.conversation, "대기 중인 승인이 없다"); return; }
    for (const p of list) { try { await this.askApproval(actor.conversation, p); } catch (error) { this.log("pending_resend_failed", { error: this.errText(error) }); } }
  }

  /** /backlog·/memory — 접수 안내는 기다리지 않고 update를 끝낸다. 파일 작업은 워커(마감 5초, 동시 1개) */
  private lookup(conv: string, ws: string, kind: "backlog" | "memory"): void {
    const info = this.o.host.workspaceRootInfo(ws);
    if (!info) { void this.say(conv, "조회할 수 없다(워크스페이스 경로를 확인하지 못했다)"); return; }
    const id = this.o.host.workspaces().find((entry) => entry.name === ws)?.registryId;
    const home = this.o.host.registryHome;
    if (id && !home) { void this.say(conv, "조회할 수 없다(워크스페이스 등록부를 확인하지 못했다)"); return; }
    const ack = this.say(conv, "조회 중…");
    void (async () => {
      const registration = id && home ? { home, registryId: id, root: info } : undefined;
      const r = await this.fs.run({ op: "read", root: info, rel: KINDS_TEXT[kind]!, maxBytes: 65_536, maxLines: kind === "backlog" ? 40 : undefined, registration }, this.o.fsTimeoutMs ?? 5000);
      await ack;
      if (!r.ok) {
        const msg: Record<string, string> = { busy: "이전 조회가 진행 중이다", timeout: "조회가 지연돼 건너뛴다", root_changed: "워크스페이스 경로가 바뀌어 거부한다", registry_changed: "조회할 수 없다(워크스페이스 등록이 바뀌었다)", outside_root: "워크스페이스 밖을 가리키는 파일이라 거부한다", not_found: "파일이 없다", not_file: "일반 파일이 아니라 거부한다", changed: "읽는 도중 파일이 바뀌어 거부한다" };
        await this.say(conv, msg[r.error] ?? `조회하지 못했다(${r.error})`);
        return;
      }
      if (!("text" in r)) return;
      await this.say(conv, `${r.text || "(비어 있음)"}${r.truncated ? "\n(잘림)" : ""}`);
    })();
  }

  // ---- 승인 콜백 ----

  private async handleCallback(cq: Record<string, unknown>): Promise<Outcome> {
    const msg = cq.message as { chat?: { id?: number | string }; message_thread_id?: number; message_id?: number } | undefined;
    // ⓐ 위치를 확인할 수 없거나 다른 chat
    if (!msg || !msg.chat || String(msg.chat.id) !== this.chat) { this.stats.ignored++; return { kind: "done" }; }
    const threadRaw = typeof msg.message_thread_id === "number" ? msg.message_thread_id : 0;
    const thread = threadRaw === 1 ? 0 : threadRaw;
    // ⓑ 등록된 토픽의 버튼만
    const binding = this.state.topics[String(thread)];
    if (thread === 0 || !binding || !this.topicWorkspace(binding)) { this.stats.ignored++; return { kind: "done" }; }
    const from = cq.from as { id?: number | string; is_bot?: boolean } | undefined;
    if (!from || from.id === undefined || from.is_bot === true) { this.stats.ignored++; return { kind: "done" }; }
    const conversation = `${this.chat}:${thread}`;
    const actor = this.actorOf(conversation, String(from.id));
    // ⓒ 허용 사용자
    if (!this.o.host.isAllowed(actor)) { this.stats.rejectedUsers++; return { kind: "done" }; }
    // ⓓ 형식
    const m = typeof cq.data === "string" ? CALLBACK_RE.exec(cq.data) : null;
    if (!m) { this.stats.ignored++; return { kind: "done" }; }
    const r = await this.sink.approval(m[1]!, actor, m[2] === "y" ? "approve" : "reject");
    // 판정 전 저장 실패는 수락 전 실패 — 재시도 대상
    if (!r.ok && r.reason === "상태 저장 실패") return { kind: "retry", reason: "store_failed" };
    const cqId = String(cq.id ?? "");
    // 수락 이후(판정 완료·판정 거절)의 안내 실패는 재시도·보류 없이 로그만
    try { await this.o.api.call("answerCallbackQuery", { callback_query_id: cqId, text: r.ok ? (m[2] === "y" ? "승인했다" : "거부했다") : (r.reason ?? "처리하지 못했다").slice(0, 190) }); } catch (error) { this.log("answer_failed", { error: this.errText(error) }); }
    if (r.ok || /이미 처리됨|만료|이전 기동/.test(r.reason ?? "")) {
      try { await this.o.api.call("editMessageReplyMarkup", { chat_id: this.chatIdValue(), message_id: msg.message_id, reply_markup: { inline_keyboard: [] } }); } catch (error) { this.log("markup_edit_failed", { error: this.errText(error) }); }
    }
    return { kind: "done" };
  }

  // ---- 송신 ----

  private errText(error: unknown): string { return this.o.redact(String((error as Error)?.message ?? error)).slice(0, 200); }

  private threadParams(conversation: string): { chat_id: number | string; message_thread_id?: number } {
    const [chat, thread] = conversation.split(":");
    const t = Number(thread);
    return { chat_id: /^-?\d+$/.test(chat ?? "") ? Number(chat) : (chat ?? this.chat), ...(t > 0 ? { message_thread_id: t } : {}) };
  }

  /** 자체 응답 — 최선 노력(실패는 로그만, 처리 루프를 막지 않는다) */
  private async say(conversation: string, text: string): Promise<void> {
    try { await this.sendBlocks(conversation, [{ type: "text", text }]); } catch (error) { this.log("reply_failed", { error: this.errText(error) }); }
  }

  private async notifyGeneral(text: string): Promise<void> { await this.say(this.generalConv(), text); }

  /** HTML 해석 오류(서식이 서버에서 거절됨)면 태그를 지운 평문으로 한 번 더 보낸다 — 서식 때문에 답변이 사라지지 않게 */
  private async sendOnce(conversation: string, html: string, extra: Record<string, unknown> = {}): Promise<number> {
    let last: unknown;
    for (let i = 0; i < 2; i++) { // 한 번 더 시도
      try {
        const r = await this.o.api.call<{ message_id: number }>("sendMessage", { ...this.threadParams(conversation), text: html, parse_mode: "HTML", ...extra });
        return r.message_id;
      } catch (error) {
        last = error;
        if (this.o.api.aborted) break;
        if (isParseError(error)) {
          try {
            this.log("html_fallback", { error: this.errText(error) });
            const r = await this.o.api.call<{ message_id: number }>("sendMessage", { ...this.threadParams(conversation), text: plainFromHtml(html), ...extra });
            return r.message_id;
          } catch (error2) { last = error2; break; }
        }
      }
    }
    throw last;
  }

  private async sendDoc(conversation: string, name: string, content: string): Promise<void> {
    let last: unknown;
    for (let i = 0; i < 2; i++) {
      try {
        const p = this.threadParams(conversation);
        await this.o.api.form("sendDocument", () => {
          const f = new FormData();
          f.set("chat_id", String(p.chat_id));
          if (p.message_thread_id) f.set("message_thread_id", String(p.message_thread_id));
          f.set("document", new Blob([content], { type: "text/plain" }), name);
          return f;
        });
        return;
      } catch (error) { last = error; if (this.o.api.aborted) break; }
    }
    throw last;
  }

  /**
   * 필수 조각 전달이 재시도 후에도 실패하면 예외를 던진다(부분 전달도 예외 — 코어는 정상 반환을 전달 완료로 본다).
   * 실패 안내 한 줄은 최선 노력이며 그 송신까지 실패해도 원래 예외가 전파된다.
   */
  private async sendBlocks(conversation: string, blocks: Block[], editRef?: string, markup?: unknown): Promise<string | null> {
    const rendered = renderBlocks(blocks, this.o.redact);
    let first: string | null = null;
    let failure: unknown = null;
    for (let i = 0; i < rendered.parts.length; i++) {
      const html = rendered.parts[i]!;
      try {
        if (i === 0 && editRef) { await this.edit1(editRef, html, markup); first = editRef; }
        else {
          const id = await this.sendOnce(conversation, html, i === 0 && markup ? { reply_markup: markup } : {});
          if (i === 0) first = `${conversation}:${id}`;
        }
      } catch (error) { failure ??= error; }
    }
    for (const f of rendered.files) {
      try { await this.sendDoc(conversation, f.name, f.content); } catch (error) { failure ??= error; }
    }
    if (failure) {
      try { await this.sendOnce(conversation, escapeHtml("(결과 일부를 전달하지 못했다)")); } catch { /* 최선 노력 */ }
      throw failure;
    }
    return first;
  }

  private async edit1(ref: string, html: string, markup?: unknown): Promise<void> {
    const parts = ref.split(":");
    const messageId = Number(parts.pop());
    const conversation = parts.join(":");
    const gap = this.o.editGapMs ?? 1100;
    const last = this.lastEdit.get(ref) ?? 0;
    const wait = gap - (this.now() - last);
    if (wait > 0) await this.sleep(wait);
    this.lastEdit.set(ref, this.now());
    if (this.lastEdit.size > 500) { const oldest = this.lastEdit.keys().next().value; if (oldest !== undefined) this.lastEdit.delete(oldest); } // 상한 — 메모리가 작업 수에 비례해 늘지 않게
    const p = this.threadParams(conversation);
    try {
      await this.o.api.call("editMessageText", { chat_id: p.chat_id, message_id: messageId, text: html, parse_mode: "HTML", ...(markup ? { reply_markup: markup } : {}) });
    } catch (error) {
      if (error instanceof TelegramApiError && /message is not modified/i.test(error.message)) return;
      if (isParseError(error)) {
        this.log("html_fallback", { error: this.errText(error) });
        await this.o.api.call("editMessageText", { chat_id: p.chat_id, message_id: messageId, text: plainFromHtml(html), ...(markup ? { reply_markup: markup } : {}) });
        return;
      }
      throw error;
    }
  }

  // ---- ChannelAdapter 규격 ----

  /** 작업이 실행 중인 동안 그 토픽에 sendChatAction typing을 약 4초마다 보낸다(대기·승인 대기·종료 때 중단). 실패는 작업에 영향이 없고 429는 retry_after만큼 쉰다 */
  busy(conversation: string, taskId: string, on: boolean): void {
    const cur = this.typingState.get(taskId);
    if (!on) { if (cur) { clearInterval(cur.timer); this.typingState.delete(taskId); } return; }
    if (cur || this.stopped) return;
    const st = { timer: undefined as unknown as NodeJS.Timeout, inflight: false, pauseUntil: 0, warned: false };
    const tick = (): void => {
      if (st.inflight || this.stopped || this.now() < st.pauseUntil) return;
      st.inflight = true;
      this.o.api.call("sendChatAction", { ...this.threadParams(conversation), action: "typing" })
        .catch((error: unknown) => {
          if (error instanceof TelegramApiError && error.code === 429) st.pauseUntil = this.now() + Math.max(1, error.retryAfter ?? 5) * 1000;
          else if (!st.warned) { st.warned = true; this.log("typing_failed", { error: this.errText(error) }); }
        })
        .finally(() => { st.inflight = false; });
    };
    st.timer = setInterval(tick, this.o.typingMs ?? 4000);
    st.timer.unref();
    this.typingState.set(taskId, st);
    tick();
  }

  async send(conversation: string, blocks: Block[]): Promise<string | null> {
    return this.sendBlocks(conversation, blocks);
  }

  async edit(conversation: string, ref: string, blocks: Block[]): Promise<void> {
    await this.sendBlocks(conversation, blocks, ref);
  }

  /** 어댑터가 직접 만든 임시 파일만 보낸다 — 임의 경로 송신 경로를 만들지 않는다 */
  async sendFile(_conversation: string, _path: string, _name?: string): Promise<void> {
    throw new Error("파일을 보낼 수 없다(not_own_file)");
  }

  async askApproval(conversation: string, prompt: ApprovalPrompt): Promise<void> {
    const text = approvalText(prompt, this.o.redact);
    let last: unknown;
    for (let i = 0; i < 2; i++) {
      try {
        await this.o.api.call("sendMessage", { ...this.threadParams(conversation), text, parse_mode: "HTML", reply_markup: approvalKeyboard(prompt.id) });
        return;
      } catch (error) { last = error; if (this.o.api.aborted) break; }
    }
    throw last;
  }
}
