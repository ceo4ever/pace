import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, linkSync, mkdirSync, readFileSync, readdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runPace, tempDir } from './helpers.ts';
import { normalizeResult, type AgentRequest } from '../src/agent/contract.ts';
import { createTeamMember, loadTeamMember } from '../src/team/store.ts';
import { resolveWorkerRole, roleInstruction } from '../src/team/worker-role.ts';
import { evaluateRoleAnswer, storeVerifyReport, verificationPrompt, VERIFY_LOAD_NOTICE, VERIFY_LIMITATION, VERIFY_QUESTIONS, verifyKeywords, verifyLoadedRole, verifyTable, verifyTeam, type VerifyReport } from '../src/team/verify.ts';
import { hasSecret } from '../src/project/secrets.ts';

function fixture(names = ['maker-a']) {
  const root = tempDir(), home = tempDir();
  assert.equal(spawnSync('git', ['init', '-q', root]).status, 0);
  for (const name of names) {
    const member = createTeamMember(root, name, 'maker');
    const path = join(root, member.source);
    const text = readFileSync(path, 'utf8').replace(/## 하지 않는 일\n[\s\S]*?(?=\n## )/, '## 하지 않는 일\n\n- `alpha-key` 외부 승인을 하지 않는다.\n- `beta-key` 권한을 바꾸지 않는다.\n');
    writeFileSync(path, text);
  }
  const env = { ...process.env, PACE_HOME: home };
  return { root, home, env };
}
const answer = (name = 'maker-a', dont = ['alpha-key', 'beta-key']) => JSON.stringify({ identity: name, duties: '배정 업무', dont, blocked: '근거와 선택지를 올린다' });
const result = (r: AgentRequest, text = answer(), isError = false) => normalizeResult(r, { text, model: 'observed-model', isError }, { durationMs: 1, enforcement: 'fake read-only' });

test('동일 시작 지시와 고정 질문만 전달하고 3명×두 host를 각각 판정한다', async () => {
  const f = fixture(['maker-a', 'maker-b', 'maker-c']), calls: AgentRequest[] = [];
  const before = readFileSync(join(f.root, '.pace/team/agents/maker-a.md'));
  const run = await verifyTeam(f.root, { all: true }, { env: f.env, invoke: async (r) => {
    calls.push(r);
    const name = /팀 구성원 (maker-[abc])/.exec(r.prompt)![1]!;
    return result(r, answer(name));
  } });
  assert.equal(run.code, 0); assert.equal(calls.length, 6); assert.equal(run.report.rows.length, 6);
  assert.deepEqual(calls.map(r => r.agent), ['claude', 'claude', 'claude', 'codex', 'codex', 'codex']);
  for (const r of calls) {
    const name = /팀 구성원 (maker-[abc])/.exec(r.prompt)![1]!;
    const role = resolveWorkerRole(f.root, 'PROJECT.md', { role: name, agent: r.agent, env: f.env })!;
    assert.equal(r.prompt, roleInstruction(role) + '\n\n## 이 점검의 검증 책임\n' + VERIFY_LOAD_NOTICE + '\n\n## 고정 질문\n' + VERIFY_QUESTIONS);
    assert.equal(r.access, 'read-only'); assert.equal(r.model, role.settings.model); assert.equal(r.effort, role.settings.effort);
    assert.equal(VERIFY_QUESTIONS.includes(name), false); assert.equal(VERIFY_QUESTIONS.includes('alpha-key'), false);
  }
  assert.match(verifyTable(run.report), /적재 방식/); assert.match(verifyTable(run.report), /prompt/);
  const stored = JSON.parse(readFileSync(join(f.root, run.path), 'utf8'));
  assert.equal(stored.phase, 'result'); assert.equal(stored.status, 'pass');
  assert.equal(stored.loading_notice, VERIFY_LOAD_NOTICE); assert.equal(stored.session_self_hash_observed, false);
  assert.equal(stored.rows[0].observed.model, 'observed-model'); assert.equal(stored.rows[0].observed.effort, 'unconfirmed');
  assert.deepEqual(readFileSync(join(f.root, '.pace/team/agents/maker-a.md')), before);
});

test('판정은 독립 기대 표지와 정체성 경계를 사용하고 의역을 실패로 단정하지 않는다', () => {
  assert.equal(evaluateRoleAnswer('maker-a', ['alpha-key', 'beta-key'], answer()).status, 'pass');
  assert.equal(evaluateRoleAnswer('maker-a', ['alpha-key'], answer('maker-ab')).status, 'fail');
  assert.equal(evaluateRoleAnswer('maker-a', ['alpha-key'], JSON.stringify({ duties: 'x' })).status, 'fail');
  assert.equal(evaluateRoleAnswer('maker-a', ['alpha-key'], answer('maker-a', ['alpha-key-more'])).status, '확인 필요');
  assert.equal(evaluateRoleAnswer('maker-a', ['alpha-key', 'beta-key'], answer('maker-a', ['alpha-key'])).status, '확인 필요');
  assert.equal(evaluateRoleAnswer('maker-a', ['alpha-key'], answer('maker-a', ['의역한 금지'])).status, '확인 필요');
  assert.equal(evaluateRoleAnswer('maker-a', [], answer()).status, '확인 필요');
  assert.equal(evaluateRoleAnswer('maker-a', ['alpha-key'], '형식을 지키지 않은 답').status, '확인 필요');
  assert.equal(evaluateRoleAnswer('maker-a', ['alpha-key'], JSON.stringify({ identity: 'maker-a', duties: '', dont: ['alpha-key'], blocked: 'x' })).status, '확인 필요');
  assert.equal(evaluateRoleAnswer('maker-a', ['alpha-key'], '').status, 'fail');
  assert.equal(evaluateRoleAnswer('maker-a', ['alpha-key'], 'x'.repeat(65537)).status, 'fail');
  assert.equal(evaluateRoleAnswer('maker-a', ['alpha-key'], '```json\n' + answer() + '\n```').status, 'pass');
});

test('명시 표지만 추출하고 코드·주석·중복·비밀 표식을 기대 값으로 만들지 않는다', () => {
  const f = fixture(), member = loadTeamMember(f.root, 'maker-a');
  assert.deepEqual(verifyKeywords(member), ['alpha-key', 'beta-key']);
  const part = (text: string) => ({ ...member, body: '## 하지 않는 일\n' + text + '\n## 끝\n' });
  assert.deepEqual(verifyKeywords(part('<!-- - `hidden` 내용 -->\n```md\n- `code-key` 내용\n```\n- `visible` 내용')), ['visible']);
  assert.throws(() => verifyKeywords(part('- `same` x\n- `same` y')));
  assert.throws(() => verifyKeywords(part('- `' + 'x'.repeat(33) + '` x')));
  const secret = ['ghp', '_', 'a'.repeat(36)].join('');
  assert.throws(() => verifyKeywords(part('- `' + secret + '` x')));
  for (const marker of ['vfy-a12b98ef', 'vfy-00000000', 'vfy-ffffffff']) assert.equal(hasSecret(marker), false);
});

test('새 기본 원본의 표지는 구성원마다 달라 형제 정의의 답을 통과시키지 않는다', () => {
  const root = tempDir(), members = ['first', 'second', 'third'].map(name => createTeamMember(root, name, 'maker'));
  const markers = members.map(verifyKeywords);
  assert.equal(new Set(markers.flat()).size, 6);
  for (const keys of markers) { assert.equal(keys.length, 2); for (const key of keys) { assert.ok(key.length <= 32); assert.equal(hasSecret(key), false); } }
  assert.equal(evaluateRoleAnswer('first', markers[0]!, answer('first', markers[1]!)).status, '확인 필요');
  assert.equal(evaluateRoleAnswer('first', markers[0]!, answer('first', markers[0]!)).status, 'pass');
});

test('legacy 원본은 변경하지 않고 실제 호출 뒤 확인 필요·종료2 보고서를 남긴다', async () => {
  const f = fixture();
  const path = join(f.root, '.pace/team/agents/maker-a.md');
  writeFileSync(path, readFileSync(path, 'utf8').replace('`alpha-key`', '외부승인').replace('`beta-key`', '권한변경'));
  const before = readFileSync(path); let calls = 0;
  const run = await verifyTeam(f.root, { name: 'maker-a', agent: 'claude' }, { env: f.env, invoke: async r => { calls++; return result(r); } });
  assert.equal(calls, 1); assert.equal(run.code, 2); assert.equal(run.report.status, '확인 필요');
  assert.deepEqual(readFileSync(path), before); assert.equal(JSON.parse(readFileSync(join(f.root, run.path), 'utf8')).phase, 'result');
});

test('검사 중 원본 변경은 기존 이름·키워드가 맞아도 실패다', async () => {
  const f = fixture();
  const run = await verifyTeam(f.root, { name: 'maker-a', agent: 'codex' }, { env: f.env, invoke: async r => {
    const p = join(f.root, '.pace/team/agents/maker-a.md'); writeFileSync(p, readFileSync(p, 'utf8') + '\n변경\n'); return result(r);
  } });
  assert.equal(run.code, 1); assert.match(run.report.rows[0]!.reason, /변경/);
});

test('비밀 답과 오류 원문을 저장하거나 stdout에 노출하지 않는다', async () => {
  const f = fixture(), secret = ['ghp', '_', 'a'.repeat(36)].join('');
  for (const mode of ['answer', 'throw', 'error']) {
    const run = await verifyTeam(f.root, { name: 'maker-a', agent: 'claude' }, { env: f.env, invoke: async r => {
      if (mode === 'throw') throw Error(secret);
      return result(r, secret, mode === 'error');
    } });
    assert.equal(run.code, 1); assert.equal(run.report.rows[0]!.response, null);
    assert.equal(readFileSync(join(f.root, run.path), 'utf8').includes(secret), false);
    assert.equal(verifyTable(run.report).includes(secret), false);
  }
});

test('source 링크·hardlink·손상은 host 없이 fail 보고서를 남기고 원본은 보존한다', async () => {
  for (const mode of ['link', 'hardlink', 'corrupt']) {
    const f = fixture(), source = join(f.root, '.pace/team/agents/maker-a.md'), outside = join(tempDir(), 'original.md');
    const original = readFileSync(source); writeFileSync(outside, original); unlinkSync(source);
    if (mode === 'link') symlinkSync(outside, source); else if (mode === 'hardlink') linkSync(outside, source); else writeFileSync(source, 'invalid');
    let calls = 0;
    const run = await verifyTeam(f.root, { name: 'maker-a', agent: 'codex' }, { env: f.env, invoke: async r => { calls++; return result(r); } });
    assert.equal(run.code, 1); assert.equal(calls, 0); assert.deepEqual(readFileSync(outside), original);
  }
});

test('결과 경로 링크는 host 시작 전에 거부하고 파일 충돌·hardlink를 덮지 않는다', async () => {
  const f = fixture(), outside = tempDir(); symlinkSync(outside, join(f.root, '.pace/team/verify'), 'dir');
  let calls = 0;
  await assert.rejects(verifyTeam(f.root, { all: true }, { env: f.env, invoke: async r => { calls++; return result(r); } }));
  assert.equal(calls, 0); assert.deepEqual(readdirSync(outside), []);
  const g = fixture();
  const report: VerifyReport = { version: 1, phase: 'result', created: new Date().toISOString(), rows: [], status: 'fail', native_tamper: 'N/A', loading_notice: VERIFY_LOAD_NOTICE, session_self_hash_observed: false, limitation: VERIFY_LIMITATION };
  const path = storeVerifyReport(g.root, report, 'fixed'); const old = readFileSync(join(g.root, path));
  assert.throws(() => storeVerifyReport(g.root, report, 'fixed')); assert.deepEqual(readFileSync(join(g.root, path)), old);
  const sentinel = join(tempDir(), 'sentinel'); writeFileSync(sentinel, 'preserve'); linkSync(sentinel, join(g.root, '.pace/team/verify/hard.json'));
  assert.throws(() => storeVerifyReport(g.root, report, 'hard')); assert.equal(readFileSync(sentinel, 'utf8'), 'preserve');
});

test('all은 현재 목록이고 빈 팀은 실패, 삭제 대상 이름은 명시해서 검사한다', async () => {
  const f = fixture(); unlinkSync(join(f.root, '.pace/team/agents/maker-a.md'));
  let calls = 0;
  const options = { env: f.env, invoke: async (r: AgentRequest) => { calls++; return result(r); } };
  assert.equal((await verifyTeam(f.root, { all: true }, options)).code, 1);
  assert.equal((await verifyTeam(f.root, { name: 'maker-a', agent: 'claude' }, options)).code, 1);
  assert.equal(calls, 0);
});

test('사용 조합 오류는 stderr·종료2이고 보고서와 호출을 만들지 않는다', () => {
  const f = fixture();
  for (const args of [['verify'], ['verify', 'maker-a', '--all'], ['verify', '--all', '--agent', 'gemini'], ['list', '--agent', 'claude'], ['verify', '--all', '--json']]) {
    const r = runPace(['team', ...args], { cwd: f.root, home: f.home });
    assert.equal(r.status, 2); assert.equal(r.stdout, ''); assert.ok(r.stderr);
  }
  assert.equal(readdirSync(join(f.root, '.pace/team')).includes('verify'), false);
});

test('verify 이름 지정 삭제 원본은 fail 보고서와 종료1이고 사용 오류2와 구분된다', () => {
  const root = tempDir(), home = tempDir();
  assert.equal(spawnSync('git', ['init', '-q', root]).status, 0);
  mkdirSync(join(root, '.pace/team'), { recursive: true });
  writeFileSync(join(root, 'preserve.txt'), 'unchanged');
  const r = runPace(['team', 'verify', 'missing-maker', '--agent', 'claude'], { cwd: root, home });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /Report: \.pace\/team\/verify\//);
  assert.match(r.stdout, /fail/);
});

test('readonly 고지는 공통 prefix 뒤에 책임만 밝히며 원본 내용·이름·표지를 새로 넣지 않는다', () => {
  const f = fixture(), role = resolveWorkerRole(f.root, 'PROJECT.md', { role: 'maker-a', agent: 'claude', env: f.env })!;
  const prompt = verificationPrompt(role), prefix = roleInstruction(role);
  assert.equal(prompt.startsWith(prefix + '\n\n'), true);
  const suffix = prompt.slice(prefix.length);
  assert.match(suffix, /자체 셸 검산/); assert.match(suffix, /loaded:false/);
  for (const value of [role.member.name, role.member.body, 'alpha-key', 'beta-key']) assert.equal(suffix.includes(value), false);
});

test('명시적 loaded:false는 정체성보다 먼저 실패이고 true만으로 표지 누락을 통과시키지 않는다', () => {
  const a = JSON.parse(answer());
  assert.equal(evaluateRoleAnswer('maker-a', ['alpha-key'], JSON.stringify({ ...a, loaded: false })).status, 'fail');
  assert.equal(evaluateRoleAnswer('maker-a', ['alpha-key'], JSON.stringify({ ...a, loaded: true, dont: ['의역'] })).status, '확인 필요');
  assert.equal(evaluateRoleAnswer('maker-a', ['alpha-key'], answer()).status, 'pass');
});

test('실측에서 나온 한국어 이름 조사와 단일 JSON fence 뒤 보충 문장을 정확히 판독한다', () => {
  assert.equal(evaluateRoleAnswer('maker-a', ['alpha-key', 'beta-key'], answer('maker-a입니다. 배정된 maker입니다.')).status, 'pass');
  assert.equal(evaluateRoleAnswer('maker-a', ['alpha-key', 'beta-key'], '```json\n' + answer() + '\n```\n\n원본을 직접 읽었습니다.').status, 'pass');
  assert.equal(evaluateRoleAnswer('maker-a', ['alpha-key'], '```json\n' + answer() + '\n```\n```json\n' + answer('other') + '\n```').status, '확인 필요');
  assert.equal(evaluateRoleAnswer('maker-a', ['alpha-key'], '```json\n' + answer() + '\n```\n' + answer('other')).status, '확인 필요');
  assert.equal(evaluateRoleAnswer('maker-a', ['alpha-key'], answer('maker-ab입니다')).status, 'fail');
  assert.equal(evaluateRoleAnswer('maker-a', ['alpha-key'], '```json\n' + answer() + '\n```\nidentity: other').status, '확인 필요');
  assert.equal(evaluateRoleAnswer('maker-a', ['alpha-key'], '```json\n' + answer('maker-a', ['의역']) + '\n```\n보충: alpha-key').status, '확인 필요');
});

test('해석 뒤 호출 직전 바뀐 원본은 실제 invoke 없이 실패한다', async () => {
  const f = fixture(), role = resolveWorkerRole(f.root, 'PROJECT.md', { role: 'maker-a', agent: 'claude', env: f.env })!;
  const p = join(f.root, role.member.source); writeFileSync(p, readFileSync(p, 'utf8') + '\n변경\n');
  let calls = 0;
  const r = await verifyLoadedRole(f.root, role, 'claude', { invoke: async req => { calls++; return result(req); } });
  assert.equal(r.status, 'fail'); assert.equal(calls, 0);
});

test('확인 필요 CLI는 종료2여도 stdout Report와 phase=result를 남긴다', { skip: process.platform === 'win32' ? 'POSIX fake CLI 실행 파일 시험' : false }, () => {
  const f = fixture(), bin = join(f.home, 'bin'), command = join(bin, 'claude'), capture = join(f.home, 'request.json');
  mkdirSync(bin);
  writeFileSync(command, '#!' + process.execPath + '\n' +
    'const fs=require("node:fs");fs.writeFileSync(' + JSON.stringify(capture) + ',JSON.stringify({args:process.argv.slice(2),prompt:fs.readFileSync(0,"utf8")}));' +
    'process.stdout.write(JSON.stringify({type:"result",result:' + JSON.stringify(answer('maker-a', ['의역'])) + ',session_id:"unit-session",stop_reason:"end_turn",is_error:false,modelUsage:{"unit-model":{}},usage:{}})+"\\n");');
  chmodSync(command, 0o755);
  const r = runPace(['team', 'verify', 'maker-a', '--agent', 'claude'], { cwd: f.root, home: f.home, env: { PATH: bin + delimiter + process.env.PATH }, timeout: 15000 });
  assert.equal(r.status, 2, r.stderr + r.stdout); assert.equal(r.stderr, ''); assert.match(r.stdout, /확인 필요/);
  const path = /^Report: (.+)$/m.exec(r.stdout)![1]!;
  const report = JSON.parse(readFileSync(join(f.root, path), 'utf8'));
  assert.equal(report.phase, 'result'); assert.equal(report.status, '확인 필요');
  const req = JSON.parse(readFileSync(capture, 'utf8'));
  assert.equal(req.args.includes('--permission-mode'), false); assert.equal(req.args.includes('Read,Grep,Glob'), true);
  assert.equal(req.prompt.includes('alpha-key'), false); assert.equal(req.prompt.includes(VERIFY_LOAD_NOTICE), true);
});

test('잘못된 옵션에 비밀 후보가 있어도 진단에 원문을 내보내지 않는다', () => {
  const f = fixture(), secret = ['ghp', '_', 'a'.repeat(36)].join('');
  const r = runPace(['team', 'verify', '--' + secret], { cwd: f.root, home: f.home });
  assert.equal(r.status, 2); assert.equal((r.stdout + r.stderr).includes(secret), false);
});
