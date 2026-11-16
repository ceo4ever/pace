import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { packageRoot } from "../src/core/paths.ts";
import { tempDir } from "./helpers.ts";

const script = join(packageRoot, "scripts", "install.sh");
const skip = process.platform === "win32" ? "install.sh는 macOS·Linux 전용" : false;

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
  const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "").trim();
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
