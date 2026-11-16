import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import { getList, getString, parseFrontmatter, stringifyFrontmatter } from "../core/frontmatter.ts";
import { slugify, today, writeFileAtomic } from "../core/fsutil.ts";
import { templatesDir } from "../core/paths.ts";

/**
 * 프로젝트 브레인: 일하며 쌓는 긴 지식(결정과 이유·구성요소·흐름·조사·용어). 부트에 넣지 않고 LLM이 필요할 때 찾아 쓴다.
 * 형식은 v1 brain(SCHEMA.md·pages/<type>/·log.md)과 호환한다. 쓰기(add·update)와 목차 갱신은 lint를 통과해야 한다.
 */
export const PAGE_TYPES = ["concept", "entity", "flow", "synthesis", "term"] as const;
export const PAGE_STATUSES = ["active", "draft", "stale"] as const;

const TYPE_TITLES: Record<string, string> = {
  concept: "결정과 이유",
  entity: "구성요소",
  flow: "흐름",
  synthesis: "분석·조사",
  term: "용어",
};
/** 아직 실재하지 않는 지식의 표지 — 제목과 `#` 제목 줄에서만 찾는다(산문은 보지 않음, v1과 같음). */
const SPECULATIVE_MARKERS = ["미착수", "미확정", "향후계획", "향후과제", "개선사항", "todo", "tbd", "추후", "예정"];
/** summary는 v1 페이지에 없어 필수에서 뺀다(경고). 새 페이지(add)는 CLI가 요구한다. */
const REQUIRED_KEYS = ["type", "title", "created", "updated", "status"] as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface BrainPage {
  path: string;
  file: string;
  /** 폴더 이름(pages/<folder>/) */
  folder: string;
  type: string;
  title: string;
  /** frontmatter summary, 없으면 본문 첫 문단 */
  summary: string;
  hasSummary: boolean;
  tags: string[];
  sources: string[];
  related: string[];
  created: string;
  updated: string;
  status: string;
  data: Record<string, string | string[]>;
  raw: string;
  body: string;
}

export function brainDir(projectRoot: string): string {
  return join(projectRoot, ".pace", "brain");
}

/** cwd에서 위로 올라가며 `.pace/brain`이 있는 프로젝트 루트를 찾는다. */
export function findBrainRoot(cwd: string): string | null {
  let dir = resolve(cwd);
  for (;;) {
    if (existsSync(join(brainDir(dir), "SCHEMA.md"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** 브레인이 없을 때 초기화 위치: cwd에서 위로 올라가 처음 만나는 git 루트, 없으면 cwd. */
export function findProjectRoot(cwd: string): string {
  let dir = resolve(cwd);
  for (;;) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(cwd);
    dir = parent;
  }
}

export function initBrain(projectRoot: string): { root: string; created: boolean } {
  const dir = brainDir(projectRoot);
  const schemaPath = join(dir, "SCHEMA.md");
  if (existsSync(schemaPath)) return { root: projectRoot, created: false };
  writeFileAtomic(schemaPath, schemaTemplate());
  for (const type of PAGE_TYPES) mkdirSync(join(dir, "pages", type), { recursive: true });
  appendLog(projectRoot, "init", "브레인 생성");
  rebuildBrainIndex(projectRoot);
  return { root: projectRoot, created: true };
}

export function schemaTemplate(): string {
  return readFileSync(join(templatesDir, "brain", "SCHEMA.md"), "utf8");
}

export function listPages(projectRoot: string): BrainPage[] {
  const pagesDir = join(brainDir(projectRoot), "pages");
  if (!existsSync(pagesDir)) return [];
  const pages: BrainPage[] = [];
  // pages/ 아래 폴더를 모두 분류로 본다(v1 프로젝트의 term 등 포함).
  for (const folder of readdirSync(pagesDir).sort()) {
    const dir = join(pagesDir, folder);
    if (!statSync(dir).isDirectory()) continue;
    for (const file of readdirSync(dir).sort()) {
      if (!file.endsWith(".md") || file.startsWith(".")) continue;
      pages.push(parsePage(join(dir, file), folder));
    }
  }
  return pages;
}

function parsePage(path: string, folder: string): BrainPage {
  const raw = readFileSync(path, "utf8");
  const { data, body } = parseFrontmatter(raw);
  const summary = getString(data, "summary");
  return {
    path,
    file: basename(path, ".md"),
    folder,
    type: getString(data, "type", folder),
    title: getString(data, "title", basename(path, ".md")),
    summary: summary || firstParagraph(body),
    hasSummary: summary.length > 0,
    tags: getList(data, "tags"),
    sources: getList(data, "sources"),
    related: getList(data, "related"),
    created: getString(data, "created"),
    updated: getString(data, "updated"),
    status: getString(data, "status", "active"),
    data,
    raw,
    body,
  };
}

// ── 목차 ─────────────────────────────────────────────────────────────

export function rebuildBrainIndex(projectRoot: string, pages = listPages(projectRoot)): string {
  const folders = [...new Set([...PAGE_TYPES, ...pages.map((p) => p.folder)])];
  const sections = folders.map((folder) => {
    const lines = pages
      .filter((p) => p.folder === folder)
      .map((p) => {
        const tags = p.tags.length > 0 ? ` ${p.tags.map((t) => `#${t}`).join(" ")}` : "";
        const mark = p.status === "stale" ? " (낡음)" : p.status === "draft" ? " (초안)" : "";
        return `- [${p.title}](pages/${folder}/${p.file}.md)${mark} — ${p.summary}${tags}`;
      });
    return `## ${TYPE_TITLES[folder] ?? folder}\n\n${lines.length > 0 ? lines.join("\n") : "- (없음)"}`;
  });
  const content = `# 프로젝트 브레인 목차\n\n> 자동 생성 — 직접 고치지 말 것. 페이지 ${pages.length}개. 형식은 SCHEMA.md.\n\n${sections.join("\n\n")}\n`;
  writeFileAtomic(join(brainDir(projectRoot), "index.md"), content);
  return content;
}

// ── 검색: 관련 절을 모아 돌려준다 ────────────────────────────────────

export interface SearchOptions {
  type?: string;
  tag?: string;
  /** 페이지 목록만 (취합하지 않음) */
  list?: boolean;
  limit?: number;
  /** 취합할 글자 수 상한 (한국어 약 3자 ≈ 1토큰) */
  budget?: number;
  includeDraft?: boolean;
}

export interface SearchSection {
  page: BrainPage;
  heading: string;
  text: string;
  score: number;
}

export interface SearchResult {
  pages: { page: BrainPage; score: number }[];
  sections: SearchSection[];
  truncated: boolean;
}

/** 검색 시점 정규화: 소문자 + 공백 제거 — "자동 취소"와 "자동취소"를 같게 본다(v1과 같음). */
export function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "");
}

export function searchBrain(projectRoot: string, query: string, options: SearchOptions = {}): SearchResult {
  const terms = query
    .split(/\s+/)
    .map(normalize)
    .filter((t) => t.length > 0);
  if (terms.length === 0) return { pages: [], sections: [], truncated: false };
  const phrase = normalize(query);
  const scoredPages: { page: BrainPage; score: number }[] = [];
  const sections: SearchSection[] = [];

  for (const page of listPages(projectRoot)) {
    if (options.type && page.type !== options.type && page.folder !== options.type) continue;
    if (options.tag && !page.tags.some((t) => t.toLowerCase() === options.tag!.toLowerCase())) continue;
    if (!options.includeDraft && page.type === "term" && page.status === "draft") continue;
    const title = normalize(page.title);
    const meta = normalize(`${page.summary} ${page.tags.join(" ")} ${page.file}`);
    const body = normalize(page.body);
    let score = 0;
    let matched = 0;
    for (const term of terms) {
      const s = (title.includes(term) ? 5 : 0) + (meta.includes(term) ? 3 : 0) + Math.min(count(body, term), 5);
      if (s > 0) matched++;
      score += s;
    }
    if (matched === 0) continue;
    if (terms.length > 1 && (title.includes(phrase) || body.includes(phrase))) score += 5;
    score += matched === terms.length ? 10 : 0;
    if (page.status === "stale") score -= 3;
    scoredPages.push({ page, score });

    for (const section of splitSections(page.body)) {
      const heading = normalize(section.heading);
      const text = normalize(section.text);
      let sectionScore = 0;
      let sectionMatched = 0;
      for (const term of terms) {
        const s = (heading.includes(term) ? 4 : 0) + Math.min(count(text, term), 5);
        if (s > 0) sectionMatched++;
        sectionScore += s;
      }
      if (sectionMatched === 0) continue;
      sections.push({ page, heading: section.heading, text: section.text, score: score + sectionScore + (sectionMatched === terms.length ? 5 : 0) });
    }
  }

  scoredPages.sort((a, b) => b.score - a.score);
  const limit = options.limit ?? (options.list ? 10 : 5);
  if (options.list) return { pages: scoredPages.slice(0, limit), sections: [], truncated: scoredPages.length > limit };

  // 점수 순으로 상한 안에서 절을 모은다. 한 페이지에서 너무 많이 가져오지 않게 페이지당 2절.
  const budget = options.budget ?? 2400;
  const picked: SearchSection[] = [];
  const perPage = new Map<string, number>();
  let used = 0;
  let truncated = false;
  for (const s of sections.sort((a, b) => b.score - a.score)) {
    if ((perPage.get(s.page.path) ?? 0) >= 2) continue;
    if (picked.length >= limit) {
      truncated = true;
      break;
    }
    const text = s.text.length > 700 ? `${s.text.slice(0, 699)}…` : s.text;
    if (used + text.length > budget && picked.length > 0) {
      truncated = true;
      break;
    }
    picked.push({ ...s, text });
    used += text.length;
    perPage.set(s.page.path, (perPage.get(s.page.path) ?? 0) + 1);
  }
  return { pages: scoredPages.slice(0, limit), sections: picked, truncated };
}

export function formatSearch(projectRoot: string, result: SearchResult, list: boolean): string {
  const hint = "되적립(file back): 이 답을 위해 코드·문서를 더 찾았다면 재사용할 결과를 위키에 남긴다(pace brain add/update). 질의 기록: pace brain log --op query --summary '<질의·발견 요약>'";
  if (result.pages.length === 0) return `결과 없음 — 검색어를 바꾸거나(동의어·영어) 코드·문서에서 확인\n\n${hint}`;
  if (list) {
    return `${result.pages.map(({ page }) => `${rel(projectRoot, page)} — ${page.title}: ${page.summary}`).join("\n")}\n\n${hint}`;
  }
  const blocks = result.sections.map(
    (s) => `### ${s.page.title} › ${s.heading || "(머리말)"}\n출처: ${rel(projectRoot, s.page)}${s.heading ? `#${s.heading}` : ""}\n${s.text.trim()}`,
  );
  if (blocks.length === 0) {
    blocks.push(...result.pages.map(({ page }) => `### ${page.title}\n출처: ${rel(projectRoot, page)}\n${page.summary}`));
  }
  if (result.truncated) blocks.push(`(상한까지만 — 더 보려면 --list 또는 해당 페이지를 직접 읽기)`);
  return [...blocks, hint].join("\n\n");
}

function splitSections(body: string): { heading: string; text: string }[] {
  const out: { heading: string; text: string }[] = [];
  let heading = "";
  let lines: string[] = [];
  const flush = () => {
    const text = lines.join("\n").trim();
    if (text.length > 0 || heading) out.push({ heading, text });
  };
  for (const line of body.split("\n")) {
    const m = /^#{1,4}\s+(.+)$/.exec(line);
    if (m) {
      flush();
      heading = m[1]!.trim();
      lines = [];
    } else {
      lines.push(line);
    }
  }
  flush();
  return out;
}

/** Repository paths only: opaque provenance (URL, conversation, project IDs) is not a file. */
export function sourcePaths(sources: string[]): string[] {
  const paths = sources.flatMap((source) => {
    let path = source.replace(/^(?:code|doc|backlog|file|test):/, "").trim();
    // Legacy sources sometimes append a code symbol after the file name.
    path = path.replace(/^(\S+\.[\w-]+(?::\d+(?:[-:]\d+)?)?)\s+[A-Za-z_$][\w.$]*$/, "$1");
    path = path.replace(/:\d+(?:[-:]\d+)?$/, "").replace(/#L\d+(?:-L?\d+)?$/, "");
    if (!path || isAbsolute(path) || path.includes("\\") || path.includes(":") || path.split("/").includes("..")) return [];
    // Bare provenance words are common in v1; require a path or file extension.
    if (!path.includes("/") && !/\.[\w-]+$/.test(path)) return [];
    path = posix.normalize(path).replace(/\/$/, "");
    return path === "." ? [] : [path];
  });
  return [...new Set(paths)];
}

/** Pages whose repository sources intersect the exact changed paths (including deleted files). */
export function brainUpdateCandidates(projectRoot: string, changed: Set<string>): string[] {
  return listPages(projectRoot)
    .filter((page) => sourcePaths(page.sources).some((path) => [...changed].some((file) => file === path || file.startsWith(`${path}/`))))
    .map((page) => rel(projectRoot, page));
}

/** One history walk per lint, preserving the first (latest commit) author date for each source. */
function sourceAuthorDates(root: string, paths: string[]): { dates: Map<string, string>; note?: string } {
  const dates = new Map<string, string>();
  if (paths.length === 0) return { dates };
  const result = spawnSync("git", ["-C", root, "log", "--format=%x00%ad", "--date=short", "--name-only", "--relative", "-z", "--no-renames", "--", ...paths.map((path) => `:(literal)${path}`)], {
    encoding: "utf8", timeout: 10_000, maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_NO_LAZY_FETCH: "1", LC_ALL: "C" },
  });
  if (result.status !== 0 || result.error) {
    if (result.stderr?.includes("not a git repository")) return { dates };
    const reason = (result.error as NodeJS.ErrnoException | undefined)?.code ?? `git 종료 ${result.status}`;
    return { dates, note: `stale 날짜 검사를 건너뜀: ${reason} — git 이력 확인 실패; missing 검사는 수행` };
  }
  const pending = new Set(paths);
  // A commit begins with a NUL, a date, a NUL, then its NUL-separated paths.
  for (const record of result.stdout.replace(/^\0/, "").split("\0\0")) {
    const [date, ...names] = record.split("\0");
    if (!date || !DATE.test(date)) continue;
    if (names[0]?.startsWith("\n")) names[0] = names[0].slice(1);
    for (const path of pending) {
      if (names.some((name) => name === path || name.startsWith(`${path}/`))) {
        dates.set(path, date);
        pending.delete(path);
      }
    }
    if (pending.size === 0) break;
  }
  return { dates };
}

// ── lint ─────────────────────────────────────────────────────────────

export type LintKind =
  | "structure_missing"
  | "frontmatter_invalid"
  | "broken_link"
  | "speculative"
  | "orphan"
  | "missing_link"
  | "unsourced"
  | "summary_missing"
  | "stale"
  | "stale-source";

export interface LintIssue {
  kind: LintKind;
  severity: "error" | "warn";
  page: string;
  detail: string;
}

const ERROR_KINDS = new Set<LintKind>(["structure_missing", "frontmatter_invalid", "broken_link", "speculative"]);

export function lintBrain(projectRoot: string, options: { fix?: boolean } = {}): { issues: LintIssue[]; fixed: string[]; notes: string[] } {
  const dir = brainDir(projectRoot);
  const issues: LintIssue[] = [];
  const push = (kind: LintKind, page: string, detail: string) =>
    issues.push({ kind, severity: ERROR_KINDS.has(kind) ? "error" : "warn", page, detail });

  for (const required of ["SCHEMA.md", "pages"]) {
    if (!existsSync(join(dir, required))) push("structure_missing", ".pace/brain", `${required} 없음 — pace brain init`);
  }
  const pages = listPages(projectRoot);
  const fixed: string[] = [];
  if (options.fix) {
    for (const page of pages) if (fixBlockLists(page)) fixed.push(rel(projectRoot, page));
  }
  const current = options.fix && fixed.length > 0 ? listPages(projectRoot) : pages;
  const files = new Set(current.map((p) => p.file));
  const titles = current.map((page) => normalize(page.title));
  const pageLinks = current.map((page) => linksOf(page));
  const inbound = new Map<string, number>();
  const { dates: authorDates, note } = sourceAuthorDates(projectRoot, [...new Set(current.flatMap((page) => sourcePaths(page.sources)))]);

  for (const [index, page] of current.entries()) {
    const id = rel(projectRoot, page);
    lintPage(projectRoot, page, files, pageLinks[index]!, authorDates, push);
    for (const target of pageLinks[index]!) {
      if (files.has(target) && target !== page.file) inbound.set(target, (inbound.get(target) ?? 0) + 1);
    }
    // 빠진 링크: 다른 페이지 제목이 본문에 나오는데 링크가 없다.
    const links = new Set(pageLinks[index]);
    const body = normalize(page.body);
    for (const [otherIndex, other] of current.entries()) {
      const title = titles[otherIndex]!;
      if (other.file === page.file || links.has(other.file) || title.length < 4) continue;
      if (body.includes(title)) {
        push("missing_link", id, `본문에 "${other.title}"이 나오지만 [[${other.file}]] 링크가 없다`);
      }
    }
  }
  if (current.length > 1) {
    for (const [index, page] of current.entries()) {
      const outbound = pageLinks[index]!.filter((t) => t !== page.file && files.has(t)).length;
      if ((inbound.get(page.file) ?? 0) === 0 && outbound === 0) {
        push("orphan", rel(projectRoot, page), "들어오는·나가는 링크가 없다 — related나 [[링크]]로 연결");
      }
    }
  }
  return { issues, fixed, notes: note ? [note] : [] };
}

function lintPage(root: string, page: BrainPage, files: Set<string>, links: string[], dates: Map<string, string>, push: (kind: LintKind, page: string, detail: string) => void): void {
  const id = rel(root, page);
  for (const message of checkPage(page)) push(message.kind, id, message.detail);
  for (const target of links) if (!files.has(target)) push("broken_link", id, `[[${target}]] 또는 related의 대상 페이지가 없다`);
  if (!page.hasSummary) push("summary_missing", id, "summary가 없어 본문 첫 문단으로 대신한다 — pace brain update --summary로 한 줄 요약");
  if (page.sources.length === 0) push("unsourced", id, "sources가 비었다 — 근거(코드·문서·URL·대화)와 날짜를 남긴다");
  if (page.status === "stale") push("stale", id, "낡음 표시 — 고치거나 지울지 판단");
  for (const path of sourcePaths(page.sources)) {
    if (!existsSync(join(root, path))) push("stale-source", id, `missing: ${path} — 근거 파일이 없다; 주장을 확인한다`);
    else if (DATE.test(page.updated)) {
      const date = dates.get(path);
      if (date && date > page.updated) push("stale-source", id, `changed: ${path} (${date} > ${page.updated}) — 근거 변경 뒤 주장을 확인한다`);
    }
  }
}

export function formatLint(result: { issues: LintIssue[]; fixed: string[]; notes?: string[] }): string {
  const errors = result.issues.filter((i) => i.severity === "error");
  const warns = result.issues.filter((i) => i.severity === "warn");
  const lines = [`lint: 오류 ${errors.length} · 경고 ${warns.length}${result.fixed.length > 0 ? ` · 고침 ${result.fixed.length}` : ""}`];
  for (const i of [...errors, ...warns]) lines.push(`${i.severity === "error" ? "✗" : "△"} [${i.kind}] ${i.page} — ${i.detail}`);
  for (const f of result.fixed) lines.push(`✓ [fixed] ${f} — 블록 목록을 인라인으로`);
  for (const note of result.notes ?? []) lines.push(`ℹ ${note}`);
  return lines.join("\n");
}

function checkPage(page: BrainPage): { kind: LintKind; detail: string }[] {
  const out: { kind: LintKind; detail: string }[] = [];
  const missing = REQUIRED_KEYS.filter((k) => !getString(page.data, k));
  if (missing.length > 0) out.push({ kind: "frontmatter_invalid", detail: `필수 키 없음: ${missing.join(", ")}` });
  if (page.data.type && page.type !== page.folder) out.push({ kind: "frontmatter_invalid", detail: `type(${page.type})과 폴더(${page.folder})가 다르다` });
  for (const key of ["created", "updated"] as const) {
    const v = getString(page.data, key);
    if (v && !DATE.test(v)) out.push({ kind: "frontmatter_invalid", detail: `${key}는 YYYY-MM-DD: "${v}"` });
  }
  if (page.data.status && !(PAGE_STATUSES as readonly string[]).includes(page.status)) {
    out.push({ kind: "frontmatter_invalid", detail: `status는 ${PAGE_STATUSES.join(" | ")}: "${page.status}"` });
  }
  for (const key of ["tags", "sources", "related"]) {
    if (typeof page.data[key] === "string") out.push({ kind: "frontmatter_invalid", detail: `${key}는 목록이어야 한다 ([a, b])` });
  }
  const markers = speculativeMarkers(page.title, page.body);
  if (markers.length > 0 && getString(page.data, "speculative_override") !== "true") {
    out.push({ kind: "speculative", detail: `아직 실재하지 않는 지식의 표지: ${markers.join(", ")} — 할 일은 메모리(todo·idea)로` });
  }
  return out;
}

export function speculativeMarkers(title: string, body: string): string[] {
  const targets = [title, ...body.split("\n").filter((l) => l.trimStart().startsWith("#"))].map(normalize);
  return SPECULATIVE_MARKERS.filter((m) => targets.some((t) => t.includes(m)));
}

function linksOf(page: BrainPage): string[] {
  const inline = [...page.body.matchAll(/\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g)].map((m) => m[1]!.trim()).filter((t) => !t.startsWith("source:"));
  return [...new Set([...inline, ...page.related])];
}

/** v1 브레인의 블록 목록(`tags:\n- a`)을 인라인(`tags: [a]`)으로 바꾼다. 내용은 바꾸지 않는다. */
function fixBlockLists(page: BrainPage): boolean {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(page.raw)?.[1] ?? "";
  if (!/^[A-Za-z_][\w-]*:\s*\n\s*-\s/m.test(fm)) return false;
  writeFileAtomic(page.path, stringifyFrontmatter(page.data, page.body.startsWith("\n") ? page.body : `\n${page.body}`));
  return true;
}

// ── ingest: add · update (쓰기 전 검사, 쓴 뒤 lint·목차·기록) ─────────

export interface PageInput {
  type: string;
  title: string;
  summary: string;
  body: string;
  tags?: string[];
  sources?: string[];
  related?: string[];
  file?: string;
  status?: string;
}

export interface WriteResult {
  page: string;
  lint: { issues: LintIssue[]; fixed: string[]; notes?: string[] };
}

export function addPage(projectRoot: string, input: PageInput, gate: { force?: boolean; note?: string } = {}): WriteResult {
  requireBrain(projectRoot);
  const file = input.file ?? slugify(input.title);
  const path = join(brainDir(projectRoot), "pages", input.type, `${file}.md`);
  if (existsSync(path)) throw new Error(`이미 있는 페이지: ${input.type}/${file} — pace brain update로 고친다`);
  const data: Record<string, string | string[]> = {
    type: input.type,
    title: input.title,
    summary: input.summary,
    tags: input.tags ?? [],
    sources: input.sources ?? [],
    related: input.related ?? [],
    created: today(),
    updated: today(),
    status: input.status ?? "active",
  };
  return writeChecked(projectRoot, path, data, input.body, "add", gate);
}

export function updatePage(
  projectRoot: string,
  pageRef: string,
  patch: Partial<Omit<PageInput, "type" | "file">> & { appendSources?: string[] },
  gate: { force?: boolean; note?: string } = {},
): WriteResult {
  requireBrain(projectRoot);
  const pages = listPages(projectRoot);
  const page = findPageIn(pages, pageRef);
  const data: Record<string, string | string[]> = { ...page.data };
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.summary !== undefined) data.summary = patch.summary;
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.tags !== undefined) data.tags = patch.tags;
  if (patch.related !== undefined) data.related = patch.related;
  if (patch.sources !== undefined) data.sources = patch.sources;
  if (patch.appendSources) data.sources = [...new Set([...getList(data, "sources"), ...patch.appendSources])];
  if (!getString(data, "created")) data.created = today();
  data.updated = today();
  return writeChecked(projectRoot, page.path, data, patch.body ?? page.body, "update", gate, pages);
}

function writeChecked(
  projectRoot: string,
  path: string,
  data: Record<string, string | string[]>,
  body: string,
  op: "add" | "update",
  gate: { force?: boolean; note?: string },
  snapshot = listPages(projectRoot),
): WriteResult {
  const folder = basename(dirname(path));
  if (!(PAGE_TYPES as readonly string[]).includes(String(data.type)) && !existsSync(dirname(path))) {
    throw new Error(`type은 ${PAGE_TYPES.join(" | ")} 중 하나: "${data.type}"`);
  }
  if (gate.force) {
    if (!gate.note) throw new Error("--force는 --note <사유>와 함께만 쓸 수 있다");
    data.speculative_override = "true";
    data.override_note = gate.note;
  }
  const text = stringifyFrontmatter(data, body.startsWith("\n") ? body : `\n${body.trim()}\n`);
  // 쓰기 전에 이 페이지만 검사한다. 오류가 있으면 쓰지 않는다.
  const draft: BrainPage = { ...parsePageText(path, folder, text) };
  const problems = checkPage(draft);
  const files = new Set(snapshot.map((p) => p.file).concat(draft.file));
  for (const target of linksOf(draft)) {
    if (!files.has(target)) problems.push({ kind: "broken_link", detail: `[[${target}]]의 대상 페이지가 없다` });
  }
  if (problems.length > 0) {
    throw new Error(`쓰지 않았다 — 페이지 검사 실패:\n${problems.map((p) => `  ✗ [${p.kind}] ${p.detail}`).join("\n")}`);
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileAtomic(path, text);
  const id = portableRelative(projectRoot, path);
  appendLog(projectRoot, op === "add" ? "ingest" : "update", `${String(data.title)} (${id})`);
  const pages = [...snapshot.filter((page) => page.path !== path), draft].sort((a, b) =>
    a.folder < b.folder ? -1 : a.folder > b.folder ? 1 : `${a.file}.md` < `${b.file}.md` ? -1 : `${a.file}.md` > `${b.file}.md` ? 1 : 0);
  const lint = lintWrite(projectRoot, snapshot, pages, draft);
  rebuildBrainIndex(projectRoot, pages);
  return { page: id, lint };
}

/** 쓰기로 영향을 받은 이슈만 전체 lint와 같은 규칙·순서로 계산한다. */
function lintWrite(root: string, before: BrainPage[], pages: BrainPage[], draft: BrainPage): { issues: LintIssue[]; fixed: string[]; notes: string[] } {
  const issues: LintIssue[] = [];
  const push = (kind: LintKind, page: string, detail: string) =>
    issues.push({ kind, severity: ERROR_KINDS.has(kind) ? "error" : "warn", page, detail });
  const files = new Set(pages.map((page) => page.file));
  const links = new Map(pages.map((page) => [page.path, linksOf(page)]));
  const { dates, note } = sourceAuthorDates(root, sourcePaths(draft.sources));
  const title = normalize(draft.title);
  const body = normalize(draft.body);
  const draftLinks = new Set(links.get(draft.path));
  for (const page of pages) {
    const id = rel(root, page);
    if (page.path === draft.path) {
      lintPage(root, page, files, links.get(page.path)!, dates, push);
      for (const other of pages) {
        const otherTitle = normalize(other.title);
        if (other.file !== page.file && !draftLinks.has(other.file) && otherTitle.length >= 4 && body.includes(otherTitle)) {
          push("missing_link", id, `본문에 "${other.title}"이 나오지만 [[${other.file}]] 링크가 없다`);
        }
      }
    } else if (page.file !== draft.file && title.length >= 4 && !links.get(page.path)!.includes(draft.file) && normalize(page.body).includes(title)) {
      push("missing_link", id, `본문에 "${draft.title}"이 나오지만 [[${draft.file}]] 링크가 없다`);
    }
  }
  const oldOrphans = orphanPaths(before);
  const newOrphans = orphanPaths(pages, links);
  for (const page of pages) {
    if (newOrphans.has(page.path) && (page.path === draft.path || !oldOrphans.has(page.path))) {
      push("orphan", rel(root, page), "들어오는·나가는 링크가 없다 — related나 [[링크]]로 연결");
    }
  }
  return { issues, fixed: [], notes: note ? [note] : [] };
}

function orphanPaths(pages: BrainPage[], links = new Map(pages.map((page) => [page.path, linksOf(page)]))): Set<string> {
  if (pages.length <= 1) return new Set();
  const files = new Set(pages.map((page) => page.file));
  const inbound = new Set<string>();
  for (const page of pages) for (const target of links.get(page.path)!) {
    if (target !== page.file && files.has(target)) inbound.add(target);
  }
  return new Set(pages.filter((page) => !inbound.has(page.file) && !links.get(page.path)!.some((target) => target !== page.file && files.has(target))).map((page) => page.path));
}

function parsePageText(path: string, folder: string, raw: string): BrainPage {
  const { data, body } = parseFrontmatter(raw);
  const summary = getString(data, "summary");
  return {
    path,
    file: basename(path, ".md"),
    folder,
    type: getString(data, "type", folder),
    title: getString(data, "title"),
    summary: summary || firstParagraph(body),
    hasSummary: summary.length > 0,
    tags: getList(data, "tags"),
    sources: getList(data, "sources"),
    related: getList(data, "related"),
    created: getString(data, "created"),
    updated: getString(data, "updated"),
    status: getString(data, "status", "active"),
    data,
    raw,
    body,
  };
}

export function findPage(projectRoot: string, ref: string): BrainPage {
  return findPageIn(listPages(projectRoot), ref);
}

function findPageIn(pages: BrainPage[], ref: string): BrainPage {
  const name = ref.replace(/^.*pages\//, "").replace(/\.md$/, "");
  const exact = pages.find((p) => `${p.folder}/${p.file}` === name || p.file === name);
  if (!exact) throw new Error(`없는 페이지: ${ref}`);
  return exact;
}

function requireBrain(projectRoot: string): void {
  if (!existsSync(join(brainDir(projectRoot), "SCHEMA.md"))) throw new Error("브레인이 없다 — pace brain init");
}

// ── log · ingest-scan ────────────────────────────────────────────────

/** v1과 같은 형식의 추가 전용 기록: `## [YYYY-MM-DD] op | 요약` */
export function appendLog(projectRoot: string, op: string, summary: string): void {
  const path = join(brainDir(projectRoot), "log.md");
  if (!existsSync(path)) writeFileAtomic(path, "# 브레인 기록\n\n> 추가 전용 — pace brain이 남긴다.\n\n");
  const line = summary.replace(/\s*[\r\n]+\s*/g, " ");
  appendFileSync(path, `## [${today()}] ${op} | ${line}\n`, "utf8");
}

export interface IngestCandidate {
  kind: "doc" | "skill" | "backlog";
  path: string;
  done: boolean;
}

/** 브레인에 아직 담지 않은 문서 후보. 페이지 sources에 경로가 있으면 이미 담은 것으로 본다(v1 ingest-scan과 같은 멱등 판정). */
export function ingestScan(projectRoot: string, source: "docs" | "skills" | "backlogs" | "all" = "all"): IngestCandidate[] {
  const sources = listPages(projectRoot).flatMap((p) => p.sources).join("\n");
  const out: IngestCandidate[] = [];
  const add = (kind: IngestCandidate["kind"], abs: string) => {
    const path = portableRelative(projectRoot, abs);
    out.push({ kind, path, done: sources.includes(path) });
  };
  if (source === "docs" || source === "all") for (const f of walk(join(projectRoot, "docs"), (n) => n.endsWith(".md"))) add("doc", f);
  if (source === "skills" || source === "all") for (const f of walk(join(projectRoot, "skills"), (n) => n === "SKILL.md")) add("skill", f);
  if (source === "backlogs" || source === "all") for (const f of walk(join(projectRoot, "backlogs"), (n) => (n === "BACKLOG.md" || /^BR\d{2}_.+\.md$/.test(n)))) add("backlog", f);
  return out;
}

function walk(dir: string, match: (name: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith(".") || name === "node_modules" || name === "backup") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path, match));
    else if (match(name)) out.push(path);
  }
  return out;
}

// ── 도우미 ───────────────────────────────────────────────────────────

export function relativePagePath(projectRoot: string, page: BrainPage): string {
  return rel(projectRoot, page);
}

function rel(projectRoot: string, page: BrainPage): string {
  return portableRelative(projectRoot, page.path);
}

function portableRelative(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

function count(text: string, term: string): number {
  let n = 0;
  for (let i = text.indexOf(term); i !== -1; i = text.indexOf(term, i + term.length)) n++;
  return n;
}

function firstParagraph(body: string): string {
  // 제목·표·코드 줄을 빼고 남은 첫 문단 (제목 바로 아래 붙은 문단도 잡는다).
  const para = body
    .split("\n")
    .map((l) => (/^\s*(#|\||```)/.test(l) ? "" : l))
    .join("\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) => p.length > 0);
  const line = (para ?? "").replace(/\s+/g, " ");
  return line.length > 100 ? `${line.slice(0, 99)}…` : line;
}
