import { existsSync, lstatSync, mkdirSync, openSync, closeSync, fsyncSync, writeFileSync, unlinkSync, rmdirSync, realpathSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { safeTeamPath } from "../team/store.ts";
import { processIdentity } from "../team/resource-process.ts";
import { commonGitDirectory } from "../team/resource-lock.ts";
import { atomicText, BODY_LIMIT, createDir, digest, fields, gitRead, HandoffError, HandoffGuardBusy, localHandoffBase, object, regularBytes, strictJson, utf8, within } from "./handoff-files.ts";
import { hasSecret } from "./secrets.ts";

interface BlockedSource { rootHash: string; pathHash: string; rel?: string; publicBaselineHash?: string }
function blockedSources(base: string): BlockedSource[] {
  const path = safeTeamPath(base, "staging-protection.json");
  if (!existsSync(path)) return [];
  const value = strictJson(utf8(regularBytes(path, BODY_LIMIT)));
  fields(value, ["version", "sources"]);
  if (value.version !== 1 || !Array.isArray(value.sources)) throw new HandoffError("원문 staging 보호 목록 손상");
  return value.sources.map((source: unknown) => {
    fields(source, ["rootHash", "pathHash", "rel", "publicBaselineHash"], ["rootHash", "pathHash"]);
    if (typeof source.rootHash !== "string" || !/^[0-9a-f]{64}$/.test(source.rootHash) || typeof source.pathHash !== "string" || !/^[0-9a-f]{64}$/.test(source.pathHash) || source.rel !== undefined && typeof source.rel !== "string") throw new HandoffError("원문 staging 보호 항목 손상");
    if (source.publicBaselineHash !== undefined && (typeof source.publicBaselineHash !== "string" || !/^[0-9a-f]{64}$/.test(source.publicBaselineHash))) throw new HandoffError("공개 추적 파일 기준 지문 손상");
    return source as unknown as BlockedSource;
  });
}
function holdGuard<T>(root: string, name: string, action: (writing: () => void) => T): T {
  const path = safeTeamPath(root, name, true);
  try { mkdirSync(path, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new HandoffGuardBusy("소통 원장 guard 경합/중단; 소유자 확인 후 재시도"); throw error; }
  let cleanup = false;
  try {
    atomicText(path, "owner.json", JSON.stringify({ owner: processIdentity(process.pid), at: new Date().toISOString() }));
    cleanup = true;
    const result = action(() => { cleanup = false; }); cleanup = true; return result;
  }
  finally { if (cleanup) { safeTeamPath(path, "owner.json"); unlinkSync(resolve(path, "owner.json")); rmdirSync(path); } }
}
/** Explicit body input is never copied to a working tree. Attempted in-repo inputs are protected from finish. */
export function readPrivateInput(repoRoot: string, input: string): Buffer {
  const path = resolve(input), stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new HandoffError("본문 입력은 단일 링크 일반 파일이어야 한다");
  const actual = realpathSync.native(path), parent = gitRead(dirname(actual), ["rev-parse", "--show-toplevel"]);
  const localBase = localHandoffBase(repoRoot);
  if (parent.status === 0) {
    const sourceRoot = realpathSync.native(parent.stdout.trim());
    if (within(sourceRoot, actual) && !within(localBase, actual)) {
      if (localHandoffBase(sourceRoot) === localBase) {
        createDir(dirname(localBase), "handoffs");
        holdGuard(localBase, "privacy.guard", (writing) => {
          const sources = blockedSources(localBase), rel = relative(sourceRoot, actual).split(sep).join("/");
          const tracked = gitRead(sourceRoot, ["ls-files", "--error-unmatch", "--", rel]);
          const status = gitRead(sourceRoot, ["status", "--porcelain=v1", "--untracked-files=all", "--", rel]);
          const cleanPublic = tracked.status === 0 && status.status === 0 && !status.stdout;
          let publicBaselineHash: string | undefined;
          try {
            if (cleanPublic) publicBaselineHash = digest(regularBytes(actual, BODY_LIMIT));
            else if (tracked.status === 0) {
              const head = gitRead(sourceRoot, ["show", `HEAD:${rel}`]);
              if (head.status === 0 && Buffer.byteLength(head.stdout) <= BODY_LIMIT) publicBaselineHash = digest(head.stdout);
            }
          } catch { /* Still protect the attempted private path when no public baseline can be established. */ }
          const row: BlockedSource = { rootHash: digest(sourceRoot), pathHash: digest(rel), ...(!hasSecret(rel) && rel.length <= 1024 ? { rel } : {}), ...(publicBaselineHash ? { publicBaselineHash } : {}) };
          if (!sources.some((s) => s.rootHash === row.rootHash && s.pathHash === row.pathHash)) sources.push(row);
          writing(); atomicText(localBase, "staging-protection.json", JSON.stringify({ version: 1, sources }));
        });
      }
      throw new HandoffError("원문/상세 본문은 working tree 밖 또는 로컬 전용 Git 폴더에 둔다; 알려진 경로는 finish staging을 보류한다");
    }
  } else if (!within(localBase, actual) && !/not a git repository/i.test(parent.stderr)) throw new HandoffError("본문 입력의 Git 경계를 확인하지 못했다");
  return regularBytes(actual, BODY_LIMIT);
}
export function handoffPrivacyIssues(repoRoot: string): string[] {
  try {
    // Legacy projects without any local handoff state do not adopt its storage-location policy.
    if (!existsSync(safeTeamPath(commonGitDirectory(repoRoot), "pace/handoffs", true))) return [];
    const base = localHandoffBase(repoRoot);
    if (!existsSync(base)) return [];
    if (existsSync(safeTeamPath(base, "privacy.guard", true))) return ["로컬 원문 staging 보호 기록 중단/경합; finish 보류"];
    const rootHash = digest(realpathSync.native(repoRoot)), blocked = blockedSources(base).filter((s) => s.rootHash === rootHash);
    if (!blocked.length) return [];
    const result = gitRead(repoRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
    if (result.status !== 0) throw new HandoffError("원문 staging 후보 확인 실패");
    const paths: string[] = [], parts = result.stdout.split("\0");
    for (let i = 0; i < parts.length; i++) {
      const entry = parts[i]!; if (entry.length < 4) continue;
      paths.push(entry.slice(3)); if (/[RC]/.test(entry.slice(0, 2)) && parts[i + 1]) paths.push(parts[++i]!);
    }
    const tracked = gitRead(repoRoot, ["ls-files", "-z"]);
    if (tracked.status !== 0) throw new HandoffError("원문 추적 파일 확인 실패");
    paths.push(...tracked.stdout.split("\0").filter(Boolean));
    const hits = [...new Set(paths.filter((p) => blocked.some((b) => {
      if (b.pathHash !== digest(p)) return false;
      if (b.publicBaselineHash) {
        try { if (digest(regularBytes(safeTeamPath(repoRoot, p), BODY_LIMIT)) === b.publicBaselineHash) return false; } catch { /* changed/unreadable is not the previously committed public bytes */ }
      }
      return true;
    })))];
    return hits.map((p) => `로컬 전용 원문 staging 금지: ${hasSecret(p) ? "[경로 생략]" : p} — 원문을 저장소 밖으로 옮긴 뒤 확인한다`);
  } catch { return ["로컬 원문 staging 보호 확인 실패; finish를 진행하지 않는다"]; }
}

export class PrivateHandoffBodies {
  readonly base: string;
  readonly root: string;
  constructor(repoRoot: string, project: string, dir: string) {
    this.base = localHandoffBase(repoRoot);
    this.root = safeTeamPath(this.base, `${project}-${digest(dir).slice(0, 16)}`, true);
  }
  ensure(): void {
    createDir(dirname(this.base), "handoffs");
    createDir(this.base, this.root.slice(this.base.length + 1));
  }
  locked<T>(action: (writing: () => void) => T): T { this.ensure(); return holdGuard(this.root, "ledger.guard", action); }
  path(hash: string): string {
    if (!/^[0-9a-f]{64}$/.test(hash)) throw new HandoffError("본문 content ID 오류");
    return safeTeamPath(this.root, `bodies/${hash}.md`);
  }
  read(hash: string): Buffer | null {
    const path = this.path(hash); if (!existsSync(path)) return null;
    const bytes = regularBytes(path, BODY_LIMIT);
    if (digest(bytes) !== hash) throw new HandoffError("로컬 본문 지문 불일치");
    utf8(bytes); return bytes;
  }
  capture(input: Buffer | string): { hash: string; path: string } {
    if (typeof input === "string" && !input.isWellFormed()) throw new HandoffError("본문 Unicode 오류");
    const bytes = typeof input === "string" ? Buffer.from(input) : input;
    const text = utf8(bytes);
    if (!text.trim() || bytes.length > BODY_LIMIT || hasSecret(text)) throw new HandoffError("본문 비밀 후보/빈값/크기 거부; 원문을 자르거나 바꿔 승인 근거로 쓰지 않는다");
    this.ensure(); createDir(this.root, "bodies");
    const hash = digest(bytes), path = this.path(hash), old = this.read(hash);
    if (!old) atomicText(resolve(this.root, "bodies"), `${hash}.md`, bytes);
    return { hash, path };
  }
  journalDir(): string { this.ensure(); return createDir(this.root, "resource-events"); }
}
