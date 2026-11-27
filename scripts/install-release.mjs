// Shared remote source preparation for the POSIX and Windows installers.
import { mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const MiB = 1024 * 1024;
const blockSize = 512;
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

function requireArchive(condition, message) {
  if (!condition) throw new Error(`릴리즈 아카이브 오류: ${message}`);
}

function field(buffer, start, length) {
  const bytes = buffer.subarray(start, start + length);
  const end = bytes.indexOf(0);
  return utf8.decode(end < 0 ? bytes : bytes.subarray(0, end));
}

function octal(header, start, length) {
  const value = field(header, start, length).trim();
  requireArchive(/^[0-7]+$/.test(value), '잘못된 TAR 숫자 필드');
  return Number.parseInt(value, 8);
}

function paxPath(bytes, global) {
  let path;
  for (let offset = 0; offset < bytes.length;) {
    const space = bytes.indexOf(0x20, offset);
    requireArchive(space > offset && space - offset <= 7, '잘못된 PAX 레코드 길이');
    const lengthText = field(bytes, offset, space - offset);
    requireArchive(/^[1-9][0-9]*$/.test(lengthText), '잘못된 PAX 레코드 길이');
    const end = offset + Number(lengthText);
    requireArchive(end > space + 1 && end <= bytes.length && bytes[end - 1] === 0x0a, '잘못된 PAX 레코드');
    const record = utf8.decode(bytes.subarray(space + 1, end - 1));
    if (global && record.startsWith('comment=')) {
      // GitHub's Git commit comment has no effect on extraction.
    } else {
      requireArchive(!global && path === undefined && record.startsWith('path='), '지원하지 않는 PAX 메타데이터');
      path = record.slice('path='.length);
    }
    offset = end;
  }
  return path;
}

function safeParts(name) {
  const parts = name.split('/');
  for (const part of parts) {
    requireArchive(part && !/[<>:"\\|?*\x00-\x1f\x7f]/u.test(part) && !/[ .]$/u.test(part)
      && !/^(?:con|prn|aux|nul|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³]) *(?:\.|$)/iu.test(part), '안전하지 않은 경로');
  }
  return parts;
}

// GitHub produces POSIX ustar with optional PAX path records. Only regular
// files and directories are materialized. Validate the whole archive first.
function extractArchive(compressed, destination) {
  const tar = gunzipSync(compressed, { maxOutputLength: 128 * MiB });
  const entries = new Map();
  let offset = 0;
  let root;
  let nextPath;
  while (offset + blockSize <= tar.length) {
    const header = tar.subarray(offset, offset + blockSize);
    if (header.every((byte) => byte === 0)) break;
    const checksum = header.reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0);
    requireArchive(checksum === octal(header, 148, 8) && field(header, 257, 6) === 'ustar', '잘못된 TAR 헤더');
    const size = octal(header, 124, 12);
    const start = offset + blockSize;
    offset = start + Math.ceil(size / blockSize) * blockSize;
    requireArchive(offset <= tar.length, '잘린 TAR 항목');
    const type = field(header, 156, 1);
    if (type === 'g' || type === 'x') {
      requireArchive(nextPath === undefined, '연속한 PAX 경로');
      nextPath = paxPath(tar.subarray(start, start + size), type === 'g');
      requireArchive(type === 'g' || nextPath !== undefined, '비어 있는 PAX 경로');
      continue;
    }
    const directory = type === '5';
    requireArchive((directory && size === 0) || type === '0' || type === '', '파일·폴더 이외의 TAR 항목');
    const prefix = nextPath === undefined ? field(header, 345, 155) : '';
    const name = nextPath ?? (prefix ? `${prefix}/${field(header, 0, 100)}` : field(header, 0, 100));
    nextPath = undefined;
    const parts = safeParts(directory ? name.replace(/\/$/, '') : name);
    if (root === undefined) {
      requireArchive(directory && parts.length === 1 && /^[a-z0-9._-]+$/i.test(parts[0]), '최상위 폴더가 올바르지 않습니다');
      root = parts[0];
    }
    requireArchive(parts[0] === root && (parts.length > 1 || directory), '최상위 폴더 불일치');
    const key = parts.join('/').normalize('NFD').toLowerCase();
    requireArchive(!entries.has(key) && entries.size < 20_000, '중복 경로 또는 항목 수 한도 초과');
    if (parts.length > 1) {
      const parent = entries.get(parts.slice(0, -1).join('/').normalize('NFD').toLowerCase());
      requireArchive(parent?.directory && parent.parts.every((part, index) => part === parts[index]), '부모 폴더 불일치');
    }
    entries.set(key, { parts, directory, start, size });
  }
  requireArchive(root && nextPath === undefined && tar.length - offset >= 2 * blockSize
    && tar.subarray(offset).every((byte) => byte === 0), 'TAR 종료 블록 누락');

  for (const { parts, directory, start, size } of entries.values()) {
    const path = join(destination, ...parts);
    if (directory) mkdirSync(path);
    else writeFileSync(path, tar.subarray(start, start + size), { flag: 'wx' });
  }
  return join(destination, root);
}

async function download(url, label, maxBytes, redirectHost) {
  try {
    const headers = { 'User-Agent': 'PACE release installer' };
    const signal = AbortSignal.timeout(120_000);
    let response = await fetch(url, { headers, signal, redirect: 'manual' });
    if (response.status === 302 && redirectHost) {
      const location = new URL(response.headers.get('location') ?? '', url);
      await response.body?.cancel();
      if (location.origin !== `https://${redirectHost}` || location.username || location.password) {
        throw new Error('허용되지 않은 다운로드 주소');
      }
      response = await fetch(location, { headers, signal, redirect: 'error' });
    }
    if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
    if (!response.body) throw new Error('응답 본문 없음');
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body) {
      length += chunk.byteLength;
      if (length > maxBytes) throw new Error('다운로드 크기 한도 초과');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, length);
  } catch (error) {
    throw new Error(`${label}에 실패했습니다 (${error.message}${error.cause?.code ? ` · ${error.cause.code}` : ''})`);
  }
}

function repositoryApi(override) {
  if (!override) return 'https://api.github.com/repos/ceo4ever/pace';
  const repo = /^https:\/\/github\.com\/([a-z0-9][a-z0-9-]*)\/([a-z0-9_.-]+?)\/?$/i.exec(override);
  if (!repo || ['.', '..', '.git'].includes(repo[2].toLowerCase())) {
    throw new Error('PACE_REPO_URL은 공개 GitHub HTTPS 저장소 주소를 지정하세요. 다른 원격 소스는 로컬에 준비한 뒤 --repo(-Repo)로 지정하세요.');
  }
  const name = repo[2].replace(/\.git$/i, '');
  if (name === '.' || name === '..') throw new Error('PACE_REPO_URL 저장소 이름이 올바르지 않습니다.');
  return `https://api.github.com/repos/${repo[1]}/${name}`;
}

function refPath(ref) {
  if (typeof ref !== 'string' || !ref || ref.length > 255 || /[\s\x00-\x1f\x7f\\]/u.test(ref)
    || ref.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('릴리즈 태그 또는 ref가 올바르지 않습니다.');
  }
  return encodeURIComponent(ref);
}

async function prepareRelease(destination, ref, override) {
  const api = repositoryApi(override);
  let releaseTag;
  if (!ref) {
    const release = JSON.parse(utf8.decode(await download(`${api}/releases/latest`, '최신 정식 릴리즈 조회', MiB)));
    if (!release || release.draft !== false || release.prerelease !== false) {
      throw new Error('공개 정식 릴리즈의 정보가 올바르지 않습니다.');
    }
    releaseTag = release.tag_name;
    ref = releaseTag;
  }
  const encodedRef = refPath(ref);
  const archiveRef = releaseTag === undefined ? encodedRef : `refs%2Ftags%2F${encodedRef}`;
  const compressed = await download(`${api}/tarball/${archiveRef}`, '릴리즈 아카이브 다운로드', 64 * MiB, 'codeload.github.com');
  const source = extractArchive(compressed, destination);
  for (const part of ['bin', 'src', 'templates', 'skills']) {
    requireArchive(statSync(join(source, part), { throwIfNoEntry: false })?.isDirectory(), `필수 폴더 누락: ${part}`);
  }
  const packageInfo = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
  if (packageInfo.name !== 'pace' || typeof packageInfo.version !== 'string'
    || (releaseTag !== undefined && ![packageInfo.version, `v${packageInfo.version}`].includes(releaseTag))) {
    throw new Error('릴리즈 태그 또는 패키지의 PACE 버전이 일치하지 않습니다.');
  }
  return source;
}

try {
  const [, , destination, ref] = process.argv;
  if (!destination) throw new Error('릴리즈 임시 폴더를 지정하세요.');
  // Windows PowerShell 5.1 decodes native stdout in its console code page.
  // The shell already has the temporary directory, so return only its ASCII child name.
  console.log(basename(await prepareRelease(destination, ref, process.env.PACE_REPO_URL)));
} catch (error) {
  console.error(`PACE 릴리즈 준비 실패: ${error.message}`);
  process.exitCode = 1;
}
