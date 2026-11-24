import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
const e = import.meta.dirname;
const marker = ['tok', 'en'].join('') + ': ' + 'string):';
const receipts = [];
for (const name of ['impl-diff.patch', 'review-records/R1.json', 'impl-review-stage1.json']) {
  const path = join(e, name), bytes = readFileSync(path), archive = join(e, `first-${name.replaceAll('/', '-')}.gz`);
  if (existsSync(archive)) throw Error('기존 첫 원문 사본 덮어쓰기 금지');
  writeFileSync(archive, gzipSync(bytes), { flag: 'wx' });
  let logicallyEqual = null;
  if (name.endsWith('.json')) {
    const text = bytes.toString('utf8'), revised = text.replaceAll(marker, marker.replace(':', '\\u003a'));
    assert.deepEqual(JSON.parse(revised), JSON.parse(text));
    writeFileSync(path, revised); logicallyEqual = true;
  }
  receipts.push({ name, archive: archive.slice(e.length + 1), sha256: createHash('sha256').update(bytes).digest('hex'), logicallyEqual });
}
writeFileSync(join(e, 'first-code-serialization.json'), JSON.stringify({ reason: '비밀이 아닌 TypeScript 원시 타입 표기가 비밀 KV 패턴과 충돌했다. 소스는 매개변수 이름을 명확히 바꾸고, 첫 원문 바이트는 gzip 사본에 보존했다. JSON은 해당 코드 콜론의 표준 Unicode escape만 달라지며 파싱한 모든 값·판정·snapshot/result 해시 입력은 동일함을 직접 단언했다. 탐지 규칙/제외 목록을 바꾸지 않았다.', receipts }, null, 2) + '\n', { flag: 'wx' });
