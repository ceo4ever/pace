import test from "node:test";
import assert from "node:assert/strict";
import fs, { appendFileSync, chmodSync, existsSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { syncBuiltinESMExports } from "node:module";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { reusableGitFixture, sessionFreeEnv, tempDir } from "./helpers.ts";

const home = tempDir("pace-git-test-home-");
function git(root: string, ...args: string[]) {
  return spawnSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", "-C", root, ...args], { env: { ...sessionFreeEnv(), HOME: home, USERPROFILE: home }, encoding: "utf8" });
}
function ok(root: string, ...args: string[]) {
  const result = git(root, ...args); assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
}
function initialize(root: string) {
  ok(root, "init", "-q", "-b", "main");
  writeFileSync(join(root, "a.txt"), "seed\n");
  writeFileSync(join(root, "binary.bin"), Buffer.from([0, 255, 3]));
  ok(root, "add", "-A"); ok(root, "commit", "-qm", "init");
}
function digest(root: string): string {
  const hash = createHash("sha256");
  const walk = (dir: string, prefix = "") => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = `${prefix}/${entry.name}`, path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path, rel); else hash.update(rel + "\0").update(readFileSync(path));
    }
  };
  walk(root); return hash.digest("hex");
}

test("Git fixture: 처음부터 독립 복사하고 작업 파일·config·index·ref·object와 원본을 분리한다", () => {
  let calls = 0, seed = "";
  const copy = reusableGitFixture((root) => { calls++; seed = root; initialize(root); });
  const a = tempDir(), b = tempDir(), c = tempDir();
  copy(a); const before = digest(seed); copy(b);
  assert.notEqual(seed, a); assert.notEqual(seed, b);
  const head = ok(a, "rev-parse", "HEAD"), blob = ok(a, "rev-parse", "HEAD:a.txt");
  assert.equal(ok(b, "rev-parse", "HEAD"), head);
  assert.deepEqual(readFileSync(join(b, "binary.bin")), Buffer.from([0, 255, 3]));
  writeFileSync(join(a, "a.txt"), "changed\n");
  appendFileSync(join(a, ".git/config"), "\n[fixture]\nmarker = only-a\n");
  ok(a, "add", "a.txt"); ok(a, "commit", "-qm", "only-a");
  const changedHead = ok(a, "rev-parse", "HEAD");
  assert.notEqual(changedHead, head);
  assert.equal(ok(b, "status", "--porcelain"), "");
  assert.equal(ok(b, "rev-parse", "HEAD"), head);
  assert.notEqual(git(b, "cat-file", "-e", changedHead).status, 0);
  assert.equal(readFileSync(join(b, "a.txt"), "utf8"), "seed\n");
  assert.doesNotMatch(readFileSync(join(b, ".git/config"), "utf8"), /only-a/);
  const object = join(a, ".git/objects", blob.slice(0, 2), blob.slice(2));
  chmodSync(object, 0o600); writeFileSync(object, "corrupt only-a object");
  assert.equal(ok(b, "cat-file", "-p", blob), "seed");
  copy(c);
  assert.equal(calls, 1);
  assert.equal(ok(c, "rev-parse", "HEAD"), head);
  assert.equal(ok(c, "cat-file", "-p", blob), "seed");
  assert.equal(ok(c, "status", "--porcelain"), "");
  assert.doesNotMatch(readFileSync(join(c, ".git/config"), "utf8"), /only-a/);
  assert.equal(digest(seed), before);
});

test("Git fixture: 비어 있지 않은/연결/비소유 대상과 비자기완결 원본을 거부한다", () => {
  let called = 0;
  const never = reusableGitFixture(() => { called++; });
  const nonempty = tempDir(); writeFileSync(join(nonempty, "keep"), "keep");
  assert.throws(() => never(nonempty), /empty owned/);
  assert.equal(readFileSync(join(nonempty, "keep"), "utf8"), "keep");
  const target = tempDir(), link = join(tempDir(), "link");
  symlinkSync(target, link, "dir");
  assert.throws(() => never(link), /empty owned/);
  assert.throws(() => never(process.env.PACE_TEST_TMP_PARENT!), /empty owned/);
  assert.equal(called, 0);
  assert.throws(() => reusableGitFixture((root) => writeFileSync(join(root, ".git"), "gitdir: external"))(tempDir()), /own .git directory/);
  assert.throws(() => reusableGitFixture((root) => { initialize(root); writeFileSync(join(root, ".git/objects/info/alternates"), "external\n"); })(tempDir()), /self-contained/);
  assert.throws(() => reusableGitFixture((root) => { ok(root, "init", "-q"); })(tempDir()), /must be committed/);
});

test("Git fixture: 준비 실패를 캐시하지 않고 다음 호출이 정상 원본을 준비한다", () => {
  let called = 0;
  const copy = reusableGitFixture((root) => {
    called++;
    if (called === 1) { writeFileSync(join(root, "partial"), "failed"); throw new Error("injected preparation failure"); }
    initialize(root);
  });
  const failed = tempDir(), a = tempDir(), b = tempDir();
  assert.throws(() => copy(failed), /injected preparation failure/);
  assert.deepEqual(readdirSync(failed), []);
  copy(a); copy(b);
  assert.equal(called, 2); assert.equal(existsSync(join(a, "partial")), false);
  assert.equal(ok(a, "rev-parse", "HEAD"), ok(b, "rev-parse", "HEAD"));
});

test("Git fixture: 최초 복사 오류도 정상 캐시로 등록하지 않는다", () => {
  let called = 0;
  const copy = reusableGitFixture((root) => { called++; initialize(root); });
  const failed = tempDir(), a = tempDir(), b = tempDir();
  const original = fs.cpSync;
  fs.cpSync = ((...args: Parameters<typeof fs.cpSync>) => {
    if (args[1] === failed) throw new Error("injected copy failure");
    return original(...args);
  }) as typeof fs.cpSync;
  syncBuiltinESMExports();
  try { assert.throws(() => copy(failed), /injected copy failure/); }
  finally { fs.cpSync = original; syncBuiltinESMExports(); }
  copy(a); copy(b);
  assert.equal(called, 2);
  assert.equal(ok(a, "rev-parse", "HEAD"), ok(b, "rev-parse", "HEAD"));
});
