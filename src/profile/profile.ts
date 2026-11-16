import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fillTemplate, readTextIfExists, today, writeFileAtomic } from "../core/fsutil.ts";
import { getString, parseFrontmatter } from "../core/frontmatter.ts";
import { defaultProfileFile, profileDir, profilesDir, templatesDir } from "../core/paths.ts";
import { profileMemoryDir, rebuildMemoryIndex } from "../memory/memory.ts";

/** 시스템 규칙(RULES)은 프로필에 두지 않는다 — templates/RULES.md. 개인 규칙은 프로필 메모리 `rule`. */
export const PROFILE_FILES = ["SOUL.md", "USER.md", "config.yaml"] as const;
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

export interface ProfileInput {
  name: string;
  displayName: string;
  alias: string;
  ownerName: string;
  tone: string;
  personality: string;
  language: string;
}

export interface Profile {
  name: string;
  dir: string;
  displayName: string;
  ownerName: string;
  soul: string;
  user: string;
}

export function validateProfileName(name: string): void {
  if (!NAME_PATTERN.test(name)) {
    throw new Error(`프로필 이름은 영소문자·숫자·'-'만 쓸 수 있다 (예: default, coder): "${name}"`);
  }
}

export function profileExists(home: string, name: string): boolean {
  return existsSync(join(profileDir(home, name), "SOUL.md"));
}

export function createProfile(home: string, input: ProfileInput): string {
  validateProfileName(input.name);
  const dir = profileDir(home, input.name);
  if (profileExists(home, input.name)) throw new Error(`이미 있는 프로필: ${input.name}`);
  const values: Record<string, string> = { ...input, created: today() };
  for (const file of PROFILE_FILES) {
    const template = readFileSync(join(templatesDir, "profile", file), "utf8");
    writeFileAtomic(join(dir, file), fillTemplate(template, values));
  }
  mkdirSync(join(dir, "skills"), { recursive: true });
  rebuildMemoryIndex(profileMemoryDir(dir), "profile");
  if (getDefaultProfile(home) === null) setDefaultProfile(home, input.name);
  return dir;
}

/**
 * 정체성·설정·스킬만 복사하고 USER.md와 메모리는 새로 시작한다 (프로필 = 독립 에이전트).
 * 이름표(frontmatter name·alias)는 overrides로 바꾼다.
 */
export function cloneProfile(
  home: string,
  source: string,
  name: string,
  overrides: { displayName?: string; alias?: string } = {},
): string {
  validateProfileName(name);
  if (!profileExists(home, source)) throw new Error(`원본 프로필이 없다: ${source}`);
  if (profileExists(home, name)) throw new Error(`이미 있는 프로필: ${name}`);
  const src = profileDir(home, source);
  const dir = profileDir(home, name);
  const sourceSoul = readFileSync(join(src, "SOUL.md"), "utf8");
  const { data } = parseFrontmatter(sourceSoul);
  const ownerName = getString(data, "owner_name", "사용자");
  let soul = sourceSoul;
  if (overrides.displayName) soul = replaceFrontmatterValue(soul, "name", overrides.displayName);
  if (overrides.alias) soul = replaceFrontmatterValue(soul, "alias", overrides.alias);
  writeFileAtomic(join(dir, "SOUL.md"), soul);
  const config = readFileSync(join(src, "config.yaml"), "utf8")
    .replace(/^profile:.*$/m, `profile: ${name}`)
    .replace(/^created:.*$/m, `created: ${today()}`);
  writeFileAtomic(join(dir, "config.yaml"), config);
  const userTemplate = readFileSync(join(templatesDir, "profile", "USER.md"), "utf8");
  writeFileAtomic(join(dir, "USER.md"), fillTemplate(userTemplate, { ownerName }));
  if (existsSync(join(src, "skills"))) cpSync(join(src, "skills"), join(dir, "skills"), { recursive: true });
  else mkdirSync(join(dir, "skills"), { recursive: true });
  rebuildMemoryIndex(profileMemoryDir(dir), "profile");
  return dir;
}

export function listProfiles(home: string): string[] {
  const root = profilesDir(home);
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((entry) => statSync(join(root, entry)).isDirectory() && profileExists(home, entry))
    .sort();
}

export function getDefaultProfile(home: string): string | null {
  const value = readTextIfExists(defaultProfileFile(home))?.trim();
  return value && value.length > 0 ? value : null;
}

export function setDefaultProfile(home: string, name: string): void {
  validateProfileName(name);
  if (!profileExists(home, name)) throw new Error(`없는 프로필: ${name}`);
  writeFileAtomic(defaultProfileFile(home), `${name}\n`);
}

/** 프로필 선택 순서: PACE_PROFILE 환경변수 → 기본 프로필. */
export function resolveProfileName(home: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const fromEnv = env.PACE_PROFILE?.trim();
  if (fromEnv) return fromEnv;
  return getDefaultProfile(home);
}

export function loadProfile(home: string, name: string): Profile {
  if (!profileExists(home, name)) throw new Error(`없는 프로필: ${name}`);
  const dir = profileDir(home, name);
  const soul = readFileSync(join(dir, "SOUL.md"), "utf8");
  const { data } = parseFrontmatter(soul);
  return {
    name,
    dir,
    displayName: getString(data, "name", name),
    ownerName: getString(data, "owner_name", "사용자"),
    soul,
    user: readTextIfExists(join(dir, "USER.md")) ?? "",
  };
}

function replaceFrontmatterValue(text: string, key: string, value: string): string {
  const pattern = new RegExp(`^(${key}:).*$`, "m");
  return text.replace(pattern, `$1 ${value}`);
}
