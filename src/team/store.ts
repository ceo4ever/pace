import { spawnSync } from "node:child_process";
import { inputHash, type InputTrace } from "../core/input-snapshot.ts";
import { randomUUID } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readSync, realpathSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { packageRoot, assertSafeGitPath } from "../core/paths.ts";
import { fillTemplate } from "../core/fsutil.ts";
import { isTeamRole, parseTeamSource, validTeamName, type TeamMember } from "./model.ts";

export function teamRoot(cwd: string): string {
  assertSafeGitPath(cwd);
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0", GIT_NO_LAZY_FETCH: "1" };
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE"]) delete (env as NodeJS.ProcessEnv)[key];
  const result = spawnSync("git", ["-c", "core.fsmonitor=false", "-C", cwd, "rev-parse", "--show-toplevel"], { encoding: "utf8", timeout: 5000, env });
  if (result.status !== 0 || !result.stdout.trim()) throw new Error("team은 Git 저장소 안에서 실행한다");
  const root = realpathSync.native(result.stdout.trim());
  const within = relative(root, realpathSync.native(cwd));
  if (isAbsolute(within) || within === ".." || within.startsWith(`..${sep}`)) throw new Error("Git 루트가 현재 경로를 포함하지 않는다");
  assertSafeGitPath(root);
  return root;
}
/** 루트는 호출자가 지정한 저장소, 그 안의 모든 조상 링크는 거부한다. */
export function safeTeamPath(root: string, rel: string, directory = false): string {
  if (isAbsolute(rel) || rel.includes("\\") || rel.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("팀 경로 오류");
  let path = resolve(root);
  const parts = rel.split("/");
  for (let i = 0; i < parts.length; i++) {
    path = join(path, parts[i]!);
    try {
      const stat = lstatSync(path);
      const wantDirectory = i < parts.length - 1 || directory;
      if (stat.isSymbolicLink() || (wantDirectory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1)) throw new Error(`팀 경로는 링크 없는 ${wantDirectory ? "디렉터리" : "단일 링크 일반 파일"}이어야 한다: ${rel}`);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  return path;
}
export function readTeamFile(root: string, rel: string): string | null {
  const path = safeTeamPath(root, rel);
  let fd: number;
  try { fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 65536) throw new Error(`팀 파일은 64KiB 이하 일반 단일 링크 파일이어야 한다: ${rel}`);
    const buffer = Buffer.alloc(65537); let size = 0;
    while (size < buffer.length) { const count = readSync(fd, buffer, size, buffer.length - size, null); if (!count) break; size += count; }
    if (size > 65536) throw new Error(`팀 파일 크기 초과: ${rel}`);
    const bytes = buffer.subarray(0, size), text = bytes.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(bytes)) throw new Error(`팀 파일 UTF-8 오류: ${rel}`);
    return text;
  } finally { closeSync(fd); }
}
export function teamFiles(root: string, rel: string, extension: string, inputs?: InputTrace): string[] {
  const path = safeTeamPath(root, rel, true);
  const accepts = (name: string) => !name.includes("/") && name.endsWith(extension) && !(rel === ".pace/team" && name === "resources.md");
  let names: string[];
  try { names = readdirSync(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; names = []; }
  inputs?.listing?.(path, names, `team-files:${extension}`, "entries", accepts);
  return names.filter(accepts).sort();
}
export function loadTeamMember(root: string, name: string, inputs?: InputTrace): TeamMember {
  if (!validTeamName(name) || name === "resources") throw new Error("팀 이름이 올바르지 않거나 예약된 메타파일 이름이다");
  const text = readTeamFile(root, `.pace/team/${name}.md`);
  if (text === null) throw new Error(`팀 역할이 없다: ${name}`);
  const member = parseTeamSource(text, name);
  inputs?.record(safeTeamPath(root, `.pace/team/${name}.md`), inputHash(text));
  return member;
}
export function loadTeam(root: string, inputs?: InputTrace): TeamMember[] {
  return teamFiles(root, ".pace/team", ".md", inputs).map((file) => loadTeamMember(root, file.slice(0, -3), inputs));
}
export function createTeamMember(root: string, name: string, role: string): TeamMember {
  if (!validTeamName(name) || name === "resources" || !isTeamRole(role)) throw new Error("팀 이름 또는 역할이 올바르지 않거나 예약된 메타파일 이름이다");
  const duties = {
    lead: "프로젝트 계약을 확인하고 담당·검토·인계를 정리하며 완료 근거를 통합한다.",
    maker: "배정된 범위를 구현하고 관련 검사를 실행해 결과와 한계를 보고한다.",
    reviewer: "작성자와 독립된 근거로 결함·계약 충족을 판정하고 지적을 반환한다.",
    coordinator: "작업자의 질문·장애를 분류하고 결정 주체에게 전달해 답과 작업 수명을 연결한다.",
  };
  const tier = role === "lead" || role === "reviewer" ? "high" : "medium";
  const template = readTeamFile(packageRoot, "templates/team/member.md");
  if (template === null) throw new Error("팀 원본 템플릿이 없다");
  const text = fillTemplate(template, {
    name, role, tier, duties: duties[role],
    scopeMarker: `vfy-s-${randomUUID().replaceAll("-", "").slice(0, 16)}`,
    reviewMarker: `vfy-r-${randomUUID().replaceAll("-", "").slice(0, 16)}`,
  });
  const member = parseTeamSource(text, name);
  const target = safeTeamPath(root, member.source);
  mkdirSync(dirname(target), { recursive: true });
  safeTeamPath(root, member.source);
  const fd = openSync(target, "wx");
  try { writeFileSync(fd, text, "utf8"); } finally { closeSync(fd); }
  return member;
}
