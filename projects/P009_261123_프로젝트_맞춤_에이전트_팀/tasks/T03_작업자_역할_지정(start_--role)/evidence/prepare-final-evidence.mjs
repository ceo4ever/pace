import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
const e = import.meta.dirname, dest = join(e, 'final');
let collect = readFileSync(join(e, 'collect-host-proof.mjs'), 'utf8')
  .replaceAll('../../../../..', '../../../../../..')
  .replaceAll('claude-aosfGN-app-wt-P001/49ab03dd-68ae-4714-8a63-de06bd48db20', 'claude-UC8A4V-app-wt-P001/c77c72bd-d03e-4056-be3e-190a7d1bb3c5')
  .replaceAll('rollout-2026-11-24T08-54-16-01a20ad4-ef08-7e90-b91f-0fa4d4892bc0', 'rollout-2026-11-24T09-59-21-01a20b10-8586-70e1-b38a-fcfb7f6ccbbb')
  .replaceAll('inbox-final.json', 'inbox-current.json')
  .replaceAll('worker-final.json', 'worker-current-full.json')
  .replaceAll('-retry1.json', '-current.json')
  .replace("  const result = JSON.parse(readFileSync(join(p.worktree, 'probe-result.json'), 'utf8'));", "  const resultDir = JSON.parse(readFileSync(join(e, 'host-results', p.agent, 'location.json'), 'utf8')).cwd;\n  const result = JSON.parse(readFileSync(join(resultDir, 'probe-result.json'), 'utf8'));")
  .replace("existsSync(join(p.worktree, 'reviewer-signoff.md'))", "existsSync(join(resultDir, 'reviewer-signoff.md'))")
  .replace(/preflight_failures_without_worker: \[.*?\], launched_worker_attempts:/, "preflight_failures_without_worker: [], previous_version_attempts: 'Root evidence retains two initial preflight failures and two settled medium-effort workers; final folder is the current-source low-effort pair.', launched_worker_attempts:")
  .replace('Two medium-tier makers;', 'Two medium-tier makers explicitly mapped to nondefault low effort;')
  .replace('Initial preflight errors had no worker or host session.', 'This final pair has no preflight failure. Earlier failures remain in the parent evidence folder.');
writeFileSync(join(dest, 'collect-host-proof.mjs'), collect);
let check = readFileSync(join(e, 'check-host-proof.mjs'), 'utf8')
  .replaceAll('-retry1.json', '-current.json')
  .replace("  const actualResult =", "  const resultDir = read(`host-results/${p.agent}/location.json`).cwd;\n  const actualResult =")
  .replaceAll("join(p.worktree, 'probe-result.json')", "join(resultDir, 'probe-result.json')")
  .replaceAll('join(p.worktree, file)', 'join(resultDir, file)')
  .replaceAll("join(p.worktree, 'reviewer-signoff.md')", "join(resultDir, 'reviewer-signoff.md')")
  .replace("['planned', 'rejected', 'arguments']", "['planned', 'arguments']")
  .replace("cwd: p.worktree, encoding: 'utf8', env", "cwd: resultDir, encoding: 'utf8', env")
  .replace("/tests 3/", "/tests [13]/").replace("/pass 3/", "/pass [13]/")
  .replace(/  const initialCalls =.*?\n  assert.equal\(initialCalls.*?\n/s, '')
  .replace('and preserved preflight failures', 'and nondefault low effort');
const extra = `
  assert.equal(receipt.result.effort, 'low');
  const actualEvents = readFileSync(join(p.worktree, 'projects', p.projectDir, 'log.jsonl'), 'utf8').trim().split('\\n').map(JSON.parse);
  assert.deepEqual(h.start_events, actualEvents.filter(row => row.type === 'start'));
  const calls = readFileSync(join(e, 'host-' + p.agent + '-orca-calls-current.jsonl'), 'utf8').trim().split('\\n').map(JSON.parse);
  const launches = calls.filter(row => row.sourceArgs[1] === 'worker-start');
  assert.equal(launches.length, 1);
  const args = launches[0].sourceArgs;
  const arg = key => args[args.indexOf(key) + 1];
  assert.equal(arg('--model'), receipt.result.model); assert.equal(arg('--effort'), 'low');
  const lastRole = h.start_events.at(-1).role;
  assert.equal(lastRole.model, receipt.result.model); assert.equal(lastRole.effort, 'low');
  assert.equal(arg('--spec').includes(lastRole.definition), true);
  assert.equal(arg('--spec').includes(lastRole.hash), true);
  assert.equal(arg('--spec').includes('CRLF를 LF로'), true);
`;
check = check.replace("  const q = messages.filter", extra + "\n  const q = messages.filter");
writeFileSync(join(dest, 'check-host-proof.mjs'), check);
for (const [src, target] of [['/tmp/pace-P009-T03-check-final-recheck.txt', 'check.txt'], ['/tmp/pace-P009-T03-focused-final-complete.txt', 'focused-tests.txt'], ['/tmp/pace-P009-T03-types-final.txt', 'types.txt'], ['/tmp/pace-P009-T03-review-fixes-red.txt', 'review-fixes-red.txt']]) copyFileSync(src, join(dest, target));
