// daemon 공통 타입 — 채널 어댑터 규격·수신·블록·이벤트·작업 기록 (P035 T04, BR04). 채널은 코어를 모르고 이 규격만 구현한다.

export type Access = "read-only" | "write";

/** 응답 블록. card·chart는 이후 카드·차트용 예약 자리 — 어댑터가 미지원이면 텍스트로 내린다 */
export type Block =
  | { type: "text"; text: string }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "code"; text: string; lang?: string }
  | { type: "diff"; text: string }
  | { type: "file"; path: string; name?: string }
  | { type: "card"; title: string; text: string }
  | { type: "chart"; title: string; data: unknown };

export interface ChannelCaps {
  maxLength: number;
  canEdit: boolean;
  buttons: boolean;
  richBlocks: boolean;
  /** 결정적 명령 접두사(예: "/") */
  commandPrefix: string;
  /** 진행 메시지를 보내지 않고 실행 중 "입력 중" 표시(`busy`)로 대신한다 — 시작·진행 메시지 없이 최종 답변만 새 메시지로 보낸다 */
  typing?: boolean;
}

/** 대화 위치 — 채널·대화·사용자 */
export interface Actor {
  channel: string;
  conversation: string;
  user: string;
  /** Gateway 토큰 소지자(기기 관리자) — 모든 대화의 작업·승인에 접근한다 */
  admin?: boolean;
}

export interface Inbound extends Actor {
  /** 채널이 정한 메시지 ID — 같은 (채널·대화·메시지) 입력을 두 번 실행하지 않는 키 */
  messageId: string;
  text: string;
  /** 신뢰하는 어댑터(Telegram 등)만 채운다 — 이 대화를 그 워크스페이스에 결속한다(Gateway는 채우지 않는다) */
  bindWorkspace?: string;
}

export type IngestResult =
  | { kind: "task"; taskId: string; status: TaskStatus }
  | { kind: "command"; blocks: Block[] }
  | { kind: "duplicate" }
  | { kind: "rejected"; reason: string }
  | { kind: "stopping" };

export interface ApprovalPrompt {
  id: string;
  taskId: string;
  kind: ApprovalKind;
  detail: string;
  expiresAt: number;
  access: Access;
  worktree: string;
}

export interface ChannelSink {
  message(m: Inbound): Promise<IngestResult>;
  approval(id: string, from: Actor, decision: "approve" | "reject"): Promise<{ ok: boolean; reason?: string }>;
  cancel(taskId: string, from: Actor): Promise<{ ok: boolean; reason?: string }>;
}

export interface ChannelAdapter {
  readonly name: string;
  readonly caps: ChannelCaps;
  connect(sink: ChannelSink): Promise<void>;
  disconnect(): Promise<void>;
  /** 메시지를 보내고 수정에 쓸 참조를 돌려준다(수정 불가면 null) */
  send(conversation: string, blocks: Block[]): Promise<string | null>;
  edit?(conversation: string, ref: string, blocks: Block[]): Promise<void>;
  sendFile?(conversation: string, path: string, name?: string): Promise<void>;
  askApproval?(conversation: string, prompt: ApprovalPrompt): Promise<void>;
  /** caps.typing 채널 — 작업이 실행 중인 동안 입력 중 표시를 켜고(on) 끈다(대기·승인 대기·종료 때 끈다). 실패해도 작업에는 영향이 없다 */
  busy?(conversation: string, taskId: string, on: boolean): void;
}

// 어댑터 계약(T05): send·edit·askApproval은 필수 조각 전달이 재시도 후에도 실패하면 예외를 던진다 —
// 코어는 정상 반환을 전달 완료로 해석한다(복구 알림 outbox는 send가 정상 반환할 때만 지운다).

export type TaskStatus =
  | "queued"
  | "awaiting_approval"
  | "preparing"
  | "running"
  | "done"
  | "failed"
  | "cancelled"
  | "handoff"
  | "handoff_acknowledged"
  | "interrupted"
  | "needs_review"
  | "denied"
  | "expired";

export const ACTIVE_STATUSES: TaskStatus[] = ["queued", "awaiting_approval", "preparing", "running"];

export interface Target {
  workspace: string;
  worktreeName: string;
  /** 수신 때 확정한 실경로와 식별자 */
  worktree: string;
  dev: string;
  ino: string;
  chain: string;
  access: Access;
  /** 세션 보관 키 = 대화·워크트리·체인·access */
  sessionKey: string;
}

export type ApprovalKind = "write_start" | "tool" | "handoff";
export type ApprovalState = "pending" | "approved" | "rejected" | "expired" | "invalidated";

export interface Approval {
  id: string;
  taskId: string;
  kind: ApprovalKind;
  state: ApprovalState;
  detail: string;
  scope: { access: Access; worktree: string; chain: string };
  requester: Actor;
  expiresAt: number;
  bootId: string;
  createdAt: number;
  decidedAt?: number;
}

export interface ProcRef {
  pid: number;
  startedAt: number;
}

export interface Task {
  id: string;
  status: TaskStatus;
  createdAt: number;
  updatedAt: number;
  origin: Actor & { messageId: string };
  /** 실행에 쓰는 프롬프트 — 종료 상태가 되면 비운다 */
  prompt: string;
  target: Target;
  bootId: string;
  approvalId?: string;
  /** 쓰기 작업의 시작 직전 변경 스냅샷(JSON) */
  snapshot?: unknown;
  procs: ProcRef[];
  /** 종료 때 실행자가 회수를 확인했는가 */
  cleanup?: "confirmed" | "unconfirmed";
  summary?: string;
  summaryPending?: boolean;
  result?: { text: string; detail?: string; nextRetryAt?: string | null; via?: string };
  note?: string;
}

export interface SavedSessionRecord {
  sessionId: string;
  agent: "claude" | "codex";
  cwd: string;
  access: Access;
  conversation: string;
  worktree: string;
  chain: string;
  /** 다음 요청이 새 세션으로 넘어갈 때 인계할 직전 응답 발췌 */
  lastText: string;
}

export interface Conversation {
  workspace: string;
  worktreeName: string;
  chain: string;
  access: Access;
  saved?: SavedSessionRecord;
}

export interface Notice {
  id: string;
  channel: string;
  conversation: string;
  text: string;
}

export interface QuarantineEntry {
  key: string;
  worktree: string;
  since: number;
  reason: string;
  taskId: string;
}

export interface DaemonEvent {
  seq: number;
  ts: number;
  taskId: string | null;
  channel: string | null;
  conversation: string | null;
  type: "status" | "text_delta" | "tool" | "plan" | "approval" | "raw" | "final" | "notice";
  data: Record<string, unknown>;
}

// ---- 실행자 계약 ----

export interface RunJob {
  taskId: string;
  prompt: string;
  target: Target;
  conversation: string;
  saved: SavedSessionRecord | null;
}

export interface RunCtl {
  signal: AbortSignal;
  /** 에이전트 진행 이벤트(ACP session/update 원본) */
  update(update: Record<string, unknown>): void;
  /** 자식 프로세스가 생기면 곧바로 알린다 — 강제 종료 뒤 회수 확인에 쓴다 */
  onProcess(proc: ProcRef): void;
  /** 도구 권한 승인 요청 — 승인되면 true */
  requestApproval(detail: string): Promise<boolean>;
}

export interface RunResult {
  status: "done" | "failed" | "handoff" | "cancelled";
  text: string;
  detail?: string;
  /** 프로세스 회수 확인 여부 — 표지가 없거나 던지면 미확인으로 본다 */
  cleanupUnconfirmed: boolean;
  session?: { sessionId: string; agent: "claude" | "codex"; cwd: string; access: Access } | null;
  nextRetryAt?: string | null;
  /** 처리한 체인 단계 표시(예: claude/acp → codex/-p) */
  via?: string;
  /** handoff_required의 인계 내용 요약 */
  handoff?: string;
  /** 쓰기 변경 요약(사람이 이어받을 때) */
  changes?: string;
}

export type Runner = (job: RunJob, ctl: RunCtl) => Promise<RunResult>;
