import { readFileSync } from "node:fs";
import { inputHash, type InputTrace } from "../core/input-snapshot.ts";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { readEvents, recordEvent, recordEvents } from "./event-log.ts";
import type { ProjectEvent } from "./event-log.ts";
import type { ProjectRef, Repo } from "./harness.ts";

export type MetricCommand = "start" | "task" | "check" | "done" | "finish" | "merge";
export interface MetricEvent {
  ts: string;
  project: string;
  cmd: MetricCommand;
  task?: string;
  ok: boolean;
  reason?: string;
  msg?: string; src?: string; ref?: string; data?: Record<string, number>; role?: ProjectEvent["role"];
}
const commands = new Set(["start", "task", "check", "done", "finish", "merge"]);
export const gateFailureReasons: readonly string[] = ["security", "rebase", "checks", "contract", "state", "command"];
export function metricDir(repo: Repo, ref: ProjectRef): string { return join(repo.root, "projects", ref.dir); }

/** Never persist arbitrary command arguments or error messages. */
export function failureReason(text: string): string {
  if (/비밀|보안/.test(text)) return "security";
  if (/rebase|충돌/.test(text)) return "rebase";
  if (/검사 실패/.test(text)) return "checks";
  if (/TASK-CLOSE|PROJECT-CLOSE|기준|증거|절이/.test(text)) return "contract";
  if (/상태|완료/.test(text)) return "state";
  return "command";
}
export function recordMetric(dir: string, event: MetricEvent, required = false): boolean {
  const reason = gateFailureReasons.includes(event.reason ?? "") ? event.reason : "command";
  const base = { ts: event.ts, p: event.project, ...(/^T\d{2}$/.test(event.task ?? "") ? { t: event.task } : {}), by: "cli" as const, ok: event.ok };
  const gate = ["check", "done", "finish"].includes(event.cmd);
  const type = gate ? "gate" : event.cmd === "task" ? "task_start" : event.cmd;
  const entry: ProjectEvent = { ...base, type: type as ProjectEvent["type"], msg: event.msg ?? `${event.cmd}${!event.ok ? `: ${reason}` : ""}`, ...(event.src ? { src: event.src } : {}), ...(event.ref ? { ref: event.ref } : {}), ...(event.role ? { role: event.role } : {}), data: { ...(gate ? { [event.cmd]: 1 } : {}), ...event.data } };
  if (!event.ok || (event.cmd !== "done" && event.cmd !== "finish")) return recordEvent(dir, entry);
  const transition: ProjectEvent = { ...base, type: event.cmd === "done" ? "task_done" : "finish", msg: event.cmd };
  // A truncated append cannot leave the team's authoritative success gate ahead of the companion row.
  if (required) return recordEvents(dir, [transition, entry]);
  const recorded = recordEvent(dir, entry);
  return recordEvent(dir, transition) && recorded;
}
export function readMetrics(dir: string, inputs?: InputTrace): MetricEvent[] {
  return readEvents(dir, inputs).flatMap((event) => {
    const cmd = event.type === "task_start" ? "task" : event.type === "gate" ? ["check", "done", "finish"].find((key) => event.data?.[key] === 1) : ["start", "merge"].includes(event.type) ? event.type : undefined;
    if (!cmd || !commands.has(cmd) || event.ok === undefined) return [];
    return [{ ts: event.ts, project: event.p, task: event.t, cmd: cmd as MetricCommand, ok: event.ok, ...(event.src ? { src: event.src } : {}), ...(!event.ok ? { reason: event.msg.split(": ")[1] ?? "command" } : {}) }];
  });
}
export interface TimeStats {
  id: string; start: string | null; done: string | null; finish: string | null; merge: string | null;
  durationMs: number | null; toMergeMs: number | null; gateFailures: number;
  source: "events" | "git" | "none";
  eventCounts: ProjectStats["eventCounts"];
  questionWaitMs: number; approvalWaitMs: number; workMs: number | null; mergeWaitMs: number;
}
export interface ProjectStats { contractApprovalWaitMs: null; approval: { ts: string; exact: boolean } | null; project: TimeStats; tasks: TimeStats[]; eventCounts: { decisions: number; changes: number; reviews: number; questions: number; answers: number; }; }
function counts(log: ProjectEvent[]): ProjectStats["eventCounts"] {
  return { decisions: log.filter((e) => e.type === "decision").length, changes: log.filter((e) => e.type === "change").length, reviews: log.filter((e) => e.type === "review").length, questions: log.filter((e) => e.type === "question" || e.type === "escalation").length, answers: log.filter((e) => e.type === "answer").length };
}
/** Union wait intervals so simultaneous unanswered questions are not double-counted. */
export function questionWait(events: ProjectEvent[], start: number, end: number, task?: string): number {
  const pending = new Map<string, number[]>(); const intervals: [number, number][] = [];
  for (const event of events) {
    if (task && event.t !== task) continue;
    const ts = Date.parse(event.ts); if (ts > end) continue;
    const key = event.t ?? "project"; const queue = pending.get(key) ?? [];
    if (event.type === "question" || event.type === "escalation") queue.push(ts);
    if (event.type === "answer" && queue.length) intervals.push([Math.max(start, queue.shift()!), ts]);
    pending.set(key, queue);
  }
  for (const queue of pending.values()) for (const ts of queue) intervals.push([Math.max(start, ts), end]);
  const sorted = intervals.filter(([a,b]) => b > a).sort(([a],[b]) => a-b);
  let sum = 0; let finish = start;
  for (const [a,b] of sorted) { sum += Math.max(0, b - Math.max(a, finish)); finish = Math.max(finish,b); }
  return sum;
}
function gitTime(repo: Repo, grep: string, oldest = false): string | null {
  const r = spawnSync("git", ["-C", repo.root, "log", "--format=%aI", "--fixed-strings", `--grep=${grep}`], { encoding: "utf8", timeout: 3000, env: { ...process.env, GIT_NO_LAZY_FETCH: "1" } });
  const lines = r.status === 0 ? r.stdout.trim().split("\n").filter(Boolean) : [];
  return (oldest ? lines.at(-1) : lines[0]) ?? null;
}
export function collectStats(repo: Repo, ref: ProjectRef, now = new Date().toISOString(), finishing = false, inputs?: InputTrace): ProjectStats {
  const dir = metricDir(repo, ref);
  const events = readMetrics(dir, inputs).filter((e) => e.project === ref.id);
  const log = readEvents(dir, inputs).filter((e) => e.p === ref.id);
  const projectBytes = readFileSync(join(dir, "PROJECT.md")), project = projectBytes.toString("utf8");
  inputs?.record(join(dir, "PROJECT.md"), inputHash(projectBytes));
  const ids = [...project.matchAll(/^\| (T\d{2}) \|/gm)].map((m) => m[1]!);
  function times(task?: string): TimeStats {
    const es = events.filter((e) => task ? e.task === task : true);
    const cancelledFinish = (event: MetricEvent) => event.cmd === "finish" && event.ok && /^finish:[a-f0-9]{24}$/.test(event.src ?? "") && events.some((failure) => failure.cmd === "finish" && !failure.ok && failure.project === event.project && failure.task === event.task && failure.src === event.src);
    const at = (cmd: MetricCommand, last = false) => {
      const matches = es.filter((e) => e.cmd === cmd && e.ok && !cancelledFinish(e));
      return (last ? matches.at(-1) : matches[0])?.ts ?? null;
    };
    const eventStart = at(task ? "task" : "start");
    const start = eventStart ?? gitTime(repo, task ? `(${ref.id}/${task})` : `docs(${ref.id}): 정의`, true);
    const stateDone = task ? new RegExp(`^\\| ${task} \\|.*\\| 완료 \\|`, "m").test(project) : /- 상태: (병합 대기|완료)/.test(project);
    const done = task ? at("done") ?? (stateDone ? gitTime(repo, `(${ref.id}/${task})`) : null) : null;
    const previousFinish = at("finish", true);
    const reopened = previousFinish && events.some((e) => e.cmd === "task" && e.ok && Date.parse(e.ts) > Date.parse(previousFinish));
    const finish = task ? null : finishing ? now : reopened ? null : at("finish", true) ?? (stateDone && !es.some(cancelledFinish) ? gitTime(repo, `chore(${ref.id}): 마감`) : null);
    const merge = task ? null : at("merge", true) ?? gitTime(repo, `chore(${ref.id}): 병합 완료`);
    const delta = (end: string | null) => start && end ? Math.max(0, Date.parse(end) - Date.parse(start)) : null;
    const duration = delta(done ?? finish ?? now);
    const wait = start ? questionWait(log, Date.parse(start), Date.parse(done ?? finish ?? now), task) : 0;
    const mergeWait = !task && finish ? Math.max(0, Date.parse(merge ?? now) - Date.parse(finish)) : 0;
    return { eventCounts: counts(log.filter((e) => !task || e.t === task)), questionWaitMs: wait, approvalWaitMs: wait + mergeWait, workMs: duration === null ? null : Math.max(0, duration - wait), mergeWaitMs: mergeWait, id: task ?? ref.id, start, done, finish, merge, durationMs: delta(done ?? finish ?? now), toMergeMs: delta(merge), gateFailures: es.filter((e) => !e.ok && ["check", "done", "finish"].includes(e.cmd)).length, source: eventStart ? "events" : start ? "git" : "none" };
  }
  const approval = log.find((e) => e.type === "approval");
  return { contractApprovalWaitMs: null, approval: approval ? { ts: approval.ts, exact: approval.data?.recordedAtStart !== 1 } : null, project: times(), tasks: ids.map((id) => times(id)), eventCounts: counts(log) };
}
export function formatStats(stats: ProjectStats): string {
  const duration = (ms: number | null) => ms === null ? "기록 없음" : `${(ms / 60_000).toFixed(1)}분`;
  return ["| 대상 | 러닝 시간 | 병합까지 | 게이트 실패 | 시작 근거 | 작업 경과 | 승인/질의 대기 |", "|---|---|---|---|---|---|---|", ...[stats.project, ...stats.tasks].map((s) => `| ${s.id} | ${duration(s.durationMs)} | ${duration(s.toMergeMs)} | ${s.gateFailures} | ${s.source} | ${duration(s.workMs)} | ${duration(s.approvalWaitMs)} |`)].join("\n");
}
