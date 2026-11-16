import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fillTemplate, folderName, today, writeFileAtomic } from "../core/fsutil.ts";
import { templatesDir } from "../core/paths.ts";
import type { Repo } from "./harness.ts";

export class BacklogError extends Error {}
const BL = /^BL(\d{6})_(\d{2})_(.+)$/;
const BR = /^BR(\d{2})_(.+)\.md$/;

function contained(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel !== ".." && !rel.startsWith("../") && !rel.startsWith("..\\") && !isAbsolute(rel);
}

/** 기존 파일도 실제 경로로 확인하여 심볼릭 링크를 통한 외부 쓰기를 거부한다. */
export function assertBacklogPath(root: string, path: string): void {
  if (lstatSync(root).isSymbolicLink()) throw new BacklogError("backlogs/ 심볼릭 링크는 쓸 수 없다");
  if (!contained(realpathSync(root), realpathSync(path))) throw new BacklogError("백로그 경로가 backlogs/ 밖을 가리킨다");
}

export function resolveBacklog(root: string, selector: string): string {
  const base = join(root, "backlogs");
  if (!existsSync(base)) throw new BacklogError("백로그가 없다");
  if (lstatSync(base).isSymbolicLink()) throw new BacklogError("backlogs/ 심볼릭 링크는 쓸 수 없다");
  let path = resolve(root, selector);
  if (!existsSync(path) && /^BL\d{6}_\d{2}(?:_.+)?$/.test(selector)) {
    const matches = readdirSync(base).filter((n) => BL.test(n) && (n === selector || n.startsWith(selector + "_")));
    if (matches.length !== 1) throw new BacklogError(`백로그 앞부분이 ${matches.length}개에 맞는다: ${selector}`);
    path = join(base, matches[0]!);
  }
  if (!existsSync(path)) throw new BacklogError(`백로그가 없다: ${selector}`);
  assertBacklogPath(base, path);
  if (!statSync(path).isDirectory()) throw new BacklogError("브리프 파일은 출처로 쓸 수 없다 — BL 폴더를 지정한다");
  if (!BL.test(basename(path)) || realpathSync(base) !== dirname(realpathSync(path))) throw new BacklogError("BL 폴더를 지정한다");
  // /var와 /private/var 같은 별칭도 저장소 루트 기준의 출처 링크로 만든다.
  path = join(base, basename(realpathSync(path)));
  if (!BL.test(basename(path))) throw new BacklogError("BL 폴더를 지정한다");
  const overview = join(path, "BACKLOG.md");
  if (!existsSync(overview)) throw new BacklogError("BACKLOG.md가 없다");
  assertBacklogPath(base, overview);
  return path;
}

export function listBriefs(root: string, folder: string): { id: string; name: string; path: string }[] {
  const seen = new Set<string>();
  return readdirSync(folder).filter((n) => BR.test(n)).sort().map((n) => {
    const m = BR.exec(n)!;
    if (m[1] === "00" || seen.has(m[1]!)) throw new BacklogError(`브리프 번호가 중복되거나 잘못됐다: BR${m[1]}`);
    seen.add(m[1]!);
    const path = join(folder, n);
    assertBacklogPath(join(root, "backlogs"), path);
    if (!statSync(path).isFile()) throw new BacklogError(`브리프 파일이 아니다: ${n}`);
    return { id: m[1]!, name: m[2]!.replace(/_/g, " "), path };
  });
}

function requireMain(repo: Repo): void {
  if (repo.inWorktree || repo.branch !== repo.base) throw new BacklogError("backlog 명령은 main 체크아웃에서 실행한다");
}

export function newBacklog(repo: Repo, name: string, date = today()): string {
  requireMain(repo);
  return createBacklogDir(join(repo.root, "backlogs"), name, date);
}

/** base 아래에 일자별 다음 번호의 BL 폴더와 BACKLOG.md를 만든다. 저장소 밖 대체 위치(pace scout)도 같은 규칙을 쓴다. */
export function createBacklogDir(base: string, name: string, date = today()): string {
  const clean = folderName(name);
  if (existsSync(base) && lstatSync(base).isSymbolicLink()) throw new BacklogError(`${basename(base)}/ 심볼릭 링크는 쓸 수 없다`);
  mkdirSync(base, { recursive: true });
  const day = date.replaceAll("-", "").slice(2);
  const nums = readdirSync(base).map((n) => BL.exec(n)).filter((m) => m?.[1] === day).map((m) => Number(m![2]));
  const number = Math.max(0, ...nums) + 1;
  if (number > 99) throw new BacklogError("하루 백로그 번호 99를 초과했다");
  const id = `BL${day}_${String(number).padStart(2, "0")}`;
  const dir = join(base, `${id}_${clean}`);
  mkdirSync(dir); // 동시 생성에서 같은 번호·이름을 덮어쓰지 않는다.
  writeFileAtomic(join(dir, "BACKLOG.md"), fillTemplate(readFileSync(join(templatesDir, "backlog/BACKLOG.md"), "utf8"), { id, name: clean.replace(/_/g, " "), date }));
  return dir;
}

export function newBrief(repo: Repo, selector: string, name: string): string {
  requireMain(repo);
  const clean = folderName(name);
  const dir = resolveBacklog(repo.root, selector);
  const overviewPath = join(dir, "BACKLOG.md");
  const original = readFileSync(overviewPath, "utf8");
  const overview = original.replaceAll("\r\n", "\n");
  if (!/^- 상태: (대기|진행)\s*$/m.test(overview)) throw new BacklogError("끝난 백로그에는 브리프를 덧붙이지 않는다 — 새 백로그를 만든다");
  const briefs = listBriefs(repo.root, dir);
  const number = Math.max(0, ...briefs.map((b) => Number(b.id))) + 1;
  if (number > 99) throw new BacklogError("브리프 번호 99를 초과했다");
  const id = `BR${String(number).padStart(2, "0")}`;
  const file = `${id}_${clean}.md`;
  const heading = overview.indexOf("\n## 진행 현황\n");
  if (heading < 0) throw new BacklogError("BACKLOG.md에 진행 현황 표가 없다");
  const lines = overview.split("\n");
  let i = overview.slice(0, heading + 1).split("\n").length;
  while (i < lines.length && !lines[i]!.startsWith("|")) {
    if (lines[i]!.startsWith("## ")) throw new BacklogError("진행 현황 표가 없다");
    i++;
  }
  if (i >= lines.length) throw new BacklogError("진행 현황 표가 없다");
  while (i < lines.length && lines[i]!.startsWith("|")) i++;
  lines.splice(i, 0, `| [${id} ${clean.replace(/_/g, " ")}](${file}) | 대기 | — | — | |`);
  const path = join(dir, file);
  if (existsSync(path)) throw new BacklogError("브리프 파일이 이미 있다");
  writeFileAtomic(path, fillTemplate(readFileSync(join(templatesDir, "backlog/BRIEF.md"), "utf8"), { id, name: clean.replace(/_/g, " "), backlog: basename(dir) }));
  writeFileAtomic(overviewPath, lines.join(original.includes("\r\n") ? "\r\n" : "\n"));
  return path;
}
