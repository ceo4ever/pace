import { adoptTeamMetrics, teamRetrospectiveIssues, teamRetrospectiveRequired } from "./team-retrospective.ts";
import { InputSnapshot } from "../core/input-snapshot.ts";
import { assertTeamFinishDestination, assertTeamFinishInputs, assertTeamFinishScope, checkedTeamTarget, commitTeamFinish, hasTeamFinishHistory, teamFinishFile, writeTeamFinish } from "./team-finish.ts";
import { resolveWorkerRole, roleInstruction, startRoleRecord, type WorkerRole } from "../team/worker-role.ts";
import { safeTeamPath } from "../team/store.ts";
import { hasPermissionReview, reviewIssues, taskPlanWarnings, workingReview, type PermissionCheck, type ReviewCandidate } from "./pre-review.ts";
import { APPLIED_REVIEW, isGitObject, permissionPath, type ApprovedTaskEdit, type ReviewPermission } from "./review-permission.ts";
import { shellState } from "./shell-result.ts";
import { generateDashboard, refreshDashboard } from "./dashboard.ts";
import { resolveWorkerSettings } from "../core/worker-settings.ts";
import { assertBacklogPath, listBriefs, resolveBacklog } from "./backlog.ts";
import { eventLines, memoDateTime, recordEvent } from "./event-log.ts";
import { LEDGER_LIMIT, regularBytes, utf8 } from "./handoff-files.ts";
import { handoffCommitPrivacyIssues, handoffPrivacyIssues } from "./handoff-private.ts";
import { collectHandoffs } from "./handoff-report.ts";
import { hasSecret, isCodeFile } from "./secrets.ts";
export { hasSecret } from "./secrets.ts";
import { assertMetricsDestination, refreshProjectMetrics, metricsSummaryIssues, collectDashboard } from "./metrics-report.ts";
import { assertTeamCommitReceipts } from "./team-input.ts";
import { recordMetric, metricDir, failureReason } from "./metrics.ts";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, readdirSync, realpathSync, statSync, unlinkSync, writeFileSync, renameSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fillTemplate, folderName, today, writeFileAtomic } from "../core/fsutil.ts";
import { assertSafeGitPath, templatesDir } from "../core/paths.ts";
import { projectMemoryDir, rebuildMemoryIndex } from "../memory/memory.ts";
import { brainDir, brainUpdateCandidates, lintBrain, rebuildBrainIndex, searchBrain } from "./brain.ts";

/**
 * 작업 하네스 — 업무를 프로젝트(projects/P###)·태스크로 수행한다 (백로그 261023 D1~D4).
 * 글쓰기는 에이전트가 하고, 여기서는 번호·폴더·worktree·게이트 확인·병합만 기계적으로 처리한다.
 * 프로젝트마다 worktree 하나(../{저장소}.wt/P###/, 브랜치 project/P###). finish는 worktree에서, merge는 main에서만.
 */

export class HarnessError extends Error {}
class MergeBookkeepingError extends HarnessError {
  readonly metricReason: string;
  constructor(message: string, reason: string) { super(message); this.metricReason = reason; }
}

const PROJECT_DIR = /^P(\d{3})_(\d{6})_(.+)$/;
const TASK_DIR = /^T(\d{2})_(.+)$/;
export interface Repo {
  /** 지금 체크아웃(main 또는 worktree)의 루트 */
  root: string;
  /** main 체크아웃의 루트 */
  mainRoot: string;
  /** linked worktree 안인지 */
  inWorktree: boolean;
  branch: string;
  base: string;
}

export interface ProjectRef {
  id: string;
  dir: string;
  name: string;
  branch: string;
  worktree: string;
}

export interface Report {
  ok: boolean;
  issues: string[];
  notes: string[];
  reviewEdit?: ApprovedTaskEdit;
}

// ── git ─────────────────────────────────────────────────────────────

// 묻는 프롬프트·멈춘 git이 명령(부트 포함)을 붙잡지 않게.
const GIT_ENV = { GIT_EDITOR: "true", GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" };
// 한글 경로를 이스케이프하지 않게 — 사용자 설정(core.quotepath)에 기대지 않는다.
const GIT_OPTS = ["-c", "core.quotepath=false"];
const GIT_TIMEOUT = 120_000;
let gitLimits: { timeout: number; deadline?: number; env: Record<string, string> } = { timeout: GIT_TIMEOUT, env: {} };

/** 부트처럼 빨리 끝나야 하는 곳에서 git 시간 제한을 줄이고 원격 지연 가져오기를 막는다. */
export function withGitLimits<T>(timeout: number, fn: () => T): T {
  const saved = gitLimits;
  gitLimits = { timeout, deadline: Math.min(saved.deadline ?? Infinity, Date.now() + timeout), env: { ...saved.env, GIT_NO_LAZY_FETCH: "1" } };
  try {
    return fn();
  } finally {
    gitLimits = saved;
  }
}

function gitSpawn(cwd: string, args: string[], extraEnv: Record<string, string> = {}) {
  return spawnSync("git", [...GIT_OPTS, "-C", cwd, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...GIT_ENV, ...gitLimits.env, ...extraEnv },
    timeout: gitLimits.deadline === undefined ? gitLimits.timeout : Math.max(1, Math.min(gitLimits.timeout, gitLimits.deadline - Date.now())),
    // 출력은 로컬 저장소 크기만큼이라 상한을 두지 않는다 — 멈춤은 timeout이 막는다(기본 1MB는 큰 저장소에서 실패)
    maxBuffer: Infinity,
  });
}

/** git 실패 원인 한 줄: stderr·stdout, 없으면 실행 오류(시간 초과 등)·신호·종료 코드. */
export function spawnFailure(r: { status: number | null; signal?: NodeJS.Signals | null; error?: Error; stdout?: string | null; stderr?: string | null }): string {
  const text = `${r.stderr ?? ""}`.trim() || `${r.stdout ?? ""}`.trim();
  const parts = [text, r.error ? `실행 오류: ${(r.error as NodeJS.ErrnoException).code ?? r.error.message}` : "", r.signal ? `신호 ${r.signal}` : "", r.status !== null ? `종료 코드 ${r.status}` : ""].filter(Boolean);
  return parts.join(" · ") || "원인 정보 없음";
}

function git(cwd: string, args: string[], allowFail = false): string {
  const r = gitSpawn(cwd, args);
  if (r.status !== 0 && !allowFail) throw new HarnessError(`git ${args.join(" ")} 실패: ${(r.stderr || r.stdout).trim()}`);
  return r.status === 0 ? r.stdout.trim() : "";
}

function gitPath(cwd: string, args: string[]): string {
  const r = gitSpawn(cwd, args);
  if (r.status !== 0) throw new HarnessError(`git ${args.join(" ")} 실패: ${(r.stderr || r.stdout).trim()}`);
  return r.stdout.endsWith("\n") ? r.stdout.slice(0, -1) : r.stdout;
}

/** Git의 경로 출력과 비교할 때는 Windows에서도 슬래시를 사용한다. */
function relativeGitPath(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

/** 커밋하지 않은 변경 경로. 범위 검사는 이름 바꿈을 삭제와 추가로 모두 확인한다. */
function pendingPaths(root: string, detectRenames = true): string[] {
  const r = gitSpawn(root, ["status", "--porcelain", "-z", "--untracked-files=all", ...(detectRenames ? [] : ["--no-renames"])]);
  if (r.status !== 0) {
    if (!detectRenames) throw new HarnessError("마감 범위의 변경 경로를 확인하지 못했다");
    return [];
  }
  const entries = r.stdout.split("\0");
  const paths: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    if (entry.length < 4) continue;
    paths.push(entry.slice(3));
    if (/[RC]/.test(entry.slice(0, 2))) i++;
  }
  return paths;
}

/** Hash only: never persist source contents while checking command side effects. */
function finishInputFingerprint(root: string): string {
  const hash = createHash("sha256");
  for (const args of [["rev-parse", "HEAD"], ["status", "--porcelain", "-z", "--untracked-files=all"], ["diff", "--binary", "HEAD"], ["diff", "--cached", "--binary"]]) hash.update(git(root, args));
  const untracked = gitSpawn(root, ["ls-files", "--others", "--exclude-standard", "-z"]);
  if (untracked.status !== 0) throw new HarnessError("검사 전후 미추적 자료를 확인하지 못했다");
  for (const path of untracked.stdout.split("\0").filter(Boolean).sort()) {
    const absolute = join(root, path), stat = lstatSync(absolute);
    hash.update(path).update("\0").update(String(stat.mode));
    if (stat.isSymbolicLink()) hash.update(readlinkSync(absolute));
    else if (stat.isFile()) hash.update(readFileSync(absolute));
    else throw new HarnessError("검사 전후 비교는 일반 파일/링크만 지원한다");
  }
  return hash.digest("hex");
}

function gitOk(cwd: string, args: string[]): boolean {
  return gitSpawn(cwd, args).status === 0;
}

function stageDashboard(root: string): boolean {
  let generated: string | null;
  try { generated = generateDashboard(root, true); }
  catch (error) { throw new HarnessError(`대시보드 갱신 실패: ${error instanceof Error ? error.message : String(error)}`); }
  if (generated === null) return false;
  git(root, ["add", "--", "backlogs/dashboard/data.js"]);
  return true;
}

// 이번 명령이 쓰는 파일과 인덱스 항목만 실패 전 값으로 복원한다.
export function snapshotOwned(root: string, paths: string[]): () => void {
  const snapshots = [...new Set(paths)].map((path) => {
    const absolute = resolve(root, path);
    let body: Buffer | null = null;
    let mode = 0o600;
    try {
      const info = lstatSync(absolute);
      if (!info.isFile() || info.isSymbolicLink()) throw new HarnessError(`일반 파일이 아니다: ${path}`);
      body = readFileSync(absolute);
      mode = info.mode & 0o7777;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const index = gitSpawn(root, ["ls-files", "--stage", "-z", "--", path]);
    if (index.status !== 0) throw new HarnessError(`인덱스를 읽지 못했다: ${path} — ${spawnFailure(index)}`);
    const entry = /^(\d+) ([0-9a-f]+) 0\t/.exec(index.stdout);
    if (index.stdout && !entry) throw new HarnessError(`충돌 중인 인덱스: ${path}`);
    return { path, absolute, body, mode, entry };
  });
  return () => {
    for (const item of snapshots) {
      if (item.body === null) { if (existsSync(item.absolute)) unlinkSync(item.absolute); }
      else {
        const temp = join(dirname(item.absolute), `.pace-restore-${randomBytes(12).toString("hex")}.tmp`);
        try {
          writeFileSync(temp, item.body, { flag: "wx", mode: item.mode });
          chmodSync(temp, item.mode);
          renameSync(temp, item.absolute);
        } finally { if (existsSync(temp)) unlinkSync(temp); }
      }
      const gitPath = process.platform === "win32" ? item.path.replaceAll("\\", "/") : item.path;
      if (item.entry) git(root, ["update-index", "--add", "--cacheinfo", item.entry[1]!, item.entry[2]!, gitPath]);
      else git(root, ["update-index", "--force-remove", "--", gitPath]);
    }
  };
}

/** Keep append-only event bodies; roll back only this command's index ownership. */
function snapshotFinishOwned(root: string, paths: string[], logPath: string, preserveLog: boolean): () => void {
  if (!preserveLog) return snapshotOwned(root, paths);
  const restore = snapshotOwned(root, paths.filter((path) => path !== logPath));
  const gitLog = relativeGitPath(root, resolve(root, logPath));
  const index = gitSpawn(root, ["ls-files", "--stage", "-z", "--", gitLog]);
  if (index.status !== 0) throw new HarnessError("finish 로그 인덱스를 확인하지 못했다");
  const entry = /^(\d+) ([0-9a-f]+) 0\t/.exec(index.stdout);
  if (index.stdout && !entry) throw new HarnessError("finish 로그 인덱스가 충돌 중이다");
  return () => {
    restore();
    if (entry) git(root, ["update-index", "--add", "--cacheinfo", entry[1]!, entry[2]!, gitLog]);
    else git(root, ["update-index", "--force-remove", "--", gitLog]);
  };
}

/** 복원 오류가 최초 실패를 가리지 않도록 둘 다 남긴다. */
export function restoreAfterFailure(error: unknown, restore: () => void): never {
  try { restore(); } catch (restoreError) {
    throw new HarnessError(`원래 오류: ${error instanceof Error ? error.message : String(error)}\n복원 실패: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}`, { cause: error });
  }
  throw error;
}

export function withRestoration<T>(operation: () => T, restore: () => void): T {
  let result: T;
  try { result = operation(); } catch (error) { restoreAfterFailure(error, restore); }
  restore();
  return result;
}

function requireCleanBacklog(root: string, path: string): void {
  if (!gitOk(root, ["diff", "--quiet", "--", path]) || !gitOk(root, ["diff", "--cached", "--quiet", "--", path]) || !gitOk(root, ["ls-files", "--error-unmatch", "--", path])) throw new HarnessError("백로그 원본 또는 인덱스에 커밋하지 않은 변경이 있다");
}

// 일부만 스테이징한 프로젝트 문서를 git add가 덮어쓰지 않게 한다.
function guardPartialProjectStages(root: string, project: string): void {
  const result = gitSpawn(root, ["diff", "--cached", "--name-only", "-z", "--", project]);
  if (result.status !== 0) throw new HarnessError("프로젝트 인덱스를 확인하지 못했다");
  const partial = result.stdout.split("\0").filter((path) => path && !gitOk(root, ["diff", "--quiet", "--", path]));
  if (partial.length) throw new HarnessError(`프로젝트에 부분 스테이징된 변경이 있다: ${partial.slice(0, 5).join(", ")}`);
}

// 대시보드는 인덱스를 읽으므로 이 명령과 무관한 staged 문서를 포함하지 않는다.
function guardDashboardDrafts(root: string, allowed: string[]): void {
  if (!existsSync(join(root, "backlogs", "README.html")) || !existsSync(join(root, "backlogs", "dashboard", "data.js"))) return;
  const result = gitSpawn(root, ["diff", "--cached", "--name-only", "-z", "--", "backlogs", "projects"]);
  if (result.status !== 0) throw new HarnessError("대시보드 입력 인덱스를 확인하지 못했다");
  const stray = result.stdout.split("\0").filter((p) => p && !allowed.some((a) => p === a || p.startsWith(a + "/")));
  if (stray.length) throw new HarnessError(`대시보드에 무관한 스테이징 초안이 있다: ${stray.slice(0, 5).join(", ")}`);
}

export function openRepo(cwd: string, base = "main"): Repo {
  try { assertSafeGitPath(cwd); } catch (error) { throw new HarnessError(error instanceof Error ? error.message : String(error)); }
  // rebase·diff·log 인자로 들어가므로 git 옵션으로 읽힐 값은 받지 않는다.
  if (base.startsWith("-") || !gitOk(cwd, ["check-ref-format", "--branch", base])) throw new HarnessError(`기준 브랜치 이름이 아니다: ${base}`);
  if (!gitOk(cwd, ["rev-parse", "--git-dir"])) throw new HarnessError("git 저장소가 아니다");
  const root = gitPath(cwd, ["rev-parse", "--show-toplevel"]);
  const gitDir = gitPath(cwd, ["rev-parse", "--path-format=absolute", "--git-dir"]);
  const commonDir = gitPath(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  try { for (const path of [root, gitDir, commonDir]) assertSafeGitPath(path); }
  catch (error) { throw new HarnessError(error instanceof Error ? error.message : String(error)); }
  const inWorktree = resolve(gitDir) !== resolve(commonDir);
  return { root, mainRoot: inWorktree ? dirname(commonDir) : root, inWorktree, branch: git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]), base };
}

function worktreeOf(repo: Repo, branch: string): string | null {
  const out = git(repo.mainRoot, ["worktree", "list", "--porcelain"]);
  let path: string | null = null;
  for (const line of out.split("\n")) {
    if (line.startsWith("worktree ")) path = line.slice(9);
    if (line === `branch refs/heads/${branch}` && path !== null) {
      try { assertSafeGitPath(path, true); } catch (error) { throw new HarnessError(error instanceof Error ? error.message : String(error)); }
      return path;
    }
  }
  return null;
}

function branchExists(repo: Repo, branch: string): boolean {
  return gitOk(repo.mainRoot, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
}

function isClean(root: string): boolean {
  return git(root, ["status", "--porcelain"]) === "";
}

// ── 프로젝트 찾기 ───────────────────────────────────────────────────

function projectsRoot(root: string): string {
  return join(root, "projects");
}

function refFor(repo: Repo, dirName: string): ProjectRef {
  const m = PROJECT_DIR.exec(dirName);
  if (m === null) throw new HarnessError(`프로젝트 폴더 형식이 아니다: ${dirName}`);
  const id = `P${m[1]}`;
  return {
    id,
    dir: dirName,
    name: m[3]!.replace(/_/g, " "),
    branch: `project/${id}`,
    worktree: join(dirname(repo.mainRoot), `${basename(repo.mainRoot)}.wt`, id),
  };
}

function localProjectDirs(root: string): string[] {
  const dir = projectsRoot(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => PROJECT_DIR.test(n) && statSync(join(dir, n)).isDirectory()).sort();
}

export function findProject(repo: Repo, id: string): ProjectRef {
  const want = id.toUpperCase();
  const name = localProjectDirs(repo.root).find((n) => n.startsWith(`${want}_`));
  if (name === undefined) throw new HarnessError(`프로젝트를 찾지 못했다: ${id} (${projectsRoot(repo.root)})`);
  return refFor(repo, name);
}

function projectFile(repo: Repo, ref: ProjectRef, file = "PROJECT.md"): string {
  return join(projectsRoot(repo.root), ref.dir, file);
}

export function nextProjectNumber(repo: Repo): number {
  const fromDirs = localProjectDirs(repo.mainRoot).map((n) => Number(PROJECT_DIR.exec(n)![1]));
  const fromBranches = git(repo.mainRoot, ["for-each-ref", "--format=%(refname:short)", "refs/heads/project/"], true)
    .split("\n")
    .map((b) => /^project\/P(\d{3})$/.exec(b)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number);
  return Math.max(0, ...fromDirs, ...fromBranches) + 1;
}

// ── 문서 읽기·고치기 ────────────────────────────────────────────────

function yymmdd(date: string): string {
  return date.replace(/-/g, "").slice(2);
}


function template(name: string): string {
  return readFileSync(join(templatesDir, "project", name), "utf8");
}

export function readState(text: string): string {
  return /^- 상태: (.+)$/m.exec(text)?.[1]?.trim() ?? "";
}

function setState(text: string, state: string): string {
  return text.replace(/^- 상태: .+$/m, `- 상태: ${state}`);
}

/** LF·CRLF 문서에서 제목 다음 본문의 원문 위치. 쓰기 때 줄바꿈을 보존한다. */
function sectionStart(text: string, heading: string): number {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\n)${escaped}\\r?\\n`).exec(text);
  return match ? match.index + match[0].length : -1;
}

/** `## 제목` 절의 표 행(머리·구분선 제외)을 칸 배열로. */
export function tableRows(text: string, heading: string): string[][] {
  const body = sectionBody(text, heading);
  if (body === null) return [];
  const lines = body.split(/\r?\n/).filter((l) => l.startsWith("|"));
  return lines
    .slice(2)
    .map((l) => l.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
}

/** 새 4칸과 기존 5칸 태스크 표를 공통 형태 [번호, 이름, 옛 단계, 상태, 커밋]로 읽는다. */
function taskRows(text: string): string[][] {
  return tableRows(text, "## 태스크").map((row) => legacyTasks(text) ? row : [row[0] ?? "", row[1] ?? "", "", row[2] ?? "", row[3] ?? ""]);
}

function legacyTasks(text: string): boolean {
  const section = sectionBody(text, "## 태스크") ?? "";
  const header = section.split(/\r?\n/).find((line) => line.startsWith("|")) ?? "";
  return header.split("|").some((cell) => cell.trim() === "백로그 단계");
}

/** 절 안 첫 표의 마지막 행 뒤에 행을 넣는다. */
function appendRow(text: string, heading: string, row: string): string {
  const start = sectionStart(text, heading);
  if (start === -1) throw new HarnessError(`절이 없다: ${heading}`);
  const lines = text.split(/\r?\n/);
  let i = text.slice(0, start).split(/\r?\n/).length - 1; // heading 다음 줄
  while (i < lines.length && !lines[i]!.startsWith("|")) i++;
  while (i < lines.length && lines[i]!.startsWith("|")) i++;
  lines.splice(i, 0, row);
  return lines.join(text.includes("\r\n") ? "\r\n" : "\n");
}

/**
 * docs/README.md(없으면 docs/PROJECT.md)에서 라벨 뒤 첫 `명령`을 읽는다.
 * 라벨은 표 첫 칸(`| 검사 |`)이나 목록 항목 맨 앞(`- 검사:`)에 있어야 한다 — 설명 문장 속 라벨은 선언이 아니다.
 */
function commandInDocument(text: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const row = new RegExp(`^\\s*(?:\\|\\s*|[-*]\\s+)(?:\\*\\*)?${escaped}(?:\\*\\*)?\\s*(?:\\||:)(.*)$`);
  // CRLF 작업본(Windows core.autocrlf)도 읽는다 — 남은 \r은 `.`과 맞지 않아 라벨 행을 놓친다.
  for (const line of text.split(/\r?\n/)) {
    const rest = row.exec(line)?.[1];
    if (rest === undefined) continue;
    const cell = line.trimStart().startsWith("|") ? rest.split(/(?<!\\)\|/)[0]! : rest;
    const cmd = /`([^`]+)`/.exec(cell)?.[1];
    if (cmd) return cmd.replaceAll("\\|", "|");
  }
  return null;
}

export const DEFINITION_FILES = ["docs/README.md", "docs/PROJECT.md"] as const;
const COMMAND_LABELS = ["검사", "보안 검사", "worktree 준비", "의존성 감사"];

/** 의존성 잠금 파일 — 이 중 하나라도 base 대비 바뀌었을 때만 `의존성 감사`를 돌린다(같은 잠금이면 main과 같은 패키지라 다시 조회할 필요가 없다). */
export const LOCK_FILES = ["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb", "poetry.lock", "uv.lock", "Pipfile.lock", "Cargo.lock", "go.sum", "Gemfile.lock", "composer.lock"];

/** 경로 목록에서 잠금 파일(어느 폴더든 파일 이름 기준)만 고른다. */
export function changedLockFiles(paths: string[]): string[] {
  return paths.filter((p) => LOCK_FILES.includes(p.split("/").pop() ?? ""));
}

export function declaredCommand(root: string, label: string): string | null {
  for (const file of DEFINITION_FILES) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    const cmd = commandInDocument(readFileSync(path, "utf8"), label);
    if (cmd !== null) return cmd;
  }
  return null;
}

function committedCommand(repo: Repo, revision: string, label: string): string | null {
  for (const file of DEFINITION_FILES) {
    // 실제 부재만 fallback한다. 조회 실패는 변조된 작업본 실행으로 이어지면 안 된다.
    if (git(repo.root, ["ls-tree", "--name-only", revision, "--", file]) === "") continue;
    const text = git(repo.root, ["show", `${revision}:${file}`]);
    const cmd = commandInDocument(text, label);
    if (cmd !== null) return cmd;
  }
  return null;
}

/** base에 선언이 있으면 그것을 사용한다. 명령 본문 외 스크립트 내용까지 격리하지는 않는다. */
function executionCommand(repo: Repo, root: string, label: string, revision = repo.base): string | null {
  const local = declaredCommand(root, label);
  const base = committedCommand(repo, revision, label);
  if (base !== null && local !== base) process.stderr.write(`pace: ${label}: worktree 선언이 다름(병합 뒤 적용) — ${revision} 선언 사용\n`);
  return base ?? local;
}

/** 전체 검사 실행은 finish와 같은 base 선언 경계를 사용한다. */
export function runDeclaredCheck(cwd: string, revision?: string) {
  if (revision !== undefined && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(revision)) throw new HarnessError("검사 선언 기준은 검증된 commit SHA여야 한다");
  const repo = openRepo(cwd);
  const command = executionCommand(repo, repo.root, "검사", revision);
  if (command === null) return { command: null, ok: false, output: "검사 선언 없음", execution: "unavailable" as const, started: false, status: null, signal: null };
  return { command, ...run(repo.root, command, CHECK_TIMEOUT_MS) };
}

/** Windows에서는 PATH의 Git을 절대 경로로 고른 뒤 Git 설치 경계 안의 sh만 실행한다. */
function windowsGitShell(): { shell?: string; error?: string } {
  const env = { ...process.env };
  const pathKey = Object.keys(env).find((key) => key.toUpperCase() === "PATH");
  const paths = ((pathKey ? env[pathKey] : "")?.split(";") ?? []).map((part) => /^"[^"]+"$/.test(part) ? part.slice(1, -1) : part);
  const git = paths.filter((p) => isAbsolute(p)).map((p) => join(p, "git.exe")).find((p) => {
    try { return statSync(p).isFile(); } catch { return false; }
  });
  if (!git) return { error: "Git 실행 파일을 찾지 못했다 (ENOENT)" };
  for (const key of Object.keys(env)) if (key.toUpperCase() === "GIT_EXEC_PATH") delete env[key];
  const found = spawnSync(git, ["--exec-path"], { cwd: dirname(process.execPath), env, encoding: "utf8", windowsHide: true });
  if (found.error || found.status !== 0) return { error: `Git 실행 경로 조회 실패: ${found.error?.message ?? (found.stderr || found.status)}` };
  return gitShellAt(found.stdout.trim());
}

export function gitShellAt(core: string): { shell?: string; error?: string } {
  if (!isAbsolute(core) || basename(core).toLowerCase() !== "git-core" || basename(dirname(core)).toLowerCase() !== "libexec") return { error: "Git 실행 경로가 예상한 설치 구조가 아니다" };
  const root = resolve(core, "../../.."), shell = join(root, "bin", "sh.exe");
  try {
    const actualRoot = realpathSync.native(root), actualShell = realpathSync.native(shell);
    const rel = relative(actualRoot, actualShell);
    if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel) || !statSync(actualShell).isFile()) return { error: "Git 셸이 설치 경계 밖이다" };
    return { shell: actualShell };
  } catch (error) { return { error: `Git 셸을 찾지 못했다: ${error instanceof Error ? error.message : String(error)}` }; }
}

/** 선언 `검사`(전체 회귀)의 제한 시간 — Windows는 테스트 파일을 순차 실행해 30분을 넘는다(2026-11-13 실측 34분). */
export const CHECK_TIMEOUT_MS = 2 * 60 * 60_000;

export function runDeclaredShell(cwd: string, command: string, timeoutMs = 30 * 60_000) {
  process.stderr.write(`실행: ${command}\n`);
  const located = process.platform === "win32" ? windowsGitShell() : { shell: "sh" };
  if (!located.shell) return { ok: false, output: located.error ?? "셸을 찾지 못했다", execution: "unavailable" as const, started: false, status: null, signal: null };
  const r = spawnSync(located.shell, ["-c", command], { cwd, encoding: "utf8", timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  const output = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  const metadata = { ...shellState(r), status: r.status, signal: r.signal, errorCode: (r.error as NodeJS.ErrnoException | undefined)?.code };
  if (r.status === 0) return { ok: true, output, ...metadata };
  const details = [r.error?.message, r.status !== null ? `종료 코드: ${r.status}` : undefined, r.signal ? `신호: ${r.signal}` : undefined].filter(Boolean).join(" · ");
  return { ok: false, output: [output, details].filter(Boolean).join("\n"), ...metadata };
}

const run = runDeclaredShell;

// ── 명령 ────────────────────────────────────────────────────────────

function requireBase(repo: Repo, command: string): void {
  if (repo.branch !== repo.base) throw new HarnessError(`${command}는 ${repo.base} 브랜치에서 실행한다 (지금 ${repo.branch})`);
}

/** 프로젝트 브랜치가 있으면 그 worktree에서만 — task·check가 main을 고치지 않게. */
function requireOwnWorktree(repo: Repo, ref: ProjectRef, command: string): void {
  if (branchExists(repo, ref.branch) && repo.branch !== ref.branch) {
    throw new HarnessError(`${command}는 ${ref.id}의 worktree에서 실행한다: ${worktreeOf(repo, ref.branch) ?? ref.worktree}`);
  }
}

export function newProject(repo: Repo, name: string, options: { from?: string; date?: string } = {}): ProjectRef {
  if (repo.inWorktree) throw new HarnessError("new는 main 체크아웃에서만 실행한다 — worktree 안에서는 새 프로젝트를 만들지 않는다");
  requireBase(repo, "new");
  const date = options.date ?? today();
  const number = String(nextProjectNumber(repo)).padStart(3, "0");
  const dirName = `P${number}_${yymmdd(date)}_${folderName(name)}`;
  const ref = refFor(repo, dirName);
  const dir = join(projectsRoot(repo.root), dirName);
  const backlog = options.from ? resolveBacklog(repo.root, options.from) : null;
  const briefs = backlog ? listBriefs(repo.root, backlog) : [];
  const source = backlog ? `[${basename(backlog)}](${relativeGitPath(dir, join(backlog, "BACKLOG.md"))})` : `대화 ${date}`;
  const rel = relativeGitPath(repo.mainRoot, ref.worktree);
  let filled = fillTemplate(template("PROJECT.md"), { projectId: ref.id, projectName: name.trim(), date, datetime: options.date ? `${options.date} ${memoDateTime(new Date()).slice(11)}` : memoDateTime(new Date()), source, branch: ref.branch, worktree: `${rel}/` });
  for (const brief of briefs) filled = appendRow(filled, "## 태스크", `| T${brief.id} | ${brief.name} | 대기 | |`);
  writeFileAtomic(join(dir, "PROJECT.md"), withBrainMaterials(filled, brainCandidates(repo.root, name, backlog ? join(backlog, "BACKLOG.md") : undefined)));
  return ref;
}

/** 계약의 재료 후보 — 프로젝트 이름(과 백로그 단계 제목)으로 브레인을 찾는다. 브레인이 없으면 null. */
export function brainCandidates(root: string, name: string, from?: string): string[] | null {
  if (!existsSync(join(brainDir(root), "SCHEMA.md"))) return null;
  // 검색·제목 읽기 실패가 new를 막지 않는다 — 실패는 후보 대신 실패 표시 한 줄로 남긴다.
  try {
    let query = name;
    if (from) {
      const path = resolve(root, from);
      const title = existsSync(path) && statSync(path).isFile() ? /^#[ \t]+(?:\d+[ \t]+)?(.+)$/m.exec(readFileSync(path, "utf8"))?.[1] : undefined;
      if (title) query = `${name} ${title}`;
      if (basename(path) === "BACKLOG.md") query += " " + listBriefs(root, dirname(path)).map((b) => /^#\s+(.+)$/m.exec(readFileSync(b.path, "utf8"))?.[1] ?? b.name).join(" ");
    }
    return searchBrain(root, query, { list: true, limit: 5 }).pages.map(({ page }) => `\`${relative(root, page.path)}\` — ${page.title}: ${page.summary}`.replace(/\s*\n\s*/g, " "));
  } catch {
    return [SEARCH_FAILED];
  }
}

const SEARCH_FAILED = "\0검색 실패";

function withBrainMaterials(text: string, candidates: string[] | null): string {
  if (candidates === null) return text;
  const lines =
    candidates[0] === SEARCH_FAILED
      ? ["- 브레인: 자동 검색 실패 — `pace brain search`로 직접 찾는다"]
      : candidates.length === 0
        ? ["- 브레인: 관련 페이지 없음 (`pace project new` 자동 검색) — 필요하면 다른 검색어로 `pace brain search`"]
        : ["- 브레인 (`pace project new` 자동 검색 — 확인 전 후보, 관련 없으면 지운다):", ...candidates.map((c) => `  - ${c}`)];
  const at = sectionStart(text, "## 재료");
  if (at === -1) return text;
  const next = text.slice(at).search(/\r?\n## /);
  const end = next === -1 ? text.length : at + next;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  return `${text.slice(0, end).trimEnd()}${eol}${eol}${lines.join(eol)}${eol}${text.slice(end)}`;
}

// ── Orca 연동 (D5) ──────────────────────────────────────────────────

export interface LaunchResult {
  /**
   * launched: 작업자 세션을 띄움 · skipped: 띄우지 않음(이유는 detail) · failed: 띄우려다 실패(뜨지 않음)
   * unknown: 응답이 끊기거나 Orca가 결과를 확정하지 못함 — 작업자가 떠 있을 수 있으니 직접 열지 말고 확인한다
   */
  status: "launched" | "skipped" | "failed" | "unknown";
  detail: string;
  /** 직접 여는 명령 */
  manual: string;
}

export interface StartOptions {
  launch?: boolean;
  /** resolveAgent가 정한 도구 — startProject가 채운다 */
  choice?: AgentChoice;
  /** 이미 있는 worktree에도 작업자 세션을 띄운다(명시했을 때만 — 중복 세션 방지) */
  relaunch?: boolean;
  role?: string;
  /** 내부 사전 검증 결과. 런타임 적용 관측은 아니다. */
  roleChoice?: WorkerRole;
  roleChecked?: boolean;
  agent?: string;
  model?: string;
  effort?: string;
  env?: NodeJS.ProcessEnv;
}

/** Orca 채팅 세션인지 — 터미널 표시(TERM_PROGRAM·ORCA_WORKSPACE_ID) 없이 ORCA_STRUCTURED_SESSION=1만 붙는다(Orca 1.4.256 실측). */
export function orcaChatSession(env: NodeJS.ProcessEnv): boolean {
  return env.ORCA_STRUCTURED_SESSION === "1";
}

/** Orca 터미널·채팅 세션 안인지와 쓸 실행 파일. ORCA_CLI_COMMAND가 있으면 그것을 쓴다(Orca가 정한 실행 파일). ORCA_CLI_COMMAND만으로는 안으로 보지 않는다(WSL 관리 세션에도 붙는다). */
export function orcaCommand(env: NodeJS.ProcessEnv): string | null {
  const inside = env.TERM_PROGRAM === "Orca" || (env.ORCA_WORKSPACE_ID ?? "") !== "" || orcaChatSession(env);
  if (!inside) return null;
  if (env.ORCA_CLI_COMMAND && env.ORCA_CLI_COMMAND !== "") return env.ORCA_CLI_COMMAND;
  // PATH의 다른 orca가 먼저 잡히지 않게 Orca가 알려 준 위치를 쓴다(v1 교훈: 절대 경로).
  const bundled = env.ORCA_CLI_BIN_DIR ? join(env.ORCA_CLI_BIN_DIR, "orca") : null;
  return bundled !== null && existsSync(bundled) ? bundled : "orca";
}

/** Orca `worker-start --agent`가 받는 도구 이름 (Orca 1.4.232). */
export const WORKER_AGENTS = ["claude", "codex", "cursor", "antigravity", "muse", "zcode", "opencode", "opencode2"] as const;

export interface AgentChoice {
  agent: string;
  /** 어디서 골랐는지 — start 출력에 보인다 */
  source: "명령 옵션" | "프로젝트" | "저장소 기본값" | "지금 세션" | "추정";
}

/**
 * 작업자 도구 우선순위: --agent > PROJECT.md `- 작업자:` > docs/README.md `작업자 도구:` > 지금 세션 도구.
 * 받을 수 없는 이름은 worktree를 만들기 전에 거부한다(오타 방지).
 */
export function resolveAgent(repo: Repo, ref: ProjectRef, options: StartOptions): AgentChoice {
  const env = options.env ?? process.env;
  const check = (agent: string, source: AgentChoice["source"]): AgentChoice => {
    if (!(WORKER_AGENTS as readonly string[]).includes(agent)) {
      throw new HarnessError(`작업자 도구 이름을 받을 수 없다: "${agent}" (${source}) — 받는 이름: ${WORKER_AGENTS.join(", ")}`);
    }
    return { agent, source };
  };
  if (options.agent !== undefined) return check(options.agent.trim(), "명령 옵션");
  // 머리(첫 ## 앞)의 `- 작업자:` 줄만 본다 — 본문·결정 메모의 같은 글자를 집지 않게.
  const project = stripComments(readFileSync(projectFile(repo, ref), "utf8"));
  const head = project.slice(0, project.search(/\n## /) === -1 ? project.length : project.search(/\n## /));
  const fromProject = agentValue(/^- 작업자: *(.*)$/m.exec(head)?.[1]);
  if (fromProject) return check(fromProject, "프로젝트");
  const fromRepo = agentValue(declaredCommand(repo.root, "작업자 도구") ?? declaredPlain(repo.root, "작업자 도구"));
  if (fromRepo) return check(fromRepo, "저장소 기본값");
  return sessionChoice(undefined, env);
}

/** 값의 첫 낱말(백틱 벗김). 비었거나 "없음"·"-"이면 정하지 않은 것으로 본다. */
function agentValue(raw: string | null | undefined): string | null {
  const word = raw?.trim().split(/\s/)[0]?.replace(/^`|`$/g, "") ?? "";
  return word === "" || word === "없음" || word === "-" || word === "—" ? null : word;
}

/** 백틱 없이 쓴 선언(`- 작업자 도구: codex`)도 읽는다. */
function declaredPlain(root: string, label: string): string | null {
  for (const file of ["docs/README.md", "docs/PROJECT.md"]) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    const m = new RegExp(`^\\s*-\\s*${label}\\s*:\\s*(.+)$`, "m").exec(readFileSync(path, "utf8"));
    if (m) return m[1]!;
  }
  return null;
}

function sessionChoice(agent: string | undefined, env: NodeJS.ProcessEnv): AgentChoice {
  if (agent !== undefined) return { agent, source: "명령 옵션" };
  const detected = detectAgent(env);
  return { agent: detected.agent, source: detected.guessed ? "추정" : "지금 세션" };
}

/** 지금 세션의 LLM 도구 — 작업자도 같은 도구로 띄운다. 알 수 없으면 claude로 추정한다. */
export function detectAgent(env: NodeJS.ProcessEnv): { agent: string; guessed: boolean } {
  if (env.CLAUDECODE || env.CLAUDE_CODE_SESSION_ID) return { agent: "claude", guessed: false };
  if (env.CODEX_THREAD_ID || env.CODEX_SANDBOX || env.CODEX_MANAGED_BY_NPM) return { agent: "codex", guessed: false };
  if (env.CURSOR_AGENT || env.CURSOR_TRACE_ID) return { agent: "cursor", guessed: false };
  return { agent: "claude", guessed: true };
}

export function workerSpec(ref: ProjectRef, worktree: string, role?: WorkerRole): string {
  const original = [
    `${ref.id} ${ref.name} 프로젝트를 이어서 수행한다. 작업 위치(worktree): ${worktree} (브랜치 ${ref.branch}).`,
    `projects/${ref.dir}/PROJECT.md의 태스크 표에서 대기·진행 중인 다음 태스크부터, 태스크마다 TASK.md → 구현 → 테스트 → TASK-CLOSE.md → pace project check → 커밋 순서로 진행한다.`,
    `질문 직전에 pace project log ${ref.id} [T##] --type question --by agent --to coordinator --msg "질문 요약"을 기록하고, 답을 받은 직후 같은 범위에 --type answer --by agent --msg "답 요약"을 기록한다. 태스크 질문이면 [T##]를 실제 번호로 바꾸고 프로젝트 질문이면 생략한다. 원문·비밀은 남기지 않는다.`,
    `기술적 장애를 escalation으로 올릴 때도 직전에 pace project log ${ref.id} [T##] --type escalation --by agent --to coordinator --msg "장애 요약"을 기록하고 답을 받으면 같은 범위의 answer를 기록한다.`,
    "skills/pace-project-dev/references/decision-rights.md(저장소에 없으면 설치된 pace-project-dev 스킬의 같은 참조 문서)의 A로 결정 주체를 판정한다. owner 결정은 A 항목에 해당할 때만 코디네이터를 통해 요청한다.",
    "장애로 막히면 B에 따라 코디네이터에게 증거와 재현 조건을 보내 함께 해결한다. 회신의 결정과 근거를 적용하고 재검증한 뒤 태스크를 이어간다.",
    "코디네이터의 결정이 필요하면 주입된 지시의 ask 명령으로 묻는다. 코디네이터가 대신 답한 결정은 PROJECT.md 결정 메모에 \"(main 판단)\"으로 남긴다.",
    "되돌리기 어렵거나 밖으로 나가는 행동(푸시·배포·삭제·외부 전송)은 하지 않는다. 병합은 main에서 사람이 승인한다.",
    `모든 태스크가 끝나면 pace project finish ${ref.id}를 통과시킨 뒤 worker_done을 보낸다.`,
  ].join("\n");
  return role ? `${roleInstruction(role)}\n${original}` : original;
}

function runCommand(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, timeout = 120_000): { ok: boolean; json: unknown; output: string; timedOut: boolean } {
  const r = spawnSync(command, args, { cwd, env, encoding: "utf8", timeout });
  const output = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  let json: unknown = null;
  try {
    json = JSON.parse(r.stdout ?? "");
  } catch {
    json = null;
  }
  const ok = r.status === 0 && (json === null || (json as { ok?: boolean }).ok !== false);
  return { ok, json, output: r.error ? String(r.error.message) : output, timedOut: r.status === null && r.signal !== null };
}

/** Run을 확인(없으면 만들고)하고 worktree에 감독받는 작업자를 띄운다. */
export function launchWorker(ref: ProjectRef, worktree: string, cwd: string, options: StartOptions): LaunchResult {
  const env = options.env ?? process.env;
  const choice = options.choice ?? sessionChoice(options.agent, env);
  const agent = choice.agent;
  const guess = choice.source === "추정" ? " — 도구를 알 수 없어 claude로 추정, --agent·PROJECT.md `- 작업자:`·정의서 `작업자 도구:`로 지정" : "";
  const from = ` (${choice.source}${guess})`;
  let role = options.roleChoice;
  if (options.roleChecked || options.role !== undefined) {
    const current = resolveWorkerRole(worktree, `projects/${ref.dir}/PROJECT.md`, { role: options.role, agent, model: options.model, effort: options.effort, env });
    if (options.roleChecked && (current?.member.name !== role?.member.name || current?.member.source !== role?.member.source || current?.member.hash !== role?.member.hash || JSON.stringify(current?.settings) !== JSON.stringify(role?.settings))) {
      throw new HarnessError("역할 원본/설정이 준비 뒤 달라졌다 — worktree는 보존했다. 원본/커밋을 확인하고 start --launch로 재시도하세요");
    }
    role = current;
  }
  const resolved = role?.settings ?? resolveWorkerSettings(agent, options.model, options.effort, env);
  const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
  const flags = [...(resolved.model ? ["--model", resolved.model] : []), ...(resolved.effort ? ["--effort", resolved.effort] : [])];
  const manualFlags = agent === "codex"
    ? [...(resolved.model ? ["--model", resolved.model] : []), ...(resolved.effort ? ["--config", `model_reasoning_effort=${JSON.stringify(resolved.effort)}`] : [])]
    : flags;
  const manual = `cd ${quote(worktree)} && ${[agent, ...manualFlags, ...(role ? [workerSpec(ref, worktree, role)] : [])].map(quote).join(" ")}`;
  if (options.launch === false) return { status: "skipped", detail: `--no-launch — 작업자 도구 ${agent}${from}`, manual };
  const orca = orcaCommand(env);
  if (orca === null) return { status: "skipped", detail: `Orca 밖 — 새 세션을 직접 연다, 작업자 도구 ${agent}${from}`, manual };
  const current = runCommand(orca, ["orchestration", "run-current", "--json"], cwd, env);
  if (!current.ok) return { status: "failed", detail: `run-current 실패: ${current.output}`, manual };
  // Orca 1.4.256은 result.runId(없으면 null), 이전 형식은 result.run을 준다.
  const currentResult = (current.json as { result?: { run?: { id?: string } | null; runId?: string | null } } | null)?.result;
  const run = currentResult?.runId ?? currentResult?.run;
  if (!run) {
    const created = runCommand(orca, ["orchestration", "run-create", "--objective", `${ref.id} ${ref.name}`, "--json"], cwd, env);
    if (!created.ok) return { status: "failed", detail: `run-create 실패: ${created.output}`, manual };
  }
  const started = runCommand(
    orca,
    ["orchestration", "worker-start", "--spec", workerSpec(ref, worktree, role), "--task-title", `${ref.id} ${ref.name}`, "--worktree", `path:${worktree}`, "--agent", agent, ...flags, "--timeout-ms", "600000", "--json"],
    cwd,
    env,
    660_000,
  );
  // 응답이 끊겼거나 Orca가 결과를 확정하지 못했으면 작업자가 떠 있을 수 있다 — 다시 띄우지 않고 확인하게 한다.
  const uncertain = started.timedOut || /outcome_unknown|residualResources/.test(started.output);
  if (!started.ok && uncertain) {
    return { status: "unknown", detail: `worker-start 결과를 확정하지 못했다 — 작업자가 떠 있을 수 있다. 다시 띄우지 말고 확인: ${orca} orchestration worker-list --json\n${started.output.slice(-1000)}`, manual };
  }
  if (!started.ok) return { status: "failed", detail: `worker-start 실패: ${started.output}`, manual };
  return { status: "launched", detail: `${agent}${from} 작업자를 띄웠다 (Orca orchestration)`, manual };
}

export const COMMIT_HOOK_MARKER = "#!/bin/sh\n# PACE commit gate v1\n";
export const COMMIT_HOOK = COMMIT_HOOK_MARKER + String.raw`branch=$(git symbolic-ref --quiet --short HEAD) || exit 0
case "$branch" in project/P[0-9][0-9][0-9]) ;; *) exit 0 ;; esac
tags=$(git stripspace --strip-comments < "$1" | grep -oE '\(P[0-9]{3}/T[0-9]{2}\)' | sort -u | tr -d '()')
[ -n "$tags" ] || exit 0
if ! command -v pace >/dev/null 2>&1; then
  echo 'pace: 경고: pace를 찾지 못해 커밋 태스크 검사를 건너뜀' >&2
  exit 0
fi
for tag in $tags; do
  project=$(printf "%s" "$tag" | cut -d/ -f1)
  task=$(printf "%s" "$tag" | cut -d/ -f2)
  PACE_COMMIT_CHECK=1 pace project check "$project" "$task" || exit 1
done
`;

/** commit-msg 훅의 안전한 경로를 돌려준다 — hooksPath·링크·git 디렉터리 밖 경로는 던진다. */
export function commitHookPath(root: string): string {
  const configured = gitSpawn(root, ["config", "--get", "core.hooksPath"]);
  if (configured.status !== 0 && configured.status !== 1) throw new Error("hooksPath 설정을 읽지 못했다");
  if (configured.status === 0 && !isAbsolute(configured.stdout.trim())) throw new Error("상대 hooksPath는 linked worktree에서 같은 훅을 가리키지 않아 보존한다");
  const common = realpathSync(git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]));
  const hooks = resolve(git(root, ["rev-parse", "--path-format=absolute", "--git-path", "hooks"]));
  const path = join(hooks, "commit-msg");
  const rel = relative(common, path);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("hooksPath가 저장소 git 디렉터리 밖이다");
  let part = common;
  for (const name of rel.split(sep)) {
    part = join(part, name);
    let info;
    try { info = lstatSync(part); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (info.isSymbolicLink() || (part !== path && !info.isDirectory()) || (part === path && !info.isFile())) throw new Error("훅 경로가 일반 파일·디렉터리가 아니다");
  }
  return path;
}

/** Git 내부의 PACE 소유 훅만 관리한다. 사용자 hooksPath·링크·기존 훅은 보존한다. */
function installCommitHook(repo: Repo): void {
  try {
    const path = commitHookPath(repo.root);
    if (existsSync(path) && !readFileSync(path, "utf8").startsWith(COMMIT_HOOK_MARKER)) throw new Error("사용자 commit-msg 훅이 있어 보존한다");
    writeFileAtomic(path, COMMIT_HOOK);
    chmodSync(path, 0o755);
  } catch (error) {
    process.stderr.write(`pace: 경고: 커밋 게이트 훅 설치 생략 — ${error instanceof Error ? error.message : "설치 오류"}\n`);
  }
}

function startProjectRaw(repo: Repo, id: string, options: StartOptions = {}): { ref: ProjectRef; created: boolean; setup: string | null; launch: LaunchResult | null; choice?: AgentChoice; roleChoice?: WorkerRole } {
  if (repo.inWorktree) throw new HarnessError("start는 main 체크아웃에서 실행한다");
  requireBase(repo, "start");
  const ref = findProject(repo, id);
  const existing = worktreeOf(repo, ref.branch);
  if (existing !== null && options.role !== undefined && !options.relaunch) throw new HarnessError("기존 worktree에 역할을 적용하려면 start --role <팀 이름> --launch를 함께 사용하세요");
  const restoring = existing === null && branchExists(repo, ref.branch);
  // Merely showing an existing path must still work when the checkout moved.
  const roleChecked = existing === null || !!options.relaunch;
  const roleChoice = roleChecked ? resolveWorkerRole(existing ?? repo.root, `projects/${ref.dir}/PROJECT.md`, {
    role: options.role, ref: existing ? undefined : restoring ? ref.branch : "HEAD", projectRef: restoring ? ref.branch : undefined,
    agent: () => { options.choice ??= resolveAgent(repo, ref, options); return options.choice.agent; },
    model: options.model, effort: options.effort, env: options.env,
  }) : undefined;
  options = { ...options, roleChoice, roleChecked };
  if (existing === null || options.relaunch) {
    options = { ...options, choice: resolveAgent(repo, ref, options) };
    resolveWorkerSettings(options.choice!.agent, options.model, options.effort, options.env);
  }
  const file = projectFile(repo, ref);
  const project = readFileSync(file, "utf8");
  const backlogChange = backlogStateChange(repo, file, project, "진행");
  const folder = relativeGitPath(repo.root, join(projectsRoot(repo.root), ref.dir));
  const backlogRel = backlogChange ? relativeGitPath(repo.root, backlogChange.path) : null;
  guardPartialProjectStages(repo.root, folder);
  if (existing !== null && backlogChange && backlogRel && readFileSync(backlogChange.path, "utf8") === backlogChange.text) {
    const existingPath = join(existing, backlogRel);
    if (existsSync(existingPath)) {
      assertBacklogPath(join(existing, "backlogs"), existingPath);
      // worktree의 BACKLOG.md는 태스크 done이 현황 표를 고쳐 main과 달라진다 — 전체 상태가 이미 진행이면 동기화할 것이 없다
      const inWorktree = readFileSync(existingPath, "utf8");
      if (inWorktree === backlogChange.text || alreadyInProgress(inWorktree)) {
        if (options.roleChoice) adoptTeamMetrics(existing, folder);
        const launch = options.relaunch ? launchWorker(ref, existing, repo.root, options) : null;
        return { ref: { ...ref, worktree: existing }, created: false, setup: null, launch, choice: options.choice, ...(options.roleChoice ? { roleChoice: options.roleChoice } : {}) };
      }
    }
  }
  if (backlogRel) requireCleanBacklog(repo.root, backlogRel);
  guardDashboardDrafts(repo.root, [folder, ...(backlogRel ? [backlogRel] : [])]);
  // 이미 존재하는 worktree라도 연결 BL이 동기화되지 않았다면 준비부터 복구한다.
  if (existing !== null && !backlogChange) {
    if (options.roleChoice) adoptTeamMetrics(existing, folder);
    const launch = options.relaunch ? launchWorker(ref, existing, repo.root, options) : null;
    return { ref: { ...ref, worktree: existing }, created: false, setup: null, launch, choice: options.choice, ...(options.roleChoice ? { roleChoice: options.roleChoice } : {}) };
  }
  // 복구도 작업자 실행 경로이므로 변경 전에 선택과 설정을 검증한다.
  if (!options.choice) {
    options = { ...options, choice: resolveAgent(repo, ref, options) };
    resolveWorkerSettings(options.choice!.agent, options.model, options.effort, options.env);
  }
  installCommitHook(repo);
  const restoreDefinition = snapshotOwned(repo.root, [relative(repo.root, file), ...pendingPaths(repo.root).filter((path) => path.startsWith(`${folder}/`))]);
  try {
    if (readState(project) === "정의") writeFileAtomic(file, setState(project, "진행"));
    git(repo.root, ["add", "--", folder]);
    if (!gitOk(repo.root, ["diff", "--cached", "--quiet", "--", folder])) git(repo.root, ["commit", "-m", `docs(${ref.id}): 정의 — 착수`, "--", folder]);
  } catch (error) { restoreAfterFailure(error, restoreDefinition); }
  const branchAlreadyExists = branchExists(repo, ref.branch);
  const worktree = existing ?? ref.worktree;
  if (existing === null) {
    mkdirSync(dirname(worktree), { recursive: true });
    if (branchAlreadyExists) git(repo.root, ["worktree", "add", worktree, ref.branch]);
    else git(repo.root, ["worktree", "add", worktree, "-b", ref.branch]);
  }
  if (backlogChange && !gitOk(worktree, ["merge-base", "--is-ancestor", "HEAD", repo.base])) throw new HarnessError("worktree가 main의 조상이 아니다 — 변경을 보존하고 이력을 확인한 뒤 재시도한다");
  const setup = executionCommand(repo, worktree, "worktree 준비");
  if (setup !== null) {
    const r = run(worktree, setup);
    if (!r.ok) throw new HarnessError(`worktree는 만들었지만 준비 명령이 실패했다: ${setup}\nmain과 worktree의 준비 선언을 확인한 뒤 start를 재시도한다.\n${r.output}`);
  }
  const owned = [...(backlogRel ? [backlogRel] : []), ...(existsSync(join(repo.root, "backlogs/README.html")) && existsSync(join(repo.root, "backlogs/dashboard/data.js")) ? ["backlogs/dashboard/data.js"] : [])];
  const restore = snapshotOwned(repo.root, owned);
  let committed = false;
  try {
    writeBacklogState(repo, backlogChange);
    const dashboardStaged = stageDashboard(repo.root);
    const startPaths = [...(dashboardStaged ? ["backlogs/dashboard/data.js"] : []), ...(backlogRel ? [backlogRel] : [])].filter((path) => !gitOk(repo.root, ["diff", "--cached", "--quiet", "--", path]));
    if (startPaths.length > 0) git(repo.root, ["commit", "-m", `chore(${ref.id}): 백로그와 대시보드 갱신`, "--", ...startPaths]);
    committed = true;
  } catch (error) {
    if (!committed) restoreAfterFailure(error, restore);
    throw error;
  }
  if ((backlogChange || !branchAlreadyExists) && !gitOk(worktree, ["merge", "--ff-only", repo.base])) throw new HarnessError("main의 백로그 커밋은 기록됐으나 worktree 반영에 실패했다 — worktree 변경을 보존하고 확인 후 start를 재시도한다");
  if (options.roleChoice) adoptTeamMetrics(worktree, folder);
  const launch = launchWorker(ref, worktree, repo.root, options);
  return { ref: { ...ref, worktree }, created: existing === null, setup, launch, choice: options.choice, ...(options.roleChoice ? { roleChoice: options.roleChoice } : {}) };
}

function addTaskRaw(repo: Repo, id: string, name: string): { ref: ProjectRef; taskId: string; path: string } {
  const ref = findProject(repo, id);
  requireOwnWorktree(repo, ref, "task");
  const tasksDir = join(projectsRoot(repo.root), ref.dir, "tasks");
  const folders = existsSync(tasksDir) ? readdirSync(tasksDir).filter((n) => TASK_DIR.test(n)) : [];
  const projectPath = projectFile(repo, ref);
  const project = readFileSync(projectPath, "utf8");
  const rows = taskRows(project).filter((r) => /^T\d{2}$/.test(r[0] ?? ""));
  // 계약 때 표에 계획해 둔 태스크(대기)는 그 번호로 연다 — 새 번호가 계획 행과 겹치지 않게.
  // 폴더만 있고 TASK.md가 없으면(하네스 이전 형식 — README만) 아직 열지 않은 태스크다.
  const folderOf = (taskId: string) => folders.find((n) => n.startsWith(`${taskId}_`));
  const hasTask = (taskId: string) => {
    const folder = folderOf(taskId);
    return folder !== undefined && existsSync(join(tasksDir, folder, "TASK.md"));
  };
  const same = rows.filter((r) => r[1] === name.trim());
  const open = same.find((r) => r[3] === "진행" && hasTask(r[0]!));
  if (open) throw new HarnessError(`태스크가 이미 있다: ${ref.id} ${open[0]} ${name.trim()}`);
  const planned = same.find((r) => r[3] === "대기" && !hasTask(r[0]!));
  const numbers = [...folders.map((n) => Number(TASK_DIR.exec(n)![1])), ...rows.map((r) => Number(r[0]!.slice(1)))];
  const taskId = planned?.[0] ?? `T${String(Math.max(0, ...numbers) + 1).padStart(2, "0")}`;
  const path = join(tasksDir, (planned && folderOf(taskId)) || `${taskId}_${folderName(name)}`, "TASK.md");
  // 출처 링크는 PROJECT.md 기준 상대 경로다 — TASK.md 위치 기준으로 다시 잡는다.
  const source = (/^- 출처: (.+)$/m.exec(project)?.[1] ?? "—").replace(/\]\(([^)]+)\)/g, (link, target: string) =>
    /^[a-z]+:|^\/|^#/i.test(target) ? link : `](${relative(dirname(path), resolve(dirname(projectPath), linkPath(target))).split(sep).join("/")}${target.includes("#") ? target.slice(target.indexOf("#")) : ""})`,
  );
  const updated = planned
    ? setTaskState(project, taskId, "진행")
    : appendRow(project, "## 태스크", `| ${taskId} | ${name.trim().replaceAll("|", "\\|")} | ${legacyTasks(project) ? "— | " : ""}진행 | |`);
  writeFileAtomic(path, fillTemplate(template("TASK.md"), { taskId, taskName: name.trim(), projectId: ref.id, source }));
  writeFileAtomic(projectPath, setState(updated, "진행"));
  return { ref, taskId, path };
}

/**
 * `## 제목` 절 안 표에서 첫 칸이 key인 행의 index번째 칸(0부터)을 바꾼다. 칸 공백이 달라도 맞추고,
 * 값이 이미 같으면 원문을 둔다. 절이나 행이 없으면 null.
 */
function setCell(text: string, heading: string, key: string, index: number, value: string): string | null {
  const bodyStart = sectionStart(text, heading);
  if (bodyStart === -1) return null;
  const rest = text.slice(bodyStart);
  const end = rest.search(/\r?\n## /);
  const body = end === -1 ? rest : rest.slice(0, end);
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const row = new RegExp(`^(\\|[ \\t]*${escaped}[ \\t]*\\|${"[^|\\n]*\\|".repeat(index - 1)})([^|\\n]*)\\|`, "m");
  const m = row.exec(body);
  if (m === null) return null;
  if (m[2]!.trim() === value) return text;
  return text.slice(0, bodyStart) + body.replace(row, `$1 ${value} |`) + text.slice(bodyStart + body.length);
}

/** 태스크 표에서 그 행의 상태 칸(4번째)을 바꾼다. 못 찾으면 멈춘다. */
function setTaskState(text: string, taskId: string, state: string): string {
  const updated = setCell(text, "## 태스크", taskId, legacyTasks(text) ? 3 : 2, state);
  if (updated === null) throw new HarnessError(`태스크 표에서 ${taskId} 행을 고치지 못했다`);
  return updated;
}

/**
 * `완료` 태스크의 커밋 칸을 git 이력의 `(P###/T##)` 커밋 중 가장 최근 해시로 맞춘다 — 빈 칸과 해시 칸(rebase로 낡았거나
 * 그 뒤 커밋이 더 생긴 것)만. 손으로 적은 해시 아닌 내용과 찾지 못한 칸, skip 태스크(아직 자기 커밋이 없는 것)는 그대로 둔다.
 */
function fillCommitHashes(root: string, ref: ProjectRef, text: string, skip?: string): { text: string; filled: string[] } {
  const filled: string[] = [];
  let out = text;
  for (const [taskId, , , state, commit = ""] of taskRows(text)) {
    if (!/^T\d{2}$/.test(taskId ?? "") || state !== "완료" || taskId === skip) continue;
    if (commit !== "" && !/^[0-9a-f]{7,40}$/.test(commit)) continue;
    const hash = git(root, ["log", "-1", "--format=%h", "-F", `--grep=(${ref.id}/${taskId})`], true);
    if (hash === "" || hash === commit) continue;
    // 같은 커밋을 다른 길이로 적었으면 그대로 둔다
    if (commit !== "" && git(root, ["rev-parse", "--verify", "--quiet", `${commit}^{commit}`], true) === git(root, ["rev-parse", hash], true)) continue;
    out = setCell(out, "## 태스크", taskId!, legacyTasks(text) ? 4 : 3, hash) ?? out;
    filled.push(`${taskId} ${hash}`);
  }
  return { text: out, filled };
}

/** 마크다운 링크 대상에서 파일 경로만 — `#앵커`를 떼고 `%20` 같은 인코딩을 푼다. */
function linkPath(target: string): string {
  let path = target.split("#")[0]!;
  // Windows에서 생성된 기존 백로그 상대 링크도 다른 플랫폼에서 읽는다.
  if (/^(?:\.\.\\)+backlogs\\/i.test(path)) path = path.replaceAll("\\", "/");
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
}

/** PROJECT.md 출처가 backlogs/ 아래 링크면 그 백로그 폴더. 백로그 링크가 아니면 null, 가리킨 곳이 없으면 멈춘다. */
function backlogFolder(repo: Repo, projectDir: string, project: string): string | null {
  const target = /^- 출처: .*?\]\(([^)]+)\)/m.exec(project)?.[1];
  if (target === undefined) return null;
  const path = resolve(projectDir, linkPath(target));
  const rel = relative(join(repo.root, "backlogs"), path);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return null;
  if (!existsSync(path)) throw new HarnessError(`PROJECT.md 출처의 백로그가 없다: ${relative(repo.root, path)}`);
  // 링크를 따라 저장소 밖 백로그를 고치지 않게 실제 경로로 다시 확인한다.
  const real = relative(realpathSync(join(repo.root, "backlogs")), realpathSync(path));
  if (real.startsWith("..") || isAbsolute(real)) throw new HarnessError(`PROJECT.md 출처의 백로그가 backlogs/ 밖을 가리킨다: ${relative(repo.root, path)}`);
  return statSync(path).isDirectory() ? path : dirname(path);
}

/** BL 링크는 폴더 또는 그 BACKLOG.md만 허용한다. 옛 비BL 출처는 그대로 둔다. */
function linkedBacklogFolder(projectDir: string, project: string): string | null {
  const target = /^- 출처: .*?\]\(([^)]+)\)/m.exec(project)?.[1];
  if (target === undefined) return null;
  const path = resolve(projectDir, linkPath(target));
  const parts = relative(projectDir, path).split(sep);
  const at = parts.findIndex((part) => /^BL\d{6}_\d{2}_/.test(part));
  if (at < 0) return null;
  if (at !== parts.length - 1 && !(at === parts.length - 2 && basename(path) === "BACKLOG.md")) throw new HarnessError("BL 출처는 폴더 또는 BACKLOG.md여야 한다");
  return basename(path) === "BACKLOG.md" ? dirname(path) : path;
}

/** BL 전체 상태는 프로젝트 생명주기에서만 변경한다. 쓰기 전 출처와 상태를 검증한다. */
function backlogStateChange(repo: Repo, projectPath: string, project: string, next: "진행" | "완료"): { path: string; text: string } | null {
  const sourceFolder = linkedBacklogFolder(dirname(projectPath), project);
  if (sourceFolder === null) return null;
  const folder = backlogFolder(repo, dirname(projectPath), project);
  if (folder === null) throw new HarnessError("백로그 출처가 backlogs/ 밖을 가리킨다");
  const path = join(folder, "BACKLOG.md");
  if (!existsSync(path)) throw new HarnessError("백로그 개요 BACKLOG.md가 없다");
  assertBacklogPath(join(repo.root, "backlogs"), path);
  return { path, text: updatedBacklogState(readFileSync(path, "utf8"), next) };
}

function alreadyInProgress(text: string): boolean {
  try { return updatedBacklogState(text, "진행") === text; } catch { return false; }
}

function updatedBacklogState(original: string, next: "진행" | "완료"): string {
  const states = [...original.matchAll(/^- 상태: ([^\r\n]+)\r?$/gm)];
  if (states.length !== 1 || !/^(대기|진행|완료|보류)(?:\s|$)/.test(states[0]![1]!)) throw new HarnessError("백로그 전체 상태가 없거나 잘못됐다");
  const state = states[0]![1]!;
  if (/^보류(?:\s|$)/.test(state)) throw new HarnessError("보류 백로그는 해제 판단 후 진행할 수 있다");
  if (next === "진행" && /^완료(?:\s|$)/.test(state)) throw new HarnessError("완료 백로그는 새로 시작할 수 없다");
  return original.replace(/^- 상태: ([^\r\n]+)(\r?)$/m, (_line, value: string, cr: string) => `- 상태: ${value.replace(/^\S+/, next)}${cr}`);
}

function writeBacklogState(repo: Repo, change: { path: string; text: string } | null): void {
  if (change === null || readFileSync(change.path, "utf8") === change.text) return;
  writeFileAtomic(change.path, change.text);
  git(repo.root, ["add", "--", relative(repo.root, change.path)]);
}

/**
 * 커밋 게이트(check)를 통과하면 태스크를 완료로 맞춘다 — TASK.md·태스크 표 상태, 이어진 백로그 단계 파일과 `00` 표,
 * 다른 완료 태스크의 빈·낡은 커밋 칸. 새 내용을 모두 계산한 뒤에 쓰므로 실패하면 아무것도 바꾸지 않는다. 커밋은 하지 않는다.
 */
function doneTaskRaw(repo: Repo, id: string, taskId: string): Report {
  if (!/^T\d{2}$/i.test(taskId)) throw new HarnessError(`태스크 번호 형식이 아니다: ${taskId} (T01처럼)`);
  const report = checkTaskRaw(repo, id, taskId);
  if (!report.ok) return report;
  const ref = findProject(repo, id);
  const want = taskId.toUpperCase();
  const dir = taskDir(repo, ref, want);
  const writes = new Map<string, string>();
  const taskPath = join(dir, "TASK.md");
  if (report.reviewEdit) {
    const path = relativeGitPath(repo.root, join(dir, APPLIED_REVIEW));
    if (workingPathKind(repo.root, path) === "unsafe") {
      return { ok: false, issues: ["허용 TASK 변경 증거 경로가 안전하지 않다"], notes: [] };
    }
    writes.set(join(dir, APPLIED_REVIEW), reviewEditText(report.reviewEdit));
  }
  writes.set(taskPath, setState(readFileSync(taskPath, "utf8"), "완료"));
  const projectPath = projectFile(repo, ref);
  const project = readFileSync(projectPath, "utf8");
  const row = taskRows(project).find((r) => r[0] === want);
  if (row === undefined) throw new HarnessError(`태스크 표에 ${want} 행이 없다`);
  const filled = fillCommitHashes(repo.root, ref, setTaskState(project, want, "완료"), want);
  writes.set(projectPath, filled.text);
  // 백로그 단계 — 표 칸이 단계 번호이고 출처가 백로그일 때만
  const step = row[2] ?? "";
  const folder = backlogFolder(repo, dirname(projectPath), project);
  if (folder !== null && /^BL\d{6}_\d{2}_/.test(basename(folder))) {
    if (!existsSync(join(folder, "BACKLOG.md"))) throw new HarnessError("백로그 개요 BACKLOG.md가 없다");
    const brief = listBriefs(repo.root, folder).find((b) => b.id === want.slice(1));
    if (!brief) throw new HarnessError(`백로그 브리프 파일이 없다: BR${want.slice(1)} — 진행 중인 BL은 main에서 같은 번호 BR을 기획해 worktree에 반영한다. 번호가 다르거나 충돌하면 중단해 판단하며, 완료 BL에는 추가하지 않는다`);
    const briefText = readFileSync(brief.path, "utf8");
    const state = readState(briefText);
    if (!state) throw new HarnessError(`브리프에 "- 상태:" 줄이 없다: BR${brief.id}`);
    const overviewPath = join(folder, "BACKLOG.md");
    assertBacklogPath(join(repo.root, "backlogs"), overviewPath);
    const overviewOriginal = readFileSync(overviewPath, "utf8");
    const overview = overviewOriginal.replaceAll("\r\n", "\n");
    const rows = tableRows(overview, "## 진행 현황");
    const matching = rows.filter((r) => new RegExp(`^(?:BR${brief.id}(?:$|[ \t])|\\[BR${brief.id}(?:[ \t]|\\]))`).test(r[0] ?? ""));
    if (matching.length !== 1) throw new HarnessError(`백로그 진행 현황 표에 BR${brief.id} 행이 없거나 중복이다`);
    const updated = setCell(overview, "## 진행 현황", matching[0]![0]!, 1, "완료");
    if (updated === null) throw new HarnessError(`백로그 진행 현황 표의 BR${brief.id} 행을 고치지 못했다`);
    writes.set(brief.path, setState(briefText, state.replace(/^\S+/, "완료")));
    writes.set(overviewPath, overviewOriginal.includes("\r\n") ? updated.replaceAll("\n", "\r\n") : updated);
  } else if (folder !== null && /^\d{2}$/.test(step)) {
    const files = readdirSync(folder);
    const stepFile = files.find((n) => n.startsWith(`${step}_`) && n.endsWith(".md"));
    const overview = files.find((n) => n.startsWith("00_") && n.endsWith(".md"));
    if (stepFile === undefined) throw new HarnessError(`백로그 단계 파일이 없다: ${relativeGitPath(repo.root, folder)}/${step}_*.md`);
    const stepPath = join(folder, stepFile);
    assertBacklogPath(join(repo.root, "backlogs"), stepPath);
    const stepText = readFileSync(stepPath, "utf8");
    const stepState = readState(stepText);
    if (stepState === "") throw new HarnessError(`백로그 단계 파일에 "- 상태:" 줄이 없다: ${relative(repo.root, stepPath)}`);
    // 상태 뒤 메모(`완료 (… 07)`)는 남기고 앞 단어만 바꾼다.
    if (!stepState.startsWith("완료")) writes.set(stepPath, setState(stepText, stepState.replace(/^\S+/, "완료")));
    if (overview === undefined) throw new HarnessError(`백로그 개요 파일이 없다: ${relative(repo.root, folder)}/00_*.md`);
    const overviewPath = join(folder, overview);
    assertBacklogPath(join(repo.root, "backlogs"), overviewPath);
    const updated = setCell(readFileSync(overviewPath, "utf8"), "## 진행 현황", step, 2, "완료");
    if (updated === null) throw new HarnessError(`백로그 진행 현황 표에 ${step} 행이 없다: ${relative(repo.root, overviewPath)}`);
    writes.set(overviewPath, updated);
  }
  const changed: string[] = [];
  for (const [path, text] of writes) {
    if (existsSync(path) && readFileSync(path, "utf8") === text) continue;
    writeFileAtomic(path, text);
    changed.push(relative(repo.root, path));
  }
  const notes = [...report.notes, `${ref.id} ${want} 완료${filled.filled.length > 0 ? ` · 커밋 칸 ${filled.filled.join(", ")}` : ""}`];
  notes.push(changed.length > 0 ? `바뀐 파일(커밋은 직접): ${changed.join(", ")}` : "바뀐 파일 없음 — 이미 완료");
  return { ok: true, issues: [], notes };
}

function taskDir(repo: Repo, ref: ProjectRef, taskId: string): string {
  const tasksDir = join(projectsRoot(repo.root), ref.dir, "tasks");
  const want = taskId.toUpperCase();
  const name = existsSync(tasksDir) ? readdirSync(tasksDir).find((n) => n.startsWith(`${want}_`)) : undefined;
  if (name === undefined) throw new HarnessError(`태스크를 찾지 못했다: ${ref.id} ${taskId}`);
  return join(tasksDir, name);
}

/** 기준 ID(T-n·P-n) 목록과 마감 문서의 기준 대조 행을 비교한다. */
function checkCriteria(contract: string, close: string, prefix: "T" | "P", label: string, issues: string[]): void {
  const wanted = tableRows(contract, "## 기준").map((r) => r[0]!).filter((c) => new RegExp(`^${prefix}-\\d+$`).test(c));
  const rows = tableRows(close, "## 기준 대조");
  const got = new Map(rows.map((r) => [r[0]!, r[1] ?? ""]));
  if (wanted.length === 0) issues.push(`${label}: 계약 문서에 기준(${prefix}-n)이 없다`);
  for (const c of wanted) {
    const result = got.get(c);
    if (result === undefined) issues.push(`${label}: 기준 대조에 ${c}가 없다`);
    else if (result !== "통과") issues.push(`${label}: ${c} 결과가 통과가 아니다 (${result || "빈칸"})`);
  }
}

interface TaskCandidateFiles {
  head?: string;
  hasEntry(path: string): boolean;
  hasEvidence(path: string): boolean;
  hasProof(path: string): boolean;
  readText(path: string): string | null;
  mode(path: string): string | null;
  records(dir: string): string[];
}

const REVIEW_GIT_ENV = { GIT_NO_LAZY_FETCH: "1", GIT_NO_REPLACE_OBJECTS: "1" };

function candidateRecordPaths(repo: Repo, dir: string, entries: Iterable<string>): string[] {
  const prefix = relativeGitPath(repo.root, dir) + "/";
  return [...entries].filter((path) => path.startsWith(prefix) && /^review-records\/R\d+\.json$/.test(path.slice(prefix.length)))
    .map((path) => path.slice(prefix.length));
}

function taskCandidateFiles(repo: Repo, projectRel: string, head: string): TaskCandidateFiles {
  const env = REVIEW_GIT_ENV;
  const tree = gitSpawn(repo.root, ["--literal-pathspecs", "ls-tree", "-r", "-t", "-l", "-z", head, "--", `${projectRel}/tasks`], env);
  if (tree.status !== 0) throw new HarnessError("검사 후보의 태스크 Git tree를 읽지 못했다");
  const files = new Map<string, { mode: string; size: number }>();
  for (const entry of tree.stdout.split("\0")) {
    if (entry === "") continue;
    const item = /^(\d+) \S+ [a-f0-9]+ +([0-9]+|-)\t([\s\S]+)$/.exec(entry);
    if (!item) throw new HarnessError("검사 후보의 태스크 Git tree 형식을 확인하지 못했다");
    files.set(item[3]!, { mode: item[1]!, size: Number(item[2]) });
  }
  const metadata = (path: string) => files.get(relativeGitPath(repo.root, path));
  const regular = (entry: { mode: string } | undefined) => /^(100644|100755)$/.test(entry?.mode ?? "");
  return {
    head,
    hasEntry: (path) => metadata(path) !== undefined,
    hasEvidence: (path) => { const entry = metadata(path); return regular(entry) || entry?.mode === "040000"; },
    hasProof: (path) => { const entry = metadata(path); return regular(entry) && entry!.size > 0; },
    mode: (path) => metadata(path)?.mode ?? null,
    records: (dir) => candidateRecordPaths(repo, dir, files.keys()),
    readText(path) {
      const rel = relativeGitPath(repo.root, path);
      if (!regular(files.get(rel))) return null;
      const content = gitSpawn(repo.root, ["show", `${head}:${rel}`], env);
      if (content.status !== 0) throw new HarnessError("검사 후보의 태스크 Git 파일을 읽지 못했다");
      return content.stdout;
    },
  };
}

function indexTaskFiles(repo: Repo, dir: string): TaskCandidateFiles {
  const scope = relativeGitPath(repo.root, dir);
  const index = gitSpawn(repo.root, ["--literal-pathspecs", "ls-files", "--stage", "-z", "--", scope], REVIEW_GIT_ENV);
  if (index.status !== 0) throw new HarnessError("검사 후보의 태스크 index를 읽지 못했다");
  const files = new Map<string, { mode: string; oid: string }>();
  for (const entry of index.stdout.split("\0").filter(Boolean)) {
    const item = /^(\d+) ([a-f0-9]+) ([0-3])\t([\s\S]+)$/.exec(entry);
    if (!item || !isGitObject(item[2])) throw new HarnessError("검사 후보의 태스크 index 형식을 확인하지 못했다");
    files.set(item[4]!, { mode: item[3] === "0" ? item[1]! : "conflict", oid: item[2] });
  }
  const entries = [...files.keys()];
  const metadata = (path: string) => files.get(relativeGitPath(repo.root, path));
  const readText = (path: string) => {
    const entry = metadata(path);
    if (!entry || !/^100(644|755)$/.test(entry.mode)) return null;
    const content = gitSpawn(repo.root, ["cat-file", "blob", entry.oid], REVIEW_GIT_ENV);
    if (content.status !== 0) throw new HarnessError("검사 후보의 index 파일을 읽지 못했다");
    return content.stdout;
  };
  return {
    hasEntry: (path) => metadata(path) !== undefined,
    hasEvidence: (path) => /^100(644|755)$/.test(metadata(path)?.mode ?? "") || entries.some((entry) => entry.startsWith(relativeGitPath(repo.root, path) + "/")),
    hasProof: (path) => !!readText(path),
    readText,
    mode: (path) => metadata(path)?.mode ?? null,
    records: (dir) => candidateRecordPaths(repo, dir, entries),
  };
}

function candidateReviewAt(dir: string, source: TaskCandidateFiles): ReviewCandidate {
  return {
    hasEntry: (path) => source.hasEntry(join(dir, path)),
    hasProof: (path) => source.hasProof(join(dir, path)),
    readText: (path) => source.readText(join(dir, path)),
    taskMode: (path) => source.mode(join(dir, path)),
    records: () => source.records(dir),
  };
}

function workingPathKind(root: string, path: string): "file" | "missing" | "unsafe" {
  let current = root;
  const parts = path.split("/");
  for (const [index, part] of parts.entries()) {
    try {
      const names = readdirSync(current);
      if (!names.includes(part)) {
        return names.some((name) => name.toLowerCase() === part.toLowerCase()) ? "unsafe" : "missing";
      }
      current = join(current, part);
      const stat = lstatSync(current);
      if (index === parts.length - 1) return stat.isFile() && stat.nlink === 1 ? "file" : "unsafe";
      if (!stat.isDirectory()) return "unsafe";
    } catch { return "unsafe"; }
  }
  return "unsafe";
}

function permissionScopeIssues(repo: Repo, ref: ProjectRef, dir: string, permission: ReviewPermission, candidate?: TaskCandidateFiles): string[] {
  const read = (args: string[]) => gitSpawn(repo.root, args, REVIEW_GIT_ENV);
  const headResult = candidate?.head ? null : read(["rev-parse", "--verify", "HEAD"]);
  const head = candidate?.head ?? headResult?.stdout.trim();
  const base = permission.base;
  if (!isGitObject(head) || (headResult && headResult.status !== 0) ||
      read(["cat-file", "-t", base]).stdout.trim() !== "commit" ||
      read(["merge-base", "--is-ancestor", base, head]).status !== 0) return ["허가 기준 커밋이 검사 후보의 조상이 아니다"];
  if (permission.mode === "implementation" && permission.paths.length === 0) return [];
  const project = relativeGitPath(repo.root, projectFile(repo, ref));
  const projectDir = project.slice(0, project.lastIndexOf("/"));
  const task = relativeGitPath(repo.root, dir);
  const administrative = new Set([project, `${projectDir}/log.jsonl`, ".pace/memory/status.md", "backlogs/dashboard/data.js"]);
  const taskFiles = /^(?:TASK(?:-CLOSE)?\.md|PRE-REVIEW\.json|REVIEW-(?:LOG\.jsonl|FOLLOWUPS\.json|ESCALATION-(?:pre|post)\.json)|(?:evidence|review-records)\/.+\.(?:md|json|jsonl|txt|log|patch|diff|csv|tsv|png|jpg|svg|html|pdf))$/;
  const insideTask = (path: string) => path.startsWith(task + "/") && taskFiles.test(path.slice(task.length + 1));
  const overview = read(["show", `${base}:${project}`]);
  const source = overview.status === 0 ? backlogFolder(repo, join(repo.root, projectDir), overview.stdout) : null;
  if (source && basename(source).startsWith("BL")) {
    const backlink = relativeGitPath(repo.root, source);
    administrative.add(`${backlink}/BACKLOG.md`);
    const brief = listBriefs(repo.root, source).find((entry) => entry.id === basename(dir).slice(1, 3));
    if (brief) administrative.add(relativeGitPath(repo.root, brief.path));
  }
  const permitted = new Set(permission.paths);
  if (!candidate) {
    const flags = read(["ls-files", "-v", "-z"]);
    if (flags.status !== 0 || flags.stdout.split("\0").some((entry) => entry && !entry.startsWith("H "))) {
      return ["작업본에서 추적 상태가 숨겨졌거나 확인할 수 없다"];
    }
    if (permission.paths.some((path) => workingPathKind(repo.root, path) === "unsafe")) return ["허가 경로가 일반 파일 경로로 확인되지 않는다"];
  }
  const changes = (args: string[]) => read(["-c", "core.fileMode=true", "-c", "core.fsmonitor=false", "diff", "--no-ext-diff", "--no-renames", "--no-relative", "--raw", "--abbrev=64", "-z", ...args, "--"]);
  const history = base === head ? null : read(["log", "--format=", "--no-ext-diff", "--no-renames", "--raw", "--abbrev=64", "-m", "-z", `${base}..${head}`, "--"]);
  const results = [history, candidate?.head ? changes([base, head]) : changes(["--cached", base]),
    candidate ? null : changes([base]), candidate ? null : read(["ls-files", "--others", "--exclude-standard", "-z"])];
  const errors = new Set<string>();
  for (const [view, result] of results.entries()) {
    if (!result) continue;
    if (result.status !== 0) return ["후보의 허가 범위 변경을 확인하지 못했다"];
    const parts = result.stdout.split("\0");
    for (let index = 0; index < parts.length; index++) {
      const item = view === 0 ? parts[index]!.replace(/^\n+/, "") : parts[index]!;
      if (!item) continue;
      const meta = view === 3 ? null : /^:(\d{6}) (\d{6}) [a-f0-9]+ [a-f0-9]+ [AMD][0-9]*$/.exec(item);
      if (view !== 3 && !meta) return ["후보의 Git 변경 형식을 확인하지 못했다"];
      const path = meta ? parts[++index] : item;
      if (!permissionPath(path)) return ["후보의 변경 경로가 안전하지 않다"];
      const legalMode = !meta || [meta[1], meta[2]].every((mode) => /^(000000|100644|100755)$/.test(mode ?? "")) &&
        (meta[1] === "000000" || meta[2] === "000000" || meta[1] === meta[2]);
      const workingSafe = view !== 2 && view !== 3 || workingPathKind(repo.root, path) === (meta?.[2] === "000000" ? "missing" : "file");
      if ((!administrative.has(path) && !insideTask(path) && !permitted.has(path)) || !legalMode || !workingSafe) {
        errors.add(`허가 범위 밖이거나 일반 파일 변경으로 확인할 수 없다 — ${path}`);
      }
    }
  }
  return [...errors];
}

function reviewEditText(edit: ApprovedTaskEdit): string {
  return JSON.stringify({ version: 1, ...edit }, null, 2) + "\n";
}

/** 적힌 증거 경로가 있는지 확인하고, 서로 다른 경로 수를 돌려준다. */
function checkEvidencePaths(dir: string, text: string, label: string, issues: string[], candidate?: TaskCandidateFiles): number {
  const seen = new Set<string>();
  // 마크다운 링크 [evidence/a](evidence/a)의 괄호·대괄호는 경로가 아니다.
  for (const m of stripComments(text).matchAll(/`?((?:\.\/)?evidence\/[^\s`|()[\]]+)`?/g)) {
    // 문장 끝 쉼표·마침표·콜론·세미콜론은 경로가 아니다 — `evidence/a.md,` · `evidence/b.md.`
    const path = m[1]!.replace(/^\.\//, "").replace(/[,.:;]+$/, "");
    if (seen.has(path)) continue;
    seen.add(path);
    const absolute = join(dir, path);
    if (candidate) {
      if (!relativeGitPath(dir, absolute).startsWith("evidence/") || !candidate.hasEvidence(absolute)) {
        issues.push(`${label}: 검사 후보의 증거 파일이 없다 — ${path}`);
      }
    } else if (!existsSync(absolute)) issues.push(`${label}: 증거 파일이 없다 — ${path}`);
  }
  return seen.size;
}

function checkTaskRaw(repo: Repo, id: string, taskId: string, candidate?: TaskCandidateFiles): Report {
  const ref = findProject(repo, id);
  requireOwnWorktree(repo, ref, "check");
  const dir = taskDir(repo, ref, taskId);
  const issues: string[] = [];
  const label = `${ref.id} ${taskId.toUpperCase()}`;
  const contractPath = join(dir, "TASK.md");
  const closePath = join(dir, "TASK-CLOSE.md");
  const working = workingReview(dir);
  const projectRel = `projects/${ref.dir}`;
  const hook = !candidate && process.env.PACE_COMMIT_CHECK === "1";
  const index = !candidate ? indexTaskFiles(repo, dir) : undefined;
  const head = gitSpawn(repo.root, ["rev-parse", "--verify", "HEAD"], REVIEW_GIT_ENV);
  const headFiles = !candidate && head.status === 0 && isGitObject(head.stdout.trim()) ? taskCandidateFiles(repo, projectRel, head.stdout.trim()) : undefined;
  const views = [index, candidate, headFiles].flatMap((view) => view ? [candidateReviewAt(dir, view)] : []);
  const required = views.some(hasPermissionReview) || (!candidate && hasPermissionReview(working));
  if (hook && required) candidate = index;
  if (required && !candidate) {
    for (const path of [contractPath, closePath]) {
      if (workingPathKind(repo.root, relativeGitPath(repo.root, path)) === "unsafe") {
        return { ok: false, issues: [`${label}: 허가 대상의 작업 경로가 안전하지 않다`], notes: [] };
      }
    }
  }
  const close = candidate ? candidate.readText(closePath) : existsSync(closePath) ? readFileSync(closePath, "utf8") : null;
  let contract: string | null;
  try {
    contract = candidate ? candidate.readText(contractPath)
      : required || close === null ? working.readText("TASK.md") : readFileSync(contractPath, "utf8");
  } catch (error) {
    if (close !== null) throw error;
    contract = null;
  }
  const notes = contract === null ? [] : taskPlanWarnings(contract, taskId).map(warning => `${label}: 계획 경고 · ${warning}`);
  if (close === null) return { ok: false, issues: [`${label}: TASK-CLOSE.md가 없다`], notes };
  if (!/^- 태스크: .*판정: 통과/m.test(close)) issues.push(`${label}: 판정이 "통과"가 아니다`);
  if (contract === null) return { ok: false, issues: [`${label}: 검사 후보의 TASK.md가 없다`], notes: [] };
  const reader = candidate ? candidateReviewAt(dir, candidate) : working;
  const gate: PermissionCheck = { required, checkScope: (permission) => {
    let range = candidate;
    if (candidate?.head) {
      const task = taskId.toUpperCase();
      const completed = gitSpawn(repo.root, ["log", "-1", "--format=%H", "-F", `--grep=(${ref.id}/${task})`, candidate.head], REVIEW_GIT_ENV);
      const commit = completed.stdout.trim();
      if (completed.status !== 0 || !isGitObject(commit)) return ["검사 후보에 태스크 완료 커밋이 없다"];
      range = { ...candidate, head: commit };
    }
    return permissionScopeIssues(repo, ref, dir, permission, range);
  } };
  issues.push(...reviewIssues(dir, contract, reader, gate).map(issue => `${label}: ${issue}`));
  // Staging can leave a different TASK in the index than the reader just approved.
  // Use the working approval to check any staged TASK without requiring unrelated evidence to be staged before done.
  if (required && !candidate && index && issues.length === 0) {
    const indexMode = index.mode(contractPath);
    const indexContract = index.readText(contractPath);
    if (indexMode !== (headFiles?.mode(contractPath) ?? null) || indexContract !== (headFiles?.readText(contractPath) ?? null)) {
      if (indexContract === null) issues.push(`${label}: index의 검토 대상이 일반 파일로 확인되지 않는다 · 범위 재검토 필요`);
      else {
        const staged = { ...working, taskMode: () => indexMode };
        issues.push(...reviewIssues(dir, indexContract, staged, { required }).map(issue => `${label} index: ${issue}`));
      }
    }
  }
  if (candidate && gate.edit && reader.readText(APPLIED_REVIEW) !== reviewEditText(gate.edit)) {
    issues.push(`${label}: 허용 TASK 변경의 증거가 후보와 다르다 — done으로 기록한다`);
  }
  checkCriteria(contract, close, "T", label, issues);
  const headings = ["## 단위 테스트", "## E2E", "## 리뷰", "## 남긴 것"];
  for (const heading of headings) {
    const section = sectionBody(close, heading);
    if (section === null) issues.push(`${label}: ${heading} 절이 없다`);
    else if (section.replace(/<!--[\s\S]*?-->/g, "").trim() === "") issues.push(`${label}: ${heading} 절이 비었다`);
  }
  const evidence = checkEvidencePaths(dir, close, label, issues, candidate);
  const criteria = tableRows(contract, "## 기준").map((r) => r[0]!).filter((c) => /^T-\d+$/.test(c));
  if (issues.length === 0) notes.unshift(`확인: 판정 통과 · 기준 ${criteria.length}개(${criteria.join(", ")}) 모두 통과 · 절 ${headings.length}개 · 증거 파일 ${evidence}개`);
  return { ok: issues.length === 0, issues, notes, ...(gate.edit ? { reviewEdit: gate.edit } : {}) };
}

function stripComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, "");
}

function sectionBody(text: string, heading: string): string | null {
  const start = sectionStart(text, heading);
  if (start === -1) return null;
  const rest = text.slice(start);
  const end = rest.search(/\r?\n## /);
  return end === -1 ? rest : rest.slice(0, end);
}

function walkFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    // 링크는 따라가지 않는다 — 바깥 폴더를 훑거나 순환에 빠지지 않게.
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) walkFiles(path, out);
    else out.push(path);
  }
  return out;
}

/** 증거·시나리오처럼 실행 기록이 쌓이는 곳에 비밀 값이 원문으로 들어갔는지. */
export function findSecrets(dir: string): string[] {
  const found: string[] = [];
  for (const file of walkFiles(dir)) {
    const bytes = readFileSync(file);
    if (bytes.subarray(0, 8000).includes(0)) continue; // 바이너리(스크린샷 등)
    const text = bytes.toString("utf8");
    // 코드 파일은 코드 표현식 오탐만 뺀다(사용자 결정 — secret-scan과 같은 규칙), 리터럴은 그대로 잡는다
    if (hasSecret(text, { code: isCodeFile(file) })) found.push(relative(dir, file));
  }
  return found;
}

const INDEX_FILE = /(^|\/)\.pace\/(memory\/INDEX\.md|brain\/index\.md)$/;

function regenerateIndexes(root: string): void {
  if (existsSync(projectMemoryDir(root))) rebuildMemoryIndex(projectMemoryDir(root), "project");
  if (existsSync(join(brainDir(root), "SCHEMA.md"))) rebuildBrainIndex(root);
}

/** main 위로 rebase한다. 목차 파일만 충돌하면 다시 만들어 이어 가고, 그 밖의 충돌은 멈춘다. */
function rebaseOnto(root: string, base: string, notes: string[], target = base): string[] {
  if (gitOk(root, ["merge-base", "--is-ancestor", target, "HEAD"])) return [];
  let step = gitSpawn(root, ["rebase", target]);
  for (let guard = 0; rebaseInProgress(root) && guard < 200; guard++) {
    const conflicted = git(root, ["diff", "--name-only", "--diff-filter=U"], true).split("\n").filter(Boolean);
    const dashboardConflict = conflicted.includes("backlogs/dashboard/data.js");
    const other = conflicted.filter((f) => !INDEX_FILE.test(f) && f !== "backlogs/dashboard/data.js");
    if (other.length > 0) return [`rebase 충돌 — 직접 풀어야 한다: ${other.join(", ")} (git rebase --continue 또는 --abort)`];
    if (conflicted.length > 0) {
      for (const f of conflicted) git(root, ["checkout", "--theirs", "--", f], true);
      regenerateIndexes(root);
      if (dashboardConflict && !refreshDashboard(root, true)) return ["대시보드 충돌 재생성 실패 — 직접 확인한다"];
      // 다시 만든 목차는 충돌하지 않은 쪽도 바뀔 수 있다 — 목차 파일을 모두 스테이지한다.
      git(root, ["add", "--", ...indexFiles(root), ...(dashboardConflict ? ["backlogs/dashboard/data.js"] : [])]);
      notes.push(`목차 충돌 재생성: ${conflicted.join(", ")}`);
    }
    step = gitSpawn(root, ["rebase", "--continue"]);
    // 목차만 바꾼 커밋이 재생성 뒤 비면 건너뛴다.
    if (step.status !== 0 && rebaseInProgress(root) && git(root, ["diff", "--name-only", "--diff-filter=U"], true) === "" && isClean(root)) {
      step = gitSpawn(root, ["rebase", "--skip"]);
    }
  }
  if (rebaseInProgress(root)) return [`rebase가 끝나지 않았다: ${(step.stderr || step.stdout).trim()}`];
  if (!gitOk(root, ["merge-base", "--is-ancestor", target, "HEAD"])) return [`rebase에 실패했다: ${(step.stderr || step.stdout).trim()}`];
  notes.push(`${base} 위로 rebase`);
  return [];
}

function indexFiles(root: string): string[] {
  return [join(".pace", "memory", "INDEX.md"), join(".pace", "brain", "index.md")].filter((f) => existsSync(join(root, f)));
}

function rebaseInProgress(root: string): boolean {
  const gitDir = git(root, ["rev-parse", "--git-dir"]);
  const abs = isAbsolute(gitDir) ? gitDir : join(root, gitDir);
  return existsSync(join(abs, "rebase-merge")) || existsSync(join(abs, "rebase-apply"));
}

/**
 * 브레인이 있는 저장소에서는 PROJECT-CLOSE 정본 반영 표에 브레인 행이 있어야 한다.
 * "반영"이면 이 브랜치에서 브레인 페이지가 바뀌었어야 하고, "해당 없음"이면 비고에 이유가 있어야 한다.
 */
export function checkBrainRow(root: string, closeRows: string[][], changed: Set<string>): string[] {
  if (!existsSync(join(brainDir(root), "SCHEMA.md"))) return [];
  const row = closeRows.find((r) => /^\s*`?브레인|`\.pace\/brain\/?`/.test(stripComments(r[0] ?? "")));
  if (row === undefined) return ['정본 반영: 브레인 행이 없다 — 남길 결정·함정이 있으면 "반영"(pace brain add·update), 없으면 "해당 없음"과 이유'];
  const result = stripComments(row[1] ?? "");
  if (/해당 없음/.test(result)) {
    const reason = stripComments(row[2] ?? "").trim();
    if (reason === "") return ['정본 반영: 브레인 "해당 없음"의 이유를 비고에 적는다'];
    return brainUpdateCandidates(root, changed).map((page) => page.split(sep).join("/"))
      .filter((page) => !reason.includes(page))
      .map((page) => `정본 반영: 브레인 갱신 후보 ${page}를 검토한 이유를 "해당 없음" 비고에 적는다`);
  }
  if (/반영/.test(result)) {
    const touched = [...changed].some((f) => f.startsWith(".pace/brain/pages/"));
    return touched ? [] : ['정본 반영: 브레인을 "반영"이라 했지만 .pace/brain/pages/가 바뀌지 않았다 (pace brain add·update)'];
  }
  return ['정본 반영: 브레인 행의 반영 칸은 "반영" 또는 "해당 없음"이다'];
}

/** 정본 경로가 바뀐 파일에 걸리는가 — 같은 파일, 폴더 접두, glob(`**` 여러 단계 · `*` 한 단계 안). */
export function canonTouched(target: string, changed: Iterable<string>): boolean {
  if (target.includes("*")) {
    const source = target
      .split(/(\*\*\/?|\*)/)
      .map((part) => (part.startsWith("**") ? ".*" : part === "*" ? "[^/]*" : part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")))
      .join("");
    const re = new RegExp(`^${source}$`);
    return [...changed].some((f) => re.test(f));
  }
  const dir = target.replace(/\/?$/, "/");
  return [...changed].some((f) => f === target || f.startsWith(dir));
}

/** 바꿀 정본 목록의 첫 칸에서 경로(`…`)를 읽는다. */
function canonTargets(project: string): string[] {
  const start = project.indexOf("**바꿀 정본 목록**");
  if (start === -1) return [];
  const lines = project.slice(start).split("\n").slice(1);
  const rows: string[] = [];
  let seen = false;
  for (const line of lines) {
    if (!line.startsWith("|")) {
      if (seen) break;
      continue;
    }
    seen = true;
    rows.push(line);
  }
  return rows
    .slice(2)
    .flatMap((l) => [...(l.split("|")[1] ?? "").matchAll(/`([^`]+)`/g)].map((m) => m[1]!))
    .filter((p) => !p.includes(" "));
}

const reviewedTeamWorktree = "팀 마감 전에는 검토한 변경만 직접 커밋하고 깨끗한 작업본에서 finish를 다시 실행한다";

function cleanTeamWorktree(root: string): boolean {
  return git(root, ["status", "--porcelain", "--untracked-files=all", "--ignore-submodules=none"]) === "";
}

function finishStrayPaths(root: string, project: string, mainDirect: boolean): string[] {
  return pendingPaths(root, false).filter((path) =>
    !path.startsWith(`${project}/`) && (mainDirect || !path.startsWith(".pace/")) && path !== "backlogs/dashboard/data.js");
}

function validateTeamFinishCandidate(repo: Repo, ref: ProjectRef, projectRel: string, head: string, finishGit: Parameters<typeof assertTeamFinishInputs>[2]): string[] {
  const inputs = new InputSnapshot(), logProofInputs = new InputSnapshot();
  assertTeamCommitReceipts(repo.root, projectRel, ref.id, inputs, logProofInputs);
  const dashboard = collectDashboard(repo, ref, {}, inputs);
  const issues = teamRetrospectiveIssues(repo.root, projectRel, dashboard.improvements, dashboard.team?.unusedRoleCandidates.map((r) => r.role), dashboard.team?.period, inputs, true);
  if (issues.length) return issues;
  assertTeamFinishInputs(repo.root, inputs, finishGit, head);
  assertTeamFinishInputs(repo.root, logProofInputs, finishGit, head, { allowMissingFiles: true });
  return [];
}

function finishSecurityChecks(repo: Repo, mainDirect: boolean, notes: string[], candidateBase?: string): string | undefined {
  const beforeCommands = candidateBase === undefined ? undefined : finishInputFingerprint(repo.root);
  const security = executionCommand(repo, repo.root, "보안 검사");
  if (security === null) notes.push("경고: 보안 검사 명령이 선언되지 않았다 (docs/README.md 환경)");
  else {
    const r = run(repo.root, security);
    if (!r.ok) return `보안 검사 실패: ${security}\n${r.output.slice(-2000)}`;
    notes.push(`보안 검사 통과: ${security}`);
  }
  // 4-1. 의존성 감사(선택 선언) — 잠금 파일이 base 대비 바뀐 브랜치에서만. worktree 준비는 조회 없이 설치하고, 기존 패키지의 새 취약점은 main 주기 점검이 맡는다.
  const audit = executionCommand(repo, repo.root, "의존성 감사");
  if (audit !== null) {
    if (mainDirect) notes.push("의존성 감사 생략: main 직접 마감 — 잠금 파일을 바꿨다면 직접 실행한다");
    else {
      const locks = changedLockFiles(git(repo.root, ["diff", "--name-only", "--no-renames", `${candidateBase ?? repo.base}...HEAD`], true).split("\n").filter(Boolean));
      if (locks.length === 0) notes.push("의존성 감사 생략: 잠금 파일이 base와 같다");
      else {
        const r = run(repo.root, audit);
        if (!r.ok) return `의존성 감사 실패 (${locks.join(", ")}): ${audit}\n${r.output.slice(-2000)}`;
        notes.push(`의존성 감사 통과 (${locks.join(", ")}): ${audit}`);
      }
    }
  }
  if (beforeCommands !== undefined && finishInputFingerprint(repo.root) !== beforeCommands) return "보안 검사/의존성 감사 뒤 자료 또는 인덱스가 바뀌었다: 확인·커밋하고 finish를 다시 실행한다";
  return undefined;
}

function finishProjectRaw(repo: Repo, id: string, attempt: { source?: string; preserveLog?: boolean }): Report {
  let ref = findProject(repo, id);
  const onOwnBranch = repo.branch === ref.branch;
  const mainDirect = !repo.inWorktree && repo.branch === repo.base && !branchExists(repo, ref.branch);
  if (!onOwnBranch && !mainDirect) {
    throw new HarnessError(`finish는 ${ref.id}의 worktree에서 실행한다: ${worktreeOf(repo, ref.branch) ?? ref.worktree}`);
  }
  const issues: string[] = [];
  const notes: string[] = [];
  let projectRel = relativeGitPath(repo.root, join(projectsRoot(repo.root), ref.dir));
  const finishGit = (args: string[], env?: Record<string, string>) => gitSpawn(repo.root, args, env);
  const initialHead = git(repo.root, ["rev-parse", "--verify", "HEAD"]);
  let candidateHead = initialHead;
  const baseRef = `refs/heads/${repo.base}`;
  const originalBase = mainDirect ? initialHead : git(repo.root, ["rev-parse", "--verify", baseRef], true);
  if (!originalBase) {
    attempt.preserveLog = true;
    return { ok: false, issues: ["마감 기준 브랜치를 확인할 수 없다: 기준을 확인하고 finish를 다시 실행한다"], notes };
  }
  let initialTeamRequired = false;
  try {
    initialTeamRequired = teamRetrospectiveRequired(repo.root, projectRel);
    if (!initialTeamRequired) {
      const history = hasTeamFinishHistory(projectRel, ref.id, initialHead, finishGit)
        ? "팀 채택 이력이 있다: 팀 측정 입력을 복원하고 다시 마감한다"
        : originalBase !== initialHead && hasTeamFinishHistory(projectRel, ref.id, originalBase, finishGit)
        ? "기준 브랜치에만 팀 채택 이력이 있다: 채택 입력을 확인한 뒤 다시 마감한다"
        : undefined;
      if (history) {
        attempt.preserveLog = true;
        return { ok: false, issues: [history], notes };
      }
    }
    if (initialTeamRequired) {
      if (!cleanTeamWorktree(repo.root) || git(repo.root, ["rev-parse", "--verify", "HEAD"]) !== initialHead) {
        attempt.preserveLog = true;
        return { ok: false, issues: [reviewedTeamWorktree], notes };
      }
      if (!mainDirect) {
        const conflict = rebaseOnto(repo.root, repo.base, notes, originalBase);
        if (conflict.length) return { ok: false, issues: conflict, notes };
        ref = findProject(repo, id);
        projectRel = relativeGitPath(repo.root, join(projectsRoot(repo.root), ref.dir));
        if (!teamRetrospectiveRequired(repo.root, projectRel)) {
          return { ok: false, issues: ["팀 채택 근거가 rebase/검사 중 사라졌다: 팀 측정 입력을 복원하고 다시 마감한다"], notes };
        }
        assertTeamFinishDestination(repo.root, projectRel, ref.id);
      }
      candidateHead = git(repo.root, ["rev-parse", "--verify", "HEAD"]);
      if (!cleanTeamWorktree(repo.root)) {
        attempt.preserveLog = true;
        return { ok: false, issues: [reviewedTeamWorktree], notes };
      }
      issues.push(...handoffCommitPrivacyIssues(repo.root, candidateHead, mainDirect ? undefined : originalBase));
      issues.push(...validateTeamFinishCandidate(repo, ref, projectRel, candidateHead, finishGit));
    }
  } catch (error) {
    if (!cleanTeamWorktree(repo.root)) attempt.preserveLog = true;
    issues.push(`팀 측정/회고 입력 또는 선언 영수증 메타데이터를 검증하지 못했다; finish 보류${error instanceof Error ? `\n${error.message}` : ""}`);
  }
  const projectPath = projectFile(repo, ref);
  const project = readFileSync(projectPath, "utf8");
  const dir = join(projectsRoot(repo.root), ref.dir);
  const backlogChange = mainDirect ? backlogStateChange(repo, projectPath, project, "완료") : null;
  const comparisonBase = initialTeamRequired ? originalBase : repo.base;
  issues.push(...handoffPrivacyIssues(repo.root));
  try {
    const handoffs = collectHandoffs(repo.root, ref.id, projectRel);
    if (handoffs?.open.length) notes.push(`경고: 열린 위임 ${handoffs.open.length}건 (partial/blocked 포함): ${handoffs.open.join(", ")}`);
    if (handoffs?.missingBodies) notes.push(`경고: 로컬 본문 ${handoffs.missingBodies}건 없음 — metadata-only, 원문 재감사 불가`);
  } catch { issues.push("소통 원장/로컬 본문 손상 또는 미지원 형식; finish 보류"); }
  const backlogRel = backlogChange ? relativeGitPath(repo.root, backlogChange.path) : null;
  guardPartialProjectStages(repo.root, projectRel);
  if (backlogRel) requireCleanBacklog(repo.root, backlogRel);
  guardDashboardDrafts(repo.root, [projectRel, ...(backlogRel ? [backlogRel] : [])]);
  if (mainDirect) {
    const stray = finishStrayPaths(repo.root, projectRel, mainDirect);
    if (stray.length) throw new HarnessError(`프로젝트 밖에 커밋하지 않은 변경이 있다: ${stray.slice(0, 10).join(", ")}`);
  }

  // 1. 태스크
  const taskCandidate = taskCandidateFiles(repo, projectRel, candidateHead);
  for (const row of taskRows(project)) {
    const [taskId, , , state] = row;
    if (!/^T\d{2}$/.test(taskId ?? "")) continue;
    if (state === "보류") continue;
    if (state !== "완료") issues.push(`${taskId}: 상태가 완료가 아니다 (${state || "빈칸"})`);
    else {
      const useCandidate = initialTeamRequired || hasPermissionReview(candidateReviewAt(taskDir(repo, ref, taskId!), taskCandidate));
      issues.push(...checkTaskRaw(repo, id, taskId!, useCandidate ? taskCandidate : undefined).issues);
      // 승인된 선반영 뒤에도 태스크 커밋은 HEAD의 조상이다. 다른 브랜치의 태그는 인정하지 않는다.
      const commits = git(repo.root, ["log", "-1", "--format=%h", "-F", `--grep=(${ref.id}/${taskId})`, "HEAD"]);
      if (commits === "") issues.push(`${taskId}: 태스크 커밋이 없다 — (${ref.id}/${taskId})`);
    }
  }
  // BL 브리프와 태스크의 완료·보류가 일치해야 전체 완료가 거짓으로 표시되지 않는다.
  const sourceFolder = linkedBacklogFolder(dirname(projectPath), project);
  const isBacklogSource = sourceFolder !== null;
  const linked = isBacklogSource ? backlogFolder(repo, dirname(projectPath), project) : null;
  if (isBacklogSource && linked === null) throw new HarnessError("백로그 출처가 backlogs/ 밖을 가리킨다");
  if (linked !== null) {
    const overviewPath = join(linked, "BACKLOG.md");
    if (!existsSync(overviewPath)) throw new HarnessError("백로그 개요 BACKLOG.md가 없다");
    assertBacklogPath(join(repo.root, "backlogs"), overviewPath);
    const rows = tableRows(readFileSync(overviewPath, "utf8").replaceAll("\r\n", "\n"), "## 진행 현황");
    const briefs = listBriefs(repo.root, linked);
    const tasks = taskRows(project).filter((row) => /^T\d{2}$/.test(row[0] ?? ""));
    const ids = new Set([...briefs.map((brief) => brief.id), ...tasks.map((task) => task[0]!.slice(1))]);
    const statusRows: { id: string; state: string }[] = [];
    for (const row of rows) {
      const match = /^\[?BR(\d{2})(?=$|[\s\]])/.exec(row[0] ?? "");
      if (!match) { issues.push("백로그 진행 현황에 BR 번호가 잘못된 행이 있다"); continue; }
      ids.add(match[1]!);
      statusRows.push({ id: match[1]!, state: row[1] ?? "" });
    }
    for (const id of ids) {
      const foundBrief = briefs.filter((brief) => brief.id === id);
      const foundTasks = tasks.filter((task) => task[0] === `T${id}`);
      const foundRows = statusRows.filter((row) => row.id === id);
      if (foundBrief.length !== 1 || foundTasks.length !== 1 || foundRows.length !== 1) {
        issues.push(`BR${id}: 브리프·태스크·진행 현황의 번호가 없거나 중복이다 — 진행 중인 BL의 추가 업무는 main에서 같은 번호 BR을 기획하고 worktree에 반영한다. 번호가 다르거나 충돌하면 중단해 판단하며, 완료 BL에는 추가하지 않는다`);
        continue;
      }
      const state = readState(readFileSync(foundBrief[0]!.path, "utf8")).split(/\s/)[0];
      if (!["완료", "보류"].includes(state ?? "") || foundTasks[0]![3] !== state || foundRows[0]!.state !== state) issues.push(`BR${id}: 브리프·태스크·진행 현황의 완료/보류 상태가 일치하지 않는다`);
    }
  }
  // 2. PROJECT-CLOSE
  const closePath = projectFile(repo, ref, "PROJECT-CLOSE.md");
  if (existsSync(closePath)) assertMetricsDestination(repo, ref);
  const close = existsSync(closePath) ? readFileSync(closePath, "utf8") : null;
  if (close === null) issues.push("PROJECT-CLOSE.md가 없다");
  else {
    checkCriteria(project, close, "P", ref.id, issues);
    issues.push(...metricsSummaryIssues(close));
    const security = sectionBody(close, "## 보안");
    if (security === null || stripComments(security).trim() === "") issues.push("PROJECT-CLOSE: ## 보안 절이 비었다");
    // 템플릿 기본 행(브레인)은 첫 칸이 차 있으므로, 반영 칸까지 채운 행만 센다.
    const canonRows = tableRows(stripComments(close), "## 정본 반영").filter((r) => (r[0] ?? "") !== "" && (r[1] ?? "").trim() !== "");
    if (canonRows.length === 0) issues.push("PROJECT-CLOSE: ## 정본 반영 표가 비었다");
  }
  // 2-1. 브레인 행 — main 직접 프로젝트도 확인한다. 반영 여부는 커밋된 변경과 아직 커밋하지 않은 변경을 함께 본다.
  {
    const committed = mainDirect ? [] : git(repo.root, ["diff", "--name-only", "--no-renames", `${comparisonBase}...HEAD`], true).split("\n");
    const pending = pendingPaths(repo.root);
    const changed = new Set([...committed, ...pending].filter(Boolean));
    for (const page of brainUpdateCandidates(repo.root, changed)) notes.push(`브레인 갱신 후보: ${page} — 변경된 근거의 주장을 확인한다`);
    issues.push(...checkBrainRow(repo.root, close ? tableRows(close, "## 정본 반영") : [], changed));
  }
  // 3. 정본 반영 — 목록의 경로가 이 브랜치에서 바뀌었거나, PROJECT-CLOSE에 "해당 없음"으로 적혔는지
  if (!mainDirect) {
    const changed = new Set(git(repo.root, ["diff", "--name-only", "--no-renames", `${comparisonBase}...HEAD`], true).split("\n").filter(Boolean));
    const closeRows = close ? tableRows(close, "## 정본 반영") : [];
    for (const target of canonTargets(project)) {
      const touched = canonTouched(target, changed);
      const waived = closeRows.some((r) => (r[0] ?? "").includes(target) && /해당 없음/.test(r[1] ?? ""));
      if (!touched && !waived) issues.push(`정본 반영: ${target}가 바뀌지 않았다 (반영하거나 PROJECT-CLOSE에 "해당 없음")`);
    }
  }
  // 3-1. 프로젝트 밖의 커밋하지 않은 변경 — 마감 커밋에 검사 없이 쓸려 들어가지 않게
  if (!mainDirect) {
    const stray = finishStrayPaths(repo.root, projectRel, mainDirect);
    if (stray.length > 0) issues.push(`커밋하지 않은 변경이 있다 — 태스크 커밋에 넣거나 치운다: ${stray.slice(0, 10).join(", ")}`);
  }
  // 4. 보안 — 비밀 노출, 선언된 보안 검사
  for (const file of findSecrets(dir)) issues.push(`비밀 노출 의심: ${relative(repo.root, join(dir, file))}`);
  if (existsSync(join(brainDir(repo.root), "SCHEMA.md"))) {
    const lint = lintBrain(repo.root);
    notes.push(...lint.notes);
    for (const issue of lint.issues.filter((i) => i.severity === "error")) issues.push(`브레인 lint: ${issue.page} — ${issue.detail}`);
  }
  if (issues.length > 0) return { ok: false, issues, notes };
  const securityFailure = finishSecurityChecks(repo, mainDirect, notes, initialTeamRequired ? comparisonBase : undefined);
  if (securityFailure) return { ok: false, issues: [securityFailure], notes };
  // 활성 대시보드 오류는 원본이나 인덱스를 바꾸기 전에 발견한다.
  const dashboardPath = "backlogs/dashboard/data.js";
  const dashboardPresent = existsSync(join(repo.root, dashboardPath));
  if (dashboardPresent && !initialTeamRequired) {
    const restoreDashboard = snapshotOwned(repo.root, [dashboardPath]);
    withRestoration(() => generateDashboard(repo.root, true), restoreDashboard);
  }
  const finishLog = relativeGitPath(repo.root, join(dir, "log.jsonl"));
  const finishOutputs = [relativeGitPath(repo.root, projectPath), relativeGitPath(repo.root, projectFile(repo, ref, "METRICS.md")), "projects/METRICS.md", finishLog, ...(backlogRel ? [backlogRel] : []), ...(dashboardPresent ? [dashboardPath] : [])];
  const ownedFinish = [...finishOutputs, ...(!mainDirect && initialTeamRequired ? [`${projectRel}/${teamFinishFile}`] : []), ...(mainDirect && !initialTeamRequired ? pendingPaths(repo.root).filter((path) => path.startsWith(`${projectRel}/`)) : [])];
  let restoreDirect = mainDirect ? snapshotFinishOwned(repo.root, ownedFinish, finishLog, initialTeamRequired) : null;
  try {
  // Team inputs are already committed. The legacy path still collects its indexes.
  if (initialTeamRequired) {
    if (!cleanTeamWorktree(repo.root) || git(repo.root, ["rev-parse", "--verify", "HEAD"]) !== candidateHead) {
      attempt.preserveLog = true;
      return { ok: false, issues: [reviewedTeamWorktree], notes };
    }
  } else {
    if (teamRetrospectiveRequired(repo.root, projectRel)) {
      attempt.preserveLog = true;
      return { ok: false, issues: ["검사 뒤 현재 작업본의 팀 채택 상태가 바뀌었다: 검토한 커밋을 확인하고 다시 마감한다"], notes };
    }
    const currentBase = git(repo.root, ["rev-parse", "--verify", baseRef]);
    if (currentBase !== originalBase && hasTeamFinishHistory(projectRel, ref.id, currentBase, finishGit)) {
      attempt.preserveLog = true;
      return { ok: false, issues: ["기준 브랜치에만 팀 채택 이력이 있다: 채택 입력을 확인한 뒤 다시 마감한다"], notes };
    }
    const currentHead = git(repo.root, ["rev-parse", "--verify", "HEAD"]);
    if (currentHead !== initialHead && hasTeamFinishHistory(projectRel, ref.id, currentHead, finishGit)) {
      attempt.preserveLog = true;
      return { ok: false, issues: ["검사 뒤 팀 채택 이력이 생겼다: 검토한 커밋을 확인하고 다시 마감한다"], notes };
    }
    const commitPrivacy = handoffPrivacyIssues(repo.root);
    if (commitPrivacy.length) return { ok: false, issues: commitPrivacy, notes };
    const stray = finishStrayPaths(repo.root, projectRel, mainDirect);
    if (stray.length) return { ok: false, issues: [`보안 검사/의존성 감사 뒤 자료 또는 인덱스가 범위 밖에서 바뀌었다: ${stray.slice(0, 10).join(", ")}`], notes };
    regenerateIndexes(repo.root);
    if (!isClean(repo.root)) {
      git(repo.root, ["add", "-A"]);
      stageDashboard(repo.root);
      git(repo.root, ["commit", "-m", `chore(${ref.id}): 목차 갱신`]);
      if (mainDirect) restoreDirect = snapshotFinishOwned(repo.root, ownedFinish, finishLog, false);
    }
  }
  // 6. rebase
  if (!mainDirect && !initialTeamRequired) {
    const conflict = rebaseOnto(repo.root, repo.base, notes);
    if (conflict.length > 0) return { ok: false, issues: conflict, notes };
  }
  // 7. 검사 명령(회귀)
  const checkedHead = initialTeamRequired ? candidateHead : git(repo.root, ["rev-parse", "HEAD"]);
  const check = executionCommand(repo, repo.root, "검사");
  if (check === null) notes.push("경고: 검사 명령이 선언되지 않았다 (docs/README.md 환경)");
  else {
    const r = run(repo.root, check, CHECK_TIMEOUT_MS);
    if (!r.ok) return { ok: false, issues: [`검사 실패: ${check}\n${r.output.slice(-2000)}`], notes };
    notes.push(`검사 통과: ${check}`);
  }
  if (git(repo.root, ["rev-parse", "HEAD"]) !== checkedHead) return { ok: false, issues: ["검사 중 HEAD가 바뀌었다: 생성된 커밋을 보존하고 확인 뒤 finish를 다시 실행한다"], notes };
  // Rebase/check may change team definitions; validate against the same final state used by metrics.
  let finalTeamRequired = false;
  try {
    finalTeamRequired = teamRetrospectiveRequired(repo.root, projectRel);
    if (initialTeamRequired && !finalTeamRequired) return { ok: false, issues: ["팀 채택 근거가 rebase/검사 중 사라졌다: 팀 측정 입력을 복원하고 다시 마감한다"], notes };
    if (!initialTeamRequired && finalTeamRequired) return { ok: false, issues: ["rebase/검사 중 팀 채택 상태가 바뀌었다: 검토한 커밋을 확인하고 다시 마감한다"], notes };
    if (!finalTeamRequired && hasTeamFinishHistory(projectRel, ref.id, checkedHead, finishGit)) {
      return { ok: false, issues: ["rebase 뒤 팀 채택 이력이 있다: 팀 측정 입력을 복원하고 다시 마감한다"], notes };
    }
    if (finalTeamRequired) {
      if (!cleanTeamWorktree(repo.root)) return { ok: false, issues: ["검사 뒤 staged/unstaged 자료가 바뀌었다: 확인·커밋하고 finish를 다시 실행한다"], notes };
      const commitPrivacy = handoffCommitPrivacyIssues(repo.root, checkedHead, mainDirect ? undefined : originalBase);
      if (commitPrivacy.length) return { ok: false, issues: commitPrivacy, notes };
      const finalTeamIssues = validateTeamFinishCandidate(repo, ref, projectRel, checkedHead, finishGit);
      if (finalTeamIssues.length) return { ok: false, issues: finalTeamIssues, notes };
    }
  } catch (error) { return { ok: false, issues: [`최종 팀 측정/회고 대조 실패; finish 보류${error instanceof Error ? `\n${error.message}` : ""}`], notes }; }
  // 8. 병합 대기 — 커밋 칸은 rebase 뒤 해시로
  const filled = fillCommitHashes(repo.root, ref, readFileSync(projectPath, "utf8"));
  if (filled.filled.length > 0) notes.push(`커밋 칸: ${filled.filled.join(", ")}`);
  if (finalTeamRequired) attempt.source = `finish:${randomBytes(12).toString("hex")}`;
  const restoreFinal = mainDirect ? null : snapshotFinishOwned(repo.root, [...ownedFinish, ...(!mainDirect && finalTeamRequired ? [`${projectRel}/${teamFinishFile}`] : [])], finishLog, finalTeamRequired);
  try {
  writeBacklogState(repo, backlogChange);
  writeFileAtomic(projectPath, setState(filled.text, mainDirect ? "완료" : "병합 대기"));
  const validatedTeamInputs = new InputSnapshot();
  if (finalTeamRequired && !emitMetric(repo, ref.id, "finish", true, undefined, undefined, { src: attempt.source }, false, true)) {
    throw new HarnessError("팀 마감 성공 사건을 기록하지 못했다");
  }
  const finalDashboard = refreshProjectMetrics(repo, ref, { finishing: true }, finalTeamRequired ? validatedTeamInputs : undefined);
  if (finalTeamRequired) {
    const finalIssues = teamRetrospectiveIssues(repo.root, projectRel, finalDashboard.improvements, finalDashboard.team?.unusedRoleCandidates.map((r) => r.role), finalDashboard.team?.period, validatedTeamInputs, true);
    if (finalIssues.length) throw new HarnessError(finalIssues.join("\n"));
  }
  git(repo.root, ["add", "--", projectFile(repo, ref, "METRICS.md"), join(repo.root,"projects","METRICS.md")]);
  if (!finalTeamRequired) emitMetric(repo, ref.id, "finish", true);
  git(repo.root, ["add", "--", join(dir, "log.jsonl")], !finalTeamRequired);
  // 검사 명령이 만든 파일(로그 등)은 마감 커밋에 넣지 않는다.
  git(repo.root, ["add", "--", projectPath]);
  stageDashboard(repo.root);
  const capturedTree = finalTeamRequired ? git(repo.root, ["write-tree"]) : null;
  let finishReceipt: { path: string; content: string } | undefined;
  if (capturedTree) {
    assertTeamFinishInputs(repo.root, validatedTeamInputs, finishGit, capturedTree);
    assertTeamFinishScope(finishGit, checkedHead, capturedTree, finishOutputs);
    if (git(repo.root, ["rev-parse", "HEAD"]) !== checkedHead) throw new HarnessError("마감 중 HEAD가 바뀌었다: 생성된 커밋을 보존하고 finish를 다시 실행한다");
    if (!mainDirect) finishReceipt = {
      path: `${projectRel}/${teamFinishFile}`,
      content: writeTeamFinish(repo.root, projectRel, ref.id, finishGit, {
        tree: capturedTree, parent: checkedHead, checkStatus: check === null ? "not-run" : "passed",
      }),
    };
  }
  const finishMessage = `chore(${ref.id}): 마감`;
  if (capturedTree) commitTeamFinish(finishGit, capturedTree, checkedHead, finishMessage, finishReceipt);
  else if (!gitOk(repo.root, ["diff", "--cached", "--quiet"])) git(repo.root, ["commit", "-m", finishMessage]);
  if (capturedTree) {
    try {
      const finishedHead = git(repo.root, ["rev-parse", "HEAD"]);
      const finalTree = git(repo.root, ["rev-parse", `${finishedHead}^{tree}`]);
      if (finishedHead !== checkedHead && git(repo.root, ["rev-parse", `${finishedHead}^1`]) !== checkedHead) throw new HarnessError("마감 커밋의 부모가 검사한 HEAD와 다르다");
      assertTeamFinishInputs(repo.root, validatedTeamInputs, finishGit, finalTree);
      if (mainDirect) {
        if (finalTree !== capturedTree) throw new HarnessError("마감 커밋과 고정 Git tree가 다르다");
      } else checkedTeamTarget(projectRel, ref.id, finishedHead, finishGit);
    } catch { return { ok: false, issues: ["마감 커밋 중 입력/tree가 바뀌었다. 생성된 커밋을 보존했으니 변경을 확인하고 finish를 다시 실행한다"], notes }; }
  }
  notes.push(mainDirect ? "완료 (main 직접 프로젝트 — merge 필요 없음)" : `병합 대기 — main 체크아웃에서: pace project merge ${ref.id}`);
  return { ok: true, issues, notes };
  } catch (error) { if (restoreFinal) restoreAfterFailure(error, restoreFinal); throw error; }
  } catch (error) { if (restoreDirect) restoreAfterFailure(error, restoreDirect); throw error; }
}

export interface MergePlan {
  ref: ProjectRef;
  target: string;
  worktree: string | null;
  commits: string[];
  summary: string;
  teamTarget?: string;
}

const mergeRejectionSource = "merge:before-ff";
function mergeWorktreeReady(root: string, target: string, id: string, log: string): boolean {
  const status = gitSpawn(root, ["status", "--porcelain", "-z", "--untracked-files=all"]);
  if (status.status !== 0) return false;
  if (status.stdout === "") return true;
  const untracked = status.stdout === `?? ${log}\0`;
  if (!untracked && status.stdout !== ` M ${log}\0`) return false;
  try {
    if (untracked && git(root, ["--literal-pathspecs", "ls-tree", "-z", target, "--", log]) !== "") return false;
    const base = untracked ? "" : gitSpawn(root, ["show", `${target}:${log}`]);
    if (base !== "" && base.status !== 0) return false;
    const original = base === "" ? "" : base.stdout.replaceAll("\r\n", "\n");
    const data = utf8(regularBytes(safeTeamPath(root, log), LEDGER_LIMIT)).replaceAll("\r\n", "\n");
    if (!data.startsWith(original) || !data.endsWith("\n")) return false;
    const appended = data.slice(original.length);
    const rows = eventLines(appended);
    return rows.length > 0 && rows.length === appended.split("\n").length - 1 && rows.every((row) =>
      row.p === id && row.type === "merge" && row.by === "cli" && row.ok === false && row.src === mergeRejectionSource &&
      /^merge: (security|rebase|checks|contract|state|command)$/.test(row.msg) &&
      row.data && Object.keys(row.data).length === 0 && Object.keys(row).length === 8);
  } catch { return false; }
}

function planMergeRaw(repo: Repo, id: string): MergePlan {
  if (repo.inWorktree) throw new HarnessError(`merge는 main 체크아웃에서만 실행한다: ${repo.mainRoot}`);
  if (repo.branch !== repo.base) throw new HarnessError(`main 체크아웃이 ${repo.base} 브랜치가 아니다 (${repo.branch})`);
  const want = id.toUpperCase();
  const branch = `project/${want}`;
  if (!branchExists(repo, branch)) throw new HarnessError(`브랜치가 없다: ${branch}`);
  const target = git(repo.root, ["rev-parse", `${branch}^{commit}`]);
  const files = git(repo.root, ["ls-tree", "-r", "--name-only", target, "projects/"]).split("\n");
  const projectRel = files.find((f) => new RegExp(`^projects/${want}_[^/]+/PROJECT\\.md$`).test(f));
  if (projectRel === undefined) throw new HarnessError(`${branch}에 PROJECT.md가 없다`);
  const ref = refFor(repo, projectRel.split("/")[1]!);
  const state = readState(git(repo.root, ["show", `${target}:${projectRel}`]));
  if (state !== "병합 대기") throw new HarnessError(`${ref.id} 상태가 병합 대기가 아니다 (${state}) — worktree에서 pace project finish ${ref.id}`);
  const teamFinish = checkedTeamTarget(projectRel.replace(/\/PROJECT\.md$/, ""), ref.id, target, (args, env) => gitSpawn(repo.root, args, env));
  const teamTarget = teamFinish?.target;
  if (!isClean(repo.root)) throw new HarnessError("main 작업 트리에 커밋하지 않은 변경이 있다");
  if (!gitOk(repo.root, ["merge-base", "--is-ancestor", repo.base, target])) {
    throw new HarnessError(`fast-forward가 안 된다 — ${repo.base}가 앞서 갔다. worktree에서 pace project finish ${ref.id}를 다시 실행해 rebase한다`);
  }
  if (teamTarget) {
    const base = git(repo.root, ["rev-parse", "--verify", "HEAD"]);
    const privacyIssues = handoffCommitPrivacyIssues(repo.root, target, base);
    if (privacyIssues.length) throw new HarnessError(privacyIssues.join("\n"));
  }
  const commits = git(repo.root, ["log", "--format=%h %s", `${repo.base}..${target}`]).split("\n").filter(Boolean);
  const closeRel = projectRel.replace(/PROJECT\.md$/, "PROJECT-CLOSE.md");
  const close = git(repo.root, ["show", `${target}:${closeRel}`], true);
  let summary = ["## 기준 대조", "## 보안", "## 남은 일"]
    .map((h) => (sectionBody(close, h) ?? "").replace(/<!--[\s\S]*?-->/g, "").trim())
    .filter(Boolean)
    .join("\n\n");
  const worktree = worktreeOf(repo, branch);
  if (worktree !== null && !mergeWorktreeReady(worktree, target, ref.id, projectRel.replace(/PROJECT\.md$/, "log.jsonl"))) {
    throw new HarnessError(`worktree에 커밋하지 않은 변경이 있다: ${worktree} — 커밋하거나 치운 뒤 다시 실행한다`);
  }
  const declarations: string[] = [];
  for (const label of COMMAND_LABELS) {
    const base = committedCommand(repo, repo.base, label);
    const next = committedCommand(repo, target, label);
    if (base !== next) declarations.push(`${label}: ${base ?? "(선언 없음)"} → ${next ?? "(선언 없음)"}`);
  }
  if (declarations.length) summary += `\n\n환경 선언 변경 (병합 뒤 적용):\n${declarations.join("\n")}`;
  if (worktree !== null) {
    // --directory: 무시된 폴더는 한 줄(node_modules/), 낱개 파일(.env 등)은 이름으로 — 파일 수십만 개여도 출력이 작다
    const result = gitSpawn(worktree, ["ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "-z"]);
    if (result.status !== 0) throw new HarnessError(`worktree 무시 파일 목록을 확인하지 못했다: ${(result.error?.message ?? result.stderr).trim()}`);
    const ignored = result.stdout.split("\0").filter(Boolean);
    summary += `\n\nworktree 제거 때 함께 지워질 무시 항목: ${ignored.length}곳`;
    // 제어 문자가 든 이름만 이스케이프한다
    const shown = ignored.map((path) => `  ${/[\x00-\x1f\x7f]/.test(path) ? JSON.stringify(path) : path}`);
    if (shown.length) summary += `\n${shown.slice(0, 20).join("\n")}${shown.length > 20 ? `\n  … 나머지 ${shown.length - 20}곳` : ""}`;
  }
  if (teamFinish) {
    const checkLabels = { passed: "통과", "not-run": "미실행", unrecorded: "기록 없음" } as const;
    summary += `\n\n팀 finish 검증 대상: ${teamFinish.target}\n팀 전체 검사: ${checkLabels[teamFinish.checkStatus]}`;
  }
  return { ref, target, worktree, commits, summary, ...(teamTarget ? { teamTarget } : {}) };
}

function applyMergeRaw(repo: Repo, plan: MergePlan, markMerged: () => void): string[] {
  const current = planMergeRaw(repo, plan.ref.id);
  if (plan.target !== current.target || plan.worktree !== current.worktree ||
      ((plan.teamTarget || current.teamTarget) && (plan.teamTarget !== current.teamTarget || plan.summary !== current.summary))) {
    throw new HarnessError("병합 승인 대상이 바뀌었다: merge 계획을 다시 확인한다");
  }
  plan = current;
  const target = plan.target;
  const done: string[] = [];
  // The approved commit supplies both the project and its linked backlog.
  const projectPath = projectFile(repo, plan.ref);
  const projectRel = relativeGitPath(repo.root, projectPath);
  const project = git(repo.root, ["show", `${target}:${projectRel}`]);
  const sourceRoot = !plan.teamTarget && plan.worktree !== null ? plan.worktree : repo.root;
  const folder = linkedBacklogFolder(join(sourceRoot, dirname(projectRel)), project);
  let backlogChange: { path: string; text: string } | null = null;
  if (folder !== null) {
    if (dirname(folder) !== join(sourceRoot, "backlogs")) throw new HarnessError("백로그 출처가 backlogs/ 밖을 가리킨다");
    const rel = relativeGitPath(sourceRoot, join(folder, "BACKLOG.md"));
    const tree = gitSpawn(repo.root, ["ls-tree", "-z", target, "--", rel]);
    if (tree.status !== 0 || !/^100(?:644|755) blob [0-9a-f]+\t/.test(tree.stdout)) throw new HarnessError("병합할 BACKLOG.md가 일반 파일이 아니다");
    const blob = gitSpawn(repo.root, ["show", `${target}:${rel}`]);
    if (blob.status !== 0) throw new HarnessError("병합할 BACKLOG.md를 읽지 못했다");
    backlogChange = { path: join(repo.root, rel), text: updatedBacklogState(blob.stdout, "완료") };
  }
  git(repo.root, ["merge", "--ff-only", target]);
  markMerged();
  const ownedMerge = [relative(repo.root, projectPath), relative(repo.root, join(dirname(projectPath), "METRICS.md")), "projects/METRICS.md", relative(repo.root, join(dirname(projectPath), "log.jsonl")), ...(backlogChange ? [relative(repo.root, backlogChange.path)] : []), ...(existsSync(join(repo.root, "backlogs/dashboard/data.js")) ? ["backlogs/dashboard/data.js"] : [])];
  const restoreMerge = snapshotOwned(repo.root, ownedMerge);
  try {
  if (plan.teamTarget && (!cleanTeamWorktree(repo.root) || git(repo.root, ["rev-parse", "HEAD"]) !== target)) {
    throw new HarnessError("팀 병합 반영 뒤 훅 또는 동시 작업이 Git 상태를 바꿨다: 변경을 확인하고 상태 기록을 재시도한다");
  }
  writeBacklogState(repo, backlogChange);
  done.push(`${repo.base} ← ${plan.ref.branch} (fast-forward, 커밋 ${plan.commits.length}개)`);
  writeFileAtomic(projectPath, setState(readFileSync(projectPath, "utf8"), "완료"));
  git(repo.root, ["add", "--", relative(repo.root, projectPath)]);
  const mergedEvent = emitMetric(repo, plan.ref.id, "merge", true, undefined, undefined, { msg: "merge: 사용자 승인", data: { approved: 1, commits: plan.commits.length } }, true, !!plan.teamTarget);
  if (plan.teamTarget && !mergedEvent) throw new HarnessError("팀 병합 성공 사건을 기록하지 못했다");
  refreshProjectMetrics(repo, plan.ref);
  git(repo.root, ["add", "--", join(dirname(projectPath), "METRICS.md"), join(repo.root,"projects","METRICS.md")]);
  git(repo.root, ["add", "--", join(dirname(projectPath), "log.jsonl")], !plan.teamTarget);
  stageDashboard(repo.root);
  const mergeMessage = `chore(${plan.ref.id}): 병합 완료`;
  if (plan.teamTarget) {
    const mergeGit = (args: string[], env?: Record<string, string>) => gitSpawn(repo.root, args, env);
    const tree = git(repo.root, ["write-tree"]);
    assertTeamFinishScope(mergeGit, target, tree, ownedMerge.map((path) => path.split(sep).join("/")));
    commitTeamFinish(mergeGit, tree, target, mergeMessage);
  } else git(repo.root, ["commit", "-m", mergeMessage]);
  } catch (error) {
    try { restoreAfterFailure(error, restoreMerge); } catch (restoredError) { error = restoredError; }
    const logPath = join(plan.worktree ?? repo.root, relative(repo.root, join(dirname(projectPath), "log.jsonl")));
    const recovery = plan.worktree
      ? `실패 로그 ${logPath}를 확인한 뒤 ${plan.worktree}에서 pace project finish ${plan.ref.id}, main에서 pace project merge ${plan.ref.id}를 실행한다`
      : `main의 실패 로그 ${logPath}만 확인해 커밋하고 pace project start ${plan.ref.id} --no-launch로 worktree를 복구한 뒤 그곳에서 pace project finish ${plan.ref.id}, main에서 pace project merge ${plan.ref.id}를 실행한다. 병합 대기 상태는 유지되며 start와 착수 결정 사건이 다시 기록된다`;
    const teamRecovery = plan.teamTarget ? `\n팀 병합 재시도는 미리보기의 새 전체 SHA를 확인한 뒤 --yes --commit <새 SHA>를 사용한다. 로그 rebase 충돌이 나면 중단하고 양쪽 기록을 보존한 복구 결정을 받은 뒤 finish를 재시도한다` : "";
    throw new MergeBookkeepingError(`fast-forward는 완료됐으나 상태 기록에 실패했다: ${error instanceof Error ? error.message : String(error)}\n${recovery}${teamRecovery}`, failureReason(error instanceof Error ? error.message : ""));
  }
  done.push("상태 완료 기록");
  if (git(repo.root, ["rev-parse", plan.ref.branch], true) !== target || plan.worktree !== null && (!isClean(plan.worktree) || git(plan.worktree, ["rev-parse", "HEAD"], true) !== target)) {
    done.push("병합 뒤 브랜치/worktree 변경 감지: 제거하지 않고 보존했다");
    return done;
  }
  if (plan.worktree !== null) {
    git(repo.root, [...(process.platform === "win32" ? ["-c", "core.longpaths=true"] : []), "worktree", "remove", plan.worktree]);
    done.push(`worktree 제거: ${plan.worktree}`);
  }
  git(repo.root, ["branch", "-d", plan.ref.branch]);
  done.push(`브랜치 삭제: ${plan.ref.branch}`);
  return done;
}

export interface ProjectSummary {
  id: string;
  name: string;
  state: string;
  task: string | null;
  worktree: string | null;
}

/** 브랜치 → worktree 경로를 한 번에. */
function worktreeMap(repo: Repo, strict = false): Map<string, string> {
  const map = new Map<string, string>();
  let path: string | null = null;
  for (const line of git(repo.mainRoot, ["worktree", "list", "--porcelain"], !strict).split("\n")) {
    if (line.startsWith("worktree ")) path = line.slice(9);
    if (line.startsWith("branch refs/heads/") && path !== null) map.set(line.slice(18), path);
  }
  return map;
}

/** 브랜치에 파일이 없는 정상 사례는 main으로 대체하되 Git 실패는 숨기지 않는다. */
function projectBranchText(repo: Repo, ref: ProjectRef, rel: string, strict: boolean): string {
  const result = gitSpawn(repo.mainRoot, ["show", `${ref.branch}:${rel}`], { LC_ALL: "C" });
  if (result.status === 0) return result.stdout.trim();
  if (!strict || (!result.error && /(?:does not exist in|exists on disk, but not in)/.test(result.stderr))) return "";
  throw new HarnessError("프로젝트 브랜치 상태를 확인할 수 없다");
}

/**
 * 진행 중인 프로젝트는 worktree 작업본, 없으면 브랜치의 PROJECT.md를 읽는다(main에는 정의만 있다).
 * active: 부트용 — main에서 이미 `완료`인 프로젝트는 git을 부르지 않고 건너뛰고, 깨진 폴더는 그것만 건너뛴다.
 */
export function listProjects(repo: Repo, options: { active?: boolean; strictGit?: boolean } = {}): ProjectSummary[] {
  const out: ProjectSummary[] = [];
  const dirs = localProjectDirs(repo.mainRoot);
  if (dirs.length === 0) return out;
  const worktrees = worktreeMap(repo, options.strictGit);
  const branches = new Set(git(repo.mainRoot, ["for-each-ref", "--format=%(refname:short)", "refs/heads/project/"], !options.strictGit).split("\n").filter(Boolean));
  for (const dirName of dirs) {
    try {
      const ref = refFor(repo, dirName);
      const rel = `projects/${dirName}/PROJECT.md`;
      const mainText = () => readFileSync(join(repo.mainRoot, rel), "utf8");
      if (options.active && readState(mainText()) === "완료") continue;
      const worktree = worktrees.get(ref.branch) ?? null;
      const text =
        worktree && existsSync(join(worktree, rel))
          ? readFileSync(join(worktree, rel), "utf8")
          : branches.has(ref.branch)
            ? projectBranchText(repo, ref, rel, options.strictGit ?? false) || mainText()
            : mainText();
      const running = taskRows(text).find((r) => r[3] === "진행");
      out.push({ id: ref.id, name: ref.name, state: readState(text), task: running ? `${running[0]} ${running[1]}` : null, worktree });
    } catch (error) {
      if (!options.active || options.strictGit && error instanceof HarnessError) throw error;
    }
  }
  return out;
}

/** 프로젝트 하네스가 소유한 현재 개발 worktree이면 등록 원본의 경로를 돌려준다. */
export function projectWorktreeMainRoot(cwd: string): string | null {
  // 부트의 총 지연을 줄이기 위해 git 정보는 한 번에 읽는다.
  const parts = git(cwd, ["rev-parse", "--path-format=absolute", "--show-toplevel", "--git-dir", "--git-common-dir", "--abbrev-ref", "HEAD"], true).split("\n");
  if (parts.length !== 4) return null;
  const [root, gitDir, commonDir, branch] = parts as [string, string, string, string];
  if (resolve(gitDir) === resolve(commonDir) || !/^project\/P\d{3}$/.test(branch) || realpathSync.native(cwd) !== realpathSync.native(root)) return null;
  const mainRoot = dirname(commonDir);
  const id = branch.slice("project/".length);
  const dirs = localProjectDirs(mainRoot).filter((dir) => dir.startsWith(`${id}_`));
  if (dirs.length !== 1) return null;
  const rel = join("projects", dirs[0]!, "PROJECT.md");
  if (!existsSync(join(root, rel)) || readState(readFileSync(join(mainRoot, rel), "utf8")) === "완료") return null;
  if (!["진행", "병합 대기"].includes(readState(readFileSync(join(root, rel), "utf8")))) return null;
  const repo: Repo = { root, mainRoot, inWorktree: true, branch, base: "main" };
  const actual = worktreeOf(repo, branch);
  return actual && realpathSync.native(actual) === realpathSync.native(root) ? mainRoot : null;
}

export function formatList(items: ProjectSummary[]): string {
  if (items.length === 0) return "프로젝트 없음";
  return items
    .map((p) => `${p.id} ${p.name} · ${p.state}${p.task ? ` · ${p.task} 진행` : ""}${p.worktree ? ` · ${p.worktree}` : ""}`)
    .join("\n");
}

export function formatReport(report: Report): string {
  const lines = [...report.notes.map((n) => `- ${n}`)];
  if (report.issues.length > 0) lines.push("빠진 것:", ...report.issues.map((i) => `- ${i}`));
  lines.push(report.ok ? "통과" : "실패");
  return lines.join("\n");
}

// Public boundaries record one event; internal validation is not a separate command.
function emitMetric(repo: Repo, id: string, cmd: import("./metrics.ts").MetricCommand, ok: boolean, task?: string, reason?: string, details: Pick<import("./metrics.ts").MetricEvent, "msg" | "src" | "ref" | "data" | "role"> = {}, mergeApplied = false, required = false): boolean {
  try {
    const ref = findProject(repo, id);
    const worktree = !repo.inWorktree && (cmd !== "merge" || !ok) ? worktreeOf(repo, ref.branch) : null;
    // A rejected merge without an owning worktree must not dirty main and block its retry.
    if (cmd === "merge" && !ok && !repo.inWorktree && worktree === null && !mergeApplied) return false;
    const target = worktree ? { ...repo, root: worktree } : repo;
    return recordMetric(metricDir(target, ref), { ts: new Date().toISOString(), project: ref.id, cmd, ok, task: task?.toUpperCase(), reason, ...details,
      ...(cmd === "merge" && !ok && !mergeApplied ? { src: mergeRejectionSource } : {}) }, required);
  } catch { return false; /* Unknown projects have no safe destination. */ }
}
function observed<T>(repo: Repo, id: string, cmd: import("./metrics.ts").MetricCommand, task: string | undefined, fn: () => T, committed = false, mergeApplied: () => boolean = () => false, metricSource: () => string | undefined = () => undefined, record: () => boolean = () => true): T {
  try {
    const result = fn();
    const report = result as { ok?: boolean; issues?: string[]; taskId?: string; ref?: ProjectRef; created?: boolean; choice?: AgentChoice; launch?: LaunchResult | null; roleChoice?: WorkerRole };
    const ok = report.ok !== false;
    if (record() && (!committed || !ok)) {
      const target = cmd === "start" && report.ref ? { ...repo, root: report.ref.worktree } : repo;
      const details = cmd === "start" && ok ? { msg: `start: ${report.choice?.agent ?? "resume"} · launch ${report.launch?.status ?? "existing"}`, ...(report.choice ? { src: report.choice.source } : {}), ...(report.roleChoice ? { data: { teamMetricsVersion: 1 }, role: startRoleRecord(report.roleChoice, report.launch?.status === "launched" ? "arguments" : report.launch?.status === "unknown" ? "unconfirmed" : report.launch?.status === "failed" ? "rejected" : "planned") } : {}) } : {};
      emitMetric(target, id, cmd, ok, report.taskId ?? task, ok ? undefined : failureReason(report.issues?.join(" ") ?? ""), { ...details, ...(metricSource() ? { src: metricSource() } : {}) });
      if (cmd === "start" && ok && report.created && report.ref) {
        const dir = metricDir(target, report.ref);
        try {
        const contract = stripComments(readFileSync(join(dir, "PROJECT.md"), "utf8"));
        const source = /^- 출처:[ \t]*(.*)$/m.exec(contract)?.[1]?.trim();
        recordEvent(dir, { ts: new Date().toISOString(), p: report.ref.id, type: "decision", by: "cli", msg: "착수 결정 — 출처에 따라 바로 수행", src: source ? source.slice(0, 60) : "출처 미기재", ref: "PROJECT.md" });
        } catch { process.stderr.write("pace: 경고: 착수 로그 기록 실패 (명령은 계속)\n"); }
      }
    }
    return result;
  } catch (error) {
    if (record()) emitMetric(repo, id, cmd, false, task, error instanceof MergeBookkeepingError ? error.metricReason : failureReason(error instanceof Error ? error.message : ""), metricSource() ? { src: metricSource() } : {}, mergeApplied());
    throw error;
  }
}
export function startProject(repo: Repo, id: string, options: StartOptions = {}): ReturnType<typeof startProjectRaw> {
  const result = observed(repo, id, "start", undefined, () => startProjectRaw(repo, id, options));
  if (result.created) refreshDashboard(result.ref.worktree);
  return result;
}
export function addTask(repo: Repo, id: string, name: string): ReturnType<typeof addTaskRaw> {
  const result = observed(repo, id, "task", undefined, () => addTaskRaw(repo, id, name));
  refreshDashboard(repo.root);
  return result;
}
export function checkTask(repo: Repo, id: string, taskId: string): Report {
  if (process.env.PACE_COMMIT_CHECK === "1") return checkTaskRaw(repo, id, taskId);
  return observed(repo, id, "check", taskId, () => checkTaskRaw(repo, id, taskId));
}
export function doneTask(repo: Repo, id: string, taskId: string): Report {
  const result = observed(repo, id, "done", taskId, () => doneTaskRaw(repo, id, taskId));
  if (result.ok) refreshDashboard(repo.root);
  return result;
}
export function finishProject(repo: Repo, id: string): Report {
  const attempt: { source?: string; preserveLog?: boolean } = {};
  return observed(repo, id, "finish", undefined, () => finishProjectRaw(repo, id, attempt), true, () => false, () => attempt.source, () => !attempt.preserveLog);
}
export function applyMerge(repo: Repo, plan: MergePlan): string[] {
  let merged = false;
  return observed(repo, plan.ref.id, "merge", undefined, () => applyMergeRaw(repo, plan, () => { merged = true; }), true, () => merged);
}

export function planMerge(repo: Repo, id: string, recordFailure = false): MergePlan {
  try { return planMergeRaw(repo, id); }
  catch (error) {
    if (recordFailure) emitMetric(repo, id, "merge", false, undefined, failureReason(error instanceof Error ? error.message : ""));
    throw error;
  }
}
/** Resolve the owning checkout for read-only stats from the main coordinator. */
export function statsRepo(repo: Repo, ref: ProjectRef): Repo {
  const worktree = worktreeOf(repo, ref.branch);
  return worktree ? { ...repo, root: worktree } : repo;
}
