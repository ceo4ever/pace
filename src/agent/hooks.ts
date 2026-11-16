import { buildBootContext, type BootOptions } from "../boot.ts";
import { AgentError, type AgentRequest, type RunHooks, type SavedSession } from "./contract.ts";

// ACP 실행 훅을 만드는 도우미 — 정체성 맥락과 대화 이어가기 계획.

const IDENTITY_HEADER = "[이 세션의 정체성·프로젝트 맥락 — 참고용이다. 응답에서 되풀이하거나 인사하지 말고 요청에만 답한다]";
const IDENTITY_FOOTER = "[맥락 끝]";

/**
 * 프로필·프로젝트 정의를 부트 출력에서 만들어 첫 프롬프트 앞에 붙일 문자열로 돌려준다.
 * 부트 출력의 "첫 응답 지침"(인사 지시)은 메신저 응답에 맞지 않아 뺀다.
 */
export function buildIdentityContext(options: Omit<BootOptions, "host">): string {
  const boot = buildBootContext({ ...options, host: "plain" });
  const lines = boot.split("\n");
  const kept: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (/^## /.test(line)) skipping = /^## 첫 응답 지침/.test(line);
    if (!skipping) kept.push(line);
  }
  return `${IDENTITY_HEADER}\n${kept.join("\n").trim()}\n${IDENTITY_FOOTER}`;
}

export interface ContinuePlan {
  mode: "resume" | "new-session";
  request: AgentRequest;
  hooks: Pick<RunHooks, "savedSession" | "handoffSummary">;
  reason: string;
}

/**
 * 대화를 이어가는 방법을 정한다.
 * - 에이전트·cwd가 다르면 거부(session_mismatch).
 * - 접근 권한이 같고 실행기가 resume을 지원하면 resume(저장 기록을 훅으로 함께 넘긴다).
 * - 접근 권한이 다르면(읽기→쓰기 전환 포함 — 같은 세션에서 권한 상승 없음) 또는 resume 미지원이면
 *   새 세션을 열고 이전 대화 요약을 인계한다.
 */
export function continueSession(saved: SavedSession, request: AgentRequest, summary: string, options: { canResume: boolean }): ContinuePlan {
  if (saved.agent !== request.agent || saved.cwd !== request.cwd) {
    throw new AgentError("session_mismatch", "이어가기는 같은 에이전트·cwd에서만 쓸 수 있다", { started: false });
  }
  const fresh = { ...request, resume: undefined };
  if (saved.access !== request.access) {
    return { mode: "new-session", request: fresh, hooks: { handoffSummary: summary }, reason: `접근 권한이 ${saved.access} → ${request.access}로 바뀌어 같은 세션을 쓰지 않고 요약을 인계한다` };
  }
  if (!options.canResume) {
    return { mode: "new-session", request: fresh, hooks: { handoffSummary: summary }, reason: "실행기가 이어가기를 지원하지 않아 요약을 인계한다" };
  }
  return { mode: "resume", request: { ...request, resume: saved.sessionId }, hooks: { savedSession: saved }, reason: "같은 세션을 이어간다" };
}
