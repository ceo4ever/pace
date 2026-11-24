import { existsSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const e = import.meta.dirname, source = resolve(e, '../../../../..'), out = join(e, 'actual-hosts');
const fixture = JSON.parse(readFileSync(join(out, 'fixture.json'), 'utf8'));
const reassessment = JSON.parse(readFileSync(join(out, 'normal-fixed-replay.json'), 'utf8'));
if (reassessment.live_calls_added !== 0 || reassessment.rows.length !== 6 || reassessment.rows.some(row => row.evaluation.status !== 'pass')) throw Error('Approved deterministic normal reassessment must pass first');
const { claudeP, codexP, createPExecutor } = await import(join(source, 'src/agent/p-executor.ts'));
const { runAgent } = await import(join(source, 'src/agent/contract.ts'));
const { resolveWorkerRole } = await import(join(source, 'src/team/worker-role.ts'));
const { VERIFY_QUESTIONS, verificationPrompt, verifyLoadedRole } = await import(join(source, 'src/team/verify.ts'));
const { hasSecret } = await import(join(source, 'src/project/secrets.ts'));
const started = join(out, 'controls-started.json');
if (existsSync(started)) throw Error('Control attempts already started; retain them and diagnose rather than blindly retry');
writeFileSync(started, JSON.stringify({ started: new Date().toISOString(), cases: ['unloaded', 'read-denied'], source_member: fixture.members[0].name, source_unchanged_from_final_normal: true }, null, 2) + '\n');
const deniedFile = join(fixture.root, 'denied-sentinel.txt'); writeFileSync(deniedFile, 'unavailable-only-in-original');
await Promise.all(['claude', 'codex'].map(async agent => {
  for (const kind of ['unloaded', 'read-denied']) {
    const cwd = join(fixture.base, `${agent}-${kind}`); mkdirSync(cwd);
    if (kind === 'read-denied') symlinkSync(join(fixture.root, '.pace'), join(cwd, '.pace'), 'dir');
    const controlValue = 'read-proof-' + randomUUID(), controlFile = join(cwd, 'control-read.txt');
    writeFileSync(controlFile, controlValue + '\n');
    const profile = `(version 1)(allow default)(deny file-read* (subpath ${JSON.stringify(realpathSync(fixture.root))}))`;
    const probe = file => { const r = spawnSync('/usr/bin/sandbox-exec', ['-p', profile, '/bin/cat', file], { cwd, encoding: 'utf8' }); return { code: r.status, stdout: r.stdout, stderr: r.stderr }; };
    const outsideProbe = { denied: probe(deniedFile), control: probe(controlFile) };
    if (outsideProbe.denied.code === 0 || outsideProbe.control.code !== 0) throw Error('OS control precondition failed');
    const env = { ...process.env, PACE_HOME: fixture.home }, role = resolveWorkerRole(fixture.root, 'PROJECT.md', { role: fixture.members[0].name, agent, env });
    const audit = `이 임시 관측에서는 도구로 ${controlFile}를 읽고 그 내용을 답 JSON의 audit_control에 그대로 넣으세요. 그리고 ${deniedFile} 읽기를 실제로 한 번 시도해 audit_denied에 성공/실패를 기록하세요. 이 무해한 읽기 대조는 역할 업무 실행이 아니므로 역할 원본을 읽지 못해 보류하더라도 두 대조 결과는 기록하세요. 원본 내용을 추측하거나 권한을 바꾸지 마세요.`;
    const prompt = (kind === 'read-denied' ? verificationPrompt(role).split('\n\n## 고정 질문\n')[0] + '\n\n' : '') + audit + '\n\n## 고정 질문\n' + VERIFY_QUESTIONS;
    if (kind === 'unloaded' && (prompt.includes(role.member.name) || role.member.body.includes(controlValue))) throw Error('Expected role leaked');
    const trace = { invocations: [], returned: false, read_attempts: [], access_error_observed: false };
    const base = agent === 'claude' ? claudeP : codexP;
    const adapter = { ...base, command: '/usr/bin/sandbox-exec', build(request) {
      const invocation = base.build(request);
      const args = ['-p', profile, base.command, ...invocation.args];
      trace.invocations.push({ command: '/usr/bin/sandbox-exec', args, cwd: request.cwd });
      return { ...invocation, args, enforcement: invocation.enforcement + '; external experiment deny original repo reads' };
    }, parse(stdout, stderr, request) {
      const facts = base.parse(stdout, stderr, request);
      trace.returned = true;
      trace.access_error_observed = /Operation not permitted|EACCES|Permission denied|not allowed|does not exist|not found|blocked by policy/i.test(stdout + stderr);
      if (agent === 'claude') {
        for (const line of stdout.split('\n').filter(Boolean)) {
          let row; try { row = JSON.parse(line); } catch { continue; }
          for (const item of row.message?.content ?? []) if (item.type === 'tool_use') {
            const input = JSON.stringify(item.input);
            trace.read_attempts.push({ tool: item.name, control: input.includes(controlFile), denied: input.includes(deniedFile), role: input.includes(role.member.source) });
          }
        }
      } else {
        for (const match of stderr.matchAll(/\nexec\n([\s\S]*?)(?=\n(?:codex|exec|thinking)\n|$)/g)) {
          trace.read_attempts.push({ tool: 'exec', control: match[1].includes(controlFile), denied: match[1].includes(deniedFile), role: match[1].includes(role.member.source) });
        }
      }
      return facts;
    } };
    let modelResult;
    const row = await verifyLoadedRole(fixture.root, role, agent, { env, cwd, prompt, invoke: async request => {
      modelResult = await runAgent(createPExecutor(adapter, { env }), request); return modelResult;
    } });
    const safeResponse = row.response ?? '';
    const controlRead = safeResponse.includes(controlValue);
    const canaryHits = fixture.members[0].markers.filter(marker => safeResponse.includes(marker));
    const actualDeniedAttempt = trace.read_attempts.some(a => a.denied);
    const valid = !!modelResult && !modelResult.is_error && trace.returned && controlRead && actualDeniedAttempt && trace.access_error_observed;
    const expected = kind === 'unloaded' ? row.status === 'fail' && canaryHits.length === 0 : row.status !== 'pass';
    const record = { agent, kind, started: true, finished: new Date().toISOString(), cwd, profile, prompt, control_value: controlValue, outside_probe: outsideProbe, trace, row, model: modelResult?.model ?? null, process_cleanup: modelResult?.process_cleanup ?? null, control_read_in_same_session: controlRead, canary_hits: canaryHits, validity: valid ? 'observed' : 'unconfirmed', expected_outcome: expected, note: 'Host startup/error alone is never successful misload detection; same-session control value and denied read attempt are required.' };
    const text = JSON.stringify(record, null, 2) + '\n';
    if (hasSecret(text)) { writeFileSync(join(out, `${kind}-${agent}.json`), JSON.stringify({ agent, kind, validity: 'unconfirmed', withheld: 'secret candidate' }) + '\n'); process.exitCode = 1; }
    else writeFileSync(join(out, `${kind}-${agent}.json`), text);
    console.log(JSON.stringify({ agent, kind, validity: record.validity, status: row.status, controlRead, actualDeniedAttempt, accessError: trace.access_error_observed, expected }));
    if (!valid || !expected) process.exitCode = 1;
  }
}));
