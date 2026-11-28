import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tempDir } from './helpers.ts';
import { proofScopeIssues, reviewerLineIssues, reviewIssues, reviewHash, taskFormat } from '../src/project/pre-review.ts';

test('v2 증명 범위는 검토 기록보다 먼저 검사하고 옛 TASK는 호환한다', () => {
  const dir = tempDir('pace-proof-');
  const marker = '- TASK 형식: v2\n';
  const scope = '## 증명 범위\n\n- 판정 주체: 자동 테스트\n- 구현 후 reviewer: 필요 — 시험 고정본\n- 포함: 호환 검사\n- 범위 밖: 운영 측정은 설치 뒤\n\n## 기준\nT-1\n';
  const valid = marker + scope;
  assert.deepEqual(reviewIssues(dir, '## 목적\n옛 TASK\n'), []);
  assert.deepEqual(reviewIssues(dir, valid), []);
  assert.deepEqual(reviewIssues(dir, valid.replaceAll('\n', '\r\n')), []);
  for (const [text, expected] of [
    [marker + '## 기준\nT-1\n', /절 누락/],
    [marker + '## 증명 범위\n<!-- 안내 -->\n## 기준\nT-1\n', /빈 절/],
    [marker + scope.replace('- 판정 주체: 자동 테스트\n', ''), /판정 주체/],
    [marker + scope.replace('자동 테스트', '<!-- 선택 -->'), /판정 주체/],
    [valid.replace('v2', 'v3'), /지원하지 않는/],
    [marker + valid, /중복/],
  ] as const) assert.match(reviewIssues(dir, text).join(), expected);
  assert.equal(taskFormat(scope), 'legacy');
  assert.equal(taskFormat(valid), 'v2');
  assert.equal(taskFormat(valid.replace('v2', 'v 2')), 'invalid');
  assert.equal(taskFormat('<!--\n' + marker + '-->\n## 목적\n옛 형식'), 'legacy');
  assert.equal(taskFormat('```md\n' + marker + '```\n## 목적\n옛 형식'), 'legacy');
  assert.equal(taskFormat('## 예시\n' + marker), 'legacy');
  assert.match(reviewIssues(dir, marker + '```md\n' + scope + '```\n').join(), /절 누락/);
  assert.deepEqual(reviewIssues(dir, marker + '```html\n<!--\n```\n' + scope + '\n<!-- 안내 -->\n'), []);
  assert.deepEqual(reviewIssues(dir, marker + '<!--\n```\n-->\n' + scope), []);
  assert.deepEqual(reviewIssues(dir, marker + '## 재료\n인라인 예제 `<!--` 설명\n' + scope + '\n<!-- 안내 -->\n'), []);
  // 유효한 이력이 있어도 구조를 생략할 수 없다.
  const missing = marker + '## 목적\n옮기기\n';
  writeFileSync(join(dir, 'evidence.md'), '독립 검토');
  writeFileSync(join(dir, 'PRE-REVIEW.json'), JSON.stringify({ version: 1, author: 'openai', attempts: [{ hash: reviewHash(missing), provider: 'anthropic', cross: true, status: 'pass', blocking: 0, evidence: 'evidence.md', continuity: 'new' }] }));
  assert.match(reviewIssues(dir, missing).join(), /절 누락/);
});

test('P017 T01 S-2: 구현 후 reviewer 줄은 증명 범위 안 정확히 한 줄의 필요·생략 — 이유다', () => {
  const dir = tempDir('pace-reviewer-line-');
  const marker = '- TASK 형식: v2\n';
  const line = '- 구현 후 reviewer: 필요 — 허가 분기가 바뀐다\n';
  const scope = (body: string) => marker + '## 증명 범위\n- 판정 주체: 자동 테스트\n' + body + '- 포함: 게이트\n\n## 기준\nT-1\n';
  const issues = (text: string) => ({ line: reviewerLineIssues(text), gate: reviewIssues(dir, text) });
  for (const [text, expected] of [
    [scope(''), /줄 누락/],
    [scope(line + line), /줄 중복/],
    [scope('- 구현 후 reviewer: 아마 — 모른다\n'), /필요 또는 생략/],
    [scope('- 구현 후 reviewer: 필수 — 이유\n'), /필요 또는 생략/],
    [scope('- 구현 후 reviewer: 필요\n'), /이유 누락/],
    [scope('- 구현 후 reviewer: 생략 —   \n'), /이유 누락/],
    [scope('- 구현 후 reviewer: <!-- 필요 — 이유 | 생략 — 이유 -->\n'), /주석이 섞였다/],
    [scope('<!--\n' + line + '-->\n'), /줄 누락/],
    [scope('```\n' + line + '```\n'), /줄 누락/],
    [scope(line) + '## 접근\n' + line, /절 밖/],
    // 경계: 정본 머리가 아닌 변형 줄 단독은 필드가 아니므로 누락이다(의미 판독은 사전 reviewer 몫, D3).
    [scope('* 구현 후 reviewer: 필요 — 이유\n'), /줄 누락/],
    // 원문 줄 동일성(상위 검토 슬롯 2): 주석 제거로만 생긴 머리는 세지 않고, 줄 안 주석은 형식 문제다.
    [scope('<!-- 예시 -->- 구현 후 reviewer: 생략 — 문구만\n'), /줄 누락/],
    [scope('- 구현 후 revi<!-- 예시 -->ewer: 생략 — 문구만\n'), /줄 누락/],
    [scope('- 구현 후 reviewer: 생<!-- 설명 -->략 — 이유\n'), /주석이 섞였다/],
    [scope('- 구현 후 reviewer: 필요 — <!-- 이유 -->\n'), /주석이 섞였다/],
  ] as const) {
    const found = issues(text);
    assert.match(found.line.join(), expected, text);
    assert.deepEqual(found.gate, found.line, text);
  }
  for (const text of [scope(line), scope('- 구현 후 reviewer: 생략 — 문구만 바뀐다\n'), scope('- 구현 후 reviewer:필요-이유\n'),
    scope(line).replaceAll('\n', '\r\n'),
    // 경계: 정본 줄과 변형 줄이 함께 있으면 변형은 필드로 보지 않는다(상충은 사전 reviewer가 본다).
    scope(line + '1. 구현 후 reviewer: 생략 — 문구만\n'),
    // 정본 줄과 주석 제거로만 머리가 생기는 줄: 허위 중복이 아니다(R4 b).
    scope(line + '<!-- 예시 -->- 구현 후 reviewer: 생략 — 문구만\n')]) {
    assert.deepEqual(issues(text), { line: [], gate: [] }, text);
  }
  // legacy TASK는 줄이 없어도 문제 없다.
  assert.deepEqual(issues('## 목적\n옛 TASK\n## 증명 범위\n- 판정 주체: 자동 테스트\n'), { line: [], gate: [] });
  // 증명 범위 구조가 깨지면 기존 구조 문제만 낸다.
  for (const text of [marker + '## 목적\n없음\n', marker + '## 증명 범위\n' + line, marker + '## 증명 범위\n<!-- 빈 절 -->\n## 기준\n']) {
    assert.deepEqual(reviewerLineIssues(text), []);
    assert.deepEqual(reviewIssues(dir, text), proofScopeIssues(text));
    assert.ok(proofScopeIssues(text).length);
  }
});

test('사전 검토 해시는 CRLF만 정규화하고 기존 LF 기록·기록 명령과 일치한다', () => {
  const dir = tempDir('pace-review-eol-');
  const task = '# 태스크\n- 상태: 진행\n- 사전 검토: v1\n\n## 목적\n기준\n';
  const crlf = task.replaceAll('\n', '\r\n');
  const mixed = task.replace('\n', '\r\n').replace('## 목적\n', '## 목적\r\n');
  const legacyLf = createHash('sha256').update(task.replace(/^- 상태: .+$/m, '- 상태:')).digest('hex');
  const legacyCrlf = createHash('sha256').update(crlf.replace(/^- 상태: .+$/m, '- 상태:')).digest('hex');
  assert.equal(reviewHash(task), legacyLf);
  assert.equal(reviewHash(crlf), legacyLf);
  assert.equal(reviewHash(mixed), legacyLf);
  assert.equal(reviewHash(crlf.replace('진행', '완료')), legacyLf);
  for (const changed of [task + '변경', task.replace('기준\n', '기준\r'), '\uFEFF' + task]) assert.notEqual(reviewHash(changed), legacyLf);
  mkdirSync(join(dir, 'evidence'));
  writeFileSync(join(dir, 'evidence/review.md'), '검토 결과');
  const record = (hash: string) => ({ version: 1, author: 'openai', attempts: [{ hash, provider: 'anthropic', cross: true, status: 'pass', blocking: 0, evidence: 'evidence/review.md', continuity: 'new' }] });
  writeFileSync(join(dir, 'PRE-REVIEW.json'), JSON.stringify(record(legacyLf)));
  assert.deepEqual(reviewIssues(dir, crlf), []);
  assert.ok(reviewIssues(dir, crlf + '변경').length);
  writeFileSync(join(dir, 'PRE-REVIEW.json'), JSON.stringify(record(legacyCrlf)));
  assert.ok(reviewIssues(dir, crlf).length, '정규화 전 CRLF 기록은 재검토가 필요하다');
  const taskPath = join(dir, 'TASK.md');
  writeFileSync(taskPath, crlf);
  const guide = readFileSync(new URL('../skills/pace-project-dev/references/reviewer.md', import.meta.url), 'utf8');
  const command = /```js\r?\n([\s\S]*?)```/.exec(guide)?.[1];
  assert.ok(command, '기록 명령이 있어야 한다');
  const result = spawnSync(process.execPath, ['-e', command, taskPath], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), legacyLf, '기록 명령과 검사 해시가 일치한다');
});

test('Git autocrlf로 다시 체크아웃한 태스크는 기존 LF 검토 기록을 유지한다', () => {
  const dir = tempDir('pace-review-git-eol-');
  const git = (...args: string[]) => {
    const result = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  };
  git('init', '-q');
  git('config', 'core.autocrlf', 'true');
  const task = '# 태스크\n- 상태: 진행\n- 사전 검토: v1\n\n## 목적\n기준\n';
  const file = join(dir, 'TASK.md');
  writeFileSync(file, task);
  git('add', 'TASK.md');
  mkdirSync(join(dir, 'evidence'));
  writeFileSync(join(dir, 'evidence/review.md'), '검토 결과');
  const legacyLf = createHash('sha256').update(task.replace(/^- 상태: .+$/m, '- 상태:')).digest('hex');
  writeFileSync(join(dir, 'PRE-REVIEW.json'), JSON.stringify({ version: 1, author: 'openai', attempts: [{ hash: legacyLf, provider: 'anthropic', cross: true, status: 'pass', blocking: 0, evidence: 'evidence/review.md', continuity: 'new' }] }));
  unlinkSync(file); // 임시 픽스처에서 Git이 인덱스 파일을 다시 쓰게 한다.
  git('checkout-index', '--force', 'TASK.md');
  const checkedOut = readFileSync(file, 'utf8');
  assert.ok(checkedOut.includes('\r\n'), 'Git이 실제로 CRLF로 체크아웃했다');
  assert.deepEqual(reviewIssues(dir, checkedOut), []);
});

test('사전 검토 이력: 최신 대상·판정과 대체·안전한 증거를 검사한다', () => {
  const dir = tempDir('pace-review-');
  const task = '- 상태: 진행\n- 사전 검토: v1\n\n## 목적\n기준\n';
  const hash = reviewHash(task);
  const attempt = { hash, provider: 'anthropic', cross: true, status: 'pass', blocking: 0, evidence: 'evidence/review.md', continuity: 'new' };
  const record = { version: 1, author: 'openai', attempts: [attempt] };
  mkdirSync(join(dir, 'evidence'));
  writeFileSync(join(dir, 'evidence/review.md'), '검토 결과');
  const save = (value: unknown) => writeFileSync(join(dir, 'PRE-REVIEW.json'), JSON.stringify(value));
  assert.ok(reviewIssues(dir, task).length);
  save(record);
  assert.deepEqual(reviewIssues(dir, task), []);
  assert.deepEqual(reviewIssues(dir, task.replace('진행', '완료')), []);
  assert.ok(reviewIssues(dir, task + '변경').length);
  save({ ...record, attempts: [attempt, { ...attempt, status: 'fail', blocking: 1 }] });
  assert.ok(reviewIssues(dir, task).length);
  save({ ...record, attempts: [{ ...attempt, provider: 'openai', cross: false }] });
  assert.ok(reviewIssues(dir, task).length);
  save({ ...record, attempts: [{ ...attempt, status: 'unavailable', reason: '실행 불가', evidence: 'evidence/review.md' }, { ...attempt, provider: 'openai', cross: false }] });
  assert.deepEqual(reviewIssues(dir, task), []);
  save({ ...record, attempts: [{ ...attempt, evidence: '../외부' }] });
  assert.ok(reviewIssues(dir, task).length);
  symlinkSync('review.md', join(dir, 'evidence/link'));
  save({ ...record, attempts: [{ ...attempt, evidence: 'evidence/link' }] });
  assert.ok(reviewIssues(dir, task).length);
  assert.ok(reviewIssues(dir, task.replace('- 사전 검토: v1\n', '')).length);
  save({ ...record, attempts: [{ ...attempt, provider: ['openai'], cross: true }] });
  assert.ok(reviewIssues(dir, task).length);
  save({ ...record, attempts: [{ ...attempt, status: 'fail', blocking: 1 }, { ...attempt, status: 'unavailable', reason: '불가' }, attempt] });
  assert.ok(reviewIssues(dir, task).length);
  save({ ...record, attempts: [{ ...attempt, blocking: 2 }, attempt] });
  assert.ok(reviewIssues(dir, task).length);
  save({ ...record, attempts: [{ ...attempt, status: ['pass'] }] });
  assert.ok(reviewIssues(dir, task).length);
  save({ ...record, attempts: [{ ...attempt, continuity: ['new'] }] });
  assert.ok(reviewIssues(dir, task).length);
  writeFileSync(join(dir, 'evidence/empty'), '');
  save({ ...record, attempts: [{ ...attempt, evidence: 'evidence/empty' }] });
  assert.ok(reviewIssues(dir, task).length);
  save({ ...record, attempts: [{ ...attempt, status: 'fail', blocking: 1 }, { ...attempt, status: 'unavailable', reason: '불가' }, { ...attempt, provider: 'openai', cross: false, continuity: 'same' }] });
  assert.ok(reviewIssues(dir, task).length);
  save({ ...record, author: 'google', attempts: [attempt] });
  assert.deepEqual(reviewIssues(dir, task), []);
  for (const bad of ['', 'OpenAI', 'a'.repeat(65), 'openai\n']) {
    save({ ...record, author: bad });
    assert.ok(reviewIssues(dir, task).length);
    save({ ...record, attempts: [{ ...attempt, provider: bad }] });
    assert.ok(reviewIssues(dir, task).length);
  }
  save({ ...record, author: ['google'] });
  assert.ok(reviewIssues(dir, task).length);
  save({ ...record, version: 2 });
  assert.ok(reviewIssues(dir, task).length);
  writeFileSync(join(dir, 'PRE-REVIEW.json'), '{');
  assert.ok(reviewIssues(dir, task).length);
});

test('사용자 게이트 예외: 실행된 검토가 pass에 못 미쳐도 사용자 결정·현재 해시·근거에 묶이면 통과, 이력은 그대로', () => {
  const dir = tempDir('pace-review-');
  const task = '- 상태: 진행\n- 사전 검토: v1\n\n## 목적\n기준\n';
  const hash = reviewHash(task);
  mkdirSync(join(dir, 'evidence'));
  writeFileSync(join(dir, 'evidence/review.md'), '검토 결과');
  writeFileSync(join(dir, 'evidence/user-decision.md'), '캡틴: 둘 다 1번으로 진행해 줘');
  const fail = { hash, provider: 'openai', cross: true, status: 'fail', blocking: 1, evidence: 'evidence/review.md', continuity: 'new' };
  const waiver = { by: 'user', date: '2026-11-16', reason: '계획 단계 지적이 수렴하지 않음', evidence: 'evidence/user-decision.md', hash };
  const save = (value: unknown) => writeFileSync(join(dir, 'PRE-REVIEW.json'), JSON.stringify(value));
  const base = { version: 1, author: 'anthropic', attempts: [fail] };
  save(base);
  assert.ok(reviewIssues(dir, task).length, '예외 없이 fail이면 막는다');
  save({ ...base, waiver });
  assert.deepEqual(reviewIssues(dir, task), []);
  save({ ...base, waiver: { ...waiver, by: 'pm' } });
  assert.match(reviewIssues(dir, task).join(), /사용자 결정만/);
  save({ ...base, waiver: { ...waiver, reason: ' ' } });
  assert.ok(reviewIssues(dir, task).length);
  save({ ...base, waiver: { ...waiver, date: '어제' } });
  assert.ok(reviewIssues(dir, task).length);
  save({ ...base, waiver: { ...waiver, evidence: '../밖' } });
  assert.ok(reviewIssues(dir, task).length);
  save({ ...base, waiver });
  assert.match(reviewIssues(dir, task + '변경').join(), /해시/, 'TASK가 바뀌면 예외도 무효');
  save({ ...base, attempts: [{ ...fail, status: 'unavailable', blocking: 0, reason: '실행 불가' }], waiver });
  assert.match(reviewIssues(dir, task).join(), /실행된 검토 없이/);
  save({ ...base, attempts: [{ ...fail, status: 'pass', blocking: 0 }], waiver });
  assert.match(reviewIssues(dir, task).join(), /필요 없다/);
  save({ ...base, attempts: [{ ...fail, evidence: '../밖' }], waiver });
  assert.ok(reviewIssues(dir, task).length, '이력 형식 검사는 예외와 무관하게 유지');
});
