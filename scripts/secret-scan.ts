#!/usr/bin/env node
/**
 * 이 저장소의 보안 검사(docs/README.md 환경 "보안 검사"): 커밋될 파일(추적 + 무시되지 않는 새 파일)에서 비밀 값 원문을 찾는다.
 * finish는 이 검사 뒤 `git add -A`로 커밋하므로 새 파일도 본다.
 * 사용: node scripts/secret-scan.ts [저장소 루트]  — 찾으면 파일 목록과 함께 종료 코드 1.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hasSecret } from "../src/project/harness.ts";
import { isCodeFile } from "../src/project/secrets.ts";

/** 비밀처럼 보이는 예시를 일부러 담은 곳 — 이유와 함께만 더한다. */
const IGNORE: [string, string][] = [
  // 외부 교본 원문의 예시 코드(가짜 키·토큰 변수) — 폴더가 아니라 걸리는 파일만
  ["skills/pace-tech-handbook/references/common/api-design/GUIDE.md", "외부 교본 예시"],
  ["skills/pace-tech-handbook/references/kotlin/rules-kotlin/security.md", "외부 교본 예시"],
  ["skills/pace-tech-handbook/references/python/fastapi-patterns/GUIDE.md", "외부 교본 예시"],
  ["skills/pace-tech-handbook/references/python/python-testing/GUIDE.md", "외부 교본 예시"],
  ["skills/pace-tech-handbook/references/typescript/backend-patterns/GUIDE.md", "외부 교본 예시"],
  ["test/project-harness.test.ts", "비밀 탐지 테스트의 가짜 값"],
  ["test/secret-scan.test.ts", "비밀 탐지 테스트의 가짜 값"],
  ["test/agent-setup.test.ts", "P035: 자격증명 비복사 시험의 SENTINEL 가짜 값"],
  ["test/daemon-install-wizard.test.ts", "P035: 설치 마법사 시험의 가짜 토큰"],
  ["test/daemon-runner.test.ts", "P035: 시험용 합성 봇 토큰"],
  ["test/daemon-wizard-follow.test.ts", "P035: 시험용 합성 봇 토큰 변수"],
  ["test/telegram-format.test.ts", "P035: 시험용 합성 토큰"],
  ["test/telegram-helpers.ts", "P035: 시험용 합성 봇 토큰"],
];
const ignored = (file: string) => IGNORE.some(([path]) => (path.endsWith("/") ? file.startsWith(path) : file === path));

// Canvas Studio canvas-skills 2.0.1 배포 JS의 오탐(변수명 token·"password" 입력 종류 비교·DOMTokenList 등). 경로와 SHA-256이 모두 같을 때만 제외한다.
const CANVAS_DIR = "skills/pace-canvas-skills/runtime/app/_next/static/chunks/";
const CANVAS_FALSE_POSITIVES = new Map<string, string>(([
  ["38.80f58c91800c3def.js", "1e576b83cfa50f013451fa3052e70b99a77911a173f0c8e85a01e32d154afe5d"],
  ["4bd1b696-5baba7b99ef0a4e0.js", "3a62bfff9472046cfae6911a20444b2a705f2c1983f651876fa76703eee88bda"],
  ["985.c156f701f79f13d9.js", "a565a0f3615b119b8b7adb38bf1774e8ce768e2c081b4dc01a23c1ea5e2e31e1"],
  ["framework-319ad94eef5a05ff.js", "ff49e81eb02dd0ada4fee63e6776fec738f1a411d5372430384f575375a140ea"],
  ["polyfills-42372ed130431b0a.js", "0973c1d64c88adc8e3c950410cb58b288f72118d5965b78049438deb8f2f9683"],
] as const).map(([name, hash]) => [CANVAS_DIR + name, hash]));

// 자동 생성 대시보드(window.PACE_DATA = JSON) — 파일째 제외하지 않고 JSON을 풀어 문자열 값마다 검사한다(유니코드·줄바꿈 이스케이프가 판정을 가리지 않게).
// 풀 수 없으면 원문 그대로 검사한다.
const DASHBOARD_DATA = "backlogs/dashboard/data.js";
function dashboardHasSecret(text: string): boolean {
  const start = text.indexOf("{", text.indexOf("window.PACE_DATA"));
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return hasSecret(text);
  let data: unknown;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return hasSecret(text);
  }
  // JSON 밖의 내용도 검사한다(머리 주석·대입문·끝 문장).
  const strict: string[] = [text.slice(0, start), text.slice(end + 1)];
  const code: string[] = []; // 키가 코드 파일 경로인 본문 — 코드 파일 판정
  const walk = (value: unknown): void => {
    if (typeof value === "string") strict.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        strict.push(k);
        if (typeof v === "string" && isCodeFile(k)) { code.push(v); continue; }
        // 비밀 이름 키와 문자열 값의 관계("token": "…")를 원문 리터럴 대입으로 다시 만들어 검사한다. 경로형 키는 제외.
        if ((typeof v === "string" || typeof v === "number") && /^[A-Za-z_][\w-]*$/.test(k) && /password|passwd|secret|token|api[_-]?key/i.test(k)) strict.push(`${k} = ${JSON.stringify(v)}`);
        walk(v);
      }
    }
  };
  walk(data);
  // 중복 키 앞쪽 값은 JSON.parse가 버리므로 원문에서 비밀 이름 키-값 쌍을 따로 본다.
  for (const m of text.slice(start, end + 1).matchAll(/"([^"\\]*)"\s*:\s*("(?:[^"\\]|\\.)*"|-?\d+)/g)) {
    if (/password|passwd|secret|token|api[_-]?key/i.test(m[1]!) && /^[A-Za-z_][\w-]*$/.test(m[1]!)) strict.push(`${m[1]} = ${m[2]}`);
  }
  return strict.some((v) => hasSecret(v)) || code.some((v) => hasSecret(v, { code: true }));
}

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
let files: string[];
try {
  const out = execFileSync("git", ["-C", root, "ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  files = [...new Set(out.split("\0").filter(Boolean))];
} catch (error) {
  console.error(`비밀 검사 실패: git 파일 목록을 읽지 못했다 (${root}) — ${(error as Error).message.split("\n")[0]}`);
  process.exit(1);
}
const found: string[] = [];
let scanned = 0;
for (const file of files) {
  if (ignored(file)) continue;
  let bytes: Buffer;
  try {
    bytes = readFileSync(join(root, file));
  } catch {
    continue; // 지운 뒤 커밋 전 파일
  }
  const expectedHash = CANVAS_FALSE_POSITIVES.get(file);
  if (expectedHash && createHash("sha256").update(bytes).digest("hex") === expectedHash) continue;
  if (bytes.subarray(0, 8000).includes(0)) continue;
  scanned++;
  const text = bytes.toString("utf8");
  if (file === DASHBOARD_DATA ? dashboardHasSecret(text) : hasSecret(text, { code: isCodeFile(file) })) found.push(file);
}
if (found.length > 0) {
  console.error(`비밀 노출 의심 ${found.length}건 — 원문을 지우고 환경 변수 이름으로:\n${found.map((f) => `- ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`비밀 검사 통과: ${scanned}개 파일 (제외: ${IGNORE.map(([p]) => p).join(", ")}; Canvas 묶음 JS 5개는 경로·SHA-256 일치 시 제외)`);
