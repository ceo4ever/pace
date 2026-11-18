import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const sha=b=>createHash('sha256').update(b).digest('hex');
export function expectedWrapperSource(before){
 const eol=before.includes('\r\n')?'\r\n':'\n';
 const replace=(a,b)=>{assert.equal(before.split(a).length,2,'Exactly one expected source site');before=before.replace(a,b);};
 replace("import { existsSync, mkdirSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs';","import { existsSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, lstatSync, realpathSync, statSync } from 'node:fs';");
 replace("import { join } from 'node:path';","import { dirname, join } from 'node:path';");
 replace('  const version = run(\'PATH="$(cygpath -u "$P034_BIN"):$PATH"; command -v pace; pace --version\');','  const version = run(\'PATH="$(cygpath -u "$P034_BIN"):$PATH" && actual="$(command -v pace)" && printf "pace wrapper lookup: %s\\\\n" "$actual" >&2 && cygpath -aw "$actual" && pace --version\');');
 replace(['  const expectedBin = run(\'cygpath -u "$P034_BIN"\');','  assert.equal(version.stdout.trim().split(/\\r?\\n/)[0], `${expectedBin.stdout.trim()}/pace`);'].join(eol),[
 '  const resolvedWrapper = version.stdout.trim().split(/\\r?\\n/)[0];',
 '  assert.ok(resolvedWrapper, version.stderr);',
 "  const expectedWrapper = join(bin, 'pace');",
 '  assert.equal(lstatSync(resolvedWrapper).isFile(), true, version.stderr);',
 '  assert.equal(realpathSync.native(dirname(resolvedWrapper)), realpathSync.native(bin), version.stderr);',
 '  assert.equal(realpathSync.native(resolvedWrapper), realpathSync.native(expectedWrapper), version.stderr);',
 '  const resolvedInfo = statSync(resolvedWrapper, { bigint: true }), expectedInfo = statSync(expectedWrapper, { bigint: true });',
 '  assert.equal(expectedInfo.isFile(), true);',
 '  assert.equal(resolvedInfo.dev, expectedInfo.dev, version.stderr);',
 '  assert.equal(resolvedInfo.ino, expectedInfo.ino, version.stderr);',
 ].join(eol));
 return before;
}
export function auditWrapper(before,after){
 assert.equal(after,expectedWrapperSource(before),'Only the exact wrapper assertion/import changes are allowed');
 return {beforeSha256:sha(before),afterSha256:sha(after),exactExpectedTransformation:true,outsideTargetAndTwoImportsByteIdentical:true,caseNamesAndSkipUnchanged:true,retainedVersionHookAndArgumentAssertions:true,regularFileAndBinParent:true,nativeAndBigintIdentity:true,rawLookupStderr:true,explicitFailurePropagation:true};
}
export function actualWrapperAudit(){
 const before=fs.readFileSync(path.join(here,'evidence/wrapper-before.test.ts.txt'),'utf8'),after=fs.readFileSync(path.resolve(here,'../../../../test/install-windows-wrapper.test.ts'),'utf8'),expected=JSON.parse(fs.readFileSync(path.join(here,'evidence/wrapper-source-change.json'),'utf8'));
 const report=auditWrapper(before,after);assert.equal(report.beforeSha256,expected.beforeSha256);assert.equal(report.afterSha256,expected.afterSha256);return report;
}
