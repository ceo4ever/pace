import { chmodSync, closeSync, existsSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileAtomic } from "../core/fsutil.ts";
import { getString, parseFrontmatter } from "../core/frontmatter.ts";
import { AGENT_BUDGET, agentKind, validateAgentDefinition } from "./agent-definition.ts";
import { listCandidates, registerWorkspace } from "./workspace-registry.ts";
import { COMMIT_HOOK, COMMIT_HOOK_MARKER, commitHookPath } from "./harness.ts";
import { SHARED_MARKER, renderDashboardEntry } from "./dashboard-layout.ts";
import { rebuildMemoryIndex } from "../memory/memory.ts";

/** OPAL(v2) 프로젝트 정의(`.opal/`)를 PACE(`.pace/`)로 가져오는 계획·적용. 홈 프로필·훅·대시보드는 다루지 않는다. */

export interface AdoptPlan {
  root: string;
  /** ready: 옮길 것이 있음 · done: 이미 .pace가 유효해 등록만 확인 */
  state: "ready" | "done";
  blockers: string[];
  warnings: string[];
  moves: string[];
  workspaceId: string;
  /** done 상태에서 등록부에 아직 없을 때만 true */
  needsRegister: boolean;
  /** AGENT 원문·등록부 상태의 해시 — 미리보기와 적용 사이에 바뀌면 멈춘다 */
  fingerprint: string;
  /** 바꿀 OPAL 커밋 게이트 훅 경로(없으면 null) */
  hook: string | null;
  /** OPAL 공용 대시보드 진입점을 PACE 공용 참조로 바꿀지 */
  dashboard: boolean;
  /** AGENTS.md·CLAUDE.md·docs의 opal 명령·opal-* 스킬 참조(file:줄) — 자동으로 바꾸지 않는다 */
  references: string[];
  /** 검색하지 못한 파일(링크·너무 큼·읽기 실패) — 보고가 완전하지 않다는 뜻 */
  referencesSkipped: string[];
  /** .opal 옆에 PACE 메모리 명령이 먼저 만든 .pace/memory — .opal 쪽으로 합친 뒤 옮긴다 */
  recover: Recovery[];
}

/** move: .opal에 없는 파일 · replace: .pace 쪽이 최신인 진행 상황 · drop: 목차·같은 내용·오래된 진행 상황 */
export interface Recovery { file: string; action: "move" | "replace" | "drop"; reason: string }

interface Deps {
  register?: typeof registerWorkspace;
  /** 시험용: AGENT 재작성 단계 교체 */
  rewriteAgent?: (path: string, text: string) => void;
  /** 시험용: git mv 단계 교체 */
  move?: (root: string) => { ok: boolean; out: string };
  /** 시험용: 훅 쓰기 단계 교체 */
  writeHook?: (path: string, text: string) => void;
  /** 시험용: 대시보드 진입점 쓰기 단계 교체 */
  writeEntry?: (path: string, text: string) => void;
  /** 시험용: 회수 뒤 메모리 목차 다시 만들기 단계 교체 */
  rebuildIndex?: (dir: string) => void;
}

function git(root: string, args: string[]): { ok: boolean; out: string } {
  const r = spawnSync("git", ["--no-optional-locks", "-C", root, ...args], { encoding: "utf8", timeout: 30_000 });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

function info(path: string) {
  try { return lstatSync(path); } catch { return null; }
}

/** 링크가 하나라도 있으면 알려 준다(저장소 밖으로 새는 것을 막는다). */
function findLink(dir: string): string | null {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) return path;
    if (entry.isDirectory()) {
      const found = findLink(path);
      if (found) return found;
    }
  }
  return null;
}

/** AGENT 본문을 PACE 형식으로 — 표지 키와 `.opal/` 경로만 바꾼다. */
export function convertAgent(text: string): string {
  const header = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!header) throw new Error("AGENT frontmatter가 필요하다");
  const start = header[0].length;
  const front = header[0].replace(/^opal_agent_version(\s*:)/m, "pace_agent_version$1");
  return front + text.slice(start).replace(/\.opal\//g, ".pace/");
}

export function planAdoptOpal(rootInput: string, home: string): AdoptPlan {
  const root = resolve(rootInput);
  const blockers: string[] = [];
  const warnings: string[] = [];
  const plan: AdoptPlan = { root, state: "ready", blockers, warnings, moves: [], workspaceId: "", needsRegister: false, fingerprint: "", hook: null, dashboard: false, references: [], referencesSkipped: [], recover: [] };
  const stop = (reason: string): AdoptPlan => { blockers.push(reason); return plan; };

  const top = git(root, ["rev-parse", "--show-toplevel"]);
  if (!top.ok) return stop("git 저장소가 아니다 — 이동을 git mv로 하려면 저장소 루트에서 실행한다");
  let real: string;
  try { real = realpathSync.native(root); } catch { return stop("경로를 확인할 수 없다"); }
  if (realpathSync.native(top.out) !== real) return stop(`저장소 루트에서 실행한다: ${top.out}`);
  plan.root = real;

  const opal = join(real, ".opal"), pace = join(real, ".pace");
  const opalInfo = info(opal), paceInfo = info(pace);

  if (opalInfo === null) {
    if (paceInfo === null) return stop("가져올 OPAL 정의(.opal/)가 없다");
    if (agentKind(real) !== "v2") return stop(".pace/AGENT.md가 PACE v2 형식이 아니라 건드리지 않는다");
    plan.state = "done";
    const doneText = readFileSync(join(pace, "AGENT.md"), "utf8");
    plan.workspaceId = getString(parseFrontmatter(doneText).data, "workspace_id");
    return checkRegistry(plan, home, real, doneText);
  }
  if (!opalInfo.isDirectory() || opalInfo.isSymbolicLink()) return stop(".opal이 실제 디렉터리가 아니다");
  if (info(join(opal, "MEMORY.json")) !== null) return stop("OPAL v1 형식(MEMORY.json)이다 — 자동 이전을 지원하지 않는다");
  const link = findLink(opal);
  if (link) return stop(`.opal 안에 링크가 있어 옮기지 않는다: ${link}`);
  if (paceInfo !== null) {
    const recovered = planRecovery(real);
    if (typeof recovered === "string") return stop(recovered);
    plan.recover = recovered;
  }

  const agentPath = join(opal, "AGENT.md");
  let text: string;
  const agentInfo = lstatSync(agentPath, { throwIfNoEntry: false });
  if (agentInfo === undefined || !agentInfo.isFile() || agentInfo.isSymbolicLink() || agentInfo.size > 64 * 1024) return stop(".opal/AGENT.md가 일반 파일이 아니거나 너무 크다(64KB 초과)");
  try { text = readFileSync(agentPath, "utf8"); } catch { return stop(".opal/AGENT.md를 읽을 수 없다"); }
  const versions = text.match(/^[ \t]*opal_agent_version[ \t]*:/gm) ?? [];
  if (versions.length !== 1 || getString(parseFrontmatter(text).data, "opal_agent_version") !== "2") {
    return stop(".opal/AGENT.md가 OPAL v2 형식이 아니다(opal_agent_version: 2 필요)");
  }
  try {
    plan.workspaceId = validateAgentDefinition(convertAgent(text), AGENT_BUDGET).workspaceId;
  } catch (error) {
    return stop(`AGENT 정의를 PACE 형식으로 바꿀 수 없다: ${error instanceof Error ? error.message : "검증 실패"}`);
  }

  const dirty = git(real, ["status", "--porcelain", "--untracked-files=all", "--", ".opal"]);
  if (!dirty.ok) return stop("git 상태를 확인할 수 없다");
  if (dirty.out) return stop(`.opal에 커밋 안 한 변경이 있다 — 커밋하거나 되돌린 뒤 다시 실행한다:\n${dirty.out}`);
  const flagged = git(real, ["ls-files", "-v", "--", ".opal"]);
  if (!flagged.ok) return stop("git ls-files를 실행하지 못해 .opal의 상태를 확인할 수 없다");
  const hidden = flagged.out.split("\n").filter((l) => /^[a-zS] /.test(l));
  if (hidden.length) return stop(`.opal 안에 git이 변경을 숨기는 파일(assume-unchanged·skip-worktree)이 있어 미커밋 변경을 확인할 수 없다 — 플래그를 풀고 다시 실행한다:\n${hidden.join("\n")}`);
  const tracked = git(real, ["ls-files", "--", ".opal"]);
  if (!tracked.ok) return stop("git ls-files를 실행하지 못해 .opal의 상태를 확인할 수 없다");
  if (tracked.out === "") return stop(".opal 안에 git이 추적하는 파일이 없다(.gitignore 제외?) — git mv로 이력을 옮길 수 없다");
  if (git(real, ["check-ignore", "-q", ".pace/AGENT.md"]).ok) warnings.push(".pace/AGENT.md가 .gitignore에 걸린다 — `.opal/` 제외를 `.pace/`로 바꾸지 말고 .pace/*·!.pace/AGENT.md 예외로 정리한다");

  const ignored = git(real, ["ls-files", "--others", "--ignored", "--exclude-standard", "--", ".opal"]).out;
  if (ignored) warnings.push(`.gitignore에 걸린 파일 ${ignored.split("\n").length}개도 함께 .pace로 옮겨진다 — .gitignore에 .pace 대응 항목을 추가해야 커밋에 섞이지 않는다`);
  if (plan.recover.length) {
    const label = { move: "합침", replace: "최신으로 교체", drop: "버림" } as const;
    plan.moves.push(`.pace/memory 회수 → .opal/memory에 먼저 합친다: ${plan.recover.map((r) => `${r.file} ${label[r.action]}(${r.reason})`).join(" · ")}`);
  }
  plan.moves.push(".opal → .pace (git mv)", ".pace/AGENT.md: opal_agent_version → pace_agent_version, 본문 .opal/ → .pace/");
  if (plan.recover.length) plan.moves.push(".pace/memory/INDEX.md: 파일 목록에서 다시 만든다");
  return checkRegistry(plan, home, real, text);
}

const commitTime = (root: string, rel: string): number => Number(git(root, ["log", "-1", "--format=%ct", "--", rel]).out) || 0;

/**
 * .opal이 정본인데 PACE 메모리 명령이 .pace/memory를 먼저 만든 경우만 회수한다.
 * .pace에 memory 밖의 항목이 있거나, 같은 이름의 다른 메모리(진행 상황 제외)가 양쪽에 있으면 정본을 정할 수 없어 멈춘다.
 */
function planRecovery(root: string): Recovery[] | string {
  const pace = join(root, ".pace"), memory = join(pace, "memory");
  const paceInfo = info(pace);
  if (!paceInfo?.isDirectory() || paceInfo.isSymbolicLink()) return ".pace가 실제 디렉터리가 아니다";
  const others = readdirSync(pace).filter((name) => name !== "memory");
  if (others.length) return `.pace/가 이미 있다 — 메모리 밖의 항목(${others.join(", ")})이 있어 .opal/과 섞지 않고 멈춘다(어느 쪽이 정본인지 직접 확인)`;
  const memoryInfo = info(memory);
  if (!memoryInfo?.isDirectory() || memoryInfo.isSymbolicLink()) return ".pace/memory가 실제 디렉터리가 아니다";
  const entries = readdirSync(memory, { withFileTypes: true });
  const odd = entries.filter((e) => !e.isFile() || !e.name.endsWith(".md"));
  if (odd.length) return `.pace/memory에 메모리 파일이 아닌 항목이 있다: ${odd.map((e) => e.name).join(", ")}`;
  const dirty = git(root, ["status", "--porcelain", "--untracked-files=all", "--", ".pace"]);
  if (!dirty.ok) return "git 상태를 확인할 수 없다";
  if (dirty.out) return `.pace에 커밋 안 한 변경이 있다 — 커밋하거나 되돌린 뒤 다시 실행한다:\n${dirty.out}`;
  const flagged = git(root, ["ls-files", "-v", "--", ".pace"]);
  if (!flagged.ok) return "git ls-files를 실행하지 못해 .pace의 상태를 확인할 수 없다";
  if (flagged.out.split("\n").some((l) => /^[a-zS] /.test(l))) return ".pace 안에 git이 변경을 숨기는 파일(assume-unchanged·skip-worktree)이 있다 — 플래그를 풀고 다시 실행한다";
  const listed = git(root, ["-c", "core.quotepath=false", "ls-files", "--", ".pace/memory"]);
  if (!listed.ok) return "git ls-files를 실행하지 못해 .pace의 상태를 확인할 수 없다";
  const tracked = new Set(listed.out.split("\n").filter(Boolean));
  const untracked = entries.filter((e) => !tracked.has(`.pace/memory/${e.name}`));
  if (untracked.length) return `.pace/memory에 git이 추적하지 않는 파일이 있다(.gitignore?): ${untracked.map((e) => e.name).join(", ")}`;
  const result: Recovery[] = [];
  for (const { name } of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
    if (name === "INDEX.md") { result.push({ file: name, action: "drop", reason: "목차 — 다시 만든다" }); continue; }
    const target = join(root, ".opal", "memory", name);
    const targetInfo = info(target);
    if (targetInfo === null) { result.push({ file: name, action: "move", reason: ".opal에 없음" }); continue; }
    if (!targetInfo.isFile() || targetInfo.isSymbolicLink()) return `.opal/memory/${name}이 일반 파일이 아니다`;
    if (readFileSync(target).equals(readFileSync(join(memory, name)))) { result.push({ file: name, action: "drop", reason: "같은 내용" }); continue; }
    if (name !== "status.md") return `같은 이름의 다른 메모리가 .opal과 .pace에 모두 있다: memory/${name} — 직접 합친 뒤 다시 실행한다`;
    const paceNewer = commitTime(root, `.pace/memory/${name}`) >= commitTime(root, `.opal/memory/${name}`);
    result.push(paceNewer ? { file: name, action: "replace", reason: ".pace 쪽 커밋이 최신" } : { file: name, action: "drop", reason: ".opal 쪽 커밋이 최신" });
  }
  return result;
}


const OPAL_HOOK = [
  "#!/bin/sh",
  "# OPAL commit gate v1",
  'branch=$(git symbolic-ref --quiet --short HEAD) || exit 0',
  'case "$branch" in project/P[0-9][0-9][0-9]) ;; *) exit 0 ;; esac',
  "tags=$(git stripspace --strip-comments < \"$1\" | grep -oE '\\(P[0-9]{3}/T[0-9]{2}\\)' | sort -u | tr -d '()')",
  '[ -n "$tags" ] || exit 0',
  "if ! command -v opal >/dev/null 2>&1; then",
  "  echo 'opal: 경고: opal을 찾지 못해 커밋 태스크 검사를 건너뜀' >&2",
  "  exit 0",
  "fi",
  'for tag in $tags; do',
  '  project=$(printf "%s" "$tag" | cut -d/ -f1)',
  '  task=$(printf "%s" "$tag" | cut -d/ -f2)',
  '  OPAL_COMMIT_CHECK=1 opal project check "$project" "$task" || exit 1',
  "done",
  "",
].join("\n");
const OPAL_DASHBOARD_MARKER = "<!-- opal:backlog-shared:1 -->";
const OPAL_DASHBOARD_TEXT = "OPAL 공통 대시보드를 불러오는 중입니다. 화면이 열리지 않으면 OPAL 설치를 확인하고 이 프로젝트에서 opi를 실행하세요.";
const PACE_DASHBOARD_TEXT = "PACE 공통 대시보드를 불러오는 중입니다. 화면이 열리지 않으면 PACE 설치를 확인하고 이 프로젝트에서 pace-project-init을 실행하세요.";
const lf = (text: string) => text.replace(/\r\n/g, "\n");
const RESOURCE_URL = /file:([^"\r\n]*?)\/src\/dashboard\/backlog\/(style\.css|core\.js|app\.js)/g;
/** 설치 위치만 다를 수 있다 — 세 리소스가 같은 기반 경로 아래 알려진 구조(src/dashboard/backlog/)일 때만 정규화하고, 그 밖의 참조는 그대로 둬 원문과 달라지게 한다. */
function normalizeUrls(html: string): string {
  const text = lf(html);
  if (text.includes("@@res:")) return "\u0000" + text; // 정규화 표지를 직접 쓴 입력은 어떤 원문과도 같지 않게 한다
  const bases = new Set([...text.matchAll(RESOURCE_URL)].map((m) => m[1]));
  if (bases.size !== 1) return text;
  return text.replace(RESOURCE_URL, "@@res:$2");
}

/** root 아래 상대 경로의 모든 구성 요소가 링크가 아닌 실제 항목이면 true. */
function noLinkInPath(root: string, rel: string): boolean {
  let current = root;
  for (const part of rel.split("/")) {
    current = join(current, part);
    const info = lstatSync(current, { throwIfNoEntry: false });
    if (info === undefined) return true;
    if (info.isSymbolicLink()) return false;
  }
  return true;
}

/** 읽을 수 있는 일반 파일만 — 경로 중간 링크·링크 파일·디렉터리·너무 큰 파일은 null. */
function readSmall(root: string, rel: string, limit = 512 * 1024): string | null {
  try {
    if (!noLinkInPath(root, rel)) return null;
    const path = join(root, rel);
    const info = lstatSync(path);
    if (!info.isFile() || info.size > limit) return null;
    return readFileSync(path, "utf8");
  } catch { return null; }
}

/** 커밋 게이트 훅·대시보드 진입점·지침 참조를 계획에 더한다(읽기 전용). */
function planExtras(plan: AdoptPlan, root: string): void {
  const hashes: string[] = [];
  // 1) 커밋 게이트 훅 — 알려진 OPAL v1 원문과 같을 때만 바꾼다
  try {
    const path = commitHookPath(root);
    const text = existsSync(path) ? readFileSync(path, "utf8") : null;
    hashes.push(text ?? "");
    if (text !== null && text.startsWith(COMMIT_HOOK_MARKER)) {
      plan.warnings.push("commit-msg 훅이 이미 PACE 커밋 게이트라 그대로 둔다");
    } else if (text !== null) {
      if (lf(text) === OPAL_HOOK) {
        plan.hook = path;
        plan.moves.push("commit-msg 훅: OPAL 게이트 → PACE 게이트 (원본은 commit-msg.opal-backup)");
      } else if (/opal/i.test(text)) {
        plan.warnings.push("commit-msg 훅이 OPAL 게이트처럼 보이지만 원문과 달라 보존했다 — PACE 커밋 게이트는 설치되지 않았다. OPAL을 제거하면 이 훅은 opal 명령을 못 찾아 검사 없이 통과하므로, OPAL 제거 전에 훅을 직접 정리하거나 pace project check 호출을 합친다");
      } else {
        plan.warnings.push("기존 commit-msg 훅(OPAL 게이트 아님)을 보존했다 — PACE 커밋 게이트는 설치되지 않는다. 필요하면 pace project check 호출을 직접 합친다");
      }
    }
  } catch (error) {
    plan.warnings.push("커밋 게이트 훅을 확인하지 못했다: " + (error instanceof Error ? error.message : "오류"));
  }
  // 2) 대시보드 진입점 — OPAL이 만든 공용 진입점(원문 일치)만 PACE 공용 참조로
  const entry = readSmall(root, "backlogs/README.html");
  hashes.push(entry ?? "");
  if (entry !== null && entry.startsWith(OPAL_DASHBOARD_MARKER)) {
    try {
      const asOpal = renderDashboardEntry().replace(SHARED_MARKER, OPAL_DASHBOARD_MARKER);
      const legacy = asOpal.replace(PACE_DASHBOARD_TEXT, OPAL_DASHBOARD_TEXT);
      const current = normalizeUrls(entry);
      if (current === normalizeUrls(asOpal) || current === normalizeUrls(legacy)) {
        plan.dashboard = true;
        plan.moves.push("backlogs/README.html: OPAL 공용 진입점 → PACE 공용 참조 (data.js 등 다른 파일은 그대로 — 화면 자료는 pace backlog refresh로 갱신)");
      } else {
        plan.warnings.push("backlogs/README.html이 OPAL 진입점에서 수정된 것 같아 보존했다 — pace backlog init으로 직접 전환한다");
      }
    } catch (error) {
      plan.warnings.push("PACE 대시보드 진입점을 만들 수 없어 건너뛴다: " + (error instanceof Error ? error.message : "오류"));
    }
  }
  // 3) 지침·문서의 opal 명령·opal-* 스킬 참조 — 보고만
  ({ found: plan.references, skipped: plan.referencesSkipped } = findOpalReferences(root));
  plan.fingerprint = createHash("sha256").update(plan.fingerprint).update("|").update(hashes.join("|")).digest("hex");
}

const REFERENCE_SIZE_LIMIT = 5 * 1024 * 1024;
const COMMAND_REF = /(?<![\w.\/-])opal(?![\w])|(?<![\w])opal-[a-z]/;

/** 보고 범위를 조용히 줄이지 않는다 — 읽지 못한 파일은 skipped로 돌려 사용자에게 알린다. */
function findOpalReferences(root: string): { found: string[]; skipped: string[] } {
  const files: string[] = [];
  const skipped: string[] = [];
  const consider = (rel: string) => {
    let info;
    try { info = lstatSync(join(root, rel), { throwIfNoEntry: false }); } catch { skipped.push(rel + " (상태를 확인하지 못함)"); return; }
    if (info === undefined) return;
    if (info.isSymbolicLink()) skipped.push(rel + " (링크)");
    else if (!info.isFile()) skipped.push(rel + " (일반 파일이 아님)");
    else if (info.size > REFERENCE_SIZE_LIMIT) skipped.push(rel + " (5MB 초과)");
    else files.push(rel);
  };
  for (const name of ["AGENTS.md", "CLAUDE.md"]) consider(name);
  const walk = (dir: string) => {
    let entries;
    try { entries = readdirSync(join(root, dir), { withFileTypes: true }); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") skipped.push(dir + " (폴더를 읽지 못함)");
      return;
    }
    for (const e of entries) {
      const rel = dir + "/" + e.name;
      if (e.isSymbolicLink()) { skipped.push(rel + " (링크)"); continue; }
      if (e.isDirectory()) walk(rel);
      else if (e.isFile()) consider(rel);
    }
  };
  let docsInfo;
  try { docsInfo = lstatSync(join(root, "docs"), { throwIfNoEntry: false }); } catch { skipped.push("docs (상태를 확인하지 못함)"); docsInfo = undefined; }
  if (docsInfo?.isSymbolicLink()) skipped.push("docs (링크)");
  else if (docsInfo !== undefined) walk("docs");
  const found: string[] = [];
  for (const file of files) {
    let buffer: Buffer;
    try { buffer = readFileSync(join(root, file)); } catch { skipped.push(file + " (읽지 못함)"); continue; }
    if (buffer.subarray(0, 8192).includes(0)) { skipped.push(file + " (바이너리)"); continue; }
    const text = buffer.toString("utf8");
    text.split(/\r?\n/).forEach((line, index) => {
      if (COMMAND_REF.test(line)) {
        // 본문은 출력하지 않는다 — 비밀 탐지가 모든 표현을 잡지 못하므로 위치(파일:줄)만 알린다
        found.push(file + ":" + (index + 1));
      }
    });
  }
  return { found, skipped };
}

function checkRegistry(plan: AdoptPlan, home: string, root: string, agentText: string): AdoptPlan {
  let entries;
  try { entries = listCandidates(home); } catch (error) {
    plan.blockers.push(`워크스페이스 등록부를 읽을 수 없다: ${error instanceof Error ? error.message : "오류"}`);
    return plan;
  }
  plan.fingerprint = createHash("sha256").update(agentText).update("|").update(JSON.stringify(entries)).digest("hex");
  void agentText;
  const norm = (p: string) => (process.platform === "win32" ? p.toLowerCase() : p);
  const samePaths = entries.filter((e) => norm(e.path) === norm(root));
  const samePath = samePaths.find((e) => e.id === plan.workspaceId);
  const sameId = entries.find((e) => e.id === plan.workspaceId);
  if (sameId && norm(sameId.path) !== norm(root)) {
    plan.blockers.push(`같은 workspace_id가 다른 위치(${sameId.path})에 등록되어 있다 — 옮겼다면 pace workspace move ${sameId.id} <경로>`);
  } else if (samePaths.some((e) => e.id !== plan.workspaceId)) {
    plan.blockers.push("이 경로가 다른 workspace_id로 등록되어 있다");
  } else if (samePath?.active) {
    plan.warnings.push("이미 같은 ID·경로로 등록되어 있다 — 등록은 그대로 둔다");
  } else {
    plan.needsRegister = true;
    plan.moves.push(`워크스페이스 등록: ${basename(root)} · ${plan.workspaceId}`);
  }
  if (plan.blockers.length === 0) planExtras(plan, root);
  if (plan.state === "done" && plan.moves.length === 0) plan.moves.length = 0;
  return plan;
}

export function formatPlan(plan: AdoptPlan, applied: boolean): string {
  const lines: string[] = [];
  if (plan.blockers.length) {
    const applyFailed = plan.blockers.some((b) => b.startsWith("적용 실패"));
    lines.push(applyFailed ? "멈춤:" : "멈춤 — 원본을 바꾸지 않았다:", ...plan.blockers.map((b) => `- ${b}`));
  } else if (plan.moves.length === 0) {
    lines.push("이미 가져온 프로젝트다 — 바꿀 것이 없다.");
  } else {
    lines.push(applied ? "가져왔다:" : "미리보기 — 바꿀 것(적용은 --apply):", ...plan.moves.map((m) => `- ${m}`));
    if (applied) lines.push("커밋·push는 하지 않았다 — git status로 확인하고 직접 커밋한다.");
  }
  for (const w of plan.warnings) lines.push(`주의: ${w}`);
  if (plan.blockers.length === 0 && plan.references.length > 0) {
    lines.push(`OPAL 명령·스킬 참조 ${plan.references.length}곳 — 자동으로 바꾸지 않았다. 직접 pace 이름으로 고친다:`, ...plan.references.map((r) => `  ${r}`));
  }
  if (plan.blockers.length === 0 && plan.referencesSkipped.length > 0) {
    lines.push(`주의: 검색하지 못한 파일 ${plan.referencesSkipped.length}개 — 참조 보고가 완전하지 않다. 직접 확인한다:`, ...plan.referencesSkipped.map((f) => `  ${f}`));
  }
  return lines.join("\n");
}

/** 계획을 다시 만들어 같을 때만 쓴다. 실패하면 이번에 바꾼 것만 되돌린다. */
export function applyAdoptOpal(rootInput: string, home: string, expected: AdoptPlan, deps: Deps = {}): AdoptPlan {
  const plan = planAdoptOpal(rootInput, home);
  if (plan.blockers.length) return plan;
  if (JSON.stringify(plan) !== JSON.stringify(expected)) {
    plan.blockers.push("미리보기 뒤 상태가 바뀌었다 — 다시 실행한다");
    return plan;
  }
  const register = deps.register ?? registerWorkspace;
  const rewrite = deps.rewriteAgent ?? writeFileAtomic;
  const failures: string[] = [];
  const root = plan.root;
  let moved = false;
  let original = "";
  const agent = join(root, ".pace", "AGENT.md");
  const undo: (() => void)[] = [];
  // 회수가 건드리는 파일의 적용 전 바이트(null = 없던 파일) — 실패하면 인덱스는 HEAD로, 작업 트리는 이 바이트로 되돌린다
  const saved = new Map<string, Buffer | null>();
  try {
    if (plan.state === "ready" && plan.recover.length) {
      const keep = (rel: string) => { const path = join(root, rel); saved.set(rel, existsSync(path) ? readFileSync(path) : null); };
      for (const { file } of plan.recover) { keep(`.pace/memory/${file}`); keep(`.opal/memory/${file}`); }
      keep(".opal/memory/INDEX.md");
      mkdirSync(join(root, ".opal", "memory"), { recursive: true });
      for (const { file, action } of plan.recover) {
        const from = `.pace/memory/${file}`, to = `.opal/memory/${file}`;
        const step = action === "drop" ? git(root, ["rm", "-q", "--", from]) : git(root, ["mv", ...(action === "replace" ? ["-f"] : []), "--", from, to]);
        if (!step.ok) throw new Error(`.pace/memory 회수 실패(${file}): ${step.out}`);
      }
      for (const dir of [join(root, ".pace", "memory"), join(root, ".pace")]) if (existsSync(dir)) rmdirSync(dir);
    }
    if (plan.state === "ready") {
      original = readFileSync(join(root, ".opal", "AGENT.md"), "utf8");
      const mv = (deps.move ?? ((r) => git(r, ["mv", ".opal", ".pace"])))(root);
      moved = lstatSync(join(root, ".pace"), { throwIfNoEntry: false }) !== undefined && lstatSync(join(root, ".opal"), { throwIfNoEntry: false }) === undefined;
      if (!mv.ok) throw new Error(`git mv 실패: ${mv.out}`);
      rewrite(agent, convertAgent(original));
    }
    if (plan.recover.length) (deps.rebuildIndex ?? ((dir: string) => { rebuildMemoryIndex(dir, "project"); }))(join(root, ".pace", "memory"));
    if (plan.hook !== null) {
      const hookText = readFileSync(plan.hook, "utf8");
      let backup = `${plan.hook}.opal-backup`;
      for (let n = 2; lstatSync(backup, { throwIfNoEntry: false }) !== undefined; n++) backup = `${plan.hook}.opal-backup-${n}`;
      const hookPath = plan.hook, backupPath = backup;
      const hookMode = lstatSync(hookPath).mode & 0o777;
      // 이번에 만든 백업은 훅 복원이 성공한 뒤에만 지운다 — 복원이 실패하면 백업이 유일한 원본이다
      let backupCreated = false;
      undo.push(() => {
        writeFileAtomic(hookPath, hookText);
        chmodSync(hookPath, hookMode);
        if (backupCreated) unlinkSync(backupPath);
      });
      const fd = openSync(backupPath, "wx", hookMode);
      backupCreated = true;
      try { writeFileSync(fd, hookText, "utf8"); } finally { closeSync(fd); }
      (deps.writeHook ?? ((path: string, text: string) => { writeFileAtomic(path, text); chmodSync(path, 0o755); }))(hookPath, COMMIT_HOOK);
    }
    if (plan.dashboard) {
      const entryPath = join(root, "backlogs", "README.html");
      // 쓰기 직전에 경로 구성 요소가 링크로 바뀌지 않았는지 다시 확인한다(동시에 같은 저장소를 바꾸는 프로세스는 지원 조건 밖)
      if (!noLinkInPath(root, "backlogs/README.html")) throw new Error("backlogs 경로가 링크로 바뀌어 중단한다");
      const entryBytes = readFileSync(entryPath);
      const entryMode = lstatSync(entryPath).mode & 0o777;
      undo.push(() => { writeFileAtomic(entryPath, entryBytes.toString("utf8")); chmodSync(entryPath, entryMode); });
      (deps.writeEntry ?? writeFileAtomic)(entryPath, renderDashboardEntry());
    }
    if (plan.needsRegister) {
      // registerWorkspace는 항목을 마지막에 원자적으로(link) 만든다 — 던졌다면 항목이 없으므로 등록부는 되돌릴 것이 없다
      register(home, { path: root, name: basename(root), summary: "" }, AGENT_BUDGET);
    }
  } catch (error) {
    for (const step of undo.reverse()) {
      try { step(); } catch (e) { failures.push(`파일 복원 실패: ${e instanceof Error ? e.message : "오류"}`); }
    }
    if (moved) {
      try { writeFileAtomic(agent, original); } catch (e) { failures.push(`AGENT 원문 복원 실패: ${e instanceof Error ? e.message : "오류"}`); }
      const back = git(root, ["mv", ".pace", ".opal"]);
      if (!back.ok) failures.push(`git mv 되돌리기 실패: ${back.out}`);
    }
    if (saved.size) {
      // 회수 전 .opal·.pace는 커밋된 깨끗한 상태였다(계획에서 확인) — 두 폴더의 인덱스는 HEAD로, 파일은 저장한 바이트로 되돌린다
      if (!existsSync(join(root, ".opal")) || existsSync(join(root, ".pace", "AGENT.md"))) failures.push("이동을 되돌리지 못해 .pace/memory 회수 복원을 건너뛴다");
      else {
        const reset = git(root, ["reset", "-q", "HEAD", "--", ".opal/memory", ".pace/memory"]);
        if (!reset.ok) failures.push(`회수 인덱스 복원 실패: ${reset.out}`);
        for (const [rel, bytes] of saved) {
          const path = join(root, rel);
          try {
            if (bytes === null) { if (existsSync(path)) unlinkSync(path); }
            else { mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, bytes); }
          } catch (e) { failures.push(`회수 파일 복원 실패(${rel}): ${e instanceof Error ? e.message : "오류"}`); }
        }
      }
    }
    const reason = error instanceof Error ? error.message : "오류";
    plan.blockers.push(failures.length ? `적용 실패: ${reason} — 되돌리지 못한 것이 있어 직접 확인한다: ${failures.join("; ")}` : `적용 실패 — 되돌렸다: ${reason}`);
  }
  return plan;
}
