import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

/** CRLF만 LF로 정규화하고 상태 값을 제외한다. 나머지 문자는 그대로다. */
export function reviewHash(task: string): string {
  return createHash('sha256').update(task.replace(/\r\n/g, '\n').replace(/^- 상태: .+$/m, '- 상태:')).digest('hex');
}

function safeFile(dir: string, path: string): boolean {
  if (isAbsolute(path) || path.includes('\\') || path.split('/').some(p => !p || p === '.' || p === '..')) return false;
  let current = dir;
  try {
    for (const part of path.split('/')) {
      current = join(current, part);
      if (lstatSync(current).isSymbolicLink()) return false;
    }
    return lstatSync(current).isFile() && lstatSync(current).size > 0;
  } catch { return false; }
}

export function reviewIssues(dir: string, task: string): string[] {
  const markers = [...task.matchAll(/^- 사전 검토:([^\r\n]*)\r?$/gm)];
  const marker = markers[0]?.[1]?.trim();
  const file = join(dir, 'PRE-REVIEW.json');
  let present = false;
  try { lstatSync(file); present = true; } catch { /* 기록 없음 */ }
  if (markers.length === 0 && !present) return [];
  const bad = (reason: string) => [`사전 검토: ${reason}`];
  if (markers.length !== 1 || marker !== 'v1') return bad('마커가 없거나 지원하지 않는 버전');
  if (!safeFile(dir, 'PRE-REVIEW.json')) return bad('기록 파일이 없거나 안전하지 않다');
  let data: unknown;
  try { data = JSON.parse(readFileSync(file, 'utf8')); } catch { return bad('기록 JSON이 잘못됐다'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return bad('기록 형식 오류');
  const record = data as Record<string, unknown>;
  if (record.version !== 1 || (typeof record.author !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(record.author)) || !Array.isArray(record.attempts) || !record.attempts.length) return bad('버전·작성자·시도 오류');
  const attempts = record.attempts as Record<string, unknown>[];
  for (let i = 0; i < attempts.length; i++) {
    const a = attempts[i];
    if (!a || typeof a !== 'object' || (typeof a.provider !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(a.provider)) || a.cross !== (a.provider !== record.author) || (typeof a.status !== 'string' || !['pass', 'fail', 'unavailable'].includes(a.status)) || !Number.isInteger(a.blocking) || Number(a.blocking) < 0 || typeof a.hash !== 'string' || !/^[a-f0-9]{64}$/.test(a.hash) || typeof a.evidence !== 'string' || !safeFile(dir, a.evidence) || (typeof a.continuity !== 'string' || !['new', 'same', 'changed'].includes(a.continuity)) || (a.continuity === 'changed' && (typeof a.reason !== 'string' || !a.reason.trim()))) return bad(`시도 ${i + 1} 형식 또는 증거 오류`);
    if (attempts.slice(0, i).some(p => p.status === 'fail') && a.status === 'pass' && a.continuity === 'new') return bad('실패 뒤 재검토 연속성이 없다');
    if (a.status === 'pass' && a.blocking !== 0) return bad('pass 판정에 blocking이 있다');
    if (a.status === 'unavailable' && (typeof a.reason !== 'string' || !a.reason.trim())) return bad('실행 불가 이유가 없다');
    if (!a.cross && attempts.slice(0, i).some(p => p.cross === true && p.status === 'fail' && p.hash === a.hash)) return bad('교차 검토 실패를 같은 제공자 대체로 해소할 수 없다');
    if (!a.cross && !attempts.slice(0, i).some(p => p.cross === true && p.status === 'unavailable' && p.hash === a.hash && typeof p.reason === 'string' && p.reason.trim())) return bad('같은 제공자 대체의 실패 근거가 없다');
  }
  const last = attempts.at(-1)!;
  if (record.waiver !== undefined) return waiverIssues(dir, task, record.waiver, attempts).map((r) => `사전 검토: ${r}`);
  if (last.status !== 'pass' || last.blocking !== 0 || last.hash !== reviewHash(task)) return bad('최종 판정·blocking 또는 TASK 해시 불일치');
  return [];
}

/**
 * 사용자 게이트 예외: 실행된 검토가 pass에 이르지 못했을 때 사용자가 명시적으로 진행을 승인한 기록.
 * 검토 이력은 그대로 두고(pass로 위장하지 않는다), 현재 TASK 해시·사용자 결정 근거 파일·사유·날짜에 묶는다.
 * 실행된 검토(pass·fail) 없이 쓸 수 없고, 마지막 시도가 pass면 예외가 필요 없으므로 거부한다.
 */
function waiverIssues(dir: string, task: string, raw: unknown, attempts: Record<string, unknown>[]): string[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ['게이트 예외 형식 오류'];
  const w = raw as Record<string, unknown>;
  if (w.by !== 'user') return ['게이트 예외는 사용자 결정만 허용한다(by: "user")'];
  if (typeof w.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(w.date)) return ['게이트 예외 날짜(YYYY-MM-DD)가 없다'];
  if (typeof w.reason !== 'string' || !w.reason.trim()) return ['게이트 예외 사유가 없다'];
  if (typeof w.evidence !== 'string' || !safeFile(dir, w.evidence)) return ['게이트 예외 근거 파일(사용자 결정 원문)이 없거나 안전하지 않다'];
  if (w.hash !== reviewHash(task)) return ['게이트 예외의 TASK 해시가 현재 TASK와 다르다'];
  if (!attempts.some((a) => a.status === 'pass' || a.status === 'fail')) return ['실행된 검토 없이 게이트 예외를 쓸 수 없다'];
  if (attempts.at(-1)!.status === 'pass') return ['마지막 검토가 pass라 게이트 예외가 필요 없다'];
  return [];
}
