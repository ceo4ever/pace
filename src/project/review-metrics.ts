import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { inputHash, InputSnapshotError, type InputTrace } from "../core/input-snapshot.ts";
import { FOLLOWUPS_FILE, parseReviewFollowups } from "../agent/review-followup.ts";
import { matchingCriteria } from "../agent/review-criteria.ts";
import { LEDGER_FILE, legacyBlockingCount, parseLedger, textHash, type LedgerEntry, type ReviewEntry } from "../agent/review-log.ts";
import { assessStructuredReview, type StructuredAssessment } from "../agent/structured-review.ts";
import { LEDGER_LIMIT, regularBytes, utf8 } from "./handoff-files.ts";
import { reviewHash } from "./pre-review.ts";
import { matchesPermissionBasis } from "./review-permission.ts";

type Phase = "pre" | "post" | "backlog" | "project";
type UnitKind = "task" | "backlog" | "project";
type Unit = { id: string; kind: UnitKind; root: string; ledgers: string[] };
type Datum = { phase: Phase; path: string; row: LedgerEntry; voided: boolean };
type ReviewDatum = Datum & { row: ReviewEntry };
type Measure = { total: number | null; reported: number; missing: number };
type ImpactStats = { rounds: number; durationMs: Measure };
type Outcome = { snapshot: string; findings?: NonNullable<StructuredAssessment["findings"]>; blocking: number | null };

export interface LedgerReviewTotals {
  ledgers: number;
  calls: number;
  callSources: { reserved: number; unreserved: number; unfinished: number; interrupted: number; voided: number };
  rounds: number;
  durationMs: Measure;
  inputTokens: Measure;
  outputTokens: Measure;
  blocking: number;
  unobservedBlockingRounds: number;
  resolutionProxy: { resolved: number; eligible: number; ratio: number | null; unobservedRounds: number };
  downgraded: Record<string, number>;
  rereviewsByImpact: Record<string, ImpactStats>;
  jointAttempts: number;
  escalations: number;
  diagnoses: number;
  upperReviews: number;
  unobservedFollowupRounds: number;
}

interface ReviewUnitTotals extends LedgerReviewTotals {
  id: string;
  kind: UnitKind;
  phases: Partial<Record<Phase, LedgerReviewTotals>>;
}

export interface ReviewLedgerMetrics extends LedgerReviewTotals {
  units: ReviewUnitTotals[];
  phases: Partial<Record<Phase, LedgerReviewTotals>>;
  issues: string[];
}

function observedFile(path: string, trace?: InputTrace): string | undefined {
  try {
    const bytes = regularBytes(path, LEDGER_LIMIT);
    trace?.record(path, inputHash(bytes));
    return utf8(bytes);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    trace?.absent?.(path);
    return undefined;
  }
}

function directory(path: string): boolean {
  try { return lstatSync(path).isDirectory(); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return false;
  }
}

function namedDirs(path: string, accept: (name: string) => boolean): string[] {
  if (!directory(path)) return [];
  return readdirSync(path).filter((name) => accept(name) && directory(join(path, name))).sort();
}

function linkedBacklog(root: string, project: string, body: string): string | null {
  const link = /^- 출처: .*?\]\(([^)]+)\)/m.exec(body)?.[1];
  if (!link) return null;
  let location: string;
  try { location = decodeURI(link.split("#", 1)[0]!); } catch { return null; }
  const path = resolve(project, location);
  const relativeBacklog = relative(join(root, "backlogs"), path);
  const [folder, file, ...other] = relativeBacklog.split(sep);
  if (!folder || !/^BL\d{6}_\d{2}_/.test(folder) || isAbsolute(relativeBacklog) || other.length || (file && file !== "BACKLOG.md")) return null;
  const dir = join(root, "backlogs", folder);
  return directory(join(root, "backlogs")) && directory(dir) ? dir : null;
}

function sources(root: string, project: string, trace?: InputTrace): Unit[] {
  const dir = join(root, "projects", project);
  if (!directory(join(root, "projects")) || !directory(dir)) return [];
  const evidence = join(dir, "evidence");
  const projectLedgers = [join(dir, LEDGER_FILE)];
  if (directory(evidence)) projectLedgers.push(
    join(evidence, LEDGER_FILE),
    ...namedDirs(evidence, (name) => /^S-?\d+_/.test(name))
      .map((name) => join(evidence, name, LEDGER_FILE)),
  );
  const units: Unit[] = [{ id: project.slice(0, 4), kind: "project", root: dir, ledgers: projectLedgers }];
  const tasks = join(dir, "tasks");
  for (const name of namedDirs(tasks, (item) => /^T\d{2}_/.test(item))) {
    const task = join(tasks, name), ledgers = [join(task, LEDGER_FILE)];
    if (directory(join(task, "evidence"))) ledgers.push(join(task, "evidence", LEDGER_FILE));
    units.push({ id: name.slice(0, 3), kind: "task", root: task, ledgers });
  }
  const definitions = join(dir, "PROJECT.md");
  // Project metadata has the same legacy file semantics as the existing stats reader.
  const body = readFileSync(definitions);
  trace?.record(definitions, inputHash(body));
  const backlog = linkedBacklog(root, dir, body.toString("utf8"));
  if (backlog) units.push({ id: basename(backlog).slice(0, 11), kind: "backlog", root: backlog, ledgers: [join(backlog, LEDGER_FILE)] });
  return units;
}

function phaseOf(unit: Unit, path: string, target: string): Phase {
  if (unit.kind !== "task") return unit.kind;
  return dirname(path) === unit.root && target.toLowerCase() === "task.md" ? "pre" : "post";
}

function readUnit(root: string, unit: Unit, trace: InputTrace | undefined, issues: Set<string>) {
  const data: Datum[] = [], present: { path: string; phases: Set<Phase> }[] = [];
  for (const path of unit.ledgers) {
    try {
      const body = observedFile(path, trace);
      if (body === undefined) continue;
      const phases = new Set<Phase>();
      present.push({ path, phases });
      const rows = parseLedger(body, basename(path));
      const invalidated = new Set(rows.flatMap((row) => row.type === "void" ? [`${row.target}\0${row.record}`] : []));
      if (!rows.length) phases.add(phaseOf(unit, path, "TASK.md"));
      for (const row of rows) {
        const phase = phaseOf(unit, path, row.target);
        phases.add(phase);
        data.push({ phase, path, row, voided: row.type === "review" && invalidated.has(`${row.target}\0${row.record}`) });
      }
    } catch (error) {
      if (error instanceof InputSnapshotError) throw error;
      issues.add(`검토 원장 판독 미확인 — ${relative(root, path)}`);
    }
  }
  const actions = { joint: new Map<Phase, number>(), escalations: new Map<Phase, number>(), upperReviews: new Map<Phase, number>() };
  const followup = join(unit.root, FOLLOWUPS_FILE);
  let presentFollowup: string | undefined;
  try {
    const body = observedFile(followup, trace);
    if (body !== undefined) presentFollowup = followup;
    const rows = body === undefined ? [] : parseReviewFollowups(body, basename(followup));
    const grants = new Map(rows.flatMap((row) => row.type === "joint" ? [[row.id, row.stage]] : []));
    const seen = new Set<string>();
    const add = (counts: Map<Phase, number>, phase: Phase) => counts.set(phase, (counts.get(phase) ?? 0) + 1);
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      if (row.type === "started") {
        const phase = grants.get(row.grant);
        if (phase) add(actions.joint, phase);
      }
      if (row.type === "root_review") add(actions.upperReviews, row.stage);
      if (row.type === "waiver_request") add(actions.escalations, row.stage);
    }
  } catch (error) {
    if (error instanceof InputSnapshotError) throw error;
    issues.add(`검토 후속 원장 판독 미확인 — ${relative(root, followup)}`);
  }
  return { data, present, actions, presentFollowup };
}

function isReview(item: Datum): item is ReviewDatum { return item.row.type === "review"; }
function isRound({ row, voided }: ReviewDatum): boolean {
  return !voided && !row.interrupted && row.verdict !== "unknown";
}
function resultPath(item: ReviewDatum): string { return join(dirname(item.path), item.row.record); }
function callKey(item: ReviewDatum): string {
  return item.row.call_id ? `${item.phase}\0${item.row.call_id}` : resultPath(item);
}

function readOutcome(item: ReviewDatum, stamp: LedgerEntry | undefined, trace?: InputTrace): Outcome | undefined {
  const { row } = item;
  const path = resultPath(item);
  try {
    try {
      if (!lstatSync(dirname(path)).isDirectory()) return undefined;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      trace?.absent?.(path);
      return undefined;
    }
    const body = observedFile(path, trace);
    if (body === undefined) return undefined;
    const record = JSON.parse(body);
    const raw = record?.result?.text, snapshot = record?.review?.snapshot;
    if (typeof raw !== "string" || typeof snapshot !== "string" || row.result_hash !== textHash(raw) || row.hash !== reviewHash(snapshot) ||
        record.review.hash !== row.hash || record.review.verdict !== row.verdict || record.review.target !== row.target) return undefined;
    if (row.structured_stage) {
      if ((stamp || row.required_criteria !== undefined) &&
          (stamp?.type !== "format" || stamp.hash !== row.hash || !matchingCriteria(stamp.required_criteria, row.required_criteria) ||
            !matchingCriteria(stamp.required_criteria, record.review.required_criteria) ||
            !matchesPermissionBasis(stamp.permission_basis, row.permission_basis) ||
            !matchesPermissionBasis(stamp.permission_basis, record.review.permission_basis))) return undefined;
      const assessment = assessStructuredReview(row.structured_stage, raw, row.required_criteria, row.permission_basis ? snapshot.split("\n").length : undefined);
      if (assessment.verdict !== row.verdict || assessment.findings === null || record.review.structured_stage !== row.structured_stage) return undefined;
      return { snapshot, findings: assessment.findings, blocking: assessment.findings.filter((item) => item.effective === "blocking").length };
    }
    return { snapshot, blocking: legacyBlockingCount(raw, row.verdict) };
  } catch (error) {
    if (error instanceof InputSnapshotError) throw error;
    return undefined;
  }
}

function measure(values: readonly (number | null | undefined)[]): Measure {
  const reported = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const sum = reported.reduce((total, value) => total + value, 0);
  return { total: reported.length && Number.isFinite(sum) ? sum : null, reported: reported.length, missing: values.length - reported.length };
}

function count(map: Record<string, number>, key: string, value = 1): void { map[key] = (map[key] ?? 0) + value; }

function metricsOf(selected: ReturnType<typeof readUnit>, outcomes: Map<string, Outcome | undefined>, subset?: Phase): LedgerReviewTotals {
  const watch = subset ? selected.data.filter((item) => item.phase === subset) : selected.data;
  const reviews = [...new Map(watch.filter(isReview).map((item) => [callKey(item), item])).values()];
  const rounds = reviews.filter(isRound);
  const calls = new Map<string, ReviewEntry | undefined>();
  for (const { phase, row } of watch) if (row.type === "call") calls.set(`${phase}\0${row.call_id}`, undefined);
  const reserved = calls.size;
  for (const item of reviews) calls.set(callKey(item), item.row);
  const expenses = [...calls.values()];
  const downgraded: Record<string, number> = {};
  const impacts = new Map<string, ReviewEntry[]>();
  const resolved = new Set<string>();
  const byPath = new Map(rounds.map((item) => [resultPath(item), item]));
  let blocking = 0, eligible = 0, unobservedBlockingRounds = 0, unobservedRounds = 0;
  for (const item of rounds) {
    const path = resultPath(item), outcome = outcomes.get(path), findings = outcome?.findings;
    if (outcome?.blocking == null) unobservedBlockingRounds++;
    else blocking += outcome.blocking;
    if (!findings) unobservedRounds++;
    for (const finding of findings ?? []) {
      if (finding.effective === "blocking") eligible++;
      if (finding.severity === "blocking" && finding.effective !== "blocking" && finding.effective !== "unverified" && finding.reason) count(downgraded, finding.reason);
    }
    if (!item.row.rereview_of) continue;
    const previousPath = resolve(dirname(item.path), item.row.rereview_of);
    const previous = byPath.get(previousPath), before = outcomes.get(previousPath);
    const categories = [...new Set(before?.findings?.map(({ impact }) => impact ?? "미확인"))];
    for (const impact of categories.length ? categories : ["미확인"]) {
      const axis = impacts.get(impact) ?? [];
      axis.push(item.row);
      impacts.set(impact, axis);
    }
    if (item.row.verdict === "pass" && findings && previous && before?.findings && previous.phase === item.phase &&
        resolve(dirname(item.path), item.row.target) === resolve(dirname(previous.path), previous.row.target) &&
        item.row.hash !== previous.row.hash && outcome?.snapshot !== before.snapshot) {
      for (const finding of before.findings.filter((item) => item.effective === "blocking")) resolved.add(`${previousPath}\0${finding.id}`);
    }
  }
  const across = (map: Map<Phase, number>) => subset ? map.get(subset) ?? 0 : [...map.values()].reduce((a, b) => a + b, 0);
  const jointlyReviewed = reviews.filter((item) => item.row.followup?.type === "joint").length;
  return {
    ledgers: selected.present.filter((source) => !subset || source.phases.has(subset)).length, calls: calls.size, rounds: rounds.length,
    callSources: { reserved, unreserved: reviews.filter(({ row }) => !row.call_id).length,
      unfinished: expenses.filter((entry) => !entry).length, interrupted: reviews.filter(({ row }) => row.interrupted).length,
      voided: reviews.filter(({ voided }) => voided).length },
    durationMs: measure(expenses.map((row) => row?.duration_ms)),
    inputTokens: measure(expenses.map((row) => row?.usage?.input_tokens)), outputTokens: measure(expenses.map((row) => row?.usage?.output_tokens)),
    blocking, unobservedBlockingRounds, resolutionProxy: { resolved: resolved.size, eligible, ratio: eligible ? resolved.size / eligible : null, unobservedRounds },
    downgraded, rereviewsByImpact: Object.fromEntries([...impacts].map(([impact, rows]) => [impact, { rounds: rows.length, durationMs: measure(rows.map((row) => row.duration_ms)) }])),
    jointAttempts: Math.max(jointlyReviewed, across(selected.actions.joint)),
    escalations: across(selected.actions.escalations),
    diagnoses: watch.filter(({ row }) => row.type === "diagnosis").length,
    upperReviews: across(selected.actions.upperReviews),
    unobservedFollowupRounds: rounds.filter(({ row }) => !row.call_id && !row.structured_stage && !row.followup).length,
  };
}

function combine(parts: readonly LedgerReviewTotals[]): LedgerReviewTotals {
  const sum = (field: "ledgers" | "calls" | "rounds" | "blocking" | "unobservedBlockingRounds" | "jointAttempts" | "escalations" |
    "diagnoses" | "upperReviews" | "unobservedFollowupRounds") =>
    parts.reduce((value, item) => value + item[field], 0);
  const measures = (values: Measure[]): Measure => {
    const total = measure(values.map((item) => item.total)).total;
    return { total, reported: values.reduce((sum, item) => sum + item.reported, 0), missing: values.reduce((sum, item) => sum + item.missing, 0) };
  };
  const proxy = parts.map((item) => item.resolutionProxy);
  const callSources = { reserved: 0, unreserved: 0, unfinished: 0, interrupted: 0, voided: 0 };
  const eligible = proxy.reduce((sum, item) => sum + item.eligible, 0), resolved = proxy.reduce((sum, item) => sum + item.resolved, 0);
  const downgraded: Record<string, number> = {}, axes = new Map<string, ImpactStats[]>();
  for (const part of parts) {
    for (const key of Object.keys(callSources) as (keyof typeof callSources)[]) callSources[key] += part.callSources[key];
    for (const [reason, total] of Object.entries(part.downgraded)) count(downgraded, reason, total);
    for (const [impact, stats] of Object.entries(part.rereviewsByImpact)) axes.set(impact, [...axes.get(impact) ?? [], stats]);
  }
  return {
    ledgers: sum("ledgers"), calls: sum("calls"), rounds: sum("rounds"), callSources, blocking: sum("blocking"), unobservedBlockingRounds: sum("unobservedBlockingRounds"),
    jointAttempts: sum("jointAttempts"), escalations: sum("escalations"), diagnoses: sum("diagnoses"), upperReviews: sum("upperReviews"),
    unobservedFollowupRounds: sum("unobservedFollowupRounds"), downgraded,
    durationMs: measures(parts.map((part) => part.durationMs)), inputTokens: measures(parts.map((part) => part.inputTokens)), outputTokens: measures(parts.map((part) => part.outputTokens)),
    resolutionProxy: { eligible, resolved, ratio: eligible ? resolved / eligible : null, unobservedRounds: proxy.reduce((sum, item) => sum + item.unobservedRounds, 0) },
    rereviewsByImpact: Object.fromEntries([...axes].map(([impact, values]) => [impact, {
      rounds: values.reduce((sum, item) => sum + item.rounds, 0), durationMs: measures(values.map((item) => item.durationMs)),
    }])),
  };
}

const phasesList = ["pre", "post", "backlog", "project"] as const;
const projectReviewSource = /^(?:(?:tasks\/T\d{2}_[^/]+\/)?(?:REVIEW-LOG\.jsonl|REVIEW-FOLLOWUPS\.jsonl)|(?:tasks\/T\d{2}_[^/]+\/evidence\/|evidence\/(?:S-?\d+_[^/]+\/)?)REVIEW-LOG\.jsonl)$/;
export function collectReviewLedgerMetrics(root: string, project: string, trace?: InputTrace): ReviewLedgerMetrics {
  const issues = new Set<string>();
  const projectDir = join(root, "projects", project);
  const activeFiles: string[] = [];
  const units = sources(root, project, trace).map((unit): ReviewUnitTotals => {
    const selected = readUnit(root, unit, trace, issues);
    if (unit.kind !== "backlog") {
      activeFiles.push(...selected.present.map(({ path }) => path));
      if (selected.presentFollowup) activeFiles.push(selected.presentFollowup);
    }
    const stamps = new Map(selected.data.flatMap(({ row, path }) => row.type === "format" ?
      [[`${join(dirname(path), row.record)}\0${row.target}`, row]] : []));
    const outcomes = new Map(selected.data.filter(isReview).filter(isRound).map((item) => [
      resultPath(item), readOutcome(item, stamps.get(`${resultPath(item)}\0${item.row.target}`), trace),
    ]));
    const phases = Object.fromEntries(phasesList.flatMap((phase) => {
      const totals = metricsOf(selected, outcomes, phase);
      return totals.ledgers || totals.calls || totals.escalations || totals.upperReviews || totals.jointAttempts ? [[phase, totals]] : [];
    }));
    return { id: unit.id, kind: unit.kind, ...metricsOf(selected, outcomes), phases };
  });
  const phases = Object.fromEntries(phasesList.flatMap((phase) => {
    const parts = units.flatMap((unit) => unit.phases[phase] ?? []);
    return parts.length ? [[phase, combine(parts)]] : [];
  }));
  trace?.listing?.(projectDir, activeFiles.map((path) => relative(projectDir, path).split(sep).join("/")),
    "review-ledger-inputs", "regular-files", (name) => projectReviewSource.test(name));
  return { ...combine(units), units, phases, issues: [...issues] };
}

const labels = { pre: "사전", post: "구현 후", backlog: "백로그", project: "프로젝트 직속" };
const amount = (item: Measure, unit = "") => item.total === null ? `미보고${item.missing ? ` ${item.missing}회` : ""}` :
  `${item.total}${unit}${item.missing ? ` · 미보고 ${item.missing}회` : ""}`;
function observedFollowups(count: number, unobserved: number): string {
  return unobserved ? count ? `${count} · 일부 미관측` : "미관측" : String(count);
}
function tableRow(label: string, item: LedgerReviewTotals): string {
  const pct = item.resolutionProxy.ratio === null ? "미확인" : `${item.resolutionProxy.resolved}/${item.resolutionProxy.eligible} (${(100 * item.resolutionProxy.ratio).toFixed(1)}%)`;
  return `| ${label} | ${item.ledgers || "원장 없음"} | ${item.calls} | ${item.rounds} | ${amount(item.durationMs, " ms")} | ${amount(item.inputTokens)} | ${amount(item.outputTokens)} | ${item.blocking}${item.unobservedBlockingRounds ? ` · 미확인 ${item.unobservedBlockingRounds}회` : ""} | ${pct}${item.resolutionProxy.unobservedRounds ? ` · 미관측 ${item.resolutionProxy.unobservedRounds}회` : ""} | ${observedFollowups(item.jointAttempts, item.unobservedFollowupRounds)} | ${observedFollowups(item.escalations, item.unobservedFollowupRounds)} | ${item.diagnoses} / ${item.upperReviews} |`;
}

export function formatReviewLedgerMetrics(stats: ReviewLedgerMetrics): string {
  const rows = [tableRow("전체", stats), ...phasesList.flatMap((phase) => stats.phases[phase] ? [tableRow(labels[phase], stats.phases[phase])] : [])];
  for (const item of stats.units) {
    rows.push(tableRow(item.kind === "project" ? `${item.id} 직속` : item.id, item));
    for (const phase of phasesList) {
      const details = item.phases[phase];
      if (details) rows.push(tableRow(`${item.id} · ${labels[phase]}`, details));
    }
  }
  const details = [stats, ...stats.units].flatMap((item) => {
    const down = Object.entries(item.downgraded).map(([reason, value]) => `${reason} ${value}건`).join(" · ");
    const rechecks = Object.entries(item.rereviewsByImpact).map(([impact, value]) => `${impact} ${value.rounds}회 · ${amount(value.durationMs, " ms")}`).join(" / ");
    return down || rechecks ? [`| ${"id" in item ? item.id : "전체"} | ${down || "관측 없음"} | ${rechecks || "관측 없음"} |`] : [];
  });
  return [
    "## 검토 원장 집계", "",
    "검토 호출·유효 판정의 원본은 REVIEW-LOG.jsonl이다. 기존 리뷰 사건·팀 수치와 합산하지 않는다.",
    "입력·출력은 원장 필드 그대로다. 캐시·추론은 기존 도구별 지표에서 확인한다.",
    "owner 요청은 구조화된 승인 요청 사건의 관측이다. 옛 원장의 공동 기록과 owner 요청은 미관측일 수 있다.",
    "해소 비율은 변경된 같은 대상에서 기존 재현 지적을 잇는 독립 pass가 있는 비율이며 결함 확인의 대리 지표다.", "",
    "| 대상 | 원장 | 호출 | 유효 판정 | 시간 | 입력 토큰 | 출력 토큰 | blocking | 기록상 해소 | 공동 | owner 요청 | 진단 / 상위 검토 |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|", ...rows, "",
    ...(details.length ? ["한 재검토는 관련된 각 영향 범주에 한 번씩 들어간다.", "", "| 대상 | 강등 사유별 집계 | 직전 지적 영향별 재검토 |", "|---|---|---|", ...details, ""] : []),
    ...stats.issues.map((issue) => `- ${issue}`),
  ].join("\n");
}
