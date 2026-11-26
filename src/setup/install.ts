import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { writeFileAtomic } from "../core/fsutil.ts";
import { packageRoot } from "../core/paths.ts";
import { ensureRegistry } from "../project/workspace-registry.ts";

/**
 * 설치는 사용자 HOME 아래 각 LLM 도구 설정을 고친다. 테스트를 위해 HOME을 인자로 받는다.
 * 원칙: 다른 도구(Orca 등)의 항목은 건드리지 않는다 · 고치거나 치운 파일은 백업 폴더에 남긴다 · 여러 번 실행해도 결과가 같다.
 * 코드와 스킬은 링크가 아니라 복사한다 — 저장소에서 브랜치를 바꾸거나 고쳐도 설치본은 다음 설치 때까지 그대로다.
 */
export interface InstallOptions {
  home: string;
  /** 데이터 등록부 루트. 생략하면 HOME/.pace. */
  dataHome?: string;
  repo?: string;
  dryRun?: boolean;
  now?: Date;
  /** 테스트용. 기본은 process.platform. */
  platform?: NodeJS.Platform;
  /** 추가 Claude 설정 폴더(CLAUDE_CONFIG_DIR로 쓰는 계정별 폴더). 자동 발견한 것과 합친다. */
  claudeDirs?: string[];
  /** 추가 Codex 폴더(CODEX_HOME). 자동 발견한 것과 합친다. */
  codexDirs?: string[];
}

export interface Action {
  kind: "move" | "copy" | "edit" | "write" | "skip";
  path: string;
  detail: string;
}

const START = "# === PACE START ===";
const END = "# === PACE END ===";
const CODEX_START = "# >>> PACE developer_instructions >>>";
const CODEX_END = "# <<< PACE developer_instructions <<<";

/** 훅이 동작하지 않을 때를 위한 대체 규칙. 이미 부트됐으면 무시하게 한다. */
export function fallbackRule(bootBin: string, host: "plain" | "cursor" = "plain"): string {
  const command = host === "cursor" ? `${bootBin} boot --host cursor --text` : `${bootBin} boot --host plain`;
  if (host === "cursor") return [
    "PACE 에이전트 부트: 이 규칙의 표기 자체를 제외하고, 실제 부트 출력이 이미 이 세션에 없다면 첫 응답 전에",
    `현재 워크스페이스 루트에서 \`${command}\`을 한 번 실행하고 그 출력을 에이전트 정의로 따른다.`,
    "부트 출력은 `[PACE-BOOT] 프로필:` 또는 `[PACE-BOOT] PACE가 설치되어`로 시작한다.",
    "워크스페이스를 확인할 수 없거나 실행이 거절·실패하면 첫 응답에 PACE 부트가 확인되지 않았음을 알린다.",
  ].join("\n");
  return [
    "PACE 에이전트 부트: 이 규칙의 표기 자체를 제외하고, 실제 부트 출력이 이 세션에 없으면 첫 응답 전에",
    `\`${command}\`을 한 번 실행하고 그 출력을 이 세션의 에이전트 정의로 따른다.`,
    "부트 출력은 `[PACE-BOOT] 프로필:` 또는 `[PACE-BOOT] PACE가 설치되어`로 시작한다. 실제 부트 출력이 이미 있으면 이 지시는 무시한다.",
  ].join("\n");
}

/** 설치본(~/.pace/app)으로 복사하는 실행 부분. */
const APP_PARTS = ["bin", "src", "templates", "skills", "package.json"];
/** PACE가 복사한 스킬 폴더 표지. 재설치·제거는 이 표지가 있는 폴더만 바꾼다. */
const SKILL_MARKER = ".pace-managed";

export function install(options: InstallOptions): Action[] {
  const ctx = context(options);
  assertRegistrySeparation(ctx, options.dataHome ?? ctx.paceHome);
  ctx.bundles = readBundles(ctx.repo); // 묶음 해시 대조 — 어긋나면 아무것도 바꾸기 전에 멈춘다
  if (pathExists(ctx.paceBin)) {
    const info = lstatSync(ctx.paceBin);
    if (!info.isFile() || info.isSymbolicLink() || readFileSync(ctx.paceBin, "utf8") !== binaryText(ctx)) throw new Error("PACE 실행 파일 위치의 사용자 파일을 보존합니다");
  }
  validateAppTarget(ctx);
  if (!ctx.dryRun) ensureRegistry(options.dataHome ?? ctx.paceHome);
  copyApp(ctx);
  writeBinary(ctx);
  copySkills(ctx);
  installClaudeHook(ctx);
  installCodex(ctx);
  installGemini(ctx);
  installCursor(ctx);
  installAntigravity(ctx);
  if (!ctx.dryRun) {
    const record = {
      source: ctx.repo,
      app: ctx.appDir,
      installedAt: ctx.now.toISOString(),
      claudeDirs: ctx.claudeDirs,
      codexDirs: ctx.codexDirs,
      backupDir: ctx.backupUsed ? ctx.backupDir : null,
    };
    writeFileAtomic(join(ctx.paceHome, "install.json"), `${JSON.stringify(record, null, 2)}\n`);
  }
  return ctx.actions;
}

export function uninstall(options: InstallOptions): Action[] {
  const ctx = context(options);
  assertRegistrySeparation(ctx, options.dataHome ?? ctx.paceHome);
  const ours = (c: string) => isBootCommand(ctx, c);
  for (const dir of ctx.claudeDirs) editExistingJson(ctx, join(dir, "settings.json"), (s) =>
    removeHookGroups(s, (command) => ours(command) || command === claudeCallHookCommand(ctx)));
  for (const dir of ctx.codexDirs) editExistingJson(ctx, join(dir, "hooks.json"), (s) => removeHookGroups(s, ours));
  const geminiRootSafe = safeGeminiRoot(ctx);
  if (geminiRootSafe) editExistingJson(ctx, join(ctx.home, ".gemini", "settings.json"), (s) => removeHookGroups(s, ours));
  else ctx.actions.push({ kind: "skip", path: join(ctx.home, ".gemini"), detail: "Gemini 설정 경로가 링크여서 기존 설정·지침·스킬을 보존; 수동 확인" });
  if (safeCursorRoot(ctx)) editExistingJson(ctx, join(ctx.home, ".cursor", "hooks.json"), (s) => removeCursorHooks(s, ours));
  else ctx.actions.push({ kind: "skip", path: join(ctx.home, ".cursor"), detail: "Cursor 설정 경로가 링크여서 보존" });
  const antigravityHooks = join(ctx.home, ".gemini", "config", "hooks.json");
  const antigravityCurrent = safeAntigravityConfig(ctx, antigravityHooks);
  const managedAntigravityHook = antigravityCurrent !== null && isManagedAntigravityHook(ctx, antigravityCurrent[ANTIGRAVITY_HOOK]);
  const preserveAntigravityBoot = antigravityCurrent === null || Object.entries(antigravityCurrent).some(([key, value]) =>
    !(key === ANTIGRAVITY_HOOK && managedAntigravityHook) && containsBootReference(ctx, value));
  if (preserveAntigravityBoot) ctx.actions.push({ kind: "skip", path: ctx.paceBin, detail: "Antigravity 공유 훅에 PACE 참조가 남았거나 확인할 수 없어 실행 파일과 설치본 보존; 해당 훅을 수동 확인" });
  if (managedAntigravityHook) {
    editJson(ctx, antigravityHooks, (s) => { delete s[ANTIGRAVITY_HOOK]; });
  }
  if (geminiRootSafe) editText(ctx, join(ctx.home, ".gemini", "GEMINI.md"), (t) => removeBlock(t, START, END));
  for (const dir of ctx.codexDirs) editText(ctx, join(dir, "config.toml"), (t) => removeBlock(t, CODEX_START, CODEX_END));
  const cursorRule = join(ctx.home, ".cursor", "rules", "000-pace-agent.mdc");
  if (safeCursorRoot(ctx) && safeEditablePath(ctx, cursorRule) && pathExists(cursorRule)) {
    const info = lstatSync(cursorRule);
    if (info.isFile() && !info.isSymbolicLink() && readFileSync(cursorRule, "utf8") === cursorRuleText(ctx)) moveToBackup(ctx, cursorRule, "Cursor 대체 규칙 제거");
    else ctx.actions.push({ kind: "skip", path: cursorRule, detail: "사용자 규칙 보존" });
  }
  for (const dir of skillTargets(ctx)) {
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (isManagedSkill(path)) remove(ctx, path, "스킬 제거");
    }
  }
  if (!preserveAntigravityBoot && pathExists(ctx.paceBin) && lstatSync(ctx.paceBin).isFile() && !lstatSync(ctx.paceBin).isSymbolicLink() && readFileSync(ctx.paceBin, "utf8") === binaryText(ctx)) {
    remove(ctx, ctx.paceBin, "pace 명령 제거");
  }
  if (ctx.windows) {
    const wrapper = join(ctx.paceHome, "bin", "pace");
    if (pathExists(wrapper)) {
      if (preserveAntigravityBoot) ctx.actions.push({ kind: "skip", path: wrapper, detail: "공유 훅의 PACE 참조를 확인할 수 없어 래퍼 보존; 수동 확인" });
      else if (isManagedWindowsWrapper(ctx, wrapper)) remove(ctx, wrapper, "Git Bash pace 명령 제거");
      else ctx.actions.push({ kind: "skip", path: wrapper, detail: "Git Bash 래퍼 경로의 사용자 파일·링크 또는 폴더 보존; 수동 확인" });
    }
  }
  if (!preserveAntigravityBoot && existsSync(ctx.appDir)) {
    if (isManagedApp(ctx.appDir)) remove(ctx, ctx.appDir, "설치본 코드 제거");
    else ctx.actions.push({ kind: "skip", path: ctx.appDir, detail: "PACE 관리 표지 또는 내용이 달라 기존 폴더 보존" });
  }
  return ctx.actions;
}

/** 아직 없는 경로도 기존 조상의 실경로를 해석해 별칭 겹침을 확인한다. */
function resolvedExistingPath(path: string): string {
  let current = resolve(path);
  const suffix: string[] = [];
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) throw new Error("등록부 경로를 확인할 수 없다");
    suffix.unshift(basename(current));
    current = parent;
  }
  return join(realpathSync(current), ...suffix);
}

function assertRegistrySeparation(ctx: Ctx, dataHome: string): void {
  const registry = resolvedExistingPath(join(dataHome, "projects"));
  const targets = [ctx.appDir, `${ctx.appDir}.new`, `${ctx.appDir}.old`].map(resolvedExistingPath);
  const contains = (parent: string, child: string): boolean => child === parent || child.startsWith(parent + sep);
  if (targets.some((target) => contains(target, registry) || contains(registry, target))) {
    throw new Error("등록부와 설치본 경로가 겹친다");
  }
}

// ── 단계 ────────────────────────────────────────────────────────────

interface Ctx {
  bundles: SkillBundle[];
  home: string;
  repo: string;
  /** 이전 설치가 쓴 원본 위치(옛 링크 판별용). */
  previousSource: string | null;
  paceHome: string;
  appDir: string;
  paceBin: string;
  /** 훅·대체 규칙이 부르는 실행 부분. 셸마다 해석이 달라도 같은 뜻이 되게 만든다. */
  bootBin: string;
  windows: boolean;
  dryRun: boolean;
  now: Date;
  backupDir: string;
  backupUsed: boolean;
  claudeDirs: string[];
  codexDirs: string[];
  actions: Action[];
}

function context(options: InstallOptions): Ctx {
  const now = options.now ?? new Date();
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-");
  const paceHome = join(options.home, ".pace");
  const windows = (options.platform ?? process.platform) === "win32";
  // Windows는 셔뱅 실행이 없으므로 node로 넘기는 .cmd를 둔다(.ps1은 실행 정책에 막힐 수 있다).
  const paceBin = join(paceHome, "bin", windows ? "pace.cmd" : "pace");
  return {
    bundles: [],
    home: options.home,
    repo: (options.repo ?? packageRoot).replace(/[\\/]$/, ""),
    previousSource: previousSource(paceHome),
    paceHome,
    appDir: join(paceHome, "app"),
    paceBin,
    // Windows의 Claude Code는 훅을 Git Bash로 돌려 백슬래시가 이스케이프로 사라진다 — 슬래시 경로로 node를 직접 부른다
    // (bash·cmd·PowerShell 공통, .cmd 실행 여부에 기대지 않음).
    bootBin: windows ? `node "${slash(join(paceHome, "app", "bin", "pace.ts"))}"` : quoteIfSpace(paceBin),
    windows,
    dryRun: options.dryRun ?? false,
    now,
    backupDir: join(options.home, `.pace-install-backup-${stamp}-${randomBytes(6).toString("hex")}`),
    backupUsed: false,
    claudeDirs: unique([...discoverDirs(options.home, ".claude", [".claude.json", "settings.json"]), ...(options.claudeDirs ?? [])]),
    codexDirs: unique([...discoverDirs(options.home, ".codex", ["config.toml", "auth.json"]), ...(options.codexDirs ?? [])]),
    actions: [],
  };
}

/**
 * 기본 폴더(~/.claude, ~/.codex)와 같은 이름으로 시작하는 계정별 폴더(~/.claude_platform 등)를 찾는다.
 * 계정별 폴더는 실제 설정 파일(markers)이 있어야 대상으로 본다. 백업 폴더는 뺀다.
 */
export function discoverDirs(home: string, base: string, markers: string[]): string[] {
  const out: string[] = [];
  if (existsSync(join(home, base))) out.push(join(home, base));
  if (!existsSync(home)) return out;
  for (const name of readdirSync(home).sort()) {
    if (!(name.startsWith(`${base}_`) || name.startsWith(`${base}-`))) continue;
    if (/bak|backup|old/i.test(name)) continue;
    const dir = join(home, name);
    try {
      if (!lstatSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    if (markers.some((m) => existsSync(join(dir, m)))) out.push(dir);
  }
  return out;
}

function unique(paths: string[]): string[] {
  return [...new Set(paths.map((p) => p.replace(/[\\/]$/, "")))];
}

function previousSource(paceHome: string): string | null {
  try {
    const record = JSON.parse(readFileSync(join(paceHome, "install.json"), "utf8")) as { source?: string; repo?: string };
    return record.source ?? record.repo ?? null;
  } catch {
    return null;
  }
}

/** 루트에 SKILL.md가 없고 manifest.json이 `format: canvas-skills`인 스킬 묶음 폴더. 폴더째 app에 올라가고 도구 폴더에는 하위 스킬 입구만 설치한다. */
interface SkillBundle { name: string; dir: string; skills: { name: string; description: string }[] }

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** manifest의 파일 목록·SHA-256이 폴더 내용과 정확히 같은지(빠진·남는·바뀐 파일 없음) 읽기만으로 확인한다. 묶음 코드는 실행하지 않는다. */
function bundleProblems(dir: string, manifest: { files?: Record<string, string> }): string[] {
  const files = manifest.files;
  if (!files || typeof files !== "object" || Object.keys(files).length === 0) return ["manifest.files가 없다"];
  const problems: string[] = [];
  for (const [file, hash] of Object.entries(files)) {
    const path = join(dir, ...file.split("/"));
    if (file.split("/").some((p) => !p || p === "." || p === "..") || !existsSync(path) || !lstatSync(path).isFile()) problems.push(`없음: ${file}`);
    else if (sha256(path) !== hash) problems.push(`해시 불일치: ${file}`);
  }
  const walk = (current: string): string[] => readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const path = join(current, entry.name);
    return entry.isDirectory() ? walk(path) : [relative(dir, path).split(sep).join("/")];
  });
  for (const file of walk(dir)) if (file !== "manifest.json" && !(file in files)) problems.push(`manifest에 없는 파일: ${file}`);
  return problems;
}

/** 스킬 묶음을 찾고 복사 전에 해시를 대조한다. 어긋나면 던져서 설치 전체가 기존 활성 설치를 건드리기 전에 멈춘다. */
function readBundles(repo: string): SkillBundle[] {
  const root = join(repo, "skills");
  if (!existsSync(root)) return [];
  const bundles: SkillBundle[] = [];
  for (const name of readdirSync(root).sort()) {
    const dir = join(root, name);
    const manifestPath = join(dir, "manifest.json");
    const isCanvasBundle = name === "pace-canvas-skills" || name === "canvas-skills";
    if (existsSync(join(dir, "SKILL.md"))) {
      let claimsCanvasBundle = false;
      if (existsSync(manifestPath)) {
        try { claimsCanvasBundle = JSON.parse(readFileSync(manifestPath, "utf8")).format === "canvas-skills"; } catch { /* 일반 스킬의 manifest는 이 설치기가 해석하지 않는다. */ }
      }
      if (isCanvasBundle || claimsCanvasBundle) throw new Error(`스킬 묶음 ${name}: 루트 SKILL.md가 허용되지 않는다`);
      continue;
    }
    if (!existsSync(manifestPath)) {
      if (isCanvasBundle) throw new Error(`스킬 묶음 ${name}: manifest가 없다`);
      continue;
    }
    let manifest: { format?: string; skills?: Record<string, { description?: string }>; files?: Record<string, string> };
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch {
      if (isCanvasBundle) throw new Error(`스킬 묶음 ${name}: manifest를 읽을 수 없다`);
      continue;
    }
    if (manifest.format !== "canvas-skills") {
      if (isCanvasBundle) throw new Error(`스킬 묶음 ${name}: manifest 형식이 다르다`);
      continue;
    }
    const problems = bundleProblems(dir, manifest);
    if (problems.length > 0) throw new Error(`스킬 묶음 ${name}이 manifest와 다르다 — 설치하지 않는다:\n${problems.slice(0, 10).map((p) => `- ${p}`).join("\n")}`);
    const skills = Object.entries(manifest.skills ?? {}).map(([skill, info]) => ({ name: skill, description: info.description ?? "" }));
    for (const skill of skills) {
      if (!/^[a-z][a-z0-9-]*$/.test(skill.name) || !existsSync(join(dir, skill.name, "SKILL.md"))) throw new Error(`스킬 묶음 ${name}: 하위 스킬 ${skill.name}의 SKILL.md가 없다`);
      if (bundles.some((bundle) => bundle.skills.some((existing) => existing.name === skill.name))) throw new Error(`스킬 묶음 ${name}: 하위 스킬 ${skill.name}이 중복된다`);
    }
    bundles.push({ name, dir, skills });
  }
  return bundles;
}

/** 하위 스킬 입구 SKILL.md. 본문은 설치본 정본을 가리킬 뿐 복제하지 않는다 — 도구가 `../../runtime`을 상대 경로로 쓰므로 묶음은 한 곳에서만 실행한다. */
function entranceText(ctx: Ctx, bundle: SkillBundle, skill: { name: string; description: string }): string {
  const home = join(ctx.appDir, "skills", bundle.name, skill.name);
  return [
    "---",
    `name: ${skill.name}`,
    `description: ${JSON.stringify(skill.description)}`,
    "---",
    "",
    `# ${skill.name}`,
    "",
    `이 스킬의 정본은 PACE 설치본의 스킬 묶음(${bundle.name})에 있다. 먼저 아래 파일을 읽고 그 지침을 따른다.`,
    "",
    `- 지침: \`${join(home, "SKILL.md")}\``,
    `- 도구: \`${join(home, "tools")}\` 안의 \`.mjs\`를 그 절대 경로로 \`node\`로 실행한다. 묶음 폴더에서 하위 폴더만 떼어 내거나 복사하지 않는다.`,
    "",
  ].join("\n");
}


/** 실행 부분을 ~/.pace/app으로 복사한다. 내용이 같으면 그대로 두고, 다르면 새로 복사한 뒤 한 번에 바꾼다. */
const APP_MARKER = ".pace-app-managed";
const APP_MANIFEST = ".pace-app-manifest.json";

function appFileHashes(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  let count = 0, bytes = 0;
  const walk = (dir: string, prefix: string): void => {
    for (const name of readdirSync(dir).sort()) {
      if (!prefix && (name === APP_MARKER || name === APP_MANIFEST)) continue;
      const path = join(dir, name), rel = prefix ? `${prefix}/${name}` : name, info = lstatSync(path);
      if (++count > 10000) throw new Error("설치본 항목이 너무 많아 원본을 보존합니다");
      if (info.isSymbolicLink()) throw new Error("설치본에 링크가 있어 원본을 보존합니다");
      if (info.isDirectory()) { files[`${rel}/`] = "directory"; walk(path, rel); }
      else if (info.isFile()) {
        bytes += info.size;
        if (info.size > 64 * 1024 * 1024 || bytes > 128 * 1024 * 1024) throw new Error("설치본 크기가 한도를 넘어 원본을 보존합니다");
        files[rel] = createHash("sha256").update(readFileSync(path)).digest("hex");
      }
      else throw new Error("설치본에 알 수 없는 파일이 있어 원본을 보존합니다");
    }
  };
  walk(root, "");
  return files;
}

function isManagedApp(path: string): boolean {
  try {
    const dir = lstatSync(path), marker = join(path, APP_MARKER), stat = lstatSync(marker), manifestPath = join(path, APP_MANIFEST), manifestStat = lstatSync(manifestPath);
    if (!dir.isDirectory() || dir.isSymbolicLink() || !stat.isFile() || stat.isSymbolicLink() || readFileSync(marker, "utf8") !== "PACE 관리 설치본\n" || !manifestStat.isFile() || manifestStat.isSymbolicLink()) return false;
    const recorded: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
    return JSON.stringify(recorded) === JSON.stringify(appFileHashes(path));
  } catch { return false; }
}

function validateAppTarget(ctx: Ctx): void {
  if (pathExists(`${ctx.appDir}.new`) || pathExists(`${ctx.appDir}.old`)) throw new Error("설치 임시 폴더가 남아 있어 원본을 보존합니다; 수동 확인이 필요합니다");
  if (pathExists(ctx.appDir) && !isManagedApp(ctx.appDir)) throw new Error("기존 app 폴더의 PACE 관리 표지 또는 내용이 달라 보존합니다");
}

function copyApp(ctx: Ctx): void {
  const parts = APP_PARTS.filter((part) => existsSync(join(ctx.repo, part)));
  validateAppTarget(ctx);
  if (existsSync(ctx.appDir) && parts.every((part) => sameTree(join(ctx.repo, part), join(ctx.appDir, part)))) return;
  ctx.actions.push({ kind: "copy", path: ctx.appDir, detail: `코드 복사 ← ${ctx.repo}` });
  if (ctx.dryRun) return;
  const next = `${ctx.appDir}.new`;
  mkdirSync(dirname(next), { recursive: true });
  mkdirSync(next);
  for (const part of parts) cpSync(join(ctx.repo, part), join(next, part), { recursive: true, dereference: true });
  writeFileAtomic(join(next, APP_MARKER), "PACE 관리 설치본\n");
  writeFileAtomic(join(next, APP_MANIFEST), `${JSON.stringify(appFileHashes(next))}\n`);
  // 실행 중인 세션이 반쯤 바뀐 코드를 읽지 않게 폴더 이름만 바꿔 교체한다.
  const old = `${ctx.appDir}.old`;
  if (existsSync(ctx.appDir)) renameSync(ctx.appDir, old);
  try {
    renameSync(next, ctx.appDir);
  } catch (error) {
    if (existsSync(old) && !existsSync(ctx.appDir)) {
      try { renameSync(old, ctx.appDir); }
      catch (restoreError) { throw new AggregateError([error, restoreError], "설치본 교체와 이전 설치본 복원에 실패했다; app.old를 보존한다"); }
    }
    throw error;
  }
  try { rmSync(old, { recursive: true, force: true }); }
  catch { ctx.actions.push({ kind: "skip", path: old, detail: "[pace-old-cleanup] 이전 설치본 정리 실패; 사용 중인 프로세스를 닫고 수동 확인" }); }
}

/** 예전 프로필의 RULES.md(템플릿 복사본)는 백업으로 옮긴다 — 시스템 규칙은 설치본에서 바로 읽는다. */
function retireProfileRules(ctx: Ctx): void {
  const root = join(ctx.paceHome, "profiles");
  if (!existsSync(root)) return;
  for (const name of readdirSync(root)) {
    const path = join(root, name, "RULES.md");
    if (existsSync(path)) moveToBackup(ctx, path, "프로필 RULES.md를 시스템 규칙으로 대체(개인 규칙은 pace memory rule)");
  }
}

function binaryText(ctx: Ctx): string {
  const entry = join(ctx.appDir, "bin", "pace.ts");
  return ctx.windows ? `@echo off\r\nnode "${entry}" %*\r\n` : `#!/bin/sh\nexec node "${entry}" "$@"\n`;
}

function writeBinary(ctx: Ctx): void {
  const expected = binaryText(ctx);
  if (pathExists(ctx.paceBin)) {
    const info = lstatSync(ctx.paceBin);
    if (!info.isFile() || info.isSymbolicLink() || readFileSync(ctx.paceBin, "utf8") !== expected) {
      ctx.actions.push({ kind: "skip", path: ctx.paceBin, detail: "PACE 실행 파일 위치의 사용자 파일 보존; 수동 확인" });
      return;
    }
  }
  if (ctx.windows) {
    editText(ctx, ctx.paceBin, () => expected);
    const wrapper = join(ctx.paceHome, "bin", "pace");
    if (pathExists(wrapper) && !isManagedWindowsWrapper(ctx, wrapper)) {
      ctx.actions.push({ kind: "skip", path: wrapper, detail: "[pace-wrapper-conflict] Git Bash 래퍼 경로의 사용자 파일·링크 또는 폴더 보존; 수동 확인" });
    } else {
      editText(ctx, wrapper, () => windowsWrapper(ctx));
    }
    return;
  }
  editText(ctx, ctx.paceBin, () => expected);
  if (!ctx.dryRun && existsSync(ctx.paceBin)) chmodSync(ctx.paceBin, 0o755);
}

/** 정확한 본문과 현재 설치 경로가 일치할 때만 관리한다. */
function windowsWrapper(ctx: Ctx): string {
  const entry = slash(join(ctx.appDir, "bin", "pace.ts"));
  const quoted = `'${entry.replaceAll("'", "'\\''")}'`;
  return `#!/bin/sh\n# PACE Git Bash wrapper v1\nexec node ${quoted} "$@"\n`;
}

function isManagedWindowsWrapper(ctx: Ctx, path: string): boolean {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink()) return false;
  const content = readFileSync(path, "utf8");
  return content === windowsWrapper(ctx);
}

function slash(path: string): string {
  return path.replace(/\\/g, "/");
}

function quoteIfSpace(path: string): string {
  return /\s/.test(path) ? `"${path}"` : path;
}

/** 훅에 넣을 명령. */
function bootCommand(ctx: Ctx, host: string): string {
  return `${ctx.bootBin} boot --host ${host}`;
}

/** PACE 부트 훅인지. 백슬래시 경로·pace.cmd 형식도 알아본다. */
function isBootCommand(ctx: Ctx, command: string): boolean {
  const c = slash(command);
  return [ctx.paceBin, join(ctx.paceHome, "bin", "pace"), join(ctx.appDir, "bin", "pace.ts")].some((target) => {
    const path = slash(target);
    for (let at = c.indexOf(path); at >= 0; at = c.indexOf(path, at + 1)) {
      const before = c[at - 1], after = c[at + path.length];
      if ((!before || /[\s"'`]/.test(before)) && (!after || /[\s"'`]/.test(after))) return true;
    }
    return false;
  }) && /\sboot\b/.test(command);
}

function containsBootReference(ctx: Ctx, value: unknown): boolean {
  // 대체 경로·환경 변수·다른 하위 명령도 남은 PACE 실행 파일 참조일 수 있다.
  if (typeof value === "string") return value.includes(ctx.paceBin) || value.includes(ctx.appDir) || /(?:^|[\\/\s"'`])pace(?:\.cmd)?(?:$|[\s"'`])/i.test(value) || /(?:^|[\\/])\.pace[\\/]app[\\/]/i.test(value);
  if (Array.isArray(value)) return value.some((item) => containsBootReference(ctx, item));
  return !!value && typeof value === "object" && Object.values(value).some((item) => containsBootReference(ctx, item));
}

function skillTargets(ctx: Ctx): string[] {
  const h = ctx.home;
  if (safeGeminiRoot(ctx)) {
    for (const base of [join(h, ".gemini", "config"), join(h, ".gemini", "antigravity")]) {
      for (const dir of [base, join(base, "skills")]) {
        if (pathExists(dir) && lstatSync(dir).isSymbolicLink()) {
          ctx.actions.push({ kind: "skip", path: dir, detail: "Gemini 스킬 경로가 링크여서 기존 스킬 보존; 수동 확인" });
          break;
        }
      }
    }
  }
  // ~/.agents/skills는 Codex 등 Agent Skills 표준 위치. 나머지는 해당 도구 설정 폴더가 있을 때만.
  const targets = [
    join(h, ".agents", "skills"),
    ...ctx.claudeDirs.map((dir) => join(dir, "skills")),
    ...(existsSync(join(h, ".cursor")) && safeCursorRoot(ctx) ? [join(h, ".cursor", "skills")] : []),
    ...[
      ...(safeGeminiRoot(ctx) ? [
        [join(h, ".gemini", "config"), join(h, ".gemini", "config", "skills")],
        [join(h, ".gemini", "antigravity"), join(h, ".gemini", "antigravity", "skills")],
      ] : []),
    ]
      .filter(([toolDir, skillsDir]) => existsSync(toolDir as string) && !lstatSync(toolDir as string).isSymbolicLink() && !(pathExists(skillsDir as string) && lstatSync(skillsDir as string).isSymbolicLink()))
      .map(([, skillsDir]) => skillsDir as string),
  ];
  return targets.filter((dir) => {
    for (const path of [dirname(dir), dir]) {
      if (pathExists(path) && lstatSync(path).isSymbolicLink()) {
        ctx.actions.push({ kind: "skip", path, detail: "스킬 경로가 링크여서 기존 스킬 보존; 수동 확인" });
        return false;
      }
    }
    return true;
  });
}

function copySkills(ctx: Ctx): void {
  const source = join(ctx.repo, "skills");
  if (!existsSync(source)) return;
  const plain = readdirSync(source).filter((name) => existsSync(join(source, name, "SKILL.md")));
  const entrances = ctx.bundles.flatMap((bundle) => bundle.skills.map((skill) => ({ bundle, skill })));
  const skills = [...plain, ...entrances.map((e) => e.skill.name)];
  for (const dir of skillTargets(ctx)) {
    for (const name of plain) copySkill(ctx, join(dir, name), join(source, name));
    for (const { bundle, skill } of entrances) writeEntrance(ctx, join(dir, skill.name), entranceText(ctx, bundle, skill));
    // 이름이 바뀌거나 지워진 스킬, 예전 설치의 링크를 치운다.
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (skills.includes(entry)) continue;
      if (isManagedSkill(path)) remove(ctx, path, "없어진 스킬 제거");
    }
  }
}

function copySkill(ctx: Ctx, path: string, source: string): void {
  if (pathExists(path)) {
    if (isManagedSkill(path)) {
      if (sameTree(source, path, [SKILL_MARKER])) return;
      remove(ctx, path, "스킬 교체");
    } else { ctx.actions.push({ kind: "skip", path, detail: "기존 스킬 보존: PACE 소유 표지 없음" }); return; }
  }
  ctx.actions.push({ kind: "copy", path, detail: `스킬 복사 ← ${source}` });
  if (ctx.dryRun) return;
  cpSync(source, path, { recursive: true, dereference: true });
  writeFileAtomic(join(path, SKILL_MARKER), "PACE가 설치한 스킬 — pace install이 덮어쓴다. 고치려면 PACE 저장소의 skills/를 고친다.\n");
}

/** 입구 폴더를 관리 표지와 함께 쓴다. 같으면 그대로, 관리 사본이면 교체, 사용자 폴더는 백업으로 치운다. */
function writeEntrance(ctx: Ctx, path: string, text: string): void {
  if (pathExists(path)) {
    if (isManagedSkill(path)) {
      const same = readdirSync(path).filter((n) => n !== SKILL_MARKER).join() === "SKILL.md" && readFileSync(join(path, "SKILL.md"), "utf8") === text;
      if (same) return;
      remove(ctx, path, "스킬 입구 교체");
    } else { ctx.actions.push({ kind: "skip", path, detail: "기존 스킬 보존: PACE 소유 표지 없음" }); return; }
  }
  ctx.actions.push({ kind: "copy", path, detail: "스킬 묶음 입구 설치" });
  if (ctx.dryRun) return;
  mkdirSync(path, { recursive: true });
  writeFileAtomic(join(path, "SKILL.md"), text);
  writeFileAtomic(join(path, SKILL_MARKER), "PACE가 설치한 스킬 입구 — pace install이 덮어쓴다. 정본은 설치본 app/skills의 스킬 묶음이다.\n");
}


function isManagedSkill(path: string): boolean {
  if (!pathExists(path) || !lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink()) return false;
  const marker = join(path, SKILL_MARKER);
  return pathExists(marker) && lstatSync(marker).isFile() && !lstatSync(marker).isSymbolicLink();
}

/** 두 폴더(또는 파일)의 내용이 같은지. ignore에 든 이름은 비교하지 않는다. */
function sameTree(a: string, b: string, ignore: string[] = [], includeSource?: (path: string) => boolean): boolean {
  if (!pathExists(b)) return false;
  const sa = lstatSync(a);
  const sb = lstatSync(b);
  if (sa.isDirectory() !== sb.isDirectory()) return false;
  if (!sa.isDirectory()) return readFileSync(a).equals(readFileSync(b));
  const names = (dir: string) => readdirSync(dir).filter((n) => !ignore.includes(n)).sort();
  const na = names(a).filter((n) => !includeSource || includeSource(join(a, n)));
  const nb = names(b);
  if (na.length !== nb.length || na.some((n, i) => n !== nb[i])) return false;
  return na.every((n) => sameTree(join(a, n), join(b, n), [], includeSource));
}

function installClaudeHook(ctx: Ctx): void {
  const command = bootCommand(ctx, "claude");
  const callCommand = claudeCallHookCommand(ctx);
  for (const dir of ctx.claudeDirs) {
    editJson(ctx, join(dir, "settings.json"), (settings) => {
      removeHookGroups(settings, (c) => isBootCommand(ctx, c) || c === callCommand);
      addHookGroup(settings, "SessionStart", { hooks: [{ type: "command", command, timeout: 10 }] });
      for (const event of ["SubagentStart", "SubagentStop", "PostToolUse"]) {
        addHookGroup(settings, event, { ...(event === "PostToolUse" ? { matcher: "Agent" } : {}), hooks: [{ type: "command", command: callCommand, timeout: 10 }] });
      }
    });
  }
}

function claudeCallHookCommand(ctx: Ctx): string {
  // Claude uses a POSIX shell for these hooks, including Git Bash on Windows.
  const path = ctx.windows ? slash(join(ctx.appDir, "bin", "pace.ts")) : ctx.paceBin;
  const quotedPath = "'" + path.replaceAll("'", "'\\''") + "'";
  return `${ctx.windows ? "node " : ""}${quotedPath} agent call-hook --host claude # pace-managed-agent-call-v1`;
}

function installCodex(ctx: Ctx): void {
  for (const dir of ctx.codexDirs) installCodexDir(ctx, dir);
}

function installCodexDir(ctx: Ctx, codexDir: string): void {
  const command = bootCommand(ctx, "codex");
  editJson(ctx, join(codexDir, "hooks.json"), (settings) => {
    removeHookGroups(settings, (c) => isBootCommand(ctx, c));
    addHookGroup(settings, "SessionStart", { hooks: [{ type: "command", command, timeout: 10 }] });
  });
  // 훅 신뢰 승인 전에도 동작하도록 developer_instructions에 대체 규칙을 둔다.
  const block = `${CODEX_START}\ndeveloper_instructions = '''\n${fallbackRule(ctx.bootBin)}\n'''\n${CODEX_END}`;
  editText(ctx, join(codexDir, "config.toml"), (text) => {
    if (text.includes(CODEX_START)) return replaceBlock(text, CODEX_START, CODEX_END, block);
    if (/^developer_instructions\s*=/m.test(text)) {
      ctx.actions.push({ kind: "skip", path: join(codexDir, "config.toml"), detail: "PACE 표지 없는 developer_instructions가 있어 대체 규칙을 넣지 않음" });
      return text;
    }
    return `${block}\n\n${text}`;
  });
}

function installGemini(ctx: Ctx): void {
  const geminiDir = join(ctx.home, ".gemini");
  if (!existsSync(geminiDir)) return;
  if (!safeGeminiRoot(ctx)) {
    ctx.actions.push({ kind: "skip", path: geminiDir, detail: "Gemini 설정 경로가 링크여서 기존 설정·지침·스킬을 갱신하지 않음; 수동 확인" });
    return;
  }
  const command = bootCommand(ctx, "gemini");
  editJson(ctx, join(geminiDir, "settings.json"), (settings) => {
    removeHookGroups(settings, (c) => isBootCommand(ctx, c));
    // Gemini CLI 훅 timeout 단위는 밀리초.
    addHookGroup(settings, "SessionStart", { hooks: [{ type: "command", command, timeout: 15000 }] });
  });
  // GEMINI.md 대체 규칙은 기존 Gemini CLI 호환을 위해 보존한다.
  editText(ctx, join(geminiDir, "GEMINI.md"), (text) => {
    const next = removeBlock(text, START, END);
    return `${START}\n${fallbackRule(ctx.bootBin)}\n${END}\n${next.trim().length > 0 ? `\n${next.trimStart()}` : ""}`;
  });
}

function cursorRuleText(ctx: Ctx): string {
  return `---\ndescription: PACE 에이전트 부트\nalwaysApply: true\n---\n\n${fallbackRule(ctx.bootBin, "cursor")}\n`;
}

function safeCursorRoot(ctx: Ctx): boolean {
  try { return !lstatSync(join(ctx.home, ".cursor")).isSymbolicLink(); }
  catch (error) { return (error as NodeJS.ErrnoException).code === "ENOENT"; }
}

function installCursor(ctx: Ctx): void {
  const cursorDir = join(ctx.home, ".cursor");
  if (!existsSync(cursorDir)) return;
  if (!safeCursorRoot(ctx)) { ctx.actions.push({ kind: "skip", path: cursorDir, detail: "Cursor 설정 경로가 링크여서 보존" }); return; }
  const command = bootCommand(ctx, "cursor");
  editJson(ctx, join(cursorDir, "hooks.json"), (settings) => {
    settings.version ??= 1;
    removeCursorHooks(settings, (c) => isBootCommand(ctx, c));
    const hooks = (settings.hooks ??= {}) as Record<string, unknown[]>;
    (hooks.sessionStart ??= []).push({ command, timeout: 10 });
  });
  // 전역 규칙의 단독 적용이 미확인되어 기존 훅을 보존한다. 비차단 경합과 중복은 미해결이다.
  const rule = cursorRuleText(ctx), path = join(cursorDir, "rules", "000-pace-agent.mdc");
  if (!safeEditablePath(ctx, path)) return;
  if (pathExists(path) && (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink() || readFileSync(path, "utf8") !== rule)) {
    ctx.actions.push({ kind: "skip", path, detail: "사용자 규칙 보존" });
  } else editText(ctx, path, () => rule);
}

const ANTIGRAVITY_HOOK = "pace-session-start";

function safeGeminiRoot(ctx: Ctx): boolean {
  try { return !lstatSync(join(ctx.home, ".gemini")).isSymbolicLink(); }
  catch (error) { return (error as NodeJS.ErrnoException).code === "ENOENT"; }
}

/** 공유 파일의 링크·불명 형식은 변경하지 않고 설치·제거를 계속한다. */
function safeAntigravityConfig(ctx: Ctx, path: string): Json | null {
  for (const target of [join(ctx.home, ".gemini"), dirname(path), path]) {
    try {
      if (lstatSync(target).isSymbolicLink()) {
        ctx.actions.push({ kind: "skip", path, detail: "Antigravity 공유 설정 경로가 링크여서 원본 보존" });
        return null;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        ctx.actions.push({ kind: "skip", path, detail: "Antigravity 공유 설정을 확인할 수 없어 원본 보존" });
        return null;
      }
    }
  }
  try {
    const before = existsSync(path) ? readFileSync(path, "utf8") : "";
    const value: unknown = before.trim() ? JSON.parse(before) : {};
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Json;
  } catch {
    ctx.actions.push({ kind: "skip", path, detail: "Antigravity 공유 설정 형식을 확인할 수 없어 원본 보존" });
    return null;
  }
}

/** 이름이 같아도 사용자가 추가한 다른 핸들러·속성은 덮어쓰지 않는다. */
function isManagedAntigravityHook(ctx: Ctx, value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  if (Object.keys(entry).length !== 1 || !Array.isArray(entry.SessionStart) || entry.SessionStart.length !== 1) return false;
  const handler = entry.SessionStart[0] as Record<string, unknown> | null;
  if (!handler || typeof handler !== "object" || Array.isArray(handler)) return false;
  return Object.keys(handler).length === 3 && Object.keys(handler).every((key) => ["type", "command", "timeout"].includes(key))
    && handler.type === "command" && [bootCommand(ctx, "antigravity"), `${quoteIfSpace(ctx.paceBin)} boot --host antigravity`].includes(String(handler.command)) && handler.timeout === 10;
}

function installAntigravity(ctx: Ctx): void {
  if (!existsSync(join(ctx.home, ".gemini"))) return;
  const path = join(ctx.home, ".gemini", "config", "hooks.json");
  const impact = "Antigravity IDE·CLI가 공유하는 훅 경로이며 CLI에서도 로드될 수 있음";
  const current = safeAntigravityConfig(ctx, path);
  if (!current) return;
  if (current[ANTIGRAVITY_HOOK] !== undefined && !isManagedAntigravityHook(ctx, current[ANTIGRAVITY_HOOK])) {
    ctx.actions.push({ kind: "skip", path, detail: `같은 이름의 사용자 훅 보존; ${impact}` });
    return;
  }
  const actionStart = ctx.actions.length;
  editJson(ctx, path, (settings) => {
    // Antigravity 문서상 timeout 단위는 초다.
    settings[ANTIGRAVITY_HOOK] = { SessionStart: [{ type: "command", command: bootCommand(ctx, "antigravity"), timeout: 10 }] };
  });
  if (ctx.actions.length > actionStart) ctx.actions[ctx.actions.length - 1]!.detail += `; ${impact}`;
  else if (ctx.dryRun) ctx.actions.push({ kind: "skip", path, detail: `이미 등록됨; ${impact}` });
}

// ── 공통 편집 ─────────────────────────────────────────────────────────

type Json = Record<string, unknown>;
interface HookGroup extends Json {
  hooks?: { type?: string; command?: string; timeout?: number }[];
}

function removeHookGroups(settings: Json, shouldRemove: (command: string, group: HookGroup) => boolean): void {
  const hooks = settings.hooks as Record<string, HookGroup[]> | undefined;
  if (!hooks || typeof hooks !== "object") return;
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue;
    const kept = groups.flatMap((group) => {
      if (!group || !Array.isArray(group.hooks)) return [group];
      const remaining = group.hooks.filter((hook) => !shouldRemove(hook.command ?? "", group));
      if (remaining.length === group.hooks.length) return [group];
      return remaining.length === 0 ? [] : [{ ...group, hooks: remaining }];
    });
    if (kept.length === 0) delete hooks[event];
    else hooks[event] = kept;
  }
  if (Object.keys(hooks).length === 0) delete settings.hooks;
}

function removeCursorHooks(settings: Json, shouldRemove: (command: string) => boolean): void {
  const hooks = settings.hooks as Record<string, { command?: string }[]> | undefined;
  if (!hooks || typeof hooks !== "object") return;
  for (const [event, entries] of Object.entries(hooks)) {
    if (!Array.isArray(entries)) continue;
    const kept = entries.filter((e) => !shouldRemove(e.command ?? ""));
    if (kept.length === 0) delete hooks[event];
    else hooks[event] = kept;
  }
  if (Object.keys(hooks).length === 0) delete settings.hooks;
}

function addHookGroup(settings: Json, event: string, group: HookGroup): void {
  const hooks = (settings.hooks ??= {}) as Record<string, HookGroup[]>;
  // PACE 부트를 다른 SessionStart 훅보다 앞에 둔다.
  hooks[event] = [group, ...(hooks[event] ?? [])];
}

function editJson(ctx: Ctx, path: string, mutate: (value: Json) => void): void {
  if (!safeEditablePath(ctx, path)) return;
  const before = existsSync(path) ? readFileSync(path, "utf8") : "";
  const value = before.trim().length > 0 ? (JSON.parse(before) as Json) : {};
  mutate(value);
  writeIfChanged(ctx, path, before, `${JSON.stringify(value, null, 2)}\n`);
}

/** 제거할 설정이 없으면 제거 과정에서 새 파일이나 폴더를 만들지 않는다. */
function editExistingJson(ctx: Ctx, path: string, mutate: (value: Json) => void): void {
  if (pathExists(path)) editJson(ctx, path, mutate);
}

function editText(ctx: Ctx, path: string, transform: (text: string) => string): void {
  if (!safeEditablePath(ctx, path)) return;
  const before = existsSync(path) ? readFileSync(path, "utf8") : "";
  writeIfChanged(ctx, path, before, transform(before));
}

function safeEditablePath(ctx: Ctx, path: string): boolean {
  const home = resolve(ctx.home);
  let part = resolve(path);
  for (;;) {
    if (pathExists(part) && lstatSync(part).isSymbolicLink()) {
      ctx.actions.push({ kind: "skip", path: part, detail: "설정 경로가 링크여서 원본 보존; 수동 확인" });
      return false;
    }
    if (part === home || dirname(part) === part) return true;
    part = dirname(part);
  }
}

function writeIfChanged(ctx: Ctx, path: string, before: string, after: string): void {
  if (before === after) return;
  const existed = pathExists(path);
  ctx.actions.push({ kind: existed ? "edit" : "write", path, detail: existed ? "수정 (원본 백업)" : "새로 만듦" });
  if (ctx.dryRun) return;
  if (existed) backupCopy(ctx, path);
  writeFileAtomic(path, after);
}

function backupCopy(ctx: Ctx, path: string): void {
  const rel = relative(ctx.home, path);
  const dest = isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`) || resolve(ctx.home, rel) !== resolve(path)
    ? join(ctx.backupDir, "external", createHash("sha256").update(resolve(path)).digest("hex"), basename(path))
    : join(ctx.backupDir, rel);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(path, dest, { recursive: true });
  ctx.backupUsed = true;
}

function moveToBackup(ctx: Ctx, path: string, detail: string): void {
  ctx.actions.push({ kind: "move", path, detail: `${detail} → 백업` });
  if (ctx.dryRun) return;
  const dest = join(ctx.backupDir, relative(ctx.home, path));
  mkdirSync(dirname(dest), { recursive: true });
  renameSync(path, dest);
  ctx.backupUsed = true;
}

function remove(ctx: Ctx, path: string, detail: string): void {
  ctx.actions.push({ kind: "move", path, detail });
  if (!ctx.dryRun) rmSync(path, { recursive: true, force: true });
}

function removeBlock(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  if (from === -1) return text;
  const to = text.indexOf(end, from);
  if (to === -1) return text;
  const after = text.slice(to + end.length).replace(/^\r?\n/, "");
  return (text.slice(0, from) + after).replace(/^\s*\n/, "");
}

function replaceBlock(text: string, start: string, end: string, block: string): string {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from);
  if (from === -1 || to === -1) return text;
  return text.slice(0, from) + block + text.slice(to + end.length);
}

function pathExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function isSymlinkInto(path: string, root: string): boolean {
  return pathExists(path) && lstatSync(path).isSymbolicLink() && readlinkSync(path).startsWith(root);
}
