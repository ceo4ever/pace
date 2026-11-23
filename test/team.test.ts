import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, linkSync, lstatSync, mkdirSync, readFileSync, readdirSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runPace, sessionFreeEnv, tempDir } from "./helpers.ts";
import { parseTeamSource, teamDescription } from "../src/team/model.ts";
import { loadTeamMember } from "../src/team/store.ts";
import { readWorkerTiers, resolveTeamSettings, setWorkerTier, WORKER_TIERS } from "../src/core/worker-tiers.ts";
import { resolveWorkerSettings, setWorkerSettings } from "../src/core/worker-settings.ts";

function fixture() {
  const root = tempDir("pace-team-");
  const home = tempDir("pace-team-home-");
  const config = join(home, "empty-git-config"); writeFileSync(config, "");
  const env = { ...sessionFreeEnv(), HOME: home, USERPROFILE: home, GIT_CONFIG_GLOBAL: config, GIT_CONFIG_SYSTEM: config };
  assert.equal(spawnSync("git", ["init", "-q", "-b", "main", root], { env }).status, 0);
  const run = (...args: string[]) => runPace(args, { cwd: root, home, env });
  return { root, home, run };
}

test("team CLI: 첫 커밋 없는 저장소에서 세 역할을 만들고 두 형식의 변경을 검출한다", () => {
  const { root, run } = fixture();
  for (const [name, role] of [["lead", "lead"], ["builder", "maker"], ["quality", "reviewer"]]) {
    const result = run("team", "new", name!, "--role", role!);
    assert.equal(result.status, 0, result.stderr);
  }
  const list = run("team", "list");
  assert.equal(list.status, 0, list.stderr);
  assert.match(list.stdout, /quality.*reviewer/);
  assert.notEqual(run("team", "sync", "--check").status, 0);
  assert.equal(existsSync(join(root, ".claude")), false, "check는 mkdir하지 않는다");
  assert.equal(run("team", "sync").status, 0);
  assert.equal(run("team", "sync", "--check").status, 0);
  for (const name of ["lead", "builder", "quality"]) {
    assert.equal(existsSync(join(root, ".claude", "agents", `${name}.md`)), true);
    assert.equal(existsSync(join(root, ".codex", "agents", `${name}.toml`)), true);
  }
  const source = join(root, ".pace", "team", "builder.md");
  writeFileSync(source, readFileSync(source, "utf8") + "\n추가 업무 조건\n");
  assert.notEqual(run("team", "sync", "--check").status, 0);
  assert.equal(run("team", "sync").status, 0);
  const output = join(root, ".codex", "agents", "builder.toml");
  writeFileSync(output, readFileSync(output, "utf8") + "\n# 손수정\n");
  assert.notEqual(run("team", "sync", "--check").status, 0);
  assert.equal(run("team", "sync").status, 0);
  assert.equal(run("team", "sync", "--check").status, 0);
});

test("worker tier CLI: 별도 파일에 등급을 저장하고 일반 worker 설정은 보존한다", () => {
  const { home, run } = fixture();
  assert.equal(run("worker", "set", "codex", "model", "base-model").status, 0);
  const path = join(home, "worker-settings.json");
  const original = readFileSync(path, "utf8");
  assert.equal(run("worker", "set", "codex", "tier.high.model", "team-model").status, 0);
  assert.equal(run("worker", "set", "codex", "tier.high.effort", "low").status, 0);
  assert.equal(readFileSync(path, "utf8"), original);
  const shown = run("worker", "show");
  assert.equal(shown.status, 0, shown.stderr);
  const data = JSON.parse(shown.stdout);
  assert.equal(data.effective.codex.model, "base-model");
  assert.deepEqual(data.teamTiers.codex.high, { model: "team-model", effort: "low" });
  assert.equal(run("worker", "reset", "codex", "tier.high.model").status, 0);
  assert.equal(run("worker", "reset", "codex", "tier.high.effort").status, 0);
  assert.deepEqual(JSON.parse(readFileSync(join(home, "worker-tiers.json"), "utf8")), {});
  assert.equal(readFileSync(path, "utf8"), original);
});

test("team check JSON: 원본·설정·내용을 구별하고 복합 차이를 숨기지 않는다", () => {
  const { root, run } = fixture();
  assert.equal(run("team", "new", "sample", "--role", "maker").status, 0);
  const missing = run("team", "sync", "--check", "--json");
  assert.equal(missing.status, 1);
  assert.deepEqual(JSON.parse(missing.stdout).differences.map((d: { kind: string }) => d.kind), ["missing", "missing"]);
  assert.equal(existsSync(join(root, ".claude")), false);
  assert.equal(run("team", "sync").status, 0);
  const files = [join(root, ".claude/agents/sample.md"), join(root, ".codex/agents/sample.toml")];
  const before = files.map((path) => readFileSync(path, "utf8"));
  assert.equal(run("worker", "set", "codex", "tier.low.model", "unused").status, 0);
  assert.equal(run("team", "sync", "--check").status, 0, "사용하지 않는 등급은 생성 입력이 아니다");
  assert.equal(run("worker", "set", "codex", "tier.medium.model", "changed").status, 0);
  let checked = run("team", "sync", "--check", "--json");
  assert.equal(checked.status, 1);
  assert.deepEqual(JSON.parse(checked.stdout).differences, [{ path: ".codex/agents/sample.toml", kind: "settings" }]);
  assert.deepEqual(files.map((path) => readFileSync(path, "utf8")), before, "check는 파일을 갱신하지 않는다");
  writeFileSync(files[1]!, before[1] + "# 수정\n");
  checked = run("team", "sync", "--check", "--json");
  assert.deepEqual(JSON.parse(checked.stdout).differences.map((d: { kind: string }) => d.kind), ["settings", "content"]);
  assert.equal(run("team", "sync").status, 0);
  assert.equal(run("team", "sync", "--check").status, 0);
  const source = join(root, ".pace/team/sample.md");
  writeFileSync(source, readFileSync(source, "utf8") + "\n추가 조건\n");
  checked = run("team", "sync", "--check", "--json");
  assert.equal(JSON.parse(checked.stdout).differences.filter((d: { kind: string }) => d.kind === "source").length, 2);
  assert.equal(run("team", "sync").status, 0);
  const output = readFileSync(files[0]!, "utf8");
  writeFileSync(files[0]!, output.replace(/(# pace-team-mapping-sha256: )[a-f0-9]+/, "$1invalid"));
  checked = run("team", "sync", "--check", "--json");
  assert.deepEqual(JSON.parse(checked.stdout).differences, [{ path: ".claude/agents/sample.md", kind: "content" }]);
});

test("team: CRLF 원본/생성물과 다른 위치에서도 입력이 같으면 일치한다", () => {
  const { root, run } = fixture();
  assert.equal(run("team", "new", "copy", "--role", "reviewer").status, 0);
  const source = join(root, ".pace/team/copy.md");
  const extra = "\n: 공백 # 주석이 아닌 본문\n- 선행\n'작은따옴표' \"큰따옴표\" \"\"\" ''' \\역슬래시\n다음 줄\n";
  writeFileSync(source, (readFileSync(source, "utf8") + extra).replaceAll("\n", "\r\n"));
  assert.equal(run("team", "sync").status, 0);
  const output = join(root, ".codex/agents/copy.toml");
  const text = readFileSync(output, "utf8");
  const instructionLine = text.split("\n").find((line) => line.startsWith("developer_instructions = "))!;
  const instructions = JSON.parse(instructionLine.slice("developer_instructions = ".length));
  assert.equal(instructions.includes(extra), true);
  writeFileSync(output, text.replaceAll("\n", "\r\n"));
  assert.equal(run("team", "sync", "--check").status, 0);
  const copy = fixture();
  for (const dir of [".pace", ".claude", ".codex"]) cpSync(join(root, dir), join(copy.root, dir), { recursive: true });
  assert.equal(copy.run("team", "sync", "--check").status, 0);
  assert.equal(text.includes(root), false);
  const sub = join(copy.root, "sub"); mkdirSync(sub);
  assert.equal(runPace(["team", "list"], { cwd: sub, home: copy.home }).status, 0);
});

test("team schema: 필수/중복/타입/이름/절을 검증하고 설명은 첫 문단 500 코드포인트다", () => {
  const { root, run } = fixture();
  assert.equal(run("team", "new", "schema", "--role", "lead").status, 0);
  const source = readFileSync(join(root, ".pace/team/schema.md"), "utf8");
  const member = parseTeamSource(source, "schema");
  assert.deepEqual([member.role, member.stage, member.tier, member.resources, member.tools], ["lead", [], "high", [], []]);
  assert.match(member.body, /결정 요청에는 요청 내용·결정 주체·근거·선택지/);
  for (const invalid of [
    source.replace("role: lead", "role: nope"), source.replace("tier: high", "tier: standard"),
    source.replace("name: schema", "name: other"), source.replace("role: lead", "role: lead\nrole: maker"),
    source.replace("stage: []", "stage: build"), source.replace("stage: []", "stage: [build, build]"),
    source.replace("stage: []", "stage: [\"bad,comma\"]"), source.replace("stage: []", "stage: []\nunknown: x"),
    source.replace("stage: []", "stage: [[nested]]"), source.replace("stage: []", "stage: [true]"),
    source.replace("tools: []", "tools:\n  - \"unclosed"), source.replace("tools: []", "tools:\n  - [nested]"),
    source.replace("tools: []\n", ""), source.replace("role: lead", "role: lead\ninvalid line"),
    source.replace("## 인계·결정 요청·완료 보고", "## 보고"), source.replace("## 도구 안내", "## 안내"),
    source + "\n## 맡는 일\n중복\n", source + "\u0000", source + "\rbare", source + "\ud800", source + "x".repeat(65536),
  ]) assert.throws(() => parseTeamSource(invalid, "schema"));
  assert.throws(() => parseTeamSource(source, "../schema"));
  const description = teamDescription({ ...member, stage: ["설계"], body: "## 맡는 일\n\n" + "😀".repeat(600) + "\n\n둘째 문단" });
  assert.equal(Array.from(description).length, 500);
  assert.equal(description, "lead · 설계 · " + "😀".repeat(488));
  assert.equal(description.includes("둘째"), false);
  const previous = readFileSync(join(root, ".pace/team/schema.md"), "utf8");
  assert.equal(run("team", "new", "schema", "--role", "maker").status, 2);
  assert.equal(readFileSync(join(root, ".pace/team/schema.md"), "utf8"), previous);
  for (const name of ["../out", "Con", "con", "has_space", "-option", "x".repeat(65)]) assert.equal(run("team", "new", name, "--role", "maker").status, 2);
});

test("team 경로: 뒤 foreign 출력 충돌·관리 고아·무관 파일을 보존한다", () => {
  const { root, run } = fixture();
  for (const name of ["first", "last"]) assert.equal(run("team", "new", name, "--role", "maker").status, 0);
  mkdirSync(join(root, ".codex/agents"), { recursive: true });
  const foreign = join(root, ".codex/agents/last.toml"); writeFileSync(foreign, "user file\n");
  assert.equal(run("team", "sync").status, 2);
  assert.equal(existsSync(join(root, ".claude/agents/first.md")), false);
  assert.equal(readFileSync(foreign, "utf8"), "user file\n");
  unlinkSync(foreign);
  writeFileSync(join(root, ".codex/agents/unrelated.toml"), "keep me\n");
  assert.equal(run("team", "sync").status, 0);
  assert.equal(readFileSync(join(root, ".codex/agents/unrelated.toml"), "utf8"), "keep me\n");
  const original = readFileSync(join(root, ".claude/agents/last.md"), "utf8");
  unlinkSync(join(root, ".pace/team/last.md"));
  const checked = run("team", "sync", "--check", "--json");
  assert.equal(checked.status, 1);
  assert.equal(JSON.parse(checked.stdout).differences.filter((d: { kind: string }) => d.kind === "orphan").length, 2);
  assert.equal(run("team", "sync").status, 2);
  assert.equal(readFileSync(join(root, ".claude/agents/last.md"), "utf8"), original);
});

test("team 경로: 원본·출력·조상 링크와 하드링크는 따라가지 않는다", () => {
  for (const target of [".pace", ".pace/team", ".claude", ".claude/agents", ".codex/agents"]) {
    const { root, run } = fixture(), external = tempDir("pace-team-outside-");
    writeFileSync(join(external, "sentinel"), "outside unchanged");
    if (!target.startsWith(".pace")) assert.equal(run("team", "new", "sample", "--role", "maker").status, 0);
    const path = join(root, target); mkdirSync(join(path, ".."), { recursive: true });
    symlinkSync(external, path, "dir");
    const result = target.startsWith(".pace") ? run("team", "new", "sample", "--role", "maker") : run("team", "sync");
    assert.equal(result.status, 2, target);
    assert.deepEqual(readdirSync(external), ["sentinel"]);
    assert.equal(readFileSync(join(external, "sentinel"), "utf8"), "outside unchanged");
    assert.equal(lstatSync(path).isSymbolicLink(), true);
  }
  for (const hard of [false, true]) {
    const { root, run } = fixture();
    assert.equal(run("team", "new", "sample", "--role", "maker").status, 0);
    const source = join(root, ".pace/team/sample.md"), outside = join(tempDir(), "source.md");
    const original = readFileSync(source, "utf8");
    if (hard) linkSync(source, outside);
    else { writeFileSync(outside, original); unlinkSync(source); symlinkSync(outside, source); }
    assert.equal(run("team", "list").status, 2);
    assert.equal(run("team", "sync").status, 2);
    assert.equal(readFileSync(outside, "utf8"), original);
    assert.equal(existsSync(join(root, ".claude")), false);
  }
});

test("team JSON: 잘못된 원본과 인자/저장소 오류는2·단일 JSON이다", () => {
  const { root, run } = fixture();
  assert.equal(run("team", "new", "sample", "--role", "maker").status, 0);
  writeFileSync(join(root, ".pace/team/sample.md"), "invalid");
  for (const args of [["team", "sync", "--check", "--json"], ["team", "list", "--json"], ["team", "sync", "--bad", "--json"]]) {
    const result = run(...args);
    assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stdout).ok, false);
    assert.equal(typeof JSON.parse(result.stdout).error, "string");
  }
  const outside = runPace(["team", "sync", "--check", "--json"], { cwd: tempDir(), home: tempDir() });
  assert.equal(outside.status, 2);
  assert.equal(JSON.parse(outside.stdout).ok, false);
  assert.throws(() => loadTeamMember(root, "missing"), /없다/);
});

test("team 출력: 파일 링크·하드링크·본문 안 표지는 관리 소유권이 아니다", () => {
  for (const host of ["claude", "codex"]) for (const hard of [false, true]) {
    const { root, run } = fixture();
    assert.equal(run("team", "new", "sample", "--role", "reviewer").status, 0);
    const dir = join(root, `.${host}/agents`); mkdirSync(dir, { recursive: true });
    const outside = join(tempDir(), "sentinel"); writeFileSync(outside, "outside unchanged");
    const output = join(dir, `sample.${host === "claude" ? "md" : "toml"}`);
    if (hard) linkSync(outside, output); else symlinkSync(outside, output);
    for (const args of [["team", "sync"], ["team", "sync", "--check", "--json"]]) {
      const result = run(...args); assert.equal(result.status, 2);
      if (args.includes("--json")) assert.equal(JSON.parse(result.stdout).ok, false);
    }
    assert.equal(readFileSync(outside, "utf8"), "outside unchanged");
    assert.equal(existsSync(join(root, ".claude/agents/sample.md")) && host === "codex", false, "뒤 대상 거부 전 앞 대상도 쓰지 않는다");
  }
  const { root, run } = fixture();
  assert.equal(run("team", "new", "sample", "--role", "maker").status, 0);
  mkdirSync(join(root, ".claude/agents"), { recursive: true });
  const path = join(root, ".claude/agents/sample.md");
  const foreign = '---\nname: "user"\n---\n# pace-team-generated: .pace/team/sample.md\n';
  writeFileSync(path, foreign);
  const denied = run("team", "sync", "--check", "--json");
  assert.equal(denied.status, 2);
  assert.equal(JSON.parse(denied.stdout).differences, undefined);
  assert.equal(readFileSync(path, "utf8"), foreign);
});

test("worker tiers: 두 호스트×세 등급·잘못된 값·손상·링크를 검증한다", () => {
  const home = tempDir(), env = { PACE_HOME: home };
  for (const agent of ["claude", "codex"]) {
    setWorkerSettings(agent, "model", `${agent}-base`, env);
    setWorkerSettings(agent, "effort", "high", env);
    for (const tier of WORKER_TIERS) assert.deepEqual(resolveTeamSettings(agent, tier, env), { model: `${agent}-base`, effort: tier });
    setWorkerTier(agent, "tier.high.model", `${agent}-override`, env);
    setWorkerTier(agent, "tier.high.effort", "low", env);
    assert.deepEqual(resolveTeamSettings(agent, "high", env), { model: `${agent}-override`, effort: "low" });
    assert.deepEqual(resolveWorkerSettings(agent, undefined, undefined, env), { model: `${agent}-base`, effort: "high" });
  }
  for (const [field, value] of [["tier.standard.model", "x"], ["tier.high.other", "x"], ["tier.low.model", ""], ["tier.low.effort", "default"], ["tier.low.effort", "low\n"], ["tier.low.model", "\ud800"], ["tier.low.model", "x".repeat(1025)]]) assert.throws(() => setWorkerTier("codex", field!, value, env));
  const path = join(home, "worker-tiers.json");
  for (const text of ["{bad", "[]", '{"codex":{"standard":{}}}', '{"codex":{"high":{"extra":"x"}}}', '{"codex":{"high":{"model":3}}}', '{"codex":{"high":{"model":"\\ud800"}}}', " ".repeat(65537)]) {
    writeFileSync(path, text);
    assert.throws(() => readWorkerTiers(env));
    assert.throws(() => setWorkerTier("codex", "tier.low.model", "new", env));
    assert.equal(readFileSync(path, "utf8"), text);
  }
  unlinkSync(path);
  const outside = join(tempDir(), "tiers.json"); writeFileSync(outside, "{}");
  symlinkSync(outside, path);
  assert.throws(() => readWorkerTiers(env));
  assert.throws(() => setWorkerTier("codex", "tier.low.model", "new", env));
  assert.equal(readFileSync(outside, "utf8"), "{}");
});

test("worker tiers: constructor 이름은 상속 객체 대신 자기 설정에 저장한다", () => {
  const { home, run } = fixture();
  assert.equal(run("worker", "set", "constructor", "tier.high.model", "fixture-model").status, 0);
  const data = JSON.parse(readFileSync(join(home, "worker-tiers.json"), "utf8"));
  assert.equal(Object.hasOwn(data, "constructor"), true);
  assert.deepEqual(data.constructor, { high: { model: "fixture-model" } });
  assert.deepEqual(resolveTeamSettings("constructor", "high", { PACE_HOME: home }), { model: "fixture-model", effort: "high" });
  assert.equal(Object.hasOwn(Object, "high"), false);
});

test("worker show: 등급 파일 손상 시에도 기존 설정·유효값을 JSON으로 보존한다", () => {
  const { home, run } = fixture();
  assert.equal(run("worker", "set", "codex", "model", "original").status, 0);
  const base = readFileSync(join(home, "worker-settings.json"), "utf8");
  writeFileSync(join(home, "worker-tiers.json"), "invalid");
  const result = run("worker", "show");
  assert.equal(result.status, 2);
  const data = JSON.parse(result.stdout);
  assert.deepEqual(data.settings, { codex: { model: "original" } });
  assert.equal(data.effective.codex.model, "original");
  assert.equal(data.teamTiers, null);
  assert.equal(typeof data.teamTiersError, "string");
  assert.equal(readFileSync(join(home, "worker-settings.json"), "utf8"), base);
});

test("team 실행 전 대조: 네 역할·두 생성물에 고정 책임을 보존하고 약화·예시·누락은 오류2다", () => {
  const { root, run } = fixture();
  const rule = "위임을 받으면 실행 전에 지시가 근거(캡틴 원문·확인된 해석 또는 계약)와 같은 범위인지 대조한다. 범위가 달라졌거나 근거가 불명확하면 실행을 보류하고 결정 요청 형식(결정 주체·근거·선택지)으로 올린다. 미확인 해석을 승인된 것으로 바꾸지 않는다.";
  for (const role of ["lead", "maker", "reviewer", "coordinator"]) {
    assert.equal(run("team", "new", role, "--role", role).status, 0);
    const text = readFileSync(join(root, `.pace/team/${role}.md`), "utf8");
    assert.equal(text.includes(rule), true, role);
    assert.match(text, /실행 전 대조에서 보류한 요청도 이 결정 요청 형식으로 올린다/);
  }
  assert.equal(run("team", "sync").status, 0);
  for (const role of ["lead", "maker", "reviewer", "coordinator"]) {
    const claude = readFileSync(join(root, `.claude/agents/${role}.md`), "utf8");
    const toml = readFileSync(join(root, `.codex/agents/${role}.toml`), "utf8");
    const instructions = JSON.parse(toml.split("\n").find((line) => line.startsWith("developer_instructions = "))!.slice("developer_instructions = ".length));
    assert.equal(claude.includes(rule), true);
    assert.equal(instructions.includes(rule), true);
  }
  const path = join(root, ".pace/team/maker.md"), source = readFileSync(path, "utf8");
  const generated = readFileSync(join(root, ".codex/agents/maker.toml"), "utf8");
  const weakened = ["해당 없음", `    ${rule}`, `\t${rule}`, `<!--\n${rule}\n-->`, `\`\`\`text\n\n${rule}\n\n\`\`\``, `> ${rule}`, `"${rule}"`,
    ...["캡틴 원문", "확인된 해석", "계약", "범위가 달라졌거나", "근거가 불명확하면", "실행을 보류하고", "결정 요청 형식(결정 주체·근거·선택지)", "미확인 해석을 승인된 것으로 바꾸지 않는다."].map((part) => rule.replace(part, ""))];
  for (const replacement of weakened) {
    writeFileSync(path, source.replace(rule, replacement));
    const result = run("team", "sync", "--check", "--json");
    assert.equal(result.status, 2, replacement);
    const error = JSON.parse(result.stdout).error;
    assert.match(error, /계약 v1/);
    assert.equal(error.includes(rule), true, "기존 맞춤 내용 보존·갱신을 위한 기대 문장을 안내한다");
    assert.equal(readFileSync(join(root, ".codex/agents/maker.toml"), "utf8"), generated);
  }
  writeFileSync(path, source + "\n## 실행 전 대조\n다른 책임\n");
  assert.equal(run("team", "sync", "--check").status, 2);
  writeFileSync(path, source.replace("## 실행 전 대조", "## 다른 절"));
  assert.equal(run("team", "list").status, 2);
  writeFileSync(path, source.replace(rule, rule.replace("대조한다. ", "대조한다.\n\n")));
  assert.equal(run("team", "sync").status, 0, "공백·줄바꿈 정규화는 허용한다");
  writeFileSync(path, source.replace(rule, rule.replace("대조한다. ", "대조한다.\n    ")));
  assert.equal(run("team", "sync").status, 0, "일반 문단의 이어지는 줄 들여쓰기는 허용한다");
});
