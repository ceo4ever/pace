import { chmodSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { packageRoot } from '../../src/core/paths.ts';

export type TarEntry = { path: string; type: '0' | '1' | '2' | '5'; data?: Buffer };

export function archive(entries: TarEntry[]): Buffer {
  const blocks: Buffer[] = [];
  for (const { path, type, data = Buffer.alloc(0) } of entries) {
    const header = Buffer.alloc(512);
    let filename = path;
    if (Buffer.byteLength(path) > 100) {
      const split = path.lastIndexOf('/');
      header.write(path.slice(0, split), 345, 155);
      filename = path.slice(split + 1);
    }
    header.write(filename, 0, 100);
    header.write(data.length.toString(8).padStart(11, '0'), 124);
    header.fill(32, 148, 156);
    header.write(type, 156);
    header.write('ustar', 257);
    const sum = header.reduce((total, byte) => total + byte, 0);
    header.write(sum.toString(8).padStart(6, '0'), 148);
    blocks.push(header, data, Buffer.alloc((512 - data.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]));
}

export function releaseArchive(version: string): Buffer {
  const root = 'ceo4ever-pace-fixture';
  const entries: TarEntry[] = [{ path: root, type: '5' }];
  const walk = (part: string) => {
    entries.push({ path: `${root}/${part}`, type: '5' });
    for (const entry of readdirSync(join(packageRoot, part), { withFileTypes: true })) {
      const child = `${part}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile()) entries.push({ path: `${root}/${child}`, type: '0', data: readFileSync(join(packageRoot, child)) });
      else throw new Error(`Unexpected fixture source: ${child}`);
    }
  };
  for (const part of ['bin', 'src', 'templates', 'skills']) walk(part);
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  entries.push({ path: `${root}/package.json`, type: '0', data: Buffer.from(JSON.stringify({ ...manifest, version })) });
  return archive(entries);
}

export function fakeReleaseIo(home: string): NodeJS.ProcessEnv {
  const bin = join(home, 'commands');
  mkdirSync(bin);
  for (const command of ['git', 'curl']) {
    const path = join(bin, command);
    const body = command === 'git'
      ? 'printf Git >> "$PACE_TEST_NETWORK"; exit 91'
      : 'while [ "$#" -gt 1 ]; do if [ "$1" = --output ]; then out="$2"; shift; fi; shift; done\n[ "$1" = https://raw.githubusercontent.com/ceo4ever/pace/main/scripts/install-release.mjs ] && cp "$PACE_TEST_HELPER" "$out"';
    writeFileSync(path, `#!/bin/sh\n${body}\n`);
    chmodSync(path, 0o755);
  }
  if (process.platform === 'win32') {
    writeFileSync(join(bin, 'git.cmd'), '@echo off\r\necho Git>>"%PACE_TEST_NETWORK%"\r\nexit /b 91\r\n');
  }
  const hook = join(home, 'mock-release-fetch.mjs');
  writeFileSync(hook, `import { appendFileSync, readFileSync } from 'node:fs';
globalThis.fetch = async (input) => {
  const url = String(input);
  appendFileSync(process.env.PACE_TEST_NETWORK, url + '\\n');
  if (url.endsWith('/releases/latest')) {
    if (process.env.PACE_TEST_HTTP === 'lookup') return new Response(null, { status: 503 });
    if (process.env.PACE_TEST_HTTP === 'oversize') return new Response(new Uint8Array(1024 * 1024 + 1));
    return Response.json({ tag_name: 'v' + process.env.PACE_TEST_VERSION,
      draft: process.env.PACE_TEST_HTTP === 'draft', prerelease: process.env.PACE_TEST_HTTP === 'prerelease' });
  }
  if (url.startsWith('https://api.github.com/repos/') && url.includes('/tarball/')) {
    if (process.env.PACE_TEST_HTTP === 'archive') return new Response(null, { status: 404 });
    const host = process.env.PACE_TEST_HTTP === 'redirect' ? 'example.invalid' : 'codeload.github.com';
    return new Response(null, { status: 302, headers: { location: 'https://' + host + '/artifact' } });
  }
  if (url === 'https://codeload.github.com/artifact') return new Response(readFileSync(process.env.PACE_TEST_ARCHIVE));
  throw new Error('Unexpected URL: ' + url);
};\n`);
  return {
    PATH: process.platform === 'win32' ? `${bin};${process.env.PATH ?? ''}` : `${bin}:${join(process.execPath, '..')}:/usr/bin:/bin`,
    NODE_OPTIONS: `--import=${pathToFileURL(hook).href}`,
    PACE_TEST_HELPER: join(packageRoot, 'scripts', 'install-release.mjs'),
    PACE_TEST_NETWORK: join(home, 'network.txt'),
  };
}
