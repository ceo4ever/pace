import { appendFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { getString, parseFrontmatter, stringifyFrontmatter } from "../core/frontmatter.ts";
import { slugify, today, writeFileAtomic } from "../core/fsutil.ts";
import { hasSecret, redactSecrets } from "../project/secrets.ts";

/**
 * 메모리 저장소. 한 파일에 한 항목, 목차·이력은 파일 목록에서 만든다.
 * 프로필 메모리(사용자·개인 규칙·개인 할 일)와 프로젝트 메모리(진행 상황·규칙·이슈·할 일·메모·아이디어)가 같은 코드를 쓴다.
 */
export type Scope = "profile" | "project";

/** 부트 때 보여 주는 방식: brief=굵은 제목+요약(본문은 show) · open=열린 항목 목록 · index=제목만 · count=개수만 · status=본문만 */
type BootMode = "brief" | "open" | "index" | "count" | "status";

interface TypeSpec {
  type: string;
  title: string;
  boot: BootMode;
  /** done으로 닫고 이력에 남기는 종류 */
  completable: boolean;
}

const SCHEMES: Record<Scope, TypeSpec[]> = {
  profile: [
    { type: "user", title: "사용자", boot: "index", completable: false },
    { type: "rule", title: "지킬 것 · 하지 말 것", boot: "brief", completable: false },
    { type: "todo", title: "할 일", boot: "open", completable: true },
  ],
  project: [
    { type: "status", title: "진행 상황", boot: "status", completable: false },
    { type: "rule", title: "지킬 것 · 하지 말 것", boot: "brief", completable: false },
    { type: "issue", title: "열린 이슈", boot: "open", completable: true },
    { type: "todo", title: "할 일", boot: "open", completable: true },
    { type: "note", title: "메모 (사실·결정)", boot: "index", completable: false },
    { type: "idea", title: "개선 아이디어", boot: "count", completable: true },
  ],
};

const INDEX_FILE = "INDEX.md";
const HISTORY_FILE = "history.md";
const STATUS_SLUG = "status";
/** 이 날수보다 오래 열린 이슈·할 일은 부트 때 표시한다. */
export const STALE_DAYS = 14;
/** 규칙이 이만큼 넘으면 AGENTS.md로 졸업·병합을 제안한다. */
export const RULE_LIMIT = 15;
/** 부트를 줄일 때 진행 상황 본문을 이 글자 수까지만 보인다. */
const STATUS_SHRINK = 600;

export interface MemoryEntry {
  slug: string;
  name: string;
  description: string;
  type: string;
  created: string;
  updated: string;
  due?: string;
  body: string;
}

export interface MemoryInput {
  name: string;
  description: string;
  type: string;
  due?: string;
  body?: string;
}

export function memoryTypes(scope: Scope): string[] {
  return SCHEMES[scope].map((s) => s.type);
}

export function assertMemoryType(scope: Scope, type: string): string {
  if (!memoryTypes(scope).includes(type)) {
    throw new Error(`${scope === "project" ? "프로젝트" : "프로필"} 메모리 type은 ${memoryTypes(scope).join(" | ")} 중 하나: "${type}"`);
  }
  return type;
}

export function profileMemoryDir(profileDir: string): string {
  return join(profileDir, "memory");
}

export function projectMemoryDir(projectRoot: string): string {
  return join(projectRoot, ".pace", "memory");
}

/** 요약·본문 길이 한도(글자). 진행 상황(status)은 인계 메모라 제외. */
export const MEMORY_LIMITS = { description: 160, body: 400 } as const;

export interface GuardOptions {
  /** 가드 위반이어도 저장한다(사용자가 예외를 확인했을 때, v1 전환처럼 옮겨 오는 내용). */
  force?: boolean;
}

type GuardFields = Partial<Pick<MemoryEntry, "name" | "description" | "body">> & { type: string };

const VOLATILE: { pattern: RegExp; label: string }[] = [
  // 실제 핸들은 16진수(term_754cb9c5-…) — term_project 같은 낱말은 아니다.
  { pattern: /\bterm_[0-9a-f]{6,}(?:-[0-9a-f]+)*(?![\w-])/i, label: "터미널 핸들(term_…)" },
  { pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i, label: "UUID" },
  { pattern: /(?<![0-9a-f])[0-9a-f]{40}(?![0-9a-f])/i, label: "40자 해시" },
];

// 앞 경계는 ASCII만 — 한글에 붙은 번호(프로젝트P013)도 잡는다. 제품명(P100)은 오탐으로 남는다.
const PROJECT_SCOPED: { pattern: RegExp; label: string }[] = [
  { pattern: /(?<![A-Za-z0-9_])P\d{3}(?!\d)/, label: "프로젝트 번호(P###)" },
  { pattern: /(?<![A-Za-z0-9_])BL\d{6}(?!\d)/, label: "백로그 번호(BL######)" },
  { pattern: /(?<![A-Za-z0-9_])BR\d{2}(?!\d)/, label: "브리프 번호(BR##)" },
  // 확장자는 글자로 시작 — 시각(10.30:15)·버전(v24.1:2)·IP(127.0.0.1:8080)는 아니다. 호스트:포트(proxy.corp.com:8080)는 오탐으로 남는다.
  // ~/·../·/·.pace/ 같은 앞부분도 경로로 본다.
  { pattern: /(?<![\w./~-])(?:~|\.{1,2})?\/?(?:\.?[\w-]+\/)*\.?[\w-]+(?:\.[\w-]+)*\.[a-z][a-z0-9]{0,5}:\d+/i, label: "파일 위치(file:line)" },
];
/** 정규식 검사에 넘길 최대 길이 — 긴 입력은 길이 위반으로 따로 보고되고, 검사 시간을 묶는다. */
const SCAN_LIMIT = 2000;

/** 비교용 정규화: 글자·숫자만, 소문자. */
function normalize(text: string): string {
  return text.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/** 글자 bigram 다이스 계수(0~1). */
function similarity(a: string, b: string): number {
  const grams = (t: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < t.length - 1; i++) m.set(t.slice(i, i + 2), (m.get(t.slice(i, i + 2)) ?? 0) + 1);
    return m;
  };
  const ga = grams(a);
  const gb = grams(b);
  let common = 0;
  for (const [g, n] of ga) common += Math.min(n, gb.get(g) ?? 0);
  const total = Math.max(0, a.length - 1) + Math.max(0, b.length - 1);
  return total === 0 ? 0 : (2 * common) / total;
}

/** 요약이 "거의 같다": 정규화가 같거나, 둘 다 12자 이상이고 유사도 0.85 이상. */
function nearlySame(a: string, b: string): boolean {
  const x = normalize(a);
  const y = normalize(b);
  if (x.length === 0 || y.length === 0) return false;
  return x === y || (Math.min(x.length, y.length) >= 12 && similarity(x, y) >= 0.85);
}

/**
 * 메모리 쓰기 원칙 검사(RULES·pace-memory 스킬과 같은 기준). 주어진 필드만 본다 — update는 바꾸는 필드만,
 * 기존 항목은 소급 검사하지 않는다. 위반마다 "이유 → 고칠 방법" 한 줄.
 */
export function memoryProblems(dir: string, scope: Scope, fields: GuardFields, selfSlug?: string): string[] {
  if (fields.type === STATUS_SLUG) return [];
  const problems: string[] = [];
  const flag = scope === "project" ? " --project" : "";
  const texts = [fields.name, fields.description, fields.body].filter((t): t is string => typeof t === "string").map((t) => t.slice(0, SCAN_LIMIT));
  for (const { pattern, label } of VOLATILE) {
    const hit = texts.map((t) => pattern.exec(t)?.[0]).find(Boolean);
    if (hit) problems.push(`가변값 — ${label} "${hit}" → 값은 빼고 변하지 않는 사실만 적는다`);
  }
  if (scope === "profile") {
    for (const { pattern, label } of PROJECT_SCOPED) {
      const hit = texts.map((t) => pattern.exec(t)?.[0]).find(Boolean);
      if (hit) problems.push(`범위 — 프로필에 프로젝트 범위 내용 ${label} "${hit}" → 이 프로젝트 한정이면 --project로, 개인 습관이면 번호·경로 없이`);
    }
  }
  if (fields.description !== undefined && fields.description.length > MEMORY_LIMITS.description) {
    problems.push(`길이 — 요약 ${fields.description.length}자 > ${MEMORY_LIMITS.description} → 행동 지시형 한 줄로 줄인다`);
  }
  if (fields.body !== undefined && fields.body.trim().length > MEMORY_LIMITS.body) {
    problems.push(`길이 — 본문 ${fields.body.trim().length}자 > ${MEMORY_LIMITS.body} → 왜·어떻게만 남기고 긴 설명은 브레인으로`);
  }
  if (fields.name !== undefined || fields.description !== undefined) {
    for (const other of listMemories(dir)) {
      if (other.slug === selfSlug || other.type !== fields.type) continue;
      const sameName = fields.name !== undefined && normalize(fields.name) !== "" && normalize(fields.name) === normalize(other.name);
      const sameDescription = fields.description !== undefined && nearlySame(fields.description, other.description);
      if (sameName || sameDescription) {
        problems.push(`중복 — 같은 ${fields.type}에 ${sameName ? "제목이 같은" : "요약이 거의 같은"} 기억 [${other.slug}] → 새로 만들지 말고 \`pace memory update ${other.slug}${flag}\``);
      }
    }
  }
  return problems;
}

/** 목차·이력 파일과 같은 이름 — 대소문자를 무시하는 파일 시스템(macOS·Windows)에서 index는 INDEX.md에 닿는다. */
const RESERVED_SLUGS = new Set([INDEX_FILE.slice(0, -3).toLowerCase(), HISTORY_FILE.slice(0, -3)]);

/** 대소문자 무시 파일 시스템은 유니코드 대소문자 접기로 이름을 맞춘다(ſ → s) — 접은 형태로도 예약어를 본다. */
export function isReservedSlug(slug: string): boolean {
  const folded = slug.toUpperCase().toLowerCase();
  // status는 그 이름 그대로만 진행 상황이다 — 접어서 status가 되는 다른 이름(ſtatus)은 막는다.
  return RESERVED_SLUGS.has(slug) || RESERVED_SLUGS.has(folded) || (folded === STATUS_SLUG && slug !== STATUS_SLUG);
}

/** 심볼릭 링크·폴더가 아닌 일반 파일만 — 저장소에 커밋된 링크로 메모리 폴더 밖을 읽거나 쓰지 않게 한다. */
function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

function isRegularFile(path: string): boolean {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * slug에 해당하는 실제 파일 이름. 이름을 NFC로 맞춘 뒤 정확히 같은 것만 — 대소문자를 무시하는 파일 시스템에서 접기(ſ→s)로
 * 다른 파일에 닿지 않게 하고, 다른 도구가 NFD로 저장한 한글 파일 이름은 그대로 찾는다.
 */
function entryFile(dir: string, slug: string): string | null {
  if (!existsSync(dir)) return null;
  const want = `${slug}.md`;
  return readdirSync(dir).find((name) => name.normalize("NFC") === want) ?? null;
}

const DUE = /^\d{4}-\d{2}-\d{2}$/;

function assertDue(due: string | undefined): void {
  if (due !== undefined && !DUE.test(due)) throw new Error("마감(--due)은 YYYY-MM-DD 형식이다");
}

/** slug로 경로를 만들기 전에 확인한다: slugify 결과 그대로(경로 구분자·`..`·대문자 없음)이고 예약어가 아니어야 한다. */
export function assertSlug(slug: string): string {
  let normal: string | null = null;
  try {
    normal = slugify(slug);
  } catch {
    normal = null;
  }
  if (normal !== slug || isReservedSlug(slug)) {
    throw new Error(`잘못된 slug "${redactSecrets(slug).slice(0, 80)}" — 메모리 폴더 안 항목 이름만 받는다(pace memory list로 확인)`);
  }
  return slug;
}

const FIELD_LABELS: Record<string, string> = { name: "제목", description: "요약", body: "본문", result: "결과" };

/** 비밀(키·토큰)은 --force로도 저장하지 않는다 — 프로젝트 메모리는 커밋되고 매 세션 부트에 주입된다. 값은 메시지에 싣지 않는다. */
function assertNoSecret(fields: Record<string, string | undefined>): void {
  const hits = Object.entries(fields)
    .filter(([, v]) => typeof v === "string" && hasSecret(v))
    .map(([k]) => FIELD_LABELS[k] ?? k);
  if (hits.length === 0) return;
  throw new Error(`기억을 저장하지 않았다: 비밀로 보이는 값(${hits.join("·")}) → 키·토큰은 빼고 보관 위치(환경 변수 이름 등)만 적는다. --force로도 저장하지 않는다`);
}

function assertGuard(problems: string[], options: GuardOptions): void {
  if (problems.length === 0 || options.force) return;
  throw new Error(`기억을 저장하지 않았다(메모리 쓰기 원칙):\n${problems.map((p) => `- ${p}`).join("\n")}\n정말 예외면 --force`);
}

export function addMemory(dir: string, scope: Scope, input: MemoryInput, options: GuardOptions = {}): MemoryEntry {
  const type = assertMemoryType(scope, input.type);
  assertNoSecret({ name: input.name, description: input.description, body: input.body });
  assertDue(input.due);
  if (type === STATUS_SLUG) return setStatus(dir, input.body ?? input.description, input.description);
  const slug = slugify(input.name);
  if (isReservedSlug(slug)) throw new Error(`예약된 이름: "${input.name}" — 목차·이력·진행 상황 파일과 겹친다. 다른 제목으로`);
  const path = join(dir, `${slug}.md`);
  if (existsSync(path) || slug === STATUS_SLUG) throw new Error(`이미 있는 기억: ${slug} — 고치려면 \`pace memory update ${slug}\``);
  assertGuard(memoryProblems(dir, scope, { type, name: input.name, description: input.description, body: input.body }), options);
  const entry: MemoryEntry = {
    slug,
    name: input.name,
    description: input.description,
    type,
    created: today(),
    updated: today(),
    ...(input.due ? { due: input.due } : {}),
    body: input.body?.trim() ?? "",
  };
  writeEntry(dir, entry);
  rebuildMemoryIndex(dir, scope);
  return entry;
}

/** 진행 상황은 프로젝트에 하나 — 있으면 덮어쓴다. */
export function setStatus(dir: string, body: string, description = "어디까지 했나 · 다음 할 일 · 막힌 것"): MemoryEntry {
  assertNoSecret({ description, body });
  const path = join(dir, `${STATUS_SLUG}.md`);
  // 링크면 따라가 읽지 않는다 — 폴더 밖 파일의 값이 들어오지 않게. 쓰기는 rename이라 링크 자체를 바꾼다.
  const created = isRegularFile(path) ? parseEntry(STATUS_SLUG, readFileSync(path, "utf8")).created : today();
  const entry: MemoryEntry = {
    slug: STATUS_SLUG,
    name: "진행 상황",
    description,
    type: STATUS_SLUG,
    created,
    updated: today(),
    body: body.trim(),
  };
  writeEntry(dir, entry);
  rebuildMemoryIndex(dir, "project");
  return entry;
}

export function updateMemory(
  dir: string,
  scope: Scope,
  slug: string,
  patch: Partial<Pick<MemoryEntry, "name" | "description" | "type" | "due" | "body">>,
  options: GuardOptions = {},
): MemoryEntry {
  const current = readMemory(dir, slug);
  assertNoSecret({ name: patch.name, description: patch.description, body: patch.body });
  assertDue(patch.due);
  const next: MemoryEntry = {
    ...current,
    ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
    updated: today(),
  };
  assertMemoryType(scope, next.type);
  // 바꾸는 필드만 검사한다. 종류를 바꾸면 그 종류 안의 중복을 보도록 제목·요약도 함께 본다.
  const retyped = patch.type !== undefined && patch.type !== current.type;
  assertGuard(
    memoryProblems(
      dir,
      scope,
      {
        type: next.type,
        name: patch.name ?? (retyped ? next.name : undefined),
        description: patch.description ?? (retyped ? next.description : undefined),
        body: patch.body,
      },
      slug,
    ),
    options,
  );
  writeEntry(dir, next, entryFile(dir, slug) ?? undefined);
  rebuildMemoryIndex(dir, scope);
  return next;
}

export function removeMemory(dir: string, scope: Scope, slug: string): void {
  assertSlug(slug);
  const file = entryFile(dir, slug);
  if (file === null) throw new Error(`없는 기억: ${slug}`);
  const path = join(dir, file);
  // 링크는 rmSync가 링크만 지우므로 허용한다(목록에 안 보이는 링크를 치울 수 있게). 폴더는 지우지 않는다.
  if (!isRegularFile(path) && !isSymlink(path)) throw new Error(`파일이 아닌 기억: ${slug} — 직접 확인한다`);
  rmSync(path);
  rebuildMemoryIndex(dir, scope);
}

/** 이슈·할 일·아이디어를 닫는다. 항목은 지우고 이력(history.md)에 한 줄 남긴다. */
export function completeMemory(dir: string, scope: Scope, slug: string, result = ""): MemoryEntry {
  const entry = readMemory(dir, slug);
  assertNoSecret({ result });
  const spec = SCHEMES[scope].find((s) => s.type === entry.type);
  if (!spec?.completable) {
    throw new Error(`닫을 수 없는 종류(${entry.type}): ${slug} — 이슈·할 일·아이디어만 done. 지우려면 pace memory remove`);
  }
  const line = `- ${today()} [${entry.type}] ${entry.name}${result ? ` — ${result.trim()}` : ""}\n`;
  const historyPath = join(dir, HISTORY_FILE);
  if (existsSync(historyPath) || isSymlink(historyPath)) {
    if (!isRegularFile(historyPath)) throw new Error(`${HISTORY_FILE}이 일반 파일이 아니다(심볼릭 링크 등) — 확인 후 지우고 다시`);
  } else {
    writeFileAtomic(historyPath, "# 완료 이력\n\n");
  }
  appendFileSync(historyPath, line, "utf8");
  removeMemory(dir, scope, slug);
  return entry;
}

export function readHistory(dir: string, n: number): string[] {
  const path = join(dir, HISTORY_FILE);
  if (!isRegularFile(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.startsWith("- "))
    .slice(-n)
    .reverse();
}

export function readMemory(dir: string, slug: string): MemoryEntry {
  assertSlug(slug);
  const file = entryFile(dir, slug);
  if (file === null) throw new Error(`없는 기억: ${slug}`);
  const path = join(dir, file);
  if (!isRegularFile(path)) throw new Error(`일반 파일이 아닌 기억(심볼릭 링크 등): ${slug} — 폴더 밖을 읽지 않는다. 지우려면 pace memory remove`);
  return parseEntry(slug, readFileSync(path, "utf8"));
}

export function listMemories(dir: string): MemoryEntry[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith(".md") && file !== INDEX_FILE && file !== HISTORY_FILE && !file.startsWith(".") && isRegularFile(join(dir, file)))
    .map((file) => parseEntry(file.slice(0, -3).normalize("NFC"), readFileSync(join(dir, file), "utf8")))
    .sort((a, b) => a.created.localeCompare(b.created) || a.slug.localeCompare(b.slug));
}

/** 목차는 항상 파일 목록에서 다시 만든다. 직접 고치지 않으므로 동시 세션이 써도 어긋나지 않는다. */
export function rebuildMemoryIndex(dir: string, scope: Scope): string {
  const entries = listMemories(dir);
  const sections = SCHEMES[scope].map((spec) => {
    const lines = entries.filter((e) => e.type === spec.type).map((e) => `- [${e.name}](${e.slug}.md) — ${e.description}${dueText(e)}`);
    return `## ${spec.title}\n\n${lines.length > 0 ? lines.join("\n") : "- (없음)"}`;
  });
  const content = `# 메모리 목차\n\n> 자동 생성 — 직접 고치지 말 것. 변경은 \`pace memory\` 명령.\n\n${sections.join("\n\n")}\n`;
  mkdirSync(dir, { recursive: true });
  writeFileAtomic(join(dir, INDEX_FILE), content);
  return content;
}

export interface BootView {
  text: string;
  counts: { rules: number; issues: number; todos: number; stale: number; hasStatus: boolean; empty: boolean };
}

export interface BootViewOptions {
  /** 목록형 절(brief·open·index)마다 앞에서 이만큼만 보이고 나머지는 "외 N건" 줄로 줄인다. 기본 무제한. */
  maxItems?: number;
}

/** 부트에 쓸 메모리 파일 내용(항목·최근 완료). 한 번 읽어 여러 번 렌더할 때 쓴다. */
export interface MemorySnapshot {
  entries: MemoryEntry[];
  history: string[];
}

export function readMemorySnapshot(dir: string): MemorySnapshot {
  return { entries: listMemories(dir), history: readHistory(dir, 3) };
}

/** 부트에 넣을 메모리 요약. 저장된 INDEX.md가 아니라 파일에서 매번 만든다. */
export function bootView(dir: string, scope: Scope, now: Date = new Date(), options: BootViewOptions = {}): BootView {
  return renderBootView(readMemorySnapshot(dir), scope, now, options);
}

export function renderBootView({ entries, history }: MemorySnapshot, scope: Scope, now: Date = new Date(), options: BootViewOptions = {}): BootView {
  const out: string[] = [];
  let stale = 0;
  const listCommand = `pace memory list${scope === "project" ? " --project" : ""}`;
  const limit = options.maxItems ?? Number.POSITIVE_INFINITY;
  const capped = (lines: string[]): string[] =>
    lines.length > limit ? [...lines.slice(0, limit), `- … 외 ${lines.length - limit}건 — \`${listCommand}\``] : lines;
  for (const spec of SCHEMES[scope]) {
    const items = entries.filter((e) => e.type === spec.type);
    if (items.length === 0) continue;
    switch (spec.boot) {
      case "status": {
        // 줄이는 중이면 진행 상황도 앞부분만 — 긴 인계 메모가 뒤의 RULES를 훅 한도 밖으로 밀지 않게.
        const text = items[0]?.body || items[0]?.description || "";
        const shown = options.maxItems !== undefined && text.length > STATUS_SHRINK ? shrinkStatus(text) : text;
        out.push(`### ${spec.title} (갱신 ${items[0]?.updated})`, shown);
        break;
      }
      case "brief":
        // 본문(왜·어떻게)은 부트 크기를 키우므로 넣지 않는다 — 필요할 때 pace memory show.
        out.push(`### ${spec.title}`, ...capped(items.map((e) => `- **${e.name}** — ${e.description}`)));
        if (items.length > RULE_LIMIT) out.push(`- (규칙 ${items.length}개 — ${RULE_LIMIT}개를 넘었다. AGENTS.md로 졸업하거나 합치자고 제안하라)`);
        break;
      case "open": {
        // ⚠ 오래된 것 먼저(첫 응답 지침과 같음) — 목록을 줄여도 "외 N건"에 묻히지 않게. 그다음 마감·생성 순.
        const isOld = (e: MemoryEntry) => daysSince(e.created, now) >= STALE_DAYS;
        const sorted = [...items].sort(
          (a, b) => Number(isOld(b)) - Number(isOld(a)) || (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.created.localeCompare(b.created),
        );
        out.push(
          `### ${spec.title}`,
          ...capped(
            sorted.map((e) => {
              const age = daysSince(e.created, now);
              const old = age >= STALE_DAYS;
              if (old) stale++;
              return `- ${e.name} [${e.slug}] — ${e.description}${dueText(e)} · ${age}일째${old ? " ⚠ 오래됨" : ""}`;
            }),
          ),
        );
        break;
      }
      case "index":
        out.push(`### ${spec.title}`, ...capped(items.map((e) => `- ${e.name} — ${e.description}`)));
        break;
      case "count":
        out.push(`### ${spec.title}: ${items.length}건 (${listCommand})`);
        break;
    }
  }
  if (history.length > 0) out.push("### 최근 완료", ...history);
  const count = (type: string) => entries.filter((e) => e.type === type).length;
  return {
    text: out.join("\n"),
    counts: {
      rules: count("rule"),
      issues: count("issue"),
      todos: count("todo"),
      stale,
      hasStatus: count("status") > 0,
      empty: entries.length === 0 && history.length === 0,
    },
  };
}

/** 진행 상황을 STATUS_SHRINK 글자로 자른다 — 코드 포인트 단위, 열린 코드 블록은 닫아 뒤 절이 블록 안처럼 보이지 않게. */
function shrinkStatus(text: string): string {
  let head = Array.from(text).slice(0, STATUS_SHRINK).join("");
  if ((head.match(/```/g)?.length ?? 0) % 2 === 1) head += "\n```";
  return `${head}… (전체: \`pace memory status --project\`)`;
}

function dueText(e: MemoryEntry): string {
  return e.due ? ` (마감 ${e.due})` : "";
}

function daysSince(date: string, now: Date): number {
  const t = Date.parse(`${date}T00:00:00`);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

/** file: 이미 있는 항목의 실제 파일 이름(NFD 등) — 없으면 slug로 만든다. */
function writeEntry(dir: string, entry: MemoryEntry, file = `${entry.slug}.md`): void {
  const data: Record<string, string> = {
    name: entry.name,
    description: entry.description,
    type: entry.type,
    created: entry.created,
    updated: entry.updated,
  };
  if (entry.due) data.due = entry.due;
  writeFileAtomic(join(dir, file), stringifyFrontmatter(data, `${entry.body}\n`));
}

function parseEntry(slug: string, text: string): MemoryEntry {
  const { data, body } = parseFrontmatter(text);
  return {
    slug,
    name: getString(data, "name", slug),
    description: getString(data, "description"),
    type: getString(data, "type", "note"),
    created: getString(data, "created"),
    updated: getString(data, "updated"),
    ...(getString(data, "due") ? { due: getString(data, "due") } : {}),
    body: body.trim(),
  };
}
