import { randomBytes } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { AgentError, type AgentAttempt } from "./contract.ts";
import { AgentCallError, callIdentifier, recordAgentCall, unknownCallValue, type AgentCall, type CallRoute, type CallTarget, type CallValue } from "../project/agent-calls.ts";
import { findProject, openRepo, statsRepo, type Repo } from "../project/harness.ts";
import { validTeamName } from "../team/model.ts";
import { safeTeamPath } from "../team/store.ts";

const projectId = /^P\d{3}$/;
const backlogId = /^BL\d{6}_\d{2}$/;
function invalidScope(): never {
  throw new AgentError("invalid_request", "호출 범위는 확인된 프로젝트·태스크 또는 백로그여야 한다", { started: false });
}
function isFile(path: string): boolean { return lstatSync(path, { throwIfNoEntry: false })?.isFile() === true; }

function targetIn(repo: Repo, directory: string, task: string | null): CallTarget {
  const root = realpathSync.native(repo.root);
  const marker = directory.startsWith("projects/") ? "PROJECT.md" : "BACKLOG.md";
  if (!isFile(safeTeamPath(root, `${directory}/${marker}`))) return invalidScope();
  if (task !== null) {
    if (marker !== "PROJECT.md" || !/^T\d{2}$/.test(task)) return invalidScope();
    const tasks = safeTeamPath(root, `${directory}/tasks`, true);
    const matches = readdirSync(tasks).filter((name) => name.startsWith(`${task}_`));
    if (matches.length !== 1 || !isFile(safeTeamPath(root, `${directory}/tasks/${matches[0]}/TASK.md`))) return invalidScope();
  }
  return { root, directory, task };
}

export function namedCallTarget(repo: Repo, selector: string, task: string | null): CallTarget {
  const id = selector.toUpperCase();
  if (projectId.test(id)) {
    const ref = findProject(repo, id);
    return targetIn(statsRepo(repo, ref), `projects/${ref.dir}`, task);
  }
  if (!backlogId.test(id) || task !== null) return invalidScope();
  const root = safeTeamPath(repo.root, "backlogs", true);
  const options = readdirSync(root).filter((name) => name.startsWith(`${id}_`));
  if (options.length !== 1) return invalidScope();
  return targetIn(repo, `backlogs/${options[0]}`, null);
}

export function automaticCallTarget(cwd: string, scope?: string, task?: string, artifact?: string): CallTarget | undefined {
  try {
    if (task !== undefined && scope === undefined) return invalidScope();
    if (artifact && !artifact.split(sep).some((part) => part === "projects" || part === "backlogs")) return undefined;
    const repo = openRepo(artifact === undefined ? cwd : dirname(artifact));
    if (scope !== undefined) return namedCallTarget(repo, scope, task?.toUpperCase() ?? null);
    const path = realpathSync.native(artifact ?? cwd);
    const [parent, name, tasks, taskDir] = relative(realpathSync.native(repo.root), path).split(sep);
    if (name && parent === "backlogs" && /^BL\d{6}_\d{2}_/.test(name)) return targetIn(repo, `backlogs/${name}`, null);
    if (name && parent === "projects" && /^P\d{3}_/.test(name)) {
      const id = tasks === "tasks" ? /^T\d{2}(?=_)/.exec(taskDir ?? "")?.[0] ?? null : null;
      return artifact ? targetIn(repo, `projects/${name}`, id) : namedCallTarget(repo, name.slice(0, 4), id);
    }
    // A review is owned by its target checkout; an unrelated artifact does not inherit the calling worktree.
    if (artifact) return undefined;
    const id = /^project\/(P\d{3})$/.exec(repo.branch)?.[1];
    if (!id) return undefined;
    const ref = findProject(repo, id);
    const directory = `projects/${ref.dir}`;
    const text = readFileSync(safeTeamPath(repo.root, `${directory}/PROJECT.md`), "utf8");
    const active = [...text.matchAll(/^\| (T\d{2}) \|[^\n]*?\| 진행 \|/gm)];
    return targetIn(repo, directory, active.length === 1 ? active[0]![1]! : null);
  } catch {
    if (scope !== undefined || task !== undefined) return invalidScope();
    return undefined;
  }
}

export function requireCallAgent(value: string | undefined, target: CallTarget | undefined): void {
  if (value !== undefined && (!validTeamName(value) || !target)) {
    throw new AgentError("invalid_request", "--call-agent에는 호출 범위와 유효한 팀 구성원 이름이 필요하다", { started: false });
  }
}

function identifier(value: string | null | undefined, source: "requested" | "host"): CallValue<string> {
  return callIdentifier(value) ? { value, source } : unknownCallValue;
}

function amount(value: number | null | undefined): CallValue<number> {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? { value, source: "tool" } : unknownCallValue;
}

export function observedAgentCall(target: CallTarget, attempt: AgentAttempt, route: CallRoute, callAgent?: string, replacement: string | null = null): AgentCall {
  const { agent, error, at, usage } = attempt;
  return {
    version: 1, id: randomBytes(16).toString("hex"), at, task: target.task, agent: callAgent ?? agent,
    engine: agent, route,
    status: error === null ? "completed" : error === "cancelled" || error === "timeout" ? "interrupted" : "failed",
    reason: error, replacement_reason: replacement,
    model: { requested: identifier(attempt.requestedModel, "requested"), actual: identifier(attempt.reportedModel, "host") },
    effort: { requested: identifier(attempt.requestedEffort, "requested"), actual: identifier(attempt.reportedEffort, "host") },
    duration_ms: amount(attempt.durationMs),
    tokens: { input: amount(usage?.input_tokens), output: attempt.totalTokens === null ? amount(usage?.output_tokens) : unknownCallValue, total: amount(attempt.totalTokens) },
    ref: null,
  };
}

export function tryRecordCall(target: CallTarget, call: AgentCall): boolean {
  try { recordAgentCall(target, call); return true; }
  catch (error) {
    const detail = error instanceof AgentCallError ? ` (${error.message})` : "";
    process.stderr.write(`pace: 경고: 에이전트 호출 기록에 실패했다${detail}. 호출·검토 결과는 계속 반환한다.\n`);
    return false;
  }
}

export function callCancellation(): { signal: AbortSignal; release: () => void } {
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  return { signal: controller.signal, release() { process.off("SIGINT", abort); process.off("SIGTERM", abort); } };
}
