// 변경 전(HEAD 사본)과 현재 소스에서 같은 시나리오를 계산해 비교 기준값을 낸다.
// 사용: node baseline.ts <src 루트> <저장소 루트>
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [srcRoot, repo] = process.argv.slice(2) as [string, string];
const load = (rel: string) => import(pathToFileURL(join(srcRoot, rel)).href);
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const { buildVerifyPrompt } = await load("src/agent/verify.ts");
const { assessStructuredReview } = await load("src/agent/structured-review.ts");
const { readReviewBudget, reviewBudgetScope } = await load("src/agent/review-budget.ts");
const { collectReviewLedgerMetrics, formatReviewLedgerMetrics } = await load("src/project/review-metrics.ts");

const criteria = [{ id: "T-1", text: "빈 입력의 결과를 보존한다" }, { id: "T-2", text: "목록에서 다시 열 수 있다" }];
const backlogCriteria = [{ id: "B-1", text: "상위 목적과 owner 합의에서 목표가 확인된다" }];
const v2task = "- TASK 형식: v2\n## 증명 범위\n- 판정 주체: 자동 테스트\n- 구현 후 reviewer: 생략 — 문구만\n## 기준\n| T-1 | 결과 |\n";
const rereview = { previousText: "F1 [blocking] a.ts:1 — 재현\nfail", diff: "- 이전\n+ 지금" };
const prompts: Record<string, string> = {
  backlog: buildVerifyPrompt("상위 목적", "BACKLOG.md", "# BL261126_01 합성\n## 목표\n목표\n", "goal", undefined, "backlog", undefined, backlogCriteria),
  backlogRereview: buildVerifyPrompt("상위 목적", "BACKLOG.md", "# BL261126_01 합성\n", "goal", rereview, "backlog", undefined, backlogCriteria),
  pre: buildVerifyPrompt("상위 목적", "TASK.md", v2task, "task", undefined, "pre", undefined, criteria, true),
  preRereview: buildVerifyPrompt("상위 목적", "TASK.md", v2task, "task", rereview, "pre", undefined, criteria, true),
  preFocus: buildVerifyPrompt("상위 목적", "TASK.md", v2task, "task", rereview, "pre", "수정 확인의 지적은 F1이다. 지정한 지적과 적용한 수정의 영향만 판정한다.", criteria, true),
  general: buildVerifyPrompt("상위 목적", "notes.md", "일반 산출물\n", "goal"),
  generalRereview: buildVerifyPrompt("상위 목적", "notes.md", "일반 산출물\n", "goal", rereview),
  generalTask: buildVerifyPrompt("상위 목적", "plan.md", "계획\n", "task"),
};
const out: Record<string, unknown> = { prompts: Object.fromEntries(Object.entries(prompts).map(([k, v]) => [k, sha(v)])) };

const t01 = readdirSync(join(repo, "projects")).find((name) => name.startsWith("P017_"))!;
const t01Dir = join(repo, "projects", t01, "tasks", readdirSync(join(repo, "projects", t01, "tasks")).find((n) => n.startsWith("T01_"))!);
const records: Record<string, unknown> = {};
for (const n of [1, 2, 3, 4, 5]) {
  const record = JSON.parse(readFileSync(join(t01Dir, "evidence/review-records", `R${n}.json`), "utf8"));
  const assessment = assessStructuredReview(record.review.structured_stage, record.result.text, record.review.required_criteria);
  records[`R${n}`] = { verdict: assessment.verdict, same: JSON.stringify(assessment) === JSON.stringify(record.assessment), sha: sha(JSON.stringify(assessment)) };
}
out.records = records;
const scope = reviewBudgetScope(join(t01Dir, "evidence/post-review-diff.md"));
const budget = readReviewBudget(scope);
out.budget = budget.status;
const { cpSync, mkdtempSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
const copy = mkdtempSync(join(tmpdir(), "s6-"));
cpSync(t01Dir, join(copy, "projects/P900_copy/tasks/T01_copy"), { recursive: true });
cpSync(join(repo, "projects", t01, "PROJECT.md"), join(copy, "projects/P900_copy/PROJECT.md"));
out.stats = formatReviewLedgerMetrics(collectReviewLedgerMetrics(copy, "P900_copy"));
out.admission = sha(readFileSync(join(srcRoot, "src/agent/review-admission.ts"), "utf8"));
console.log(JSON.stringify(out, null, 1));
