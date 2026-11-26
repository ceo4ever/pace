import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { paceHome } from "../core/paths.ts";
import { AgentError, checkResume, hasHooks, normalizeResult, type Access, type AgentName, type AgentRequest, type Capabilities, type Executor, type RawFacts } from "./contract.ts";
import { buildChildEnv, runProcess } from "./process.ts";

export interface Invocation {
  args: string[];
  /** 읽기 전용을 강제하는 방법(결과 enforcement에 기록). 강제할 수 없으면 null */
  enforcement: string | null;
  /** 실행 뒤 정리(임시 파일) */
  cleanup?: () => void;
}

export interface PAdapter {
  agent: AgentName;
  command: string;
  capabilities: Capabilities;
  build(request: AgentRequest): Invocation;
  /** stdout·stderr에서 사실을 모은다. 읽기 전용 확인이 필요하면 sandbox 값을 함께 낸다 */
  parse(stdout: string, stderr: string, request: AgentRequest): RawFacts & { sandbox?: string };
}

const CLAUDE_READ_TOOLS = "Read,Grep,Glob";

/** stream-json: 한 줄에 JSON 하나, 마지막 유효 result 이벤트가 최종 결과. result가 없으면 잘린 출력이다 */
function claudeResult(stdout: string): Record<string, unknown> {
  let result: Record<string, unknown> | null = null;
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      throw new AgentError("protocol_error", "claude stream-json 한 줄이 JSON이 아니다");
    }
    if (event && typeof event === "object" && (event as Record<string, unknown>).type === "result") result = event as Record<string, unknown>;
  }
  if (!result) throw new AgentError("protocol_error", "claude 출력에 result 이벤트가 없다(잘린 출력)");
  return result;
}

/**
 * 읽기 전용 차단을 실측 증거로 확인한 -p 조합 (P035 T02 S-24, 2026-11-12, claude 2.1.322·codex-cli 0.167.1).
 * claude: 원본 init의 tools가 Glob·Grep·Read뿐(쓰기·셸 도구 미노출). codex: 쓰기 시도가 `blocked by policy`, sandbox read-only.
 * 증거가 없는 조합은 true로 두지 않는다 — 버전이 바뀌면 재시험.
 */
const READ_ONLY_PROVEN: Partial<Record<AgentName, boolean>> = { claude: true, codex: true };

export const claudeP: PAdapter = {
  agent: "claude",
  command: "claude",
  capabilities: { models: true, effort: true, systemPrompt: true, resume: true, writeAccess: true },
  build(request) {
    const args = ["-p", "--output-format", "stream-json", "--verbose", "--strict-mcp-config", "--disable-slash-commands"];
    if (request.access === "read-only") args.push("--tools", CLAUDE_READ_TOOLS);
    else args.push("--permission-mode", "acceptEdits");
    if (request.model) args.push("--model", request.model);
    if (request.effort) args.push("--effort", request.effort);
    if (request.resume) args.push("--resume", request.resume);
    let cleanup: (() => void) | undefined;
    if (request.systemPrompt) {
      // 본문을 argv(프로세스 목록)에 싣지 않고 0600 임시 파일로 전달한다
      const dir = mkdtempSync(join(tmpdir(), "pace-agent-sys-"));
      const file = join(dir, "system.md");
      writeFileSync(file, request.systemPrompt, { mode: 0o600 });
      args.push("--append-system-prompt-file", file);
      cleanup = () => rmSync(dir, { recursive: true, force: true });
    }
    return { args, cleanup, enforcement: request.access === "read-only" ? `claude --tools ${CLAUDE_READ_TOOLS} (내장 도구 목록 제한)` : "write 요청" };
  },
  parse(stdout) {
    const o = claudeResult(stdout);
    const usage = (o.usage ?? {}) as Record<string, unknown>;
    const models = Object.keys((o.modelUsage ?? {}) as object);
    return { text: o.result, model: models[0], sessionId: o.session_id, stopReason: o.stop_reason, isError: o.is_error, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens };
  },
};

/** codex exec 텍스트 모드: 최종 메시지는 stdout, 머리글(model·provider·sandbox·session id)과 "tokens used"는 stderr */
function header(stderr: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = stderr.split("\n");
  const first = lines.findIndex((l) => l.trim() === "--------");
  const second = first < 0 ? -1 : lines.findIndex((l, i) => i > first && l.trim() === "--------");
  if (first < 0) return out;
  for (const line of lines.slice(first + 1, second < 0 ? undefined : second)) {
    const m = /^([a-z ]+): (.*)$/.exec(line.trim());
    if (m) out[m[1]!] = m[2]!;
  }
  return out;
}

/**
 * Windows의 codex exec는 sandbox 구현을 고르지 않으면(사용자 설정은 --ignore-user-config로 끈다) 셸 명령을
 * 모두 "blocked by policy"로 거부해 read-only에서 파일조차 읽지 못한다. 관리자 권한이 필요 없는 unelevated
 * sandbox를 지정하면 읽기는 되고 쓰기는 막힌다(codex-cli 0.168.0 Windows 실측 2026-11-16).
 */
export function codexWindowsSandbox(platform: NodeJS.Platform = process.platform): string[] {
  return platform === "win32" ? ["-c", 'windows.sandbox="unelevated"'] : [];
}

export const codexP: PAdapter = {
  agent: "codex",
  command: "codex",
  // codex exec는 시스템 프롬프트 플래그가 없고 resume가 별도 서브커맨드 — 이번 범위에서는 미지원(오류)
  capabilities: { models: true, effort: true, systemPrompt: false, resume: false, writeAccess: true },
  build(request) {
    const args = ["exec", "--skip-git-repo-check", "--ephemeral", "--ignore-user-config", "-c", 'approval_policy="never"', "-C", request.cwd, "--sandbox", request.access === "write" ? "workspace-write" : "read-only", ...codexWindowsSandbox()];
    if (request.model) args.push("-m", request.model);
    if (request.effort) args.push("-c", `model_reasoning_effort=${JSON.stringify(request.effort)}`);
    args.push("-");
    return { args, enforcement: request.access === "read-only" ? `codex exec --sandbox read-only${codexWindowsSandbox().length ? " (Windows unelevated sandbox)" : ""} + --ignore-user-config + approval never (사용자 auto_review가 쓰기를 승인하는 것 차단), 실행 뒤 머리글의 sandbox 값으로 재확인` : "write 요청" };
  },
  parse(stdout, stderr) {
    const h = header(stderr);
    // 턴 완료 판정: 종료 코드 0 위에 최종 메시지와 "tokens used" 줄이 모두 있어야 한다 — 잘린 출력은 성공이 아니다
    // 완료 표지는 stderr의 맨 끝(프롬프트 영역이 아니라 대화 끝)에서 최종 메시지와 함께 나와야 한다
    const final = stdout.trim();
    // 끝 표지를 먼저 떼고, 남은 본문이 "\ncodex\n<최종 메시지>"로 끝나는지 본다 — 프롬프트에 인용된 로그 예시와 무관하게 판별
    const tail = /\ntokens used\n([\d,]+)\n?$/.exec(stderr);
    const body = tail ? stderr.slice(0, tail.index).trimEnd() : "";
    if (final === "" || !tail || !body.endsWith(`\ncodex\n${final}`)) throw new AgentError("protocol_error", "codex 출력이 끝 완료 표지(최종 메시지 뒤 tokens used) 없이 끝났거나 최종 메시지와 일치하지 않는다");
    const tokens = tail[1];
    const totalTokens = tokens ? Number(tokens.replaceAll(",", "")) : undefined;
    return { text: stdout.trim(), model: h.model, effort: h["reasoning effort"], provider: h.provider, sessionId: h["session id"],
      stopReason: "completed", isError: false, outputTokens: totalTokens, totalTokens, sandbox: h.sandbox };
  },
};

// ---- 이어가기: 만든 세션의 에이전트·cwd·접근을 저장하고 재사용 전에 대조한다 ----
interface SessionMeta {
  agent: AgentName;
  cwd: string;
  access: Access;
}

function sessionFile(dir: string, agent: string, id: string): string {
  return join(dir, `${agent}-${id.replace(/[^A-Za-z0-9_-]/g, "_")}.json`);
}

/** 저장소 폴더를 만들거나 검증한다: 실제 폴더(심볼릭 링크 거부), 내 소유, 0700 */
function ensureSessionDir(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const st = lstatSync(dir);
  if (st.isSymbolicLink() || !st.isDirectory()) throw new AgentError("session_mismatch", "세션 저장소가 폴더가 아니거나 심볼릭 링크다");
  if (process.platform !== "win32") {
    if (st.uid !== process.getuid!()) throw new AgentError("session_mismatch", "세션 저장소의 소유자가 현재 사용자가 아니다");
    if ((st.mode & 0o077) !== 0) chmodSync(dir, 0o700);
  }
}

function saveSession(dir: string, id: string, meta: SessionMeta): void {
  ensureSessionDir(dir);
  const file = sessionFile(dir, meta.agent, id);
  if (existsSync(file) && lstatSync(file).isSymbolicLink()) throw new AgentError("session_mismatch", "세션 파일이 심볼릭 링크다");
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(meta), { mode: 0o600, flag: "wx" });
  renameSync(tmp, file); // 기존 파일(권한·링크)을 덮어쓰지 않고 새 파일로 교체
}

function checkSavedResume(dir: string, request: AgentRequest): void {
  if (!existsSync(dir)) throw new AgentError("session_mismatch", "pace agent가 만든 세션이 아니다(등록되지 않은 이어가기 ID)");
  ensureSessionDir(dir);
  const file = sessionFile(dir, request.agent, request.resume!);
  if (!existsSync(file)) throw new AgentError("session_mismatch", "pace agent가 만든 세션이 아니다(등록되지 않은 이어가기 ID)");
  const st = lstatSync(file);
  if (st.isSymbolicLink() || !st.isFile()) throw new AgentError("session_mismatch", "세션 파일이 일반 파일이 아니다");
  if (process.platform !== "win32" && (st.mode & 0o077) !== 0) chmodSync(file, 0o600);
  checkResume(request, JSON.parse(readFileSync(file, "utf8")) as SessionMeta);
}

export function createPExecutor(adapter: PAdapter, options: { command?: string; env?: NodeJS.ProcessEnv; sessionDir?: string; idleMs?: number } = {}): Executor {
  const sessionDir = options.sessionDir ?? join(paceHome(), "agent-sessions");
  return {
    agent: adapter.agent,
    mode: "p",
    capabilities: adapter.capabilities,
    readOnlyEnforced: READ_ONLY_PROVEN[adapter.agent] === true,
    async run(request, hooks, beforeLocalOutput) {
      if (hasHooks(hooks)) throw new AgentError("unsupported_option", `${adapter.agent}/p는 실행 훅(이벤트·권한·MCP·맥락)을 지원하지 않는다 — ACP를 쓴다`, { started: false });
      if (hooks?.signal?.aborted) throw new AgentError("cancelled", "시작 전에 취소됐다", { started: false });
      if (request.resume) {
        try { checkSavedResume(sessionDir, request); }
        catch (error) {
          if (error instanceof AgentError) throw new AgentError(error.code, error.message, { started: false });
          throw error;
        }
      }
      const invocation = adapter.build(request);
      try {
        // 읽기 전용을 강제할 수 없으면 실행하지 않고 거부한다.
        if (request.access === "read-only" && !invocation.enforcement) {
          throw new AgentError("read_only_unenforceable", `${adapter.agent}/p는 읽기 전용을 강제할 수 없다`, { started: false });
        }
        const outcome = await runProcess({
          command: options.command ?? adapter.command,
          args: invocation.args,
          cwd: request.cwd,
          env: buildChildEnv(options.env ?? process.env, adapter.agent),
          input: request.prompt,
          timeoutMs: request.timeoutMs,
          idleMs: options.idleMs ?? Math.min(request.timeoutMs, 600_000),
          signal: hooks?.signal,
        }).catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") throw new AgentError("executor_unavailable", `${options.command ?? adapter.command} 실행 파일을 찾지 못했다`, { started: false });
          if (process.platform === "win32") throw new AgentError("agent_failed", error.message);
          throw error;
        });
        if (outcome.cancelled) throw new AgentError("cancelled", `취소 신호로 프로세스 그룹을 종료했다${outcome.reaped ? "" : " (종료 확인 실패)"}`, { cleanupUnconfirmed: !outcome.reaped });
        if (outcome.timedOut) throw new AgentError("timeout", `${outcome.idle ? "무출력 기한을 넘겨" : `${request.timeoutMs}ms 안에 끝나지 않아`} 프로세스 그룹을 종료했다${outcome.reaped ? "" : " (종료 확인 실패)"}`, { cleanupUnconfirmed: !outcome.reaped });
        if (outcome.code !== 0) throw new AgentError("agent_failed", `${adapter.command} 종료 코드 ${outcome.code ?? outcome.signal}: ${outcome.stderr.trim().slice(0, 300)}${outcome.stdout.trim() ? ` | stdout: ${outcome.stdout.trim().slice(0, 300)}` : ""}`, { cleanupUnconfirmed: !outcome.reaped });
        if (!outcome.reaped) throw new AgentError("agent_failed", "정상 종료 뒤 남은 자손 프로세스를 회수하지 못했다", { cleanupUnconfirmed: true });
        const facts = adapter.parse(outcome.stdout, outcome.stderr, request);
        if (request.access === "read-only" && facts.sandbox !== undefined && facts.sandbox !== "read-only") {
          throw new AgentError("read_only_unenforceable", `에이전트가 보고한 sandbox가 read-only가 아니다: ${facts.sandbox}`);
        }
        const meta = { durationMs: outcome.durationMs, enforcement: invocation.enforcement ?? "n/a", cleanup: outcome.cleanup };
        beforeLocalOutput?.(normalizeResult(request, facts, meta));
        let rawPath: string | null = null;
        if (request.rawDir) {
          mkdirSync(request.rawDir, { recursive: true, mode: 0o700 });
          rawPath = join(request.rawDir, `${adapter.agent}-p-${Date.now()}.raw`);
          writeFileSync(rawPath, `${outcome.stdout}\n--- stderr ---\n${outcome.stderr}`, { mode: 0o600 });
          chmodSync(rawPath, 0o600);
        }
        if (adapter.capabilities.resume && typeof facts.sessionId === "string" && facts.sessionId) {
          saveSession(sessionDir, facts.sessionId, { agent: request.agent, cwd: request.cwd, access: request.access });
        }
        return normalizeResult(request, facts, { ...meta, rawPath });
      } finally {
        invocation.cleanup?.();
      }
    },
  };
}
