import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { install, uninstall } from "../src/setup/install.ts";
import { packageRoot } from "../src/core/paths.ts";
import { registerWorkspace } from "../src/project/workspace-registry.ts";
import { createProfile } from "../src/profile/profile.ts";
import { ALTU, sessionFreeEnv, tempDir } from "./helpers.ts";

const ORCA = "/bin/sh ~/.orca/agent-hooks/hook.sh";
const repo = packageRoot.replace(/\/$/, "");

function write(path: string, content: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

/** 다른 도구의 설정이 이미 있는 HOME. */
function otherToolHome(): string {
  const home = tempDir("pace-home-");
  write(join(home, ".other", "AGENT.md"), "old");
  write(join(home, ".other", "tools", "x"), "old");
  write(
    join(home, ".claude", "settings.json"),
    JSON.stringify({
      model: "opus",
      hooks: {
        SessionStart: [
          { _other_managed: true, hooks: [{ type: "command", command: 'bash "$HOME/.other/tools/lib/python.sh" x.py' }] },
          { hooks: [{ type: "command", command: ORCA }] },
        ],
        Stop: [{ _other_managed: true, hooks: [{ type: "command", command: "bash $HOME/.other/tools/stop.py" }] }],
      },
    }),
  );
  write(join(home, ".claude", "CLAUDE.md"), "# === OTHER START ===\nold 부트\n# === OTHER END ===\n");
  write(join(home, ".claude", "agents", "other-pm.md"), "old");
  write(join(home, ".claude", "agents", "mine.md"), "사용자 것");
  write(
    join(home, ".codex", "hooks.json"),
    JSON.stringify({
      hooks: {
        SessionStart: [
          { hooks: [{ type: "command", command: "~/.other_v2/bin/other bootstrap" }] },
          { hooks: [{ type: "command", command: ORCA }] },
        ],
      },
    }),
  );
  write(
    join(home, ".codex", "config.toml"),
    '# >>> OTHER developer_instructions >>>\ndeveloper_instructions = "old"\n# <<< OTHER developer_instructions <<<\nmodel = "gpt"\n',
  );
  write(join(home, ".codex", "other-pm.config.toml"), "old");
  write(join(home, ".gemini", "settings.json"), JSON.stringify({ hooks: { BeforeAgent: [{ hooks: [{ type: "command", command: ORCA }] }] } }));
  write(
    join(home, ".gemini", "GEMINI.md"),
    "# === GEMINI HARDENING START ===\nold\n# === GEMINI HARDENING END ===\n\n<!-- other:begin 설명 -->\nother_v2\n<!-- other:end -->\n\n사용자 메모\n\n# === OTHER START ===\nold\n# === OTHER END ===\n",
  );
  mkdirSync(join(home, ".gemini", "config"), { recursive: true });
  mkdirSync(join(home, ".gemini", "antigravity"), { recursive: true });
  write(join(home, ".cursor", "hooks.json"), JSON.stringify({ version: 1, hooks: { stop: [{ command: ORCA }] } }));
  write(join(home, ".cursor", "rules", "000-other-agent.mdc"), "old 규칙");
  return home;
}

const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));

/** 스킬이 링크가 아니라 PACE 표지가 붙은 복사본인지. */
function assertCopiedSkill(path: string, name: string, message?: string): void {
  assert.ok(!lstatSync(path).isSymbolicLink(), message);
  assert.equal(readFileSync(join(path, "SKILL.md"), "utf8"), readFileSync(join(repo, "skills", name, "SKILL.md"), "utf8"), message);
  assert.ok(existsSync(join(path, ".pace-managed")), message);
}

test("다른 도구 설정과 병존하며 PACE 훅과 스킬을 설치한다", () => {
  const home = otherToolHome();
  const legacyAgent = readFileSync(join(home, ".other", "AGENT.md"), "utf8");
  const legacyClaude = json(join(home, ".claude", "settings.json"));
  const legacyCodex = json(join(home, ".codex", "hooks.json"));
  const legacyRules = readFileSync(join(home, ".claude", "CLAUDE.md"), "utf8");
  install({ home, repo });
  const windows = process.platform === "win32";
  const bin = join(home, ".pace", "bin", windows ? "pace.cmd" : "pace");
  const app = join(home, ".pace", "app");
  const boot = windows ? `node "${join(app, "bin", "pace.ts").replaceAll("\\", "/")}"` : bin;
  assert.equal(readFileSync(join(home, ".other", "AGENT.md"), "utf8"), legacyAgent);
  assert.equal(readFileSync(join(home, ".claude", "CLAUDE.md"), "utf8"), legacyRules);
  assert.ok(existsSync(join(home, ".claude", "agents", "other-pm.md")));
  assert.equal(readFileSync(bin, "utf8"), windows ? `@echo off\r\nnode "${join(app, "bin", "pace.ts")}" %*\r\n` : `#!/bin/sh\nexec node "${join(app, "bin", "pace.ts")}" "$@"\n`);
  for (const [host, old, file] of [["claude", legacyClaude, join(home, ".claude", "settings.json")], ["codex", legacyCodex, join(home, ".codex", "hooks.json")]] as const) {
    const current = json(file);
    const commands = current.hooks.SessionStart.flatMap((g: { hooks: { command: string }[] }) => g.hooks.map((h) => h.command));
    for (const group of old.hooks.SessionStart) for (const hook of group.hooks) assert.ok(commands.includes(hook.command));
    assert.ok(commands.includes(`${boot} boot --host ${host}`));
  }
  assert.deepEqual(json(join(home, ".claude", "settings.json")).hooks.Stop, legacyClaude.hooks.Stop);
  assert.match(readFileSync(join(home, ".codex", "config.toml"), "utf8"), /"old"/);
  assert.match(readFileSync(join(home, ".gemini", "GEMINI.md"), "utf8"), /other_v2/);
  assert.equal(readFileSync(join(home, ".cursor", "rules", "000-other-agent.mdc"), "utf8"), "old 규칙");
  assert.match(readFileSync(join(home, ".cursor", "rules", "000-pace-agent.mdc"), "utf8"), /\[PACE-BOOT\]/);
  for (const dir of [".agents/skills", ".claude/skills", ".cursor/skills", ".gemini/config/skills", ".gemini/antigravity/skills"]) assertCopiedSkill(join(home, dir, "pace-project-init"), "pace-project-init", dir);
  assertCopiedSkill(join(home, ".claude", "skills", "pace-project-dev"), "pace-project-dev");
  assertCopiedSkill(join(home, ".claude", "skills", "pace-scout"), "pace-scout");
  assertCopiedSkill(join(home, ".claude", "skills", "pace-intent"), "pace-intent");
});
test("오래된 PACE 스킬만 정리하고 다른 도구·사용자 스킬은 보존한다", () => {
  const home = otherToolHome();
  install({ home, repo });
  const skills = join(home, ".claude", "skills");
  write(join(skills, "pace-old", "SKILL.md"), "오래된 PACE");
  write(join(skills, "pace-old", ".pace-managed"), "PACE");
  write(join(skills, "other-old", "SKILL.md"), "다른 도구 원본");
  write(join(skills, "other-old", ".other-managed"), "OTHER");
  write(join(skills, "mine", "SKILL.md"), "사용자 것");
  install({ home, repo });
  assert.ok(!existsSync(join(skills, "pace-old")));
  assert.equal(readFileSync(join(skills, "other-old", "SKILL.md"), "utf8"), "다른 도구 원본");
  assert.equal(readFileSync(join(skills, "mine", "SKILL.md"), "utf8"), "사용자 것");
  assertCopiedSkill(join(skills, "pace-project-init"), "pace-project-init");
});

test("다른 도구의 스킬 링크는 보존하고 PACE 관리 스킬은 재설치로 갱신한다", () => {
  const home = tempDir("pace-home-");
  mkdirSync(join(home, ".claude", "skills"), { recursive: true });
  const legacy = join(home, ".claude", "skills", "other-brain");
  symlinkSync(join(repo, "skills", "pace-brain"), legacy, "junction");
  install({ home, repo });
  assert.ok(lstatSync(legacy).isSymbolicLink());
  const skill = join(home, ".claude", "skills", "pace-brain");
  assertCopiedSkill(skill, "pace-brain");
  writeFileSync(join(skill, "SKILL.md"), "고친 내용");
  install({ home, repo });
  assertCopiedSkill(skill, "pace-brain");
  assert.ok(lstatSync(legacy).isSymbolicLink());
});
test("계정별 폴더에 PACE를 등록하고 다른 도구 설정은 보존한다", () => {
  const home = tempDir("pace-home-");
  mkdirSync(join(home, ".claude"), { recursive: true });
  const mkt = join(home, ".claude_platform_mkt");
  write(join(mkt, ".claude.json"), "{}");
  write(join(mkt, "settings.json"), JSON.stringify({ hooks: { SessionStart: [{ _other_managed: true, hooks: [{ type: "command", command: "bash $HOME/.other/tools/x.py" }] }] } }));
  write(join(mkt, "CLAUDE.md"), "# === OTHER START ===\nold\n# === OTHER END ===\n");
  write(join(mkt, "agents", "other-pm.md"), "old");
  write(join(home, ".claude_old_bak", "settings.json"), "{}");
  write(join(home, ".claude_empty", "notes.txt"), "설정 폴더 아님");
  const cx = join(home, ".codex_platform_mkt");
  write(join(cx, "config.toml"), 'model = "gpt"\n');
  write(join(cx, "other-pm.config.toml"), "old");
  const custom = join(home, "work", "claude-x");
  write(join(custom, "settings.json"), "{}");

  install({ home, repo, claudeDirs: [custom] });
  const bin = process.platform === "win32"
    ? `node "${join(home, ".pace", "app", "bin", "pace.ts").replaceAll("\\", "/")}"`
    : join(home, ".pace", "bin", "pace");
  for (const dir of [join(home, ".claude"), mkt, custom]) {
    assert.equal(json(join(dir, "settings.json")).hooks.SessionStart[0].hooks[0].command, `${bin} boot --host claude`, dir);
    assertCopiedSkill(join(dir, "skills", "pace-brain"), "pace-brain", dir);
  }
  assert.equal(json(join(mkt, "settings.json")).hooks.SessionStart.length, 2, "다른 도구 훅 보존");
  assert.match(readFileSync(join(mkt, "CLAUDE.md"), "utf8"), /old/);
  assert.ok(existsSync(join(mkt, "agents", "other-pm.md")));
  assert.ok(!existsSync(join(home, ".claude_old_bak", "skills")), "백업 폴더는 대상 아님");
  assert.ok(!existsSync(join(home, ".claude_empty", "settings.json")), "설정 파일 없는 폴더는 대상 아님");
  assert.match(readFileSync(join(cx, "config.toml"), "utf8"), /developer_instructions = '''/);
  assert.equal(json(join(cx, "hooks.json")).hooks.SessionStart[0].hooks[0].command, `${bin} boot --host codex`);
  assert.ok(existsSync(join(cx, "other-pm.config.toml")));
  const record = json(join(home, ".pace", "install.json"));
  assert.deepEqual(record.claudeDirs, [join(home, ".claude"), mkt, custom]);
  assert.deepEqual(record.codexDirs, [cx]);
});

test("두 번 설치해도 결과가 같다", () => {
  const home = otherToolHome();
  install({ home, repo });
  const snapshot = [".claude/settings.json", ".codex/hooks.json", ".codex/config.toml", ".gemini/settings.json", ".gemini/GEMINI.md", ".cursor/hooks.json"].map(
    (p) => readFileSync(join(home, p), "utf8"),
  );
  const second = install({ home, repo });
  assert.ok(second.every((action) => action.kind === "skip"));
  assert.deepEqual(
    [".claude/settings.json", ".codex/hooks.json", ".codex/config.toml", ".gemini/settings.json", ".gemini/GEMINI.md", ".cursor/hooks.json"].map((p) =>
      readFileSync(join(home, p), "utf8"),
    ),
    snapshot,
  );
});

test("미리보기는 아무것도 바꾸지 않는다", () => {
  const home = otherToolHome();
  const before = readFileSync(join(home, ".claude", "settings.json"), "utf8");
  const actions = install({ home, repo, dryRun: true });
  assert.ok(actions.length > 0);
  assert.equal(readFileSync(join(home, ".claude", "settings.json"), "utf8"), before);
  assert.ok(existsSync(join(home, ".other", "AGENT.md")));
});

test("Windows: PACE 훅과 규칙은 슬래시 경로 node를 부르고 다른 도구 훅을 보존한다", () => {
  const home = otherToolHome();
  install({ home, repo, platform: "win32" });
  const cmd = join(home, ".pace", "bin", "pace.cmd");
  const entry = join(home, ".pace", "app", "bin", "pace.ts").replace(/\\/g, "/");
  const claude = json(join(home, ".claude", "settings.json"));
  // Claude Code는 Windows에서 훅을 Git Bash로 돌린다 — 백슬래시가 있으면 경로가 깨진다.
  assert.equal(claude.hooks.SessionStart[0].hooks[0].command, `node "${entry}" boot --host claude`);
  assert.doesNotMatch(claude.hooks.SessionStart[0].hooks[0].command, /\\/);
  assert.equal(readFileSync(cmd, "utf8"), `@echo off\r\nnode "${join(home, ".pace", "app", "bin", "pace.ts")}" %*\r\n`);
  const cursorRule = readFileSync(join(home, ".cursor", "rules", "000-pace-agent.mdc"), "utf8");
  assert.ok(cursorRule.includes(`node "${entry}" boot --host cursor --text`));
  assert.match(cursorRule, /거절·실패하면 첫 응답/);
  assertCopiedSkill(join(home, ".claude", "skills", "pace-project-init"), "pace-project-init");
  uninstall({ home, repo, platform: "win32" });
  assert.ok(!existsSync(cmd));
  assert.equal(json(join(home, ".claude", "settings.json")).hooks.SessionStart.length, 2);
});

test("경로에 공백이 있으면 훅 명령을 따옴표로 감싸고, 재설치·제거에서도 알아본다", () => {
  const home = join(tempDir(), "My Home");
  mkdirSync(join(home, ".claude"), { recursive: true });
  install({ home, repo });
  const command = json(join(home, ".claude", "settings.json")).hooks.SessionStart[0].hooks[0].command as string;
  const expected = process.platform === "win32"
    ? `node "${join(home, ".pace", "app", "bin", "pace.ts").replaceAll("\\", "/")}" boot --host claude`
    : `"${join(home, ".pace", "bin", "pace")}" boot --host claude`;
  assert.equal(command, expected);
  assert.deepEqual(install({ home, repo }), []);
  uninstall({ home, repo });
  assert.equal(json(join(home, ".claude", "settings.json")).hooks, undefined);
});

test("Windows의 다른 도구 훅을 보존하면서 PACE 훅을 추가한다", () => {
  const home = tempDir("pace-win-legacy-");
  const old = `${join(home, ".other", "bin", "other.cmd").replace(/\//g, "\\")} boot --host claude`;
  write(join(home, ".claude", "settings.json"), JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: "command", command: old }] }, { hooks: [{ type: "command", command: ORCA }] }] } }));
  install({ home, repo, platform: "win32" });
  const commands = json(join(home, ".claude", "settings.json")).hooks.SessionStart.map((group: { hooks: { command: string }[] }) => group.hooks[0]?.command);
  assert.equal(commands.length, 3); assert.ok(commands.includes(ORCA));
  assert.ok(commands.some((command: string) => command.startsWith('node "') && command.endsWith(' boot --host claude')));
  assert.ok(commands.includes(old));
});

test("같은 그룹의 다른 도구 훅과 사용자 훅은 PACE 설치·제거 뒤에도 보존한다", () => {
  const home = tempDir("pace-shared-hook-group-");
  const old = `${join(home, ".other", "bin", "other.cmd").replace(/\//g, "\\")} boot --host claude`;
  for (const [folder, file] of [[".claude", "settings.json"], [".codex", "hooks.json"]] as const) {
    write(join(home, folder, file), JSON.stringify({ hooks: { SessionStart: [{ matcher: "startup", hooks: [{ type: "command", command: old }, { type: "command", command: "user-command" }] }] } }));
  }
  install({ home, repo, platform: "win32" });
  for (const [folder, file] of [[".claude", "settings.json"], [".codex", "hooks.json"]] as const) {
    const groups = json(join(home, folder, file)).hooks.SessionStart;
    assert.ok(groups.some((group: { matcher?: string; hooks: { command: string }[] }) => group.matcher === "startup" && group.hooks.length === 2 && group.hooks[0]?.command === old && group.hooks[1]?.command === "user-command"));
  }
  uninstall({ home, repo, platform: "win32" });
  for (const [folder, file] of [[".claude", "settings.json"], [".codex", "hooks.json"]] as const) {
    const groups = json(join(home, folder, file)).hooks.SessionStart;
    assert.deepEqual(groups, [{ matcher: "startup", hooks: [{ type: "command", command: old }, { type: "command", command: "user-command" }] }]);
  }
});

test("제거는 PACE가 등록한 것만 되돌리고 다른 도구 항목은 남긴다", () => {
  const home = otherToolHome();
  const original = json(join(home, ".claude", "settings.json"));
  install({ home, repo });
  uninstall({ home, repo });
  const claude = json(join(home, ".claude", "settings.json"));
  assert.deepEqual(claude.hooks.SessionStart, original.hooks.SessionStart);
  assert.deepEqual(json(join(home, ".cursor", "hooks.json")).hooks, { stop: [{ command: ORCA }] });
  assert.match(readFileSync(join(home, ".gemini", "GEMINI.md"), "utf8"), /OTHER/);
  assert.match(readFileSync(join(home, ".codex", "config.toml"), "utf8"), /OTHER/);
  assert.ok(!existsSync(join(home, ".claude", "skills", "pace-project-init")));
  assert.ok(!existsSync(join(home, ".pace", "bin", process.platform === "win32" ? "pace.cmd" : "pace")));
  assert.ok(!existsSync(join(home, ".pace", "app")), "설치본 코드 제거");
});

test("수정된 설치본과 사용자 공통 작업자 설정을 보존한다", () => {
  const home = tempDir("pace-worker-install-");
  const settings = join(home, ".pace", "worker-settings.json");
  const content = '{"codex":{"model":"custom","effort":"high"}}\n';
  write(settings, content);
  install({ home, repo });
  write(join(home, ".pace", "app", "src", "cli.ts"), "outdated");
  assert.throws(() => install({ home, repo }), /내용이 달라 보존/);
  assert.equal(readFileSync(settings, "utf8"), content);
  assert.equal(readFileSync(join(home, ".pace", "app", "src", "cli.ts"), "utf8"), "outdated");
});

test("Windows: 다른 도구 훅은 재설치에서도 보존한다", () => {
  const real = tempDir("pace-win-");
  // 테스트는 POSIX join이라, 옛 명령만 백슬래시 경로로 흉내 낸다.
  const old = `${join(real, ".other", "bin", "other.cmd").replace(/\//g, "\\")} boot --host claude`;
  write(join(real, ".claude", "settings.json"), JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: "command", command: old }] }, { hooks: [{ type: "command", command: ORCA }] }] } }));
  install({ home: real, repo, platform: "win32" });
  const commands = json(join(real, ".claude", "settings.json")).hooks.SessionStart.map((g: { hooks: { command: string }[] }) => g.hooks[0]?.command);
  assert.equal(commands.length, 3);
  assert.ok(commands.includes(ORCA));
  assert.ok(commands.some((c: string) => c.startsWith("node \"") && c.endsWith(" boot --host claude")));
  assert.ok(commands.includes(old));
});

test("별도 PACE_HOME 등록부는 설치·미리보기·재설치·제거에서 보존된다", () => {
  const home = tempDir("pace-install-home-");
  const dataHome = tempDir("pace-install-data-");
  const registry = join(dataHome, "projects");
  install({ home, dataHome, repo, dryRun: true });
  assert.equal(existsSync(registry), false);
  install({ home, dataHome, repo });
  assert.equal(lstatSync(registry).isDirectory(), true);
  const entry = join(registry, "candidate.json");
  writeFileSync(entry, "보존");
  install({ home, dataHome, repo, dryRun: true });
  install({ home, dataHome, repo });
  uninstall({ home, dataHome, repo, dryRun: true });
  uninstall({ home, dataHome, repo });
  assert.equal(readFileSync(entry, "utf8"), "보존");
});

test("Antigravity 공유 훅은 미리보기에 CLI 영향을 표시하고 타 훅을 보존하며 중복 설치하지 않는다", () => {
  const home = tempDir("pace-antigravity-install-");
  const config = join(home, ".gemini", "config"); mkdirSync(config, { recursive: true });
  const hooks = join(config, "hooks.json");
  writeFileSync(hooks, JSON.stringify({ other: { SessionStart: [{ type: "command", command: "user-command" }] } }));
  const preview = install({ home, repo, dryRun: true });
  assert.ok(preview.some((action) => action.path === hooks && /CLI.*로드/.test(action.detail)));
  assert.equal(json(hooks)["pace-session-start"], undefined);
  install({ home, repo });
  const first = json(hooks);
  assert.equal(first["pace-session-start"].SessionStart.length, 1);
  assert.equal(first["pace-session-start"].SessionStart[0].timeout, 10);
  assert.match(first["pace-session-start"].SessionStart[0].command, /boot --host antigravity/);
  assert.equal(first.other.SessionStart[0].command, "user-command");
  install({ home, repo });
  assert.deepEqual(json(hooks), first);
  uninstall({ home, repo });
  assert.deepEqual(json(hooks), { other: first.other });
});

test("Cursor 설치는 다른 도구 시작 훅을 보존하고 PACE 규칙을 추가한다", () => {
  const home = tempDir("pace-cursor-rule-"); const cursor = join(home, ".cursor"); mkdirSync(cursor);
  const bin = join(home, ".other", "bin", "other"), hooks = join(cursor, "hooks.json");
  const boot = process.platform === "win32" ? `node "${join(home, ".pace", "app", "bin", "pace.ts").replaceAll("\\", "/")}"` : join(home, ".pace", "bin", "pace");
  writeFileSync(hooks, JSON.stringify({ version: 1, hooks: { sessionStart: [{ command: `${bin} boot --host cursor` }, { command: "user-command" }] } }));
  install({ home, repo });
  const expected = [{ command: `${bin} boot --host cursor` }, { command: "user-command" }, { command: `${boot} boot --host cursor`, timeout: 10 }];
  assert.deepEqual(json(hooks).hooks.sessionStart, expected);
  const rule = readFileSync(join(cursor, "rules", "000-pace-agent.mdc"), "utf8");
  assert.match(rule, /boot --host cursor --text/);
  install({ home, repo });
  assert.deepEqual(json(hooks).hooks.sessionStart, expected);
  assert.equal(readFileSync(join(cursor, "rules", "000-pace-agent.mdc"), "utf8"), rule);
});

test("PACE 실행 파일 이름의 접두어만 같은 사용자 훅은 보존한다", () => {
  const home = tempDir("pace-similar-hook-");
  const hooks = join(home, ".claude", "settings.json");
  const userCommand = `${join(home, ".pace", "bin", "pace-other")} boot --host claude`;
  write(hooks, JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: "command", command: userCommand }] }] } }));
  install({ home, repo });
  const commands = json(hooks).hooks.SessionStart.flatMap((group: { hooks: { command: string }[] }) => group.hooks.map((hook) => hook.command));
  assert.ok(commands.includes(userCommand), "사용자 훅을 보존해야 한다");
});

test("Antigravity 공유 훅 이름이 사용 중이면 설치·제거가 사용자 원문을 보존한다", () => {
  const home = tempDir("pace-antigravity-conflict-");
  const config = join(home, ".gemini", "config"); mkdirSync(config, { recursive: true });
  const hooks = join(config, "hooks.json");
  const original = '{ "pace-session-start": { "SessionStart": [{ "command": "user-command" }] } }\n';
  writeFileSync(hooks, original);
  const preview = install({ home, repo, dryRun: true });
  assert.ok(preview.some((action) => action.path === hooks && action.kind === "skip"));
  install({ home, repo });
  assert.equal(readFileSync(hooks, "utf8"), original);
  uninstall({ home, repo });
  assert.equal(readFileSync(hooks, "utf8"), original);
});

test("Antigravity 공유 훅의 알 수 없는 형식은 설치·제거를 막지 않고 원문을 보존한다", () => {
  for (const original of ["// user comment\n{}\n", "{broken", "null", "[]"]) {
    const home = tempDir("pace-antigravity-invalid-"); const config = join(home, ".gemini", "config"); mkdirSync(config, { recursive: true });
    const hooks = join(config, "hooks.json"); writeFileSync(hooks, original);
    const actions = install({ home, repo });
    assert.ok(actions.some((action) => action.path === hooks && action.kind === "skip"));
    assert.equal(readFileSync(hooks, "utf8"), original);
    uninstall({ home, repo });
    assert.equal(readFileSync(hooks, "utf8"), original);
  }
});

test("Antigravity 공유 훅의 심볼릭 링크는 변경하지 않는다", (t) => {
  const home = tempDir("pace-antigravity-link-"); const config = join(home, ".gemini", "config"); mkdirSync(config, { recursive: true });
  const outside = join(home, "original.json"), hooks = join(config, "hooks.json");
  writeFileSync(outside, '{"user": {}}\n');
  try { symlinkSync(outside, hooks); } catch (error) {
    if (process.platform === "win32" && ["EPERM", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) { t.skip("심볼릭 링크 생성 권한 없음"); return; }
    throw error;
  }
  const actions = install({ home, repo });
  assert.ok(actions.some((action) => action.path === hooks && action.kind === "skip"));
  assert.equal(lstatSync(hooks).isSymbolicLink(), true);
  assert.equal(readFileSync(outside, "utf8"), '{"user": {}}\n');
  uninstall({ home, repo });
  assert.equal(lstatSync(hooks).isSymbolicLink(), true);
});

test("제거 시 확인할 수 없는 공유 훅이 남으면 부트 실행 파일을 보존한다", () => {
  const home = tempDir("pace-antigravity-orphan-"); mkdirSync(join(home, ".gemini"));
  install({ home, repo });
  const hooks = join(home, ".gemini", "config", "hooks.json");
  const original = `// 사용자가 추가한 주석\n${readFileSync(hooks, "utf8")}`; writeFileSync(hooks, original);
  const actions = uninstall({ home, repo });
  assert.equal(readFileSync(hooks, "utf8"), original);
  assert.ok(existsSync(join(home, ".pace", "bin", process.platform === "win32" ? "pace.cmd" : "pace")));
  assert.ok(existsSync(join(home, ".pace", "app", "bin", "pace.ts")));
  assert.ok(actions.some((action) => /훅.*수동 확인/.test(action.detail)));
});

test("사용자가 확장한 공유 훅에 PACE 참조가 남으면 제거 시 실행 파일도 보존한다", () => {
  for (const variant of ["property", "handler", "compound", "timeout", "other-hook", "tilde", "home-variable", "other-command", "app-path", "app-tilde"]) {
    const home = tempDir("pace-antigravity-expanded-"); mkdirSync(join(home, ".gemini"));
    install({ home, repo });
    const hooks = join(home, ".gemini", "config", "hooks.json"), value = json(hooks);
    if (variant === "property") value["pace-session-start"].description = "사용자 보강";
    if (variant === "handler") value["pace-session-start"].SessionStart.push({ type: "command", command: "user-command" });
    if (variant === "compound") value["pace-session-start"].SessionStart[0].command += " && user-command";
    if (variant === "timeout") value["pace-session-start"].SessionStart[0].timeout = 20;
    if (variant === "other-hook") value.user = { SessionStart: [{ command: `${join(home, ".pace", "bin", "pace")} boot --host antigravity` }] };
    if (variant === "tilde") value.user = { SessionStart: [{ command: "~/.pace/bin/pace boot --host antigravity" }] };
    if (variant === "home-variable") value.user = { SessionStart: [{ command: "$HOME/.pace/bin/pace boot --host antigravity" }] };
    if (variant === "other-command") value.user = { SessionStart: [{ command: `${join(home, ".pace", "bin", "pace")} memory list` }] };
    if (variant === "app-path") value.user = { SessionStart: [{ command: `node ${join(home, ".pace", "app", "bin", "pace.ts")} boot` }] };
    if (variant === "app-tilde") value.user = { SessionStart: [{ command: "node ~/.pace/app/bin/pace.ts boot" }] };
    const before = JSON.stringify(value, null, 2) + "\n"; writeFileSync(hooks, before);
    const actions = uninstall({ home, repo });
    assert.ok(existsSync(join(home, ".pace", "bin", process.platform === "win32" ? "pace.cmd" : "pace")));
    assert.ok(existsSync(join(home, ".pace", "app", "bin", "pace.ts")));
    assert.ok(actions.some((action) => /훅.*수동 확인/.test(action.detail)));
    if (["property", "handler", "compound", "timeout"].includes(variant)) assert.equal(readFileSync(hooks, "utf8"), before);
    else assert.equal(json(hooks).user.SessionStart[0].command, value.user.SessionStart[0].command);
  }
});

test("Gemini 설정 루트가 링크면 공유 설정과 기존 Gemini 설정을 모두 보존한다", (t) => {
  const home = tempDir("pace-gemini-root-link-"), target = tempDir("pace-gemini-target-");
  const settings = join(target, "settings.json"), gemini = join(target, "GEMINI.md");
  writeFileSync(settings, '{"user":true}\n'); writeFileSync(gemini, "사용자 원문\n");
  try { symlinkSync(target, join(home, ".gemini"), "dir"); } catch (error) {
    if (process.platform === "win32" && ["EPERM", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) { t.skip("심볼릭 링크 생성 권한 없음"); return; }
    throw error;
  }
  const installActions = install({ home, repo }); const actions = uninstall({ home, repo });
  assert.equal(readFileSync(settings, "utf8"), '{"user":true}\n');
  assert.equal(readFileSync(gemini, "utf8"), "사용자 원문\n");
  assert.equal(existsSync(join(target, "config", "hooks.json")), false);
  assert.ok(existsSync(join(home, ".pace", "bin", process.platform === "win32" ? "pace.cmd" : "pace")));
  assert.ok(existsSync(join(home, ".pace", "app", "bin", "pace.ts")));
  assert.ok(actions.some((action) => /Gemini 설정 경로가 링크/.test(action.detail)));
  assert.ok(installActions.some((action) => /Gemini 설정 경로가 링크/.test(action.detail)));
});

test("Cursor 설정 루트 링크는 설치·제거에서 보존한다", (t) => {
  const home = tempDir("pace-cursor-root-link-"), target = tempDir("pace-cursor-target-");
  try { symlinkSync(target, join(home, ".cursor"), "dir"); } catch (error) {
    if (process.platform === "win32" && ["EPERM", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) { t.skip("심볼릭 링크 생성 권한 없음"); return; }
    throw error;
  }
  const installed = install({ home, repo });
  const removed = uninstall({ home, repo });
  assert.deepEqual(readdirSync(target), []);
  assert.ok(installed.some((action) => /Cursor 설정 경로가 링크/.test(action.detail)));
  assert.ok(removed.some((action) => /Cursor 설정 경로가 링크/.test(action.detail)));
});

test("Gemini 스킬 하위 경로 링크는 설치·제거에서 보존하고 알린다", (t) => {
  const home = tempDir("pace-gemini-skill-link-"), target = tempDir("pace-gemini-skill-target-");
  mkdirSync(join(home, ".gemini"));
  try { symlinkSync(target, join(home, ".gemini", "antigravity"), "dir"); } catch (error) {
    if (process.platform === "win32" && ["EPERM", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) { t.skip("심볼릭 링크 생성 권한 없음"); return; }
    throw error;
  }
  const installed = install({ home, repo });
  const removed = uninstall({ home, repo });
  assert.ok(installed.some((action) => /스킬 경로가 링크/.test(action.detail)));
  assert.ok(removed.some((action) => /스킬 경로가 링크/.test(action.detail)));
  assert.equal(existsSync(join(target, "skills")), false);
});

test("Gemini skills 자체의 링크는 대상 스킬을 건드리지 않고 알린다", (t) => {
  for (const name of ["config", "antigravity"]) {
    const home = tempDir("pace-gemini-skills-link-"), target = tempDir("pace-gemini-skills-target-");
    const parent = join(home, ".gemini", name); mkdirSync(parent, { recursive: true });
    const sentinel = join(target, "user-file"); writeFileSync(sentinel, "preserved");
    try { symlinkSync(target, join(parent, "skills"), "dir"); } catch (error) {
      if (process.platform === "win32" && ["EPERM", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) { t.skip("심볼릭 링크 생성 권한 없음"); return; }
      throw error;
    }
    const installed = install({ home, repo }); const removed = uninstall({ home, repo });
    assert.ok(installed.some((action) => action.path === join(parent, "skills") && /스킬 경로가 링크/.test(action.detail)));
    assert.ok(removed.some((action) => action.path === join(parent, "skills") && /스킬 경로가 링크/.test(action.detail)));
    assert.deepEqual(readdirSync(target), ["user-file"]);
    assert.equal(readFileSync(sentinel, "utf8"), "preserved");
  }
});

test("임시 설치된 Antigravity 훅은 단일 workspacePaths의 활성 역할을 반환한다", { skip: process.platform === "win32" ? "Windows 설치 실행 경로는 별도 실기 검증 필요" : false }, () => {
  const home = tempDir("pace-antigravity-home-"), dataHome = tempDir("pace-antigravity-data-"), workspace = tempDir("pace-antigravity-workspace-");
  mkdirSync(join(home, ".gemini")); createProfile(dataHome, ALTU);
  registerWorkspace(dataHome, { path: workspace, name: "합성", summary: "" }, 1500);
  const agent = join(workspace, ".pace", "AGENT.md"); writeFileSync(agent, readFileSync(agent, "utf8") + "\nSynthetic marker INSTALL-648.\n");
  install({ home, dataHome, repo });
  const hooks = json(join(home, ".gemini", "config", "hooks.json"));
  assert.match(hooks["pace-session-start"].SessionStart[0].command, /boot --host antigravity/);
  const bin = join(home, ".pace", "bin", "pace");
  const result = spawnSync(bin, ["boot", "--host", "antigravity"], { input: JSON.stringify({ workspacePaths: [workspace] }), encoding: "utf8", timeout: 10000, env: { ...sessionFreeEnv(), HOME: home, PACE_HOME: dataHome } });
  assert.equal(result.status, 0, result.stderr);
  const text = JSON.parse(result.stdout).injectSteps[0].systemMessage.systemMessage as string;
  assert.match(text, /INSTALL-648/);
  assert.match(text, /현재 호스트: antigravity/);
});


test("설치본과 등록부가 겹치면 별칭 경로도 변경 전에 거부한다", () => {
  const home = tempDir("pace-install-overlap-");
  const app = join(home, ".pace", "app");
  mkdirSync(app, { recursive: true });
  const registry = join(app, "projects"); mkdirSync(registry);
  const sentinel = join(registry, "sentinel"); writeFileSync(sentinel, "보존");
  const alias = join(home, "alias"); symlinkSync(app, alias);
  for (const dataHome of [app, alias]) {
    assert.throws(() => install({ home, dataHome, repo }), /겹친다/);
    assert.throws(() => uninstall({ home, dataHome, repo }), /겹친다/);
    assert.equal(readFileSync(sentinel, "utf8"), "보존");
  }
});

test("기본 등록부는 재설치와 제거 뒤에도 보존된다", () => {
  const home = tempDir("pace-install-default-registry-");
  install({ home, repo });
  const sentinel = join(home, ".pace", "projects", "candidate.json"); writeFileSync(sentinel, "보존");
  install({ home, repo });
  assert.equal(readFileSync(sentinel, "utf8"), "보존");
  uninstall({ home, repo });
  assert.equal(readFileSync(sentinel, "utf8"), "보존");
});

test("T07 Claude 호출 훅은 등록·재설치·제거에서 사용자 훅을 보존한다", () => {
  const home = join(tempDir("pace-home-"), "team's fixture");
  const file = join(home, ".claude", "settings.json");
  const original = {
    hooks: {
      SubagentStart: [{ hooks: [{ type: "command", command: "user-start" }] }],
      PostToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "user-post" }] }],
    },
  };
  write(file, JSON.stringify(original));
  install({ home, repo, dryRun: true });
  assert.deepEqual(json(file), original);
  install({ home, repo });
  const installed = json(file);
  for (const event of ["SubagentStart", "SubagentStop", "PostToolUse"]) {
    const groups = installed.hooks[event] as { matcher?: string; hooks: { type: string; command: string; timeout?: number }[] }[];
    const managed = groups.filter((group) => group.hooks.some((hook) => hook.command.endsWith("# pace-managed-agent-call-v1")));
    assert.equal(managed.length, 1);
    assert.equal(managed[0]?.hooks[0]?.timeout, 10);
    assert.match(managed[0]?.hooks[0]?.command ?? "", /agent call-hook --host claude/);
    assert.ok(managed[0]?.hooks[0]?.command.includes("'\\''"), "작은따옴표가 섞인 경로도 리터럴");
    assert.equal(managed[0]?.matcher, event === "PostToolUse" ? "Agent" : undefined);
  }
  install({ home, repo });
  assert.deepEqual(json(file), installed);
  uninstall({ home, repo });
  assert.deepEqual(json(file), original);
});
