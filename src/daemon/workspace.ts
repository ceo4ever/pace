import { realpathSync, statSync } from "node:fs";
import { basename } from "node:path";
import { AGENT_BUDGET } from "../project/agent-definition.ts";
import { findWorkspaceRegistration, isWorkspaceId, readWorkspaceRegistration, registerWorkspace, verifyWorkspaceRegistration, workspaceDefinitionId } from "../project/workspace-registry.ts";
import { loadConfig, parseConfig, readRawConfigFile, updateConfigFile, WORKSPACE_NAME, type WorkspaceEntry } from "./config.ts";
import { hasTokenShape } from "./secrets.ts";

export interface WorkspaceRoot {
  real: string;
  dev: string;
  ino: string;
}

export interface WorkspaceAddRequest extends WorkspaceRoot {
  name: string;
  registryId: string;
}

export interface WorkspacePlan extends WorkspaceRoot {
  name: string;
  registryId: string | null;
  definitionId: string | null;
}

export class WorkspaceError extends Error {}

export function workspaceRoot(path: string): WorkspaceRoot {
  if (hasTokenShape(path)) throw new WorkspaceError("경로에 비밀 형태 문자열이 있다");
  try {
    const real = realpathSync.native(path);
    const stat = statSync(real, { bigint: true });
    if (stat.isDirectory() && !hasTokenShape(real)) return { real, dev: String(stat.dev), ino: String(stat.ino) };
  } catch { /* 파일 시스템 원문에는 경로가 포함된다 */ }
  throw new WorkspaceError("워크스페이스 경로를 확인할 수 없다");
}

export function sameWorkspaceRoot(a: WorkspaceRoot, b: WorkspaceRoot): boolean {
  return a.real === b.real && a.dev === b.dev && a.ino === b.ino;
}

export function registeredWorkspaceRoot(home: string, path: string, id: string): WorkspaceRoot {
  const candidate = readWorkspaceRegistration(home, id);
  if (!candidate?.active) throw new WorkspaceError("활성 등록 항목을 확인할 수 없다");
  if (candidate.path !== path) throw new WorkspaceError("등록부 경로가 바뀌었다 — workspace add로 다시 승인한다");
  const before = workspaceRoot(path);
  try { verifyWorkspaceRegistration(candidate, path, AGENT_BUDGET); }
  catch { throw new WorkspaceError("승인 경로 또는 AGENT 정의의 등록 ID를 확인할 수 없다"); }
  const root = workspaceRoot(path);
  const after = readWorkspaceRegistration(home, id);
  if (root.real !== path || !sameWorkspaceRoot(root, before) || !after?.active || after.path !== path) {
    throw new WorkspaceError("등록부 경로가 바뀌었다 — workspace add로 다시 승인한다");
  }
  return root;
}

export function approvedWorkspaceRoot(home: string, entry: WorkspaceEntry): WorkspaceRoot {
  const root = registeredWorkspaceRoot(home, entry.path, entry.registryId!);
  const expected = entry.registryIdentity;
  if (expected && (expected.dev !== root.dev || expected.ino !== root.ino)) {
    throw new WorkspaceError("승인한 디렉터리가 바뀌었다 — workspace add로 다시 승인한다");
  }
  return root;
}

export function workspaceLinkStatus(home: string, entry: WorkspaceEntry): string {
  if (!entry.registryId) return "기존 설정";
  try { approvedWorkspaceRoot(home, entry); return "활성 등록"; }
  catch (error) { return workspaceErrorText(error); }
}

export function workspaceErrorText(error: unknown): string {
  return error instanceof WorkspaceError ? error.message : "워크스페이스 등록 또는 설정을 확인할 수 없다";
}

function matchingEntry(entries: WorkspaceEntry[], name: string, root: WorkspaceRoot, id: string | null): WorkspaceEntry | undefined {
  const byId = id ? entries.find((entry) => entry.registryId === id) : undefined;
  if (byId && byId.name !== name) throw new WorkspaceError(`같은 등록 ID는 이미 ${byId.name} 이름을 쓴다 — --name ${byId.name}으로 다시 실행한다`);
  const byName = entries.find((entry) => entry.name === name);
  if (byId) return byId;
  if (!byName) {
    const alias = entries.find((entry) => !entry.registryId && matchesDirectory(entry, root));
    if (alias) throw new WorkspaceError(`기존 설정의 이름은 ${alias.name}이다 — --name ${alias.name}으로 다시 실행한다`);
    return undefined;
  }
  if (!byName.registryId) {
    if (matchesDirectory(byName, root)) return byName;
  }
  throw new WorkspaceError("같은 이름을 다른 워크스페이스가 쓴다 — --name으로 다른 이름을 지정한다");
}

function matchesDirectory(entry: WorkspaceEntry, root: WorkspaceRoot): boolean {
  try { return sameWorkspaceRoot(root, workspaceRoot(entry.path)); }
  catch { return false; }
}

export function planWorkspaceAdd(home: string, path: string, requestedName?: string): WorkspacePlan {
  const root = workspaceRoot(path);
  const candidate = findWorkspaceRegistration(home, root.real);
  if (candidate) registeredWorkspaceRoot(home, root.real, candidate.id);
  let definitionId: string | null;
  try { definitionId = workspaceDefinitionId(root.real, AGENT_BUDGET); }
  catch { throw new WorkspaceError("AGENT 정의 또는 등록 ID가 올바르지 않다"); }
  if (!candidate && definitionId && readWorkspaceRegistration(home, definitionId)) {
    throw new WorkspaceError("AGENT 정의의 등록 ID는 다른 경로에 등록돼 있다");
  }
  const entries = loadConfig(home).workspaces;
  const existing = candidate && entries.find((entry) => entry.registryId === candidate.id);
  const name = requestedName ?? existing?.name ?? candidate?.name ?? basename(root.real);
  if (!WORKSPACE_NAME.test(name)) throw new WorkspaceError("워크스페이스 이름은 영문·숫자·_.- 40자 이내다 — --name으로 지정한다");
  matchingEntry(entries, name, root, candidate?.id ?? null);
  return { ...root, name, registryId: candidate?.id ?? null, definitionId };
}

export function approveWorkspacePlan(home: string, plan: WorkspacePlan): WorkspaceAddRequest {
  const current = planWorkspaceAdd(home, plan.real, plan.name);
  if (!sameWorkspaceRoot(current, plan) || current.registryId !== plan.registryId || current.definitionId !== plan.definitionId) {
    throw new WorkspaceError("확인 화면을 본 뒤 등록 정보가 바뀌었다 — workspace add로 다시 승인한다");
  }
  const id = current.registryId ?? registerWorkspace(home, { path: plan.real, name: plan.name, summary: "" }, AGENT_BUDGET, false).id;
  if (plan.definitionId && plan.definitionId !== id) throw new WorkspaceError("확인한 AGENT의 등록 ID가 바뀌었다");
  return { real: plan.real, dev: plan.dev, ino: plan.ino, name: plan.name, registryId: id };
}

export function isWorkspaceAddRequest(value: unknown): value is WorkspaceAddRequest {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.name === "string" && WORKSPACE_NAME.test(entry.name) && isWorkspaceId(entry.registryId) &&
    typeof entry.real === "string" && typeof entry.dev === "string" && typeof entry.ino === "string";
}

/** 호출자는 daemon 소유 구간에 있어야 한다. 결속 보강은 설정보다 먼저 기록한다. */
export function persistRegisteredWorkspace(home: string, request: WorkspaceAddRequest, promoteLegacy: (entry: WorkspaceEntry) => void): WorkspaceEntry {
  const root = registeredWorkspaceRoot(home, request.real, request.registryId);
  if (!sameWorkspaceRoot(root, request)) throw new WorkspaceError("승인 뒤 워크스페이스 디렉터리가 바뀌었다");
  const raw = readRawConfigFile(home);
  const config = parseConfig(raw);
  const previous = matchingEntry(config.workspaces, request.name, root, request.registryId);
  const registryIdentity = { dev: root.dev, ino: root.ino };
  if (previous?.registryId === request.registryId && previous.path === root.real &&
    previous.registryIdentity?.dev === root.dev && previous.registryIdentity.ino === root.ino) return previous;
  if (previous && !previous.registryId) promoteLegacy(previous);
  updateConfigFile(home, (configRaw) => {
    const list = (configRaw.workspaces ?? []) as Record<string, unknown>[];
    const old = list.find((entry) => entry.name === request.name);
    const next = { ...old, name: request.name, path: root.real, registryId: request.registryId, registryIdentity };
    if (previous?.registryId && previous.path !== root.real) delete (next as Record<string, unknown>).worktrees;
    configRaw.workspaces = old ? list.map((entry) => entry === old ? next : entry) : [...list, next];
  });
  const worktrees = previous && (!previous.registryId || previous.path === root.real) ? previous.worktrees : {};
  return { name: request.name, path: root.real, registryId: request.registryId, registryIdentity, worktrees: { ...worktrees, main: root.real } };
}
