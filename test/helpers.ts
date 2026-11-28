import { cpSync, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import { spawn, spawnSync, type ChildProcess, type SpawnSyncReturns } from "node:child_process";
import { packageRoot } from "../src/core/paths.ts";
import type { ProfileInput } from "../src/profile/profile.ts";

// A helper-importing child owns a sibling root, so its parent can exit first.
const inheritedTemp = realpathSync.native(tmpdir());
const inheritedOwner = process.env.PACE_TEST_TMP_OWNER;
const inheritedParent = process.env.PACE_TEST_TMP_PARENT;
let tempParent = inheritedTemp;
if (inheritedOwner && inheritedParent) {
  try {
    const owner = lstatSync(inheritedOwner);
    const withinOwner = relative(inheritedOwner, inheritedTemp);
    if (owner.isDirectory() && !owner.isSymbolicLink() && basename(inheritedOwner).startsWith("pace-test-run-") &&
        dirname(inheritedOwner) === inheritedParent && realpathSync.native(inheritedOwner) === inheritedOwner &&
        realpathSync.native(inheritedParent) === inheritedParent && !isAbsolute(withinOwner) &&
        withinOwner !== ".." && !withinOwner.startsWith(`..${sep}`)) tempParent = inheritedParent;
  } catch { /* A stale or untrusted inheritance cannot redirect cleanup. */ }
}
const tempRoot = mkdtempSync(join(tempParent, "pace-test-run-"));
const rootIdentity = lstatSync(tempRoot);
for (const key of ["TMPDIR", "TMP", "TEMP"]) process.env[key] = tempRoot;
// 테스트가 환경이나 기본 홈을 상속하더라도 실제 PACE 데이터를 쓰지 않는다.
process.env.PACE_HOME = join(tempRoot, "default-pace-home");
delete process.env.PACE_PROFILE;
process.env.PACE_TEST_TMP_OWNER = tempRoot;
process.env.PACE_TEST_TMP_PARENT = tempParent;

let childTimedOut = false;
const activeChildren = new Set<ChildProcess>();

/** 현재 테스트가 소유한 증거를 보존해야 할 때만 사용한다. 실패 판정은 호출자가 책임진다. */
export function preserveTestTemp(): void { childTimedOut = true; process.exitCode = 1; }

process.once("exit", () => {
  if (activeChildren.size > 0) {
    process.exitCode = 1;
    console.error("An active test child remains; preserving the temporary root");
    return;
  }
  if (process.env.PACE_KEEP_TEST_TMP === "1" || childTimedOut) return;
  try {
    let current: ReturnType<typeof lstatSync>;
    try { current = lstatSync(tempRoot); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    if (!current.isDirectory() || current.isSymbolicLink() || current.dev !== rootIdentity.dev || current.ino !== rootIdentity.ino ||
        dirname(tempRoot) !== tempParent || realpathSync.native(tempRoot) !== tempRoot || !basename(tempRoot).startsWith("pace-test-run-")) {
      throw new Error("Temporary test root was replaced; refusing cleanup");
    }
    rmSync(tempRoot, { recursive: true });
  } catch (error) {
    process.exitCode = 1;
    throw error;
  }
});

// Only children explicitly created by these tests are managed. Never scan or kill unrelated processes.
export function registerTestChild<T extends ChildProcess>(child: T, timeoutMs = 45_000): T {
  activeChildren.add(child);
  child.ref();
  const timer = setTimeout(() => {
    childTimedOut = true;
    process.exitCode = 1;
    console.error("Test child did not exit; preserving the temporary root");
    child.unref();
    for (const stream of child.stdio) stream?.destroy();
  }, timeoutMs);
  child.once("close", () => { activeChildren.delete(child); clearTimeout(timer); });
  child.once("error", () => { childTimedOut = true; process.exitCode = 1; clearTimeout(timer); });
  return child;
}

export const spawnTestChild: typeof spawn = ((...args: Parameters<typeof spawn>) =>
  registerTestChild(spawn(...args))) as typeof spawn;

export function tempDir(prefix = "pace-test-"): string {
  if (!prefix.startsWith("pace-") || basename(prefix) !== prefix || prefix.includes("\\")) throw new Error("Invalid test temporary directory prefix");
  return mkdtempSync(join(tempRoot, prefix));
}

/** 파일 프로세스/형태별 원본 한 번, 첫 호출을 포함한 모든 대상에 독립 파일 복사. */
export function reusableGitFixture(prepare: (source: string, firstDestination: string) => void): (destination: string) => void {
  let source: string | undefined;
  return (destination) => {
    const checkDestination = () => {
      const actual = realpathSync.native(destination), within = relative(tempRoot, actual);
      if (!within || isAbsolute(within) || within === ".." || within.startsWith(`..${sep}`) || lstatSync(destination).isSymbolicLink() || !lstatSync(destination).isDirectory() || readdirSync(destination).length) throw new Error("Git fixture destination must be an empty owned directory");
    };
    checkDestination();
    let prepared = source;
    if (!prepared) {
      const candidate = tempDir("pace-git-seed-");
      prepare(candidate, destination);
      const gitDir = join(candidate, ".git");
      if (!existsSync(gitDir) || !lstatSync(gitDir).isDirectory() || lstatSync(gitDir).isSymbolicLink()) throw new Error("Git fixture must have its own .git directory");
      const plainTree = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const path = join(dir, entry.name);
          if (entry.isSymbolicLink()) throw new Error("Git fixture seed must not contain symlinks");
          if (entry.isDirectory()) plainTree(path);
          else if (!entry.isFile()) throw new Error("Git fixture seed must contain regular files only");
        }
      };
      plainTree(candidate);
      if (existsSync(join(gitDir, "worktrees")) || existsSync(join(gitDir, "objects/info/alternates")) || /^\s*(?:worktree|hooksPath|fsmonitor)\s*=|^\s*\[include(?:If)?\b/im.test(readFileSync(join(gitDir, "config"), "utf8"))) throw new Error("Git fixture seed must be self-contained");
      const env: NodeJS.ProcessEnv = { ...sessionFreeEnv(), HOME: candidate, USERPROFILE: candidate };
      for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES"]) delete env[key];
      const head = spawnSync("git", ["-C", candidate, "rev-parse", "--verify", "HEAD"], { env, encoding: "utf8", timeout: 5000 });
      if (head.status !== 0) throw new Error(`Git fixture seed must be committed: ${head.stderr ?? head.error?.message ?? "unknown failure"}`);
      prepared = candidate;
    }
    checkDestination();
    // cpSync performs independent copies; do not use clone, alternates or hardlinks.
    cpSync(prepared, destination, { recursive: true, dereference: false, verbatimSymlinks: true });
    source = prepared;
  };
}

export const ALTU: ProfileInput = {
  name: "default",
  displayName: "알투",
  alias: "R2D2",
  ownerName: "캡틴",
  tone: "존댓말 + 친근",
  personality: "꼼꼼하고 솔직하며 차분하다",
  language: "ko",
};

export const PACE_BIN = join(packageRoot, "bin", "pace.ts");

export function runPace(
  args: string[],
  options: { home: string; cwd?: string; input?: string; env?: NodeJS.ProcessEnv; timeout?: number },
): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [PACE_BIN, ...args], {
    cwd: options.cwd ?? options.home,
    input: options.input,
    encoding: "utf8",
    timeout: options.timeout ?? 10_000,
    env: { ...sessionFreeEnv(), HOME: options.home, USERPROFILE: options.home, PACE_PROFILE: "", ...options.env, PACE_HOME: options.home },
  });
}

/**
 * 테스트가 세션 환경을 물려받아 실제 터미널·설정에 쓰지 않게 세션 변수를 뺀 환경.
 * (v1 사고: ORCA_TERMINAL_HANDLE로 사용자 터미널에 입력, CLAUDE_CONFIG_DIR로 실제 CLAUDE.md에 씀)
 */
export function sessionFreeEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    const upper = key.toUpperCase();
    if (/^(ORCA_|CLAUDE_|CODEX_|GEMINI_|CURSOR_)/.test(upper) || ["PACE_PROFILE", "TERM_PROGRAM", "CLAUDECODE"].includes(upper)) continue;
    env[upper === "PATH" ? "PATH" : key] = value;
  }
  return env;
}

/** Adapts the older verify fixtures to the structured prompt when they exercise a managed stage. */
export function scopedReviewFixture(prompt: string, text: string): string {
  if (text.includes("```pace-review")) return evidenceReviewFixture(prompt, text);
  const category = /```pace-review\n[^\n]*"category":"([^"]+)"/.exec(prompt)?.[1];
  const verdict = /\b(pass|fail)$/.exec(text.trim())?.[1];
  if (!category || !verdict) return text;
  const scenario = /\[blocking\]\s*([^\r\n]+)/.exec(text)?.[1] ?? "관측한 실패";
  const findings = verdict === "fail" ? [{
    id: "F1", severity: "blocking", category, location: "fixture.ts:1",
    scenario, reproduction: "고정 입력으로 기존 동작을 실행한다", confidence: "high",
  }] : [];
  return evidenceReviewFixture(prompt, [text, "```pace-review", JSON.stringify({ version: 1, findings }), "```", verdict].join("\n"));
}

/** 기존 회귀 fixture에는 합성 관측을 연결하되, 구조가 깨진 응답은 원래대로 검사한다. */
export function evidenceReviewFixture(prompt: string, text: string): string {
  if (!/```pace-review\n\{"version":2,/.test(prompt)) return text;
  const criteria = [...prompt.matchAll(/^\- \[(?:필수 기준|점검 항목) ([A-Z0-9-]+)\]/gm)].map((match) =>
    ({ id: match[1], state: /^R[ABC]-\d$/.test(match[1]!) ? "none" : "present", observation: "시험의 고정 입력에서 결과를 확인했다" }));
  return text.replace(/^(```pace-review[ \t]*\r?\n)([^\r\n]+)(\r?\n```)/m, (block, start: string, json: string, end: string) => {
    if (!/"version"\s*:\s*1\b/.test(json)) return block;
    const updated = json.replace(/"version"\s*:\s*1\b/, `"version":2,"criteria":${JSON.stringify(criteria)}`)
      .replace(/"severity"\s*:/g, '"impact":"goal","severity":');
    return start + updated + end;
  });
}

/** P017 T02: 구현 후 reviewer 프롬프트에서 뺀 main 기준 문장 7개(1단계 지시 3 · 범위 축소 4) */
export const POST_REMOVED_SENTENCES = [
  "지금은 1단계 독립 목표 대조다. 작업 문서(TASK·테스트 표·작성자 마감/자체 판정·지적 대응)는 받거나 읽지 않는다.",
  "첫 판단을 독립 목표 대조·목표 달성(달성/미달/미확인)·근거/한계·올릴 단계로 기록한다. 기준/형식 통과로 대신하지 않는다.",
  "2단계 작업 문서는 첫 판정을 받은 호출자가 1단계 원문과 함께 호스트 검토 절차로 별도 전달한다. 검토 주체가 바뀌면 제공자·독립성 수준·변경 이유를 기록한다. 이 호출만으로 두 단계가 실행됐다고 주장하지 않는다.",
  "판정 범위: 직전 검토의 blocking이 해소됐는지와 그 수정(바뀐 줄)이 만든 새 결함만 판정한다. 직전에 지적되지 않았고 바뀌지 않은 부분의 새 지적은 note로만 남기고 판정에 넣지 않는다.",
  "직전 판정은 pass였다. 해소 여부를 판정할 blocking은 없으며 이번 변경이 만든 결함만 판정한다.",
  "재검토에서 이전 기준 상태를 확인하고, 바뀐 증거와 그 영향만 새로 관측한다. 그대로 적용되는 확인의 근거를 함께 반환한다.",
  "지정한 지적과 적용한 수정의 영향만 판정한다. 수정 영향 밖의 다른 기존 지적은 note로 남긴다.",
] as const;

/** 구현 후 묶음 점검 프롬프트의 공통 단언: TASK·diff 원문, 12항목 전체 지시, 뺀 문장 부재 */
export function assertPostBundlePrompt(prompt: string, task: string, diff: string): void {
  const assert = (ok: boolean, message: string) => { if (!ok) throw new Error(`${message}\n---\n${prompt}`); };
  assert(prompt.includes(`## 태스크 계약: TASK.md\n${task}`), "루트 TASK.md 원문이 없다");
  assert(prompt.includes(diff), "diff 원문이 없다");
  assert(prompt.includes("세 묶음 12항목 전체를 diff 전체에 대해 답한다."), "12항목 전체 지시가 없다");
  for (const sentence of POST_REMOVED_SENTENCES) assert(!prompt.includes(sentence), `뺀 문장이 남았다: ${sentence}`);
  for (const id of ["RA", "RB", "RC"].flatMap((group) => [1, 2, 3, 4].map((n) => `${group}-${n}`))) assert(prompt.includes(`[점검 항목 ${id}]`), `${id} 항목이 없다`);
}
