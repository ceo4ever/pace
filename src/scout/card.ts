import { existsSync, lstatSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fillTemplate, writeFileAtomic } from "../core/fsutil.ts";
import { templatesDir } from "../core/paths.ts";
import { readReport, totalScore, type Report } from "./report.ts";
import { ScoutError } from "./source.ts";

const REF = /\[(S\d+)(?: (?:\d{1,2}:)?\d{1,2}:\d{2})?\]/g;

/** 카드 파일 이름 — 후보 I3 → idea-3.md. */
export function cardFileName(ideaId: string): string {
  if (!/^I\d+$/.test(ideaId)) throw new ScoutError(`후보 번호가 아니다: ${ideaId}`);
  return `idea-${ideaId.slice(1)}.md`;
}

const list = (items: string[]) => (items.length ? items.map((x) => `- ${x}`).join("\n") : "- 없음");

/**
 * 보고서 데이터에서 혼자 읽히는 아이디어 카드(D1)를 만든다 — 보고서를 보지 않아도 되게
 * 근거 신호와 그 출처(제목·URL·발행일)를 펼쳐 적는다. 칸 이름은 기획에 보편적인 항목이다.
 */
export function renderCard(report: Report, ideaId: string, runName = ""): string {
  const idea = report.ideas.find((i) => i.id === ideaId);
  if (!idea) throw new ScoutError(`후보가 없다: ${ideaId} (있는 것: ${report.ideas.map((i) => i.id).join(", ")})`);
  const sourceIds = new Set<string>();
  const signals = idea.signals.map((g) => report.signals.find((s) => s.id === g)).filter((s) => s !== undefined);
  for (const g of signals) g.evidence.forEach((r) => sourceIds.add(r.split(" ")[0]!));
  // 카드에 나오는 모든 출처 번호를 제목·URL과 함께 펼친다 — 번호만 남으면 혼자 읽히지 않는다.
  const scored = report.scores.filter((s) => s.idea === idea.id);
  const mine = report.next_steps.experiment.idea === idea.id ? [report.next_steps.experiment.what, report.next_steps.experiment.success] : [];
  for (const text of [idea.problem, idea.customer, idea.solution, idea.revenue, ...idea.kill_assumptions, ...(idea.estimates ?? []), ...scored.map((s) => s.reason), ...mine]) for (const m of text.matchAll(REF)) sourceIds.add(m[1]!);
  for (const s of scored) s.refs.forEach((r) => sourceIds.add(r.split(" ")[0]!));
  const sources = report.sources.filter((s) => sourceIds.has(s.id));
  const evidence = [
    ...signals.map((g) => `- 신호 ${g.id} ${g.title} — ${g.description}`),
    "",
    ...sources.flatMap((s) => [
      `- [${s.id}] ${s.title} — ${s.url} (발행 ${s.published || "모름"}, 접근 ${s.accessed || "모름"})`,
      ...s.claims.map((c) => `  - ${c.type === "fact" ? "사실" : `의견${c.who ? `(${c.who})` : ""}`}${c.time ? ` ${c.time}` : ""}: ${c.text}${c.quote ? ` — "${c.quote}"` : ""}`),
    ]),
  ].join("\n");
  const experiment = report.next_steps.experiment.idea === idea.id
    ? [`- 할 일: ${report.next_steps.experiment.what}`, `- 비용: ${report.next_steps.experiment.cost}`, `- 판정: ${report.next_steps.experiment.success}`].join("\n")
    : `- 정하지 않음 — 보고서 추천(${report.summary.recommendation})이 아니다. 핵심 가정 첫 줄을 1주 안에 가장 싸게 확인할 방법부터 정한다.`;
  const scores = report.criteria.map((c) => {
    const s = report.scores.find((x) => x.idea === idea.id && x.criterion === c.id);
    return s ? `- ${c.name}(×${c.weight}): ${s.score}${s.estimate ? " (추정)" : ""} — ${s.reason}` : `- ${c.name}(×${c.weight}): 없음`;
  });
  const origin = `${report.meta.title}${runName ? ` (${runName})` : ""} · ${report.meta.created} · 후보 ${idea.id}${report.summary.recommendation === idea.id ? " · 추천" : ""}`;
  return fillTemplate(readFileSync(join(templatesDir, "scout", "idea-card.md"), "utf8").replaceAll("\r\n", "\n"), {
    name: idea.name,
    origin,
    problem: idea.problem,
    customer: idea.customer,
    solution: idea.solution,
    evidence,
    revenue: idea.revenue,
    assumptions: list(idea.kill_assumptions),
    open: list([...(idea.estimates ?? []).map((e) => `추정: ${e}`), ...report.unverified.map((u) => `보고서에서 확인하지 못한 것: ${u}`)]),
    experiment,
    total: totalScore(report, idea.id).toFixed(2),
    scores: scores.join("\n"),
  });
}

/** 실행 폴더에 idea-{n}.md를 쓴다. 링크로는 쓰지 않는다. */
export function writeCard(run: string, ideaId: string): string {
  const report = readReport(run);
  const path = join(run, cardFileName(ideaId));
  const text = renderCard(report, ideaId, basename(resolve(run)));
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new ScoutError(`${cardFileName(ideaId)} 심볼릭 링크에는 쓰지 않는다`);
  writeFileAtomic(path, text);
  return path;
}
