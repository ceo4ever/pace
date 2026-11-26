import { formatTeamMetrics } from "./team-metrics-document.ts";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Repo, ProjectRef } from "./harness.ts";
import { readEvents } from "./event-log.ts";
import { formatReviewLedgerMetrics } from "./review-metrics.ts";
import type { Dashboard } from "./metrics-report.ts";
import type { TokenStats, TokenUsage } from "./tokens.ts";

export function formatReviewSources(stats: Dashboard): string {
  if (!stats.team) return "";
  const rows = stats.reviews.filter((r) => r.sources).map((r) => {
    const src = r.sources!, text = (v: { blocking: number; shouldFix: number; testerFailures: number } | undefined) => v ? `${v.blocking}/${v.shouldFix}/${v.testerFailures}` : "미수집";
    return `| ${r.task} | ${text(src.taskClose)} | ${text(src.eventLog)} | ${src.eventLog.incomplete} |`;
  });
  return `리뷰 후보 수치는 출처 겹침 미확인 시 종류별 큰 관측 하한이며 전체 이력의 합계가 아니다. 현재 기간의 팀 품질과 구별한다.${rows.length ? `\n\n| 대상 | TASK-CLOSE blocking/should_fix/tester fail | 로그 관측 blocking/should_fix/tester fail | 불완전 로그 |\n|---|---|---|---|\n${rows.join("\n")}` : ""}`;
}
const seconds = (ms: number | null) => ms === null ? "기록 없음" : `${(ms / 60_000).toFixed(1)}분`;
interface Changes { files: number; added: number; deleted: number; }
export function commitChanges(repo: Repo, id: string, task?: string): Changes {
  const result = spawnSync("git", ["-C", repo.root, "log", "--format=", "--numstat", "--fixed-strings", `--grep=(${id}${task ? `/${task})` : ""}`], { encoding: "utf8", timeout: 3000, env: { ...process.env, GIT_NO_LAZY_FETCH: "1" } });
  const changes = { files: 0, added: 0, deleted: 0 };
  if (result.status === 0) for (const line of result.stdout.split("\n")) {
    const match = /^(\d+|-)\t(\d+|-)\t/.exec(line); if (!match) continue;
    changes.files++; changes.added += Number(match[1]) || 0; changes.deleted += Number(match[2]) || 0;
  }
  return changes;
}
function changeText(c: Changes): string { return `${c.files}회 / +${c.added} −${c.deleted}`; }
function rounds(repo: Repo, ref: ProjectRef, task?: string): number {
  const dir = join(repo.root, "projects", ref.dir);
  const reviews = readEvents(dir).filter(e => e.type === "review" && e.p === ref.id && (!task || e.t === task) && e.data?.reviewer === 1);
  if (task && reviews.length) return reviews.length;
  const tasks = join(dir, "tasks"); if (!existsSync(tasks) || lstatSync(tasks).isSymbolicLink()) return reviews.length;
  let count = reviews.length;
  for (const folder of readdirSync(tasks)) {
    const id = /^(T\d{2})_/.exec(folder)?.[1]; if (!id || (task && id !== task)) continue;
    const logged = reviews.filter(e => e.t === id); if (logged.length) continue;
    const path = join(tasks, folder, "TASK-CLOSE.md");
    try {
      if (!lstatSync(join(tasks, folder)).isDirectory() || !lstatSync(path).isFile()) continue;
      const text = readFileSync(path, "utf8").split(/^## 리뷰\s*$/m)[1]?.split(/^## /m)[0] ?? "";
      count += (text.match(/\d+차\s*:/g) ?? []).length;
    } catch { /* Historical task without a close document. */ }
  }
  return count;
}
const recorded = (tokens: TokenStats[]) => tokens.filter(t => t.status === "recorded");
function outputs(tokens: TokenStats[], total?: TokenStats[]): string {
  return recorded(tokens).map(t => {
    const denominator = total?.find(p => p.tool === t.tool)?.usage.output;
    return `${t.tool} ${t.usage.output}${denominator ? ` (${(100 * t.usage.output / denominator).toFixed(1)}%)` : ""}`;
  }).join(" · ") || "기록 없음";
}
export function formatMetricsDocument(repo: Repo, ref: ProjectRef, stats: Dashboard): string {
  return formatExistingMetricsDocument(repo, ref, stats) + "\n" + formatReviewLedgerMetrics(stats.reviewLedger) + "\n";
}

function formatExistingMetricsDocument(repo: Repo, ref: ProjectRef, stats: Dashboard): string {
  const totalReview = (key: "blocking" | "shouldFix" | "testerFailures") => stats.reviews.reduce((sum, item) => sum + item[key], 0);
  const changes = commitChanges(repo, ref.id);
  const taskChanges = stats.tasks.map(t => commitChanges(repo, ref.id, t.id));
  const outsideChanges = { ...changes };
  for (const item of taskChanges) for (const key of ["files", "added", "deleted"] as const) outsideChanges[key] -= item[key];
  const tokenRows = (role: string, tokens: TokenStats[]) => recorded(tokens).map(t => `| ${role} | ${t.tool} | ${t.usage.input} | ${t.usage.cachedInput} | ${t.usage.cacheCreationInput} | ${t.usage.output} | ${t.usage.reasoningOutput} | ${t.usage.tool} |`);
  const outside = stats.tokens.map(t => ({ ...t, usage: { ...t.usage } }));
  for (const t of outside) for (const task of stats.taskTokens) {
    const usage = task.tokens.find(s => s.tool === t.tool)?.usage;
    if (usage) for (const key of Object.keys(usage) as (keyof TokenUsage)[]) t.usage[key] -= usage[key];
  }
  const sumTime = stats.tasks.reduce((sum,t) => sum + (t.workMs ?? 0), 0);
  const sum = (key: "changes" | "reviews" | "questions") => stats.tasks.reduce((n,t) => n+t.eventCounts[key], 0);
  const taskRows = stats.tasks.map((t, index) => {
    const review = stats.reviews.find(r => r.task === t.id);
    return `| ${t.id} | ${seconds(t.workMs)} | ${outputs(stats.taskTokens.find(s => s.id === t.id)?.tokens ?? [], stats.tokens)} | ${rounds(repo, ref, t.id)} | ${review?.blocking ?? 0} | ${review?.testerFailures ?? 0} | ${t.gateFailures} | ${t.eventCounts.changes} | ${changeText(taskChanges[index]!)} |`;
  });
  const outsideReview = stats.reviews.filter(r => !stats.tasks.some(t => t.id === r.task));
  taskRows.push(`| 태스크 밖 | ${seconds(stats.project.workMs === null ? null : stats.project.workMs - sumTime)} | ${outputs(outside, stats.tokens)} | ${rounds(repo, ref) - stats.tasks.reduce((n,t) => n+rounds(repo,ref,t.id),0)} | ${outsideReview.reduce((n,r)=>n+r.blocking,0)} | ${outsideReview.reduce((n,r)=>n+r.testerFailures,0)} | ${stats.project.gateFailures-stats.tasks.reduce((n,t)=>n+t.gateFailures,0)} | ${stats.eventCounts.changes-sum("changes")} | ${changeText(outsideChanges)} |`);
  const candidates = stats.improvements.map(i => `- ${i.kind}: ${i.code} ${i.count}회${i.tasks.length ? ` (${i.tasks.join(", ")})` : ""}`);
  for (const task of stats.improvements.filter(i => i.kind === "handoff").flatMap(i => i.tasks)) {
    const tasks = join(repo.root,"projects",ref.dir,"tasks");
    const folder = /^T\d{2}$/.test(task) && existsSync(tasks) ? readdirSync(tasks).find(f=>f.startsWith(`${task}_`)) : undefined;
    if (folder) candidates.push(`- ${task} 남긴 것: [검토](tasks/${folder}/TASK-CLOSE.md)`);
  }
  return `# ${ref.id} 지표\n\n<!-- pace 자동 생성: 직접 편집하지 않음 -->\n\n## 프로젝트 기준 집계\n\n| 항목 | 값 |\n|---|---|\n| 작업 시간 | ${seconds(stats.project.workMs)} |\n| 러닝 시간 | ${seconds(stats.project.durationMs)} |\n| 전체 경과 | ${seconds(stats.project.toMergeMs ?? (stats.project.durationMs === null ? null : stats.project.durationMs + stats.project.mergeWaitMs))} |\n| 질의 대기 | ${seconds(stats.project.questionWaitMs)} |\n| 병합 승인 대기 | ${seconds(stats.project.mergeWaitMs)} |\n| 태스크 수 | ${stats.tasks.length} |\n| 태스크 구간 평균 작업 시간 | ${seconds(stats.tasks.length ? sumTime/stats.tasks.length : null)} |\n| 리뷰 회차 | ${rounds(repo, ref)} |\n| blocking | ${totalReview("blocking")} |\n| should_fix | ${totalReview("shouldFix")} |\n| tester fail | ${totalReview("testerFailures")} |\n| 게이트 실패 | ${stats.project.gateFailures} |\n| 질문 / 답변 | ${stats.eventCounts.questions} / ${stats.eventCounts.answers} |\n| 결정 / 변경 / 리뷰 사건 | ${stats.eventCounts.decisions} / ${stats.eventCounts.changes} / ${stats.eventCounts.reviews} |\n| 파일 변경 횟수 / 추가·삭제 행 | ${changeText(changes)} |\n\n| 역할 | 도구 | 입력 | 캐시 읽기 | 캐시 생성 | 출력 | 추론 | 도구 |\n|---|---|---|---|---|---|---|---|\n${[...tokenRows("작업자",stats.tokens),...tokenRows("코디네이터",stats.coordinatorTokens)].join("\n")}\n\n## 태스크 기준 집계\n\n| 대상 | 작업 시간 | 출력 토큰 (도구별 프로젝트 비중) | 리뷰 회차 | blocking | tester fail | 게이트 실패 | 변경 사건 | 파일 변경 횟수 / 추가·삭제 행 |\n|---|---|---|---|---|---|---|---|---|\n${taskRows.join("\n")}\n\n| 대상 | 도구 | 입력 | 캐시 읽기 | 캐시 생성 | 출력 | 추론 | 도구 |\n|---|---|---|---|---|---|---|---|\n${[...stats.taskTokens.flatMap(t=>tokenRows(t.id,t.tokens)),...tokenRows("태스크 밖",outside)].join("\n")}\n\n## 집계 기준과 한계\n\n태스크 구간 평균은 태스크 작업 시간 합÷태스크 수이고, 비교표의 태스크당 작업 시간은 프로젝트 작업 시간÷태스크 수입니다. 작업 시간은 러닝 시간에서 기록된 질의 대기를 뺀 달력 시간입니다. 사건 우선, 과거 기록은 git author 시각 근사입니다. 작업자는 PROJECT의 worktree 경로로 start→finish, 코디네이터는 main 경로로 start→merge(미병합은 조회 시각) 구간을 읽습니다. 코디네이터에는 같은 시간 다른 대화가 섞일 수 있습니다. 기록 삭제·형식 변경에 따른 누락이 가능합니다.\n\n캐시·추론 필드는 도구마다 의미가 달라 더하지 않습니다. Codex는 rollout별 마지막 누적값−구간 전 baseline, Claude/Gemini는 메시지 사용량입니다. 태스크 밖은 프로젝트 합계−태스크 합입니다. 경계 샘플 중복·누적값 감소가 있으면 토큰 차이가 음수일 수 있습니다. 파일 변경은 태그 커밋의 numstat이며 바이너리는 파일 횟수만 셉니다. 생성 중 미커밋 변경·마감/병합 커밋 자신은 다음 재생성 전까지 포함되지 않습니다.\n\n## 개선 후보\n\n${candidates.join("\n") || "없음"}\n${stats.team ? `\n${formatReviewSources(stats)}\n\n${formatTeamMetrics(stats.team)}\n` : ""}`;
}
