import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { packageRoot } from "../src/core/paths.ts";
import { tempDir } from "./helpers.ts";
import { archive, fakeReleaseIo, releaseArchive } from "./fixtures/install-release.ts";

const script = join(packageRoot, "scripts", "install.sh");
const skip = process.platform === "win32" ? "install.sh는 macOS·Linux 전용" : false;
const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "").trim();

function run(home: string, args: string[]) {
  return spawnSync("bash", [script, "--repo", packageRoot, ...args], {
    encoding: "utf8",
    // 실제 PATH의 ~/.pace/bin이 섞이지 않게 최소 PATH로 실행한다.
    env: { PACE_NO_TTY: "1", HOME: home, SHELL: "/bin/zsh", PATH: `${join(process.execPath, "..")}:/usr/bin:/bin` },
    input: "",
    timeout: 30_000,
  });
}

test("신규 설치: 훅 등록, pace 링크, PATH를 zshrc에 한 번만 추가", { skip }, () => {
  const home = tempDir("pace-sh-");
  mkdirSync(join(home, ".claude"));
  const first = run(home, ["--yes"]);
  assert.equal(first.status, 0, first.stderr + first.stdout);
  // 성공하면 결과 한 줄만 보인다.
  assert.match(plain(first.stdout), /^✓ PACE \S+ 설치 완료$/);
  assert.ok(existsSync(join(home, ".pace", "bin", "pace")));
  assert.ok(existsSync(join(home, ".pace", "install.json")));
  assert.match(readFileSync(join(home, ".claude", "settings.json"), "utf8"), /boot --host claude/);
  assert.doesNotMatch(first.stdout, /온보딩/, "설치는 설치까지만, 온보딩 안내 없음");

  const second = run(home, ["--yes"]);
  assert.equal(second.status, 0, second.stderr);
  assert.match(plain(second.stdout), /^✓ PACE \S+ 업데이트 완료$/);
  const rc = readFileSync(join(home, ".zshrc"), "utf8");
  assert.equal(rc.split('export PATH="$HOME/.pace/bin:$PATH"').length - 1, 1);
});

test("미리보기는 아무것도 바꾸지 않는다", { skip }, () => {
  const home = tempDir("pace-sh-");
  mkdirSync(join(home, ".claude"));
  const result = run(home, ["--yes", "--dry-run"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[미리보기\]/);
  assert.ok(!existsSync(join(home, ".pace")));
  assert.ok(!existsSync(join(home, ".claude", "settings.json")));
});

test("원격 설치는 Git 없이 최신 정식 릴리즈를 설치하고 명시 ref로 업데이트한다", { skip }, () => {
  const home = tempDir("pace-sh-release-");
  const temp = join(home, "tmp");
  mkdirSync(temp);
  const tempAlias = join(home, "임시 폴더");
  symlinkSync(temp, tempAlias);
  mkdirSync(join(home, ".claude"));
  const claudeConfig = join(home, ".claude", "settings.json");
  writeFileSync(claudeConfig, JSON.stringify({ permissions: { defaultMode: "default" } }));
  const oldRepo = join(home, ".local", "share", "pace");
  mkdirSync(join(oldRepo, "bin"), { recursive: true });
  mkdirSync(join(oldRepo, ".git"));
  writeFileSync(join(oldRepo, "bin", "pace.ts"), "throw new Error('old cache executed')");
  writeFileSync(join(oldRepo, ".git", "HEAD"), "ref: refs/heads/local\n");
  const data = join(home, "pace-data");
  const profile = join(data, "profiles", "default");
  mkdirSync(profile, { recursive: true });
  writeFileSync(join(profile, "SOUL.md"), "user profile");
  writeFileSync(join(profile, "MEMORY.md"), "user memory");
  const io = fakeReleaseIo(home);
  const bundle = join(home, "bundle.tar.gz");
  const invoke = (version: string, args: string[] = [], overrides: NodeJS.ProcessEnv = {}) => {
    writeFileSync(io.PACE_TEST_NETWORK!, "");
    return spawnSync("bash", ["-s", "--", ...args], {
      input: readFileSync(script, "utf8"), cwd: home, encoding: "utf8", timeout: 30_000,
      env: { ...io, HOME: home, SHELL: "/bin/zsh", TMPDIR: tempAlias, PACE_HOME: data,
        PACE_TEST_ARCHIVE: bundle, PACE_TEST_VERSION: version, PACE_REPO: oldRepo, ...overrides },
    });
  };
  const api = "https://api.github.com/repos/ceo4ever/pace";
  writeFileSync(bundle, releaseArchive("1.2.3"));
  const first = invoke("1.2.3");
  assert.equal(first.status, 0, first.stderr + first.stdout);
  assert.equal(plain(first.stdout), "✓ PACE 1.2.3 설치 완료");
  assert.deepEqual(readFileSync(io.PACE_TEST_NETWORK!, "utf8").trim().split("\n"), [
    `${api}/releases/latest`, `${api}/tarball/refs%2Ftags%2Fv1.2.3`, "https://codeload.github.com/artifact",
  ]);
  assert.deepEqual(readdirSync(temp), []);

  writeFileSync(bundle, releaseArchive("2.3.4"));
  const second = invoke("2.3.4", ["--ref", "release/2.3.4"], { PACE_REF: "ignored", PACE_REPO_URL: "https://github.com/example/pace.git" });
  assert.equal(second.status, 0, second.stderr + second.stdout);
  assert.equal(plain(second.stdout), "✓ PACE 2.3.4 업데이트 완료");
  assert.deepEqual(readFileSync(io.PACE_TEST_NETWORK!, "utf8").trim().split("\n"), [
    "https://api.github.com/repos/example/pace/tarball/release%2F2.3.4", "https://codeload.github.com/artifact",
  ]);
  const app = join(home, ".pace", "app");
  const manifest = join(app, "package.json");
  const installed = readFileSync(manifest, "utf8");
  assert.equal(JSON.parse(installed).version, "2.3.4");
  assert.equal(readFileSync(join(profile, "SOUL.md"), "utf8"), "user profile");
  assert.equal(readFileSync(join(profile, "MEMORY.md"), "utf8"), "user memory");
  assert.equal(JSON.parse(readFileSync(claudeConfig, "utf8")).permissions.defaultMode, "default");
  assert.equal(readFileSync(join(oldRepo, "bin", "pace.ts"), "utf8"), "throw new Error('old cache executed')");
  assert.equal(readFileSync(join(oldRepo, ".git", "HEAD"), "utf8"), "ref: refs/heads/local\n");
  const expectFailure = (result: ReturnType<typeof invoke>, error: RegExp) => {
    assert.equal(result.status, 1, result.stderr + result.stdout);
    assert.match(result.stderr, error);
    assert.equal(result.stdout, "");
    assert.equal(readFileSync(manifest, "utf8"), installed);
    assert.deepEqual(readdirSync(temp), []);
  };
  expectFailure(invoke("2.3.4", [], { PACE_TEST_HTTP: "lookup" }), /최신 정식 릴리즈 조회.*HTTP 503/);
  expectFailure(invoke("2.3.4", [], { PACE_TEST_HTTP: "oversize" }), /최신 정식 릴리즈 조회.*크기 한도/);
  for (const kind of ["draft", "prerelease"]) {
    expectFailure(invoke("2.3.4", [], { PACE_TEST_HTTP: kind }), /공개 정식 릴리즈의 정보가 올바르지 않습니다/);
    assert.equal(readFileSync(io.PACE_TEST_NETWORK!, "utf8"), `${api}/releases/latest\n`);
  }
  expectFailure(invoke("2.3.4", [], { PACE_TEST_HTTP: "archive" }), /아카이브 다운로드.*HTTP 404/);
  expectFailure(invoke("2.3.4", [], { PACE_TEST_HTTP: "redirect" }), /허용되지 않은 다운로드 주소/);
  expectFailure(invoke("3.4.5"), /PACE 버전이 일치하지 않습니다/);
  expectFailure(invoke("2.3.4", ["--repo", join(home, "missing")]), /PACE 소스를 찾을 수 없습니다/);
  assert.equal(readFileSync(io.PACE_TEST_NETWORK!, "utf8"), "");
  mkdirSync(`${app}.new`);
  expectFailure(invoke("2.3.4"), /설치 임시 폴더.*원본을 보존/);
  writeFileSync(bundle, "not a gzip file");
  expectFailure(invoke("2.3.4"), /incorrect header check/);
  for (const { entries, error } of [
    { entries: [{ path: "repo/../../escaped", type: "0" }], error: /안전하지 않은 경로/ },
    { entries: [{ path: "repo/child", type: "1" }], error: /파일·폴더 이외의 TAR 항목/ },
    { entries: [{ path: "repo/child", type: "2" }], error: /파일·폴더 이외의 TAR 항목/ },
    { entries: [{ path: "repo/run:stream", type: "0" }], error: /안전하지 않은 경로/ },
    { entries: [{ path: "repo/missing/child", type: "0" }], error: /부모 폴더 불일치/ },
    { entries: [{ path: "repo/item", type: "0" }, { path: "repo/Item", type: "0" }], error: /중복 경로/ },
  ] as const) {
    writeFileSync(bundle, archive([{ path: "repo", type: "5" }, ...entries]));
    expectFailure(invoke("2.3.4"), error);
    assert.equal(existsSync(join(home, "escaped")), false);
  }
});
