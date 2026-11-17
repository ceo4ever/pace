// vitest 드라이버: 러너 cwd의 로컬 vitest를 Node로 직접 실행해(.bin 셸 스크립트 없이) 한 번에 여러 파일을 돌리고,
// JSON 보고서를 fd3에 {success, counts:{tests, skipped, failed, todo}} 또는 {unavailable}로 넘긴다.
// 인자: <프로젝트 루트> <config 절대 경로 또는 ""> <테스트 파일 절대 경로...> — vitest는 루트 안에서만 찾는다(밖의 코드를 실행하지 않는다)
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';

const report = (value) => writeSync(3, JSON.stringify(value));
const [root, config, ...files] = process.argv.slice(2);

function findVitest(start) {
  for (let dir = resolve(start); ; dir = dirname(dir)) {
    const pkg = join(dir, 'node_modules', 'vitest', 'package.json');
    if (existsSync(pkg)) {
      const data = JSON.parse(readFileSync(pkg, 'utf8'));
      const bin = typeof data.bin === 'string' ? data.bin : data.bin?.vitest;
      if (typeof bin === 'string') return join(dirname(pkg), bin);
    }
    if (dir === top || dirname(dir) === dir) return null;
  }
}

const top = realpathSync.native(root);
const here = realpathSync.native(process.cwd());
const bin = findVitest(here);
if (!bin) { report({ unavailable: '로컬 vitest 없음(node_modules/vitest) — 의존성 설치 필요' }); process.exit(0); }

const out = mkdtempSync(join(tmpdir(), 'pace-vitest-'));
const outputFile = join(out, 'report.json');
const posix = (p) => p.split(sep).join('/');
const args = [bin, 'run', '--reporter=json', `--outputFile=${outputFile}`, ...(config ? ['--config', config] : []), ...files.map((f) => posix(relative(here, f)))];
const child = spawn(process.execPath, args, { stdio: ['ignore', 'inherit', 'inherit'] });
const forward = (signal) => { try { child.kill(signal); } catch {} };
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { forward(signal); process.exit(1); });
child.on('close', (status, signal) => {
  try {
    if (!existsSync(outputFile)) { report({ unavailable: `vitest 보고서 없음(종료 ${status ?? signal})` }); return; }
    const r = JSON.parse(readFileSync(outputFile, 'utf8'));
    const ran = new Set((r.testResults ?? []).map((t) => posix(realpathSync.native(t.name))));
    const missing = files.filter((f) => !ran.has(posix(realpathSync.native(f))));
    const failedFiles = (r.testResults ?? []).filter((t) => t.status === 'failed').length;
    if (missing.length) process.stderr.write(`실행되지 않은 파일: ${missing.map((f) => posix(relative(here, f))).join(', ')}\n`);
    report({
      success: r.success === true && !missing.length && !failedFiles && r.numFailedTestSuites === 0,
      counts: { tests: r.numTotalTests, skipped: r.numPendingTests, failed: r.numFailedTests + failedFiles + missing.length, todo: r.numTodoTests ?? 0 },
    });
  } catch (error) {
    report({ unavailable: `vitest 보고서 해석 실패: ${error.message}` });
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
