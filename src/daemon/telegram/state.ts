import { existsSync, readFileSync } from "node:fs";
import { writeFileAtomic } from "../../core/fsutil.ts";
import { isWorkspaceId } from "../../project/workspace-registry.ts";

// Telegram 어댑터 상태 — PACE_HOME/daemon/telegram.json. 변경마다 원자적 쓰기, 손상은 시작 거부.

export interface HeldRecord {
  update_id: number;
  chat: string;
  thread: number;
  date: number;
  /** 고정 사유 코드 — 외부 오류 문자열은 저장하지 않는다 */
  reason: "store_failed" | "exception" | "rejected" | "saturated" | "summary";
  notified: boolean;
  /** summary 기록 전용 — 합쳐진 미통지 기록 수 */
  droppedCount?: number;
}

export type TopicBinding = string | { name: string; registryId: string };

export function topicName(binding: TopicBinding): string {
  return typeof binding === "string" ? binding : binding.name;
}

export interface TelegramState {
  version: 1;
  /** 포럼별 토픽 번호를 재사용하지 않도록 연결한 포럼의 지문 */
  forumKey?: string;
  /** 마지막으로 처리한 update_id + 1 */
  offset: number;
  /** 마지막으로 update를 받은 시각(ms) — 장기 무수신 재동기화 판단 */
  lastUpdateAt: number;
  /** thread_id → 워크스페이스 이름 */
  topics: Record<string, TopicBinding>;
  /** 토픽 생성 의도(워크스페이스 이름별) — 결과 불명 상태를 보존한다 */
  provisioning: Record<string, true | string>;
  held: HeldRecord[];
}

export class TelegramStateError extends Error {}

export const HELD_MAX = 50;

export function emptyTelegramState(): TelegramState {
  return { version: 1, offset: 0, lastUpdateAt: 0, topics: {}, provisioning: {}, held: [] };
}

function validate(v: unknown): TelegramState {
  const bad = (m: string): never => { throw new TelegramStateError(`Telegram 상태 파일이 올바르지 않다: ${m}`); };
  if (typeof v !== "object" || v === null || Array.isArray(v)) return bad("객체가 아니다");
  const o = v as Record<string, unknown>;
  if (o.version !== 1) bad("지원하지 않는 version");
  if (o.forumKey !== undefined && (typeof o.forumKey !== "string" || !/^[a-f0-9]{64}$/.test(o.forumKey))) bad("forumKey");
  if (!Number.isInteger(o.offset) || (o.offset as number) < 0) bad("offset");
  if (typeof o.lastUpdateAt !== "number") bad("lastUpdateAt");
  for (const k of ["topics", "provisioning"]) if (typeof o[k] !== "object" || o[k] === null || Array.isArray(o[k])) bad(k);
  if (!Array.isArray(o.held)) bad("held");
  for (const h of o.held as unknown[]) {
    const r = h as Record<string, unknown> | null;
    if (typeof r !== "object" || r === null || !Number.isInteger(r.update_id) || typeof r.notified !== "boolean" || typeof r.reason !== "string") bad("held 항목");
  }
  for (const [key, value] of Object.entries(o.topics as Record<string, unknown>)) {
    if (!/^[0-9]+$/.test(key)) bad("topics");
    if (typeof value === "string") continue;
    const binding = value as Partial<Exclude<TopicBinding, string>> | null;
    if (!binding || typeof binding.name !== "string" || !isWorkspaceId(binding.registryId)) bad("topics");
  }
  for (const value of Object.values(o.provisioning as Record<string, unknown>)) if (value !== true && !isWorkspaceId(value)) bad("provisioning");
  return o as unknown as TelegramState;
}

/** 읽기 — 파일이 없으면 null, 손상이면 던진다(조용히 비우지 않는다) */
export function loadTelegramState(file: string): TelegramState | null {
  if (!existsSync(file)) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(file, "utf8")); } catch (error) { throw new TelegramStateError(`Telegram 상태 파일을 읽을 수 없다: ${(error as Error).message}`); }
  return validate(parsed);
}

export function saveTelegramState(file: string, state: TelegramState): void {
  writeFileAtomic(file, JSON.stringify(state));
}

/** 같은 디렉터리로 확인한 기존 설정을 등록 ID가 있는 형식으로 올릴 때 호출한다. */
export function promoteLegacyBinding(state: TelegramState, name: string, registryId: string): boolean {
  let changed = false;
  for (const [thread, binding] of Object.entries(state.topics)) {
    if (binding !== name) continue;
    state.topics[thread] = { name, registryId };
    changed = true;
  }
  if (Object.hasOwn(state.provisioning, name) && state.provisioning[name] === true) {
    state.provisioning[name] = registryId;
    changed = true;
  }
  return changed;
}

/** 보류 기록을 상한에 맞춘다 — 안내를 마친 가장 오래된 기록부터 지우고, 전부 미통지면 오래된 것들을 요약 기록 하나로 합쳐 안내 의무를 잃지 않는다 */
export function trimHeld(held: HeldRecord[], max = HELD_MAX): HeldRecord[] {
  const out = held.map((h) => ({ ...h })); // 요약 객체를 직접 바꾸므로 복사본으로 작업한다(호출자의 롤백 대상이 오염되지 않게)
  while (out.length > max) {
    const done = out.findIndex((h) => h.notified && h.reason !== "summary");
    if (done >= 0) { out.splice(done, 1); continue; }
    const doneSummary = out.findIndex((h) => h.notified);
    if (doneSummary >= 0) { out.splice(doneSummary, 1); continue; }
    // 전부 미통지 — 가장 오래된 일반 기록을 요약 기록으로 합친다
    const oldest = out.findIndex((h) => h.reason !== "summary");
    if (oldest < 0) break;
    const [gone] = out.splice(oldest, 1);
    let sum = out.find((h) => h.reason === "summary");
    if (!sum) { sum = { update_id: 0, chat: gone!.chat, thread: 0, date: gone!.date, reason: "summary", notified: false, droppedCount: 0 }; out.unshift(sum); }
    sum.droppedCount = (sum.droppedCount ?? 0) + 1;
    sum.notified = false;
  }
  return out;
}
