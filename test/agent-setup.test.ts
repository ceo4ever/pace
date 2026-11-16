import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseChainConfig } from "../src/agent/chain.ts";
import { CLAUDE_ADAPTER_PACKAGE, detectAgents, runAgentSetup, SetupUsageError, type SetupDeps, type SetupOptions } from "../src/agent/setup.ts";
import { FakeSystem } from "./fake-system.ts";
import { tempDir } from "./helpers.ts";

function harness(options: { interactive?: boolean; answers?: boolean[]; line?: string; chainFile?: string | null } = {}) {
  const dir = tempDir("pace-profile-");
  const sys = new FakeSystem();
  const out: string[] = [];
  const questions: string[] = [];
  const answers = [...(options.answers ?? [])];
  const file = options.chainFile === undefined ? join(dir, "agent-chains.json") : options.chainFile;
  const deps: SetupDeps = {
    runner: sys.runner, platform: "win32", interactive: options.interactive ?? false,
    ask: async (q) => { questions.push(q); return answers.shift() ?? false; },
    askLine: async (q, fallback) => { questions.push(q); return options.line ?? fallback; },
    out: (l) => out.push(l), chainFile: file, npm: sys.npm,
  };
  const run = (o: SetupOptions = {}) => runAgentSetup(deps, o);
  const chain = () => JSON.parse(readFileSync(file!, "utf8"));
  return { dir, sys, out, questions, deps, run, file: file!, chain };
}

test("S-10 감지: CLI·로그인·어댑터 상태 표, 확인 못 한 것은 미로그인으로 본다", () => {
  const h = harness();
  h.sys.adapter = true;
  assert.deepEqual(detectAgents(h.deps).map((s) => [s.agent, s.installed, s.loggedIn, s.adapterInstalled]), [["claude", true, true, true], ["codex", true, true, false]]);
  h.sys.claude.loggedIn = false;
  assert.equal(detectAgents(h.deps)[0]!.loggedIn, false);
  h.sys.codex.installed = false;
  const statuses = detectAgents(h.deps);
  assert.deepEqual([statuses[1]!.installed, statuses[1]!.loggedIn], [false, false]);
  // 로그인 상태 명령이 시간 초과·알 수 없는 출력이면 미로그인
  const timeoutDeps = { ...h.deps, runner: ((c, a, o) => (c === "claude" && a[0] === "auth" ? { status: null, stdout: "", stderr: "", timedOut: true } : h.sys.runner(c, a, o))) as SetupDeps["runner"] };
  h.sys.claude.loggedIn = true;
  assert.equal(detectAgents(timeoutDeps)[0]!.loggedIn, false);
  const garbage = { ...h.deps, runner: ((c, a, o) => (c === "claude" && a[0] === "auth" ? { status: 0, stdout: "not json", stderr: "" } : h.sys.runner(c, a, o))) as SetupDeps["runner"] };
  assert.equal(detectAgents(garbage)[0]!.loggedIn, false);
});

test("S-11 미로그인 claude: 대화형 yes면 공식 로그인을 상속 입출력으로 실행·재확인해 체인에 포함, no면 뺀다", async () => {
  const yes = harness({ interactive: true, answers: [true, false] }); // 로그인 yes, (어댑터 질문 no)
  yes.sys.claude.loggedIn = false;
  const r = await yes.run();
  assert.equal(r.code, 0);
  const login = yes.sys.calls.find((c) => c.command === "claude" && c.args[0] === "auth" && c.args[1] === "login")!;
  assert.ok(login.inherit, "로그인은 터미널을 그대로 잇는다");
  assert.deepEqual(yes.chain().chains.default.steps.map((s: { agent: string }) => s.agent), ["claude", "codex"]);

  const no = harness({ interactive: true, answers: [false, false] });
  no.sys.claude.loggedIn = false;
  const r2 = await no.run();
  assert.equal(r2.code, 0);
  assert.ok(!no.sys.calls.some((c) => c.args.includes("login") && c.command === "claude"));
  assert.deepEqual(no.chain().chains.default.steps, [{ agent: "codex", mode: "p" }]);
});

test("S-12 어댑터: claude CLI만 있고 어댑터 없음 — 동의 없으면 설치 0·p 단계, --install-adapters면 고정 버전을 설치하고 acp 단계", async () => {
  const none = harness();
  none.sys.codex.installed = false;
  assert.equal((await none.run()).code, 0);
  assert.equal(none.sys.calls.filter((c) => c.command === "fake-npm" && c.args.includes("install")).length, 0);
  assert.deepEqual(none.chain().chains.default.steps, [{ agent: "claude", mode: "p" }]);

  const yes = harness();
  yes.sys.codex.installed = false;
  assert.equal((await yes.run({ installAdapters: true })).code, 0);
  const npm = yes.sys.calls.filter((c) => c.command === "fake-npm" && c.args.includes("install"));
  assert.equal(npm.length, 1);
  assert.deepEqual(npm[0]!.args, ["install", "-g", CLAUDE_ADAPTER_PACKAGE]);
  assert.match(CLAUDE_ADAPTER_PACKAGE, /@0\.81\.1$/);
  assert.deepEqual(yes.chain().chains.default.steps, [{ agent: "claude", mode: "acp" }]);

  const failed = harness();
  failed.sys.codex.installed = false; failed.sys.npmFails = true;
  assert.equal((await failed.run({ installAdapters: true })).code, 0);
  assert.deepEqual(failed.chain().chains.default.steps, [{ agent: "claude", mode: "p" }]);
  assert.match(failed.out.join("\n"), /어댑터 설치가 실패했다/);

  // claude CLI 자체가 없으면 체인에 claude가 없다
  const noClaude = harness();
  noClaude.sys.claude.installed = false;
  assert.equal((await noClaude.run()).code, 0);
  assert.deepEqual(noClaude.chain().chains.default.steps, [{ agent: "codex", mode: "p" }]);
});

test("S-12b 로그인 명령이 성공 종료여도 재확인이 미로그인이면 체인에서 뺀다", async () => {
  const h = harness();
  h.sys.claude.loggedIn = false;
  const original = h.deps.runner;
  h.deps.runner = (c, a, o) => (c === "claude" && a[0] === "auth" && a[1] === "login" ? (h.sys.calls.push({ command: c, args: a, inherit: true }), { status: 0, stdout: "", stderr: "" }) : original(c, a, o));
  const r = await h.run({ login: true });
  assert.equal(r.code, 0);
  assert.deepEqual(h.chain().chains.default.steps, [{ agent: "codex", mode: "p" }]);
  assert.match(h.out.join("\n"), /claude: 로그인을 확인하지 못해 체인에서 뺀다/);
});

test("S-13 체인 파일이 없으면 default = [claude/acp, codex/p]를 만들고 parseChainConfig를 통과한다", async () => {
  const h = harness();
  h.sys.adapter = true;
  assert.equal((await h.run()).code, 0);
  const config = parseChainConfig(h.chain());
  assert.deepEqual(config.chains.default!.steps.map((s) => `${s.agent}/${s.mode}`), ["claude/acp", "codex/p"]);
  assert.ok(!existsSync(`${h.file}.bak`));
});

test("S-14 기존 파일: --yes면 default만 바뀌고 다른 체인·limit_patterns·알 수 없는 키가 보존되며 .bak이 생긴다 / 대화형 no면 그대로 / 같으면 변경 없음", async () => {
  const existing = { chains: { default: { steps: [{ agent: "codex", mode: "acp" }], write_fallback: "observed" }, other: { steps: [{ agent: "claude", mode: "p", model: "m" }] } }, limit_patterns: ["한도"], custom: { keep: 1 } };
  const make = () => { const h = harness({ interactive: false }); mkdirSync(h.dir, { recursive: true }); writeFileSync(h.file, JSON.stringify(existing)); return h; };
  const yes = make();
  assert.equal((await yes.run({ yes: true })).code, 0);
  const next = yes.chain();
  assert.deepEqual(next.chains.default.steps, [{ agent: "claude", mode: "p" }, { agent: "codex", mode: "p" }]);
  assert.equal(next.chains.default.write_fallback, "observed", "default의 다른 키 보존");
  assert.deepEqual(next.chains.other, existing.chains.other);
  assert.deepEqual(next.limit_patterns, ["한도"]);
  assert.deepEqual(next.custom, { keep: 1 });
  assert.deepEqual(JSON.parse(readFileSync(`${yes.file}.bak`, "utf8")), existing);

  const interactiveNo = harness({ interactive: true, answers: [false] });
  mkdirSync(interactiveNo.dir, { recursive: true }); writeFileSync(interactiveNo.file, JSON.stringify(existing));
  const r = await interactiveNo.run();
  assert.equal(r.code, 4);
  assert.deepEqual(interactiveNo.chain(), existing);
  assert.ok(!existsSync(`${interactiveNo.file}.bak`));

  // 이미 같은 default(모드까지)면 쓰지 않는다 — model 같은 사용자 설정이 있어도 보존
  const same = harness();
  mkdirSync(same.dir, { recursive: true });
  const custom = { chains: { default: { steps: [{ agent: "claude", mode: "p", model: "opus" }, { agent: "codex", mode: "p", effort: "high" }] } } };
  writeFileSync(same.file, JSON.stringify(custom));
  const sr = await same.run({ yes: true });
  assert.equal(sr.code, 0);
  assert.equal(sr.code === 0 && sr.changed, false);
  assert.deepEqual(same.chain(), custom);
  assert.ok(!existsSync(`${same.file}.bak`));
});

test("S-15 깨진 JSON·chains 없는 객체는 건드리지 않고 이유와 함께 거절한다", async () => {
  for (const content of ["{ 깨진", JSON.stringify({ nothing: true })]) {
    const h = harness();
    mkdirSync(h.dir, { recursive: true }); writeFileSync(h.file, content);
    const r = await h.run({ yes: true });
    assert.equal(r.code, 3);
    assert.equal(readFileSync(h.file, "utf8"), content);
    assert.ok(!existsSync(`${h.file}.bak`));
    assert.ok(!h.sys.effects().length, "부작용 호출 없음");
  }
});

test("S-16 비대화형 확인: 풀리지 않으면 상태 조회만 하고 변경 0·종료 4, 플래그로 풀면 진행", async () => {
  const existing = { chains: { default: { steps: [{ agent: "codex", mode: "p" }] } } };
  const make = () => { const h = harness(); mkdirSync(h.dir, { recursive: true }); writeFileSync(h.file, JSON.stringify(existing)); h.sys.claude.loggedIn = false; return h; };
  const a = make();
  assert.equal((await a.run({ installAdapters: false })).code, 0, "codex만 남아 default와 같다 — 확인 필요 없음");
  const b = make();
  b.sys.codex.installed = false;
  const rb = await b.run();
  assert.equal(rb.code, 3, "로그인 안 된 claude만 있으면 넣을 에이전트가 없다");
  const c = make();
  c.sys.claude.loggedIn = true;
  const rc = await c.run({ login: true });
  assert.equal(rc.code, 4, "--login만으로는 덮어쓰기 확인이 풀리지 않는다");
  assert.equal(c.sys.effects().length, 0, "로그인·npm·파일 쓰기 호출 0");
  assert.deepEqual(JSON.parse(readFileSync(c.file, "utf8")), existing);
  assert.ok(!existsSync(`${c.file}.bak`));
  assert.match(c.out.join("\n"), /--yes/);
});

test("S-16 로그인이 필요한 변경에서 플래그가 풀리지 않으면 로그인·설치 호출 0", async () => {
  const existing = { chains: { default: { steps: [{ agent: "codex", mode: "p" }] } } };
  const h = harness();
  mkdirSync(h.dir, { recursive: true }); writeFileSync(h.file, JSON.stringify(existing));
  h.sys.claude.loggedIn = false;
  const r = await h.run({ login: true, installAdapters: true });
  assert.equal(r.code, 4);
  assert.deepEqual(h.sys.effects(), [], "덮어쓰기 확인이 안 풀리면 로그인도 npm도 하지 않는다");
});

test("S-16 --agents: 순서대로 체인, 로그인 허락 없는 미로그인은 제외, 모르는 이름은 사용 오류", async () => {
  const order = harness();
  assert.equal((await order.run({ agents: ["codex", "claude"], yes: true })).code, 0);
  assert.deepEqual(order.chain().chains.default.steps.map((s: { agent: string }) => s.agent), ["codex", "claude"]);
  const nologin = harness();
  nologin.sys.claude.loggedIn = false;
  assert.equal((await nologin.run({ agents: ["codex", "claude"], yes: true })).code, 0);
  assert.deepEqual(nologin.chain().chains.default.steps, [{ agent: "codex", mode: "p" }]);
  assert.match(nologin.out.join("\n"), /claude: 로그인하지 않아 체인에서 뺀다/);
  assert.ok(!nologin.sys.calls.some((c) => c.command === "claude" && c.args[1] === "login"));
  await assert.rejects(() => harness().run({ agents: ["gemini"] }), SetupUsageError);
  await assert.rejects(() => harness().run({ agents: ["claude", "claude"] }), SetupUsageError);
});

test("S-17 프로필이 없으면 변경 0, pace onboard를 안내하고 종료 2", async () => {
  const h = harness({ chainFile: null });
  const r = await h.run({ yes: true });
  assert.equal(r.code, 2);
  assert.match(h.out.join("\n"), /pace onboard/);
  assert.equal(h.sys.calls.length, 0);
});

test("대화형: 에이전트 선택 질문의 기본값은 설치된 에이전트이고, 잘못된 입력은 거절한다", async () => {
  const h = harness({ interactive: true, line: "codex" });
  assert.equal((await h.run()).code, 0);
  assert.deepEqual(h.chain().chains.default.steps, [{ agent: "codex", mode: "p" }]);
  const bad = harness({ interactive: true, line: "claude,foo" });
  assert.equal((await bad.run()).code, 2);
  assert.ok(!existsSync(bad.file));
});

test("S-23b 자격증명 파일은 읽거나 복사하지 않는다 — 생성물은 체인 파일뿐이고 표지 문자열이 어디에도 없다", async () => {
  const h = harness();
  const home = tempDir("pace-home-");
  mkdirSync(join(home, ".claude"), { recursive: true }); mkdirSync(join(home, ".codex"), { recursive: true });
  writeFileSync(join(home, ".claude", ".credentials.json"), '{"token":"SENTINEL-CLAUDE-SECRET"}');
  writeFileSync(join(home, ".codex", "auth.json"), '{"token":"SENTINEL-CODEX-SECRET"}');
  h.sys.claude.loggedIn = false;
  assert.equal((await h.run({ login: true, yes: true })).code, 0);
  assert.deepEqual(readdirSync(h.dir).sort(), ["agent-chains.json"]);
  const all = h.out.join("\n") + readFileSync(h.file, "utf8") + JSON.stringify(h.sys.calls);
  assert.ok(!all.includes("SENTINEL"));
});

const chainOf = (...steps: [string, string][]) => ({ chains: { default: { steps: steps.map(([agent, mode]) => ({ agent, mode })) } } });
function withFile(h: ReturnType<typeof harness>, content: unknown) { mkdirSync(h.dir, { recursive: true }); writeFileSync(h.file, JSON.stringify(content)); }

test("승인은 부작용 전에: 어댑터 설치가 실패하면 달라질 수 있는 기존 default는 --yes 없이 설치도 하지 않는다", async () => {
  const h = harness();
  h.sys.codex.installed = false; // claude만
  withFile(h, chainOf(["claude", "acp"]));
  const r = await h.run({ installAdapters: true });
  assert.equal(r.code, 4);
  assert.equal(h.sys.calls.filter((c) => c.command === "fake-npm" && c.args.includes("install")).length, 0);
  assert.deepEqual(JSON.parse(readFileSync(h.file, "utf8")), chainOf(["claude", "acp"]));
});

test("승인은 본 체인 한 가지에 묶인다: 설치 실패로 결과가 달라지면 다시 묻고, 거절하면 파일을 바꾸지 않는다", async () => {
  const h = harness({ interactive: true, answers: [true /*어댑터 설치*/, true /*승인: claude/acp*/, false /*달라진 결과 거절*/], line: "claude" });
  h.sys.npmFails = true;
  withFile(h, chainOf(["claude", "acp"]));
  const r = await h.run();
  assert.equal(r.code, 4);
  assert.match(h.questions.at(-1)!, /승인한 것/);
  assert.deepEqual(JSON.parse(readFileSync(h.file, "utf8")), chainOf(["claude", "acp"]));
  assert.ok(!existsSync(`${h.file}.bak`));
  // --yes는 결과와 무관한 승인
  const y = harness();
  y.sys.npmFails = true;
  withFile(y, chainOf(["claude", "acp"]));
  assert.equal((await y.run({ agents: ["claude"], installAdapters: true, yes: true })).code, 0);
  assert.deepEqual(y.chain().chains.default.steps, [{ agent: "claude", mode: "p" }]);
});

test("체인 파일이 질문·설치 중 바뀌었거나 새로 생기면 덮어쓰지 않고 종료 3", async () => {
  for (const initial of [null, chainOf(["codex", "p"])]) {
    const h = harness();
    h.sys.codex.installed = false;
    if (initial) withFile(h, initial);
    const original = h.deps.runner;
    const concurrent = { chains: { default: { steps: [{ agent: "codex", mode: "p" }] }, theirs: { steps: [{ agent: "codex", mode: "p" }] } }, mine: true };
    h.deps.runner = (c, a, o) => { const r = original(c, a, o); if (c === "fake-npm" && a.includes("install")) { mkdirSync(h.dir, { recursive: true }); writeFileSync(h.file, JSON.stringify(concurrent)); } return r; };
    const r = await h.run({ installAdapters: true, yes: true });
    assert.equal(r.code, 3);
    assert.deepEqual(JSON.parse(readFileSync(h.file, "utf8")), concurrent, "다른 프로세스가 쓴 내용이 그대로");
    assert.match(h.out.join("\n"), /파일이 바뀌었다/);
  }
});

test("설치된 어댑터 버전이 읽기 전용 강제를 확인한 버전이 아니면 ACP로 고르지 않고, 설치를 허락하면 고정 버전으로 바꾼다", async () => {
  const old = harness();
  old.sys.codex.installed = false; old.sys.adapter = true; old.sys.adapterVersion = "0.90.0";
  assert.equal((await old.run()).code, 0);
  assert.deepEqual(old.chain().chains.default.steps, [{ agent: "claude", mode: "p" }]);
  assert.match(old.out.join("\n"), /0\.90\.0은 읽기 전용 강제를 확인하지 못한 버전/);
  const fix = harness();
  fix.sys.codex.installed = false; fix.sys.adapter = true; fix.sys.adapterVersion = "0.90.0";
  assert.equal((await fix.run({ installAdapters: true })).code, 0);
  assert.deepEqual(fix.chain().chains.default.steps, [{ agent: "claude", mode: "acp" }]);
  // npm을 못 찾으면 버전을 알 수 없어 -p
  const noNpm = harness();
  noNpm.sys.codex.installed = false; noNpm.sys.adapter = true; noNpm.sys.hasNpm = false;
  noNpm.deps.npm = null;
  assert.equal((await noNpm.run()).code, 0);
  assert.deepEqual(noNpm.chain().chains.default.steps, [{ agent: "claude", mode: "p" }]);
});

test("UTF-8 BOM이 있는 기존 체인 파일은 원인을 알려 주며 거절하고, 두 번째 덮어쓰기는 첫 백업을 지우지 않는다", async () => {
  const bom = harness();
  mkdirSync(bom.dir, { recursive: true });
  writeFileSync(bom.file, "\uFEFF" + JSON.stringify(chainOf(["codex", "p"])));
  assert.equal((await bom.run({ yes: true })).code, 3);
  assert.match(bom.out.join("\n"), /BOM/);

  const h = harness();
  withFile(h, chainOf(["codex", "acp"]));
  assert.equal((await h.run({ yes: true })).code, 0);
  const firstBackup = readFileSync(`${h.file}.bak`, "utf8");
  writeFileSync(h.file, JSON.stringify(chainOf(["claude", "p"])));
  assert.equal((await h.run({ yes: true })).code, 0);
  assert.equal(readFileSync(`${h.file}.bak`, "utf8"), firstBackup, "최초 백업 보존");
  assert.ok(readdirSync(h.dir).some((f) => f.startsWith("agent-chains.json.bak.")), "두 번째 백업은 따로");
  // default가 없는 기존 파일에는 추가했다고 말한다
  const noDefault = harness();
  withFile(noDefault, { chains: { other: { steps: [{ agent: "codex", mode: "p" }] } } });
  assert.equal((await noDefault.run()).code, 0);
  assert.match(noDefault.out.join("\n"), /체인을 추가했다/);
  assert.ok(noDefault.chain().chains.other);
});
