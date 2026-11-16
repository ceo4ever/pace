import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { captureOwnedProfile, cleanOwnedProfile, OwnedTempObserver } from './preview-owned.ts';
import { tempDir } from './helpers.ts';

function fixture() {
  const root = tempDir('pace-owned-'), output = join(root, 'out'), container = join(output, 'chrome'), profile = join(container, 'canvas-tools-chrome-test');
  mkdirSync(profile, { recursive: true }); writeFileSync(join(profile, 'owned.txt'), 'owned');
  return { root, output, container, profile };
}
test('소유 프로세스가 남거나 프로필이 교체되면 재귀 정리를 거부한다', async () => {
  const f = fixture(), guard = captureOwnedProfile(f.root, f.output, f.container, f.profile);
  await assert.rejects(cleanOwnedProfile(guard, async () => false), /프로세스/);
  assert.ok(existsSync(join(f.profile, 'owned.txt')));
  renameSync(f.profile, f.profile + '-original'); mkdirSync(f.profile);
  await assert.rejects(cleanOwnedProfile(guard, async () => true), /교체/);
  assert.ok(existsSync(f.profile + '-original'));
});
test('루트 밖이나 소유 프로필 내부 링크는 거부하고 대상은 보존한다', async () => {
  const f = fixture(), other = tempDir('pace-owned-outside-');
  assert.throws(() => captureOwnedProfile(f.root, f.output, f.container, other), /소유|링크/);
  const guard = captureOwnedProfile(f.root, f.output, f.container, f.profile);
  const target = join(other, 'kept.txt'); writeFileSync(target, 'keep');
  try { symlinkSync(target, join(f.profile, 'link'), 'file'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EPERM') return; throw error; }
  await assert.rejects(cleanOwnedProfile(guard, async () => true), /링크/);
  assert.ok(existsSync(target));
});
test('정확히 식별한 소유 프로필만 제한된 정리로 회수한다', async () => {
  const f = fixture(), guard = captureOwnedProfile(f.root, f.output, f.container, f.profile);
  const result = await cleanOwnedProfile(guard, async () => true);
  assert.equal(result.attempts, 1); assert.ok(!existsSync(f.profile)); assert.ok(existsSync(f.root));
});

test('일반 임시 파일은 종류와 시각을 기록하고 자연 소멸을 기다린다', async () => {
  const f = fixture(), observerDir = join(f.output, 'observer'); mkdirSync(observerDir);
  const observer = new OwnedTempObserver(f.root, f.output, f.container, observerDir);
  const transient = join(f.container, 'temporary-file'); writeFileSync(transient, '');
  observer.scan();
  setTimeout(() => rmSync(transient), 100);
  await observer.waitForFiles(2000);
  assert.deepEqual(observer.events.map((e) => [e.kind, e.event]), [['file', 'seen'], ['file', 'gone']]);
  assert.ok(observer.events.every((e) => !Number.isNaN(Date.parse(e.at))));
  const persistent = join(observerDir, 'remaining'); writeFileSync(persistent, 'keep');
  await assert.rejects(observer.waitForFiles(100), /일시 파일이 남았다/);
  assert.ok(existsSync(persistent));
});

test('감시 경로의 알 수 없는 폴더·링크와 교체된 프로필은 거부한다', () => {
  const f = fixture(), observerDir = join(f.output, 'observer'); mkdirSync(observerDir);
  const observer = new OwnedTempObserver(f.root, f.output, f.container, observerDir);
  observer.scan();
  renameSync(f.profile, f.profile + '-original'); mkdirSync(f.profile);
  assert.throws(() => observer.scan(), /교체/);
  const other = fixture(), otherObserver = join(other.output, 'observer'); mkdirSync(otherObserver);
  const check = new OwnedTempObserver(other.root, other.output, other.container, otherObserver);
  mkdirSync(join(other.container, 'unknown-directory'));
  assert.throws(() => check.scan(), /알 수 없는/);
  const linkCase = fixture(), linkObserver = join(linkCase.output, 'observer'); mkdirSync(linkObserver);
  const linked = new OwnedTempObserver(linkCase.root, linkCase.output, linkCase.container, linkObserver);
  const outside = tempDir('pace-observer-outside-');
  try { symlinkSync(outside, join(linkCase.container, 'link'), 'junction'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EPERM') return; throw error; }
  assert.throws(() => linked.scan(), /링크/);
  assert.ok(existsSync(outside));
});
