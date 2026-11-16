import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { BOOT_BUDGET, BOOT_MARKER, bootNotice, buildBootContext, cwdFromHookInput, formatForHost, PROJECT_MEMORY_NOTE } from "../src/boot.ts";
import { initBrain } from "../src/project/brain.ts";
import { addMemory, profileMemoryDir, projectMemoryDir, setStatus } from "../src/memory/memory.ts";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createProfile } from "../src/profile/profile.ts";
import { registerWorkspace } from "../src/project/workspace-registry.ts";
import { ALTU, PACE_BIN, runPace, tempDir, spawnTestChild as spawn } from "./helpers.ts";

test("부트는 활성 등록된 유효 정의만 한 번 주입하고 무효 정의는 진단한다", () => {
  const home = tempDir(), userHome = tempDir(); createProfile(home, ALTU);
  const workspace = join(userHome, "workspace"); mkdirSync(workspace);
  const entry = registerWorkspace(home, { path: workspace, name: "합성", summary: "" }, 1500);
  const agent = join(workspace, ".pace", "AGENT.md");
  const definition = readFileSync(agent, "utf8").replace("pace_agent_version: 2", "pace_agent_version: 2\n---x\nsynthetic_header: HIDDEN-349") + "\nSynthetic marker BOOT-483.\n";
  writeFileSync(agent, definition);
  const valid = buildBootContext({ home, cwd: workspace, userHome, env: {}, host: "codex" });
  assert.equal(valid.split("BOOT-483").length - 1, 1);
  assert.ok(valid.includes(`원본: ${agent}`));
  assert.doesNotMatch(valid, /HIDDEN-349|workspace_id:/);
  assert.match(valid, /\[프로젝트 역할 시작\][\s\S]*BOOT-483[\s\S]*\[프로젝트 역할 끝\]/);
  assert.ok(valid.indexOf("## USER") < valid.indexOf("## 프로젝트 역할"));
  writeFileSync(agent, definition.replace(entry.id, "00000000-0000-4000-8000-000000000000"));
  const invalid = buildBootContext({ home, cwd: workspace, userHome, env: {}, host: "codex" });
  assert.doesNotMatch(invalid, /BOOT-483/);
  assert.match(invalid, /등록 또는 AGENT 정의를 확인하지 못해/);
});

test("다른 프로필은 자동 생성 역할 표제만 현재 이름으로 전달하고 원본은 보존한다", () => {
  const home = tempDir(), userHome = tempDir(); createProfile(home, ALTU);
  createProfile(home, { ...ALTU, name: "nova", displayName: "Nova", ownerName: "Tester" });
  const workspace = join(userHome, "workspace"); mkdirSync(workspace);
  registerWorkspace(home, { path: workspace, name: "합성", summary: "" }, 1500);
  const agent = join(workspace, ".pace", "AGENT.md"), original = readFileSync(agent, "utf8");
  const text = buildBootContext({ home, cwd: workspace, userHome, env: { PACE_PROFILE: "nova" }, host: "claude" });
  assert.match(original, /^# 알투 — project role$/m);
  assert.match(text, /^# Nova — project role$/m);
  assert.doesNotMatch(text, /<!-- pace:profile-heading -->/);
  assert.match(original, /<!-- pace:profile-heading -->/);
  assert.doesNotMatch(text, /^# 알투 — project role$/m);
  assert.equal(readFileSync(agent, "utf8"), original);
  writeFileSync(agent, original.replace(/<!-- pace:profile-heading -->\r?\n# 알투 — project role/, "# Payments API — project role"));
  assert.match(buildBootContext({ home, cwd: workspace, userHome, env: { PACE_PROFILE: "nova" } }), /^# Payments API — project role$/m);
  for (const header of ["<!-- pace:profile-heading -->\n# Custom", "<!-- pace:profile-heading -->   \n\n# Custom"]) {
    const custom = original.replace(/<!-- pace:profile-heading -->\r?\n# 알투 — project role/, header).replace(/\r?\n/g, "\r\n");
    writeFileSync(agent, custom);
    const result = buildBootContext({ home, cwd: workspace, userHome, env: { PACE_PROFILE: "nova" } });
    assert.match(result, /^# Custom\r?$/m);
    assert.doesNotMatch(result, /<!-- pace:profile-heading -->/);
    assert.equal(readFileSync(agent, "utf8"), custom);
  }
});

test("부트 예산 초과 시 프로젝트 정의를 자르지 않고 제외하며 진단한다", () => {
  const home = tempDir(), userHome = tempDir(); const profile = createProfile(home, ALTU);
  const workspace = join(userHome, "workspace"); mkdirSync(workspace);
  registerWorkspace(home, { path: workspace, name: "합성", summary: "" }, 1500);
  const agent = join(workspace, ".pace", "AGENT.md"); writeFileSync(agent, readFileSync(agent, "utf8") + "\nSynthetic marker BOOT-596.\n");
  const soul = join(profile, "SOUL.md"); writeFileSync(soul, readFileSync(soul, "utf8") + "\n" + "x".repeat(BOOT_BUDGET));
  const text = buildBootContext({ home, cwd: workspace, userHome, env: {}, host: "codex" });
  assert.doesNotMatch(text, /BOOT-596/);
  assert.match(text, /부트 예산을 초과해 프로젝트 역할을 전달하지 못했다/);
  assert.match(text, /역할 표제: 알투/);
  assert.ok(text.includes(agent));
  assert.ok(text.indexOf("부트 예산을 초과") < text.indexOf("## SOUL"));
  assert.match(text, /## SOUL/);
});

test("하네스 소유 worktree는 활성 원본과 역할 ID가 일치할 때만 현재 정의를 전달한다", () => {
  const home = tempDir(), userHome = tempDir(); createProfile(home, ALTU);
  const main = join(userHome, "repo"), wt = join(userHome, "wt"), other = join(userHome, "other"); mkdirSync(main);
  const git = (cwd: string, ...args: string[]) => {
    const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" }); assert.equal(r.status, 0, r.stderr);
  };
  git(main, "init", "-q", "-b", "main"); git(main, "config", "user.name", "test"); git(main, "config", "user.email", "test@example.invalid");
  const entry = registerWorkspace(home, { path: main, name: "합성", summary: "" }, 1500);
  const agent = join(main, ".pace", "AGENT.md"); writeFileSync(agent, readFileSync(agent, "utf8") + "\nMarker: WT-842.\n");
  mkdirSync(join(main, "projects", "P001_261105_합성"), { recursive: true });
  writeFileSync(join(main, "projects", "P001_261105_합성", "PROJECT.md"), "# P001\n\n- 상태: 진행\n");
  git(main, "add", ".pace/AGENT.md", "projects"); git(main, "commit", "-q", "-m", "synthetic");
  git(main, "worktree", "add", "-q", wt, "-b", "project/P001");
  git(main, "worktree", "add", "-q", other, "-b", "feature/P001");
  const boot = (cwd: string) => buildBootContext({ home, cwd, userHome, env: {}, host: "codex" });
  assert.equal(boot(main).split("WT-842").length - 1, 1);
  assert.equal(boot(wt).split("WT-842").length - 1, 1);
  const wtProject = join(wt, "projects", "P001_261105_합성", "PROJECT.md");
  writeFileSync(wtProject, "# P001\r\n\r\n- 상태: 병합 대기\r\n");
  assert.equal(boot(wt).split("WT-842").length - 1, 1);
  writeFileSync(wtProject, "# P001\n\n- 상태: 보류\n");
  assert.doesNotMatch(boot(wt), /WT-842/);
  writeFileSync(wtProject, "# P001\n\n- 상태: 진행\n");
  git(wt, "checkout", "-q", "--detach");
  assert.doesNotMatch(boot(wt), /WT-842/);
  git(wt, "checkout", "-q", "project/P001");
  const mainProject = join(main, "projects", "P001_261105_합성", "PROJECT.md");
  writeFileSync(mainProject, "# P001\n\n- 상태: 완료\n");
  assert.doesNotMatch(boot(wt), /WT-842/);
  writeFileSync(mainProject, "# P001\n\n- 상태: 진행\n");
  const caseAlias = join(userHome, "WT");
  if (existsSync(caseAlias)) assert.equal(boot(caseAlias).split("WT-842").length - 1, 1);
  if (process.platform !== "win32") {
    const fakeBin = join(userHome, "slow-git"); mkdirSync(fakeBin);
    const fakeGit = join(fakeBin, "git");
    const realGit = spawnSync("/bin/sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim(); assert.ok(realGit);
    writeFileSync(fakeGit, '#!/bin/sh\ncase "$*" in *status*|*"log -3"*) /bin/sleep 1.5;; *) /bin/sleep 0.4;; esac\nexec "$P018_REAL_GIT" "$@"\n'); chmodSync(fakeGit, 0o755);
    const slowBoot = runPace(["boot", "--host", "codex", "--cwd", wt], { home, env: { PATH: `${fakeBin}:${process.env.PATH ?? ""}`, P018_REAL_GIT: realGit, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" }, timeout: 10_000 });
    assert.equal(slowBoot.status, 0, slowBoot.stderr);
    assert.equal(JSON.parse(slowBoot.stdout).hookSpecificOutput.additionalContext.split("WT-842").length - 1, 1);
    writeFileSync(fakeGit, '#!/bin/sh\ncase "$*" in *for-each-ref*) exec /bin/sleep 3;; esac\nexec "$P018_REAL_GIT" "$@"\n');
    const partial = runPace(["boot", "--host", "codex", "--cwd", wt], { home, env: { PATH: `${fakeBin}:${process.env.PATH ?? ""}`, P018_REAL_GIT: realGit, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" }, timeout: 10_000 });
    assert.equal(partial.status, 0, partial.stderr);
    assert.match(JSON.parse(partial.stdout).hookSpecificOutput.additionalContext, /하네스 프로젝트 상태를 확인하지 못했다/);
    mkdirSync(join(main, "projects", "P002_261105_별도"), { recursive: true });
    writeFileSync(join(main, "projects", "P002_261105_별도", "PROJECT.md"), "# P002\n\n- 상태: 진행\n");
    git(main, "branch", "project/P002");
    assert.match(boot(main), /P002 별도 · 진행/); // 브랜치에는 파일이 없어 main으로 대체
    writeFileSync(fakeGit, '#!/bin/sh\ncase "$*" in *" show "*) if [ "$LC_ALL" != C ]; then echo "합성 번역 오류" >&2; exit 128; fi;; esac\nexec "$P018_REAL_GIT" "$@"\n');
    const localized = runPace(["boot", "--host", "codex", "--cwd", main], { home, env: { PATH: `${fakeBin}:${process.env.PATH ?? ""}`, P018_REAL_GIT: realGit, LC_ALL: "synthetic_LOCALE", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" }, timeout: 10_000 });
    assert.equal(localized.status, 0, localized.stderr);
    assert.match(JSON.parse(localized.stdout).hookSpecificOutput.additionalContext, /P002 별도 · 진행/);
    for (const command of ["worktree list", " show "]) {
      writeFileSync(fakeGit, `#!/bin/sh\ncase "$*" in *"${command}"*) exec /bin/sleep 3;; esac\nexec "$P018_REAL_GIT" "$@"\n`);
      const timedOut = runPace(["boot", "--host", "codex", "--cwd", main], { home, env: { PATH: `${fakeBin}:${process.env.PATH ?? ""}`, P018_REAL_GIT: realGit, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" }, timeout: 10_000 });
      assert.equal(timedOut.status, 0, timedOut.stderr);
      const content = JSON.parse(timedOut.stdout).hookSpecificOutput.additionalContext;
      assert.match(content, /하네스 프로젝트 상태를 확인하지 못했다/);
      assert.doesNotMatch(content, /P002 별도 · 진행/);
      writeFileSync(fakeGit, `#!/bin/sh\ncase "$*" in *"${command}"*) echo 'fatal: synthetic failure' >&2; exit 128;; esac\nexec "$P018_REAL_GIT" "$@"\n`);
      const failed = runPace(["boot", "--host", "codex", "--cwd", main], { home, env: { PATH: `${fakeBin}:${process.env.PATH ?? ""}`, P018_REAL_GIT: realGit, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" }, timeout: 10_000 });
      assert.equal(failed.status, 0, failed.stderr);
      const failedContent = JSON.parse(failed.stdout).hookSpecificOutput.additionalContext;
      assert.match(failedContent, /하네스 프로젝트 상태를 확인하지 못했다/);
      assert.doesNotMatch(failedContent, /P002 별도 · 진행/);
    }
    writeFileSync(fakeGit, '#!/bin/sh\n/bin/sleep 0.35\nexec "$P018_REAL_GIT" "$@"\n');
    const harness = new URL("../src/project/harness.ts", import.meta.url).href;
    const probe = `import {withGitLimits, projectWorktreeMainRoot} from ${JSON.stringify(harness)}; try { console.log(withGitLimits(500, () => projectWorktreeMainRoot(process.argv[1])) ?? "none"); } catch { console.log("none"); }`;
    const bounded = spawnSync(process.execPath, ["--input-type=module", "-e", probe, wt], { encoding: "utf8", timeout: 5000, env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH ?? ""}`, P018_REAL_GIT: realGit, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } });
    assert.equal(bounded.status, 0, bounded.stderr); assert.equal(bounded.stdout.trim(), "none");
  }
  assert.doesNotMatch(boot(other), /WT-842/); assert.match(boot(other), /활성 등록을 확인하지 못해/);
  const unregisteredHome = tempDir(); createProfile(unregisteredHome, ALTU);
  assert.doesNotMatch(buildBootContext({ home: unregisteredHome, cwd: wt, userHome, env: {}, host: "codex" }), /WT-842/);
  const wtAgent = join(wt, ".pace", "AGENT.md"); const original = readFileSync(wtAgent, "utf8");
  const nested = join(wt, "nested"); mkdirSync(join(nested, ".pace"), { recursive: true });
  writeFileSync(join(nested, ".pace", "AGENT.md"), original);
  mkdirSync(join(nested, "projects"));
  assert.doesNotMatch(boot(nested), /WT-842/); assert.match(boot(nested), /활성 등록을 확인하지 못해/);
  writeFileSync(wtAgent, original.replace(entry.id, "00000000-0000-4000-8000-000000000000"));
  assert.doesNotMatch(boot(wt), /WT-842/); assert.match(boot(wt), /확인하지 못해/);
  unlinkSync(wtAgent);
  let linked = false;
  try { symlinkSync(agent, wtAgent); linked = true; } catch (error) {
    if (!["EPERM", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
  }
  if (linked) { assert.doesNotMatch(boot(wt), /WT-842/); assert.match(boot(wt), /확인하지 못해/); }
  const clone = join(userHome, "clone"); git(userHome, "clone", "-q", main, clone);
  git(clone, "checkout", "-q", "-b", "project/P001", "origin/project/P001");
  assert.doesNotMatch(boot(clone), /WT-842/); assert.match(boot(clone), /활성 등록을 확인하지 못해/);
  assert.equal(readdirSync(join(home, "projects")).filter((name) => name.endsWith(".json")).length, 1);
});

test("지연된 git은 합산 부트 예산 안에서 유효한 훅 출력으로 열화한다", { skip: process.platform === "win32" ? "POSIX 지연 git 대역" : false }, () => {
  const home = tempDir(), otherHome = tempDir(), workspace = join(otherHome, "repo"), fakeBin = join(otherHome, "bin");
  createProfile(home, ALTU); mkdirSync(workspace); mkdirSync(fakeBin);
  mkdirSync(join(workspace, ".git")); mkdirSync(join(workspace, "projects", "P001_261105_합성"), { recursive: true });
  registerWorkspace(otherHome, { path: workspace, name: "합성", summary: "" }, 1500);
  const fakeGit = join(fakeBin, "git"); writeFileSync(fakeGit, "#!/bin/sh\nexec /bin/sleep 3\n"); chmodSync(fakeGit, 0o755);
  const started = Date.now();
  const result = runPace(["boot", "--host", "codex", "--cwd", workspace], { home, env: { PATH: `${fakeBin}:${process.env.PATH ?? ""}` }, timeout: 12_000 });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(Date.now() - started < 5_800, "화면 인사의 중복 git 조회 없이 부트 git 예산 안에 끝나야 한다");
  const output = JSON.parse(result.stdout); assert.match(output.hookSpecificOutput.additionalContext, /\[PACE-BOOT\]/);
  assert.match(output.hookSpecificOutput.additionalContext, /프로젝트 AGENT 정의는 활성 등록을 확인하지 못해 전달하지 않았다/);
  assert.match(output.hookSpecificOutput.additionalContext, /하네스 프로젝트 상태를 확인하지 못했다/);
});

test("git 상태 조회가 시간 초과되면 변경 0개로 오인하지 않는다", { skip: process.platform === "win32" ? "POSIX 지연 git 대역" : false }, () => {
  const home = tempDir(), workspace = join(home, "repo"), fakeBin = join(home, "bin");
  createProfile(home, ALTU); mkdirSync(workspace); mkdirSync(join(workspace, ".git")); mkdirSync(fakeBin);
  const fakeGit = join(fakeBin, "git");
  writeFileSync(fakeGit, '#!/bin/sh\ncase "$*" in *--abbrev-ref*) printf "main\\n";; *status*) exec /bin/sleep 3;; *) exit 0;; esac\n'); chmodSync(fakeGit, 0o755);
  const result = runPace(["boot", "--host", "plain", "--cwd", workspace], { home, env: { PATH: `${fakeBin}:${process.env.PATH ?? ""}` }, timeout: 10_000 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /git: main · 커밋 안 한 변경 미확인/);
  assert.doesNotMatch(result.stdout, /커밋 안 한 변경 0개/);
});

test("프로필이 없으면 생성 안내만 한다", () => {
  const context = buildBootContext({ home: tempDir(), cwd: tempDir(), env: {} });
  assert.match(context, new RegExp(`^\\${BOOT_MARKER}`));
  assert.match(context, /pace-onboarding/);
  assert.match(context, /동의를 따로 묻지 않는다/);
  assert.match(context, /skills[\\/]pace-onboarding[\\/]SKILL\.md/);
});

test("부트 맥락에 SOUL·USER·RULES·프로필 메모리(규칙은 제목·요약만)가 들어간다", () => {
  const home = tempDir();
  const dir = createProfile(home, ALTU);
  addMemory(profileMemoryDir(dir), "profile", { type: "rule", name: "확인 후 커밋", description: "승인 뒤에만 커밋", body: "**왜:** 사용자 주권" });
  const context = buildBootContext({ home, cwd: home, env: {}, userHome: home });
  for (const part of ["## 첫 응답 지침", "## SOUL", "# 알투", "사용자 호칭: 캡틴", "## USER", "## RULES", "| 개발 파트너 |", "프로필 `rule`이 우선", "## 프로필 메모리", "- **확인 후 커밋** — 승인 뒤에만 커밋\n", "## 현재 위치: 프로젝트 밖"]) {
    assert.ok(context.includes(part), part);
  }
  assert.ok(!context.includes("**왜:** 사용자 주권"), "규칙 본문은 부트에 넣지 않는다");
  const shown = runPace(["memory", "show", "확인-후-커밋"], { home });
  assert.equal(shown.status, 0, shown.stderr);
  assert.match(shown.stdout, /\*\*왜:\*\* 사용자 주권/, "본문은 memory show로 읽는다");
  assert.ok(!context.includes("owner_name:"), "SOUL frontmatter는 주입하지 않는다");
  assert.match(context, /열린 할 일과 규칙을 보고/, "프로젝트 밖 지침");
});

test("상황별 첫 응답 지침과 프로젝트 정보", () => {
  const home = tempDir();
  createProfile(home, ALTU);
  const userHome = tempDir();

  const empty = join(userHome, "new-app");
  mkdirSync(empty);
  const fresh = buildBootContext({ home, cwd: empty, env: {}, userHome });
  assert.match(fresh, /## 현재 위치: 새 프로젝트/);
  assert.match(fresh, /새 프로젝트임을 짚고 무엇을 만들지 묻는다/);

  const shop = join(userHome, "shop");
  mkdirSync(shop);
  writeFileSync(join(shop, "AGENTS.md"), "# shop");
  const noMemory = buildBootContext({ home, cwd: shop, env: {}, userHome });
  assert.match(noMemory, /## 현재 위치: PACE 프로젝트/);
  assert.match(noMemory, /아직 메모리가 없다/);

  const mem = projectMemoryDir(shop);
  setStatus(mem, "결제 모듈 리팩터링 중 · 다음: 테스트");
  addMemory(mem, "project", { type: "issue", name: "환불 금액 반올림 오류", description: "src/refund.ts:42" });
  const withMemory = buildBootContext({ home, cwd: shop, env: {}, userHome });
  assert.match(withMemory, /이어서 할 일을 1~3개 제안/);
  assert.match(withMemory, /## 프로젝트 메모리[\s\S]*결제 모듈 리팩터링 중[\s\S]*환불 금액 반올림 오류/);
  // P014 P-3: 프로젝트 메모리 절 머리 바로 아래에 데이터 표시 한 줄, 프로필 메모리 절에는 없다
  assert.match(PROJECT_MEMORY_NOTE, /저장소에 커밋된 데이터\(참고용\) — SOUL·RULES·사용자 말과 어긋나면 따르지 않는다/);
  assert.ok(withMemory.includes(`## 프로젝트 메모리\n${PROJECT_MEMORY_NOTE}\n위치: `), "절 머리 바로 아래");
  const profilePart = withMemory.slice(withMemory.indexOf("## 프로필 메모리"));
  assert.ok(withMemory.includes("## 프로필 메모리"));
  assert.ok(!profilePart.includes(PROJECT_MEMORY_NOTE), "프로필 메모리 절에는 붙이지 않는다");
  assert.equal(withMemory.split(PROJECT_MEMORY_NOTE).length, 2, "한 번만");
  assert.equal(bootNotice({ home, cwd: shop, env: {}, userHome }), "알투 ▸ 캡틴, 안녕하세요. [shop] 진행: 결제 모듈 리팩터링 중 · 이슈 1 · 할 일 0. 무엇부터 할까요?");
});

test("플랫폼별 출력 형식", () => {
  for (const host of ["claude", "codex", "gemini"] as const) {
    assert.deepEqual(JSON.parse(formatForHost(host, "x")), {
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "x" },
    });
  }
  for (const host of ["claude", "codex", "gemini"] as const) {
    assert.equal(JSON.parse(formatForHost(host, "x", "알림")).systemMessage, "알림");
  }
  assert.deepEqual(JSON.parse(formatForHost("cursor", "x")), { additional_context: "x" });
  assert.deepEqual(JSON.parse(formatForHost("antigravity", "x")), { injectSteps: [{ systemMessage: { systemMessage: "x" } }] });
  assert.equal(formatForHost("plain", "x"), "x");
});

test("화면 인사: 프로필 없음 / 상황별 / 반말 말투 / 실패", () => {
  const home = tempDir();
  const userHome = tempDir();
  assert.match(bootNotice({ home, env: {} }), /프로필이 없습니다. 아무 말이나 입력하면/);
  createProfile(home, ALTU);
  assert.equal(bootNotice({ home, env: {}, cwd: userHome, userHome }), "알투 ▸ 캡틴, 안녕하세요. 무엇을 도와드릴까요?");
  const empty = join(userHome, "new-app");
  mkdirSync(empty);
  assert.equal(bootNotice({ home, env: {}, cwd: empty, userHome }), "알투 ▸ 캡틴, 안녕하세요. 새 프로젝트네요. 무엇을 만들까요?");
  assert.match(bootNotice({ home, env: { PACE_PROFILE: "missing" } }), /부트 실패/);

  const casualHome = tempDir();
  createProfile(casualHome, { ...ALTU, tone: "반말 + 직설" });
  assert.equal(bootNotice({ home: casualHome, env: {}, cwd: empty, userHome }), "알투 ▸ 캡틴, 안녕. 새 프로젝트네. 뭘 만들까?");
});

test("훅 입력에서 cwd를 읽는다 (Claude·Codex·Gemini의 cwd, Cursor의 workspace_roots)", () => {
  assert.equal(cwdFromHookInput('{"cwd":"/a","hook_event_name":"SessionStart"}'), "/a");
  assert.equal(cwdFromHookInput('{"workspace_roots":["/b"]}'), "/b");
  assert.equal(cwdFromHookInput('{"workspacePaths":["/c"]}'), "/c");
  assert.equal(cwdFromHookInput('{"workspacePaths":["/a","/b"]}'), null);
  assert.equal(cwdFromHookInput("not json"), null);
  assert.equal(cwdFromHookInput(""), null);
});

test("Antigravity 훅 입력과 오류는 injectSteps 형식을 유지한다", () => {
  const home = tempDir("pace-antigravity-host-"); createProfile(home, ALTU);
  const workspace = tempDir("pace-antigravity-project-");
  const run = runPace(["boot", "--host", "antigravity", "--cwd", workspace], { home });
  assert.equal(run.status, 0);
  const text = JSON.parse(run.stdout).injectSteps[0].systemMessage.systemMessage as string;
  assert.match(text, /현재 호스트: antigravity/);
  const error = runPace(["boot", "--host", "antigravity", "--bad-option"], { home });
  assert.equal(error.status, 0);
  assert.match(JSON.parse(error.stdout).injectSteps[0].systemMessage.systemMessage, /부트 실패/);
});

test("Antigravity 다중·알 수 없는 입력은 작업 디렉터리의 프로젝트 역할을 추측하지 않는다", () => {
  const home = tempDir("pace-antigravity-ambiguous-"); createProfile(home, ALTU);
  const workspace = join(home, "workspace"), other = join(home, "other"); mkdirSync(workspace); mkdirSync(other);
  registerWorkspace(home, { path: workspace, name: "합성", summary: "" }, 1500);
  const file = join(workspace, ".pace", "AGENT.md"); writeFileSync(file, readFileSync(file, "utf8") + "\nSynthetic marker NOT-CHOSEN-351.\n");
  for (const input of [JSON.stringify({ workspacePaths: [workspace, other], cwd: workspace }), JSON.stringify({ cwd: workspace }), "not-json", ""]) {
    const result = runPace(["boot", "--host", "antigravity"], { home, cwd: workspace, input });
    assert.equal(result.status, 0);
    const output = JSON.parse(result.stdout).injectSteps[0].systemMessage.systemMessage as string;
    assert.match(output, /## SOUL/);
    assert.doesNotMatch(output, /NOT-CHOSEN-351/);
  }
});

test("Cursor 대체 규칙용 텍스트 부트는 호스트와 역할을 표시하고 오류에도 종료 0을 유지한다", () => {
  const home = tempDir("pace-cursor-text-"); createProfile(home, ALTU);
  const workspace = join(home, "workspace"); mkdirSync(workspace);
  registerWorkspace(home, { path: workspace, name: "합성", summary: "" }, 1500);
  const agent = join(workspace, ".pace", "AGENT.md"); writeFileSync(agent, readFileSync(agent, "utf8") + "\nSynthetic marker CURSOR-TEXT-827.\n");
  const result = runPace(["boot", "--host", "cursor", "--text"], { home, cwd: workspace });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /^\[PACE-BOOT\]/);
  assert.match(result.stdout, /현재 호스트: cursor/);
  assert.match(result.stdout, /CURSOR-TEXT-827/);
  const error = runPace(["boot", "--host", "cursor", "--text", "--bad-option"], { home });
  assert.equal(error.status, 0);
  assert.match(error.stdout, /^\[PACE-BOOT\].*부트 실패/);
});

test("CLI: 훅 입력의 cwd를 써서 해당 프로젝트 브레인을 찾는다", () => {
  const home = tempDir();
  createProfile(home, ALTU);
  const project = tempDir();
  initBrain(project);
  const result = runPace(["boot", "--host", "codex"], { home, input: JSON.stringify({ cwd: project }) });
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout) as { hookSpecificOutput: { additionalContext: string } };
  assert.match(out.hookSpecificOutput.additionalContext, /프로젝트 브레인: 있음/);
});

test("CLI: 오류가 나도 종료 코드 0과 유효한 형식으로 경고를 낸다", () => {
  const home = tempDir();
  const result = runPace(["boot", "--host", "claude"], { home, env: { PACE_PROFILE: "missing" }, input: "" });
  assert.equal(result.status, 0);
  const out = JSON.parse(result.stdout) as { hookSpecificOutput: { additionalContext: string } };
  assert.match(out.hookSpecificOutput.additionalContext, /부트 실패: 없는 프로필: missing/);
});

test("CLI: 표준입력이 닫히지 않아도 부트가 끝난다", async () => {
  const home = tempDir();
  createProfile(home, ALTU);
  const started = Date.now();
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, [PACE_BIN, "boot", "--host", "claude"], {
      env: { ...process.env, PACE_HOME: home, PACE_PROFILE: "" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    const killer = setTimeout(() => {
      child.kill();
      reject(new Error("부트가 끝나지 않음"));
    }, 5000);
    child.on("exit", () => {
      clearTimeout(killer);
      resolve(out);
    });
    // stdin을 열어 둔 채 닫지 않는다.
  });
  assert.ok(Date.now() - started < 5000);
  assert.match(output, /알투/);
});

test("하네스 프로젝트: 진행·병합 대기만 한 줄씩, worktree면 지금 여기, 깨지면 조용히 빠진다", () => {
  const home = tempDir();
  createProfile(home, ALTU);
  const userHome = tempDir();
  const main = join(userHome, "app");
  mkdirSync(main);
  const git = (cwd: string, ...args: string[]) => {
    const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  };
  git(main, "init", "-q", "-b", "main");
  git(main, "config", "user.name", "test");
  git(main, "config", "user.email", "test@example.com");
  writeFileSync(join(main, "AGENTS.md"), "# app");
  const project = (dir: string, state: string, row = "") => {
    mkdirSync(join(main, "projects", dir), { recursive: true });
    writeFileSync(join(main, "projects", dir, "PROJECT.md"), `# ${dir}\n\n- 상태: ${state}\n\n## 태스크\n\n| T | 이름 | 백로그 단계 | 상태 | 커밋 |\n|---|---|---|---|---|\n${row}\n`);
  };
  // 실제 흐름처럼 main에는 정의만 있고, 진행 상태는 worktree 작업본(커밋 전)에만 있다
  project("P001_261023_예약", "정의", "| T01 | 저장 | — | 대기 | |");
  project("P002_261023_알림", "병합 대기");
  project("P003_261023_끝남", "완료");
  project("P004_261023_정의만", "정의");
  git(main, "add", "-A");
  git(main, "commit", "-q", "-m", "init");
  const wt = join(userHome, "app.wt", "P001");
  git(main, "worktree", "add", "-q", wt, "-b", "project/P001");
  writeFileSync(
    join(wt, "projects", "P001_261023_예약", "PROJECT.md"),
    "# P001\n\n- 상태: 진행\n\n## 태스크\n\n| T | 이름 | 백로그 단계 | 상태 | 커밋 |\n|---|---|---|---|---|\n| T01 | 저장 | — | 완료 | a1 |\n| T02 | 발송 | — | 진행 | |\n",
  );

  const atMain = buildBootContext({ home, cwd: main, env: {}, userHome });
  assert.match(atMain, /## 하네스 프로젝트 \(pace project\)\n- P001 예약 · 진행 · T02 발송 진행 · .*app\.wt\/P001\n- P002 알림 · 병합 대기\n/);
  assert.doesNotMatch(atMain, /P003 끝남|P004 정의만/);
  assert.match(atMain, /병합 대기는 main 체크아웃에서 `pace project merge/);

  const atWorktree = buildBootContext({ home, cwd: wt, env: {}, userHome });
  assert.match(atWorktree, /- P001 예약 · 진행 · T02 발송 진행 · ← 지금 이 worktree/);
  assert.match(atWorktree, /이 세션은 P001의 worktree다 — pace-project-dev 스킬/);

  // 깨진 프로젝트 폴더(PROJECT.md 없음)는 그것만 빠지고, git 없는 폴더에서도 부트는 계속된다
  mkdirSync(join(main, "projects", "P005_261023_깨짐"));
  const broken = buildBootContext({ home, cwd: main, env: {}, userHome });
  assert.match(broken, /- P001 예약 · 진행 · T02 발송 진행/);
  assert.doesNotMatch(broken, /P005/);
  const plain = join(userHome, "plain");
  mkdirSync(join(plain, "projects", "P001_261023_x"), { recursive: true });
  writeFileSync(join(plain, "AGENTS.md"), "# plain");
  assert.doesNotMatch(buildBootContext({ home, cwd: plain, env: {}, userHome }), /하네스 프로젝트/);
});

test("부트 순서: 머리말 → 지침 → SOUL → USER → 현재 위치 → 프로젝트 메모리 → 프로필 메모리 → RULES", () => {
  const home = tempDir();
  const dir = createProfile(home, ALTU);
  addMemory(profileMemoryDir(dir), "profile", { type: "rule", name: "개인 규칙", description: "x" });
  const userHome = tempDir();
  const app = join(userHome, "app");
  mkdirSync(app);
  writeFileSync(join(app, "AGENTS.md"), "# app");
  setStatus(projectMemoryDir(app), "진행 중");
  const context = buildBootContext({ home, cwd: app, env: {}, userHome });
  const heads = [BOOT_MARKER, "## 첫 응답 지침", "## SOUL", "## USER", "## 현재 위치:", "## 프로젝트 메모리", "## 프로필 메모리", "## RULES"];
  const at = heads.map((h) => context.indexOf(h));
  assert.ok(at.every((i) => i >= 0), JSON.stringify(at));
  assert.deepEqual([...at].sort((x, y) => x - y), at, JSON.stringify(at));
});

test("부트 예산: 메모리가 많아도 예산 이하로 목록을 줄이고 SOUL·지침·RULES는 온전하다", () => {
  const home = tempDir();
  const dir = createProfile(home, ALTU);
  const userHome = tempDir();
  const app = join(userHome, "app");
  mkdirSync(app);
  writeFileSync(join(app, "AGENTS.md"), "# app");
  const long = "요약 문장을 길게 쓴다 ".repeat(8);
  const force = { force: true }; // 비슷한 긴 요약 수십 개 — 중복 가드는 이 테스트 대상이 아니다
  const pmem = profileMemoryDir(dir);
  const jmem = projectMemoryDir(app);
  for (let i = 0; i < 40; i++) {
    addMemory(pmem, "profile", { type: "rule", name: `개인 규칙 ${i}`, description: `${long}${i}`, body: "본문" }, force);
    addMemory(pmem, "profile", { type: "todo", name: `개인 할 일 ${i}`, description: `${long}${i}` }, force);
    for (const type of ["rule", "issue", "todo", "note"]) addMemory(jmem, "project", { type, name: `${type} ${i}`, description: `${long}${i}` }, force);
  }
  setStatus(jmem, "진행 중");
  const context = buildBootContext({ home, cwd: app, env: {}, userHome });
  assert.ok(context.length <= BOOT_BUDGET, `${context.length}`);
  assert.match(context, /- … 외 \d+건 — `pace memory list`/);
  assert.match(context, /- … 외 \d+건 — `pace memory list --project`/);
  for (const part of ["## 첫 응답 지침", "## SOUL", "# 알투", "사용자 호칭: 캡틴", "## RULES", "| 개발 파트너 |", "프로필 `rule`이 우선"]) assert.ok(context.includes(part), part);
  const rules = readFileSync(join(import.meta.dirname, "..", "templates", "RULES.md"), "utf8").trim();
  assert.ok(context.endsWith(rules), "RULES 전문");
  // 0단계까지 내려가지 않고 각 목록에 항목이 남는다(예산 안에서 가장 덜 줄인 단계)
  for (const part of ["- **개인 규칙 0**", "- 개인 할 일 0 [", "- **rule 0**", "- issue 0 [", "- todo 0 [", "- note 0 —"]) assert.ok(context.includes(part), part);
  const heads = ["## 첫 응답 지침", "## SOUL", "## USER", "## 현재 위치:", "## 프로젝트 메모리", "## 프로필 메모리", "## RULES"].map((h) => context.indexOf(h));
  assert.deepEqual([...heads].sort((x, y) => x - y), heads, "축약해도 순서 유지");

  // 긴 진행 상황도 줄여서 RULES가 예산 안에 남는다(가드는 status 길이를 막지 않는다)
  const huge = tempDir();
  createProfile(huge, ALTU);
  const hugeApp = join(userHome, "huge");
  mkdirSync(hugeApp);
  writeFileSync(join(hugeApp, "AGENTS.md"), "# huge");
  setStatus(projectMemoryDir(hugeApp), `진행 ${"긴 인계 메모 ".repeat(1500)}`);
  const hugeContext = buildBootContext({ home: huge, cwd: hugeApp, env: {}, userHome });
  assert.ok(hugeContext.length <= BOOT_BUDGET, `${hugeContext.length}`);
  assert.match(hugeContext, /… \(전체: `pace memory status --project`\)/);
  assert.ok(hugeContext.endsWith(rules), "RULES 전문");

  // 작은 메모리는 줄이지 않는다
  const small = tempDir();
  const sdir = createProfile(small, ALTU);
  // 상한 단계(10)보다 많은 항목 — 예산 안이면 줄이지 않는다
  for (let i = 0; i < 12; i++) addMemory(profileMemoryDir(sdir), "profile", { type: "rule", name: `작은 규칙 ${i}`, description: `y${i}` });
  const smallContext = buildBootContext({ home: small, cwd: small, env: {}, userHome: small });
  assert.ok(smallContext.length <= BOOT_BUDGET);
  assert.doesNotMatch(smallContext, /외 \d+건/);
  assert.match(smallContext, /작은 규칙 11/);
});

test("부트는 확인된 호스트만 표시하고 plain은 미확인으로 남긴다", () => {
  const home = tempDir("pace-host-profile-");
  createProfile(home, ALTU);
  for (const host of ["claude", "codex", "gemini", "cursor"] as const) {
    const text = buildBootContext({ home, cwd: home, userHome: home, env: {}, host });
    assert.match(text, new RegExp(`현재 호스트: ${host}`));
  }
  const plain = buildBootContext({ home, cwd: home, userHome: home, env: {}, host: "plain" });
  assert.match(plain, /현재 호스트: 미확인/);
});

test("부트의 잘못된 옵션도 종료 코드 0과 유효한 plain 출력을 낸다", () => {
  const home = tempDir("pace-boot-invalid-");
  const result = runPace(["boot", "--not-a-real-option"], { home });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /^\[PACE-BOOT\]/);
});

test("잘못된 옵션에서도 확인된 호스트의 훅 출력 형식을 보존한다", () => {
  const home = tempDir("pace-boot-invalid-host-");
  for (const host of ["claude", "codex", "gemini", "cursor"] as const) {
    const result = runPace(["boot", "--host", host, "--bad-option"], { home });
    assert.equal(result.status, 0);
    const output = JSON.parse(result.stdout) as { additional_context?: string; hookSpecificOutput?: { additionalContext?: string; hookEventName?: string } };
    const context = host === "cursor" ? output.additional_context : output.hookSpecificOutput?.additionalContext;
    if (host !== "cursor") assert.equal(output.hookSpecificOutput?.hookEventName, "SessionStart");
    assert.match(context ?? "", /\[PACE-BOOT\].*실패/);
  }
});

test("중복 호스트 옵션의 오류는 마지막 호스트의 출력 형식을 따른다", () => {
  const home = tempDir("pace-boot-duplicate-host-");
  for (const args of [["--host", "plain", "--host", "cursor"], ["--host=plain", "--host=cursor"]]) {
    const result = runPace(["boot", ...args, "--bad-option"], { home });
    assert.equal(result.status, 0);
    assert.match((JSON.parse(result.stdout) as { additional_context: string }).additional_context, /\[PACE-BOOT\]/);
  }
  const plain = runPace(["boot", "--host", "cursor", "--host", "plain", "--bad-option"], { home });
  assert.equal(plain.status, 0); assert.match(plain.stdout, /^\[PACE-BOOT\]/);
});


test("실제 CLI는 프로필 유무와 무관하게 호스트를 부트 맥락에 전달한다", () => {
  for (const withProfile of [false, true]) {
    const home = tempDir("pace-host-cli-");
    if (withProfile) createProfile(home, ALTU);
    for (const host of ["claude", "codex", "gemini", "cursor", "plain"] as const) {
      const result = runPace(["boot", "--host", host], { home });
      assert.equal(result.status, 0);
      const output = host === "plain" ? result.stdout : (() => {
        const parsed = JSON.parse(result.stdout) as { additional_context?: string; hookSpecificOutput?: { additionalContext?: string; hookEventName?: string } };
        if (host !== "cursor") assert.equal(parsed.hookSpecificOutput?.hookEventName, "SessionStart");
        return host === "cursor" ? parsed.additional_context ?? "" : parsed.hookSpecificOutput?.additionalContext ?? "";
      })();
      assert.ok(output.includes(`현재 호스트: ${host === "plain" ? "미확인" : host}`));
    }
  }
});


test("옵션 끝 뒤 위치 인자를 호스트 지정으로 오인하지 않는다", () => {
  const home = tempDir("pace-boot-terminator-");
  for (const args of [["--host", "cursor", "--", "--host", "plain"], ["--host=cursor", "--", "--host=plain"]]) {
    const result = runPace(["boot", ...args], { home });
    assert.equal(result.status, 0);
    assert.match((JSON.parse(result.stdout) as { additional_context: string }).additional_context, /\[PACE-BOOT\]/);
  }
  const plain = runPace(["boot", "--", "--host=cursor"], { home });
  assert.equal(plain.status, 0); assert.match(plain.stdout, /^\[PACE-BOOT\]/);
});
