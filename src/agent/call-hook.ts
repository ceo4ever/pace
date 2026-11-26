import { createHash } from "node:crypto";
import { closeSync, lstatSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { parseArgs } from "node:util";
import { parseFrontmatter } from "../core/frontmatter.ts";
import { AgentCallError, callIdentifier, recordAgentCall, unknownCallValue, type AgentCall, type CallTarget, type CallValue } from "../project/agent-calls.ts";
import { regularBytes, strictJson, utf8 } from "../project/handoff-files.ts";
import { normalizeLines, validTeamName, type TeamMember } from "../team/model.ts";
import { commonGitDirectory } from "../team/resource-lock.ts";
import { loadTeamMember, readTeamFile, safeTeamPath, teamRoot } from "../team/store.ts";
import { renderTeamMember } from "../team/sync.ts";
import { automaticCallTarget } from "./call-context.ts";

type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : undefined;
const validHostId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_/-]{1,128}$/.test(value);

function nativeCallId(host: "claude" | "codex", session: unknown, agent: unknown, prompt: unknown): string | null {
  if (!validHostId(session) || !validHostId(agent) || (prompt !== undefined && !validHostId(prompt))) return null;
  // A resumed child can retain its agent ID in a later turn.
  return createHash("sha256").update(`pace-native-agent-call/v1\0${host}\0${session}\0${agent}\0${prompt ?? ""}`).digest("hex");
}
const textValue = (value: unknown, source: "host" | "requested"): CallValue<string> =>
  callIdentifier(value) ? { value, source } : unknownCallValue;
const hostAmount = (value: unknown): CallValue<number> =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? { value, source: "host" } : unknownCallValue;

const routeWait = new Int32Array(new SharedArrayBuffer(4));
function readScope(path: string, common: string): CallTarget {
  let value: JsonObject | undefined;
  // A concurrent first writer may still be finishing its single small receipt.
  for (let attempt = 0; attempt < 10; attempt++) {
    try { value = object(strictJson(utf8(regularBytes(path, 8192)))); if (value) break; }
    catch { /* Missing, incomplete and unsafe receipts never select a new destination. */ }
    Atomics.wait(routeWait, 0, 0, 20);
  }
  const root = value?.root, directory = value?.directory, task = value?.task;
  if (!value || Object.keys(value).length !== 3 || typeof root !== "string" || !isAbsolute(root) || typeof directory !== "string" ||
      !/^(?:projects\/P\d{3}_[^/]+|backlogs\/BL\d{6}_\d{2}_[^/]+)$/.test(directory) ||
      (task !== null && (typeof task !== "string" || !/^T\d{2}$/.test(task))) || commonGitDirectory(root) !== common) {
    throw new AgentCallError("호스트 호출의 기존 범위를 확인할 수 없다");
  }
  const marker = directory.startsWith("projects/") ? "PROJECT.md" : "BACKLOG.md";
  if (!lstatSync(safeTeamPath(root, `${directory}/${marker}`), { throwIfNoEntry: false })?.isFile()) {
    throw new AgentCallError("호스트 호출의 기존 범위 문서를 확인할 수 없다");
  }
  return { root, directory, task };
}

function nativeScope(cwd: string, id: string, candidate: CallTarget | undefined): CallTarget | undefined {
  const common = commonGitDirectory(candidate?.root ?? teamRoot(cwd));
  const rel = `pace/native-call-scopes/${id}.json`;
  const path = safeTeamPath(common, rel);
  if (candidate) {
    mkdirSync(safeTeamPath(common, "pace/native-call-scopes", true), { recursive: true, mode: 0o700 });
    let fd: number | undefined;
    try { fd = openSync(safeTeamPath(common, rel), "wx", 0o600); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    if (fd !== undefined) {
      try { writeFileSync(fd, JSON.stringify(candidate) + "\n"); } finally { closeSync(fd); }
      return candidate;
    }
  } else {
    try { regularBytes(path, 8192); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }
  return readScope(path, common);
}

export function rememberNativeCallScope(target: CallTarget, id: string): void {
  const routed = nativeScope(target.root, id, target);
  if (!routed || routed.root !== target.root || routed.directory !== target.directory || routed.task !== target.task) {
    throw new AgentCallError("호스트 호출 ID는 처음 기록한 범위에만 쓸 수 있다");
  }
}

function generatedRequest(root: string, member: TeamMember): { model: CallValue<string>; effort: CallValue<string> } | null {
  try {
    const content = readTeamFile(root, `.claude/agents/${member.name}.md`);
    if (content === null) return null;
    const { data } = parseFrontmatter(content);
    const { model, effort } = data;
    if (!callIdentifier(model) || !callIdentifier(effort)) return null;
    if (normalizeLines(content) !== renderTeamMember(member, "claude", { model, effort })) return null;
    return { model: textValue(model, "requested"), effort: textValue(effort, "requested") };
  } catch { return null; }
}

function claudeHook(input: JsonObject): void {
  const event = input.hook_event_name;
  if (event !== "SubagentStart" && event !== "SubagentStop" && event !== "PostToolUse") return;
  const post = event === "PostToolUse";
  if (post && input.tool_name !== "Agent") return;
  const result = post ? object(input.tool_response) : undefined;
  const role = post ? result?.agentType ?? object(input.tool_input)?.subagent_type : input.agent_type;
  const id = nativeCallId("claude", input.session_id, post ? result?.agentId : input.agent_id, input.prompt_id);
  if (!id || typeof role !== "string" || !validTeamName(role) || typeof input.cwd !== "string" || input.cwd.length > 4096 || !isAbsolute(input.cwd)) return;
  const observedTarget = automaticCallTarget(input.cwd);
  let observedMember: TeamMember | undefined;
  // Only a registered role can establish a new scope. A later event may arrive in another checkout.
  if (observedTarget) try { observedMember = loadTeamMember(observedTarget.root, role); } catch { /* Try the existing scope below. */ }
  const target = nativeScope(input.cwd, id, observedMember ? observedTarget : undefined);
  if (!target) return;
  let member: TeamMember;
  try { member = observedMember && observedTarget?.root === target.root ? observedMember : loadTeamMember(target.root, role); }
  catch { return; }
  const requested = event === "SubagentStart" ? generatedRequest(target.root, member) : null;
  const status = result?.status === "completed" ? "completed"
    : result?.status === "failed" ? "failed"
    : result?.status === "cancelled" || result?.status === "canceled" ? "interrupted" : "unknown";
  const reason = status === "failed" ? "agent_failed" : status === "interrupted" ? "cancelled" : null;
  const reported = status !== "unknown" ? result : undefined;
  const usage = object(reported?.usage);
  const row: AgentCall = {
    version: 1, id, at: new Date().toISOString(), task: target.task, agent: member.name, engine: "claude", route: "native",
    status, reason, replacement_reason: null, ref: null,
    model: { requested: requested?.model ?? unknownCallValue, actual: textValue(reported?.resolvedModel, "host") },
    effort: { requested: requested?.effort ?? unknownCallValue, actual: textValue(event === "SubagentStop" ? object(input.effort)?.level : undefined, "host") },
    duration_ms: hostAmount(reported?.totalDurationMs),
    tokens: { input: hostAmount(usage?.input_tokens), output: hostAmount(usage?.output_tokens), total: hostAmount(reported?.totalTokens) },
  };
  recordAgentCall(target, row, { nativeObservation: true });
}

const maxHookBytes = 1024 * 1024;
async function inputObject(): Promise<JsonObject | undefined> {
  if (process.stdin.isTTY) return undefined;
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    const bytes = chunk as Buffer;
    length += bytes.length;
    if (length > maxHookBytes) return undefined;
    chunks.push(bytes);
  }
  return object(strictJson(utf8(Buffer.concat(chunks, length))));
}

export async function agentCallHookCommand(action: "call-hook" | "call-id", args: string[]): Promise<number> {
  try {
    const { values } = parseArgs({ args, options: { host: { type: "string" } }, strict: true });
    const host = values.host;
    if (action === "call-hook") {
      if (host === "claude") {
        const input = await inputObject();
        if (input) claudeHook(input);
      }
      return 0;
    }
    if (host === "claude" || host === "codex") {
      const input = await inputObject();
      const id = nativeCallId(host, input?.session_id, input?.agent_id, input?.prompt_id);
      if (id) { process.stdout.write(id + "\n"); return 0; }
    }
  } catch { /* A hook must let its host continue and must never echo raw payload or I/O diagnostics. */ }
  if (action === "call-hook") return 0;
  process.stderr.write("pace: 에이전트 호출 ID에 유효한 호스트와 두 식별자가 필요하다\n");
  return 2;
}
