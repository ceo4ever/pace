import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '../../../../..');
const proof = JSON.parse(readFileSync(join(import.meta.dirname, 'actual-worktrees-final2.json'), 'utf8'));
test('실제 두 worktree 및 다른 저장소 CLI 영수증과 공유 상태를 직접 대조한다', async () => {
  assert.equal(proof.modelCalls, 0);
  assert.equal(proof.cases.length, 2);
  for (const [path, hash] of Object.entries(proof.sourceHashes)) assert.equal(createHash('sha256').update(readFileSync(join(root, path))).digest('hex'), hash, path);
  const { observeGroup, observeProcess } = await import(join(root, 'src/team/resource-process.ts'));
  for (const row of proof.cases) {
    assert.notEqual(row.firstRoot, row.secondRoot);
    for (const receipt of [row.first, row.second, row.rejected]) {
      assert.equal(receipt.argv[0], join(root, 'bin/pace.ts'));
      assert.equal(receipt.argv[1], 'team'); assert.equal(receipt.argv[2], 'lock');
      assert.equal(receipt.argv[3], row.name);
      assert.ok(receipt.stdout.trim().split('\n').every(line => JSON.parse(line)));
    }
    assert.equal(row.first.code, 0); assert.equal(row.second.code, 0); assert.equal(row.rejected.code, 1);
    const rejection = JSON.parse(row.rejected.stdout.trim().split('\n').at(-1));
    assert.equal(rejection.outcome, 'busy'); assert.equal(rejection.owner, 'alive'); assert.equal(rejection.ownerCheck, 'same-start');
    const first = row.first.stdout.trim().split('\n').map(line => JSON.parse(line));
    assert.equal(first[0].lease.acquisitionId, row.initial.acquisitionId);
    assert.equal(first.at(-1).outcome, 'completed');
    assert.equal(row.initial.phase, 'started'); assert.ok(row.initial.child.group > 1);
    assert.ok(row.renewed.heartbeat > row.initial.heartbeat);
    assert.deepEqual(row.timeline.map(x => x.event), ['first-start', 'first-end', 'second-start']);
    assert.ok(row.timeline[1].at <= row.timeline[2].at);
    assert.equal(row.race.simultaneousStarts, 1);
    assert.equal(Number(row.race.entered.a) + Number(row.race.entered.b), 1);
    assert.equal(Number(row.race.a.code === 0) + Number(row.race.b.code === 0), 1);
    assert.equal(existsSync(join(proof.base, `${row.scope}-forbidden`)), false);
    const common = cwd => { const r = spawnSync('git', ['-C', cwd, 'rev-parse', '--git-common-dir'], { encoding: 'utf8' }); assert.equal(r.status, 0); return resolve(cwd, r.stdout.trim()); };
    if (row.scope === 'repo') { assert.equal(common(row.firstRoot), common(row.secondRoot)); assert.equal(row.stateDir, join(common(row.firstRoot), 'pace/resources')); }
    else { assert.notEqual(common(row.firstRoot), common(row.secondRoot)); assert.equal(row.stateDir, join(proof.base, 'home/team/resources')); }
    const state = JSON.parse(readFileSync(join(row.stateDir, `${row.name}.json`), 'utf8'));
    assert.equal(state.active, false); assert.equal(row.final.active, false);
    assert.equal(observeProcess(state.owner), 'dead'); assert.equal(observeGroup(state.child.group), 'dead');
    const audits = readdirSync(join(row.stateDir, 'audit')).map(name => JSON.parse(readFileSync(join(row.stateDir, 'audit', name), 'utf8'))).filter(event => event.acquisitionId === row.initial.acquisitionId);
    for (const action of ['acquire', 'started-before-START', 'release']) assert.ok(audits.some(event => event.action === action), action);
    assert.equal(audits.some(event => event.action === 'renew'), false);
  }
  console.log(JSON.stringify({ cases: 2, model_calls: 0, live_temporary_fixtures_reaudited: true, boundary: 'T05 checkout source hash에 결합. 임시 fixture 소멸 뒤 live 재감사를 주장하지 않는다.' }));
});
