import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { packageRoot } from "../src/core/paths.ts";
import { sessionFreeEnv, tempDir } from "./helpers.ts";

const scan = (root: string) => spawnSync(process.execPath, [join(packageRoot, "scripts", "secret-scan.ts"), root], { encoding: "utf8", env: sessionFreeEnv() });

test("secret-scan: 커밋될 파일(추적 + 무시되지 않는 새 파일)의 비밀 원문은 실패, 제외·무시·바이너리·환경 변수 이름은 통과", () => {
  const root = tempDir("pace-scan-");
  const git = (...args: string[]) => assert.equal(spawnSync("git", ["-C", root, ...args]).status, 0);
  git("init", "-q", "-b", "main");
  writeFileSync(join(root, "app.env.md"), "API_KEY = E2E_API_KEY\n");
  // 제외 목록은 파일 단위 — 같은 폴더의 다른 파일, 이름이 겹치는 다른 경로는 검사한다
  mkdirSync(join(root, "test"));
  writeFileSync(join(root, "test", "secret-scan.test.ts"), 'const token = "abcdefgh12345";\n');
  writeFileSync(join(root, "test", "image.bin"), Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from("secret: abcdefgh12345")]));
  writeFileSync(join(root, ".gitignore"), "local.md\n");
  writeFileSync(join(root, "local.md"), "password=hunter2hunter2\n");
  git("add", "app.env.md", "test/secret-scan.test.ts");
  const clean = scan(root);
  assert.equal(clean.status, 0, clean.stderr);
  assert.match(clean.stdout, /비밀 검사 통과: 2개 파일/, "app.env.md·.gitignore만 — 제외 파일·바이너리·무시된 local.md는 세지 않는다");

  // 추적하지 않아도 무시 목록에 없으면 커밋될 수 있다 — finish가 git add -A로 커밋한다
  writeFileSync(join(root, "notes.md"), "secret: abcdefgh12345\n");
  const untracked = scan(root);
  assert.equal(untracked.status, 1);
  assert.match(untracked.stderr, /비밀 노출 의심 1건[\s\S]*- notes\.md/);

  writeFileSync(join(root, "notes.md"), "없음\n");
  mkdirSync(join(root, "docs", "test"), { recursive: true });
  writeFileSync(join(root, "docs", "test", "secret-scan.test.ts"), 'const token = "abcdefgh12345";\n');
  const nested = scan(root);
  assert.equal(nested.status, 1, "제외는 경로 전체가 같을 때만");
  assert.match(nested.stderr, /- docs\/test\/secret-scan\.test\.ts/);
});

test("secret-scan: git 저장소가 아니면 한 줄 오류와 종료 코드 1", () => {
  const r = scan(tempDir("pace-scan-none-"));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^비밀 검사 실패: git 파일 목록을 읽지 못했다/);
  assert.doesNotMatch(r.stderr, /at .*\.ts:\d+/, "스택을 내지 않는다");
});

test("secret-scan: 봉인 JS 오탐은 정확한 경로와 바이트만 제외한다", () => {
  const root = tempDir("pace-scan-vendor-");
  assert.equal(spawnSync("git", ["-C", root, "init", "-q"]).status, 0);
  const dir = "skills/pace-canvas-skills/runtime/app/_next/static/chunks";
  const names = ["38.80f58c91800c3def.js", "4bd1b696-5baba7b99ef0a4e0.js", "985.c156f701f79f13d9.js", "framework-319ad94eef5a05ff.js", "polyfills-42372ed130431b0a.js"];
  for (const name of names) {
    const relative = join(dir, name);
    const dest = join(root, relative);
    mkdirSync(join(dest, ".."), { recursive: true });
    const bytes = readFileSync(join(packageRoot, relative));
    writeFileSync(dest, bytes);
    assert.equal(scan(root).status, 0, relative);
    writeFileSync(dest, Buffer.concat([bytes, Buffer.from(" ")]));
    assert.equal(scan(root).status, 1, `one byte: ${relative}`);
    writeFileSync(dest, Buffer.concat([bytes, Buffer.from('\nsecret: abcdefgh12345\n')]));
    assert.equal(scan(root).status, 1, `added secret: ${relative}`);
    writeFileSync(dest, bytes);
  }
  const similar = join(root, "skills/pace-canvas-skills/runtime/app/_next/static/chunks-copy", names[0]!);
  mkdirSync(join(similar, ".."), { recursive: true });
  writeFileSync(similar, readFileSync(join(packageRoot, dir, names[0]!)));
  assert.equal(scan(root).status, 1, "다른 경로는 같은 바이트여도 검사");
  rmSync(similar);
  const old = join(root, "skills/canvas-skills/runtime/app/_next/static/chunks", names[0]!);
  mkdirSync(join(old, ".."), { recursive: true });
  writeFileSync(old, readFileSync(join(packageRoot, dir, names[0]!)));
  assert.equal(scan(root).status, 1, "이전 경로는 같은 바이트여도 검사");
});
