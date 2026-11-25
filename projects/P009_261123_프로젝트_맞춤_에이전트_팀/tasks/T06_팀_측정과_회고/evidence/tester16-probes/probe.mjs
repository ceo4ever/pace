import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const [workspace, out] = process.argv.slice(2);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const save = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const blank = '\u2800';
const filler = '\u3164';
const probes = [
  ['quoted-title', `[범위](details.md "[${blank}](sample.md)")`, 0],
  ['escaped-bracket', String.raw`비교 \[${blank}](details.md)`, 0],
  ['actual-filler-with-prose', `비교 [${blank}](details.md)`, 1],
  ['angle-and-nested', `[한글](<https://example.invalid/a_(b)> '[${filler}](sample.md)') [중첩](https://example.invalid/a_(b(c)))`, 0],
  ['escaped-double-title', String.raw`[범위](details.md "인용 \" ) [${blank}](sample.md)")`, 0],
  ['escaped-single-title', String.raw`[범위](details.md '인용 \' ) [${blank}](sample.md)')`, 0],
  ['hidden-label-with-title', `비교 [**${filler}**](<details.md> "보이는 제목")`, 1],
  ['inline-html', '비교 <span style="display:none">숨김</span>', 1],
  ['inline-comment', '비교 <!-- 숨김 -->', 1],
  ['inline-pi', '비교 <?instruction?>', 1],
  ['inline-cdata', '비교 <![CDATA[숨김]]>', 1],
  ['escaped-presentation', String.raw`예시 \<span> \<!-- 숨김 --> \<?instruction?> \<!\[CDATA\[숨김]]>`, 0],
  // Boundary control: after a valid destination and whitespace, a tag is not a link title.
  ['html-after-destination', '[범위](details.md <span>자료</span>)', 1],
  ['html-in-quoted-title', '[범위](details.md "<span>자료</span>")', 0],
];

const results = [];
for (const [name, summary, expectedExit] of probes) {
  const base = path.join(out, name);
  const repo = path.join(base, 'repo');
  const home = path.join(base, 'home');
  fs.mkdirSync(path.join(repo, 'docs'), { recursive: true });
  fs.mkdirSync(home);
  const env = { PATH: process.env.PATH, PACE_HOME: home, TMPDIR: out, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' };
  function run(program, ...args) {
    const {status, stdout, stderr, error, signal} = spawnSync(program, args, {cwd: repo, env, encoding: 'utf8'});
    const result = {name, cwd: repo, paceHome: home, program, args, status, stdout, stderr, signal, error: error?.message};
    fs.appendFileSync(path.join(out, 'commands.jsonl'), JSON.stringify(result) + '\n');
    if (error) throw error;
    return result;
  }
  const ok = (result) => assert.equal(result.status, 0, JSON.stringify(result));
  const git = (...args) => ok(run('git', '-c', 'core.hooksPath=/dev/null', ...args));
  const pace = (...args) => run(process.execPath, path.join(workspace, 'bin/pace.ts'), ...args);
  const commit = (msg) => { git('add', '-A'); git('commit', '-qm', msg); };
  git('init', '-q', '-b', 'main');
  git('config', 'core.hooksPath', '/dev/null');
  git('config', 'user.name', 'Synthetic T06');
  git('config', 'user.email', 'fixture@example.invalid');
  fs.writeFileSync(path.join(repo, 'docs/README.md'), '# Synthetic\n\n## 환경\n\n- 검사: `true`\n- 보안 검사: `true`\n');
  commit('synthetic baseline');
  ok(pace('project', 'new', 'T06 scanner fixture'));
  const projects = path.join(repo, 'projects');
  const dir = path.join(projects, fs.readdirSync(projects).find((entry) => entry.startsWith('P001_')));
  const projectPath = path.join(dir, 'PROJECT.md');
  const projectText = fs.readFileSync(projectPath, 'utf8').replace(/\| P-1 \| <!--.*?--> \| <!--.*?--> \|/, '| P-1 | Synthetic criteria | Synthetic evidence |');
  fs.writeFileSync(projectPath, projectText.replace(/\n/, '\n\n- 팀 측정: v1\n'));
  fs.writeFileSync(path.join(dir, 'log.jsonl'), '');
  save(path.join(dir, 'proof.json'), { version:1, kind:'team-evidence', sourceRef:'fixture:scanner', hash:hash('synthetic proof') });
  save(path.join(dir, 'TEAM-RETROSPECTIVE.json'), { version:1, metricRef:'METRICS.md', unusedRoles:[], recurringFindings:[], definitionChanges:[], noChangesReasonRef:'proof.json' });
  const close = [
    '# Synthetic close', '', '## 기준 대조', '', '| # | 결과 | 증거 |', '|---|---|---|', '| P-1 | 통과 | synthetic |',
    '', '## 보안', '', '합성 검사 실행', '', '## 정본 반영', '', '| 정본 | 반영 | 비고 |', '|---|---|---|', '| `docs/README.md` | 해당 없음 | synthetic |',
    '', '## 회고', '', '| 구분 | 입력 | 요약 |', '|---|---|---|', `| 팀 | [회고](TEAM-RETROSPECTIVE.json) | ${summary} |`,
    '', '## 지표', '', '[지표](METRICS.md)', '', '합성 지표 해석.', '',
  ].join('\n');
  const closeFile = path.join(dir, 'PROJECT-CLOSE.md');
  fs.writeFileSync(closeFile, close);
  fs.writeFileSync(path.join(base, 'close-input.md'), close);
  commit('synthetic close fixture');
  const result = pace('project', 'finish', 'P001');
  save(path.join(base, 'finish.json'), result);
  const actual = fs.readFileSync(closeFile);
  const teamGate = /PROJECT-CLOSE 회고에 팀 행/.test(result.stdout + result.stderr);
  const bytesUnchanged = actual.equals(Buffer.from(close));
  const matched = result.status === expectedExit && teamGate === (expectedExit === 1) && bytesUnchanged;
  results.push({ name, summary, expectedExit, actualExit: result.status, teamGate, bytesUnchanged, beforeSha256:hash(close), afterSha256:hash(actual), matched });
  save(path.join(out, 'results.json'), results);
  console.log(name, expectedExit, result.status, teamGate, bytesUnchanged, matched);
}
process.exitCode = results.every((r) => r.matched) ? 0 : 1;
