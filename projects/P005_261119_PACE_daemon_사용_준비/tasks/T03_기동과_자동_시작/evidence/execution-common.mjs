import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { inputs } from './pace-p005-t02-common.mjs';
export { inputs };
export const home = path.join(os.homedir(), '.pace');
export const app = path.join(home, 'app');
export const sha = value => crypto.createHash('sha256').update(value).digest('hex');
export const mod = name => import(pathToFileURL(path.join(app, name)));
export function evDir() {
  const project = fs.readdirSync('projects').find(name => name.startsWith('P005_'));
  const base = path.join('projects', project, 'tasks');
  return path.join(base, fs.readdirSync(base).find(name => name.startsWith('T03_')), 'evidence');
}
export function save(name, value) {
  const text = JSON.stringify(value, null, 2) + '\n';
  const input = inputs();
  if ([input.token, input.chat, ...input.users].some(secret => text.includes(secret))) throw Error('sensitive-evidence');
  fs.writeFileSync(path.join(evDir(), name), text);
}
export function verifyModules() {
  const expected = JSON.parse(fs.readFileSync(path.join(evDir(), 'installation-preparation.json'), 'utf8'));
  for (const [file, hash] of Object.entries(expected.modules)) {
    if (sha(fs.readFileSync(path.join(app, file))) !== hash) throw Error('installation-changed');
  }
  return expected.modules;
}
export function cli(args, timeout = 60000) {
  const result = spawnSync(process.execPath, [path.join(app, 'bin/pace.ts'), 'daemon', ...args], {
    encoding: 'utf8', timeout, windowsHide: true,
    env: { ...process.env, PACE_HOME: home, PACE_PROFILE: 'default' },
  });
  if ((result.stdout + result.stderr).includes(inputs().token)) throw Error('cli-secret-output');
  return result;
}
export function sameOwner(a, b) {
  return Boolean(a && b && a.pid === b.pid && a.bootId === b.bootId && a.startedAt === b.startedAt);
}
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
