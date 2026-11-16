import { join } from "node:path";
import { AgentError, runAgent, validateRequest, type AgentName, type Executor, type Mode, type RunHooks } from "../agent/contract.ts";
import { ChainConfigError, defaultChainFile, fileCooldownStore, loadChainConfig, resolveChain, runChain, type CooldownStore } from "../agent/chain.ts";
import { buildIdentityContext, continueSession } from "../agent/hooks.ts";
import { findExecutor } from "../agent/registry.ts";
import { profileDir } from "../core/paths.ts";
import { resolveProfileName } from "../profile/profile.ts";
import type { Redactor } from "./secrets.ts";
import type { RunJob, RunCtl, RunResult, Runner } from "./types.ts";

// 기본 실행자 — 체인(T02)·ACP 훅(T03)을 daemon 작업에 결선한다.
// - 훅: paceMcp(요청의 cwd·access에서 서버 생성)·정체성 맥락·이벤트·권한(기본 거절 도구만 사용자에게 묻는다)·취소 신호.
// - 이어가기: 같은 대화·워크트리·agent·cwd·access·체인이면 resume, 아니면(권한 전환 포함) 새 세션 + 직전 응답 요약.
// - 한계: 실행기가 자식 pid를 알려 주지 않아 ctl.onProcess는 부르지 않는다 — 강제 종료 뒤 회수는 증명할 수 없어 격리로 처리된다.

export interface ChainRunnerOptions {
  home: string;
  find?: (agent: AgentName, mode: Mode) => Executor | undefined;
  chainFile?: string;
  cooldowns?: CooldownStore;
  /** 정체성 맥락 생성(시험에서 대체) */
  identity?: (cwd: string) => string | undefined;
  timeoutMs?: number;
  /** 오류·인계 문자열을 자르기 전에 비밀을 제거한다(잘린 토큰 조각이 남지 않게) */
  redact?: Redactor;
}

let redactor: Redactor | undefined;
function excerpt(text: string, max = 300): string {
  const flat = (redactor ? redactor(text) : text).replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

export function createChainRunner(options: ChainRunnerOptions): Runner {
  const find = options.find ?? findExecutor;
  const cooldowns = options.cooldowns ?? fileCooldownStore(join(options.home, "agent-cooldowns.json"));
  const timeoutMs = options.timeoutMs ?? 600_000;
  redactor = options.redact;

  return async (job: RunJob, ctl: RunCtl): Promise<RunResult> => {
    const access = job.target.access;
    const cwd = job.target.worktree;
    try {
      let file = options.chainFile;
      if (!file) {
        const profile = resolveProfileName(options.home);
        if (!profile) throw new ChainConfigError("프로필이 없어 체인 설정 위치를 정할 수 없다");
        file = defaultChainFile(profileDir(options.home, profile));
      }
      const config = loadChainConfig(file);
      const chain = resolveChain(config, job.target.chain);
      let context: string | undefined;
      try { context = (options.identity ?? ((dir: string) => buildIdentityContext({ home: options.home, cwd: dir })))(cwd); } catch { context = undefined; }

      const hooks: RunHooks = {
        paceMcp: true,
        context,
        onEvent: (update) => ctl.update(update),
        // 기본 허용은 묻지 않고, 기본 거절(목록 밖 도구)만 사용자 승인을 받는다 — 읽기 전용에서는 어차피 허용을 만들 수 없다
        onPermission: async (info) => {
          if (info.defaultDecision === "allow") return "allow";
          const ok = await ctl.requestApproval(`도구 권한 요청: ${info.toolName}${info.kind ? ` (kind: ${info.kind})` : ""}${info.title ? ` — ${info.title}` : ""}`);
          return ok ? "allow" : "reject";
        },
      };
      const input = { prompt: job.prompt, cwd, access, timeoutMs };

      // 이어가기: 첫 단계 에이전트와 보관 세션이 맞을 때만 resume을 시도한다
      const first = chain.steps[0]!;
      if (job.saved && first.mode === "acp" && job.saved.agent === first.agent) {
        const exec = find(first.agent, "acp");
        const request = validateRequest({ agent: first.agent, mode: "acp", prompt: job.prompt, cwd, access, timeoutMs, model: first.model });
        const plan = continueSession({ sessionId: job.saved.sessionId, agent: job.saved.agent, cwd: job.saved.cwd, access: job.saved.access }, request, job.saved.lastText, { canResume: exec?.capabilities.resume === true });
        hooks.handoffSummary = plan.hooks.handoffSummary;
        if (plan.mode === "resume" && exec) {
          try {
            const result = await runAgent(exec, { ...plan.request }, { ...hooks, savedSession: plan.hooks.savedSession, signal: ctl.signal });
            return { status: result.is_error ? "failed" : "done", text: result.text, cleanupUnconfirmed: false, session: result.session_id ? { sessionId: result.session_id, agent: result.agent, cwd, access } : null };
          } catch (error) {
            if (!(error instanceof AgentError)) throw error;
            if (error.started) return fromError(error);
            // 프롬프트 전송 전 실패(resume 거부 등) → 새 세션 + 요약으로 체인 실행
          }
        }
      }

      const outcome = await runChain(chain, input, { find, cooldowns, limitPatterns: config.limitPatterns, hooks, signal: ctl.signal });
      switch (outcome.status) {
        case "ok": {
          const r = outcome.result;
          return { status: "done", text: r.text, cleanupUnconfirmed: false, session: r.mode === "acp" && r.session_id ? { sessionId: r.session_id, agent: r.agent, cwd, access } : null, detail: outcome.warnings.join("; ") || undefined, via: describeVia(outcome.attempts) };
        }
        case "chain_exhausted":
          return { status: "failed", text: "", cleanupUnconfirmed: false, detail: "모든 단계가 한도·사용 불가로 건너뛰어졌다", nextRetryAt: outcome.next_retry_at };
        case "failed":
          return { status: outcome.error.code === "cancelled" ? "cancelled" : "failed", text: "", cleanupUnconfirmed: false, detail: excerpt(`${outcome.error.code}: ${outcome.error.message}`), changes: outcome.changes ? JSON.stringify(outcome.changes) : undefined };
        case "handoff_required":
          return {
            status: outcome.last_error?.code === "cancelled" && outcome.reason !== "cleanup_unconfirmed" ? "cancelled" : "handoff", text: "", cleanupUnconfirmed: outcome.reason === "cleanup_unconfirmed",
            handoff: excerpt(`${outcome.reason}${outcome.last_error ? ` (${outcome.last_error.code})` : ""}${outcome.changes ? ` — 변경: ${JSON.stringify(outcome.changes)}` : ""}`, 1500),
            detail: outcome.reason, changes: outcome.changes ? JSON.stringify(outcome.changes) : undefined,
          };
      }
    } catch (error) {
      if (error instanceof AgentError) return fromError(error);
      if (error instanceof ChainConfigError) return { status: "failed", text: "", cleanupUnconfirmed: false, detail: `체인 설정 오류: ${error.message}` };
      return { status: "failed", text: "", cleanupUnconfirmed: true, detail: excerpt(String((error as Error).message ?? error)) };
    }
  };
}

function fromError(error: AgentError): RunResult {
  return { status: error.code === "cancelled" ? "cancelled" : "failed", text: "", cleanupUnconfirmed: error.cleanupUnconfirmed, detail: excerpt(`${error.code}: ${error.message}`) };
}

/** 처리한 체인 단계 표시 — 건너뛰거나 폴백한 단계가 있으면 `a/acp(한도·실패) → b/-p`처럼 흐름을 보여 준다 */
export function describeVia(attempts: { agent: string; mode: string; outcome: string }[]): string {
  const name = (a: { agent: string; mode: string }) => `${a.agent}/${a.mode === "p" ? "-p" : a.mode}`;
  const used = attempts.find((a) => a.outcome === "success");
  if (!used) return "";
  const before = attempts.filter((a) => a !== used && (a.outcome === "fallback" || a.outcome === "skipped"));
  return before.length === 0 ? name(used) : `${before.map((a) => `${name(a)}(${a.outcome === "skipped" ? "건너뜀" : "한도·실패"})`).join(" → ")} → ${name(used)}`;
}
