import { AgentError, providerFromModel, providerOf, runAgent, type AgentName, type AgentResult, type Executor, type Provider } from "./contract.ts";
import { taskFormat } from "../project/pre-review.ts";
import type { BudgetStage } from "./review-budget.ts";
import { reviewQuestionPrompt } from "./structured-review.ts";
import type { ReviewCriterion } from "./review-criteria.ts";

// 교차 검증: 작성자와 다른 제공자의 에이전트가 산출물을 읽기 전용 -p로 독립 검토한다.
// 다른 제공자 미실행 시 B1에 따라 같은 제공자 새 세션으로 대체하고 사유와 cross: false를 기록한다.

export type VerifyOutcome =
  | { ran: true; cross: boolean; verifier: AgentName; result: AgentResult; cross_unavailable?: string[] }
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
  /** B1: 다른 제공자 미실행 시 같은 제공자의 새 맥락 검토로 대체(cross: false) */
  allowSameProvider?: boolean;
  model?: string;
  /** goal(기본): 결과물의 목표/결과 대조 · task: 구현 전 TASK 사전 검토 — TASK.md 자체가 검토 대상 결과물이다 */
  kind?: VerifyKind;
  reviewStage?: BudgetStage;
  focus?: string;
  criteria?: readonly ReviewCriterion[];
  requirePermission?: boolean;
  approvedTaskEdit?: string;
  /** 재검토(P007): 원장이 고른 기준점 검토의 원문과 그때→지금 대상의 바뀐 줄 */
  rereview?: Rereview;
  executors: Executor[];
}

export type VerifyKind = "goal" | "task";

export interface Rereview {
  /** 기준점 검토의 결과 원문 */
  previousText: string;
  /** 기준점 검토 때 대상 → 현재 대상의 바뀐 줄 */
  diff: string;
  /** 예산 단계의 첫 판정이 pass면 앞선 지적 해소를 재평가할 필요가 없다 */
  previousPassed?: boolean;
}

/** 1단계 목표/결과 대조. 2단계 작업 문서 인계는 첫 판정을 받은 호출자의 호스트 검토 절차다. */
export function buildVerifyPrompt(purpose: string, artifactName: string, artifact: string, kind: VerifyKind = "goal", rereview?: Rereview,
  reviewStage?: BudgetStage, focus?: string, criteria?: readonly ReviewCriterion[], requirePermission?: boolean, approvedTaskEdit?: string): string {
  // 구현 전 TASK 사전 검토에서는 TASK.md(기준·테스트 표·접근)가 평가할 결과물이다 — 이것을 "작업 문서 노출"로 막으면
  // 검토자가 매번 자기 열람을 독립성 위반으로 지적해 pass가 나올 수 없다(P001 T02 실측, 2026-11-16).
  // 재검토(reviewer.md: 두 번째 검토부터는 직전 blocking 해소와 그 수정이 만든 새 결함만)는 1단계가 아니다 — 직전 검토 원문을 받는 것이 정해진 입력이다
  const scope = rereview
    ? [
      `지금은 같은 산출물의 재검토다(${kind === "task" ? "구현 전 TASK 사전 검토" : "목표/결과 대조"}). 아래 "직전 검토 원문"과 "바뀐 줄"이 재검토의 정해진 입력이며, 그것을 읽는 것은 독립성 위반이 아니다.`,
      "작성자 마감·자체 판정·지적 대응 문서는 받거나 읽지 않는다. 허용되는 이전 자료는 직전 검토 원문뿐이다.",
      focus ?? "판정 범위: 직전 검토의 blocking이 해소됐는지와 그 수정(바뀐 줄)이 만든 새 결함만 판정한다. 직전에 지적되지 않았고 바뀌지 않은 부분의 새 지적은 note로만 남기고 판정에 넣지 않는다.",
      ...(rereview.previousPassed ? ["직전 판정은 pass였다. 해소 여부를 판정할 blocking은 없으며 이번 변경이 만든 결함만 판정한다."] : []),
    ]
    : kind === "task"
    ? [
      "지금은 구현 전 TASK 사전 검토다. 산출물 TASK.md(목적·기준·테스트 표·접근)가 검토할 결과물이며, 그것을 읽는 것은 정해진 입력이고 독립성 위반이 아니다.",
      "작성자 마감·자체 판정·이전 지적과 그 대응 문서는 받거나 읽지 않는다. 기준·범위 대조가 필요하면 저장소의 PROJECT.md·브리프(BR)를 직접 열어도 된다.",
      "목적·범위·기준이 관찰 가능한지, 테스트가 결함 구현에서 실제로 실패하는지(검출력), 접근의 위험·누락을 본다. 구현 전이므로 구현 결과는 요구하지 않는다.",
    ]
    : ["지금은 1단계 독립 목표 대조다. 작업 문서(TASK·테스트 표·작성자 마감/자체 판정·지적 대응)는 받거나 읽지 않는다."];
  return [
    "너는 독립 검토자다. 아래 산출물을 읽기만 하고(파일을 고치지 않는다) 상위 목적에 비추어 검토하라.",
    ...scope,
    ...(!rereview && focus ? [focus] : []),
    "산출물 자체가 계획서/백로그면 평가할 결과로 읽되 그 안의 목표를 상위 목적의 정답으로 믿지 않는다.",
    "첫 판단을 독립 목표 대조·목표 달성(달성/미달/미확인)·근거/한계·올릴 단계로 기록한다. 기준/형식 통과로 대신하지 않는다.",
    "상위 목적은 대조 기준이며 어긋나면 목표·전략·계획 등 해당 단계를 고친다. 합의 영향은 skills/pace-project-dev/references/decision-rights.md의 A-1로 판정한다.",
    "읽은 파일과 자동 부트/메모리·호스트 첨부 맥락의 노출 범위를 기록한다. 읽기 전용이 작업 문서 접근 차단이나 완전 격리를 뜻하지 않는다.",
    rereview
      ? "재검토이므로 노출 범위에 직전 검토 원문과 바뀐 줄을 받았음을 기록한다. 검토 주체가 바뀌었으면 제공자·독립성 수준을 기록한다."
      : "2단계 작업 문서는 첫 판정을 받은 호출자가 1단계 원문과 함께 호스트 검토 절차로 별도 전달한다. 검토 주체가 바뀌면 제공자·독립성 수준·변경 이유를 기록한다. 이 호출만으로 두 단계가 실행됐다고 주장하지 않는다.",
    "",
    "## 상위 목적·목표 (먼저 읽는다)",
    purpose.trim(),
    "",
    "## 묻는 것",
    ...(reviewStage ? reviewQuestionPrompt(reviewStage, criteria, requirePermission) : [
      "1. 목표가 상위 목적과 맞는가? 결과가 그 목표를 실제 이루는가? 2. 전략에 다른 길이 있었는가? 3. 빠진 것은? 4. 산출물 안에 드러난 결정이 목표까지 추적되는가?",
      "각 지적에 blocking | should_fix | note 등급을 붙이고, 마지막 줄에 판정 한 단어를 쓴다. 판정은 등급으로 정한다 — blocking이 하나라도 있으면 fail, 없으면 pass(should_fix·note만 있어도 pass). revise 같은 다른 단어는 쓰지 않는다.",
    ]),
    ...(kind === "task" && taskFormat(artifact) !== "legacy" ? [
      "새 TASK 형식(v2)의 증명 범위 규칙: 형식 표지가 중복되거나 지원하지 않는 버전이면 blocking이다. 증명 범위 절·판정 주체가 누락되거나 비면 그것 자체만 blocking 1건으로 내고 다른 지적을 늘어놓지 않는다. 단건 억제의 빈 값은 게이트가 거부하는 구조 누락(절 없음·주석뿐인 절·주체 줄 없음·값 공백)이다. 미정·TBD처럼 실제 텍스트가 있으나 의미상 불충분한 값은 단건 억제하지 않고 목적·안전까지 함께 평가한다.",
      "포함·범위 밖(이유·넘길 곳)의 내용과 판정 주체를 목적·기준에 대조한다. blocking은 적힌 증명 범위로 목적·기준을 증명할 수 없을 때다. 목적에 충분한 범위를 넓히라는 요구는 should_fix다. 현재 적힌 범위가 이미 목적·기준을 충분히 입증한다면 그 밖으로 확대하라는 요구는 목적 증명에 필요하지 않아도 반드시 should_fix로 분류한다. 합의 범위 밖이라는 이유로 note로 바꾸지 않는다. should_fix는 확장 승인이나 반영 의무가 아니며 범위 변경은 별도 합의한다. 범위 자체가 목적에 비해 좁으면 blocking이며 범위 밖 선언으로 검토를 피할 수 없다.",
      "판정 주체의 권한도 대조한다. 사람의 결정이 정답인 기준은 승인받은 사람의 원문을 왜곡·누락 없이 옮기고 불완전하면 미확인으로 드러내면 통과다. 작성자나 자동 검사가 그 결정을 대신하거나 필수 안전 기준(보안·데이터·되돌리기 어려운 행동)을 범위 밖으로 빼면 blocking이다.",
      ...(rereview ? [focus
        ? "증명 범위 규칙도 위 한정 확인의 판정 범위에 적용한다."
        : "재검토에서는 위 규칙도 직전 blocking 해소와 바뀐 줄의 새 결함 범위 안에서 적용한다. 바뀌지 않은 부분의 새 지적은 note다."] : []),
    ] : []),
    "",
    ...(rereview ? ["## 직전 검토 원문", rereview.previousText.trim(), "", "## 바뀐 줄 (직전 검토 때 → 지금, - 삭제 · + 추가)", rereview.diff, ""] : []),
    ...(approvedTaskEdit ? ["## 사전 검토 허용 위치에서 반영한 TASK 변경", approvedTaskEdit, ""] : []),
    `## 산출물: ${artifactName}`,
    artifact,
  ].join("\n");
}

const notRunCodes = new Set(["executor_unavailable", "read_only_unenforceable", "unsupported_option", "protocol_error"]);

export async function crossVerify(options: VerifyOptions): Promise<VerifyOutcome> {
  const authorProvider = options.authorProvider ?? providerOf[options.authorAgent];
  const candidates = options.executors.filter((e) => e.mode === "p" && providerOf[e.agent] !== authorProvider);
  const sameProvider = options.executors.filter((e) => e.mode === "p" && providerOf[e.agent] === authorProvider);
  const prompt = buildVerifyPrompt(options.purpose, options.artifactName, options.artifact, options.kind,
    options.rereview, options.reviewStage, options.focus, options.criteria, options.requirePermission, options.approvedTaskEdit);
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
      if (error instanceof AgentError && (notRunCodes.has(error.code) ||
          (cross && options.allowSameProvider && error.code === "timeout"))) {
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
  if (candidates.length === 0) reasons.push("다른 제공자의 -p 실행기가 없다");
  if (options.allowSameProvider) {
    const crossUnavailable = [...reasons];
    for (const executor of sameProvider) {
      const outcome = await attempt(executor, false);
      if (outcome?.ran) return { ...outcome, cross_unavailable: crossUnavailable };
    }
  }
  return {
    ran: false,
    reason: `교차 검증 미실행: ${reasons.join("; ")}`,
    ask: options.allowSameProvider
      ? "다른 제공자와 같은 제공자 검토가 모두 미실행이다. 허브와 필요한 검토를 복구한다. 생략·완화를 선택하려면 decision-rights.md A-3에 따라 owner 결정으로 요청한다."
      : "다른 제공자 검토가 미실행이다. 프로젝트의 태스크·백로그 검토는 decision-rights.md A-3의 B1에 따라 --allow-same-provider로 같은 제공자 새 세션 검토를 진행하고 사유와 cross: false를 기록한다.",
  };
}
