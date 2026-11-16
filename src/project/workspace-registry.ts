import { randomUUID } from "node:crypto";
import { constants as bufferConstants } from "node:buffer";
import { constants, existsSync, fstatSync, lstatSync, mkdirSync, readdirSync, readFileSync, readSync, realpathSync, writeFileSync, linkSync, unlinkSync, openSync, closeSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { writeFileAtomic } from "../core/fsutil.ts";
import { templatesDir } from "../core/paths.ts";
import { hasSecret } from "./secrets.ts";
import { renderWorkspaceAgent, validateAgentDefinition, workspaceAgentDisplayName } from "./agent-definition.ts";

/** 내부 후보만 다룬다. 활성화·AGENT 검증은 후속 태스크의 책임이다. */
export interface WorkspaceCandidate {
  id: string;
  path: string;
  name: string;
  summary: string;
  active?: boolean;
}

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function registryDir(home: string, create: boolean): string {
  const dir = join(home, "projects");
  if (create && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  try {
    const stat = lstatSync(dir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("등록부는 실제 디렉터리여야 한다");
  } catch (error) {
    if (!create && (error as NodeJS.ErrnoException).code === "ENOENT") return dir;
    throw error;
  }
  return dir;
}

function candidateFile(dir: string, id: string): string {
  if (!ID.test(id)) throw new Error("잘못된 등록 ID");
  return join(dir, `${id}.json`);
}

function canonicalPath(path: string): string {
  if (!isAbsolute(path)) throw new Error("워크스페이스 경로는 절대 경로여야 한다");
  if (hasSecret(path)) throw new Error("비밀로 보이는 값을 등록할 수 없다");
  try {
    const resolved = realpathSync.native(path);
    if (!lstatSync(resolved).isDirectory()) throw new Error();
    return resolved;
  } catch {
    throw new Error("워크스페이스 경로를 확인할 수 없다");
  }
}

function samePath(candidate: WorkspaceCandidate, path: string): boolean {
  if (candidate.path === path) return true;
  try { return canonicalPath(candidate.path) === path; } catch { return false; }
}

function readCandidate(file: string, id: string): WorkspaceCandidate {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("등록 항목은 일반 파일이어야 한다");
  let value: unknown;
  try { value = JSON.parse(readFileSync(file, "utf8")); } catch { throw new Error("잘못된 등록 항목"); }
  if (!value || typeof value !== "object") throw new Error("잘못된 등록 항목");
  const record = value as Record<string, unknown>;
  if (record.id !== id || typeof record.path !== "string" || !isAbsolute(record.path) || typeof record.name !== "string" || typeof record.summary !== "string") {
    throw new Error("잘못된 등록 항목");
  }
  if (record.active !== undefined && typeof record.active !== "boolean") throw new Error("잘못된 등록 항목");
  return { id, path: record.path, name: record.name, summary: record.summary, ...(record.active === true ? { active: true } : {}) };
}

export function ensureRegistry(home: string): void {
  registryDir(home, true);
}

export function listCandidates(home: string): WorkspaceCandidate[] {
  const dir = registryDir(home, false);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith(".json")).sort().map((name) => {
    const id = name.slice(0, -5);
    return readCandidate(candidateFile(dir, id), id);
  });
}

export function createCandidate(home: string, input: Omit<WorkspaceCandidate, "id" | "active">, existingId?: string): WorkspaceCandidate {
  const path = canonicalPath(input.path);
  if (!input.name.trim()) throw new Error("이름이 비었다");
  if ([path, input.name, input.summary].some((v) => hasSecret(v))) throw new Error("비밀로 보이는 값을 등록할 수 없다");
  const dir = registryDir(home, true);
  if (listCandidates(home).some((candidate) => samePath(candidate, path))) throw new Error("중복 워크스페이스 경로");
  const candidate = { id: existingId ?? randomUUID(), path, name: input.name.trim(), summary: input.summary };
  writeNewCandidate(dir, candidate);
  return candidate;
}

function writeNewCandidate(dir: string, candidate: WorkspaceCandidate): void {
  const target = candidateFile(dir, candidate.id);
  const tmp = join(dir, `.${randomUUID()}.tmp`);
  const fd = openSync(tmp, "wx");
  let linked = false;
  try {
    writeFileSync(fd, `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
    closeSync(fd);
    linkSync(tmp, target);
    linked = true;
  } finally {
    try { closeSync(fd); } catch { /* 이미 닫힌 경우 */ }
    try { unlinkSync(tmp); } catch (error) { if (!linked) throw error; }
  }
}

export function moveCandidate(home: string, id: string, newPath: string): WorkspaceCandidate {
  const dir = registryDir(home, false);
  const file = candidateFile(dir, id);
  const original = readCandidate(file, id);
  if (original.active) throw new Error("활성 워크스페이스의 위치 변경은 정의 재검증이 필요하다");
  const path = canonicalPath(newPath);
  if (hasSecret(path)) throw new Error("비밀로 보이는 값을 등록할 수 없다");
  if (listCandidates(home).some((candidate) => candidate.id !== id && samePath(candidate, path))) throw new Error("중복 워크스페이스 경로");
  const updated = { ...original, path };
  writeFileAtomic(file, `${JSON.stringify(updated, null, 2)}\n`);
  return updated;
}

/** 유효한 정의와 같은 ID가 확인된 경우에만 기존 후보를 활성화한다. */
export function activateCandidate(home: string, id: string, maxChars: number): WorkspaceCandidate {
  const dir = registryDir(home, false);
  const file = candidateFile(dir, id);
  const candidate = readCandidate(file, id);
  assertCandidateDefinition(candidate, maxChars);
  const updated = { ...candidate, active: true };
  writeFileAtomic(file, `${JSON.stringify(updated, null, 2)}\n`);
  return updated;
}

/** 활성 레코드는 정의를 먼저 검증하고 마지막에 원자적으로 생성한다. */
export function registerWorkspace(home: string, input: Omit<WorkspaceCandidate, "id" | "active">, maxChars: number): WorkspaceCandidate {
  const path = canonicalPath(input.path);
  if (!input.name.trim()) throw new Error("이름이 비었다");
  if ([path, input.name, input.summary].some((v) => hasSecret(v))) throw new Error("비밀로 보이는 값을 등록할 수 없다");
  const dir = registryDir(home, true);
  const existing = listCandidates(home).find((candidate) => samePath(candidate, path));
  if (existing?.active) throw new Error("중복 워크스페이스 경로");
  const paceDir = join(path, ".pace");
  if (!existsSync(paceDir)) mkdirSync(paceDir);
  const stat = lstatSync(paceDir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("프로젝트 정의 폴더가 안전하지 않다");
  const agent = join(paceDir, "AGENT.md");
  let created: { dev: number; ino: number } | null = null;
  try {
    let text: string;
    if (existsSync(agent)) {
      text = readAgentFile(path, maxChars);
    } else {
      text = renderWorkspaceAgent(readFileSync(join(templatesDir, "workspace", "AGENT.md"), "utf8"), existing?.id ?? randomUUID(), workspaceAgentDisplayName(home));
      validateAgentDefinition(text, maxChars);
      const tmp = join(paceDir, `.${randomUUID()}.tmp`);
      const fd = openSync(tmp, "wx");
      try {
        writeFileSync(fd, text, "utf8");
        closeSync(fd);
        const written = lstatSync(tmp);
        linkSync(tmp, agent);
        created = { dev: written.dev, ino: written.ino };
      } finally {
        try { closeSync(fd); } catch { /* 이미 닫힌 경우 */ }
        unlinkSync(tmp);
      }
    }
    const { workspaceId } = validateAgentDefinition(text, maxChars);
    if (existing) {
      if (existing.id !== workspaceId) throw new Error("AGENT와 등록부 ID가 일치하지 않는다");
      return activateCandidate(home, existing.id, maxChars);
    }
    const candidate: WorkspaceCandidate = { id: workspaceId, path, name: input.name.trim(), summary: input.summary, active: true };
    try { writeNewCandidate(dir, candidate); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("같은 ID가 다른 위치에 등록되어 있다. 워크스페이스의 실제 이전은 pace workspace move, 개발 worktree는 pace project 하네스를 확인한다");
      throw error;
    }
    return candidate;
  } catch (error) {
    if (created !== null) {
      try {
        const current = lstatSync(agent);
        if (current.isFile() && current.dev === created.dev && current.ino === created.ino) unlinkSync(agent);
      } catch { /* 기존 파일을 추측해 지우지 않는다 */ }
    }
    throw error;
  }
}

function readAgentFile(root: string, maxChars: number): string {
  const paceDir = join(root, ".pace");
  const agent = join(paceDir, "AGENT.md");
  let text: string;
  try {
    if (!Number.isSafeInteger(maxChars) || maxChars <= 0 || maxChars > Math.floor((bufferConstants.MAX_LENGTH - 1) / 4)) throw new Error();
    const dirStat = lstatSync(paceDir);
    if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) throw new Error();
    const before = lstatSync(agent);
    if (!before.isFile() || before.isSymbolicLink()) throw new Error();
    const fd = openSync(agent, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const fileStat = fstatSync(fd);
      if (!fileStat.isFile() || fileStat.dev !== before.dev || fileStat.ino !== before.ino) throw new Error();
      if (fileStat.size > maxChars * 4) throw new Error("AGENT 정의 길이 상한 초과");
      const buffer = Buffer.alloc(maxChars * 4 + 1);
      let used = 0, count: number;
      while (used < buffer.length && (count = readSync(fd, buffer, used, buffer.length - used, null)) > 0) used += count;
      if (used === buffer.length) throw new Error("AGENT 정의 길이 상한 초과");
      text = buffer.subarray(0, used).toString("utf8");
    } finally { closeSync(fd); }
  } catch (error) {
    if (error instanceof Error && error.message === "AGENT 정의 길이 상한 초과") throw error;
    throw new Error("프로젝트 AGENT 정의를 확인할 수 없다");
  }
  return text;
}

function assertCandidateDefinition(candidate: WorkspaceCandidate, maxChars: number): string {
  const text = readAgentFile(candidate.path, maxChars);
  if (validateAgentDefinition(text, maxChars).workspaceId !== candidate.id) throw new Error("AGENT와 등록부 ID가 일치하지 않는다");
  return text;
}

/** 등록·활성화된 현재 워크스페이스의 검증된 정의만 돌려준다. */
export function readActiveWorkspaceAgent(home: string, root: string, maxChars: number): string | null {
  const path = canonicalPath(root);
  const matches = listCandidates(home).filter((candidate) => candidate.active && samePath(candidate, path));
  if (matches.length === 0) return null;
  if (matches.length !== 1) throw new Error("워크스페이스 등록이 중복되었다");
  return assertCandidateDefinition(matches[0]!, maxChars);
}

/** 하네스가 검증한 worktree의 정의를 원본 활성 등록의 ID와 비교한다. 관계는 저장하지 않는다. */
export function readWorktreeWorkspaceAgent(home: string, mainRoot: string, worktreeRoot: string, maxChars: number): string | null {
  const path = canonicalPath(mainRoot);
  const matches = listCandidates(home).filter((candidate) => candidate.active && samePath(candidate, path));
  if (matches.length === 0) return null;
  if (matches.length !== 1) throw new Error("워크스페이스 등록이 중복되었다");
  const mainDefinition = assertCandidateDefinition(matches[0]!, maxChars);
  const worktreeDefinition = readAgentFile(canonicalPath(worktreeRoot), maxChars);
  if (validateAgentDefinition(mainDefinition, maxChars).workspaceId !== validateAgentDefinition(worktreeDefinition, maxChars).workspaceId) throw new Error("worktree와 등록 원본의 AGENT ID가 일치하지 않는다");
  return worktreeDefinition;
}

export function inspectWorkspaces(home: string, maxChars: number): { active: WorkspaceCandidate[]; invalid: string[] } {
  const active: WorkspaceCandidate[] = [], invalid: string[] = [];
  for (const candidate of listCandidates(home)) {
    if (!candidate.active) continue;
    try { assertCandidateDefinition(candidate, maxChars); active.push(candidate); } catch { invalid.push(candidate.id); }
  }
  return { active, invalid };
}

export function listActiveWorkspaces(home: string, maxChars: number): WorkspaceCandidate[] {
  return inspectWorkspaces(home, maxChars).active;
}

/** 활성 항목의 위치는 새 정의의 같은 ID를 확인한 뒤 명시적으로 변경한다. */
export function relocateWorkspace(home: string, id: string, newPath: string, maxChars: number): WorkspaceCandidate {
  const dir = registryDir(home, false);
  const file = candidateFile(dir, id);
  const current = readCandidate(file, id);
  if (!current.active) return moveCandidate(home, id, newPath);
  const path = canonicalPath(newPath);
  if (hasSecret(path)) throw new Error("비밀로 보이는 값을 등록할 수 없다");
  if (listCandidates(home).some((candidate) => candidate.id !== id && samePath(candidate, path))) throw new Error("중복 워크스페이스 경로");
  const updated = { ...current, path };
  assertCandidateDefinition(updated, maxChars);
  writeFileAtomic(file, `${JSON.stringify(updated, null, 2)}\n`);
  return updated;
}
