import { AgentError } from "./contract.ts";

// 실패 분류 — 한도·인증 문구는 실제 신호를 확보하지 못한 가정이라(P035 T01) 정규식 기본 패턴 + 설정 패턴으로 분류하고
// 원문은 호출자가 보존한다. 분류가 틀리면 불필요한 전환·재시도가 생길 수 있다.

export type FailureKind = "rate_limited" | "auth_failed" | "executor_unavailable" | "read_only_unenforceable" | "timeout" | "failed";

const LIMIT_PATTERNS: RegExp[] = [
  /usage[ _-]?limit/i,
  /rate[ _-]?limit/i,
  /\b429\b/,
  /too many requests/i,
  /quota (exceeded|exhausted)/i,
  /hit your (usage )?limit/i,
  /limit reached/i,
];
const AUTH_PATTERNS: RegExp[] = [
  /\b401\b/,
  /unauthori[sz]ed/i,
  /not logged in/i,
  /please (log ?in|run .{0,20}login)/i,
  /authentication (failed|error|required)/i,
  /invalid (api key|token)/i,
  /token (has )?expired/i,
  /login required/i,
];

/** 텍스트(오류 메시지·stderr·stdout 앞부분)를 분류한다. 한도가 인증보다 먼저 — 둘 다 걸리면 한도로 본다 */
export function classifyText(text: string, extraLimitPatterns: RegExp[] = []): "rate_limited" | "auth_failed" | "failed" {
  if ([...LIMIT_PATTERNS, ...extraLimitPatterns].some((p) => p.test(text))) return "rate_limited";
  if (AUTH_PATTERNS.some((p) => p.test(text))) return "auth_failed";
  return "failed";
}

export function classifyFailure(error: AgentError, extraLimitPatterns: RegExp[] = []): FailureKind {
  switch (error.code) {
    case "executor_unavailable":
    case "read_only_unenforceable":
    case "timeout":
    case "rate_limited":
    case "auth_failed":
      return error.code;
    case "agent_failed":
      return classifyText(error.message, extraLimitPatterns);
    default:
      return "failed"; // invalid_request·unsupported_option·protocol_error·session_mismatch는 잘못된 요청·프로토콜 문제 — 폴백하지 않는다
  }
}

/** 원문에서 한도 해제 시각(epoch ms)을 읽는다 — epoch 초·밀리초, ISO, Retry-After 초. 못 읽거나 과거면 null */
export function parseResetAt(text: string, now: number): number | null {
  const candidates: number[] = [];
  for (const m of text.matchAll(/\b([1-4]\d{9})(\d{3})?\b/g)) candidates.push(m[2] ? Number(m[1] + m[2]) : Number(m[1]) * 1000);
  for (const m of text.matchAll(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})/g)) {
    const t = Date.parse(m[0]);
    if (Number.isFinite(t)) candidates.push(t);
  }
  const retry = /retry[- ]after:?\s*(\d{1,7})/i.exec(text);
  if (retry) candidates.push(now + Number(retry[1]) * 1000);
  const future = candidates.filter((t) => t > now);
  return future.length > 0 ? Math.min(...future) : null;
}

export function excerpt(text: string, max = 300): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}
