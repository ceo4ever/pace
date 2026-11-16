import { test } from "node:test";
import type { TestContext } from "node:test";
import type { PathLike } from "node:fs";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, realpathSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { createCandidate, listCandidates, moveCandidate } from "../src/project/workspace-registry.ts";
import { runPace, tempDir } from "./helpers.ts";

test("프로필의 다른 이름을 새 프로젝트 역할에 사용한다", async () => {
  const { registerWorkspace } = await import("../src/project/workspace-registry.ts");
  const { createProfile } = await import("../src/profile/profile.ts");
  const home = tempDir("pace-nova-home-"), workspace = tempDir("pace-nova-project-");
  createProfile(home, { name: "default", displayName: "Nova", alias: "N", ownerName: "Tester", tone: "clear", personality: "precise", language: "en" });
  registerWorkspace(home, { path: workspace, name: "합성", summary: "" }, 1500);
  const text = readFileSync(join(workspace, ".pace", "AGENT.md"), "utf8");
  assert.match(text, /^# Nova — project role$/m); assert.doesNotMatch(text, /Jarvis|자비스|\{\{displayName\}\}/);
});

function makeTestLink(t: TestContext, target: string, path: string): boolean {
  try { symlinkSync(target, path); return true; } catch (error) {
    if (process.platform === "win32" && ["EPERM", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) {
      t.skip("Windows 심볼릭 링크 생성 권한 없음"); return false;
    }
    throw error;
  }
}

test("후보 두 개를 조회하고 명시적으로 경로를 옮기며 중복을 거부한다", () => {
  const root = tempDir("pace-registry-");
  const home = join(root, "data");
  const a = join(root, "a"), b = join(root, "b"), moved = join(root, "moved");
  for (const p of [a, b, moved]) mkdirSync(p);
  const first = createCandidate(home, { path: a, name: "첫째", summary: "요약" });
  const second = createCandidate(home, { path: b, name: "둘째", summary: "" });
  assert.notEqual(first.id, second.id);
  assert.deepEqual({ path: first.path, name: first.name, summary: first.summary }, { path: realpathSync(a), name: "첫째", summary: "요약" });
  assert.deepEqual({ path: second.path, name: second.name, summary: second.summary }, { path: realpathSync(b), name: "둘째", summary: "" });
  assert.deepEqual(listCandidates(home).sort((x, y) => x.name.localeCompare(y.name)), [first, second].sort((x, y) => x.name.localeCompare(y.name)));
  const before = readFileSync(join(home, "projects", `${first.id}.json`), "utf8");
  assert.throws(() => createCandidate(home, { path: a, name: "중복", summary: "" }), /중복/);
  assert.throws(() => moveCandidate(home, first.id, b), /중복/);
  assert.equal(readFileSync(join(home, "projects", `${first.id}.json`), "utf8"), before);
  const updated = moveCandidate(home, first.id, moved);
  assert.deepEqual(updated, { ...first, path: realpathSync(moved) });
  assert.equal(listCandidates(home).find((entry) => entry.id === first.id)?.path, realpathSync(moved));
});

test("경로 탈출 ID와 심볼릭 링크 등록부·항목을 거부한다", (t) => {
  const root = tempDir("pace-registry-security-");
  const home = join(root, "data"), outside = join(root, "outside"), workspace = join(root, "workspace");
  mkdirSync(home); mkdirSync(outside); mkdirSync(workspace);
  const victim = join(outside, "victim"); writeFileSync(victim, "보존");
  if (!makeTestLink(t, outside, join(home, "projects"))) return;
  assert.throws(() => createCandidate(home, { path: workspace, name: "x", summary: "" }));
  assert.equal(readFileSync(victim, "utf8"), "보존");
  const safe = join(root, "safe"); mkdirSync(safe);
  const candidate = createCandidate(safe, { path: workspace, name: "x", summary: "" });
  assert.throws(() => moveCandidate(safe, "../../victim", workspace));
  const fakeId = "00000000-0000-4000-8000-000000000000";
  if (!makeTestLink(t, victim, join(safe, "projects", `${fakeId}.json`))) return;
  assert.throws(() => moveCandidate(safe, fakeId, workspace));
  assert.equal(readFileSync(victim, "utf8"), "보존");
  assert.equal(candidate.path, realpathSync(workspace));
});


test("비밀로 보이는 요약은 원문을 표시하거나 저장하지 않는다", () => {
  const root = tempDir("pace-registry-secret-");
  const workspace = join(root, "workspace"); mkdirSync(workspace);
  const secret = "sk-" + "a".repeat(32);
  assert.throws(() => createCandidate(root, { path: workspace, name: "x", summary: secret }), (error: Error) => !error.message.includes(secret));
  assert.deepEqual(listCandidates(root), []);
});


test("존재하지 않는 비밀 경로는 파일 접근 전 거부하고 오류에 노출하지 않는다", () => {
  const root = tempDir("pace-registry-secret-path-");
  const workspace = join(root, "workspace"); mkdirSync(workspace);
  const candidate = createCandidate(root, { path: workspace, name: "x", summary: "" });
  const secret = "sk-" + "b".repeat(32);
  const path = join(root, secret);
  for (const call of [() => createCandidate(root, { path, name: "y", summary: "" }), () => moveCandidate(root, candidate.id, path)]) {
    assert.throws(call, (error: Error) => !error.message.includes(secret));
  }
  assert.equal(listCandidates(root).length, 1);
});


test("잘못된 위치와 경로 별칭 중복을 거부해 기존 후보를 보존한다", (t) => {
  const root = tempDir("pace-registry-paths-");
  const a = join(root, "a"), b = join(root, "b"), alias = join(root, "alias"), file = join(root, "file");
  mkdirSync(a); mkdirSync(b); if (!makeTestLink(t, b, alias)) return; writeFileSync(file, "변경 금지");
  const first = createCandidate(root, { path: a, name: "이름", summary: "설명" });
  createCandidate(root, { path: b, name: "다른 이름", summary: "다른 설명" });
  const saved = readFileSync(join(root, "projects", `${first.id}.json`), "utf8");
  for (const path of ["relative", join(root, "missing"), file, alias]) {
    assert.throws(() => moveCandidate(root, first.id, path));
    assert.equal(readFileSync(join(root, "projects", `${first.id}.json`), "utf8"), saved);
  }
  assert.equal(readFileSync(file, "utf8"), "변경 금지");
  assert.deepEqual(listCandidates(root).find((entry) => entry.id === first.id), first);
});


test("AGENT 없는 후보는 부트에 활성 등록 정보로 노출되지 않는다", () => {
  const root = tempDir("pace-registry-boot-");
  const workspace = join(root, "workspace"); mkdirSync(workspace);
  const marker = "CANDIDATE_ONLY_5473";
  createCandidate(root, { path: workspace, name: marker, summary: "후보" });
  const profile = runPace(["profile", "create", "default", "--display-name", "Agent", "--alias", "A", "--owner", "User", "--tone", "clear", "--personality", "precise", "--language", "en"], { home: root });
  assert.equal(profile.status, 0);
  const boot = runPace(["boot", "--host", "plain"], { home: root, cwd: workspace });
  assert.equal(boot.status, 0);
  assert.doesNotMatch(boot.stdout, new RegExp(marker));
});

test("후보는 일치하는 유효 정의가 있을 때만 활성화된다", async () => {
  const { activateCandidate } = await import("../src/project/workspace-registry.ts");
  const root = tempDir("pace-registry-activate-");
  const workspace = join(root, "workspace"); mkdirSync(workspace);
  const candidate = createCandidate(root, { path: workspace, name: "x", summary: "" });
  const file = join(root, "projects", `${candidate.id}.json`);
  const original = readFileSync(file, "utf8");
  assert.throws(() => activateCandidate(root, candidate.id, 1500));
  assert.equal(readFileSync(file, "utf8"), original);
  mkdirSync(join(workspace, ".pace"));
  const agent = join(workspace, ".pace", "AGENT.md");
  const template = (id: string) => `---\npace_agent_version: 2\nworkspace_id: ${id}\n---\n\n# Jarvis — role\n\n## Mission\nHelp.\n\n## Boundaries\nFollow rules.\n\n## Knowledge\nRead memory.\n`;
  writeFileSync(agent, template("00000000-0000-4000-8000-000000000000"));
  assert.throws(() => activateCandidate(root, candidate.id, 1500));
  assert.equal(readFileSync(file, "utf8"), original);
  writeFileSync(agent, template(candidate.id));
  assert.equal(activateCandidate(root, candidate.id, 1500).active, true);
  assert.equal(listCandidates(root)[0]?.active, true);
  const activeBytes = readFileSync(file, "utf8");
  assert.throws(() => moveCandidate(root, candidate.id, workspace), /재검증/);
  assert.equal(readFileSync(file, "utf8"), activeBytes);
});

test("기존 v2 정의의 ID로 후보를 연결하며 같은 ID는 덮어쓰지 않는다", () => {
  const root = tempDir("pace-registry-existing-id-");
  const a = join(root, "a"), b = join(root, "b"); mkdirSync(a); mkdirSync(b);
  const id = "00000000-0000-4000-8000-000000000000";
  const first = createCandidate(root, { path: a, name: "기존", summary: "원본" }, id);
  const file = join(root, "projects", `${id}.json`);
  const before = readFileSync(file, "utf8");
  assert.equal(first.id, id);
  assert.throws(() => createCandidate(root, { path: b, name: "중복", summary: "변경" }, id));
  assert.equal(readFileSync(file, "utf8"), before);
});

test("등록은 새 정의 또는 기존 유효 정의와 같은 ID를 활성 상태로 연결한다", async () => {
  const { registerWorkspace } = await import("../src/project/workspace-registry.ts");
  const root = tempDir("pace-workspace-register-");
  const a = join(root, "a"), b = join(root, "b"); mkdirSync(a); mkdirSync(b);
  const created = registerWorkspace(root, { path: a, name: "새 항목", summary: "" }, 1500);
  const content = readFileSync(join(a, ".pace", "AGENT.md"), "utf8");
  assert.match(content, new RegExp(`workspace_id: ${created.id}`));
  assert.equal(created.active, true);
  mkdirSync(join(b, ".pace"));
  const existing = content.replace(created.id, "00000000-0000-4000-8000-000000000000");
  writeFileSync(join(b, ".pace", "AGENT.md"), existing);
  const registered = registerWorkspace(root, { path: b, name: "기존 항목", summary: "" }, 1500);
  assert.equal(registered.id, "00000000-0000-4000-8000-000000000000");
  assert.equal(readFileSync(join(b, ".pace", "AGENT.md"), "utf8"), existing);
  assert.equal(registered.active, true);
});

test("등록 실패 시 정의 원본과 등록부를 변경하지 않는다", async () => {
  const { registerWorkspace } = await import("../src/project/workspace-registry.ts");
  const root = tempDir("pace-workspace-register-fail-");
  const workspace = join(root, "workspace"); mkdirSync(join(workspace, ".pace"), { recursive: true });
  const agent = join(workspace, ".pace", "AGENT.md"); const bad = "v1 원본"; writeFileSync(agent, bad);
  assert.throws(() => registerWorkspace(root, { path: workspace, name: "x", summary: "" }, 1500));
  assert.equal(readFileSync(agent, "utf8"), bad);
  assert.deepEqual(listCandidates(root), []);
});

test("활성 목록은 삭제·변경된 정의를 더 이상 활성으로 반환하지 않는다", async () => {
  const { registerWorkspace, listActiveWorkspaces } = await import("../src/project/workspace-registry.ts");
  const root = tempDir("pace-workspace-stale-");
  const workspace = join(root, "workspace"); mkdirSync(workspace);
  const candidate = registerWorkspace(root, { path: workspace, name: "x", summary: "" }, 1500);
  assert.equal(listActiveWorkspaces(root, 1500)[0]?.id, candidate.id);
  writeFileSync(join(workspace, ".pace", "AGENT.md"), "invalid");
  assert.deepEqual(listActiveWorkspaces(root, 1500), []);
});

test("부트용 정의 조회는 현재 활성 등록과 검증된 ID가 일치할 때만 원문을 돌려준다", async () => {
  const { registerWorkspace, readActiveWorkspaceAgent } = await import("../src/project/workspace-registry.ts");
  const home = tempDir("pace-active-agent-");
  const active = join(home, "active"), inactive = join(home, "inactive");
  mkdirSync(active); mkdirSync(inactive);
  createCandidate(home, { path: inactive, name: "후보", summary: "" });
  const entry = registerWorkspace(home, { path: active, name: "활성", summary: "" }, 1500);
  const file = join(active, ".pace", "AGENT.md");
  const text = readFileSync(file, "utf8");
  assert.equal(readActiveWorkspaceAgent(home, active, 1500), text);
  assert.equal(readActiveWorkspaceAgent(home, inactive, 1500), null);
  assert.throws(() => readActiveWorkspaceAgent(home, active, 1), /길이/);
  writeFileSync(file, text.replace(entry.id, "00000000-0000-4000-8000-000000000000"));
  assert.throws(() => readActiveWorkspaceAgent(home, active, 1500), /일치하지/);
});

test("부트용 정의 조회는 교체된 링크와 큰 파일을 거부하고 손상 레코드 원문을 노출하지 않는다", async (t) => {
  const { registerWorkspace, readActiveWorkspaceAgent } = await import("../src/project/workspace-registry.ts");
  const home = tempDir("pace-active-agent-safety-");
  const workspace = join(home, "workspace"); mkdirSync(workspace);
  const entry = registerWorkspace(home, { path: workspace, name: "활성", summary: "" }, 1500);
  const agent = join(workspace, ".pace", "AGENT.md"), original = readFileSync(agent, "utf8");
  const other = join(home, "other"); writeFileSync(other, original);
  unlinkSync(agent); if (!makeTestLink(t, other, agent)) return;
  assert.throws(() => readActiveWorkspaceAgent(home, workspace, 1500), /확인할 수 없다/);
  unlinkSync(agent); writeFileSync(agent, "x".repeat(6001));
  assert.throws(() => readActiveWorkspaceAgent(home, workspace, 1500), /길이/);
  writeFileSync(agent, original);
  const secret = "sk-" + "test-private-fragment";
  writeFileSync(join(home, "projects", `${entry.id}.json`), `{"id": ${secret}`);
  assert.throws(() => readActiveWorkspaceAgent(home, workspace, 1500), (error: Error) => error.message === "잘못된 등록 항목" && !error.message.includes(secret));
});

test("기존 대소문자 별칭 레코드는 같은 실제 디렉터리의 중복 등록을 막는다", async () => {
  const { registerWorkspace, readActiveWorkspaceAgent } = await import("../src/project/workspace-registry.ts");
  const home = tempDir("pace-workspace-alias-");
  const workspace = join(home, "RepoMixed"); mkdirSync(workspace);
  const alias = join(home, "repomixed");
  if (!existsSync(alias)) return; // 대소문자를 구별하는 파일 시스템에서는 서로 다른 경로다.
  const entry = registerWorkspace(home, { path: workspace, name: "기존", summary: "" }, 1500);
  const file = join(home, "projects", `${entry.id}.json`);
  writeFileSync(file, JSON.stringify({ ...entry, path: alias }));
  assert.ok(readActiveWorkspaceAgent(home, workspace, 1500));
  assert.throws(() => createCandidate(home, { path: workspace, name: "중복", summary: "" }), /중복/);
  assert.throws(() => registerWorkspace(home, { path: workspace, name: "중복", summary: "" }, 1500), /중복/);
});

test("workspace CLI는 새 정의와 일치하는 활성 등록을 만들고 조회한다", () => {
  const home = tempDir("pace-workspace-cli-");
  const workspace = join(home, "repo"); mkdirSync(workspace);
  const created = runPace(["workspace", "register", workspace, "--name", "합성"], { home });
  assert.equal(created.status, 0, created.stderr);
  const listed = runPace(["workspace", "list"], { home });
  assert.equal(listed.status, 0, listed.stderr);
  assert.match(listed.stdout, /합성/);
  assert.ok(readFileSync(join(workspace, ".pace", "AGENT.md"), "utf8").includes("pace_agent_version: 2"));
});

test("활성 워크스페이스 위치 변경은 새 위치의 같은 정의를 확인한다", async () => {
  const { registerWorkspace, relocateWorkspace } = await import("../src/project/workspace-registry.ts");
  const root = tempDir("pace-workspace-relocate-");
  const a = join(root, "a"), b = join(root, "b"); mkdirSync(a); mkdirSync(b);
  const entry = registerWorkspace(root, { path: a, name: "x", summary: "" }, 1500);
  const file = join(root, "projects", `${entry.id}.json`), original = readFileSync(file, "utf8");
  assert.throws(() => relocateWorkspace(root, entry.id, b, 1500));
  assert.equal(readFileSync(file, "utf8"), original);
  mkdirSync(join(b, ".pace"));
  writeFileSync(join(b, ".pace", "AGENT.md"), readFileSync(join(a, ".pace", "AGENT.md"), "utf8"));
  assert.equal(relocateWorkspace(root, entry.id, b, 1500).path, realpathSync(b));
});

test("git에서 정의가 무시되면 등록 후 추적 경고를 출력한다", async () => {
  const { spawnSync } = await import("node:child_process");
  const home = tempDir("pace-workspace-ignore-");
  const workspace = join(home, "repo"); mkdirSync(workspace);
  assert.equal(spawnSync("git", ["init", "-q", workspace]).status, 0);
  writeFileSync(join(workspace, ".gitignore"), ".pace/\n");
  const result = runPace(["workspace", "register", workspace, "--name", "합성"], { home });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /git에서 무시/);
  assert.match(result.stdout, /\.gitignore의 \.pace\/ 제외/);
});

test("등록 검증 실패는 새 정의·활성 레코드를 남기지 않고 기존 항목을 보존한다", async () => {
  const { registerWorkspace } = await import("../src/project/workspace-registry.ts");
  const root = tempDir("pace-workspace-atomic-");
  const a = join(root, "a"), b = join(root, "b"); mkdirSync(a); mkdirSync(b);
  const first = registerWorkspace(root, { path: a, name: "정본", summary: "보존" }, 1500);
  const before = readFileSync(join(root, "projects", `${first.id}.json`), "utf8");
  assert.throws(() => registerWorkspace(root, { path: b, name: "초과", summary: "" }, 10));
  assert.equal(existsSync(join(b, ".pace", "AGENT.md")), false);
  assert.equal(readFileSync(join(root, "projects", `${first.id}.json`), "utf8"), before);
  assert.deepEqual(listCandidates(root), [first]);
});

test("활성화는 외부 심볼릭 링크 정의를 거부하고 레코드를 보존한다", async (t) => {
  const { activateCandidate } = await import("../src/project/workspace-registry.ts");
  const root = tempDir("pace-workspace-agent-link-");
  const workspace = join(root, "workspace"), outside = join(root, "outside"); mkdirSync(workspace); mkdirSync(outside);
  const candidate = createCandidate(root, { path: workspace, name: "x", summary: "" });
  const sentinel = join(outside, "AGENT.md"); writeFileSync(sentinel, "보존");
  if (!makeTestLink(t, outside, join(workspace, ".pace"))) return;
  const file = join(root, "projects", `${candidate.id}.json`), before = readFileSync(file, "utf8");
  assert.throws(() => activateCandidate(root, candidate.id, 1500));
  assert.equal(readFileSync(file, "utf8"), before);
  assert.equal(readFileSync(sentinel, "utf8"), "보존");
});

test("같은 ID를 가진 기존 정의의 등록 충돌은 양쪽 원문을 보존한다", async () => {
  const { registerWorkspace } = await import("../src/project/workspace-registry.ts");
  const root = tempDir("pace-workspace-id-collision-");
  const a = join(root, "a"), b = join(root, "b"); mkdirSync(a); mkdirSync(b);
  const first = registerWorkspace(root, { path: a, name: "첫째", summary: "보존" }, 1500);
  mkdirSync(join(b, ".pace"));
  const content = readFileSync(join(a, ".pace", "AGENT.md"), "utf8");
  writeFileSync(join(b, ".pace", "AGENT.md"), content);
  const file = join(root, "projects", `${first.id}.json`), before = readFileSync(file, "utf8");
  assert.throws(() => registerWorkspace(root, { path: b, name: "둘째", summary: "" }, 1500));
  assert.equal(readFileSync(join(b, ".pace", "AGENT.md"), "utf8"), content);
  assert.equal(readFileSync(file, "utf8"), before);
  assert.deepEqual(listCandidates(root), [first]);
});

test("내부 후보 등록은 기존 후보 ID로 정의를 만들고 활성화한다", async () => {
  const { registerWorkspace } = await import("../src/project/workspace-registry.ts");
  const root = tempDir("pace-candidate-activation-"); const workspace = join(root, "workspace"); mkdirSync(workspace);
  const pending = createCandidate(root, { path: workspace, name: "후보", summary: "보존" });
  const active = registerWorkspace(root, { path: workspace, name: "무시", summary: "" }, 1500);
  assert.equal(active.id, pending.id); assert.equal(active.name, "후보"); assert.equal(active.active, true);
  assert.match(readFileSync(join(workspace, ".pace", "AGENT.md"), "utf8"), new RegExp(pending.id));
});

test("무효 버전의 활성 항목을 목록에서 조용히 누락하지 않고 진단한다", () => {
  const home = tempDir("pace-workspace-diagnose-"); const workspace = join(home, "repo"); mkdirSync(workspace);
  assert.equal(runPace(["workspace", "register", workspace, "--name", "합성"], { home }).status, 0);
  const path = join(workspace, ".pace", "AGENT.md");
  writeFileSync(path, readFileSync(path, "utf8").replace("pace_agent_version: 2", "pace_agent_version: 9"));
  const listed = runPace(["workspace", "list"], { home });
  assert.equal(listed.status, 0); assert.match(listed.stdout, /주의.*정의/);
  assert.equal(runPace(["profile", "create", "default", "--display-name", "Agent", "--alias", "A", "--owner", "User", "--tone", "clear", "--personality", "precise", "--language", "en"], { home }).status, 0);
  const boot = runPace(["boot", "--host", "plain"], { home, cwd: workspace });
  assert.equal(boot.status, 0); assert.match(boot.stdout, /AGENT.*확인/);
});

test("등록 레코드 확정 뒤 임시 파일 정리 오류가 나도 정의와 활성 레코드는 일관된다", async () => {
  const fs = (await import("node:fs")).default;
  const { syncBuiltinESMExports } = await import("node:module");
  const { registerWorkspace, listActiveWorkspaces } = await import("../src/project/workspace-registry.ts");
  const root = tempDir("pace-register-cleanup-fail-"), workspace = join(root, "workspace"); mkdirSync(workspace);
  const original = fs.unlinkSync;
  try {
    fs.unlinkSync = ((path: PathLike) => {
      if (dirname(String(path)) === join(root, "projects") && basename(String(path)).startsWith(".")) throw Object.assign(new Error("injected"), { code: "EACCES" });
      return original(path);
    }) as typeof fs.unlinkSync;
    syncBuiltinESMExports();
    const entry = registerWorkspace(root, { path: workspace, name: "x", summary: "" }, 1500);
    assert.equal(entry.active, true);
    assert.ok(existsSync(join(workspace, ".pace", "AGENT.md")));
    assert.equal(listActiveWorkspaces(root, 1500)[0]?.id, entry.id);
  } finally {
    fs.unlinkSync = original;
    syncBuiltinESMExports();
  }
});

test("정의 생성 후 등록 레코드 쓰기가 실패하면 생성한 정의를 되돌린다", async () => {
  const fs = (await import("node:fs")).default;
  const { syncBuiltinESMExports } = await import("node:module");
  const { registerWorkspace } = await import("../src/project/workspace-registry.ts");
  const root = tempDir("pace-register-write-fail-"), workspace = join(root, "workspace"); mkdirSync(workspace);
  const original = fs.linkSync;
  try {
    fs.linkSync = ((src: PathLike, dest: PathLike) => {
      if (dirname(String(dest)) === join(root, "projects")) throw Object.assign(new Error("injected"), { code: "EACCES" });
      return original(src, dest);
    }) as typeof fs.linkSync;
    syncBuiltinESMExports();
    assert.throws(() => registerWorkspace(root, { path: workspace, name: "x", summary: "" }, 1500));
    assert.equal(existsSync(join(workspace, ".pace", "AGENT.md")), false);
    assert.deepEqual(listCandidates(root), []);
  } finally {
    fs.linkSync = original;
    syncBuiltinESMExports();
  }
});

test("workspace CLI는 BR02 비활성 후보를 동일 ID로 활성화한다", () => {
  const home = tempDir("pace-candidate-cli-"), workspace = join(home, "repo"); mkdirSync(workspace);
  const pending = createCandidate(home, { path: workspace, name: "후보", summary: "" });
  const result = runPace(["workspace", "register", workspace], { home });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(pending.id));
  assert.equal(listCandidates(home)[0]?.active, true);
  assert.match(readFileSync(join(workspace, ".pace", "AGENT.md"), "utf8"), new RegExp(pending.id));
});
