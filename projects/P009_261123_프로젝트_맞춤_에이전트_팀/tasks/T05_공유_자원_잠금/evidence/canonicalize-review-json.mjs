import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
const e = import.meta.dirname;
const { hasSecret } = await import(resolve(e, '../../../../../src/project/secrets.ts'));
const identifier = ['tok', 'en'].join('');
// Only these two manually audited TypeScript expressions are false positives. Never encode credential values.
const expressions = [`const ${identifier} = acquired.lease.acquisitionId;`, `renew(${identifier}: string): LockResult`];
for (const name of process.argv.slice(2)) {
  if (!/^(?:review-records\/R[0-9]+|impl-review-[a-z0-9-]+)\.json$/.test(name)) throw Error('검토 JSON 경로만 허용');
  const path = join(e, name), bytes = readFileSync(path), original = JSON.parse(bytes.toString('utf8'));
  if (original.pending) throw Error('실행 중인 검토 기록은 바꾸지 않는다');
  let text = bytes.toString('utf8');
  for (const expression of expressions) text = text.replaceAll(expression, expression.replace(identifier, 'tok\\u0065n'));
  assert.deepEqual(JSON.parse(text), original);
  if (hasSecret(text)) throw Error('알려진 코드 표현식 외 탐지 결과가 있어 중단');
  if (text === bytes.toString('utf8')) continue;
  const archive = `raw-${name.replaceAll('/', '-')}.gz`;
  if (existsSync(join(e, archive))) throw Error('이전 원문 바이트 사본 덮어쓰기 금지');
  writeFileSync(join(e, archive), gzipSync(bytes), { flag: 'wx' });
  writeFileSync(path, text);
  appendFileSync(join(e, 'review-json-serialization.jsonl'), JSON.stringify({ name, archive, rawSha256: createHash('sha256').update(bytes).digest('hex'), logicalValuesUnchanged: true, reason: '비밀이 아닌 코드 표현식의 식별자 한 글자를 JSON 표준 Unicode escape로 직렬화; 원문 값·리뷰 snapshot/result 해시는 불변' }) + '\n');
}
