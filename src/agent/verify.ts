import { AgentError, providerFromModel, providerOf, runAgent, type AgentName, type AgentResult, type Executor, type Provider } from "./contract.ts";

// 교차 검증: 작성자와 다른 제공자의 에이전트가 산출물을 읽기 전용 -p로 독립 검토한다.
// 같은 제공자로 몰래 대체하지 않는다 — 못 하면 "미실행"으로 기록하고 사용자에게 묻는다.

export type VerifyOutcome =
  | { ran: true; cross: boolean; verifier: AgentName; result: AgentResult }
  | { ran: false; reason: string; ask: string };

export interface VerifyOptions {
  authorAgent: AgentName;
  /** 작성자의 실제 제공자를 알면 지정(기본: 작성 에이전트의 고정표) */
  authorProvider?: Provider;
  purpose: string;
  artifact: string;
  artifactName: string;
  cwd: string;
  timeoutMs?: number;
  /** 단일 제공자 사용자: 같은 제공자의 새 맥락 검토로 대체(교차 아님으로 기록) */
  allowSameProvider?: boolean;
  model?: string;
  executors: Executor[];
}

/** 1단계 목표/결과 대조. 2단계 작업 문서 인계는 첫 판정을 받은 호출자의 호스트 검토 절차다. */
export function buildVerifyPrompt(purpose: string, artifactName: string, artifact: string): string {
  return [
    "너는 독립 검토자다. 아래 산출물을 읽기만 하고(파일을 고치지 않는다) 상위 목적에 비추어 검토하라.",
    "지금은 1단계 독립 목표 대조다. 작업 문서(TASK·테스트 표·작성자 마감/자체 판정·지적 대응)는 받거나 읽지 않는다.",
    "산출물 자체가 계획서/백로그면 평가할 결과로 읽되 그 안의 목표를 상위 목적의 정답으로 믿지 않는다.",
    "첫 판단을 독립 목표 대조·목표 달성(달성/미달/미확인)·근거/한계·올릴 단계로 기록한다. 기준/형식 통과로 대신하지 않는다.",
    "상위 목적은 대조 기준이며 어긋나면 목표·전략·계획 등 해당 단계를 고친다. 합의 목적/목표/범위 변경은 사용자에게 묻는다.",
    "읽은 파일과 자동 부트/메모리·호스트 첨부 맥락의 노출 범위를 기록한다. 읽기 전용이 작업 문서 접근 차단이나 완전 격리를 뜻하지 않는다.",
    "2단계 작업 문서는 첫 판정을 받은 호출자가 1단계 원문과 함께 호스트 검토 절차로 별도 전달한다. 검토 주체가 바뀌면 제공자·독립성 수준·변경 이유를 기록한다. 이 호출만으로 두 단계가 실행됐다고 주장하지 않는다.",
    "",
    "## 상위 목적·목표 (먼저 읽는다)",
    purpose.trim(),
    "",
    "## 묻는 것",
    "1. 목표가 상위 목적과 맞는가? 결과가 그 목표를 실제 이루는가? 2. 전략에 다른 길이 있었는가? 3. 빠진 것은? 4. 산출물 안에 드러난 결정이 목표까지 추적되는가?",
    "각 지적에 blocking | should_fix | note 등급을 붙이고, 마지막 줄에 판정 한 단어(pass | revise | fail)를 쓴다.",
    "",
    `## 산출물: ${artifactName}`,
    artifact,
  ].join("\n");
}

const notRunCodes = new Set(["executor_unavailable", "read_only_unenforceable", "unsupported_option", "protocol_error"]);

export async function crossVerify(options: VerifyOptions): Promise<VerifyOutcome> {
  const authorProvider = options.authorProvider ?? providerOf[options.authorAgent];
  const candidates = options.executors.filter((e) => e.mode === "p" && providerOf[e.agent] !== authorProvider);
  const sameProvider = options.executors.filter((e) => e.mode === "p" && providerOf[e.agent] === authorProvider);
  const prompt = buildVerifyPrompt(options.purpose, options.artifactName, options.artifact);
  const reasons: string[] = [];

  const attempt = async (executor: Executor, cross: boolean): Promise<VerifyOutcome | null> => {
    try {
      const result = await runAgent(executor, { agent: executor.agent, mode: "p", prompt, cwd: options.cwd, access: "read-only", timeoutMs: options.timeoutMs, model: options.model });
      // 제공자는 결과의 확인 출처로 판별한다 — 보고된 모델이 작성자 제공자면 교차로 인정하지 않는다
      if (cross) {
        // 고정표(table)는 확인이 아니다 — 에이전트 보고 또는 보고된 모델 이름으로 확인된 제공자만 교차로 인정한다
        const reportedModel = providerFromModel(result.model.source === "reported" ? result.model.value : null);
        const confirmed = result.provider.source === "table" ? reportedModel : result.provider.value;
        if (!confirmed) {
          reasons.push(`${executor.agent}: 결과에서 실제 모델·제공자를 확인하지 못해 교차로 인정하지 않음`);
          return null;
        }
        if (confirmed === authorProvider) {
          reasons.push(`${executor.agent}: 결과의 제공자(${confirmed})가 작성자 제공자와 같아 교차로 인정하지 않음`);
          return null;
        }
      }
      return { ran: true, cross, verifier: executor.agent, result };
    } catch (error) {
      if (error instanceof AgentError && notRunCodes.has(error.code)) {
        reasons.push(`${executor.agent}: ${error.code} — ${error.message}`);
        return null;
      }
      throw error;
    }
  };

  for (const executor of candidates) {
    const outcome = await attempt(executor, true);
    if (outcome) return outcome;
  }
  if (options.allowSameProvider) {
    for (const executor of sameProvider) {
      const outcome = await attempt(executor, false);
      if (outcome) return outcome;
    }
  }
  if (candidates.length === 0) reasons.push("다른 제공자의 -p 실행기가 없다");
  return {
    ran: false,
    reason: `교차 검증 미실행: ${reasons.join("; ")}`,
    ask: options.allowSameProvider
      ? "같은 제공자 검토도 불가했다 — 검증을 건너뛸지 사용자에게 묻는다"
      : "다른 제공자 에이전트를 쓸 수 없다 — 같은 제공자의 새 맥락 검토(교차 아님 기록)로 대체할지, 건너뛸지 사용자에게 묻는다",
  };
}
