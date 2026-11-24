import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, fsyncSync, lstatSync, mkdirSync, openSync, realpathSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { paceHome } from "../core/paths.ts";
import { hasSecret } from "../project/secrets.ts";
import { readTeamFile, safeTeamPath } from "./store.ts";
import { loadResource, probeResource, resourceHash, safeResourceText, type Resource, type ResourceUse } from "./resources.ts";
import { inspectProcess, observeGroup, processIdentity, type Liveness, type ProcessIdentity, type ProcessObservation } from "./resource-process.ts";
import { appliedResourceEvent, prepareResourceEvent, reconcileResourceEvents, type ResourceEventSink } from "./resource-events.ts";

export interface ResourceLease {
  version: 1; active: boolean; acquisitionId: string; resource: string; scope: "repo" | "machine"; definition: string;
  by: string; owner: ProcessIdentity; cwd: string; acquiredAt: number; heartbeat: number;
  phase: "pre-start" | "started" | "manual";
  child: { identity: ProcessIdentity; group: number } | null;
  transitionId?: string;
}
export interface LockResult {
  outcome: "acquired" | "busy" | "hold" | "released" | "renewed" | "started" | "status";
  reason: string; code: 0 | 1 | 2; scope: "repo" | "machine"; active?: boolean; lease?: ResourceLease;
  owner?: Liveness; ownerCheck?: ProcessObservation["reason"]; use?: ResourceUse; probeSkipped?: boolean; guardBusy?: boolean; guardOwner?: ProcessIdentity | null; participation: string;
}
export interface Confirmation { by: "coordinator" | "captain"; evidence: string }
export interface LockDeps {
  events?: ResourceEventSink;
  home?: string; now?: () => number; self?: () => ProcessIdentity | null;
  process?: (identity: ProcessIdentity) => Liveness; group?: (group: number) => Liveness;
  probe?: (resource: Resource, cwd: string) => ResourceUse;
}
const PARTICIPATION = "잠금 참여 호출만 보호하며 비참여 직접 도구 호출을 차단하지 않는다";
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 1;
function identity(value: unknown): value is ProcessIdentity {
  return record(value) && Object.keys(value).sort().join(",") === "host,pid,platform,started" && positive(value.pid) && safeResourceText(value.started, 256) && safeResourceText(value.host, 256) && safeResourceText(value.platform, 32);
}
function readJson(root: string, name: string): unknown | null {
  const text = readTeamFile(root, name);
  if (text === null) return null;
  if (hasSecret(text)) throw new Error("잠금 파일 안전 검사 실패");
  try { return JSON.parse(text); } catch { throw new Error("잠금 파일 JSON 오류; 자동 회수하지 않는다"); }
}
function writeJson(root: string, name: string, value: unknown, exclusive = false): void {
  const text = JSON.stringify(value) + "\n";
  if (Buffer.byteLength(text) > 65536 || hasSecret(text)) throw new Error("잠금 기록 안전 검사 실패");
  const path = safeTeamPath(root, name);
  const durable = (target: string) => { const fd = openSync(target, "wx", 0o600); try { writeFileSync(fd, text); fsyncSync(fd); } finally { closeSync(fd); } };
  if (exclusive) { durable(path); return; }
  const tmpName = `.${name}.${randomUUID()}.tmp`, tmp = safeTeamPath(root, tmpName);
  durable(tmp);
  safeTeamPath(root, name);
  renameSync(tmp, path);
}
function directory(root: string, rel: string): string {
  const path = safeTeamPath(root, rel, true);
  mkdirSync(path, { recursive: true, mode: 0o700 });
  return safeTeamPath(root, rel, true);
}
function homeRoot(home: string): string {
  // PACE_HOME itself must not be a link; its parent's OS alias (e.g. /tmp) is canonicalized.
  const path = resolve(home);
  mkdirSync(dirname(path), { recursive: true });
  const parent = realpathSync.native(dirname(path)), base = join(parent, path.slice(dirname(path).length + 1));
  try { const st = lstatSync(base); if (!st.isDirectory() || st.isSymbolicLink()) throw new Error("PACE_HOME은 링크 없는 디렉터리여야 한다"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; mkdirSync(base, { mode: 0o700 }); }
  return base;
}
export function commonGitDirectory(root: string): string {
  const env = { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_NO_LAZY_FETCH: "1" };
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE"]) delete (env as NodeJS.ProcessEnv)[key];
  const r = spawnSync("git", ["-c", "core.fsmonitor=false", "-C", root, "rev-parse", "--git-common-dir"], { encoding: "utf8", timeout: 5000, env });
  if (r.status !== 0 || !r.stdout.trim()) throw new Error("Git 공통 폴더를 확인하지 못했다");
  const path = resolve(root, r.stdout.trim()), st = lstatSync(path);
  if (!st.isDirectory() || st.isSymbolicLink()) throw new Error("Git 공통 폴더는 링크 없는 디렉터리여야 한다");
  return realpathSync.native(path);
}

/** Short operation guards are never reclaimed on a timer. I/O failures leave a diagnostic hold. */
export class ResourceLock {
  readonly resource: Resource;
  readonly repoDir: string;
  readonly machineDir: string;
  readonly stateDir: string;
  readonly stateName: string;
  readonly deps: Required<Omit<LockDeps, "home" | "events">>;
  readonly events?: ResourceEventSink;
  readonly root: string;
  private ownerCheck: ProcessObservation["reason"] | undefined;
  constructor(root: string, name: string, options: LockDeps = {}) {
    this.events = options.events;
    this.root = root;
    this.resource = loadResource(root, name);
    this.repoDir = directory(commonGitDirectory(root), "pace/resources");
    this.machineDir = directory(homeRoot(options.home ?? paceHome()), "team/resources");
    this.stateDir = this.resource.scope === "repo" ? this.repoDir : this.machineDir;
    this.stateName = `${name}.json`;
    // The running wrapper knows its own birth identity. A transient ps failure must not stop its job.
    const self = processIdentity(process.pid);
    this.deps = { now: options.now ?? Date.now, self: options.self ?? (() => self), process: options.process ?? ((owner) => { const observation = inspectProcess(owner); this.ownerCheck = observation.reason; return observation.state; }), group: options.group ?? observeGroup, probe: options.probe ?? probeResource };
  }
  private result(outcome: LockResult["outcome"], reason: string, code: LockResult["code"], lease?: ResourceLease): LockResult {
    return { outcome, reason, code, scope: this.resource.scope, ...(lease ? { active: lease.active, lease } : {}), participation: PARTICIPATION };
  }
  private guard(dir: string, name: string, fn: () => LockResult): LockResult {
    const guardName = `${name}.guard`, path = safeTeamPath(dir, guardName, true);
    try { mkdirSync(path, { mode: 0o700 }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      let guardOwner: ProcessIdentity | null = null;
      try { const info = readJson(path, "owner.json"); if (record(info) && identity(info.owner)) guardOwner = info.owner; } catch { /* incomplete guard is unknown, never free */ }
      return { ...this.result("hold", "작업 guard 경합 또는 중단; 잠시 뒤 재시도하고 지속되면 코디네이터 확인 요청", 2), guardBusy: true, guardOwner };
    }
    // Any unexpected failure preserves the guard. No subsequent call can mistake partial I/O for free.
    writeJson(path, "owner.json", { owner: this.deps.self(), at: this.deps.now() }, true);
    const result = fn();
    safeTeamPath(path, "owner.json"); unlinkSync(join(path, "owner.json")); rmdirSync(path);
    return result;
  }
  private operation(fn: () => LockResult, register = true): LockResult {
    const name = this.resource.name, hash = resourceHash(this.resource);
    return this.guard(this.machineDir, `${name}.registry`, () => {
      const registryName = `${name}.scope.json`, global = readJson(this.machineDir, registryName);
      if (global !== null && (!record(global) || global.scope !== this.resource.scope)) return this.result("hold", "같은 PACE_HOME의 자원 scope 불일치; 운영자 확인 필요", 2);
      if (global === null && register) writeJson(this.machineDir, registryName, { scope: this.resource.scope }, true);
      return this.guard(this.repoDir, name, () => {
        const bindingName = `${name}.binding.json`, binding = readJson(this.repoDir, bindingName);
        if (binding !== null && (!record(binding) || binding.hash !== hash)) return this.result("hold", "저장소 자원 정의 지문 불일치; 운영자 확인 필요", 2);
        if (binding === null && register) writeJson(this.repoDir, bindingName, { hash }, true);
        const inState = () => {
          const lease = this.read();
          if (lease && lease.definition !== hash) return this.result("hold", "공유 자원 확인 방법/정의가 다르므로 보류", 2, lease);
          return fn();
        };
        return this.resource.scope === "machine" ? this.guard(this.machineDir, name, inState) : inState();
      });
    });
  }
  private read(): ResourceLease | null {
    const data = readJson(this.stateDir, this.stateName);
    if (data === null) return null;
    if (!record(data) || Object.keys(data).filter((k) => k !== "transitionId").sort().join(",") !== "acquiredAt,acquisitionId,active,by,child,cwd,definition,heartbeat,owner,phase,resource,scope,version" || data.transitionId !== undefined && (typeof data.transitionId !== "string" || !/^transition-[a-f0-9-]{36}$/.test(data.transitionId)) || data.version !== 1 || typeof data.active !== "boolean" || !uuid(data.acquisitionId) || data.resource !== this.resource.name || data.scope !== this.resource.scope ||
        typeof data.definition !== "string" || !/^[0-9a-f]{64}$/.test(data.definition) || !safeResourceText(data.by, 64) || !identity(data.owner) || !safeResourceText(data.cwd, 4096) ||
        !Number.isSafeInteger(data.acquiredAt) || !Number.isSafeInteger(data.heartbeat) || !["pre-start", "started", "manual"].includes(data.phase as string) ||
        !(data.child === null || record(data.child) && Object.keys(data.child).sort().join(",") === "group,identity" && identity(data.child.identity) && positive(data.child.group) && data.child.group === data.child.identity.pid) ||
        data.phase === "started" && data.child === null || data.phase !== "started" && data.child !== null) throw new Error("잠금 상태 손상; 자동 회수하지 않는다");
    return data as unknown as ResourceLease;
  }
  private ownerState(lease: ResourceLease, internal = false): Liveness {
    const wrapper = this.deps.process(lease.owner);
    if (!internal && wrapper === "alive") return "alive";
    if (internal) {
      const self = this.deps.self();
      if (!self || self.pid !== lease.owner.pid || self.started !== lease.owner.started || self.host !== lease.owner.host || self.platform !== lease.owner.platform) return "unknown";
    } else if (wrapper !== "dead") return "unknown";
    if (lease.phase === "pre-start") return "dead";
    if (lease.phase === "manual") return "dead";
    return lease.child ? this.deps.group(lease.child.group) : "unknown";
  }
  private audit(action: string, lease: ResourceLease, confirmation?: Confirmation): void {
    const dir = directory(this.stateDir, "audit");
    const context: Record<string, string> = {};
    for (const key of ["ORCA_TERMINAL_HANDLE", "ORCA_TERMINAL_ID", "ORCA_RUN_ID"]) if (safeResourceText(process.env[key], 128)) context[key] = process.env[key]!;
    writeJson(dir, `${this.deps.now()}-${randomUUID()}.json`, { action, at: this.deps.now(), resource: lease.resource, acquisitionId: lease.acquisitionId, by: lease.by, owner: lease.owner, phase: lease.phase, context, ...(confirmation ? { confirmation } : {}) }, true);
  }
  private commit(action: string, lease: ResourceLease, confirmation?: Confirmation, previousAcquisitionId?: string): void {
    this.audit(action, lease, confirmation);
    const event = this.events && ["acquire", "release", "reclaim"].includes(action) ? prepareResourceEvent(this.events, action as "acquire" | "release" | "reclaim", lease, this.stateName, this.deps.now(), previousAcquisitionId) : null;
    writeJson(this.stateDir, this.stateName, lease);
    if (event) appliedResourceEvent(this.events!, event);
  }
  reconcileApplied(): { reconciled: number; unconfirmed: string[] } { return this.events ? reconcileResourceEvents(this.events, this.stateDir, this.stateName) : { reconciled: 0, unconfirmed: [] }; }
  private free(lease: ResourceLease, confirmation?: Confirmation): ResourceUse {
    const state = this.deps.probe(this.resource, lease.cwd);
    if (state === "busy") return "busy";
    if (lease.phase === "manual" || state === "unknown") {
      if (confirmation && (confirmation.by === "coordinator" || confirmation.by === "captain") && safeResourceText(confirmation.evidence)) return "free";
      return "unknown";
    }
    return state;
  }
  status(): LockResult {
    return this.operation(() => {
      const lease = this.read();
      if (!lease || !lease.active) return { ...this.result("status", "잠금 없음", 0, lease ?? undefined), active: false };
      const owner = this.ownerState(lease), probeSkipped = owner === "alive", use = probeSkipped ? "unknown" : this.free(lease);
      return { ...this.result("status", owner === "dead" && use === "free" ? "종료·미사용 확인; 다음 참여 호출에서 회수 가능" : "잠금 유지; 불명확하면 코디네이터에게 소유자/자원 확인 요청", 0, lease), owner, ownerCheck: this.ownerCheck, use, probeSkipped };
    }, false);
  }
  acquire(by: string, mode: "command" | "manual" = "command"): LockResult {
    if (!safeResourceText(by, 64) || !/^(?:P\d{3}|[a-z][a-z0-9-]*)$/.test(by)) return this.result("hold", "--by 담당 식별자 오류", 2);
    const owner = this.deps.self();
    if (!owner || !identity(owner)) return this.result("hold", "자기 프로세스 시작 식별 불가; 실행 보류", 2);
    return this.operation(() => {
      const old = this.read();
      if (old?.active) {
        const state = this.ownerState(old);
        if (state !== "dead") return { ...this.result(state === "alive" ? "busy" : "hold", "이전 소유자/자식 그룹 생존 또는 종료 미확인; 회수하지 않는다", state === "alive" ? 1 : 2, old), owner: state, ownerCheck: this.ownerCheck };
        if (this.free(old) !== "free") return this.result("hold", "소유자는 종료했으나 자원 사용/미사용 불명; 코디네이터 확인 요청", 2, old);
        this.audit("reclaim", old);
      } else if (this.resource.probe && this.deps.probe(this.resource, this.root) !== "free") return this.result("hold", "자원 미사용 확인 불가; 실행 보류", 2);
      const now = this.deps.now();
      const lease: ResourceLease = { version: 1, active: true, acquisitionId: randomUUID(), resource: this.resource.name, scope: this.resource.scope, definition: resourceHash(this.resource), by, owner, cwd: this.root, acquiredAt: now, heartbeat: now, phase: mode === "manual" ? "manual" : "pre-start", child: null };
      this.commit(old?.active && this.events ? "reclaim" : "acquire", lease, undefined, old?.active ? old.acquisitionId : undefined);
      return this.result("acquired", "참여 자원 잠금 획득", 0, lease);
    });
  }
  renew(acquisitionId: string): LockResult {
    return this.operation(() => {
      const lease = this.read();
      const self = this.deps.self();
      if (!lease?.active || lease.acquisitionId !== acquisitionId || !self || lease.owner.pid !== self.pid || lease.owner.started !== self.started || lease.owner.host !== self.host || lease.owner.platform !== self.platform) return this.result("hold", "획득 토큰 또는 자기 시작 식별 불일치; 갱신 거부", 2, lease ?? undefined);
      lease.heartbeat = this.deps.now();
      // Heartbeat is display information; don't create a new audit file every five seconds.
      writeJson(this.stateDir, this.stateName, lease);
      return this.result("renewed", "자동 갱신", 0, lease);
    });
  }
  started(token: string, child: ProcessIdentity): LockResult {
    return this.operation(() => {
      const lease = this.read();
      if (!lease?.active || lease.acquisitionId !== token || lease.phase !== "pre-start" || !identity(child) || this.ownerState(lease, true) !== "dead") return this.result("hold", "START 전 소유권 대조 실패", 2, lease ?? undefined);
      lease.phase = "started"; lease.child = { identity: child, group: child.pid };
      this.commit("started-before-START", lease);
      return this.result("started", "그룹 영속 기록 완료; START 전송 가능", 0, lease);
    });
  }
  release(token: string, options: { internal?: boolean; confirmation?: Confirmation } = {}): LockResult {
    return this.operation(() => {
      const lease = this.read();
      if (!lease?.active || lease.acquisitionId !== token) return this.result("hold", "획득 토큰 불일치; 해제 거부", 2, lease ?? undefined);
      const owner = this.ownerState(lease, options.internal);
      if (owner !== "dead") return { ...this.result("hold", "소유자/자식 그룹 종료 전 해제 보류", 2, lease), owner };
      if (this.free(lease, options.confirmation) !== "free") return this.result("hold", "자원 사용 중/미사용 불명; 코디네이터 확인 요청", 2, lease);
      lease.active = false;
      this.commit("release", lease, options.confirmation);
      return this.result("released", "소유자 종료·자원 미사용 대조 후 해제", 0, lease);
    });
  }
}
