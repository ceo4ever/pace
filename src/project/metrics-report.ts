import { assertComparisonDestination, refreshMetricsIndex } from "./metrics-index.ts";
import { formatMetricsDocument } from "./metrics-document.ts";
import { readEvents } from "./event-log.ts";
import { constants, openSync, closeSync, fstatSync, existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "../core/fsutil.ts";
import type { ProjectRef, Repo } from "./harness.ts";
import { metricDir, readMetrics } from "./metrics.ts";
import { collectProjectStats, formatProjectStats } from "./tokens.ts";
import type { FullStats, TokenOptions } from "./tokens.ts";

export interface ReviewCounts { task: string; blocking: number; shouldFix: number; testerFailures: number; }
export interface Improvement { kind: "gate" | "review" | "handoff"; code: string; count: number; tasks: string[]; }
export interface Dashboard extends FullStats { reviews: ReviewCounts[]; improvements: Improvement[]; }
function section(text: string, heading: string): string {
  const match = new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, "m").exec(text);
  return (match?.[1] ?? "").replace(/<!--[\s\S]*?-->/g, "").trim();
}
export function collectInsights(repo: Repo, ref: ProjectRef): { reviews: ReviewCounts[]; improvements: Improvement[] } {
  const dir = metricDir(repo, ref); const tasksDir = join(dir, "tasks");
  const reviews: ReviewCounts[] = []; const improvements: Improvement[] = [];
  if (existsSync(tasksDir) && !lstatSync(tasksDir).isSymbolicLink()) for (const folder of readdirSync(tasksDir).sort()) {
    const id = /^(T\d{2})_/.exec(folder)?.[1]; if (!id) continue;
    try {
      const taskDir = join(tasksDir, folder); const close = join(taskDir, "TASK-CLOSE.md");
      if (lstatSync(taskDir).isSymbolicLink() || !lstatSync(close).isFile()) continue;
      const text = readFileSync(close, "utf8"); const review = section(text, "리뷰");
      const sum = (grade: string) => [...review.matchAll(new RegExp(`\\b${grade}[\\s:：]*(\\d+)`, "g"))].reduce((n, m) => n + Number(m[1]), 0);
      reviews.push({ task: id, blocking: sum("blocking"), shouldFix: sum("should_fix"), testerFailures: [...review.matchAll(/\btester[\s:：]+fail\b/g)].length });
      const handoff = section(text, "남긴 것");
      if (handoff && !/^(?:없음|해당 없음)[.。]?$/.test(handoff)) improvements.push({ kind: "handoff", code: "남긴 것 검토", count: 1, tasks: [id] });
    } catch { /* Missing or invalid task close is checked by the harness. */ }
  }
  const logReviews = readEvents(dir).filter((e) => e.p === ref.id && e.type === "review");
  const ids = [...new Set(logReviews.map((e) => e.t ?? ref.id))];
  for (const id of ids) {
    const entries = logReviews.filter((e) => (e.t ?? ref.id) === id);
    const item: ReviewCounts = { task: id, blocking: entries.reduce((n,e) => n + (e.data?.blocking ?? 0), 0), shouldFix: entries.reduce((n,e) => n + (e.data?.should_fix ?? 0), 0), testerFailures: entries.filter((e) => e.data?.tester === 1 && e.data?.fail === 1).length };
    const previous = reviews.findIndex((r) => r.task === id);
    if (previous === -1) reviews.push(item); else reviews[previous] = item;
  }
  const failures = new Map<string, number>();
  for (const event of readMetrics(dir)) {
    if (event.project !== ref.id || event.ok || !["check", "done", "finish"].includes(event.cmd)) continue;
    const code = ["security", "rebase", "checks", "contract", "state", "command"].includes(event.reason ?? "") ? event.reason! : "command";
    failures.set(code, (failures.get(code) ?? 0) + 1);
  }
  for (const [code, count] of [...failures].sort()) if (count >= 2) improvements.push({ kind: "gate", code, count, tasks: [] });
  for (const [grade, key] of [["blocking", "blocking"], ["should_fix", "shouldFix"], ["tester fail", "testerFailures"]] as const) {
    const count = reviews.reduce((n, r) => n + r[key], 0);
    if (count >= 2) improvements.push({ kind: "review", code: grade, count, tasks: reviews.filter((r) => r[key] > 0).map((r) => r.task) });
  }
  return { reviews, improvements };
}
export function collectDashboard(repo: Repo, ref: ProjectRef, options: TokenOptions = {}): Dashboard {
  return { ...collectProjectStats(repo, ref, options), ...collectInsights(repo, ref) };
}
export function formatDashboard(stats: Dashboard): string {
  const total = (key: "blocking" | "shouldFix" | "testerFailures") => stats.reviews.reduce((n, r) => n + r[key], 0);
  const candidates = stats.improvements.map((i) => `- ${i.kind}: ${i.code} ${i.count}회${i.tasks.length ? ` (${i.tasks.join(", ")} TASK-CLOSE)` : ""}`);
  return `${formatProjectStats(stats)}\n\n사건 수: 결정 ${stats.eventCounts.decisions} · 변경 ${stats.eventCounts.changes} · 리뷰 ${stats.eventCounts.reviews} · 질문 ${stats.eventCounts.questions} · 답변 ${stats.eventCounts.answers}\n\n리뷰 지적: blocking ${total("blocking")} · should_fix ${total("shouldFix")} · tester fail ${total("testerFailures")}\n\n개선 후보(사람이 선택):\n${candidates.length ? candidates.join("\n") : "없음"}`;
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
export function refreshProjectMetrics(repo: Repo, ref: ProjectRef, options: TokenOptions = {}): void {
  readClose(repo, ref); // Validate the legacy input even though it is never copied.
  const path = join(metricDir(repo, ref), "METRICS.md");
  try { if (!lstatSync(path).isFile()) throw new Error("일반 파일"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("지표 생성 대상은 일반 파일이어야 한다"); }
  const stats = collectDashboard(repo, ref, options);
  writeFileAtomic(path, formatMetricsDocument(repo, ref, stats));
  refreshMetricsIndex(repo);
}
