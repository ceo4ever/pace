import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { install, uninstall } from "../src/setup/install.ts";
import { tempDir } from "./helpers.ts";

test("설정이 없는 홈에서 제거하면 빈 호스트 설정을 만들지 않는다", () => {
  const home = tempDir();
  uninstall({ home });
  assert.deepEqual(readdirSync(home), []);
});

test("PACE 설치와 제거는 다른 도구의 훅과 공유 스킬을 보존한다", () => {
  const home = tempDir();
  const skill = join(home, ".agents", "skills", "canvas-read");
  mkdirSync(skill, { recursive: true });
  writeFileSync(join(skill, ".other-managed"), "OTHER");
  writeFileSync(join(skill, "SKILL.md"), "OTHER original");
  const settings = join(home, ".claude", "settings.json");
  mkdirSync(join(home, ".claude"));
  const old = { hooks: { SessionStart: [{ hooks: [{ type: "command", command: "node /home/test/.other/app/bin/other.ts boot --host claude" }] }] } };
  writeFileSync(settings, JSON.stringify(old));
  const actions = install({ home });
  assert.ok(actions.some((action) => action.kind === "skip" && action.path === skill));
  const installed = JSON.parse(readFileSync(settings, "utf8"));
  const commands = installed.hooks.SessionStart.flatMap((group: { hooks: { command: string }[] }) => group.hooks.map(hook => hook.command));
  assert.equal(commands.length, 2);
  assert.ok(commands.includes(old.hooks.SessionStart[0]!.hooks[0]!.command));
  assert.ok(commands.some((command: string) => command.includes("pace") && command.includes("boot")));
  uninstall({ home });
  assert.equal(readFileSync(join(skill, "SKILL.md"), "utf8"), "OTHER original");
  assert.equal(readFileSync(join(skill, ".other-managed"), "utf8"), "OTHER");
  const after = JSON.parse(readFileSync(settings, "utf8"));
  assert.deepEqual(after.hooks.SessionStart, old.hooks.SessionStart);
});

test("미소유 app은 설치와 제거 때 보존된다", () => {
  const home = tempDir();
  const app = join(home, ".pace", "app");
  mkdirSync(app, { recursive: true });
  writeFileSync(join(app, "user.txt"), "keep");
  assert.throws(() => install({ home }), /관리 표지/);
  assert.equal(readFileSync(join(app, "user.txt"), "utf8"), "keep");
  uninstall({ home });
  assert.equal(readFileSync(join(app, "user.txt"), "utf8"), "keep");
});

test("관리 설치본에 사용자가 추가하거나 고친 파일은 재설치와 제거에서 보존한다", () => {
  const home = tempDir(); install({ home });
  const app = join(home, ".pace", "app"), added = join(app, "user.txt"), modified = join(app, "package.json");
  writeFileSync(added, "user file"); writeFileSync(modified, "user edit");
  assert.throws(() => install({ home }), /내용이 달라 보존/);
  assert.ok(uninstall({ home }).some((action) => action.path === app && action.kind === "skip"));
  assert.equal(readFileSync(added, "utf8"), "user file");
  assert.equal(readFileSync(modified, "utf8"), "user edit");
});

test("관리 설치본의 빈 사용자 디렉터리도 보존한다", () => {
  const home = tempDir(); install({ home });
  const dir = join(home, ".pace", "app", "user-empty"); mkdirSync(dir);
  assert.throws(() => install({ home }), /내용이 달라 보존/);
  uninstall({ home });
  assert.deepEqual(readdirSync(dir), []);
});

test("빈 기존 설정도 덮어쓰기 전에 백업한다", () => {
  const home = tempDir(), dir = join(home, ".claude"); mkdirSync(dir);
  const settings = join(dir, "settings.json"); writeFileSync(settings, "");
  install({ home });
  const record = JSON.parse(readFileSync(join(home, ".pace", "install.json"), "utf8")) as { backupDir: string };
  assert.equal(readFileSync(join(record.backupDir, ".claude", "settings.json"), "utf8"), "");
});

test("설정과 스킬 디렉터리 링크는 대상 파일을 건드리지 않는다", (t) => {
  const home = tempDir(), outside = tempDir();
  const settings = join(outside, "settings.json"), skills = join(outside, "skills");
  writeFileSync(settings, '{"user":true}\n');
  mkdirSync(skills);
  mkdirSync(join(home, ".claude")); mkdirSync(join(home, ".agents"));
  try {
    symlinkSync(settings, join(home, ".claude", "settings.json"), "file");
    symlinkSync(skills, join(home, ".agents", "skills"), "junction");
  } catch (error) {
    if (process.platform === "win32" && ["EPERM", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) { t.skip("링크 생성 권한 없음"); return; }
    throw error;
  }
  const installed = install({ home });
  const removed = uninstall({ home });
  assert.equal(readFileSync(settings, "utf8"), '{"user":true}\n');
  assert.deepEqual(readdirSync(skills), []);
  assert.ok(installed.some((action) => /링크/.test(action.detail)));
  assert.ok(removed.some((action) => /링크/.test(action.detail)));
});

test("스킬 관리 표지 링크는 소유권으로 인정하지 않는다", (t) => {
  const home = tempDir(), outside = tempDir(), skill = join(home, ".agents", "skills", "canvas-read");
  mkdirSync(skill, { recursive: true });
  const target = join(outside, "marker"); writeFileSync(target, "user");
  writeFileSync(join(skill, "SKILL.md"), "user skill");
  try { symlinkSync(target, join(skill, ".pace-managed"), "file"); }
  catch (error) {
    if (process.platform === "win32" && ["EPERM", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) { t.skip("파일 링크 권한 없음"); return; }
    throw error;
  }
  install({ home }); uninstall({ home });
  assert.equal(readFileSync(join(skill, "SKILL.md"), "utf8"), "user skill");
  assert.equal(readFileSync(target, "utf8"), "user");
});
