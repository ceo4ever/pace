import { validStartRole, type StartRoleRecord } from "./role-record.ts";
import { inputHash, InputSnapshotError, type InputTrace } from "../core/input-snapshot.ts";
import { appendFileSync, constants, openSync, closeSync, fstatSync, lstatSync, readFileSync, existsSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { writeFileAtomic } from "../core/fsutil.ts";
import { hasSecret } from "./secrets.ts";
import { hasTeamContract } from "./team-contract.ts";
export const LOG_TYPES = ["start", "approval", "task_start", "gate", "task_done", "finish", "merge", "decision", "change", "review", "question", "answer", "escalation", "note"] as const;
export type LogType = typeof LOG_TYPES[number];
export type LogActor = "cli" | "agent" | "coordinator" | "user";
export type LogRecipient = "owner" | "coordinator";
export interface ProjectEvent {
  ts: string; p: string; t?: string; type: LogType; by: LogActor; msg: string;
  to?: LogRecipient;
  requestId?: string;
  role?: StartRoleRecord;
  ok?: boolean; src?: string; ref?: string; data?: Record<string, number>;
}
export class ProjectLogError extends Error {}
function validText(text: unknown, limit: number): text is string {
  return typeof text === "string" && text.trim().length > 0 && text.length <= limit && !/[\r\n\x00-\x1f\x7f]/.test(text) && !hasSecret(text);
}
export function validateEvent(event: ProjectEvent): void {
  if (event.data?.teamMetricsVersion !== undefined && (event.type !== "start" || !event.role || event.data.teamMetricsVersion !== 1)) throw new ProjectLogError("팀 측정 버전은 역할 start의1만 허용한다");
  if (event.requestId !== undefined && (!["question", "escalation", "answer"].includes(event.type) || !/^[a-z][a-z0-9_-]{0,95}$/.test(event.requestId))) throw new ProjectLogError("requestId는 question·escalation·answer의 짧은 식별자여야 한다");
  if (event.role !== undefined && (event.type !== "start" || !validStartRole(event.role))) throw new ProjectLogError("역할 기록은 start의 유효한 전달 설정이어야 한다");
  if (event.to !== undefined && (!["question", "escalation"].includes(event.type) || !["owner", "coordinator"].includes(event.to))) throw new ProjectLogError("수신자는 question·escalation의 owner|coordinator만 허용한다");
  if (!/^P\d{3}$/.test(event.p) || (event.t !== undefined && !/^T\d{2}$/.test(event.t)) || !LOG_TYPES.includes(event.type) || !["cli", "agent", "coordinator", "user"].includes(event.by)) throw new ProjectLogError("사건 번호·종류·작성자가 올바르지 않다");
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(event.ts) || !Number.isFinite(Date.parse(event.ts))) throw new ProjectLogError("사건 시각은 시간대를 포함한 ISO여야 한다");
  if (!validText(event.msg, 240) || (event.src !== undefined && !validText(event.src, 60))) throw new ProjectLogError("사건 메시지는 비밀 없는 짧은 한 줄이어야 한다");
  if (event.ok !== undefined && typeof event.ok !== "boolean") throw new ProjectLogError("사건 결과는 boolean이어야 한다");
  if (event.ref !== undefined && (!validText(event.ref, 240) || isAbsolute(event.ref) || /^[a-z]+:/i.test(event.ref) || event.ref.split(/[/\\]/).includes(".."))) throw new ProjectLogError("사건 ref는 프로젝트의 상대 파일이어야 한다");
  if (event.data !== undefined && (!event.data || typeof event.data !== "object" || Array.isArray(event.data) || Object.entries(event.data).some(([key, n]) => !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key) || !Number.isSafeInteger(n) || n < 0))) throw new ProjectLogError("사건 data는 음이 아닌 정수만 허용한다");
}
export function decodeEvent(event: ProjectEvent): ProjectEvent {
  validateEvent(event);
  return event;
}
function assertDir(dir: string): void {
  if (!lstatSync(dir).isDirectory() || !lstatSync(dirname(dir)).isDirectory()) throw new ProjectLogError("로그 폴더는 일반 디렉터리여야 한다");
}
/** Windows의 O_NOFOLLOW는 링크를 막지 않는다. 생성은 배타적으로, 기존 파일은 생성 없이 열고 열린 핸들과 경로의 신원을 대조한다. */
function openLog(path: string, write: boolean, retries = 0): number {
  const common = constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0);
  if (process.platform !== "win32") return openSync(path, (write ? constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND : constants.O_RDONLY) | common, 0o600);
  let before: ReturnType<typeof lstatSync> | undefined;
  try { before = lstatSync(path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT" || !write) throw error; }
  if (before && !before.isFile()) throw new ProjectLogError("로그는 일반 파일이어야 한다");
  const flags = write ? constants.O_WRONLY | constants.O_APPEND | (before ? 0 : constants.O_CREAT | constants.O_EXCL) : constants.O_RDONLY;
  let fd: number;
  try { fd = openSync(path, flags | common, 0o600); }
  catch (error) {
    // 다른 기록자가 최초 생성했다면 새 경로를 다시 검사하고 연다. 반복 교체는 제한한다.
    if (write && !before && (error as NodeJS.ErrnoException).code === "EEXIST" && retries < 2) return openLog(path, write, retries + 1);
    throw error;
  }
  try {
    const opened = fstatSync(fd), current = lstatSync(path);
    if (!opened.isFile() || !current.isFile() || opened.dev !== current.dev || opened.ino !== current.ino ||
        (before && (before.dev !== opened.dev || before.ino !== opened.ino))) throw new ProjectLogError("로그 파일이 바뀌었다");
    return fd;
  } catch (error) { closeSync(fd); throw error; }
}
/** Only validated fields reach the append-only file; the caller decides how to handle failure. */
export function recordEvent(dir: string, event: ProjectEvent): boolean {
  return recordEvents(dir, [event]);
}

export function recordEvents(dir: string, events: readonly ProjectEvent[]): boolean {
  try {
    assertDir(dir);
    const lines = events.map((event) => {
      validateEvent(event);
      const safe: ProjectEvent = { ts: event.ts, p: event.p, ...(event.t ? { t: event.t } : {}), type: event.type, by: event.by, msg: event.msg, ...(event.to !== undefined ? { to: event.to } : {}), ...(event.requestId !== undefined ? { requestId: event.requestId } : {}), ...(event.role ? { role: { ...event.role } } : {}), ...(event.ok !== undefined ? { ok: event.ok } : {}), ...(event.src ? { src: event.src } : {}), ...(event.ref ? { ref: event.ref } : {}), ...(event.data ? { data: event.data } : {}) };
      return `${JSON.stringify(safe)}\n`;
    });
    const fd = openLog(join(dir, "log.jsonl"), true);
    try {
      const stat = fstatSync(fd); if (!stat.isFile() || stat.nlink !== 1) throw new ProjectLogError("로그는 일반 파일이어야 한다");
      appendFileSync(fd, lines.join(""), "utf8");
    } finally { closeSync(fd); }
    return true;
  } catch { process.stderr.write("pace: 경고: 지표 로그 기록 실패 (명령은 계속)\n"); return false; }
}
export function eventLines(text: string): ProjectEvent[] {
  return text.split("\n").flatMap((line) => {
    try { return [decodeEvent(JSON.parse(line) as ProjectEvent)]; } catch { return []; }
  }).sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
}
export function readEvents(dir: string, inputs?: InputTrace): ProjectEvent[] {
  let fd: number | undefined;
  try {
    assertDir(dir);
    fd = openLog(join(dir, "log.jsonl"), false);
    if (!fstatSync(fd).isFile()) return [];
    const bytes = readFileSync(fd);
    inputs?.record(join(dir, "log.jsonl"), inputHash(bytes));
    return eventLines(bytes.toString("utf8"));
  } catch (error) { if (error instanceof InputSnapshotError) throw error; if ((error as NodeJS.ErrnoException).code === "ENOENT") inputs?.absent?.(join(dir, "log.jsonl")); return []; }
  finally { if (fd !== undefined) closeSync(fd); }
}
function readContract(dir: string): string {
  let fd: number | undefined;
  try {
    assertDir(dir);
    const path = join(dir, "PROJECT.md");
    if (!lstatSync(path).isFile()) throw new Error();
    fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0));
    if (!fstatSync(fd).isFile()) throw new Error();
    return readFileSync(fd, "utf8");
  } catch { throw new ProjectLogError("PROJECT.md는 일반 파일이어야 한다"); }
  finally { if (fd !== undefined) closeSync(fd); }
}
/** 결정·진행 메모의 작성일시: 로컬 시각 `YYYY-MM-DD HH:mm` */
export function memoDateTime(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}
const MANUAL_TYPES = new Set(["decision", "change", "review", "question", "answer", "escalation", "note"]);
export function reviewMessageData(msg: string, strict = true): Record<string, number> {
    const normalized = msg.replace(/([/,.!?;:，。！；：])(?=(?:blocking|should_fix)\b)/g, "$1 ");
    const count = (grade: string) => {
      if (!strict) {
        const match = new RegExp(`\\b${grade}\\s*[:：]?\\s*(\\d+)`).exec(msg);
        if (!match) throw new ProjectLogError("review 메시지에 blocking·should_fix 수를 적는다");
        return Number(match[1]);
      }
      const mentions = [...msg.matchAll(new RegExp(`\\b${grade}\\b`, "g"))];
      const matches = [...normalized.matchAll(new RegExp(`\\b${grade}\\b\\s*[:：]?\\s*(\\S+)`, "g"))];
      const countText = matches[0]?.[1]?.replace(/[/,.!?;:，。！；：]+$/u, "");
      if (mentions.length !== 1 || matches.length !== 1 || !countText || !/^\d+$/.test(countText) || !Number.isSafeInteger(Number(countText))) throw new ProjectLogError("review 메시지에 blocking·should_fix의 음이 아닌 정수를 정확히 한 번 적는다");
      return Number(countText);
    };
    const data = { blocking: count("blocking"), should_fix: count("should_fix"), tester: /\btester\b/.test(msg) ? 1 : 0, reviewer: /\breviewer\b/.test(msg) ? 1 : 0, pass: /\bpass\b/.test(msg) ? 1 : 0, fail: /\bfail\b/.test(msg) ? 1 : 0 };
    if ((!data.tester && !data.reviewer) || (data.pass ?? 0) + (data.fail ?? 0) !== 1) throw new ProjectLogError("review 메시지에 tester/reviewer와 pass/fail 판정을 적는다");
    if (strict && (data.tester + data.reviewer !== 1 || data.pass === 1 && data.blocking !== 0)) throw new ProjectLogError("팀 리뷰 역할은 하나이며 pass는 blocking 0이어야 한다");
    return data;
}
export function completeReviewEvent(event: ProjectEvent): boolean {
  if (event.type !== "review") return false;
  try { return Object.entries(reviewMessageData(event.msg)).every(([key, value]) => event.data?.[key] === value); }
  catch { return false; }
}
export function agentEvent(dir: string, input: { p: string; t?: string; type: string; msg: string; src?: string; ref?: string; by?: string; to?: string; requestId?: string }): { recorded: boolean; duplicate: boolean } {
  if (!MANUAL_TYPES.has(input.type)) throw new ProjectLogError("수동 사건 종류: decision|change|review|question|answer|escalation|note");
  if (input.src !== undefined && !["사용자 결정", "루카스 결정", "main 판단", "자체 판단"].includes(input.src)) throw new ProjectLogError("출처: 사용자 결정|main 판단|자체 판단 (기존 루카스 결정 호환)");
  const event: ProjectEvent = { ts: new Date().toISOString(), p: input.p, t: input.t, type: input.type as LogType, by: (input.by ?? "agent") as LogActor, msg: input.msg, src: input.src, ref: input.ref, ...(input.to !== undefined ? { to: input.to as LogRecipient } : {}), ...(input.requestId !== undefined ? { requestId: input.requestId } : {}) };
  validateEvent(event); assertDir(dir);
  const contract = readContract(dir);
  if (event.type === "review") {
    const adopted = hasTeamContract(input.p, contract, existsSync(join(dir, "TEAM-MEASUREMENT.json")), readEvents(dir));
    event.data = reviewMessageData(event.msg, adopted);
    validateEvent(event);
  }
  if (event.t) {
    const project = contract;
    if (!new RegExp(`^\\| ${event.t} \\|`, "m").test(project)) throw new ProjectLogError("프로젝트 태스크 표에 없는 번호다");
  }
  const syncDecision = event.type === "decision" || event.type === "change";
  const previous = syncDecision ? readEvents(dir).find((e) => e.type === event.type && e.t === event.t && e.msg === event.msg && e.src === event.src && e.ref === event.ref) : undefined;
  if (previous) event.ts = previous.ts;
  let next: string | undefined; const projectPath = join(dir, "PROJECT.md");
  if (syncDecision) {
    if (!lstatSync(projectPath).isFile()) throw new ProjectLogError("결정 표는 일반 파일에만 쓴다");
    const project = contract;
    const heading = /^## 결정·진행 메모\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(project);
    if (!heading || !/^\|---/m.test(heading[1]!)) throw new ProjectLogError("PROJECT.md 결정·진행 메모 표가 없다");
    const message = `${event.src ? `(${event.src}) ` : ""}${event.t ? `${event.t}: ` : ""}${event.msg}`.replaceAll("|", "\\|");
    const rows = heading[0].trimEnd();
    const row = `| ${memoDateTime(new Date(event.ts))} | ${message} |`;
    next = project.includes(row) ? project : project.replace(heading[0], `${rows}\n${row}\n\n`);
  }
  // Write the decision table only after a durable event. Retrying repairs a missing row below.
  const recorded = previous ? true : recordEvent(dir, event);
  if (recorded && next !== undefined) {
    try { writeFileAtomic(projectPath, next); }
    catch { process.stderr.write("pace: 경고: 결정 표 기록 실패 (로그는 보존)\n"); }
  }
  return { recorded, duplicate: !!previous };
}
