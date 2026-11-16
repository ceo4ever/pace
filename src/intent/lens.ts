import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { getList, getString, parseFrontmatter } from "../core/frontmatter.ts";
import { writeFileAtomic } from "../core/fsutil.ts";
import { packageRoot } from "../core/paths.ts";

export class IntentError extends Error {}

/** 설치본·저장소 공통 스킬 원본 위치. 테스트는 다른 폴더를 넘긴다. */
export const intentSkillDir: string = join(packageRoot, "skills", "pace-intent");

export const LENS_GROUPS = ["intent", "writing", "review", "strategy", "service", "execution", "platform"] as const;
export const LENS_TYPES = ["document", "feature", "service", "business", "platform"] as const;
export const LENS_DEPTHS = ["L0", "L1", "L2", "L3"] as const;
export const LENS_SECTIONS = [
  "Looks at",
  "Key questions",
  "Common gaps",
  "Turning gaps into questions",
  "Tensions",
  "When not to use",
  "Output form",
  "Closing",
  "Source",
] as const;
const OUTPUT_LINES = ["Form:", "Link to first layer:", "When to produce:"];

export interface Lens {
  id: string;
  title: string;
  group: string;
  types: string[];
  depth: string[];
  signals: string[];
  source: string;
  file: string; // references/ 기준 상대 경로
}

export interface LensProblem {
  file: string;
  message: string;
}

function referencesDir(skillDir: string): string {
  return join(skillDir, "references");
}

/**
 * references/<group>/*.md 만 렌즈로 본다. 그룹 밖 파일(INDEX·FORMAT·SOURCES·examples 등)은 렌즈가 아니다.
 * references·그룹 폴더가 심볼릭 링크면 거부하고, 그룹 안에서는 일반 파일만 읽는다(링크·폴더는 문제로 보고).
 */
function lensFiles(skillDir: string): { files: string[]; skipped: LensProblem[] } {
  const root = referencesDir(skillDir);
  if (!existsSync(root)) throw new IntentError(`references 폴더가 없다: ${root}`);
  if (lstatSync(root).isSymbolicLink()) throw new IntentError("references 심볼릭 링크는 읽지 않는다");
  const files: string[] = [];
  const skipped: LensProblem[] = [];
  for (const group of LENS_GROUPS) {
    const dir = join(root, group);
    if (!existsSync(dir) && !isLink(dir)) continue;
    if (lstatSync(dir).isSymbolicLink()) throw new IntentError(`렌즈 폴더 심볼릭 링크는 읽지 않는다: ${group}`);
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.name.endsWith(".md")) continue;
      if (entry.isFile()) files.push(join(dir, entry.name));
      else skipped.push({ file: `${group}/${entry.name}`, message: "일반 파일이 아니다(심볼릭 링크·폴더는 읽지 않는다)" });
    }
  }
  return { files, skipped };
}

function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/** `## ` 절을 모은다. 코드 펜스 안은 건너뛰고, 같은 제목이 다시 나오면 duplicates에 남긴다. */
function sections(body: string): { map: Map<string, string>; duplicates: string[] } {
  const map = new Map<string, string>();
  const duplicates: string[] = [];
  let current: string | null = null;
  let fenced = false;
  const lines: string[] = [];
  const flush = () => {
    if (current !== null) {
      if (map.has(current)) duplicates.push(current);
      else map.set(current, lines.join("\n").trim());
    }
    lines.length = 0;
  };
  for (const line of body.replaceAll("\r\n", "\n").split("\n")) {
    if (/^(```|~~~)/.test(line)) fenced = !fenced;
    const heading = fenced ? null : /^## (.+?)\s*$/.exec(line);
    if (heading) {
      flush();
      current = heading[1]!;
    } else if (current !== null) lines.push(line);
  }
  flush();
  return { map, duplicates };
}

/** 렌즈 파일 하나를 읽고 형식 문제를 모은다. 문제가 있어도 읽은 만큼 돌려준다. */
export function readLens(skillDir: string, path: string): { lens: Lens; problems: LensProblem[] } {
  const file = relative(referencesDir(skillDir), path).replaceAll("\\", "/");
  const { data, body } = parseFrontmatter(readFileSync(path, "utf8"));
  const problems: LensProblem[] = [];
  const problem = (message: string) => problems.push({ file, message });
  const [group = "", name = ""] = file.split("/");
  const lens: Lens = {
    id: getString(data, "id"),
    title: getString(data, "title"),
    group: getString(data, "group"),
    types: getList(data, "types"),
    depth: getList(data, "depth"),
    signals: getList(data, "signals"),
    source: getString(data, "source"),
    file,
  };
  if (lens.id !== name.replace(/\.md$/, "")) problem(`id가 파일 이름과 다르다: ${lens.id || "(없음)"}`);
  if (!lens.title) problem("title이 없다");
  if (lens.group !== group) problem(`group이 폴더와 다르다: ${lens.group || "(없음)"}`);
  if (lens.types.length === 0) problem("types가 없다");
  for (const t of lens.types) if (!(LENS_TYPES as readonly string[]).includes(t)) problem(`알 수 없는 type: ${t}`);
  if (lens.depth.length === 0) problem("depth가 없다");
  for (const d of lens.depth) if (!(LENS_DEPTHS as readonly string[]).includes(d)) problem(`알 수 없는 depth: ${d}`);
  if (lens.signals.length === 0) problem("signals가 없다");
  if (!lens.source) problem("source가 없다");
  const { map: found, duplicates } = sections(body);
  for (const d of duplicates) problem(`절이 두 번 있다: ## ${d}`);
  for (const s of LENS_SECTIONS) {
    if (!found.has(s)) problem(`절이 없다: ## ${s}`);
    else if (found.get(s) === "") problem(`절이 비었다: ## ${s}`);
  }
  const output = found.get("Output form") ?? "";
  for (const line of OUTPUT_LINES) if (found.has("Output form") && !output.includes(line)) problem(`Output form에 ${line} 줄이 없다`);
  return { lens, problems };
}

export function loadLenses(skillDir: string = intentSkillDir): { lenses: Lens[]; problems: LensProblem[] } {
  const lenses: Lens[] = [];
  const { files, skipped } = lensFiles(skillDir);
  const problems: LensProblem[] = [...skipped];
  const seen = new Map<string, string>();
  for (const path of files) {
    const result = readLens(skillDir, path);
    lenses.push(result.lens);
    problems.push(...result.problems);
    const first = seen.get(result.lens.id);
    if (result.lens.id && first) problems.push({ file: result.lens.file, message: `id가 ${first}와 겹친다: ${result.lens.id}` });
    else if (result.lens.id) seen.set(result.lens.id, result.lens.file);
  }
  return { lenses, problems };
}

const cell = (text: string) => text.replaceAll("|", "\\|").replaceAll("\n", " ");

/** 렌즈 머리말에서 INDEX.md를 만든다 — 손으로 고치지 않는다. */
export function renderLensIndex(lenses: Lens[]): string {
  const rows = [...lenses]
    .sort((a, b) => LENS_GROUPS.indexOf(a.group as never) - LENS_GROUPS.indexOf(b.group as never) || a.id.localeCompare(b.id))
    .map((l) => `| [${cell(l.title)}](${l.file}) | ${l.group} | ${l.types.join(", ")} | ${l.depth.join(", ")} | ${cell(l.signals.join("; "))} |`);
  return [
    "# Lens index",
    "",
    "<!-- Generated by `pace intent index` from lens front matter. Do not edit by hand. -->",
    "",
    "Pick lenses by request type × depth × signals (SKILL.md ②). Always start from the `intent` group. Format: [LENS-FORMAT.md](LENS-FORMAT.md).",
    "",
    "| Lens | Group | Types | Depth | Signals |",
    "|---|---|---|---|---|",
    ...(rows.length > 0 ? rows : ["| (none yet) | | | | |"]),
    "",
  ].join("\n");
}

export interface IndexResult {
  path: string;
  changed: boolean;
  problems: LensProblem[];
}

/** check=true면 쓰지 않고 지금 파일이 생성 결과와 같은지만 본다. 형식 문제가 있으면 쓰지 않는다. */
export function writeLensIndex(skillDir: string = intentSkillDir, check = false): IndexResult {
  const { lenses, problems } = loadLenses(skillDir);
  const path = join(referencesDir(skillDir), "INDEX.md");
  const next = renderLensIndex(lenses);
  const current = existsSync(path) ? readFileSync(path, "utf8").replaceAll("\r\n", "\n") : null;
  const changed = current !== next;
  if (!check && changed && problems.length === 0) writeFileAtomic(path, next);
  return { path, changed, problems };
}
