import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { LEDGER_FILE, parseLedger, textHash, type ReviewEntry } from '../agent/review-log.ts';
import { matchingCriteria } from '../agent/review-criteria.ts';
import { assessStructuredReview } from '../agent/structured-review.ts';
import { isReviewText, matchesPermissionBasis, parseGrantedPermission, permittedTaskDiff, samePermission, taskFileMode, type ApprovedTaskEdit, type ReviewPermission } from './review-permission.ts';

/** 명시적 표지만으로 호환 경계를 정한다. 절 누락을 옛 형식으로 오인하지 않는다. */
export function taskFormat(task: string): 'legacy' | 'v2' | 'invalid' {
  const header = visibleMarkdown(task).split(/^## /m)[0]!;
  const markers = [...header.matchAll(/^- TASK 형식:([^\n]*)$/gm)];
  if (!markers.length) return 'legacy';
  return markers.length === 1 && markers[0]![1]!.trim() === 'v2' ? 'v2' : 'invalid';
}

/** 주석과 fenced 예제는 실제 문서 필드가 아니다. 완전한 Markdown 의미 판독은 reviewer 책임이다. */
function visibleMarkdown(task: string): string {
  let fence: string | undefined;
  let comment = false;
  return task.replace(/\r\n/g, '\n').split('\n').map(line => {
    if (fence) {
      const mark = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
      if (mark && mark[0] === fence[0] && mark.length >= fence.length && line.trim() === mark) fence = undefined;
      return '';
    }
    if (comment) {
      const end = line.indexOf('-->');
      if (end < 0) return '';
      line = line.slice(end + 3);
      comment = false;
    }
    line = line.replace(/(`+)(.*?)\1/g, span => span.replaceAll('<!--', '&lt;!--'));
    while (line.includes('<!--')) {
      const start = line.indexOf('<!--'), end = line.indexOf('-->', start + 4);
      if (end < 0) { line = line.slice(0, start); comment = true; break; }
      line = line.slice(0, start) + line.slice(end + 3);
    }
    const mark = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (mark) { fence = mark; return ''; }
    return line;
  }).join('\n');
}

export function proofScopeIssues(task: string): string[] {
  const format = taskFormat(task);
  if (format === 'legacy') return [];
  if (format === 'invalid') return ['TASK 형식: 중복 또는 지원하지 않는 버전'];
  const visible = visibleMarkdown(task);
  const sections = [...visible.matchAll(/^## 증명 범위[ \t]*\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)];
  if (sections.length !== 1) return ['증명 범위: 절 누락 또는 중복'];
  const body = sections[0]![1]!.trim();
  if (!body) return ['증명 범위: 빈 절'];
  if (!/^- 판정 주체:[ \t]*\S[^\n]*$/m.test(body)) return ['증명 범위: 판정 주체 누락 또는 빈 값'];
  return [];
}

/** CRLF만 LF로 정규화하고 상태 값을 제외한다. 나머지 문자는 그대로다. */
export function reviewHash(task: string): string {
  return createHash('sha256').update(task.replace(/\r\n/g, '\n').replace(/^- 상태: .+$/m, '- 상태:')).digest('hex');
}

function safeReviewPath(path: string): boolean {
  return !isAbsolute(path) && !path.includes('\\') && path.split('/').every(part => !!part && part !== '.' && part !== '..');
}

export function safeReviewFile(dir: string, path: string): boolean {
  let current = dir;
  try {
    if (!lstatSync(current).isDirectory()) return false;
    for (const part of path.split('/')) {
      current = join(current, part);
      if (lstatSync(current).isSymbolicLink()) return false;
    }
    return lstatSync(current).isFile() && lstatSync(current).size > 0;
  } catch { return false; }
}

export interface ReviewCandidate {
  hasEntry(path: string): boolean;
  hasProof(path: string): boolean;
  readText(path: string): string | null;
  taskMode?(path: string): string | null;
  records?(): string[];
}

export interface PermissionCheck {
  required?: boolean;
  checkScope?: (permission: ReviewPermission) => string[];
  edit?: ApprovedTaskEdit;
}

export function workingReview(dir: string): ReviewCandidate {
  return {
    hasEntry(path) { try { lstatSync(join(dir, path)); return true; } catch { return false; } },
    hasProof: (path) => safeReviewFile(dir, path),
    readText: (path) => safeReviewFile(dir, path) ? readFileSync(join(dir, path), 'utf8') : null,
    taskMode: (path) => safeReviewFile(dir, path) ? taskFileMode(join(dir, path)) : null,
    records() {
      const folder = join(dir, 'review-records');
      try { return lstatSync(folder).isDirectory() ? readdirSync(folder).filter((name) => /^R\d+\.json$/.test(name)).map((name) => `review-records/${name}`) : []; }
      catch { return []; }
    },
  };
}

function archivedPermissionMarker(candidate: ReviewCandidate, path: string): boolean {
  const raw = candidate.readText(path);
  if (raw === null) return false;
  try {
    const review = JSON.parse(raw)?.review;
    return review?.target === 'TASK.md' && (review.permission_basis !== undefined || review.permission !== undefined);
  } catch {
    return false;
  }
}

/** A separate format row makes dropping a copied permission distinguishable from an older review. */
export function hasPermissionReview(candidate: ReviewCandidate): boolean {
  try {
    if (candidate.hasEntry(LEDGER_FILE)) {
      const raw = candidate.readText(LEDGER_FILE);
      if (raw === null || parseLedger(raw).some((row) => row.target === 'TASK.md' && (row.type === 'format' || row.type === 'review') &&
          (row.permission_basis !== undefined || (row.type === 'review' && row.permission !== undefined)))) return true;
    }
    return candidate.records?.().some((path) => archivedPermissionMarker(candidate, path)) ?? false;
  } catch {
    return true;
  }
}

function taskReviews(candidate: ReviewCandidate) {
  const ledger = parseLedger(candidate.readText(LEDGER_FILE) ?? '');
  const voided = new Set(ledger.flatMap((row) => row.type === 'void' && row.target === 'TASK.md' ? [row.record] : []));
  const reviews = ledger.filter((row): row is ReviewEntry => row.type === 'review' && row.target === 'TASK.md' &&
    !voided.has(row.record) && !row.interrupted && row.verdict !== 'unknown' && row.followup?.type !== 'confirmation');
  return { ledger, reviews };
}

function reviewMatches(last: Record<string, unknown>, current: ReviewEntry | undefined): current is ReviewEntry {
  return !!current && current.record === last.evidence && current.hash === last.hash && current.verdict === last.status &&
    current.provider === last.provider && (current.cross === undefined || current.cross === last.cross);
}

function archivedReview(current: ReviewEntry, candidate: ReviewCandidate) {
  if (!candidate.hasProof(current.record)) return null;
  const record = JSON.parse(candidate.readText(current.record) ?? '');
  const snapshot = record?.review?.snapshot;
  const result = record?.result?.text;
  if (typeof snapshot !== 'string' || !isReviewText(snapshot) || reviewHash(snapshot) !== current.hash || typeof result !== 'string' ||
      textHash(result) !== current.result_hash || record.review.target !== current.target || record.review.hash !== current.hash ||
      record.review.verdict !== current.verdict || (current.cross !== undefined && record.cross !== current.cross) ||
      record.result.provider?.value !== current.provider) return null;
  return { snapshot, result, review: record.review };
}

function verifiedPermission(current: ReviewEntry, candidate: ReviewCandidate, ledger: ReturnType<typeof parseLedger>) {
  const permission = parseGrantedPermission(current.permission);
  if (!permission || current.structured_stage !== 'pre' || current.verdict !== 'pass' || current.cross === undefined) return null;
  const formats = ledger.filter((row) => row.type === 'format' && row.target === current.target && row.record === current.record);
  const stamp = formats[0];
  if (formats.length !== 1 || stamp?.type !== 'format' || stamp.hash !== current.hash ||
      !matchingCriteria(stamp.required_criteria, current.required_criteria) ||
      !matchesPermissionBasis(stamp.permission_basis, current.permission_basis) ||
      !matchesPermissionBasis(stamp.permission_basis, permission)) return null;
  const record = archivedReview(current, candidate);
  const archived = parseGrantedPermission(record?.review.permission);
  if (!record || !matchingCriteria(stamp.required_criteria, record.review.required_criteria) ||
      !matchesPermissionBasis(stamp.permission_basis, record.review.permission_basis) ||
      !archived || !samePermission(archived, permission)) return null;
  const { snapshot, result } = record;
  const assessment = assessStructuredReview('pre', result, stamp.required_criteria, snapshot.split('\n').length);
  if (assessment.verdict !== 'pass' || !assessment.permission ||
      !samePermission({ ...permission, ...assessment.permission }, permission)) return null;
  return { permission, snapshot, findings: assessment.findings };
}

export function reviewIssues(dir: string, task: string, candidate = workingReview(dir), gate: PermissionCheck = {}): string[] {
  const scopeIssues = proofScopeIssues(task);
  if (scopeIssues.length) return scopeIssues;
  const markers = [...task.matchAll(/^- 사전 검토:([^\r\n]*)\r?$/gm)];
  const marker = markers[0]?.[1]?.trim();
  const name = 'PRE-REVIEW.json';
  const canReadProof = (path: string) => safeReviewPath(path) && candidate.hasProof(path);
  const required = gate.required || hasPermissionReview(candidate);
  if (!required && markers.length === 0 && !candidate.hasEntry(name)) return [];
  const bad = (reason: string) => [`사전 검토: ${reason}`];
  if (markers.length !== 1 || marker !== 'v1') return bad('마커가 없거나 지원하지 않는 버전');
  if (!canReadProof(name)) return bad('기록 파일이 없거나 안전하지 않다');
  let data: unknown;
  try { data = JSON.parse(candidate.readText(name) ?? ''); } catch { return bad('기록 JSON이 잘못됐다'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return bad('기록 형식 오류');
  const record = data as Record<string, unknown>;
  if (record.version !== 1 || (typeof record.author !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(record.author)) || !Array.isArray(record.attempts) || !record.attempts.length) return bad('버전·작성자·시도 오류');
  const attempts = record.attempts as Record<string, unknown>[];
  for (let i = 0; i < attempts.length; i++) {
    const a = attempts[i];
    if (!a || typeof a !== 'object' || (typeof a.provider !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(a.provider)) || a.cross !== (a.provider !== record.author) || (typeof a.status !== 'string' || !['pass', 'fail', 'unavailable'].includes(a.status)) || !Number.isInteger(a.blocking) || Number(a.blocking) < 0 || typeof a.hash !== 'string' || !/^[a-f0-9]{64}$/.test(a.hash) || typeof a.evidence !== 'string' || !canReadProof(a.evidence) || (typeof a.continuity !== 'string' || !['new', 'same', 'changed'].includes(a.continuity)) || (a.continuity === 'changed' && (typeof a.reason !== 'string' || !a.reason.trim()))) return bad(`시도 ${i + 1} 형식 또는 증거 오류`);
    if (attempts.slice(0, i).some(p => p.status === 'fail') && a.status === 'pass' && a.continuity === 'new') return bad('실패 뒤 재검토 연속성이 없다');
    if (a.status === 'pass' && a.blocking !== 0) return bad('pass 판정에 blocking이 있다');
    if (a.status === 'unavailable' && (typeof a.reason !== 'string' || !a.reason.trim())) return bad('실행 불가 이유가 없다');
    if (!a.cross && attempts.slice(0, i).some(p => p.cross === true && p.status === 'fail' && p.hash === a.hash)) return bad('교차 검토 실패를 같은 제공자 대체로 해소할 수 없다');
    if (!a.cross && !attempts.slice(0, i).some(p => p.cross === true && p.status === 'unavailable' && p.hash === a.hash && typeof p.reason === 'string' && p.reason.trim())) return bad('같은 제공자 대체의 실패 근거가 없다');
  }
  const last = attempts.at(-1)!;
  if (record.waiver !== undefined) {
    const waiver = waiverIssues(task, record.waiver, attempts, canReadProof);
    if (!required || waiver.length) return waiver.map((r) => `사전 검토: ${r}`);
    // A user may waive a failed review. It does not erase a previously recorded permission.
    try {
      const { ledger, reviews } = taskReviews(candidate);
      const current = reviews.at(-1);
      if (!reviewMatches(last, current) || current.verdict !== 'fail') {
        return bad('사용자 예외의 최신 실패 원장·원문을 확인할 수 없다. 미확인 판정은 관측을 보완하고 다시 판정한다');
      }
      const failed = archivedReview(current, candidate);
      if (!failed || (current.structured_stage === 'pre' && assessStructuredReview('pre', failed.result, current.required_criteria,
        current.permission_basis ? failed.snapshot.split('\n').length : undefined).verdict !== 'fail')) {
        return bad('사용자 예외의 실패 판정 원문을 확인할 수 없다');
      }
      const prior = reviews.findLast((row) => row.verdict === 'pass' && (row.permission_basis !== undefined || row.permission !== undefined ||
        ledger.some((stamp) => stamp.type === 'format' && stamp.record === row.record && stamp.permission_basis !== undefined) ||
        archivedPermissionMarker(candidate, row.record)));
      if (!prior) return [];
      const verified = verifiedPermission(prior, candidate, ledger);
      if (!verified || candidate.taskMode?.('TASK.md') !== verified.permission.task_mode || !isReviewText(task)) {
        return bad('사용자 예외에 앞선 허가 범위 원문을 확인할 수 없다');
      }
      return (gate.checkScope?.(verified.permission) ?? []).flatMap((issue) =>
        bad(`${issue} · 사용자 예외는 앞선 허가 범위를 넓히지 않는다 · 범위 재검토 필요`));
    } catch { return bad('사용자 예외의 검토 원장을 확인할 수 없다'); }
  }
  if (required || attempts.some((attempt) => attempt.permission !== undefined)) {
    const scope = (reason: string) => bad(`${reason} · 범위 재검토 필요`);
    if (last.status !== 'pass') return scope('최종 허가 pass가 없다');
    const copied = parseGrantedPermission(last.permission);
    if (!copied) return scope('최신 사전 검토 결과의 review.permission을 PRE-REVIEW 최종 시도에 기록한다');
    let verified: ReturnType<typeof verifiedPermission>;
    try {
      const { ledger, reviews } = taskReviews(candidate);
      const current = reviews.at(-1);
      verified = reviewMatches(last, current) ? verifiedPermission(current, candidate, ledger) : null;
    }
    catch { return scope('허가 원문 또는 원장을 확인할 수 없다'); }
    if (!verified || !samePermission(verified.permission, copied)) return scope('허가 범위가 최신 검토 원장·검토 원문과 맞지 않는다');
    const { permission, snapshot, findings } = verified;
    if (candidate.taskMode?.('TASK.md') !== permission.task_mode) return scope('검토 대상이 일반 파일이 아니거나 파일 모드가 달라졌다');
    const scopeIssues = gate.checkScope?.(permission) ?? [];
    if (scopeIssues.length) return scopeIssues.flatMap(scope);
    if (!isReviewText(task)) return scope('검토 대상이 UTF-8 텍스트로 확인되지 않는다');
    const current_hash = reviewHash(task);
    if (last.hash !== current_hash) {
      const diff = permittedTaskDiff(snapshot, task, permission, findings);
      if (!diff) return scope('TASK 해시가 다르고 허가된 줄의 수정으로 확인할 수 없다');
      gate.edit = { original_hash: String(last.hash), current_hash, diff };
    }
    return [];
  }
  if (last.status !== 'pass' || last.blocking !== 0 || last.hash !== reviewHash(task)) return bad('최종 판정·blocking 또는 TASK 해시 불일치');
  return [];
}

/**
 * 사용자 게이트 예외: 실행된 검토가 pass에 이르지 못했을 때 사용자가 명시적으로 진행을 승인한 기록.
 * 검토 이력은 그대로 두고(pass로 위장하지 않는다), 현재 TASK 해시·사용자 결정 근거 파일·사유·날짜에 묶는다.
 * 실행된 검토(pass·fail) 없이 쓸 수 없고, 마지막 시도가 pass면 예외가 필요 없으므로 거부한다.
 */
function waiverIssues(task: string, raw: unknown, attempts: Record<string, unknown>[], canReadProof: (path: string) => boolean): string[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ['게이트 예외 형식 오류'];
  const w = raw as Record<string, unknown>;
  if (w.by !== 'user') return ['게이트 예외는 사용자 결정만 허용한다(by: "user")'];
  if (typeof w.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(w.date)) return ['게이트 예외 날짜(YYYY-MM-DD)가 없다'];
  if (typeof w.reason !== 'string' || !w.reason.trim()) return ['게이트 예외 사유가 없다'];
  if (typeof w.evidence !== 'string' || !canReadProof(w.evidence)) return ['게이트 예외 근거 파일(사용자 결정 원문)이 없거나 안전하지 않다'];
  if (w.hash !== reviewHash(task)) return ['게이트 예외의 TASK 해시가 현재 TASK와 다르다'];
  if (!attempts.some((a) => a.status === 'pass' || a.status === 'fail')) return ['실행된 검토 없이 게이트 예외를 쓸 수 없다'];
  if (attempts.at(-1)!.status === 'pass') return ['마지막 검토가 pass라 게이트 예외가 필요 없다'];
  return [];
}
