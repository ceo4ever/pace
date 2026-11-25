import { safeTeamPath } from "../team/store.ts";
import { inputHash, InputSnapshot, InputSnapshotError, type InputTrace } from "../core/input-snapshot.ts";
import { dirname } from "node:path";
import { sourceRef } from "../team/handoff-model.ts";
import { digest, fields, hashValue, HandoffError, LEDGER_LIMIT, object, regularBytes, shortText, strictJson, utf8 } from "./handoff-files.ts";
import { reusedDeliveryResponses, type DeliveryClaim } from "./handoff-report.ts";
import { TeamReceiptReads, readComparisonEvidence, comparisonContext, completionProofUnconfirmed, matchRequestCoverageProof, readCompletionProof, representativeProofBinding, representativeScopeUnconfirmed, requestCoverageUnconfirmed, requestTotalKeys, iso, MANUAL_KEYS, metadataJson, metadataValue, nullableNatural, teamPeriod, type ComparisonContext, type Study, type TeamPeriod } from "./team-input.ts";

interface Sample { qualitySamples: Record<string, number | null>[]; auditedBlockingPresent: boolean; origin: "stats-declared-reported" | "independent-reported" | "mixed-reported"; sourceSha256: string; repository: string; context: ComparisonContext; period: TeamPeriod | null; counts: Record<string, number | null>; observed: Record<string, number | null>; unknownRequests: number | null; limits: string[]; range: number[] | null; sampleCountActual: number; intervals: TeamPeriod[] }
interface SampleRecord { sample: Sample; deliveryClaims: DeliveryClaim[] }
interface SampleGroup { records: SampleRecord[]; bundled: boolean }
const deliveryReuseUnconfirmed = "비교 표본의 외부 응답 증빙 재사용";
const burden = ["owner_questions", ...MANUAL_KEYS.slice(0, 4)];
const qualityKeys = ["blocking_sum", "blocking_sum_stats_events", "blocking_sum_audited", "rereviews_after_fail", "review_failures", "should_fix_sum_stats_events", "gate_failures"];
const metrics = [...burden, ...MANUAL_KEYS.slice(4), "coordinator_questions", "coordinator_answers", "failed_owner_delivery_attempts", "failed_only_owner_requests", "blocking_sum", "blocking_sum_stats_events", "blocking_sum_audited", "rereviews_after_fail", "review_failures", "should_fix_sum_stats_events", "gate_failures"];
const pairs = { "role-automation": ["message-role", "start-role"], "team-adoption": ["no-team", "team"], "definition-change": ["before-change", "after-change"] };
function numbers(value: unknown): Record<string, number | null> {
  if (!object(value) || Object.values(value).some((n) => !nullableNatural(n) && !(Array.isArray(n) && n.length === 2 && n.every(nullableNatural)))) throw new HandoffError("기준선 수치는 정수/null이어야 한다");
  return Object.fromEntries(Object.entries(value).filter(([, n]) => nullableNatural(n))) as Record<string, number | null>;
}
function reportedDeliveryClaims(value: unknown): { claims: DeliveryClaim[]; complete: boolean } {
  if (!Array.isArray(value)) return { claims: [], complete: false };
  const claims: DeliveryClaim[] = [];
  for (const claim of value) {
    if (!object(claim)) continue;
    const { responses, ambiguous } = claim;
    if ((ambiguous !== undefined && ambiguous !== true) || Object.keys(claim).length !== (ambiguous ? 4 : 3)) continue;
    if (!hashValue(claim.request) || typeof claim.counted !== "boolean" ||
        !Array.isArray(responses) || responses.length !== 2 || !hashValue(responses[0]) || !hashValue(responses[1])) continue;
    claims.push({ request: claim.request, responses: [responses[0], responses[1]], counted: claim.counted, ...(ambiguous ? { ambiguous } : {}) });
  }
  return { claims, complete: claims.length === value.length };
}
function sample(receipts: TeamReceiptReads, path: string, annotation?: string, direct?: unknown, capturedBytes?: Buffer, inputs?: InputTrace): SampleRecord {
  const bytes = capturedBytes ?? regularBytes(path, LEDGER_LIMIT), original = direct ?? metadataValue(bytes);
  inputs?.record(path, inputHash(bytes));
  if (!object(original)) throw new HandoffError("팀 기준선 객체 오류");
  const wrappedSnapshot = object(original.team) ? original.team.snapshot : undefined;
  const fromStatsEnvelope = object(wrappedSnapshot);
  const v = fromStatsEnvelope ? wrappedSnapshot : original;
  if (v.version !== 1 || !shortText(v.repository, 1024)) throw new HandoffError("팀 기준선 version/repository 오류");
  readComparisonEvidence(receipts, dirname(path), v.period, v.requestCoverage, inputs);
  let context = v.comparison === undefined ? {} : comparisonContext(v.comparison);
  let period: TeamPeriod | null = null;
  if (object(v.period) && typeof v.period.closed === "boolean") period = teamPeriod(v.period);
  else if (object(v.period) && iso(v.period.start) && iso(v.period.end)) period = { start: v.period.start, end: v.period.end, unit: "project-start-to-merge", closed: false };
  if (period && Date.parse(period.end) > Date.now()) throw new HandoffError("비교 구간 종료는 미래일 수 없다");
  if (v.completionProofSha256 !== undefined && !hashValue(v.completionProofSha256)) throw new HandoffError("완료 영수증 지문 형식 오류");
  const completion = period ? readCompletionProof(receipts, dirname(path), period, inputs) : null;
  const completionUnconfirmed = !!period?.closed && (!completion || completion.sha256 !== v.completionProofSha256);
  if (period && completionUnconfirmed) period.closed = false;
  if (period && context.unit !== undefined && period.unit !== context.unit) throw new HandoffError("표본 구간 단위와 비교 단위 불일치");
  // Legacy AI-sql duration was explicitly incomparable, so do not synthesize a closed period.
  const legacy = !object(v.comparison);
  // T01 immutable v1 baselines predate owner naming. Normalize only this legacy adapter.
  const legacyNumbers = (value: unknown) => Object.fromEntries(Object.entries(numbers(value)).map(([key, n]) => [legacy ? key.replace(/^captain_/, "owner_").replace(/^failed_captain_/, "failed_owner_") : key, n]));
  const counts = legacyNumbers(v.counts), observed = v.observed_counts === undefined ? {} : legacyNumbers(v.observed_counts);
  const limits = ["원본 기준선 지문 고정; 신고 수치는 사람 인증/인과 효과가 아님"];
  let unknownRequests: number | null = object(v.unknown) && nullableNatural(v.unknown.request_events) ? v.unknown.request_events : null;
  const sha = digest(bytes);
  if (!object(v.comparison)) counts.owner_questions = null;
  if (annotation) {
    if (v.comparison !== undefined) throw new HandoffError("비교 주석은 comparison 없는 legacy 원본에만 적용한다");
    const a = metadataJson(annotation, 32768, inputs); fields(a, ["version", "sourceSha256", "sourceRef", "comparison", "reachability"], ["version", "sourceSha256", "sourceRef", "comparison"]);
    if (a.version !== 1 || a.sourceSha256 !== sha || !sourceRef(a.sourceRef)) throw new HandoffError("비교 주석의 원본 지문/출처 불일치");
    context = comparisonContext(a.comparison);
    if (a.reachability !== undefined) {
      fields(a.reachability, ["file", "sha256"]);
      if (!shortText(a.reachability.file, 240) || !hashValue(a.reachability.sha256)) throw new HandoffError("도달성 주석 경로/지문 오류");
      // Relative metadata input must remain next to the annotation, never a private body.
      const reachPath = safeTeamPath(dirname(annotation), a.reachability.file);
      const b = regularBytes(reachPath, 262144); if (digest(b) !== a.reachability.sha256) throw new HandoffError("도달성 입력 지문 불일치");
      inputs?.record(reachPath, inputHash(b));
      const r = strictJson(utf8(b)); if (!object(r) || !object(r.counts)) throw new HandoffError("도달성 입력 형식 오류");
      const c = r.counts;
      if (![c.reached_reply, c.reached_delivery, c.unknown].every(nullableNatural) || c.reached_reply === null || c.reached_delivery === null || c.unknown === null) throw new HandoffError("도달성 수치 오류");
      counts.owner_questions = Number(c.reached_reply) + Number(c.reached_delivery); unknownRequests = Number(c.unknown);
      limits.push("legacy 도달성 overlay는 요약 출처 기반 신고이며 원문 재감사/전달 실패 수집을 보장하지 않음");
    }
  }
  if (!object(v.comparison) && !annotation) { counts.owner_questions = null; limits.push("legacy 수신 의도는 실제 도달 수가 아님: 지문 고정 주석/도달성 입력 필요"); }
  if (counts.rereviews_after_fail === undefined) counts.rereviews_after_fail = counts.rereviews_after_fail_audited ?? null;
  counts.blocking_sum = context.qualitySource === "event-log" ? counts.blocking_sum_stats_events ?? null : context.qualitySource === "audited-verdicts" ? counts.blocking_sum_audited ?? null : null;
  const range = Array.isArray((v.counts as Record<string, unknown>)[legacy ? "captain_questions_range" : "owner_questions_range"]) ? (v.counts as Record<string, unknown>)[legacy ? "captain_questions_range" : "owner_questions_range"] as number[] : null;
  const declaredScopeUnknown = Array.isArray(v.limits) && v.limits.some((limit) =>
    typeof limit === "string" && limit.startsWith(representativeScopeUnconfirmed));
  const scopeUnconfirmed = period?.unit === "representative-task" && (declaredScopeUnknown || !period.closed || !completion?.representativeScope);
  const hasStatsCollection = object(v.unknown) && (Object.hasOwn(v.unknown, "recipient_events") || Object.hasOwn(v.unknown, "manual_fields"));
  const hasUnlabeledStatsTime = Object.hasOwn(v, "observed_at") && v.measurementKind !== "independent-reported-v1";
  const fromStats = fromStatsEnvelope || v.measurementKind === "stats-reported-v1" ||
    Object.hasOwn(v, "requestCoverage") || Object.hasOwn(v, "deliveryClaims") ||
    !legacy && (hasStatsCollection || hasUnlabeledStatsTime);
  const deliveries = reportedDeliveryClaims(fromStats ? v.deliveryClaims : undefined);
  const requestFactsConfirmed = fromStats && !!period?.closed && deliveries.complete &&
    matchRequestCoverageProof(receipts, dirname(path), v.requestCoverage, period, {
      repository: v.repository, comparison: context, representativeProof: representativeProofBinding(period, completion),
      counts, observed, unknownRequests, deliveryClaims: deliveries.claims,
    }, inputs);
  if (fromStats && !requestFactsConfirmed) {
    limits.push(requestCoverageUnconfirmed);
    for (const key of requestTotalKeys) counts[key] = null;
  }
  for (const [key, lower] of Object.entries(observed)) if (lower !== null && counts[key] !== undefined && counts[key] !== null && lower > counts[key]!) throw new HandoffError("관측 하한이 신고 총량보다 크다");
  if (completionUnconfirmed) limits.push(completionProofUnconfirmed);
  if (scopeUnconfirmed) limits.push(representativeScopeUnconfirmed);
  if (completionUnconfirmed || scopeUnconfirmed) {
    for (const key of Object.keys(counts)) {
      if (!Object.hasOwn(observed, key)) observed[key] = counts[key] ?? null;
      counts[key] = null;
    }
  }

  // A valid adverse claim can disqualify other evidence. Only a confirmed claim can support its own total.
  const deliveryClaims = requestFactsConfirmed ? deliveries.claims : deliveries.claims.map((claim) => ({ ...claim, counted: false }));
  return { deliveryClaims, sample: { qualitySamples: [Object.fromEntries(qualityKeys.map((key) => [key, counts[key] ?? null]))], auditedBlockingPresent: counts.blocking_sum_audited != null || observed.blocking_sum_audited != null, origin: fromStats ? "stats-declared-reported" : "independent-reported", sourceSha256: sha, repository: v.repository, context, period, counts, observed, unknownRequests, limits, range, sampleCountActual: 1, intervals: period ? [period] : [] } };
}
function readGroup(receipts: TeamReceiptReads, path: string, annotation?: string, inputs?: InputTrace): SampleGroup {
  const bytes = regularBytes(path, LEDGER_LIMIT), v = metadataValue(bytes);
  inputs?.record(path, inputHash(bytes));
  if (!object(v) || !Object.hasOwn(v, "samples")) return { records: [sample(receipts, path, annotation, undefined, bytes, inputs)], bundled: false };
  fields(v, ["version", "samples"]);
  if (v.version !== 1 || !Array.isArray(v.samples) || v.samples.length < 1 || v.samples.length > 32 || annotation) throw new HandoffError("표본 묶음은 version1·1~32개이며 개별 comparison을 사용한다");
  const records = v.samples.map((value) => sample(receipts, path, undefined, value, bytes, inputs)), first = records[0]!.sample;
  const identities = new Set<string>();
  for (const { sample: one } of records) {
    const id = JSON.stringify([one.repository, one.period?.unit, one.period?.start, one.period?.end]);
    if (identities.has(id)) throw new HandoffError("같은 측정 구간의 중복 표본을 N으로 셀 수 없다");
    identities.add(id);
    for (const key of ["study", "conditionCode", "definition", "unit", "workType", "sizeBand", "host", "recordingBoundary", "qualitySource", "qualityScopeHash"] as const) if (one.context[key] !== first.context[key]) throw new HandoffError("표본 묶음 내부 비교 조건 불일치");
    if (one.repository !== first.repository) throw new HandoffError("표본 묶음 내부 저장소 불일치");
  }
  return { records, bundled: true };
}
function holdReusedDelivery(records: SampleRecord[]): void {
  const reused = reusedDeliveryResponses(records.flatMap((record) => record.deliveryClaims));
  if (!reused.size) return;
  for (const { sample, deliveryClaims } of records) {
    const supported = new Map<string, boolean>();
    for (const claim of deliveryClaims) if (claim.counted) {
      supported.set(claim.request, supported.get(claim.request) === true || claim.responses.every((key) => !reused.has(key)));
    }
    if ([...supported.values()].some((stillSupported) => !stillSupported)) {
      sample.counts.owner_questions = null;
      sample.counts.failed_only_owner_requests = null;
      sample.limits.push(deliveryReuseUnconfirmed);
      sample.limits.push("도달 신고 관측에는 보류된 증빙이 남아 있으며 고유 도달 하한은 추가 확인이 필요하다");
    }
  }
}
/** Aggregate actual distinct closed sample records, never a caller-supplied N. */
function aggregateGroup(group: SampleGroup): Sample {
  const samples = group.records.map(({ sample }) => sample), first = samples[0]!;
  if (!group.bundled) return first;
  let partialObservations = false;
  const sum = (field: "counts" | "observed") => Object.fromEntries(metrics.map((key) => {
    const known = samples.map((s) => s[field][key]).filter((n): n is number => n != null);
    const incomplete = known.length !== samples.length;
    if (!known.length || field === "counts" && incomplete) return [key, null];
    if (incomplete) partialObservations = true;
    const total = known.reduce((n, value) => n + value, 0);
    if (!Number.isSafeInteger(total)) throw new HandoffError("표본 합계 정수 범위 초과");
    return [key, total];
  }));
  const chronological = samples.filter((s) => s.period?.start).sort((a, b) => Date.parse(a.period!.start!) - Date.parse(b.period!.start!));
  for (let i = 1; i < chronological.length; i++) if (Date.parse(chronological[i]!.period!.start!) <= Date.parse(chronological[i - 1]!.period!.end)) throw new HandoffError("겹치는 측정 구간을 독립 표본으로 셀 수 없다");
  const closed = samples.every((s) => s.period?.closed && s.period.start);
  const counts = sum("counts"), observed = sum("observed");
  return { ...first, qualitySamples: samples.flatMap((s) => s.qualitySamples), auditedBlockingPresent: samples.some((sample) => sample.auditedBlockingPresent), origin: samples.every((s) => s.origin === first.origin) ? first.origin : "mixed-reported", context: { ...first.context, sampleCount: samples.length }, period: closed ? { ...first.period!, start: chronological[0]!.period!.start, end: chronological.at(-1)!.period!.end, closed: true } : null, counts, observed, unknownRequests: samples.some((s) => s.unknownRequests === null) ? null : samples.reduce((n, s) => n + s.unknownRequests!, 0), sampleCountActual: samples.length, intervals: samples.flatMap((s) => s.intervals), limits: [...new Set(samples.flatMap((s) => s.limits)), ...(partialObservations ? ["일부 표본의 관측 미수집: 관측 합계는 알려진 하한"] : []), "N은 서로 겹치지 않는 명시 표본 기록 수이며 표본 자체의 실제성은 신고/현장 감사 대상"] };
}
function compareTeamRaw(beforePath: string, afterPath: string, kind: string, beforeContext?: string, afterContext?: string) {
  if (!Object.hasOwn(pairs, kind)) throw new HandoffError("비교 목적: role-automation|team-adoption|definition-change");
  const inputs = new InputSnapshot();
  const receipts = new TeamReceiptReads();
  const beforeGroup = readGroup(receipts, beforePath, beforeContext, inputs), afterGroup = readGroup(receipts, afterPath, afterContext, inputs), study = kind as Study;
  receipts.assertStable();
  // Even a tolerant nested reader cannot turn a changed proof back into a valid snapshot.
  void inputs.files;
  if (beforeGroup.records[0]!.sample.repository === afterGroup.records[0]!.sample.repository) {
    holdReusedDelivery([...beforeGroup.records, ...afterGroup.records]);
  } else {
    holdReusedDelivery(beforeGroup.records);
    holdReusedDelivery(afterGroup.records);
  }
  const before = aggregateGroup(beforeGroup), after = aggregateGroup(afterGroup);
  for (const [s, condition] of [[before, pairs[study][0]], [after, pairs[study][1]]] as const) {
    if (s.context.study !== undefined && s.context.study !== study || s.context.conditionCode !== undefined && s.context.conditionCode !== condition) throw new HandoffError("비교 목적/전후 조건 불일치: 정의 수정을 도입 효과로 바꿀 수 없다");
  }
  const reasons: string[] = [];
  for (const [s, label] of [[before, "before"], [after, "after"]] as const) {
    for (const key of ["study", "conditionCode", "definition", "unit", "workType", "sizeBand", "host", "sampleCount", "recordingBoundary", "qualitySource", "qualityScopeHash"] as const) if (s.context[key] === undefined) reasons.push(`${label}: ${key} 미확인`);
    if (!s.period?.closed || !s.period.start) reasons.push(`${label}: 닫힌 비교 구간 미확인`);
    for (const limit of [completionProofUnconfirmed, requestCoverageUnconfirmed, deliveryReuseUnconfirmed]) {
      if (s.limits.includes(limit)) reasons.push(`${label}: ${limit}`);
    }
    if (s.limits.some((limit) => limit.startsWith(representativeScopeUnconfirmed))) reasons.push(`${label}: ${representativeScopeUnconfirmed}`);
    if (s.sampleCountActual < 2) reasons.push(`${label}: 표본 2건 미만(통계적 입증 기준 아님)`);
    if (s.unknownRequests !== 0) reasons.push(`${label}: 요청 도달 누락/미수집`);
  }
  const sameRepository = before.repository === after.repository;
  const failedOnlyUnknown = before.counts.failed_only_owner_requests !== 0 || after.counts.failed_only_owner_requests !== 0;
  if (failedOnlyUnknown) reasons.push("실패만 남은 owner 요청이 있거나 해결 여부 미수집: 도달 감소를 부담 개선으로 해석하지 않음");
  const originMismatch = before.origin !== after.origin || before.origin === "mixed-reported";
  const variableQuality = new Set([...before.qualitySamples, ...after.qualitySamples].map((s) => JSON.stringify(s))).size > 1;
  if (originMismatch) reasons.push("수집 출처/경로 불일치 또는 혼재: 완료 영수증으로 수집 동등성을 확인하지 않음");
  if (variableQuality) reasons.push("표본별 품질 변동: 대응 표본 정의 없이 합계 상쇄를 안정으로 해석하지 않음");
  if (before.sampleCountActual !== after.sampleCountActual) reasons.push("전후 표본 수 불일치: 합계 증감으로 부담 방향을 판정하지 않음");
  if (sameRepository && before.intervals.some((b) => b.start && after.intervals.some((a) => a.start && Date.parse(b.start!) <= Date.parse(a.end) && Date.parse(a.start!) <= Date.parse(b.end)))) reasons.push("전후 측정 구간 중복/공유 경계: 같은 사건의 중복 집계 가능");
  if (sameRepository && before.intervals.length && after.intervals.length && Math.max(...before.intervals.map((p) => Date.parse(p.end))) >= Math.min(...after.intervals.map((p) => p.start ? Date.parse(p.start) : -Infinity))) reasons.push("전후 순서 불일치: before 모든 구간이 after보다 앞서야 한다");
  if (!sameRepository) reasons.push("서로 다른 저장소: 안전한 직접 증감 비교 불가");
  for (const key of ["definition", "unit", "workType", "sizeBand", "host", "recordingBoundary", "qualitySource", "qualityScopeHash"] as const) if (before.context[key] !== after.context[key]) reasons.push(`${key} 불일치`);
  const rows = metrics.map((key) => {
    const b = before.counts[key] ?? null, a = after.counts[key] ?? null;
    return { metric: key, before: b, after: a, delta: sameRepository && a !== null && b !== null ? a - b : null, beforeObserved: before.observed[key] ?? null, afterObserved: after.observed[key] ?? null };
  });
  for (const key of [...burden, "blocking_sum", "blocking_sum_stats_events", ...(before.auditedBlockingPresent || after.auditedBlockingPresent || before.context.qualitySource === "audited-verdicts" ? ["blocking_sum_audited"] : []), "rereviews_after_fail", "review_failures", "should_fix_sum_stats_events", "gate_failures"]) {
    const r = rows.find((row) => row.metric === key)!;
    if (r.delta === null) reasons.push(`${key}: 비교 총량 미확인`);
    else if (!burden.includes(key) && r.delta !== 0) reasons.push(`${key}: 품질 지표 변화는 자동 개선/악화로 해석하지 않음`);
  }
  if (failedOnlyUnknown) { before.limits = [...before.limits, "추가 표본: 실패만 남은 owner 요청을 해결하고 같은 구간의 결과를 확인한다"]; }
  const changes = rows.filter((r) => burden.includes(r.metric)).map((r) => r.delta);
  const improved = changes.some((n) => n !== null && n < 0), worsened = changes.some((n) => n !== null && n > 0);
  const conclusion = reasons.length || improved && worsened ? "unknown" : improved ? "observed-burden-improvement" : worsened ? "observed-burden-worsening" : "unknown";
  if (!improved && !worsened) reasons.push("부담 지표 동률: 효과 방향 미확인");
  if (improved && worsened) reasons.push("부담 지표의 증감 방향 혼재");
  return { version: 1, study, conclusion, reasons, additionalSamplePlan: [before.context.additionalSamplePlanRef ?? "before: 같은 업무·크기·호스트에서 누락 없는 닫힌 표본을 추가 수집", after.context.additionalSamplePlanRef ?? "after: 같은 업무·크기·호스트에서 누락 없는 닫힌 표본을 추가 수집", ...(originMismatch ? ["수집 경로를 통일한 표본을 확보하고 출처·수집 정의를 대조한다"] : []), ...(variableQuality ? ["표본별 품질을 대조한다. 대응 관계/품질 동등성의 별도 정의 전에는 현재 변동 표본의 방향을 보류한다"] : [])], rows, sources: { before, after }, limits: ["관측 부담 변화이며 팀의 인과 효과/에이전트 순위가 아니다", ...before.limits, ...after.limits] };
}
export function compareTeam(beforePath: string, afterPath: string, kind: string, beforeContext?: string, afterContext?: string) {
  try { return compareTeamRaw(beforePath, afterPath, kind, beforeContext, afterContext); }
  catch (e) { if (e instanceof HandoffError) throw e; if (e instanceof InputSnapshotError) throw new HandoffError(e.message); throw new HandoffError("비교 metadata 파일 누락/종류/읽기 오류"); }
}
export function formatTeamComparison(r: ReturnType<typeof compareTeam>): string {
  return [`# 팀 비교: ${r.study}`, "", `판정: ${r.conclusion}`, "", `입력 출처: 전 ${r.sources.before.origin} / 후 ${r.sources.after.origin} (직렬화된 신고 출처이며 인증 아님)`, "", "| 지표 | 전 | 후 | 증감 | 전 관측 | 후 관측 |", "|---|---|---|---|---|---|", ...r.rows.map((m) => `| ${m.metric} | ${m.before ?? "미확인"} | ${m.after ?? "미확인"} | ${m.delta ?? "미확인"} | ${m.beforeObserved ?? "미확인"} | ${m.afterObserved ?? "미확인"} |`), "", ...r.reasons.map((s) => `- 이유: ${s}`), ...r.additionalSamplePlan.map((s) => `- 추가 표본 계획: ${s}`), ...r.limits.map((s) => `- 한계: ${s}`)].join("\n");
}
