import type { BudgetStage } from "./review-budget.ts";
import { parseVerdict, type Verdict } from "./review-log.ts";
import { parsePermission, type PermissionInput } from "../project/review-permission.ts";

export type ReviewCriterion = { id: string; text: string };

/** 구현 후 reviewer의 세 묶음 점검 항목. 결정 권한 A-n·백로그 준비 B-n·목록 기준 C-n과 겹치지 않는 접두를 쓴다. */
export const POST_BUNDLE_ITEMS: readonly ReviewCriterion[] = [
  { id: "RA-1", text: "경계(A): 새 진입점마다 인가를 확인하는 위치가 있는가" },
  { id: "RA-2", text: "경계(A): 거부가 기본값인가" },
  { id: "RA-3", text: "경계(A): 원문·비밀이 응답·로그·이력에 새는가" },
  { id: "RA-4", text: "경계(A): 외부 입력이 셸·경로·쿼리로 그대로 가는가" },
  { id: "RB-1", text: "상태(B): 쓰기마다 감사 이력이 남는가" },
  { id: "RB-2", text: "상태(B): 과거·확정 데이터를 소급 변경하는가" },
  { id: "RB-3", text: "상태(B): 마이그레이션 왕복과 기존 행이 안전한가" },
  { id: "RB-4", text: "상태(B): 시험이 저장 뒤 다시 조회해서 단언하는가" },
  { id: "RC-1", text: "흐름(C): 잠금 순서와 교착" },
  { id: "RC-2", text: "흐름(C): 트랜잭션 밖 부작용" },
  { id: "RC-3", text: "흐름(C): 부분 실패의 잔여물과 롤백" },
  { id: "RC-4", text: "흐름(C): 시험이 덮지 않은 분기 조합" },
];

/** 기록된 필수 항목이 세 묶음 12항목이면 묶음 점검 규칙으로 판정한다. 그 밖(옛 사후 기록의 T-n 등)은 지금 규칙으로 판독한다. */
export function isBundleItems(ids: readonly string[] | undefined): boolean {
  return !!ids && ids.length === POST_BUNDLE_ITEMS.length && POST_BUNDLE_ITEMS.every(({ id }, index) => ids[index] === id);
}

const questions = {
  backlog: {
    question: "이 백로그로 프로젝트에 착수하면 owner에게 다시 묻지 않고 합의한 목표까지 갈 수 있는가?",
    checks: {
      goal: "목표가 상위 목적과 owner 원문에 맞는가",
      completion: "완료 기준을 판정할 수 있는가",
      sequence: "순서·선행·다른 백로그와 충돌이 없는가",
      owner: "owner 결정이 남아 있지 않은가",
    },
  },
  pre: {
    question: "이 계획이 목적을 증명할 수 있는가?",
    checks: {
      scope: "증명 범위와 판정 주체가 목적을 덮는가",
      observable: "완료 기준과 관측 방법이 명확한가",
      detection: "시험이 결함에서 실패하는가",
      reviewer: "구현 후 reviewer 필요·생략 판단이 경계·상태·흐름 사실 질문의 답과 맞는가",
      breadth: "기준이 변경 영향 경로를 넘어 기존 동작까지 넓혀지지 않았는가",
    },
  },
  post: {
    question: "이 변경을 내보내도 되는가?",
    checks: {
      criteria: "계약 기준을 지켰는가",
      defect: "재현 가능한 결함이나 회귀가 있는가",
      safety: "합의한 안전 기준을 지켰는가",
    },
  },
} as const;

/** 구현 후 reviewer 묶음 점검. 질문 밖 지적(기준 재판정·계획 타당성 등)은 note다. */
const bundleQuestion = {
  question: "이 변경을 내보내도 되는가?",
  checks: {
    boundary: "경계(A) — 허용되지 않은 주체나 입력이 닿을 수 있는 경로가 생겼는가",
    state: "상태(B) — 기준에 적히지 않은 데이터를 바꾸거나 남겨야 할 기록을 빠뜨리는가",
    flow: "흐름(C) — 순서가 어긋나거나 중간에 실패할 때 결과가 깨지는가",
  },
} as const;
const bundleStates = ["defect", "none", "not_applicable"];

function stageQuestion(stage: BudgetStage, criteria: readonly string[] | undefined): { question: string; checks: Readonly<Record<string, string>> } {
  return stage === "post" && isBundleItems(criteria) ? bundleQuestion : questions[stage];
}

const outside = ["implementation", "design", "other"];
const reviewFence = /^```pace-review[ \t]*\r?$/gm;
const grades = ["blocking", "should_fix", "note"] as const;
const observationByStage = {
  backlog: "인계 원문에서 기준의 뜻, 완료를 확인할 자료와 관측 방법을 확인한다.",
  pre: "TASK에서 기준의 판정 조건과 시험이 그 조건의 실패를 잡는지 확인한다. 구현 결과는 요구하지 않는다.",
  post: "구현과 시험이 기준을 실제 충족했다는 결과를 확인한다.",
};
type Grade = typeof grades[number];
type Confidence = "high" | "medium" | "low";
const impacts = ["goal", "criterion", "security", "data_loss", "irreversible", "minor"] as const;
type Impact = typeof impacts[number];
type SafetyPath = { input: string; reached: string; result: string };
type EvidenceState = "present" | "absent" | "unverified" | "defect" | "none" | "not_applicable";
type CriterionEvidence = { id: string; state: EvidenceState; observation: string | null };
type Recurrence = "same_class" | "superficial_fix";

type FindingInput = {
  id: string;
  severity: Grade;
  category: string;
  location: string | null;
  scenario: string | null;
  reproduction: string | null;
  confidence: Confidence;
  impact?: Impact;
  criterion?: string | null;
  safety_path?: unknown;
  recurrence?: unknown;
};
type Finding = FindingInput & {
  recurrence?: Recurrence;
  effective: Grade | "unverified";
  reason: "outside_question" | "missing_evidence" | "minor_impact" | "unknown_criterion" | "safety_unverified" | null;
  handoff: "implementation_review" | "project_design" | null;
};

export interface StructuredAssessment {
  stage: BudgetStage;
  verdict: Verdict;
  reported_verdict: Verdict;
  differs: boolean;
  findings: Finding[] | null;
  evidence?: {
    criteria: CriterionEvidence[];
    issues: string[];
  };
  permission?: PermissionInput;
}

export function reviewQuestionPrompt(stage: BudgetStage, criteria?: readonly ReviewCriterion[], requirePermission = false): string[] {
  const bundle = stage === "post" && isBundleItems(criteria?.map(({ id }) => id));
  const { question, checks } = stageQuestion(stage, criteria?.map(({ id }) => id));
  const allChecks = [...Object.entries(checks)].map(([key, check]) => `- ${key}: ${check}`);
  const category = Object.keys(checks)[0];
  const sample = { id: "F1", severity: "blocking", category, location: "파일:줄", scenario: "실패 조건",
    reproduction: "재현 수단", confidence: "high" };
  const format = criteria === undefined ? { version: 1, findings: [sample] } : {
    version: 2,
    findings: [{ ...sample, impact: "criterion", criterion: criteria[0]?.id ?? null, safety_path: null }],
    criteria: (criteria.length ? [criteria[0]!] : []).map(({ id }) => bundle
      ? { id, state: "none", observation: "따라가 본 경로" } : { id, state: "present", observation: "관측 근거" }),
    ...(requirePermission ? { permission: { mode: "probe", paths: ["test/probe.ts"], protected: [{ from: 1, to: 1 }] } } : {}),
  };
  return [
    question, ...allChecks,
    "지적은 다음 형식의 pace-review 코드 블록 하나로 보존한다. JSON 형식과 version을 지켜야 판정할 수 있다.",
    bundle
      ? "category는 위 묶음 boundary, state, flow 중 하나 또는 질문 밖의 implementation(구현 방식), design(설계 방식), other(그 밖)다. RA-1 같은 점검 항목 ID는 category가 아니라 criterion에 쓴다."
      : "category는 위 하위 확인 ID 하나 또는 질문 밖의 implementation(구현 방식), design(설계 방식), other(그 밖)다.",
    "severity는 blocking, should_fix, note 중 하나, confidence는 high, medium, low 중 하나다. 각각 고유한 F 번호를 붙인다.",
    "location에는 파일:줄을, scenario에는 실패 조건을, reproduction에는 재현 수단을 쓴다. 확보하지 못한 값은 null로 표시한다.",
    "지적이 없으면 findings를 빈 배열로 낸다. 도구는 질문에 맞는 지적의 영향과 근거에서 판정을 계산한다.",
    ...(criteria === undefined ? [] : [
      "impact는 goal(합의 목적), criterion(수용 기준), security, data_loss, irreversible, minor(문구·스타일 등) 중 하나다. criterion 영향이면 해당 기준 ID를 criterion 필드에 쓴다.",
      "합의한 동작의 회귀와 검출력 없는 필수 시험은 해당 목적 또는 기준의 영향으로 판단한다.",
      "안전상 직접 실행하지 않을 지적은 safety_path에 input, reached, result를 쓴다. 파일 위치와 완전한 설명을 갖춘 경로는 직접 재현을 대신한다.",
      ...(bundle ? [
        "criteria에 다음 12개 점검 항목을 모두 포함한다. state는 defect(결함 — 같은 항목 ID를 criterion에 단 지적을 findings에 낸다), none(없음 — observation에 따라가 본 경로), not_applicable(해당 없음 — observation에 이유) 중 하나다.",
        "TASK 기준 충족은 tester가 실행으로 판정한다. 기준별 실행 증거를 요구하지 않고 diff를 읽어 점검 항목마다 답한다. 기준 재판정과 계획 타당성 지적은 category other로 낸다.",
        ...criteria.map(({ id, text }) => `- [점검 항목 ${id}] ${text}`),
        "재검토와 수정 확인에서도 12항목 전체를 diff 전체에 대해 다시 답하고, 직전 blocking 각각의 해소 여부를 답한다.",
      ] : [
        "criteria에 다음 필수 기준을 모두 포함한다. state는 present, absent, unverified다. present의 observation에 확인한 자료와 관측을 쓴다.",
        observationByStage[stage],
        ...criteria.map(({ id, text }) => `- [필수 기준 ${id}] ${text}`),
        ...(!criteria.length ? ["필수 기준 자료를 판독할 수 없다. 근거의 미확인을 기록한다."] : []),
        "재검토에서 이전 기준 상태를 확인하고, 바뀐 증거와 그 영향만 새로 관측한다. 그대로 적용되는 확인의 근거를 함께 반환한다.",
      ]),
    ]),
    ...(requirePermission ? [
      "사전 검토의 permission.mode에는 합의한 탐침(probe) 또는 구현(implementation)을 적는다. paths에는 허가한 저장소 상대 일반 파일 경로를 정확히 적는다.",
      "probe의 빈 paths는 파일 변경을 허용하지 않는다. 구현 전체가 계약에 명시돼 있으면 implementation에 빈 paths를 사용할 수 있다.",
      "permission.protected에는 pass의 근거로 사용한 TASK.md의 원래 줄 범위를 from/to로 적는다. 허용할 should_fix·note의 위치는 TASK.md:줄 또는 TASK.md:시작-끝으로 적는다.",
    ] : []),
    "",
    "```pace-review",
    JSON.stringify(format),
    "```",
    "",
    "코드 블록 뒤 마지막 줄에 검토자가 보고한 pass 또는 fail 한 단어를 쓴다.",
  ];
}

function findingInput(value: unknown, checks: Readonly<Record<string, string>>, withEvidence: boolean): value is FindingInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && /^F\d+$/.test(row.id) && grades.some((grade) => grade === row.severity) &&
    typeof row.category === "string" && (Object.hasOwn(checks, row.category) || outside.includes(row.category)) &&
    typeof row.confidence === "string" && ["high", "medium", "low"].includes(row.confidence) &&
    (!withEvidence || (impacts.includes(row.impact as Impact) &&
      (row.criterion === null || row.criterion === undefined || typeof row.criterion === "string"))) &&
    [row.location, row.scenario, row.reproduction].every((item) => item === null || item === undefined || typeof item === "string");
}

function safetyPath(value: unknown): value is SafetyPath {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const path = value as Record<string, unknown>;
  return [path.input, path.reached, path.result].every((part) => typeof part === "string" && part.trim() !== "");
}

function assessFinding(stage: BudgetStage, input: FindingInput, criteria?: readonly string[]): Finding {
  const { id, severity, category, confidence, recurrence } = input;
  const fields: Omit<Finding, "effective" | "reason" | "handoff"> = {
    id, severity, category, confidence,
    location: input.location?.trim() || null,
    scenario: input.scenario?.trim() || null,
    reproduction: input.reproduction?.trim() || null,
    ...(recurrence === "same_class" || recurrence === "superficial_fix" ? { recurrence } : {}),
    ...(criteria === undefined ? {} : { impact: input.impact, criterion: input.criterion ?? null, safety_path: input.safety_path ?? null }),
  };
  if (outside.includes(category)) {
    const handoff = stage === "pre" && category === "implementation" ? "implementation_review" :
      stage === "backlog" && (category === "design" || category === "implementation") ? "project_design" : null;
    return { ...fields, effective: "note", reason: "outside_question", handoff };
  }
  const locations = fields.location?.split(/,[ \t]+/) ?? [];
  if (severity !== "blocking") return { ...fields, effective: severity, reason: null, handoff: null };
  if (criteria && input.impact === "minor") return { ...fields, effective: "should_fix", reason: "minor_impact", handoff: null };
  if (criteria && input.impact === "criterion" && (!input.criterion || !criteria.includes(input.criterion))) {
    return { ...fields, effective: "should_fix", reason: "unknown_criterion", handoff: null };
  }
  const located = locations.length && locations.every((location) => /^.+:[1-9]\d*(?::[1-9]\d*)?(?:-[1-9]\d*(?::[1-9]\d*)?)?$/.test(location));
  const safeConcern = criteria && (input.impact === "security" || input.impact === "data_loss" || input.impact === "irreversible");
  if (!located || (!(fields.scenario && fields.reproduction) && !(safeConcern && safetyPath(input.safety_path)))) {
    return { ...fields, effective: safeConcern ? "unverified" : "should_fix", reason: safeConcern ? "safety_unverified" : "missing_evidence", handoff: null };
  }
  return { ...fields, effective: severity, reason: null, handoff: null };
}

/** JSON.parse로 문법을 확인한 뒤, 객체 안의 같은 키가 다른 값을 덮지 못하게 한다. */
function hasUniqueKeys(json: string): boolean {
  const tokens = [...json.matchAll(/"(?:\\.|[^"\\])*"|[{}:]/gs)].map((match) => match[0]);
  const objects: Set<string>[] = [];
  for (const [index, token] of tokens.entries()) {
    if (token === "{") objects.push(new Set());
    else if (token === "}") objects.pop();
    else if (token.startsWith('"') && tokens[index + 1] === ":") {
      const key: string = JSON.parse(token);
      const properties = objects.at(-1)!;
      if (properties.has(key)) return false;
      properties.add(key);
    }
  }
  return true;
}

/** 묶음 답의 관측이 상태 이름만 되풀이하면 경로·이유가 아니다. 형식만 보고 경로의 타당성은 보지 않는다. */
const stateWords = new Set(["없음", "해당 없음", "해당없음", "결함", "none", "not_applicable", "not applicable", "n/a", "defect", "-"]);

function assessCriteria(stage: BudgetStage, value: unknown, expected: readonly string[], findings: readonly Finding[] = []): NonNullable<StructuredAssessment["evidence"]> {
  const bundle = stage === "post" && isBundleItems(expected);
  const states = bundle ? bundleStates : ["present", "absent", "unverified"];
  const rows = new Map<string, CriterionEvidence>();
  const issues = expected.length ? [] : ["required_criteria_unavailable"];
  if (!Array.isArray(value)) issues.push("missing_criteria");
  for (const item of Array.isArray(value) ? value : []) {
    if (!item || typeof item.id !== "string" || !expected.includes(item.id) || rows.has(item.id) ||
        !states.includes(item.state)) {
      issues.push("invalid_criterion");
      continue;
    }
    const observation = typeof item.observation === "string" && item.observation.trim() ? item.observation.trim() : null;
    const bare = bundle && observation !== null && stateWords.has(observation.replace(/[.。]+$/, "").trim().toLowerCase());
    // 경로 없는 없음, 이유 없는 해당 없음, 위치 있는 질문 안 지적이 없는 결함은 미확인이다.
    const unsupported = ((["present", "none", "not_applicable"].includes(item.state) || bundle) && (observation === null || bare)) ||
      (item.state === "defect" && !findings.some((finding) => finding.criterion === item.id && finding.reason !== "outside_question" &&
        (!bundle || finding.location !== null)));
    const state = unsupported ? "unverified" : item.state as EvidenceState;
    rows.set(item.id, { id: item.id, state, observation });
  }
  const criteria = expected.map((id) => rows.get(id) ?? { id, state: "unverified" as const, observation: null });
  return { criteria, issues: [...new Set(issues)] };
}

export function assessStructuredReview(stage: BudgetStage, text: string, criteria?: readonly string[], permissionLines?: number): StructuredAssessment {
  const reported_verdict = parseVerdict(text);
  const invalid: StructuredAssessment = { stage, verdict: "unknown", reported_verdict, differs: reported_verdict !== "unknown",
    findings: null, ...(criteria === undefined ? {} : { evidence: assessCriteria(stage, undefined, criteria) }) };
  const starts = [...text.matchAll(reviewFence)];
  if (starts.length !== 1) return invalid;
  const encoded = /^```pace-review[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*\r?$/m.exec(text)?.[1];
  if (!encoded) return invalid;
  try {
    const parsed: { version?: unknown; findings?: unknown; criteria?: unknown; permission?: unknown } = JSON.parse(encoded);
    if (!parsed || !hasUniqueKeys(encoded) || parsed.version !== (criteria === undefined ? 1 : 2) || !Array.isArray(parsed.findings) ||
        !parsed.findings.every((finding: unknown) => findingInput(finding, stageQuestion(stage, criteria).checks, criteria !== undefined))) return invalid;
    if (new Set(parsed.findings.map((finding: FindingInput) => finding.id)).size !== parsed.findings.length) return invalid;
    const findings = parsed.findings.map((item: FindingInput) => assessFinding(stage, item, criteria));
    const evidence = criteria === undefined ? undefined : assessCriteria(stage, parsed.criteria, criteria, findings);
    const requested = permissionLines === undefined ? null : parsePermission(parsed.permission);
    const permission = permissionLines !== undefined && requested && requested.protected.length &&
      requested.protected.every(({ to }) => to <= permissionLines) ? requested : undefined;
    if (evidence) {
      if (findings.some((finding) => finding.reason === "safety_unverified")) evidence.issues.push("safety_unverified");
      if (findings.some((finding) => finding.reason === "unknown_criterion")) evidence.issues.push("unknown_criterion");
      if (permissionLines !== undefined && !permission) evidence.issues.push("permission_unverified");
    }
    const gap = evidence && (evidence.issues.length > 0 || evidence.criteria.some(({ state }) => !answered(state)));
    const verdict = findings.some((finding) => finding.effective === "blocking") ? "fail" : gap ? "unknown" : "pass";
    return { stage, verdict, reported_verdict, differs: reported_verdict !== verdict, findings,
      ...(evidence ? { evidence } : {}), ...(permission ? { permission } : {}) };
  } catch {
    return invalid;
  }
}

export function hasStructuredReviewFence(text: string): boolean {
  return !text.matchAll(reviewFence).next().done;
}

export function isStructuredStage(value: unknown): value is BudgetStage {
  return value === "pre" || value === "post" || value === "backlog";
}

export function effectiveBlocking(assessment: StructuredAssessment): string[] {
  return assessment.findings?.flatMap(({ id, effective, location, scenario }) =>
    effective === "blocking" ? [`${id} [blocking] ${location} — ${scenario}`] : []) ?? [];
}

export function evidenceGaps(assessment: StructuredAssessment): string[] {
  return assessment.evidence ? [
    ...assessment.evidence.criteria.flatMap(({ id, state }) => answered(state) ? [] : [id]),
    ...assessment.evidence.issues,
  ] : [];
}

function answered(state: EvidenceState): boolean {
  return state === "present" || state === "defect" || state === "none" || state === "not_applicable";
}
