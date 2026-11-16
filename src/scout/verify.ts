import { existsSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { today, writeFileAtomic } from "../core/fsutil.ts";
import { readReport, renderHtml, totalScore, type Check, type Report } from "./report.ts";
import { fetchText, isInternalHost, parseUrl, readSources, ScoutError, type FetchOptions, type Source } from "./source.ts";

/** 검사 하나의 결과. 실패·확인 못 함은 이유를 줄마다. */
export interface CheckResult extends Check {
  problems: string[];
}

const REF = /\[(S\d+)(?: ((?:\d{1,2}:)?\d{1,2}:\d{2}))?\]/g;
const STAMP = /\[((?:\d{1,2}:)?\d{1,2}:\d{2})\]/g;

/** 비교용 정규화 — 유니코드·공백·따옴표 모양·자막 시간 표시를 맞춘다. */
export function normalize(text: string): string {
  return text
    .normalize("NFC")
    .replace(STAMP, " ")
    .replace(/[‘’‚‛`´]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** 수치를 찾기 전에 지울 것 — 출처 표기, 자막 시간 `[mm:ss]`, 번호(S2·I1·G3). */
function stripMarks(text: string): string {
  return text.replace(REF, " ").replace(STAMP, " ").replace(/(?<![\p{L}\d])[SGI]\d+\b/gu, " ");
}

/** 글 속 수치(숫자 덩어리). 출처 번호(S2)·아이디어 번호(I1)·시간 표기는 뺀다. 쉼표는 지운다. */
export function numbers(text: string): string[] {
  const clean = stripMarks(text);
  // 앞자리 0은 뗀다 — "2026-07-03"의 07과 원문 "7월"이 같은 수로 맞는다(날짜도 원문과 대조한다).
  return [...clean.matchAll(/(?<![\p{L}\d.,])\d[\d,]*(?:\.\d+)?/gu)].map((m) => m[0].replace(/,/g, "").replace(/\.$/, "").replace(/^0+(?=\d)/, ""));
}

/**
 * 크기를 말하는 수치만 — 10 이상이거나 비율·돈·사람·배수 단위가 붙은 것. "주 1회", "사실 1개" 같은 작은 개수는 뺀다.
 * 추정 표시 검사(5)가 쓴다. 인용·수치 대조(1)는 모든 수치를 본다.
 */
export function measures(text: string): string[] {
  const clean = stripMarks(text);
  return [...clean.matchAll(/(?<![\p{L}\d.,])(\d[\d,]*(?:\.\d+)?)\s*(%|퍼센트|원|천|만|억|조|명|배|달러|년)?/gu)]
    // 연도(1900~2100년)는 크기가 아니라 때라서 뺀다.
    .filter((m) => !(m[2] === "년" || (m[2] === undefined && /^(19|20)\d\d$/.test(m[1]!))))
    .filter((m) => m[2] !== undefined || Number(m[1]!.replace(/,/g, "")) >= 10)
    .map((m) => m[1]!.replace(/,/g, "").replace(/\.$/, ""));
}

/** 수치는 덩어리로 비교한다 — "2"가 "2026" 안에 있다고 맞다고 하지 않는다. */
function numberSet(text: string): Set<string> {
  return new Set(numbers(text));
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})/;

function dateOf(value: string): string | null {
  const m = DATE.exec(value);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== `${m[1]}-${m[2]}-${m[3]}` ? null : `${m[1]}-${m[2]}-${m[3]}`;
}

function result(id: string, name: string, problems: string[], unknown: string[] = []): CheckResult {
  const status = problems.length > 0 ? "fail" : unknown.length > 0 ? "unknown" : "pass";
  const detail = [...problems, ...unknown].join(" / ");
  return { id, name, status, ...(detail ? { detail } : {}), problems: [...problems, ...unknown] };
}

/** 원문을 S#별로. 없으면(다른 곳에서 받은 저장소 — sources/는 git에 없다) 그 출처는 확인 못 함. */
function bodies(run: string): Map<string, Source> {
  return new Map(readSources(run).map((s) => [s.meta.id, s]));
}

// 1. 인용·수치가 원문에 있다
export function checkQuotes(report: Report, sources: Map<string, Source>): CheckResult {
  const problems: string[] = [];
  const unknown: string[] = [];
  for (const s of report.sources) {
    const original = sources.get(s.id);
    if (!original) {
      unknown.push(`${s.id} 원문 없음(sources/${s.id}.md)`);
      continue;
    }
    const body = normalize(original.body);
    const inBody = numberSet(original.body);
    s.claims.forEach((c, i) => {
      if (c.quote !== undefined && c.quote.trim() !== "" && normalize(c.quote) === "") problems.push(`${s.id} 주장 ${i + 1} 인용에 글이 없다(시간 표시뿐)`);
      else if (c.quote !== undefined && c.quote.trim() !== "" && !body.includes(normalize(c.quote))) problems.push(`${s.id} 주장 ${i + 1} 인용이 원문에 없다: "${c.quote.slice(0, 40)}"`);
      for (const n of numbers(`${c.text} ${c.quote ?? ""}`)) if (!inBody.has(n)) problems.push(`${s.id} 주장 ${i + 1} 수치 ${n}이 원문에 없다`);
    });
  }
  return result("quotes", "인용·수치 원문 대조", problems, unknown);
}

/** report.json의 모든 글 칸(사람이 읽는 문장). verification은 뺀다. */
function texts(report: Report): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  const add = (where: string, text: string | undefined) => text && out.push({ where, text });
  add("meta.note", report.meta.note);
  report.summary.reasons.forEach((t, i) => add(`summary.reasons[${i}]`, t));
  add("summary.biggest_assumption", report.summary.biggest_assumption);
  for (const s of report.sources) {
    add(`${s.id}.summary`, s.summary);
    s.claims.forEach((c, i) => add(`${s.id}.claims[${i}]`, c.text));
  }
  for (const g of report.signals) {
    add(`${g.id}.description`, g.description);
    add(`${g.id}.conflict`, g.conflict);
  }
  for (const i of report.ideas) {
    for (const key of ["problem", "customer", "solution", "revenue"] as const) add(`${i.id}.${key}`, i[key]);
    i.kill_assumptions.forEach((t, k) => add(`${i.id}.kill_assumptions[${k}]`, t));
    (i.estimates ?? []).forEach((t, k) => add(`${i.id}.estimates[${k}]`, t));
  }
  report.scores.forEach((s) => add(`${s.idea}.${s.criterion}.reason`, s.reason));
  const e = report.next_steps.experiment;
  add("next_steps.experiment.what", e.what);
  add("next_steps.experiment.success", e.success);
  report.unverified.forEach((t, i) => add(`unverified[${i}]`, t));
  (report.dropped ?? []).forEach((d, i) => add(`dropped[${i}]`, d.reason));
  return out;
}

// 2. 출처 번호·시간·내부 번호 참조가 끊기지 않는다
export function checkRefs(report: Report, sources: Map<string, Source>): CheckResult {
  const problems: string[] = [];
  const ids = new Set(report.sources.map((s) => s.id));
  const seen = new Set<string>();
  report.sources.forEach((s) => (seen.has(s.id) ? problems.push(`출처 번호 ${s.id}가 겹친다`) : seen.add(s.id)));
  // 원문(자막)이 없으면 시간은 확인할 수 없다 — 실패가 아니라 확인 못 함(sources/는 git에 없다, D12).
  const unknown = new Set<string>();
  const stampOk = (id: string, time: string): boolean => {
    const original = sources.get(id);
    if (original) return original.body.includes(`[${time.padStart(5, "0")}]`) || original.body.includes(`[${time}]`);
    unknown.add(`${id} 원문 없음 — 시간 참조 확인 못 함`);
    return true;
  };
  const ref = (where: string, raw: string) => {
    const [id, time] = raw.split(" ");
    if (!ids.has(id!)) problems.push(`${where}: 없는 출처 ${id}`);
    else if (time && !stampOk(id!, time)) problems.push(`${where}: ${id}에 ${time} 시간이 없다`);
  };
  for (const { where, text } of texts(report)) for (const m of text.matchAll(REF)) ref(where, m[2] ? `${m[1]} ${m[2]}` : m[1]!);
  for (const g of report.signals) g.evidence.forEach((r) => ref(`${g.id}.evidence`, r));
  for (const s of report.scores) s.refs.forEach((r) => ref(`${s.idea}.${s.criterion}.refs`, r));
  for (const s of report.sources) for (const c of s.claims) if (c.time && !stampOk(s.id, c.time)) problems.push(`${s.id} 주장의 시간 ${c.time}이 자막에 없다`);
  const ideaIds = new Set(report.ideas.map((i) => i.id));
  const signalIds = new Set(report.signals.map((g) => g.id));
  const criteria = new Set(report.criteria.map((c) => c.id));
  if (!ideaIds.has(report.summary.recommendation)) problems.push(`추천 ${report.summary.recommendation}이 후보에 없다`);
  if (!ideaIds.has(report.next_steps.experiment.idea)) problems.push(`검증 실험의 ${report.next_steps.experiment.idea}이 후보에 없다`);
  for (const c of report.next_steps.cards ?? []) if (!ideaIds.has(c)) problems.push(`카드 ${c}이 후보에 없다`);
  for (const i of report.ideas) for (const g of i.signals) if (!signalIds.has(g)) problems.push(`${i.id}: 없는 신호 ${g}`);
  for (const s of report.scores) {
    if (!ideaIds.has(s.idea)) problems.push(`점수의 후보 ${s.idea}가 없다`);
    if (!criteria.has(s.criterion)) problems.push(`점수의 기준 ${s.criterion}이 평가 기준에 없다`);
  }
  return result("refs", "출처·번호 참조", problems, [...unknown]);
}

// 3. 아이디어마다 근거 신호가 1개 이상
export function checkIdeaSignals(report: Report): CheckResult {
  return result("signals", "아이디어별 근거 신호", report.ideas.filter((i) => i.signals.length === 0).map((i) => `${i.id} ${i.name}: 근거 신호가 없다`));
}

// 4. 점수마다 근거 문장이 있고, 모든 후보×기준에 점수가 있다
export function checkScores(report: Report): CheckResult {
  const problems: string[] = [];
  for (const i of report.ideas) {
    for (const c of report.criteria) {
      const s = report.scores.filter((x) => x.idea === i.id && x.criterion === c.id);
      if (s.length === 0) problems.push(`${i.id}×${c.id}: 점수가 없다`);
      else if (s.length > 1) problems.push(`${i.id}×${c.id}: 점수가 ${s.length}개다`);
      else if (s[0]!.reason.trim() === "") problems.push(`${i.id}×${c.id}: 점수 근거가 없다`);
      // 근거는 출처(refs·[S#]) 또는 사용자 프로필·메모리 사실("프로필:"·"메모리:")이다(scoring-rubric 규칙 3).
      else if (!s[0]!.estimate && s[0]!.refs.length === 0 && !/\[S\d+/.test(s[0]!.reason) && !(c.id === "fit" && /(?:프로필|메모리):/.test(s[0]!.reason))) problems.push(`${i.id}×${c.id}: 출처도 프로필·메모리 근거도 추정 표시도 없다`);
    }
  }
  // 추천은 가중 합계 1위여야 한다 — 아니면 summary.reasons에 "1위가 아닌 이유"를 적는다.
  const totals = report.ideas.map((i) => ({ id: i.id, total: totalScore(report, i.id) })).sort((a, b) => b.total - a.total);
  const top = totals[0];
  const rec = totals.find((t) => t.id === report.summary.recommendation);
  if (top && rec && rec.total < top.total && !report.summary.reasons.some((r) => r.trim().startsWith("1위가 아닌 이유:"))) problems.push(`추천 ${rec.id}(${rec.total.toFixed(2)})이 가중 합계 1위 ${top.id}(${top.total.toFixed(2)})가 아니다 — 점수를 다시 보거나 summary.reasons에 "1위가 아닌 이유: …"를 적는다`);
  return result("scores", "점수별 근거", problems);
}

// 5. 출처에 없는 수치는 추정으로 표시되어 있다
export function checkEstimates(report: Report, sources: Map<string, Source>): CheckResult {
  const problems: string[] = [];
  const known = numberSet([...sources.values()].map((s) => s.body).concat(report.sources.flatMap((s) => s.claims.map((c) => `${c.text} ${c.quote ?? ""}`))).join("\n"));
  // 표시는 "추정" 한 낱말로 통일한다(writing-rules) — "가정용" 같은 낱말에 맞지 않게.
  // "(추정 …)", "…추정)", "추정치", "추정: …", "추정 9,900원" 꼴만 표시로 본다 — "추정할 수 없음" 같은 부정은 아니다.
  const marked = (text: string) => /\(추정|추정\)|추정치|추정\s*[:\d]/.test(text) && !/추정\s*(불가|할 수 없|하지|근거 없|못)/.test(text);
  const checkText = (where: string, text: string, estimate = false, list: string[] = []) => {
    if (estimate || marked(text)) return;
    for (const n of measures(text)) if (!known.has(n) && !list.some((e) => numberSet(e).has(n))) problems.push(`${where}: 수치 ${n}이 출처에 없는데 추정 표시가 없다`);
  };
  report.summary.reasons.forEach((t, i) => checkText(`summary.reasons[${i}]`, t));
  checkText("summary.biggest_assumption", report.summary.biggest_assumption, true);
  for (const g of report.signals) checkText(`${g.id}.description`, g.description);
  for (const i of report.ideas) for (const key of ["problem", "customer", "solution", "revenue"] as const) checkText(`${i.id}.${key}`, i[key], false, i.estimates ?? []);
  for (const s of report.scores) checkText(`${s.idea}.${s.criterion}.reason`, s.reason, s.estimate);
  return result("estimates", "추정 표시", problems);
}

// 6. 출처마다 발행일과 접근일이 있고 앞뒤가 맞다
export function checkDates(report: Report, now = today()): CheckResult {
  const problems: string[] = [];
  for (const s of report.sources) {
    const published = dateOf(s.published);
    const accessed = dateOf(s.accessed);
    if (!published) problems.push(`${s.id}: 발행일이 없거나 날짜가 아니다(${s.published || "빈 값"})`);
    if (!accessed) problems.push(`${s.id}: 접근일이 없거나 날짜가 아니다(${s.accessed || "빈 값"})`);
    if (accessed && accessed > now) problems.push(`${s.id}: 접근일 ${accessed}이 오늘(${now})보다 뒤다`);
    if (published && accessed && published > accessed) problems.push(`${s.id}: 발행일 ${published}이 접근일 ${accessed}보다 뒤다`);
  }
  return result("dates", "발행일·접근일", problems);
}

// 링크 — 열리는지. 네트워크가 없거나 확인할 수 없으면 실패가 아니라 확인 못 함.
export async function checkLinks(report: Report, options: FetchOptions & { offline?: boolean } = {}): Promise<CheckResult> {
  const problems: string[] = [];
  const unknown: string[] = [];
  for (const s of report.sources) {
    if (options.offline) {
      unknown.push(`${s.id} 오프라인`);
      continue;
    }
    let url: URL;
    try {
      url = parseUrl(s.url);
    } catch (error) {
      problems.push(`${s.id}: ${(error as Error).message}`);
      continue;
    }
    if (!options.allowLocal && isInternalHost(url)) {
      unknown.push(`${s.id} 내부 주소`);
      continue;
    }
    try {
      await fetchText(url, { ...options, timeoutMs: options.timeoutMs ?? 10_000 });
    } catch (error) {
      const message = (error as Error).message;
      const status = /HTTP (\d{3})/.exec(message);
      if (status && Number(status[1]) >= 400 && Number(status[1]) < 500 && status[1] !== "429" && status[1] !== "403") problems.push(`${s.id}: 열리지 않는다(${message})`);
      else unknown.push(`${s.id} 확인 못 함(${message})`);
    }
  }
  return result("links", "링크 열림", problems, unknown);
}

export interface VerifyOutcome {
  checks: CheckResult[];
  failed: number;
  /** 이 실행 폴더의 첫 검사인가(verify.log가 없었다) — 첫 실행 실패가 2개를 넘으면 땜질하지 않고 멈춘다(D8). */
  first: boolean;
  log: string;
}

/** 검사를 모두 돌려 verify.log·report.json(verification)·report.html에 남긴다. 실패가 있으면 failed > 0. */
export async function verifyRun(run: string, options: FetchOptions & { offline?: boolean; now?: string } = {}): Promise<VerifyOutcome> {
  const report = readReport(run);
  const sources = bodies(run);
  const first = !existsSync(join(run, "verify.log"));
  const checks = [
    checkQuotes(report, sources),
    checkRefs(report, sources),
    checkIdeaSignals(report),
    checkScores(report),
    checkEstimates(report, sources),
    checkDates(report, options.now),
    await checkLinks(report, options),
  ];
  const stamp = `${options.now ?? today()} pace scout verify — 통과 ${checks.filter((c) => c.status === "pass").length} · 실패 ${checks.filter((c) => c.status === "fail").length} · 확인 못 함 ${checks.filter((c) => c.status === "unknown").length}`;
  const label = { pass: "통과", fail: "실패", unknown: "확인 못 함" } as const;
  const log = [stamp, ...checks.flatMap((c) => [`[${label[c.status]}] ${c.name}`, ...c.problems.map((p) => `  - ${p}`)])].join("\n") + "\n";
  const updated: Report = { ...report, verification: { run: stamp, checks: checks.map(({ problems: _p, ...c }) => c) } };
  for (const name of ["verify.log", "report.json", "report.html"]) {
    const path = join(run, name);
    if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new ScoutError(`${name} 심볼릭 링크에는 쓰지 않는다`);
  }
  // 모두 먼저 만들고, 첫 실행 판정에 쓰는 verify.log를 마지막에 쓴다 — 중간에 실패하면 다음 실행도 첫 실행으로 본다.
  const html = renderHtml(updated);
  writeFileAtomic(join(run, "report.json"), `${JSON.stringify(updated, null, 2)}\n`);
  writeFileAtomic(join(run, "report.html"), html);
  writeFileAtomic(join(run, "verify.log"), log);
  return { checks, failed: checks.filter((c) => c.status === "fail").length, first, log };
}

