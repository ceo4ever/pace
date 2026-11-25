import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { delimiter, join, relative, sep } from "node:path";
import { writeFileAtomic } from "../core/fsutil.ts";
import { inputHash, type InputSnapshot } from "../core/input-snapshot.ts";
import { safeTeamPath } from "../team/store.ts";
import { fields, HandoffError, strictJson } from "./handoff-files.ts";
import { metadataJson } from "./team-input.ts";
import { hasTeamContract, inspectTeamMarker } from "./team-contract.ts";
import { eventLines } from "./event-log.ts";

export const teamFinishFile = "TEAM-FINISH.json";
type Git = (args: string[], env?: Record<string, string>) => { status: number | null; stdout: string; stderr: string };
type CheckStatus = "passed" | "not-run";
const oid = (value: unknown): value is string => typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
function seal(value: unknown, id: string): { tree: string; checkedParent?: string; checkStatus: CheckStatus | "unrecorded" } {
  fields(value, ["version", "kind", "project", "tree", "checkedParent", "checkStatus"], ["version", "kind", "project", "tree"]);
  if (value.version !== 1 || value.kind !== "pace-team-finish" || value.project !== id || !oid(value.tree) ||
      value.checkedParent !== undefined && !oid(value.checkedParent) ||
      value.checkStatus !== undefined && value.checkStatus !== "passed" && value.checkStatus !== "not-run") throw new HandoffError("팀 finish 영수증 형식/소유 프로젝트 오류");
  return { tree: value.tree, checkedParent: value.checkedParent, checkStatus: value.checkStatus ?? "unrecorded" };
}
function run(git: Git, args: string[], env: Record<string, string> = {}): string {
  const r = git(args, { GIT_NO_LAZY_FETCH: "1", ...env });
  if (r.status !== 0) throw new HandoffError("팀 finish Git tree 대조 실패");
  return r.stdout.trim();
}
function blob(git: Git, target: string, path: string): string {
  const result = git(["show", `${target}:${path}`], { GIT_NO_LAZY_FETCH: "1" });
  if (result.status !== 0) throw new HandoffError("팀 finish Git 입력을 읽지 못했다");
  return result.stdout;
}
/** A private index and objects let Git inspect a tree without changing the repository's index or blobs. */
function withCandidateIndex<T>(git: Git, tree: string, apply: (candidate: Git, folder: string) => T): T {
  const temp = mkdtempSync(join(tmpdir(), "pace-team-finish-"));
  try {
    const realObjects = run(git, ["rev-parse", "--path-format=absolute", "--git-path", "objects"]);
    const objects = join(temp, "objects");
    mkdirSync(objects);
    const env = {
      GIT_OBJECT_DIRECTORY: objects,
      GIT_ALTERNATE_OBJECT_DIRECTORIES: [JSON.stringify(realObjects), process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES].filter(Boolean).join(delimiter),
      GIT_INDEX_FILE: join(temp, "index"),
    };
    const candidate: Git = (args, extra) => git(args, { ...env, ...extra });
    run(candidate, ["read-tree", tree]);
    return apply(candidate, temp);
  } finally { rmSync(temp, { recursive: true, force: true }); }
}

function withoutSeal(git: Git, tree: string, path: string): string {
  return withCandidateIndex(git, tree, (candidate) => {
    run(candidate, ["--literal-pathspecs", "update-index", "--force-remove", "--", path]);
    return run(candidate, ["write-tree"]);
  });
}

export function commitTeamFinish(git: Git, checkedTree: string, parent: string, message: string, receipt?: { path: string; content: string }): void {
  const branch = run(git, ["symbolic-ref", "HEAD"]);
  const tree = run(git, ["write-tree"]);
  if ((receipt ? withoutSeal(git, tree, receipt.path) : tree) !== checkedTree ||
      (receipt && sealEntry(git, tree, receipt.path) !== receipt.content)) {
    throw new HandoffError("팀 마감 인덱스가 검증한 Git tree와 다르다");
  }
  withCandidateIndex(git, tree, (candidate, folder) => {
    const hook = (name: string, args: string[] = []) => candidate(["hook", "run", "--ignore-missing", name, ...(args.length ? ["--", ...args] : [])], { GIT_EDITOR: ":" });
    const messagePath = join(folder, "COMMIT_EDITMSG");
    writeFileSync(messagePath, `${message}\n`, { mode: 0o600 });
    for (const [name, args] of [
      ["pre-commit", []], ["prepare-commit-msg", [messagePath, "message"]], ["commit-msg", [messagePath]],
    ] as const) {
      if (hook(name, [...args]).status !== 0) throw new HandoffError(`팀 마감 Git 훅 실패 (${name})`);
    }
    if (run(candidate, ["write-tree"]) !== tree || run(git, ["write-tree"]) !== tree ||
        run(git, ["rev-parse", "HEAD"]) !== parent || run(git, ["symbolic-ref", "HEAD"]) !== branch) {
      throw new HandoffError("팀 마감 훅 또는 동시 변경으로 검증한 Git tree나 HEAD가 바뀌었다");
    }
    const signing = git(["config", "--bool", "--get", "commit.gpgsign"]);
    const sign = signing.status === 0 && signing.stdout.trim() === "true" ? ["-S"] : [];
    const commitMessage = readFileSync(messagePath, "utf8").trim();
    if (!commitMessage) throw new HandoffError("팀 마감 Git 커밋 메시지가 비었다");
    const commit = run(git, ["commit-tree", tree, "-p", parent, ...sign, "-m", commitMessage]);
    run(git, ["update-ref", "-m", `commit: ${message}`, branch, commit, parent]);
    hook("post-commit");
  });
}
export function assertTeamFinishDestination(root: string, project: string, id: string): void {
  const rel = `${project}/${teamFinishFile}`, path = safeTeamPath(root, rel);
  // Existing foreign files are never adopted or overwritten.
  try { seal(metadataJson(path, 4096), id); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
/** The regression check covers the base commit. Finish can only add its own outputs to that tree. */
export function assertTeamFinishScope(git: Git, checkedHead: string, tree: string, outputs: readonly string[]): void {
  const result = git(["diff-tree", "-r", "--no-commit-id", "--no-renames", "--name-only", "-z", checkedHead, tree], { GIT_NO_LAZY_FETCH: "1" });
  if (result.status !== 0) throw new HandoffError("검사한 커밋과 마감 Git tree의 차이를 읽지 못했다");
  const allowed = new Set(outputs);
  if (result.stdout.split("\0").some((path) => path && !allowed.has(path))) {
    throw new HandoffError("마감 대상 밖의 staged 변경이 있다. 인덱스를 보존했으니 변경을 확인·커밋하고 finish를 다시 실행한다");
  }
}
/** Every file actually used by the team validation must survive in the committed tree. */
export function assertTeamFinishInputs(root: string, inputs: InputSnapshot, git: Git, tree: string, options?: { allowMissingFiles: boolean }): void {
  const rel = (path: string) => relative(root, path).split(sep).join("/");
  const paths = new Map([...inputs.files].map(([path, hash]) => [rel(path), hash]));
  for (const path of paths.keys()) safeTeamPath(root, path);
  const entries = paths.size ? run(git, ["--literal-pathspecs", "ls-tree", "-r", "-z", tree, "--", ...paths.keys()]).split("\0") : [];
  const tracked = new Map(entries.flatMap((entry): [string, string][] => { const m = /^100(?:644|755) blob ([a-f0-9]+)\t(.+)$/s.exec(entry); return m ? [[m[2]!, m[1]!]] : []; }));
  const listedPaths = options?.allowMissingFiles ? new Set(entries.map((entry) => entry.slice(entry.indexOf("\t") + 1))) : undefined;
  for (const [path, hash] of paths) {
    if (!tracked.has(path)) {
      if (listedPaths && !listedPaths.has(path)) continue;
      throw new HandoffError(`팀 검증 자료가 Git 인덱스에 없다: ${path} — ignored/미추적 자료를 확인하고 커밋 후 finish한다`);
    }
    const staged = git(["show", `${tree}:${path}`], { GIT_NO_LAZY_FETCH: "1" });
    const oid = tracked.get(path)!;
    const bytes = Buffer.from(staged.stdout), decodedOid = createHash(oid.length === 40 ? "sha1" : "sha256").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    if (staged.status !== 0 || decodedOid !== oid || hash !== inputHash(bytes)) throw new HandoffError(`검증한 입력과 고정 Git tree가 다르다: ${path}`);
  }
  for (const path of inputs.missing) {
    const entry = run(git, ["--literal-pathspecs", "ls-tree", "-z", tree, "--", rel(path)]);
    if (entry) throw new HandoffError(`검증 때 없던 입력이 고정 Git tree에 생겼다: ${rel(path)}`);
  }
  for (const item of inputs.directories) {
    const entry = run(git, ["--literal-pathspecs", "ls-tree", "-z", tree, "--", rel(item.path)]);
    const directory = /^040000 tree ([a-f0-9]+)\t/.exec(entry)?.[1];
    const records = directory ? run(git, ["ls-tree", ...(item.mode === "regular-files" ? ["-r"] : []), "-z", directory]).split("\0").filter(Boolean) : [];
    const names = records.filter((record) => item.mode !== "regular-files" || /^100(?:644|755) blob /.test(record)).map((record) => record.slice(record.indexOf("\t") + 1)).filter(item.accepts).sort();
    if (JSON.stringify(names) !== JSON.stringify(item.names)) throw new HandoffError(`검증 입력 목록과 고정 Git tree가 다르다: ${rel(item.path)}`);
  }
}
export function writeTeamFinish(root: string, project: string, id: string, git: Git, checked?: { tree: string; parent: string; checkStatus: CheckStatus }): string {
  assertTeamFinishDestination(root, project, id);
  const rel = `${project}/${teamFinishFile}`, path = safeTeamPath(root, rel);
  const tree = withoutSeal(git, checked?.tree ?? run(git, ["write-tree"]), rel);
  const checkedParent = checked?.parent ?? run(git, ["rev-parse", "HEAD"]);
  const checkStatus = checked?.checkStatus ?? "not-run";
  const content = `${JSON.stringify({ version: 1, kind: "pace-team-finish", project: id, tree, checkedParent, checkStatus })}\n`;
  writeFileAtomic(path, content);
  run(git, ["add", "--", rel]);
  return content;
}
function sealEntry(git: Git, target: string, path: string): string | undefined {
  const entry = run(git, ["--literal-pathspecs", "ls-tree", "-z", target, "--", path]);
  if (!/^100(?:644|755) blob [a-f0-9]+\t/.test(entry)) return undefined;
  const size = Number(run(git, ["cat-file", "-s", `${target}:${path}`]));
  if (!Number.isSafeInteger(size) || size > 4096) return undefined;
  return blob(git, target, path);
}

function changedHistory(git: Git, target: string, path: string): string[] {
  const history = run(git, ["--literal-pathspecs", "log", "--full-history", "--format=%H", target, "--", path]);
  const commits = history.split("\n").filter(Boolean);
  if (!commits.every(oid)) throw new HandoffError("팀 finish Git 이력 대조 실패");
  return commits;
}

function hasTeamHistoryAtPath(project: string, id: string, target: string, git: Git): boolean {
  const path = `${project}/${teamFinishFile}`;
  for (const commit of changedHistory(git, target, path)) {
    const content = sealEntry(git, commit, path);
    if (content === undefined) continue;
    let expected: string;
    try { expected = seal(strictJson(content), id).tree; } catch { continue; }
    if (withoutSeal(git, `${commit}^{tree}`, path) === expected) return true;
  }

  // Current files may have been removed during rebase before a seal could be written.
  const measurement = `${project}/TEAM-MEASUREMENT.json`;
  for (const commit of changedHistory(git, target, measurement)) {
    if (run(git, ["--literal-pathspecs", "ls-tree", "-z", commit, "--", measurement])) return true;
  }
  // Marker meaning can change when a surrounding fence/comment changes instead of the marker line.
  for (const [name, adopted] of [
    ["PROJECT.md", (text: string) => inspectTeamMarker(text).state === "active"],
    ["log.jsonl", (text: string) => hasTeamContract(id, "", false, eventLines(text))],
  ] as const) {
    const source = `${project}/${name}`, checked = new Set<string>();
    for (const commit of changedHistory(git, target, source)) {
      const entry = run(git, ["--literal-pathspecs", "ls-tree", "-z", commit, "--", source]);
      const oid = /^100(?:644|755) blob ([a-f0-9]+)\t/.exec(entry)?.[1];
      if (!oid || checked.has(oid)) continue;
      checked.add(oid);
      if (adopted(blob(git, commit, source))) return true;
    }
  }
  return false;
}

export function hasTeamFinishHistory(project: string, id: string, target: string, git: Git): boolean {
  if (!/^P\d{3}$/.test(id)) throw new HandoffError("팀 채택 Git 이력의 프로젝트 번호 오류");
  if (hasTeamHistoryAtPath(project, id, target, git)) return true;
  // Git rename detection depends on content similarity. The project number is the stable identity.
  const paths = run(git, ["log", "--full-history", "--name-only", "--format=", "-z", target, "--", `:(glob)projects/${id}_*/PROJECT.md`]);
  const previousPaths = new Set(paths.split("\0").filter(Boolean).map((path) => path.trimEnd().replace(/\/PROJECT\.md$/, "")));
  previousPaths.delete(project);
  return [...previousPaths].some((prior) => prior.startsWith(`projects/${id}_`) && prior.split("/").length === 2 && hasTeamHistoryAtPath(prior, id, target, git));
}

/** Returns the captured commit for adopted projects, also when their worktree is absent. */
export function checkedTeamTarget(project: string, id: string, target: string, git: Git): { target: string; checkStatus: CheckStatus | "unrecorded" } | undefined {
  const projectText = blob(git, target, `${project}/PROJECT.md`);
  const listed = run(git, ["--literal-pathspecs", "ls-tree", "-r", "--name-only", "-z", target, "--", project]).split("\0");
  const events = listed.includes(`${project}/log.jsonl`) ? eventLines(blob(git, target, `${project}/log.jsonl`)) : [];
  const adopted = hasTeamContract(id, projectText, listed.includes(`${project}/TEAM-MEASUREMENT.json`), events);
  const rel = `${project}/${teamFinishFile}`;
  const current = listed.includes(rel) ? sealEntry(git, target, rel) : undefined;
  let expected: ReturnType<typeof seal> | undefined;
  if (current !== undefined) {
    try { expected = seal(strictJson(current), id); }
    catch (error) { if (adopted) throw error; }
  }
  if (expected === undefined) {
    if (!adopted && !hasTeamFinishHistory(project, id, target, git)) return undefined;
    throw new HandoffError("팀 finish 영수증이 없거나 유효하지 않다: 팀 측정 입력을 확인하고 worktree에서 finish를 다시 실행한다");
  }
  if (withoutSeal(git, `${target}^{tree}`, rel) !== expected.tree) throw new HandoffError("팀 finish 뒤 내용이 바뀌었다: worktree에서 finish를 다시 실행한다");
  const parents = run(git, ["rev-list", "--parents", "-n", "1", target]).split(" ");
  if (parents.length !== 2 || parents[1] !== expected.checkedParent) {
    throw new HandoffError("팀 finish 대상의 부모가 검사한 커밋과 다르거나 미확인이다: worktree에서 finish를 다시 실행한다");
  }
  return { target, checkStatus: expected.checkStatus };
}
