// 실제 소스 CLI의 계약 시험. reviewer·사용자 결정은 명시적인 합성 입력이다.
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const repo = resolve(import.meta.dirname, '../../../../..');
const out = process.argv[2] ? resolve(process.argv[2]) : resolve(import.meta.dirname, '../evidence/cli-paths');
mkdirSync(out, { recursive: true });
const hash = text => createHash('sha256').update(text).digest('hex');
const summary = [];
function approvalOK(events) {
  const q = events.findIndex(e => e.type === 'question');
  const a = events.findIndex(e => e.type === 'approval');
  const edit = events.findIndex((e, i) => i > a && e.type === 'edit');
  return q >= 0 && a > q && edit > a && !events.slice(q + 1, a).some(e => e.type === 'edit')
    && events[q].hash === events[a].hash && events[edit].before === events[a].hash
    && events[edit].after !== events[edit].before;
}
for (const kind of ['pm', 'user-diagnose', 'user-after-diagnosis', 'user-normal']) {
  const dir = join(out, kind), bin = join(dir, 'bin'); mkdirSync(bin, { recursive: true });
  const target = join(dir, 'TASK.md'), reply = join(bin, 'reply.txt'), counter = join(bin, 'count.txt');
  const events = []; let version = 0, command = 0;
  const event = (type, data = {}) => events.push({ order: events.length, type, ...data });
  const currentHash = () => hash(readFileSync(target, 'utf8'));
  const edit = label => {
    const before = currentHash(); writeFileSync(target, readFileSync(target, 'utf8') + `\nfixture revision ${++version}: ${label}\n`);
    event('edit', { label, before, after: currentHash() });
  };
  writeFileSync(target, '# 합성 TASK (실제 사용자 승인 아님)\n- TASK 형식: v2\n## 목적\n합성 경로 검증\n## 증명 범위\n- 판정 주체: 합성 입력과 테스트\n- 포함: 원장·파일 순서\n- 범위 밖: 실제 서비스·사용자 데이터\n## 기준\nT-1 합성\n');
  writeFileSync(counter, '0');
  const fake = join(bin, 'claude');
  writeFileSync(fake, `#!/usr/bin/env node\nimport fs from 'node:fs';import p from 'node:path';process.stdin.resume();process.stdin.on('end',()=>{const d=import.meta.dirname,c=p.join(d,'count.txt');fs.writeFileSync(c,String(Number(fs.readFileSync(c,'utf8'))+1));console.log(JSON.stringify({type:'result',result:fs.readFileSync(p.join(d,'reply.txt'),'utf8'),modelUsage:{'claude-fixture':{}},is_error:false}));});\n`);
  chmodSync(fake, 0o700);
  const env = { ...process.env, PACE_HOME: join(dir, 'isolated-home'), PATH: bin + ':' + process.env.PATH, PACE_AGENT_CHILD: '1' };
  const invoke = (args, expected = 0, cwd = repo) => {
    const r = spawnSync(process.execPath, [join(repo, 'bin/pace.ts'), ...args], { cwd, env, encoding: 'utf8', timeout: 120000 });
    writeFileSync(join(dir, `command-${++command}.json`), JSON.stringify({ fixture_executor: true, args, status: r.status, stdout: r.stdout, stderr: r.stderr }, null, 2));
    assert.equal(r.status, expected, r.stdout + r.stderr);
    return args[0] === 'agent' ? JSON.parse(r.stdout) : r.stdout;
  };
  const verify = (verdict, expected = 0) => {
    writeFileSync(reply, verdict === 'fail' ? 'F1 [blocking] 합성 누락\nfail' : '합성 보완 확인\npass');
    return invoke(['agent', 'verify', '--author-agent', 'codex', '--kind', 'task', '--target', target, '--purpose', '합성 CLI 계약 시험 — 실제 모델/사용자 승인 아님'], expected);
  };
  const note = args => invoke(['agent', 'review-note', '--target', target, ...args]);
  const probeBlocked = () => {
    const n = readFileSync(counter, 'utf8'); const blocked = verify('fail', 16);
    assert.equal(readFileSync(counter, 'utf8'), n); event('negative-block-probe', { stage: blocked.escalation.stage, exit: 16 });
  };
  for (let i = 0; i < 3; i++) {
    if (i) edit('합성 검토 지적 반영');
    const r = verify('fail');
    if (i === 2) { assert.equal(r.escalation.stage, 'diagnose'); event('signal', { stage: 'diagnose', exit: 0 }); }
  }
  event('classify', { phase: 'diagnose', actor: kind === 'user-diagnose' ? 'user' : 'pm' });
  probeBlocked(); // 정상 대응은 위 종료0에서 시작했다. 이 호출은 차단 계약의 음성 시험이다.
  const diagnosis = join(dir, 'diagnosis.md');
  const obtainApproval = (onQuestion = () => {}, onApproval = () => {}) => {
    const before = readFileSync(target, 'utf8'); writeFileSync(join(dir, 'before-approval.md'), before);
    event('question', { hash: currentHash(), report: ['합성 대상', '실패 추이', 'design 층 진단', '미승인 영향', '선택지', '추천·이유'] });
    onQuestion();
    assert.equal(currentHash(), hash(before));
    const file = join(dir, 'approval.md');
    writeFileSync(file, '합성 사용자 결정 입력 — 실제 사람의 승인 아님: fixture 안의 수정과 검증을 승인합니다.\n');
    event('approval', { hash: currentHash(), file: 'approval.md', synthetic: true });
    onApproval(file);
    return file;
  };
  let approval;
  if (kind === 'user-diagnose') approval = obtainApproval();
  writeFileSync(diagnosis, '합성 design 층 근본 조치. ' + (approval ? '[합성 승인 원문](approval.md)' : '로컬 fixture 갭이며 외부·비밀 영향 없음.'));
  note(['--diagnosis', '--layer', 'design', '--summary', '합성 원인 층 조치', '--file', diagnosis]);
  edit('진단 근본 조치');
  if (kind === 'user-diagnose') {
    const pass = verify('pass'); assert.equal(pass.review.rereview_of, null);
  } else {
    const r = verify('fail'); assert.equal(r.escalation.stage, 'ask_user');
    event('signal', { stage: 'ask_user', exit: 0 });
    event('classify', { phase: 'ask_user', actor: kind === 'user-after-diagnosis' ? 'user' : 'pm' });
    probeBlocked();
    const choice = join(dir, 'decision.md');
    if (kind === 'user-after-diagnosis') approval = obtainApproval();
    writeFileSync(choice, approval ? readFileSync(approval) : '합성 분류 이유: 합의 안의 fixture 누락, 외부/보안 영향 없음. 조치: design 층 재진단 후 덜어내고 다시 검증.');
    note(['--decision', '--by', approval ? 'user' : 'pm', '--choice', '근본 조치 후 재검증', '--summary', '합성 분류·조치', '--file', choice]);
    edit('결정 뒤 근본 조치');
    const r2 = verify(kind === 'user-normal' ? 'fail' : 'pass'); assert.equal(r2.review.rereview_of, null);
    if (kind === 'user-normal') {
      assert.equal(r2.escalation, undefined); event('signal', { stage: 'normal', exit: 0 });
      event('classify', { phase: 'normal', actor: 'user', reason: '합성 새 위험' });
      const audit = mkdtempSync(join(tmpdir(), 'pace-p008-audit-'));
      try {
        assert.equal(spawnSync('git', ['init', '-q', '--initial-branch=main', audit]).status, 0);
        assert.equal(spawnSync('git', ['-C', audit, '-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture']).status, 0);
        invoke(['project', 'new', '합성 감사'], 0, audit);
        const pd = join(audit, 'projects', readdirSync(join(audit, 'projects')).find(n => n.startsWith('P001_')));
        approval = obtainApproval(
          () => invoke(['project', 'log', 'P001', '--type', 'question', '--by', 'agent', '--msg', '합성 normal 단계 승인 질문'], 0, audit),
          file => {
            mkdirSync(join(pd, 'evidence'), { recursive: true }); writeFileSync(join(pd, 'evidence/approval.md'), readFileSync(file));
            invoke(['project', 'log', 'P001', '--type', 'answer', '--by', 'agent', '--msg', '합성 normal 단계 승인 입력 연결', '--ref', 'evidence/approval.md'], 0, audit);
          },
        );
        invoke(['agent', 'review-note', '--target', target, '--decision', '--by', 'user', '--choice', 'x', '--summary', '합성', '--file', approval], 2);
        writeFileSync(join(dir, 'normal-project-log.jsonl'), readFileSync(join(pd, 'log.jsonl')));
        mkdirSync(join(dir, 'normal-audit/evidence'), { recursive: true });
        for (const file of ['PROJECT.md', 'log.jsonl', 'evidence/approval.md']) writeFileSync(join(dir, 'normal-audit', file), readFileSync(join(pd, file)));
      } finally { rmSync(audit, { recursive: true, force: true }); }
      edit('normal 단계 합성 승인 뒤 첫 조치');
      const pass = verify('pass'); assert.ok(pass.review.rereview_of);
    }
  }
  if (approval) {
    assert.equal(approvalOK(events), true);
    writeFileSync(join(dir, 'after-approval.md'), readFileSync(target));
    // 실제 별도 파일을 승인 전에 바꾸면 같은 대조기가 거부해야 한다.
    const bad = join(dir, 'negative-premature.md');
    const original = readFileSync(join(dir, 'before-approval.md'), 'utf8'); writeFileSync(bad, original + '\n승인 전 변경\n');
    const q = events.find(e => e.type === 'question'); const badHash = hash(readFileSync(bad, 'utf8'));
    const badEvents = [{ ...q }, { type: 'edit', before: q.hash, after: badHash }, { type: 'approval', hash: badHash }, { type: 'edit', before: badHash, after: hash(badHash + '수정') }];
    assert.equal(approvalOK(badEvents), false);
    writeFileSync(join(dir, 'negative-check.json'), JSON.stringify({ rejected: !approvalOK(badEvents), events: badEvents }, null, 2));
  }
  event('report', { repeated: '합성 누락', layer: 'design', changed: '공통 원인을 채우거나 덜어냄', reverified: '실제 소스 CLI pass', synthetic: true });
  writeFileSync(join(dir, 'events.json'), JSON.stringify(events, null, 2));
  summary.push({ kind, passed: true, fixture_executor: true, approval_checked: !!approval, negative_rejected: !!approval });
}
writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
