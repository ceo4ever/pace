import { assertComparisonDestination, refreshMetricsIndex } from "./metrics-index.ts";
import { inputHash, InputSnapshot, InputSnapshotError, type InputTrace } from "../core/input-snapshot.ts";
import { formatMetricsDocument, formatReviewSources } from "./metrics-document.ts";
import { completeReviewEvent, readEvents } from "./event-log.ts";
import { collectTeamMetrics, type TeamMetrics } from "./team-metrics.ts";
import { formatTeamMetrics } from "./team-metrics-document.ts";
import { collectHandoffs, type HandoffReport } from "./handoff-report.ts";
import { constants, openSync, closeSync, fstatSync, existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "../core/fsutil.ts";
import type { ProjectRef, Repo } from "./harness.ts";
import { gateFailureReasons, metricDir, readMetrics } from "./metrics.ts";
import { collectProjectStats, formatProjectStats } from "./tokens.ts";
import { collectReviewLedgerMetrics, formatReviewLedgerMetrics, type ReviewLedgerMetrics } from "./review-metrics.ts";
import type { FullStats, TokenOptions } from "./tokens.ts";

export interface ReviewCounts { task: string; blocking: number; shouldFix: number; testerFailures: number;
  sources?: { taskClose?: { blocking: number; shouldFix: number; testerFailures: number }; eventLog: { blocking: number; shouldFix: number; testerFailures: number; incomplete: number }; relation: "overlap-unconfirmed-lower-bound" };
}
export interface Improvement { kind: "gate" | "review" | "handoff"; code: string; count: number; tasks: string[]; }
export const reviewFindingMetrics = [["blocking", "blocking"], ["should_fix", "shouldFix"], ["tester fail", "testerFailures"]] as const;
export interface Dashboard extends FullStats { reviews: ReviewCounts[]; improvements: Improvement[]; reviewLedger: ReviewLedgerMetrics; handoffs?: HandoffReport; team?: TeamMetrics; }
function section(text: string, heading: string): string {
  const match = new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, "m").exec(text);
  return (match?.[1] ?? "").replace(/<!--[\s\S]*?-->/g, "").trim();
}
export function collectInsights(repo: Repo, ref: ProjectRef, inputs?: InputTrace, strictTeam = false): { reviews: ReviewCounts[]; improvements: Improvement[] } {
  const dir = metricDir(repo, ref); const tasksDir = join(dir, "tasks");
  const reviews: ReviewCounts[] = []; const improvements: Improvement[] = [];
  const closeFiles: string[] = [];
  if (existsSync(tasksDir) && !lstatSync(tasksDir).isSymbolicLink()) for (const folder of readdirSync(tasksDir).sort()) {
    const id = /^(T\d{2})_/.exec(folder)?.[1]; if (!id) continue;
    try {
      const taskDir = join(tasksDir, folder); const close = join(taskDir, "TASK-CLOSE.md");
      if (lstatSync(taskDir).isSymbolicLink() || !lstatSync(close).isFile()) continue;
      const bytes = readFileSync(close), text = bytes.toString("utf8"); const review = section(text, "리뷰");
      closeFiles.push(`${folder}/TASK-CLOSE.md`);
      inputs?.record(close, inputHash(bytes));
      const sum = (grade: string) => [...review.matchAll(new RegExp(`\\b${grade}[\\s:：]*(\\d+)`, "g"))].reduce((n, m) => n + Number(m[1]), 0);
      reviews.push({ task: id, blocking: sum("blocking"), shouldFix: sum("should_fix"), testerFailures: [...review.matchAll(/\btester[\s:：]+fail\b/g)].length });
      const handoff = section(text, "남긴 것");
      if (handoff && !/^(?:없음|해당 없음)[.。]?$/.test(handoff)) improvements.push({ kind: "handoff", code: "남긴 것 검토", count: 1, tasks: [id] });
    } catch (error) { if (error instanceof InputSnapshotError) throw error; /* Missing or invalid task close is checked by the harness. */ }
  }
  inputs?.listing?.(tasksDir, closeFiles, "task-close-inputs", "regular-files", (name) => /^T\d{2}_[^/]+\/TASK-CLOSE\.md$/.test(name));
  const logReviews = readEvents(dir, inputs).filter((e) => e.p === ref.id && e.type === "review");
  const ids = [...new Set(logReviews.map((e) => e.t ?? ref.id))];
  for (const id of ids) {
    const entries = logReviews.filter((e) => (e.t ?? ref.id) === id);
    const valid = strictTeam ? entries.filter(completeReviewEvent) : entries;
    const item: ReviewCounts = { task: id, blocking: valid.reduce((n,e) => n + (e.data?.blocking ?? 0), 0), shouldFix: valid.reduce((n,e) => n + (e.data?.should_fix ?? 0), 0), testerFailures: valid.filter((e) => e.data?.tester === 1 && e.data?.fail === 1).length };
    const previous = reviews.findIndex((r) => r.task === id);
    if (strictTeam) {
      const incomplete = entries.length - valid.length;
      if (incomplete) improvements.push({ kind: "handoff", code: "리뷰 기록 수치 미확인", count: incomplete, tasks: /^T\d{2}$/.test(id) ? [id] : [] });
      const old = previous < 0 ? undefined : reviews[previous];
      const counts = (r: ReviewCounts) => ({ blocking: r.blocking, shouldFix: r.shouldFix, testerFailures: r.testerFailures });
      item.sources = { ...(old ? { taskClose: counts(old) } : {}), eventLog: { ...counts(item), incomplete }, relation: "overlap-unconfirmed-lower-bound" };
      if (old) {
        // A complete row is not proof of complete history. Preserve both sources without adding possible duplicates.
        for (const key of ["blocking", "shouldFix", "testerFailures"] as const) item[key] = Math.max(old[key], item[key]);
        improvements.push({ kind: "handoff", code: "리뷰 출처 겹침 미확인", count: 1, tasks: [id] });
      }
    }
    if (previous === -1) reviews.push(item); else reviews[previous] = item;
  }
  const failures = new Map<string, number>();
  for (const event of readMetrics(dir, inputs)) {
    if (event.project !== ref.id || event.ok || !["check", "done", "finish"].includes(event.cmd)) continue;
    const code = gateFailureReasons.includes(event.reason ?? "") ? event.reason! : "command";
    failures.set(code, (failures.get(code) ?? 0) + 1);
  }
  for (const [code, count] of [...failures].sort()) if (count >= 2) improvements.push({ kind: "gate", code, count, tasks: [] });
  for (const [grade, key] of reviewFindingMetrics) {
    const count = reviews.reduce((n, r) => n + r[key], 0);
    if (count >= 2) improvements.push({ kind: "review", code: grade, count, tasks: reviews.filter((r) => r[key] > 0).map((r) => r.task) });
  }
  return { reviews, improvements };
}
export function collectDashboard(repo: Repo, ref: ProjectRef, options: TokenOptions = {}, inputs?: InputTrace): Dashboard {
  const trace = inputs ?? options.inputTrace ?? new InputSnapshot();
  const base = collectProjectStats(repo, ref, { ...options, inputTrace: trace }), collection = collectTeamMetrics(repo, ref, base, options, trace), team = collection?.metrics;
  const handoffs = collection?.adopted ? collection.handoffs : collectHandoffs(repo.root, ref.id, `projects/${ref.dir}`, { inputs: trace });
  const insights = collectInsights(repo, ref, trace, collection?.adopted);
  const reviewLedger = collectReviewLedgerMetrics(repo.root, ref.dir, trace);
  if (trace instanceof InputSnapshot) void trace.files;
  return { ...base, ...insights, reviewLedger, ...(handoffs ? { handoffs } : {}), ...(team ? { team } : {}) };
}
export function formatDashboard(stats: Dashboard): string {
  return formatExistingDashboard(stats) + "\n\n" + formatReviewLedgerMetrics(stats.reviewLedger);
}

function formatExistingDashboard(stats: Dashboard): string {
  const total = (key: "blocking" | "shouldFix" | "testerFailures") => stats.reviews.reduce((n, r) => n + r[key], 0);
  const candidates = stats.improvements.map((i) => `- ${i.kind}: ${i.code} ${i.count}회${i.tasks.length ? ` (${i.tasks.join(", ")} TASK-CLOSE)` : ""}`);
  const base = `${formatProjectStats(stats)}\n\n사건 수: 결정 ${stats.eventCounts.decisions} · 변경 ${stats.eventCounts.changes} · 리뷰 ${stats.eventCounts.reviews} · 질문 ${stats.eventCounts.questions} · 답변 ${stats.eventCounts.answers}\n\n리뷰 지적: blocking ${total("blocking")} · should_fix ${total("shouldFix")} · tester fail ${total("testerFailures")}\n\n개선 후보(사람이 선택):\n${candidates.length ? candidates.join("\n") : "없음"}`;
  const team = stats.team ? `\n\n${formatReviewSources(stats)}\n\n${formatTeamMetrics(stats.team)}` : "";
  if (!stats.handoffs) return base + team;
  const h = stats.handoffs, q = h.requests;
  return `${base}\n\n소통: ${h.records}건 · ${h.crossBoundaryRequests ? "구간 말 " : ""}열린 위임 ${h.open.length}건 · ${h.auditCoverage} (본문 누락 ${h.missingBodies})\n종류: ${Object.entries(h.kinds).map(([kind, count]) => `${kind} ${count}`).join(" · ")}\n에이전트: ${Object.entries(h.agents).map(([name, counts]) => `${name} ${JSON.stringify(counts)}`).join(" · ") || "없음"}\n요청 ${q.total}: 사용자 답(신고·출처 대조 필요) ${q.owner_reply} · 사람 경로 성공(신고) ${q.owner_delivery} · 실패만 ${q.failed_only} · 미확인 ${q.unconfirmed} · ${h.crossBoundaryRequests ? "식별자 없는 질문·답 사건" : "식별자 없는 옛 질문 사건"} ${q.unlinkedLogEvents}${h.crossBoundaryRequests ? `\n집계 경계: 소통 요약은 아래 팀 측정의 최초 요청 코호트를 표시한다. 구간 경계 미확인 활동 ${h.crossBoundaryRequests.length}건 · 요청 기록의 귀속 미확인 ${h.attributionUnconfirmedRequests?.length ?? 0}건. 도달 관측과 확인된 비교 총량은 별개다.` : stats.team ? "\n집계 경계: 위 기존 소통값에는 상태 전송도 포함될 수 있다. 비교에는 아래 팀 측정의 요청 연결·기간·미확인 값을 사용하며 두 값을 합산하지 않는다." : ""}${team}`;
}
export function replaceMetricsSection(close: string, body: string): string {
  const generated = `## 지표\n\n<!-- pace project finish 자동 생성 -->\n\n${body.trim()}\n\n`;
  const pattern = /^## 지표[^\S\n]*(?:\n|$)[\s\S]*?(?=^## |$(?![\s\S]))/gm;
  let replaced = false;
  const text = close.replace(pattern, () => { if (replaced) return ""; replaced = true; return generated; });
  return replaced ? text : `${close.trimEnd()}\n\n${generated}`;
}
/** A generated document must never import a linked external document into git. */
export function assertMetricsDestination(repo: Repo, ref: ProjectRef): void {
  try {
    if (!lstatSync(join(repo.root, "projects")).isDirectory() || !lstatSync(metricDir(repo, ref)).isDirectory() || !lstatSync(join(metricDir(repo, ref), "PROJECT-CLOSE.md")).isFile()) throw new Error();
  } catch { throw new Error("지표 생성 대상은 프로젝트 안의 일반 파일이어야 한다"); }
  assertComparisonDestination(repo);
  try { if (!lstatSync(join(metricDir(repo, ref), "METRICS.md")).isFile()) throw new Error("일반 파일"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("지표 생성 대상은 일반 파일이어야 한다"); }
}
function readClose(repo: Repo, ref: ProjectRef): string {
  assertMetricsDestination(repo, ref);
  const fd = openSync(join(metricDir(repo, ref), "PROJECT-CLOSE.md"), constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0));
  try {
    if (!fstatSync(fd).isFile()) throw new Error("지표 생성 대상은 일반 파일이어야 한다");
    return readFileSync(fd, "utf8");
  } finally { closeSync(fd); }
}
export function metricsSummaryIssues(close: string): string[] {
  const body = section(close, "지표");
  const link = /\[[^\]]+\]\(METRICS\.md\)/;
  const lines = body.replace(link, "").split("\n").map(s=>s.trim()).filter(Boolean);
  const issues: string[] = [];
  if (!link.test(body)) issues.push("PROJECT-CLOSE: 지표 METRICS.md 링크가 없다");
  if (lines.length === 0 || lines.length > 3 || lines.some(s => s.startsWith("|") || s.startsWith("##"))) issues.push("PROJECT-CLOSE: 지표 해석은 1~3줄이어야 한다");
  return issues;
}
export function refreshProjectMetrics(repo: Repo, ref: ProjectRef, options: TokenOptions = {}, inputs?: InputTrace): Dashboard {
  readClose(repo, ref); // Validate the legacy input even though it is never copied.
  const path = join(metricDir(repo, ref), "METRICS.md");
  try { if (!lstatSync(path).isFile()) throw new Error("일반 파일"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("지표 생성 대상은 일반 파일이어야 한다"); }
  const stats = collectDashboard(repo, ref, options, inputs);
  writeFileAtomic(path, formatMetricsDocument(repo, ref, stats));
  refreshMetricsIndex(repo);
  return stats;
}
