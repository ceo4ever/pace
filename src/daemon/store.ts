import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "../core/fsutil.ts";
import { redactDeep, type Redactor } from "./secrets.ts";
import type { Approval, Conversation, Notice, QuarantineEntry, Task } from "./types.ts";

// 상태 저장 — PACE_HOME/daemon/state.json. 변경마다 원자적 쓰기(임시 파일+rename), 손상은 기동 거부(조용히 비우지 않음).

export class StateError extends Error {}

export interface State {
  version: 1;
  tasks: Record<string, Task>;
  conversations: Record<string, Conversation>;
  approvals: Record<string, Approval>;
  /** channel:conversation:messageId → 처리 시각 */
  seen: Record<string, number>;
  quarantine: Record<string, QuarantineEntry>;
  outbox: Notice[];
}

export const SEEN_TTL_MS = 7 * 24 * 3600 * 1000;
export const SEEN_MAX = 10_000;
/** 이 기간 안의 수신 기록은 개수 상한으로 지우지 않는다 — Telegram은 미확인 update를 24시간까지 재전달한다 */
export const SEEN_PROTECT_MS = 24 * 3600 * 1000;
/** 보호 기간 안 항목만으로 닿는 하드 상한 — 닿으면 지우지 않고 새 수신을 거절한다 */
export const SEEN_HARD_MAX = 100_000;

export function emptyState(): State {
  return { version: 1, tasks: {}, conversations: {}, approvals: {}, seen: {}, quarantine: {}, outbox: [] };
}

function validate(value: unknown): State {
  const bad = (m: string): never => { throw new StateError(`상태 파일이 올바르지 않다: ${m}`); };
  if (typeof value !== "object" || value === null || Array.isArray(value)) bad("객체가 아니다");
  const v = value as Record<string, unknown>;
  if (v.version !== 1) bad("지원하지 않는 version");
  for (const key of ["tasks", "conversations", "approvals", "seen", "quarantine"]) {
    if (typeof v[key] !== "object" || v[key] === null || Array.isArray(v[key])) bad(`${key}가 객체가 아니다`);
  }
  if (!Array.isArray(v.outbox)) bad("outbox가 배열이 아니다");
  for (const [id, t] of Object.entries(v.tasks as Record<string, Task>)) {
    if (!t || typeof t !== "object" || t.id !== id || typeof t.status !== "string" || !t.target || typeof t.target.worktree !== "string") bad(`작업 ${id}`);
  }
  return value as State;
}

export class StateStore {
  readonly file: string;
  state: State;
  /** 쓰기 실패 주입(시험용) */
  failWrites = false;
  /** 저장 직전 직렬화 값·키에 적용하는 비밀 제거(생성 뒤 주입 — 기동 복구 전에 설정한다) */
  redact: Redactor | null = null;
  seenHardMax = SEEN_HARD_MAX;

  private constructor(file: string, state: State) {
    this.file = file;
    this.state = state;
  }

  static open(home: string): StateStore {
    const file = join(home, "daemon", "state.json");
    const marker = join(home, "daemon", "state.corrupt");
    // 손상 표식이 있으면 운영자가 확인하고 표식을 지우기 전에는 계속 거부한다 — 재기동만으로 빈 상태가 되지 않게
    // 보존 파일(.corrupt-*)만 남고 표식이 없는 상태(표식 쓰기 전 강제 종료)도 거부한다
    const leftover = existsSync(join(home, "daemon")) ? readdirSync(join(home, "daemon")).find((f) => f.startsWith("state.json.corrupt-")) : undefined;
    if (leftover && !existsSync(marker)) writeFileSync(marker, join(home, "daemon", leftover));
    if (existsSync(marker)) throw new StateError(`이전에 상태 파일 손상이 감지돼 기동을 거부한다(${readFileSync(marker, "utf8").trim()}). 보존된 파일을 확인한 뒤 그 파일과 표식(${marker})을 모두 삭제(또는 다른 곳으로 옮김)하면 새로 시작한다`);
    if (!existsSync(file)) return new StateStore(file, emptyState());
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, "utf8"));
      return new StateStore(file, validate(parsed));
    } catch (error) {
      // 손상 파일은 보존하고 기동을 거부한다 — 빈 상태로 시작하면 이전 승인·수신 ID·격리가 사라진다
      const keep = `${file}.corrupt-${Date.now()}`;
      // 표식을 먼저 확정한 뒤 원본을 옮긴다 — 그 사이에 죽어도 다음 기동은 거부한다
      try { writeFileSync(marker, keep); renameSync(file, keep); } catch { /* 보존 실패는 아래 오류에 포함 */ }
      throw new StateError(`${error instanceof StateError ? error.message : `상태 파일을 읽을 수 없다: ${(error as Error).message}`} — 손상 파일을 ${keep}에 보존했다. 확인 뒤 다시 기동한다`);
    }
  }

  /** 현재 상태를 원자적으로 저장한다. 실패하면 던지고 호출자가 시작하지 않는다 */
  save(): void {
    if (this.failWrites) throw new StateError("상태 저장 실패(주입)");
    writeFileAtomic(this.file, JSON.stringify(this.redact ? redactDeep(this.state, this.redact) : this.state));
  }

  pruneSeen(now: number): void {
    // 나이 상한(7일)은 항상 적용, 개수 상한은 보호 기간(24시간) 밖의 가장 오래된 것부터만 지운다
    const entries = Object.entries(this.state.seen).filter(([, at]) => now - at <= SEEN_TTL_MS);
    entries.sort((a, b) => a[1] - b[1]);
    let over = entries.length - SEEN_MAX;
    const kept: [string, number][] = [];
    for (const e of entries) {
      if (over > 0 && now - e[1] > SEEN_PROTECT_MS) { over--; continue; }
      kept.push(e);
    }
    this.state.seen = Object.fromEntries(kept);
  }

  /** 보호 기간 안 항목이 하드 상한에 닿았는가 — 닿으면 새 수신 기록을 만들지 않는다 */
  seenSaturated(): boolean {
    return Object.keys(this.state.seen).length >= this.seenHardMax;
  }
}
