import type { BudgetStage } from "./review-budget.ts";
import { parseVerdict, type Verdict } from "./review-log.ts";

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

const outside = ["implementation", "design", "other"];
const reviewFence = /^```pace-review[ \t]*\r?$/gm;
const grades = ["blocking", "should_fix", "note"] as const;
type Grade = typeof grades[number];
type Confidence = "high" | "medium" | "low";

type FindingInput = {
  id: string;
  severity: Grade;
  category: string;
  location: string | null;
  scenario: string | null;
  reproduction: string | null;
  confidence: Confidence;
};
type Finding = FindingInput & {
  effective: Grade;
  reason: "outside_question" | "missing_evidence" | null;
  handoff: "implementation_review" | "project_design" | null;
};

export interface StructuredAssessment {
  stage: BudgetStage;
  verdict: Verdict;
  reported_verdict: Verdict;
  differs: boolean;
  findings: Finding[] | null;
}

export function reviewQuestionPrompt(stage: BudgetStage): string[] {
  const { question, checks } = questions[stage];
  const allChecks = [...Object.entries(checks)].map(([key, check]) => `- ${key}: ${check}`);
  return [
    question, ...allChecks,
    "지적은 다음 형식의 pace-review 코드 블록 하나로 보존한다. JSON 형식과 version을 지켜야 판정할 수 있다.",
    "category는 위 하위 확인 ID 하나 또는 질문 밖의 implementation(구현 방식), design(설계 방식), other(그 밖)다.",
    "severity는 blocking, should_fix, note 중 하나, confidence는 high, medium, low 중 하나다. 각각 고유한 F 번호를 붙인다.",
    "location에는 파일:줄을, scenario에는 실패 조건을, reproduction에는 재현 수단을 쓴다. 확보하지 못한 값은 null로 표시한다.",
    "지적이 없으면 findings를 빈 배열로 낸다. 도구는 질문에 맞고 위치·실패 조건·재현 수단을 갖춘 blocking에서 판정을 계산한다.",
    "",
    "```pace-review",
    `{"version":1,"findings":[{"id":"F1","severity":"blocking","category":"${Object.keys(checks)[0]}","location":"파일:줄","scenario":"실패 조건","reproduction":"재현 수단","confidence":"high"}]}`,
    "```",
    "",
    "코드 블록 뒤 마지막 줄에 검토자가 보고한 pass 또는 fail 한 단어를 쓴다.",
  ];
}

function findingInput(value: unknown, stage: BudgetStage): value is FindingInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && /^F\d+$/.test(row.id) && grades.some((grade) => grade === row.severity) &&
    typeof row.category === "string" && (Object.hasOwn(questions[stage].checks, row.category) || outside.includes(row.category)) &&
    typeof row.confidence === "string" && ["high", "medium", "low"].includes(row.confidence) &&
    [row.location, row.scenario, row.reproduction].every((item) => item === null || item === undefined || typeof item === "string");
}

function assessFinding(stage: BudgetStage, input: FindingInput): Finding {
  const { id, severity, category, confidence } = input;
  const fields = {
    id, severity, category, confidence,
    location: input.location?.trim() || null,
    scenario: input.scenario?.trim() || null,
    reproduction: input.reproduction?.trim() || null,
  };
  if (outside.includes(category)) {
    const handoff = stage === "pre" && category === "implementation" ? "implementation_review" :
      stage === "backlog" && (category === "design" || category === "implementation") ? "project_design" : null;
    return { ...fields, effective: "note", reason: "outside_question", handoff };
  }
  const locations = fields.location?.split(/,[ \t]+/) ?? [];
  if (severity === "blocking" &&
      (!locations.length || locations.some((location) => !/^.+:[1-9]\d*(?::[1-9]\d*)?(?:-[1-9]\d*(?::[1-9]\d*)?)?$/.test(location)) ||
        !fields.scenario || !fields.reproduction)) {
    return { ...fields, effective: "should_fix", reason: "missing_evidence", handoff: null };
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

export function assessStructuredReview(stage: BudgetStage, text: string): StructuredAssessment {
  const reported_verdict = parseVerdict(text);
  const invalid: StructuredAssessment = { stage, verdict: "unknown", reported_verdict, differs: reported_verdict !== "unknown", findings: null };
  const starts = [...text.matchAll(reviewFence)];
  if (starts.length !== 1) return invalid;
  const encoded = /^```pace-review[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*\r?$/m.exec(text)?.[1];
  if (!encoded) return invalid;
  try {
    const parsed: { version?: unknown; findings?: unknown } = JSON.parse(encoded);
    if (!parsed || !hasUniqueKeys(encoded) || parsed.version !== 1 || !Array.isArray(parsed.findings) ||
        !parsed.findings.every((finding: unknown) => findingInput(finding, stage))) return invalid;
    if (new Set(parsed.findings.map((finding: FindingInput) => finding.id)).size !== parsed.findings.length) return invalid;
    const findings = parsed.findings.map((item: FindingInput) => assessFinding(stage, item));
    const verdict = findings.some((finding) => finding.effective === "blocking") ? "fail" : "pass";
    return { stage, verdict, reported_verdict, differs: reported_verdict !== verdict, findings };
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
