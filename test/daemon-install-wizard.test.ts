import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeAcp, createAcpExecutor } from "../src/agent/acp-executor.ts";
import { loadChainConfig, memoryCooldownStore, parseChainConfig, resolveChain } from "../src/agent/chain.ts";
import { daemonCommand } from "../src/daemon/cli.ts";
import { launcherPath, RUN_VALUE } from "../src/daemon/autostart.ts";
import { createChainRunner } from "../src/daemon/runner.ts";
import { readTelegramSecret } from "../src/daemon/telegram/index.ts";
import { FakeSystem } from "./fake-system.ts";
import { tempDir } from "./helpers.ts";

function setup(options: { interactive?: boolean; answers?: boolean[]; lines?: string[]; secret?: string } = {}) {
  const home = tempDir("pace-home-");
  const profile = tempDir("pace-profile-");
  const chainFile = join(profile, "agent-chains.json");
  const sys = new FakeSystem();
  const out: string[] = [];
  const answers = [...(options.answers ?? [])];
  const lines = [...(options.lines ?? [])];
  const questions: string[] = [];
  const run = (args: string[]) => {
    process.env.PACE_HOME = home;
    return daemonCommand(args, {
      runner: sys.runner, out: (l) => out.push(l), platform: "win32", nodePath: "C:\\node.exe", binPath: "C:\\pace\\bin\\pace.ts",
      interactive: options.interactive ?? false, chainFile,
      ask: async (q) => { questions.push(q); return answers.shift() ?? false; },
      askLine: async (q, fallback) => { questions.push(q); return lines.shift() ?? fallback; },
      readSecret: async (q) => { questions.push(q); return options.secret ?? ""; },
      setupDeps: { npm: sys.npm },
    });
  };
  return { home, profile, chainFile, sys, out, run, questions };
}

const TOKEN = `123456789:${"A".repeat(35)}`;

test("S-18 체인이 없으면 setup을 이어서 실행한 뒤 등록한다(호출 순서: 감지·체인 쓰기 → reg add)", async () => {
  const s = setup();
  assert.equal(await s.run(["install", "--yes"]), 0);
  assert.ok(existsSync(s.chainFile));
  const config = parseChainConfig(JSON.parse(readFileSync(s.chainFile, "utf8")));
  assert.ok(config.chains.default);
  const idxRegAdd = s.sys.calls.findIndex((c) => c.command === "reg" && c.args[0] === "add");
  const idxStatus = s.sys.calls.findIndex((c) => c.command === "claude" && c.args[1] === "status");
  assert.ok(idxStatus >= 0 && idxRegAdd > idxStatus);
  assert.equal(s.sys.registry.size, 1);
  assert.match(s.out.join("\n"), /에이전트 설정을 이어서 실행한다/);
  assert.ok(existsSync(launcherPath(s.home)));
});

test("S-18 준비된 에이전트가 없어 체인을 못 만들면 등록 0·실패", async () => {
  const s = setup();
  s.sys.claude.installed = false; s.sys.codex.installed = false;
  assert.equal(await s.run(["install", "--yes"]), 1);
  assert.equal(s.sys.registry.size, 0);
  assert.ok(!s.sys.calls.some((c) => c.command === "reg" && c.args[0] === "add"));
  assert.ok(!existsSync(s.chainFile));
  assert.match(s.out.join("\n"), /등록하지 않았다/);
  // 로그인 안 된 CLI뿐이고 로그인 허락도 없으면 같은 결과
  const s2 = setup();
  s2.sys.claude.loggedIn = false; s2.sys.codex.loggedIn = false;
  assert.equal(await s2.run(["install", "--yes"]), 1);
  assert.equal(s2.sys.registry.size, 0);
});

test("S-18 체인이 이미 있으면 setup을 건너뛰고 바로 등록한다", async () => {
  const s = setup();
  writeFileSync(s.chainFile, JSON.stringify({ chains: { default: { steps: [{ agent: "codex", mode: "p" }] } } }));
  assert.equal(await s.run(["install", "--yes"]), 0);
  assert.ok(!s.sys.calls.some((c) => c.command === "claude"), "감지 호출도 없다");
  assert.equal(s.sys.registry.size, 1);
});

test("S-19 비대화형이면 Telegram을 묻지 않고 안내 한 줄만 낸다", async () => {
  const s = setup();
  writeFileSync(s.chainFile, JSON.stringify({ chains: { default: { steps: [{ agent: "codex", mode: "p" }] } } }));
  assert.equal(await s.run(["install", "--yes"]), 0);
  assert.equal(s.questions.length, 0);
  assert.equal(s.out.filter((l) => /telegram init/.test(l)).length, 1);
  assert.equal(readTelegramSecret(s.home), null);
});

test("S-20 --yes 없이 비대화형이면 어떤 변경도 호출도 없이 계획만 출력한다(체인 있음·없음 모두)", async () => {
  for (const withChain of [true, false]) {
    const s = setup();
    s.sys.claude.loggedIn = false;
    if (withChain) writeFileSync(s.chainFile, JSON.stringify({ chains: { default: { steps: [{ agent: "codex", mode: "p" }] } } }));
    const before = withChain ? readFileSync(s.chainFile, "utf8") : null;
    assert.equal(await s.run(["install"]), 0);
    assert.deepEqual(s.sys.calls, [], "가짜 실행자 호출 0(상태 조회 포함)");
    assert.equal(s.sys.registry.size, 0);
    assert.deepEqual(readdirSync(s.profile).filter((f) => f !== "agent-chains.json"), []);
    assert.deepEqual(readdirSync(s.home), [], "런처·시크릿 생성 0");
    assert.equal(existsSync(s.chainFile), withChain);
    if (before) assert.equal(readFileSync(s.chainFile, "utf8"), before);
    const text = s.out.join("\n");
    assert.match(text, /--yes/);
    assert.match(text, withChain ? /준비돼 있다/ : /pace agent setup/);
    assert.doesNotMatch(text, /약관|확인 전/);
  }
});

test("--agents·--login·--install-adapters는 setup에 전달된다", async () => {
  const s = setup();
  s.sys.claude.loggedIn = false;
  s.sys.codex.installed = false;
  assert.equal(await s.run(["install", "--yes", "--agents", "claude", "--login", "--install-adapters"]), 0);
  assert.ok(s.sys.calls.some((c) => c.command === "claude" && c.args[1] === "login"));
  assert.ok(s.sys.calls.some((c) => c.command === "fake-npm"));
  assert.deepEqual(JSON.parse(readFileSync(s.chainFile, "utf8")).chains.default.steps, [{ agent: "claude", mode: "acp" }]);
});

test("S-21 setup 직후 daemon runner가 default 체인을 해석·실행한다(체인 설정 파일이 없다 오류 없음)", async () => {
  const s = setup();
  s.sys.adapter = true;
  assert.equal(await s.run(["install", "--yes"]), 0);
  resolveChain(loadChainConfig(s.chainFile), "default");
  const trusted = { ...claudeAcp, readOnlyVersions: ["9.9.9"], resumeMethod: "session/resume" as const };
  const exec = createAcpExecutor(trusted, { command: process.execPath, args: [join(import.meta.dirname, "fake-acp-agent.mjs"), "ok", "", "", ""], graceMs: 300 });
  const runner = createChainRunner({ home: s.home, chainFile: s.chainFile, find: (a, m) => (a === "claude" && m === "acp" ? exec : undefined), cooldowns: memoryCooldownStore(), identity: () => "[정체성]", timeoutMs: 10_000 });
  const cwd = tempDir();
  const ac = new AbortController();
  const result = await runner(
    { taskId: "t1", prompt: "질문", conversation: "c1", saved: null, target: { workspace: "a", worktreeName: "main", worktree: cwd, dev: "0", ino: "0", chain: "default", access: "read-only", sessionKey: "k" } },
    { signal: ac.signal, update: () => {}, onProcess: () => {}, requestApproval: async () => false });
  assert.equal(result.status, "done");
  assert.doesNotMatch(result.text, /체인 설정 파일이 없다/);
});

test("S-22 이 파일의 시험은 실제 레지스트리를 쓰지 않았다 — 등록은 가짜 실행자 상태에만 있다", async () => {
  const s = setup();
  writeFileSync(s.chainFile, JSON.stringify({ chains: { default: { steps: [{ agent: "codex", mode: "p" }] } } }));
  await s.run(["install", "--yes"]);
  assert.ok(s.sys.registry.has(RUN_VALUE));
});
