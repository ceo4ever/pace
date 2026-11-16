import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, symlinkSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { resolveWindowsCommand } from '../src/agent/win-command.ts';
import { tempDir } from './helpers.ts';

const shim = (target: string) => `@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\nSETLOCAL\r\nCALL :find_dp0\r\n\r\nIF EXIST "%dp0%\\node.exe" (\r\n  SET "_prog=%dp0%\\node.exe"\r\n) ELSE (\r\n  SET "_prog=node"\r\n  SET PATHEXT=%PATHEXT:;.JS;=;%\r\n)\r\n\r\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\${target}" %*\r\n`;

test('Windows 명령은 표준 npm shim만 절대 Node와 경계 안 스크립트로 해석한다', { skip: process.platform !== 'win32' ? 'Windows shim 실측' : false }, () => {
  const dir = tempDir(), script = join(dir, 'node_modules', 'package', 'entry.js');
  mkdirSync(dirname(script), { recursive:true }); writeFileSync(script, '');
  const cmd = join(dir, 'agent.cmd'); writeFileSync(cmd, shim('node_modules\\package\\entry.js'));
  const result = resolveWindowsCommand('agent', ['space & value'], { PATH: `${dir};${dirname(process.execPath)}` });
  assert.deepEqual(result, { command: realpathSync.native(process.execPath), args: [realpathSync.native(script), 'space & value'] });
  assert.throws(() => resolveWindowsCommand('agent', [], { PATH: `.;${dir}` }), /Node|찾/);
  writeFileSync(cmd, '@echo off\necho unsafe\n');
  assert.throws(() => resolveWindowsCommand('agent', [], { PATH: `${dir};${dirname(process.execPath)}` }), /배치|shim/i);
  writeFileSync(join(dir, 'outside.js'), '');
  writeFileSync(cmd, shim('node_modules\\sub/../../outside.js'));
  assert.throws(() => resolveWindowsCommand('agent', [], { PATH: `${dir};${dirname(process.execPath)}` }), /검증되지 않은 배치/);
  writeFileSync(cmd, shim('node_modules\\..\\outside.js'));
  assert.throws(() => resolveWindowsCommand('agent', [], { PATH: `${dir};${dirname(process.execPath)}` }), /검증되지 않은 배치/);
  const outside = tempDir(); writeFileSync(join(outside, 'entry.js'), '');
  symlinkSync(outside, join(dir, 'node_modules', 'link'), 'junction');
  writeFileSync(cmd, shim('node_modules\\link\\entry.js'));
  assert.throws(() => resolveWindowsCommand('agent', [], { PATH: `${dir};${dirname(process.execPath)}` }), /경계/);
});

test('Windows PATH의 현재 폴더와 상대 항목에 심은 실행 파일을 무시한다', { skip: process.platform !== 'win32' ? 'Windows PATH 실측' : false }, () => {
  const original = process.cwd(), attacker = tempDir(), safe = tempDir();
  const script = join(safe, 'node_modules', 'package', 'entry.js'); mkdirSync(dirname(script), { recursive: true });
  writeFileSync(script, ''); writeFileSync(join(safe, 'agent.cmd'), shim('node_modules\\package\\entry.js'));
  writeFileSync(join(attacker, 'agent.exe'), 'attacker'); writeFileSync(join(attacker, 'node.exe'), 'attacker');
  try {
    process.chdir(attacker);
    const result = resolveWindowsCommand('agent', [], { PATH: `.;relative;${safe};${dirname(process.execPath)}` });
    assert.equal(result.command, realpathSync.native(process.execPath));
    assert.equal(result.args[0], realpathSync.native(script));
  } finally { process.chdir(original); }
});

test('npm node_modules 자체가 경계 밖 정션이면 거부한다', { skip: process.platform !== 'win32' ? 'Windows 정션 실측' : false }, () => {
  const dir = tempDir(), outside = tempDir();
  writeFileSync(join(outside, 'entry.js'), '');
  symlinkSync(outside, join(dir, 'node_modules'), 'junction');
  writeFileSync(join(dir, 'agent.cmd'), shim('node_modules\\entry.js'));
  assert.throws(() => resolveWindowsCommand('agent', [], { PATH: `${dir};${dirname(process.execPath)}` }), /경계/);
});

test('Windows 실행 파일 링크는 실제 실행 경로로 해석한다', { skip: process.platform !== 'win32' ? 'Windows 링크 실측' : false }, (t) => {
  const dir = tempDir(), link = join(dir, 'agent.exe');
  try { symlinkSync(process.execPath, link, 'file'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EPERM') { t.skip('파일 링크 권한 없음'); return; } throw error; }
  assert.deepEqual(resolveWindowsCommand('agent', [], { PATH: dir }), { command: realpathSync.native(process.execPath), args: [] });
});

test('exe 링크로 배치 shim을 가리키면 확장자 우회를 거부한다', { skip: process.platform !== 'win32' ? 'Windows 링크 실측' : false }, (t) => {
  const dir = tempDir(), script = join(dir, 'node_modules', 'p', 'entry.js');
  mkdirSync(dirname(script), { recursive: true }); writeFileSync(script, '');
  const cmd = join(dir, 'target.cmd'); writeFileSync(cmd, shim('node_modules\\p\\entry.js'));
  try { symlinkSync(cmd, join(dir, 'agent.exe'), 'file'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EPERM') { t.skip('파일 링크 권한 없음'); return; } throw error; }
  assert.throws(() => resolveWindowsCommand('agent', [], { PATH: `${dir};${dirname(process.execPath)}` }), /확장자/);
});
