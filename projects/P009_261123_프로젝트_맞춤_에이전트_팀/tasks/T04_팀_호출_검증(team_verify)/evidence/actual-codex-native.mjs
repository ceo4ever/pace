import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
const e = import.meta.dirname, source = resolve(e, '../../../../..'), out = join(e, 'actual-hosts');
const f = JSON.parse(readFileSync(join(out, 'fixture.json'), 'utf8'));
const cap = JSON.parse(readFileSync(join(out, 'codex-native-profile-capability.json'), 'utf8'));
if (cap.write_exists || cap.rows.find(r => r.kind === 'control').code !== 0 || cap.rows.find(r => r.kind === 'denied').code === 0 || cap.rows.find(r => r.kind === 'write').code === 0) throw Error('Native readonly/deny capability not proven');
const started = join(out, 'codex-native-started.json');
if (existsSync(started)) throw Error('Native control attempt already exists; preserve it');
writeFileSync(started, JSON.stringify({ at: new Date().toISOString(), correction: 'External seatbelt nesting prevented all Codex shell reads. Native :read-only profile adds the same original-repo deny without nesting. Inline config only; no user config or product code changed.' }, null, 2) + '\n');
const { createPExecutor, codexP } = await import(join(source, 'src/agent/p-executor.ts'));
const { runAgent } = await import(join(source, 'src/agent/contract.ts'));
const { safeRoleSetting } = await import(join(source, 'src/project/role-record.ts'));
const { resolveWorkerRole } = await import(join(source, 'src/team/worker-role.ts'));
const { VERIFY_QUESTIONS, verificationPrompt, verifyLoadedRole } = await import(join(source, 'src/team/verify.ts'));
const { hasSecret } = await import(join(source, 'src/project/secrets.ts'));
for (const kind of ['unloaded', 'read-denied']) {
  const cwd = join(f.base, `codex-native-${kind}`); mkdirSync(cwd);
  if (kind === 'read-denied') symlinkSync(join(f.root, '.pace'), join(cwd, '.pace'), 'dir');
  const value = 'read-proof-' + randomUUID(), control = join(cwd, 'control-read.txt'), denied = join(f.root, 'denied-sentinel.txt');
  writeFileSync(control, value + '\n');
  const env = { ...process.env, PACE_HOME: f.home }, role = resolveWorkerRole(f.root, 'PROJECT.md', { role: f.members[0].name, agent: 'codex', env });
  const audit = `이 무해한 읽기 관측에서는 ${control}와 ${denied}를 각각 cat으로 읽으세요. 두 읽기를 각각 시도하고, 역할 원본을 읽지 못해 보류해도 대조 결과는 기록하세요. 답 JSON audit_control에는 대조 파일 내용을, audit_denied에는 거부 파일 읽기 결과를 적으세요. 다른 파일 탐색·권한 변경·쓰기는 하지 마세요.`;
  const prompt = (kind === 'read-denied' ? verificationPrompt(role).split('\n\n## 고정 질문\n')[0] + '\n\n' : '') + audit + '\n\n## 고정 질문\n' + VERIFY_QUESTIONS;
  if (kind === 'unloaded' && prompt.includes(role.member.name)) throw Error('Role identity leaked to unloaded question');
  const configs = ['-c', 'default_permissions="p009probe"', '-c', 'permissions.p009probe.extends=":read-only"', '-c', `permissions.p009probe.filesystem={${JSON.stringify(f.root)}="deny"}`];
  const trace = { invocation: null, commands: [], completed: false, model_reported: false };
  const adapter = { ...codexP, build(request) {
    const invocation = codexP.build(request), args = [...invocation.args];
    const at = args.indexOf('--sandbox'); if (at < 0) throw Error('Expected base sandbox flag'); args.splice(at, 2);
    args.splice(args.length - 1, 0, ...configs, '--json');
    trace.invocation = { command: 'codex', args, cwd: request.cwd };
    return { ...invocation, args, enforcement: 'Codex native :read-only permission profile + deny original repository; measured readonly cat/touch preconditions; JSON event mode, no text sandbox banner' };
  }, parse(stdout) {
    let text = '', model, usage = {}, failed = false;
    for (const line of stdout.split('\n').filter(Boolean)) {
      const r = JSON.parse(line);
      if (r.type === 'turn.completed') { trace.completed = true; usage = r.usage ?? {}; }
      if (r.type === 'turn.failed' || r.type === 'error') failed = true;
      if (safeRoleSetting(r.model)) { model = r.model; trace.model_reported = true; }
      if (r.type === 'item.completed' && r.item?.type === 'agent_message') text = r.item.text;
      if (r.type === 'item.completed' && r.item?.type === 'command_execution') {
        const command = r.item.command ?? '', output = r.item.aggregated_output ?? '';
        const target = command.includes(control) || command.includes(denied) || command.includes(role.member.source);
        trace.commands.push({ command: hasSecret(command) ? '[withheld]' : command, exit_code: r.item.exit_code, control: command.includes(control), denied: command.includes(denied), role: command.includes(role.member.source), control_output: output.includes(value), read_denied_output: /Operation not permitted|Permission denied|EACCES/i.test(output), output: target && output.length <= 8192 && !hasSecret(output) ? output : '[not retained]' });
      }
    }
    if (!trace.completed || failed || !text) throw Error('Incomplete native JSON turn');
    return { text, model, isError: false, stopReason: 'completed', inputTokens: usage.input_tokens, outputTokens: usage.output_tokens };
  } };
  let actual;
  const row = await verifyLoadedRole(f.root, role, 'codex', { env, cwd, prompt, invoke: async request => { actual = await runAgent(createPExecutor(adapter, { env }), request); return actual; } });
  const controlRead = trace.commands.some(r => r.control_output), deniedRead = trace.commands.some(r => r.denied && r.read_denied_output);
  const valid = !!actual && trace.completed && controlRead && deniedRead;
  const canaryHits = f.members[0].markers.filter(m => (row.response ?? '').includes(m));
  const expected = kind === 'unloaded' ? row.status === 'fail' && canaryHits.length === 0 : row.status !== 'pass';
  const record = { kind, agent: 'codex', at: new Date().toISOString(), cwd, prompt, profile_configs: configs, capability: 'codex-native-profile-capability.json', trace, row, model: actual?.model ?? null, effort: 'requested only; not reported by JSON control adapter', control_read_in_same_session: controlRead, actual_denied_read_in_same_session: deniedRead, canary_hits: canaryHits, validity: valid ? 'observed' : 'unconfirmed', expected_outcome: expected };
  const serialized = JSON.stringify(record, null, 2) + '\n';
  if (hasSecret(serialized)) throw Error('Unsafe controlled evidence withheld');
  writeFileSync(join(out, `${kind}-codex-native.json`), serialized);
  console.log(JSON.stringify({ kind, validity: record.validity, expected, status: row.status, controlRead, deniedRead, model: actual?.model }));
  if (!valid || !expected) process.exitCode = 1;
}
