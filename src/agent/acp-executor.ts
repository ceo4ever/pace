import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AgentError, checkResume, normalizeResult, type AgentName, type AgentRequest, type AgentResult, type Capabilities, type EventStats, type Executor, type PermissionDecision, type RunHooks } from "./contract.ts";
import { MCP_READ_TOOLS, MCP_SERVER_NAME, MCP_WRITE_TOOLS, mcpToolName } from "../mcp/names.ts";
import { paceHome, packageRoot } from "../core/paths.ts";
import { buildChildEnv, startReaper } from "./process.ts";
import { ProcessGroup } from "./proc-group.ts";
import { startWindowsJob } from "./windows-job.ts";

// ACP(Agent Client Protocol) Client — ndjson JSON-RPC를 직접 구현한다(SDK 없음).
// 권한 요청은 기본 거절, 읽기 전용은 어댑터가 읽기 전용 모드를 확인해 줄 때만 허용한다.

export interface AcpAdapter {
  agent: AgentName;
  command: string;
  args: string[];
  /** availableModes 중 읽기 전용으로 인정하는 모드 id(우선순위 순) */
  readOnlyModes: string[];
  /** 읽기 전용 모드가 실제로 쓰기를 막는다고 실측으로 확인한 어댑터 버전(initialize의 agentInfo.version). 비어 있으면 읽기 전용 요청을 거부한다 */
  readOnlyVersions: string[];
  /** session/new에 실을 어댑터별 _meta (설정 격리·우회 금지 등) */
  sessionMeta?: Json;
  /** 쓰기 허용일 때 한 번 허용할 도구 이름 목록(정확히 일치) — 이름을 모르면 거절 */
  writeTools: string[];
  /** session/new 응답 configOptions의 effort 옵션을 session/set_config_option으로 지정할 수 있는 어댑터(실측: claude-agent-acp 0.81.1) */
  effortConfig?: boolean;
  /** 이어가기 메서드 — 실측(claude-agent-acp 0.81.1: 재전송 없음)으로 확인된 어댑터만. 없으면 resume 미지원(대안: 요약 주입) */
  resumeMethod?: "session/resume";
}

// 읽기 전용은 plan이 아니라 default 모드 — plan은 읽기 도구(Read·읽기 셸)를 작업 폴더 밖까지 권한 요청 없이 실행한다. default에서는 시험한 밖 읽기·쓰기가 권한 요청으로 와서 결정표가 강제 거절했다(실측 2026-11-24, macOS, 0.81.1). 차단은 어댑터가 권한을 묻는 데 기대며 OS 수준 경계는 아니다
export const claudeAcp: AcpAdapter = { agent: "claude", command: "claude-agent-acp", args: [], readOnlyModes: ["default"], readOnlyVersions: ["0.81.1"], writeTools: ["Edit", "Write", "MultiEdit"], effortConfig: true, resumeMethod: "session/resume", sessionMeta: { claudeCode: { options: { settingSources: [], allowDangerouslySkipPermissions: false } } } };
export const codexAcp: AcpAdapter = { agent: "codex", command: "codex-acp", args: [], readOnlyModes: ["read-only"], readOnlyVersions: [], writeTools: [] }; // 실측: codex-acp 1.13.1의 read-only 모드·-c 설정으로도 touch가 성공함

const ACP_CAPS: Capabilities = { models: true, effort: false, systemPrompt: false, resume: false, writeAccess: true };
const MAX_LINE = 4 * 1024 * 1024;
const RAW_LIMIT_BYTES = 64 * 1024 * 1024;
const CONTEXT_MAX = 12_000;
const SUMMARY_MAX = 4_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Json = Record<string, any>;

export function createAcpExecutor(adapter: AcpAdapter, options: { command?: string; args?: string[]; env?: NodeJS.ProcessEnv; graceMs?: number; idleMs?: number; /** pace mcp 서버를 띄우는 명령(시험용). 기본: 이 node로 bin/pace.ts */ mcpCommand?: { command: string; args: string[] }; rawLimitBytes?: number; eventQueueLimit?: number } = {}): Executor {
  return {
    agent: adapter.agent,
    mode: "acp",
    capabilities: { ...ACP_CAPS, effort: adapter.effortConfig === true, resume: adapter.resumeMethod !== undefined },
    readOnlyEnforced: adapter.readOnlyVersions.length > 0,
    async run(request: AgentRequest, hooks?: RunHooks, beforeLocalOutput?: (result: AgentResult) => void) {
      if (hooks?.signal?.aborted) throw new AgentError("cancelled", "시작 전에 취소됐다", { started: false });
      if (request.resume) {
        // 이어가기 진입점 검증 — 호출자가 보관한 세션 기록과 직접 대조한다(도우미를 거치지 않아도 우회 불가)
        if (!adapter.resumeMethod) throw new AgentError("unsupported_option", `${adapter.agent}/acp는 이어가기를 지원하지 않는다 — 새 세션과 요약 인계(continueSession)를 쓴다`, { started: false });
        const saved = hooks?.savedSession;
        if (!saved || saved.sessionId !== request.resume) throw new AgentError("session_mismatch", "이어가기에는 그 세션의 저장 기록(savedSession)이 필요하고 세션 ID가 같아야 한다", { started: false });
        try { checkResume(request, saved); } catch (error) { throw new AgentError("session_mismatch", (error as Error).message, { started: false }); }
      }
      if (request.access === "read-only" && adapter.readOnlyVersions.length === 0) {
        throw new AgentError("read_only_unenforceable", `${adapter.agent}/acp 어댑터는 읽기 전용 강제를 실측으로 확인하지 못했다 — -p 방식을 쓰거나 쓰기 허용을 명시하라`, { started: false });
      }
      const started = Date.now();
      const graceMs = options.graceMs ?? 2000;
      const env = buildChildEnv(options.env ?? process.env, adapter.agent);
      let winJob: Awaited<ReturnType<typeof startWindowsJob>> | null = null;
      if (process.platform === "win32") {
        try { winJob = await startWindowsJob(options.command ?? adapter.command, options.args ?? adapter.args, request.cwd, env, request.timeoutMs + graceMs * 2); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new AgentError("executor_unavailable", (error as Error).message, { started: false });
          throw new AgentError("agent_failed", (error as Error).message);
        }
      }
      const child = winJob?.child ?? spawn(options.command ?? adapter.command, options.args ?? adapter.args, {
        cwd: request.cwd,
        env,
        detached: process.platform !== "win32",
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
      const pid = child.pid;
      const group = winJob ?? (pid ? new ProcessGroup(pid) : null);
      if (!winJob) (group as ProcessGroup | null)?.startTracking();
      let reaper: { stop: () => void } = { stop() {} };
      let stderr = "";
      child.stderr.on("data", (c: Buffer) => {
        if (stderr.length < 8192) stderr += c.toString("utf8");
      });
      child.stdin.on("error", () => {});

      let nextId = 1;
      const pending = new Map<number, { resolve: (v: Json) => void; reject: (e: Error) => void }>();
      const rawLines: string[] = [];
      const wantRaw = Boolean(request.rawDir);
      const rawLimit = options.rawLimitBytes ?? RAW_LIMIT_BYTES;
      let rawBytes = 0;
      let rawTruncated = false;
      const pushRaw = (line: string) => {
        if (rawTruncated) return;
        rawBytes += Buffer.byteLength(line) + 1;
        if (rawBytes > rawLimit) { rawTruncated = true; rawLines.push(`# 원본 기록이 ${rawLimit}바이트를 넘어 여기서 멈췄다(이벤트 전달·실행은 계속)`); return; }
        rawLines.push(line);
      };
      // paceMcp: 요청의 cwd·access로 서버 항목과 허용 도구 집합을 직접 만든다(호출자 설정과 어긋날 수 없다)
      const mcpServers: Json[] = [];
      const mcpAllowed = new Set<string>();
      if (hooks?.paceMcp) {
        const launch = options.mcpCommand ?? { command: process.execPath, args: [join(packageRoot, "bin", "pace.ts")] };
        const mcpEnv: { name: string; value: string }[] = [{ name: "PACE_HOME", value: paceHome(options.env ?? process.env) }];
        const profile = (options.env ?? process.env).PACE_PROFILE;
        if (profile) mcpEnv.push({ name: "PACE_PROFILE", value: profile });
        mcpServers.push({ name: MCP_SERVER_NAME, command: launch.command, args: [...launch.args, "mcp", "--workspace", request.cwd, "--access", request.access], env: mcpEnv });
        for (const t of MCP_READ_TOOLS) mcpAllowed.add(mcpToolName(t));
        if (request.access === "write") for (const t of MCP_WRITE_TOOLS) mcpAllowed.add(mcpToolName(t));
      }
      // 이벤트 전달: 실행기 처리와 분리된 상한 큐, 한 번에 한 콜백, 느린 콜백은 소비자를 포기한다
      const stats: EventStats = { delivered: 0, dropped: 0, failed: 0, consumerStuck: false };
      const eventTimeoutMs = hooks?.eventTimeoutMs ?? 5000;
      const queueLimit = options.eventQueueLimit ?? 1000;
      const eventQueue: Json[] = [];
      let eventSeq = 0;
      let draining: Promise<void> | null = null;
      let drainRunning = false;
      let eventsStopped = false;
      let eventsFinal = false;
      let eventInFlight = false;
      const drain = async () => {
        drainRunning = true;
        while (eventQueue.length > 0 && !eventsStopped) {
          const update = eventQueue.shift()!;
          eventInFlight = true;
          try {
            const r = hooks!.onEvent!(update, ++eventSeq);
            if (r && typeof (r as Promise<void>).then === "function") {
              let timer: NodeJS.Timeout | undefined;
              const outcome = await Promise.race([
                (r as Promise<void>).then(() => "ok" as const, () => "fail" as const),
                new Promise<"timeout">((resolve) => { timer = setTimeout(() => resolve("timeout"), eventTimeoutMs); }),
              ]);
              if (timer) clearTimeout(timer);
              if (eventsFinal) { eventInFlight = false; break; } // 집계는 이미 확정됐다
              if (outcome === "ok") stats.delivered++;
              else if (outcome === "fail") stats.failed++;
              else { stats.failed++; stats.consumerStuck = true; eventsStopped = true; }
            } else stats.delivered++;
          } catch { if (!eventsFinal) stats.failed++; }
          eventInFlight = false;
        }
        drainRunning = false;
      };
      const enqueueEvent = (update: Json) => {
        if (!hooks?.onEvent) return;
        if (eventsStopped || eventQueue.length >= queueLimit) { stats.dropped++; return; }
        eventQueue.push(structuredClone(update)); // 소비자가 실행기 처리용 객체를 바꾸지 못하게 복사본을 준다
        if (!drainRunning) draining = drain();
      };
      const finishEvents = async () => {
        if (!hooks?.onEvent) return;
        if (drainRunning && draining) await Promise.race([draining, sleep(2000)]);
        // 집계 확정: 진행 중이던 콜백은 failed, 큐에 남은 것은 dropped — 이후 콜백이 끝나도 집계는 바뀌지 않는다
        if (eventQueue.length > 0 || drainRunning) {
          eventsStopped = true;
          if (eventInFlight) { stats.failed++; eventInFlight = false; }
          stats.dropped += eventQueue.length;
          eventQueue.length = 0;
        }
        eventsFinal = true;
      };
      let text = "";
      let denied = 0;
      let bumpIdle: () => void = () => {};
      const deniedWhat: string[] = [];
      const seen: Record<string, number> = {};
      let closed = false;
      let exited = false;
      const exitPromise = new Promise<void>((resolve) => {
        child.on("close", () => {
          exited = true;
          resolve();
        });
        child.on("error", () => {
          exited = true;
          resolve();
        });
      });
      const failAll = (error: Error) => {
        for (const p of pending.values()) p.reject(error);
        pending.clear();
      };
      const send = (message: Json) => {
        if (closed) return;
        const line = JSON.stringify({ jsonrpc: "2.0", ...message });
        if (wantRaw) pushRaw(`> ${line}`);
        child.stdin.write(`${line}\n`);
      };
      const call = (method: string, params: Json): Promise<Json> =>
        new Promise((resolve, reject) => {
          const id = nextId++;
          pending.set(id, { resolve, reject });
          send({ id, method, params });
        });


      const permissionTimeoutMs = hooks?.permissionTimeoutMs ?? 120_000;
      const permTimers = new Set<NodeJS.Timeout>(); // 진행 중인 권한 판정 타이머 — shutdown에서 해제한다
      /** 권한 결정표 — 식별 실패·읽기 전용의 허용 밖은 강제 거절(콜백 미호출), 기본 허용은 콜백이 낮출 수만, 쓰기의 기본 거절은 콜백 allow로 올릴 수 있다 */
      const decidePermission = async (params: Json): Promise<Json> => {
        const options_: Json[] = Array.isArray(params.options) ? params.options : [];
        const kind = params.toolCall?.kind;
        const metaKinds = [params.toolCall?._meta?.kind, params._meta?.kind].filter((k) => k !== undefined && k !== null);
        // 도구 이름 위치는 도구마다 다르다(실측 0.81.1: MCP는 _meta.claudeCode.toolName, 내장 Write는 toolCall.name)
        const names = [params.toolCall?._meta?.claudeCode?.toolName, params.toolCall?.name, params._meta?.toolName].filter((n) => n !== undefined && n !== null).map(String);
        const toolName = names[0] ?? "";
        // 이름 표시가 둘 이상이면 모두 같아야 한다 — 모순은 식별 실패
        const identified = typeof kind === "string" && toolName !== "" && names.every((n) => n === toolName) && metaKinds.every((k) => k === kind);
        let state: "force-reject" | "default-reject" | "default-allow" = "force-reject";
        if (identified) {
          const isMcp = mcpAllowed.has(toolName);
          if (request.access === "read-only") state = isMcp && kind === "other" && !(MCP_WRITE_TOOLS as readonly string[]).some((t) => toolName === mcpToolName(t)) ? "default-allow" : "force-reject";
          else if (kind === "edit" && adapter.writeTools.includes(toolName)) state = "default-allow";
          else if (isMcp && kind === "other") state = "default-allow";
          else state = "default-reject";
        }
        let allow = state === "default-allow";
        if (state !== "force-reject" && hooks?.onPermission) {
          let decision: PermissionDecision = "reject";
          let timer: NodeJS.Timeout | undefined;
          try {
            const info = { toolName, kind: typeof kind === "string" ? kind : null, title: typeof params.toolCall?.title === "string" ? params.toolCall.title : null, access: request.access, defaultDecision: (allow ? "allow" : "reject") as PermissionDecision };
            decision = await Promise.race([
              Promise.resolve(hooks.onPermission(info)),
              new Promise<PermissionDecision>((resolve) => { timer = setTimeout(() => resolve("reject"), permissionTimeoutMs); permTimers.add(timer); }),
            ]);
          } catch { decision = "reject"; }
          if (timer) { clearTimeout(timer); permTimers.delete(timer); }
          allow = decision === "allow";
        }
        const pickAllow = allow ? options_.find((o) => o.kind === "allow_once") : undefined;
        const reject = options_.find((o) => o.kind === "reject_once" || o.kind === "reject_always");
        const pick = pickAllow ?? reject;
        if (!pickAllow) {
          denied++;
          deniedWhat.push(`${toolName || (typeof kind === "string" ? kind : "알 수 없음")}${identified ? "" : "(표시 충돌)"}`);
        }
        return pick ? { outcome: { outcome: "selected", optionId: pick.optionId } } : { outcome: { outcome: "cancelled" } };
      };

      const onMessage = (message: Json) => {
        bumpIdle();
        if (message.method && message.id !== undefined) {
          // 에이전트가 Client에게 하는 요청
          if (message.method === "session/request_permission") {
            const id = message.id;
            // 비동기 판정 — 세션이 닫힌 뒤 늦게 도착한 결과는 send가 버린다
            void decidePermission(message.params ?? {}).then((result) => send({ id, result }), () => send({ id, result: { outcome: { outcome: "cancelled" } } }));
          }
          else send({ id: message.id, error: { code: -32601, message: "Client는 이 메서드를 지원하지 않는다" } }); // 빈 clientCapabilities: fs·terminal 없음
        } else if (message.method === "session/update") {
          const update = message.params?.update;
          if (update && typeof update === "object") enqueueEvent(update);
          if (update?.sessionUpdate) seen[update.sessionUpdate] = (seen[update.sessionUpdate] ?? 0) + 1;
          if (update?.sessionUpdate === "agent_message_chunk" && update.content?.type === "text") text += String(update.content.text ?? "");
        } else if (message.id !== undefined && pending.has(message.id)) {
          const p = pending.get(message.id)!;
          pending.delete(message.id);
          if (message.error) p.reject(new AgentError("agent_failed", `ACP 오류 ${message.error.code}: ${String(message.error.message).slice(0, 200)}`));
          else p.resolve(message.result ?? {});
        }
      };

      let buffer = "";
      child.stdout.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        let index: number;
        while ((index = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, index).trim();
          buffer = buffer.slice(index + 1);
          if (!line) continue;
          if (wantRaw) pushRaw(`< ${line}`);
          try {
            onMessage(JSON.parse(line));
          } catch {
            failAll(new AgentError("protocol_error", "ACP 한 줄이 JSON-RPC가 아니다"));
          }
        }
        if (buffer.length > MAX_LINE) failAll(new AgentError("protocol_error", "ACP 줄이 너무 길다"));
      });
      child.on("close", () => failAll(new AgentError("agent_failed", `ACP 어댑터가 응답 전에 종료했다: ${stderr.trim().slice(0, 200)}`)));
      // 프로세스를 띄우지 못한 실패(ENOENT·EACCES — POSIX는 spawn 오류가 비동기 error 이벤트로 온다)는 시작 전 실패로 표시한다(체인이 같은 요청을 다음 단계로 넘길 수 있게)
      child.on("error", (e) => failAll(new AgentError("executor_unavailable", `${options.command ?? adapter.command} 실행 실패: ${e.message}`, { started: !(["ENOENT", "EACCES"] as (string | undefined)[]).includes((e as NodeJS.ErrnoException).code) })));

      /** 취소 → stdin EOF → 유예 → 그룹 TERM/KILL. 멱등. */
      let shut = false;
      const shutdown = async (cancelSession?: string): Promise<boolean> => {
        if (shut) return true;
        shut = true;
        for (const t of permTimers) clearTimeout(t);
        permTimers.clear();
        if (cancelSession) send({ method: "session/cancel", params: { sessionId: cancelSession } });
        closed = true;
        child.stdin.end();
        await Promise.race([exitPromise, sleep(graceMs)]);
        let killOk = true;
        if (group && !exited) {
          killOk = (await group.signal("SIGTERM")) && killOk;
          await Promise.race([exitPromise, sleep(graceMs)]);
          if (!exited) killOk = (await group.signal("SIGKILL")) && killOk;
        }
        if (group && (await group.alive())) {
          killOk = (await group.signal("SIGKILL")) && killOk;
          for (let i = 0; i < 20 && (await group.alive()); i++) await sleep(50);
        }
        if (winJob) {
          const gone = await winJob.verifyGone();
          winJob.stopTracking();
          return killOk && gone;
        }
        group?.stopTracking();
        return killOk && (group ? await group.verifyGone() : true);
      };

      let sessionId: string | undefined;
      let timedOut = false;
      let timer: NodeJS.Timeout | undefined;
      let idleTimer: NodeJS.Timeout | undefined;
      const idleMs = options.idleMs ?? Math.min(request.timeoutMs, 300_000);
      let failDeadline: (e: Error) => void = () => {};
      const deadline = new Promise<never>((_, reject) => {
        failDeadline = reject;
        timer = setTimeout(() => {
          timedOut = true;
          reject(new AgentError("timeout", `${request.timeoutMs}ms 안에 끝나지 않아 취소했다`));
        }, request.timeoutMs);
      });
      deadline.catch(() => {});
      // 무출력 기한: 어댑터가 어떤 메시지도 보내지 않은 채 idleMs가 지나면 멈춘 것으로 본다
      bumpIdle = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          timedOut = true;
          failDeadline(new AgentError("timeout", `어댑터가 ${idleMs}ms 동안 아무 메시지도 보내지 않아 취소했다`));
        }, idleMs);
      };
      bumpIdle();
      // 취소 신호: 타임아웃과 같은 경로(회수)로 끝낸다
      const onAbort = () => { timedOut = true; failDeadline(new AgentError("cancelled", "취소 신호로 중단했다")); };
      if (hooks?.signal) { if (hooks.signal.aborted) onAbort(); else hooks.signal.addEventListener("abort", onAbort, { once: true }); }
      // 독립 감시자: 요청 전에 한 번만 시작한다. 시작에 실패하면 감시 없이 두지 않고 실행을 중단한다(자식은 shutdown이 회수)
      if (pid) {
        reaper = startReaper(pid, Date.now() + request.timeoutMs, graceMs, (reason) => {
          failDeadline(new AgentError("agent_failed", `독립 감시 프로세스를 시작하지 못해 중단했다: ${reason}`));
        });
      }

      try {
        const flow = async () => {
          const init = await call("initialize", { protocolVersion: 1, clientCapabilities: {} });
          if (typeof init.protocolVersion !== "number") throw new AgentError("protocol_error", "initialize 응답에 protocolVersion이 없다");
          const version = String(init.agentInfo?.version ?? "");
          if (request.access === "read-only" && !adapter.readOnlyVersions.includes(version)) {
            throw new AgentError("read_only_unenforceable", `${adapter.agent}/acp 어댑터 버전 ${version || "알 수 없음"}은 읽기 전용 강제를 실측하지 않았다(확인된 버전: ${adapter.readOnlyVersions.join(", ")})`);
          }
          let session: Json;
          const meta = adapter.sessionMeta ? { _meta: adapter.sessionMeta } : {};
          if (request.resume) {
            // 재적용을 확인하지 못하면 프롬프트를 보내지 않는다 — 읽기 전용은 read_only_unenforceable, 쓰기는 resume 오류만 중단 사유
            try {
              session = await call(adapter.resumeMethod!, { sessionId: request.resume, cwd: request.cwd, mcpServers, ...meta });
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              if (request.access === "read-only") throw new AgentError("read_only_unenforceable", `이어가기 응답을 확인하지 못해 읽기 전용을 보장할 수 없다: ${message}`, { started: false });
              throw new AgentError("agent_failed", `이어가기 실패: ${message}`, { started: false });
            }
            sessionId = request.resume;
          } else {
            session = await call("session/new", { cwd: request.cwd, mcpServers, ...meta });
            sessionId = String(session.sessionId ?? "");
            if (!sessionId) throw new AgentError("protocol_error", "session/new 응답에 sessionId가 없다");
          }
          let enforcement = "write 요청 — 편집 권한만 한 번 허용, 그 밖은 거절";
          if (request.access === "read-only") {
            const available: string[] = (session.modes?.availableModes ?? []).map((m: Json) => String(m.id));
            const mode = adapter.readOnlyModes.find((m) => available.includes(m));
            if (!mode) throw new AgentError("read_only_unenforceable", `${adapter.agent}/acp 어댑터가 읽기 전용 모드를 제공하지 않는다(모드: ${available.join(",") || "없음"})`, request.resume ? { started: false } : {});
            try {
              await call("session/set_mode", { sessionId, modeId: mode });
            } catch (error) {
              if (!request.resume) throw error;
              throw new AgentError("read_only_unenforceable", `이어간 세션의 읽기 전용 모드를 다시 설정하지 못했다: ${error instanceof Error ? error.message : String(error)}`, { started: false });
            }
            enforcement = `ACP 모드 ${mode} 설정(어댑터가 수락) + 권한 요청 강제 거절(어댑터가 묻는 요청)`;
          }
          if (hooks?.paceMcp) enforcement += ` · MCP ${MCP_SERVER_NAME} 서버 ${request.access}(요청에서 생성)`;
          if (hooks?.onPermission) enforcement += request.access === "read-only" ? " · 콜백=안전장치(실측 조합, 허용을 낮추기만 가능)" : " · 콜백=정책 위임(강제 미확인)";
          if (request.effort) {
            // 어댑터가 광고한 effort 값만 고를 수 있다 — 광고가 없거나 값이 없으면 조용히 무시하지 않고 오류
            const option = (Array.isArray(session.configOptions) ? session.configOptions : []).find((o: Json) => o?.id === "effort");
            const values: string[] = (option?.options ?? []).map((o: Json) => String(o.value));
            if (!option || !values.includes(request.effort)) throw new AgentError("unsupported_option", `${adapter.agent}/acp가 광고하지 않은 effort다: ${request.effort} (가능: ${values.join(", ") || "광고 없음"})`);
            await call("session/set_config_option", { sessionId, configId: "effort", value: request.effort });
          }
          const model = request.model === undefined ? session.models?.currentModelId : undefined;
          if (request.model) {
            // 어댑터가 광고한 모델만 고를 수 있다 — 모르는 모델은 조용히 무시하지 않고 오류
            const ids: string[] = (session.models?.availableModels ?? []).map((m: Json) => String(m.modelId));
            if (!ids.includes(request.model)) throw new AgentError("unsupported_option", `${adapter.agent}/acp가 모르는 모델이다: ${request.model} (가능: ${ids.slice(0, 8).join(", ") || "광고 없음"})`);
            await call("session/set_model", { sessionId, modelId: request.model });
          }
          // 새 세션에만 정체성 맥락·이전 대화 요약을 앞에 붙인다(이어간 세션은 이미 알고 있다)
          let promptText = request.prompt;
          if (!request.resume && (hooks?.context || hooks?.handoffSummary)) {
            const parts: string[] = [];
            if (hooks.context) parts.push(hooks.context.slice(0, CONTEXT_MAX));
            if (hooks.handoffSummary) parts.push(`[이전 대화 요약]\n${hooks.handoffSummary.slice(0, SUMMARY_MAX)}`);
            parts.push(`[현재 요청]\n${request.prompt}`);
            promptText = parts.join("\n\n");
          }
          const done = await call("session/prompt", { sessionId, prompt: [{ type: "text", text: promptText }] });
          return { done, enforcement, model };
        };
        const { done, enforcement, model } = await Promise.race([flow(), deadline]);
        const reaped = await shutdown();
        await finishEvents();
        // 정상 종료인데 본문이 비면 계약 위반 — 대개 모델이 거절된 도구 호출(권한 기본 거절)로 턴을 끝낸 경우다
        if (text.trim() === "") throw new AgentError("agent_failed", `ACP 응답 본문이 비어 있다(stopReason ${done.stopReason}, 거절한 권한 요청 ${denied}건[${deniedWhat.join(", ")}], 받은 이벤트 ${JSON.stringify(seen)})`);
        const facts = { text, model, sessionId, stopReason: done.stopReason, isError: done.stopReason === "refusal",
          inputTokens: done.usage?.inputTokens, outputTokens: done.usage?.outputTokens };
        const meta = { enforcement, cleanup: group?.cleanup };
        if (reaped) beforeLocalOutput?.(normalizeResult(request, facts, { ...meta, durationMs: Date.now() - started }));
        let rawPath: string | null = null;
        if (request.rawDir) {
          mkdirSync(request.rawDir, { recursive: true, mode: 0o700 });
          rawPath = join(request.rawDir, `${adapter.agent}-acp-${Date.now()}.raw`);
          writeFileSync(rawPath, rawLines.join("\n"), { mode: 0o600 });
        }
        if (!reaped) throw new AgentError("agent_failed", "어댑터 프로세스 그룹 종료를 확인하지 못했다", { cleanupUnconfirmed: true });
        const normalized = normalizeResult(request, facts, { ...meta, durationMs: Date.now() - started, rawPath });
        return hooks?.onEvent ? { ...normalized, events: { ...stats } } : normalized;
      } catch (error) {
        const reaped = await shutdown(timedOut ? sessionId : undefined);
        eventsStopped = true;
        eventsFinal = true;
        if (error instanceof AgentError && !reaped) throw new AgentError(error.code, `${error.message} (종료 확인 실패)`, { cleanupUnconfirmed: true });
        throw error;
      } finally {
        if (timer) clearTimeout(timer);
        if (idleTimer) clearTimeout(idleTimer);
        hooks?.signal?.removeEventListener("abort", onAbort);
        reaper.stop();
      }
    },
  };
}
