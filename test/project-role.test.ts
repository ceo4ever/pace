import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, linkSync, mkdirSync, readFileSync, readdirSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { runPace, sessionFreeEnv, tempDir } from "./helpers.ts";
function fixture() {
  const parent = tempDir("pace-project-role-"), root = join(parent, "app"), home = tempDir("pace-project-role-home-");
  mkdirSync(root); mkdirSync(join(root, "docs"));
  const config = join(home, "git-config"); writeFileSync(config, "");
  const env = { ...sessionFreeEnv(), HOME: home, USERPROFILE: home, GIT_CONFIG_GLOBAL: config, GIT_CONFIG_SYSTEM: config };
  const git = (...args: string[]) => { const r = spawnSync("git", ["-C", root, ...args], { env, encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  git("init", "-q", "-b", "main"); git("config", "user.name", "test"); git("config", "user.email", "test@example.com");
  writeFileSync(join(root, "AGENTS.md"), "# fixture\n");
  writeFileSync(join(root, "docs/README.md"), "# fixture\n\n## 환경\n\n- 검사: `true`\n- 보안 검사: `true`\n");
  const run = (...args: string[]) => runPace(args, { cwd: root, home, env, timeout: 30000 });
  assert.equal(run("team", "new", "builder", "--role", "maker").status, 0);
  git("add", "-A"); git("commit", "-qm", "fixture");
  const created = run("project", "new", "role-test"); assert.equal(created.status, 0, created.stderr);
  const worktree = join(parent, "app.wt/P001");
  return { root, home, env, git, run, worktree };
}
test("project role RED: explicit member is accepted and no-launch carries the role", () => {
  const { run, worktree } = fixture();
  const r = run("project", "start", "P001", "--role", "builder", "--agent", "codex", "--no-launch");
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /builder/);
  assert.equal(existsSync(worktree), true);
  const dir = join(worktree, "projects", readdirSync(join(worktree, "projects")).find((s) => s.startsWith("P001_"))!);
  assert.match(readFileSync(join(dir, "PROJECT.md"), "utf8"), /^- 팀 측정: v1$/m);
  assert.equal(readFileSync(join(dir, "log.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line)).find((e) => e.type === "start").data.teamMetricsVersion, 1);
});
test("project role RED: missing member is rejected before worktree creation", () => {
  const { run, worktree } = fixture();
  const r = run("project", "start", "P001", "--role", "missing", "--no-launch");
  assert.notEqual(r.status, 0); assert.match(r.stderr, /팀 역할이 없다/); assert.equal(existsSync(worktree), false);
});

test("project role: no-role workerSpec is the pre-change golden", async () => {
  const { workerSpec } = await import("../src/project/harness.ts");
  const ref = { id: "P123", dir: "P123_261124_role-test", name: "role-test", branch: "project/P123", worktree: "/fixture/app.wt/P123" };
  assert.equal(workerSpec(ref, ref.worktree), readFileSync(new URL("./fixtures/worker-spec-before-role.txt", import.meta.url), "utf8"));
});
function projectPath(root: string): string {
  return join(root, "projects", readdirSync(join(root, "projects")).find((name) => name.startsWith("P001_"))!, "PROJECT.md");
}
function fakeOrca(home: string, mode: "ok" | "unknown" | "fail" = "ok") {
  const log = join(home, "orca-calls.jsonl"), command = join(home, "fake-orca"), preload = join(home, "orca-preload.mjs");
  writeFileSync(preload, `import cp from 'node:child_process'; import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module'; const real=cp.spawnSync; cp.spawnSync=(file,args,options)=>{if(file!==${JSON.stringify(command)})return real(file,args,options);fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(args)+'\\n');const bad=args[1]==='worker-start'&&${JSON.stringify(mode)}!=='ok';return {status:bad&&${JSON.stringify(mode)}==='fail'?1:0,signal:null,pid:0,stdout:JSON.stringify(bad?{ok:false,error:{code:${JSON.stringify(mode === "unknown" ? "outcome_unknown" : "setup_failed")}}}:{ok:true,result:args[1]==='run-current'?{runId:'fake-run'}:{dispatchId:'fake-dispatch'}}),stderr:''};};syncBuiltinESMExports();`);
  return { env: { ORCA_STRUCTURED_SESSION: "1", ORCA_CLI_COMMAND: command, NODE_OPTIONS: `--import=${pathToFileURL(preload).href}` }, calls: () => existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line) as string[]) : [] };
}
function starts(worktree: string) {
  return readFileSync(join(projectPath(worktree), "../log.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line)).filter((event) => event.type === "start");
}
for (const host of ["claude", "codex"]) test(`project role ${host}: argv overrides, default effort, and start provenance`, () => {
  const f = fixture(), orca = fakeOrca(f.home);
  writeFileSync(join(f.home, "worker-settings.json"), JSON.stringify({ [host]: { model: `worker-${host}`, effort: "general" } }));
  writeFileSync(join(f.home, "worker-tiers.json"), JSON.stringify({ [host]: { medium: { model: `tier-${host}`, effort: "high" } } }));
  const cases = [
    { flags: [], model: `tier-${host}`, effort: "high" },
    { flags: ["--model", "explicit-model"], model: "explicit-model", effort: "high" },
    { flags: ["--effort", "low"], model: `tier-${host}`, effort: "low" },
    { flags: ["--model", "explicit-model", "--effort", "medium"], model: "explicit-model", effort: "medium" },
    { flags: ["--effort", "default"], model: `tier-${host}`, effort: undefined },
  ];
  for (const [index, c] of cases.entries()) {
    const r = runPace(["project", "start", "P001", "--agent", host, "--role", "builder", ...(index ? ["--launch"] : []), ...c.flags], { cwd: f.root, home: f.home, env: { ...f.env, ...orca.env }, timeout: 30000 });
    assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /작업자를 띄웠다/);
    const args = orca.calls().filter((a) => a[1] === "worker-start").at(-1)!;
    const value = (flag: string) => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
    assert.equal(value("--model"), c.model); assert.equal(value("--effort"), c.effort);
    assert.equal(value("--agent"), host);
    assert.match(value("--spec")!, /^먼저 \.pace\/team\/builder\.md를 읽고/);
    assert.match(value("--spec")!, /적재하지 못하면.*보류/);
    const event = starts(f.worktree).at(-1)!;
    assert.equal(event.role.name, "builder"); assert.equal(event.role.source, "option");
    assert.equal(event.role.definition, ".pace/team/builder.md"); assert.match(event.role.hash, /^[a-f0-9]{64}$/);
    assert.equal(event.role.model, c.model); assert.equal(event.role.effort, c.effort);
    assert.equal(event.role.method, "prompt"); assert.equal(event.role.settingsStatus, "arguments");
    assert.equal(event.role.toolsPermissionApplied, false); assert.equal(event.role.runtimeObserved, false);
    assert.equal(JSON.stringify(event).includes(f.home), false);
  }
});
test("project role: PROJECT selection, explicit precedence, existing launch requirement, and worktree source", () => {
  const f = fixture();
  assert.equal(f.run("team", "new", "quality", "--role", "reviewer").status, 0);
  f.git("add", ".pace/team"); f.git("commit", "-qm", "quality");
  const path = projectPath(f.root); writeFileSync(path, readFileSync(path, "utf8").replace(/^- 작업자 역할:.*$/m, "- 작업자 역할: builder"));
  const r = f.run("project", "start", "P001", "--agent", "codex", "--no-launch"); assert.equal(r.status, 0, r.stderr);
  assert.equal(starts(f.worktree).at(-1)!.role.source, "project"); assert.equal(starts(f.worktree).at(-1)!.role.name, "builder");
  assert.equal(starts(f.worktree).at(-1)!.role.settingsStatus, "planned");
  const rejected = f.run("project", "start", "P001", "--role", "quality"); assert.notEqual(rejected.status, 0); assert.match(rejected.stderr, /--launch/);
  const override = f.run("project", "start", "P001", "--role", "quality", "--launch", "--agent", "codex", "--no-launch"); assert.equal(override.status, 0, override.stderr);
  assert.equal(starts(f.worktree).at(-1)!.role.name, "quality"); assert.equal(starts(f.worktree).at(-1)!.role.source, "option");
  const actual = projectPath(f.worktree); writeFileSync(actual, readFileSync(actual, "utf8").replace("- 작업자 역할: builder", "- 작업자 역할: quality"));
  const resumed = f.run("project", "start", "P001", "--launch", "--agent", "codex", "--no-launch"); assert.equal(resumed.status, 0, resumed.stderr);
  assert.equal(starts(f.worktree).at(-1)!.role.name, "quality"); assert.equal(starts(f.worktree).at(-1)!.role.source, "project");
});
test("project role: a team and native files do not imply a default role", () => {
  for (const host of ["claude", "codex", "cursor"]) {
    const f = fixture(), orca = fakeOrca(f.home);
    assert.equal(f.run("team", "sync").status, 0); f.git("add", ".claude", ".codex"); f.git("commit", "-qm", "native files");
    const r = runPace(["project", "start", "P001", "--agent", host], { cwd: f.root, home: f.home, env: { ...f.env, ...orca.env }, timeout: 30000 }); assert.equal(r.status, 0, r.stderr);
    const args = orca.calls().find((a) => a[1] === "worker-start")!;
    const spec = args[args.indexOf("--spec") + 1]!;
    const dir = projectPath(f.worktree).split(sep).at(-2)!;
    const expected = readFileSync(new URL("./fixtures/worker-spec-before-role.txt", import.meta.url), "utf8").replaceAll("P123_261124_role-test", dir).replaceAll("P123", "P001").replaceAll("/fixture/app.wt/P001", f.worktree);
    assert.equal(spec, expected); assert.equal(args[args.indexOf("--agent") + 1], host);
    assert.equal(args.includes("--effort"), false);
    assert.equal(args.includes("--model"), host !== "cursor");
    if (host !== "cursor") assert.equal(args[args.indexOf("--model") + 1], host === "codex" ? "gpt-6.2-sol" : "claude-opus-5-5");
    assert.equal(Object.hasOwn(starts(f.worktree).at(-1)!, "role"), false);
  }
});
test("project role: nonhost, unsafe name/settings and misplaced option fail before any worker", () => {
  for (const flags of [["--role", "../outside"], ["--role", "builder", "--agent", "cursor"], ["--role", "builder", "--model", "--danger"], ["--role", "builder", "--effort", "bad\nvalue"]]) {
    const f = fixture(), orca = fakeOrca(f.home);
    const r = runPace(["project", "start", "P001", "--agent", "codex", ...flags], { cwd: f.root, home: f.home, env: { ...f.env, ...orca.env } });
    assert.notEqual(r.status, 0, r.stdout); assert.equal(existsSync(f.worktree), false); assert.deepEqual(orca.calls(), []);
  }
  const f = fixture(); assert.notEqual(f.run("project", "check", "P001", "T01", "--role", "builder").status, 0);
});
test("project role: draft source is preserved and only committed role enters a new worktree", async () => {
  const f = fixture(), path = join(f.root, ".pace/team/builder.md"), original = readFileSync(path, "utf8");
  writeFileSync(path, original + "\nUNCOMMITTED-ROLE-MARKER\n");
  const r = f.run("project", "start", "P001", "--role", "builder", "--agent", "codex", "--no-launch"); assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(join(f.worktree, ".pace/team/builder.md"), "utf8"), original);
  assert.equal(readFileSync(path, "utf8").includes("UNCOMMITTED-ROLE-MARKER"), true);
  const { parseTeamSource } = await import("../src/team/model.ts");
  assert.equal(starts(f.worktree).at(-1)!.role.hash, parseTeamSource(original, "builder").hash);
  assert.equal(readFileSync(join(projectPath(f.worktree), "../log.jsonl"), "utf8").includes("UNCOMMITTED-ROLE-MARKER"), false);
});

test("project role: preparation edits hold launch and preserve the prepared worktree", () => {
  const f = fixture(), orca = fakeOrca(f.home);
  writeFileSync(join(f.root, "prepare.mjs"), "import {appendFileSync} from 'node:fs'; appendFileSync('.pace/team/builder.md','\\nPREPARED-CHANGE\\n');\n");
  const docs = join(f.root, "docs/README.md"); writeFileSync(docs, readFileSync(docs, "utf8") + "- worktree 준비: `node prepare.mjs`\n");
  f.git("add", "docs", "prepare.mjs"); f.git("commit", "-qm", "prepare");
  const r = runPace(["project", "start", "P001", "--role", "builder", "--agent", "codex"], { cwd: f.root, home: f.home, env: { ...f.env, ...orca.env }, timeout: 30000 });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /준비 뒤 달라졌다/); assert.deepEqual(orca.calls(), []);
  assert.equal(existsSync(f.worktree), true); assert.match(readFileSync(join(f.worktree, ".pace/team/builder.md"), "utf8"), /PREPARED-CHANGE/);
});
test("project role: restored branch reads its own committed PROJECT and source before creation", () => {
  const f = fixture();
  assert.equal(f.run("project", "start", "P001", "--role", "builder", "--agent", "codex", "--no-launch").status, 0);
  for (const args of [["add", "-A"], ["commit", "-qm", "checkpoint"]]) {
    const r = spawnSync("git", ["-C", f.worktree, ...args], { env: f.env, encoding: "utf8" }); assert.equal(r.status, 0, r.stderr);
  }
  const original = readFileSync(join(f.worktree, ".pace/team/builder.md"), "utf8");
  f.git("worktree", "remove", f.worktree);
  writeFileSync(join(f.root, ".pace/team/builder.md"), "INVALID MAIN DRAFT");
  const r = f.run("project", "start", "P001", "--role", "builder", "--agent", "codex", "--no-launch"); assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(join(f.worktree, ".pace/team/builder.md"), "utf8"), original);
  assert.equal(readFileSync(join(f.root, ".pace/team/builder.md"), "utf8"), "INVALID MAIN DRAFT");
});
test("project role: existing source links and malformed source fail without a worker", { skip: process.platform === "win32" ? "file symlink privilege varies on Windows" : false }, () => {
  const f = fixture(), orca = fakeOrca(f.home);
  assert.equal(f.run("project", "start", "P001", "--role", "builder", "--agent", "codex", "--no-launch").status, 0);
  const source = join(f.worktree, ".pace/team/builder.md"), outside = join(f.home, "outside.md");
  const original = readFileSync(source, "utf8"); writeFileSync(outside, original); unlinkSync(source); symlinkSync(outside, source);
  const run = () => runPace(["project", "start", "P001", "--role", "builder", "--launch", "--agent", "codex"], { cwd: f.root, home: f.home, env: { ...f.env, ...orca.env } });
  assert.notEqual(run().status, 0); assert.equal(readFileSync(outside, "utf8"), original); assert.deepEqual(orca.calls(), []);
  unlinkSync(source); writeFileSync(source, "invalid"); assert.notEqual(run().status, 0); assert.deepEqual(orca.calls(), []);
});
test("project role: settings and shell metacharacters are a single quoted value", { skip: process.platform === "win32" ? "POSIX shell quoting; argv capture is tested on every platform" : false }, () => {
  const f = fixture(), orca = fakeOrca(f.home), model = "model;$(touch sentinel-role)", bin = join(f.home, "bin");
  const r = runPace(["project", "start", "P001", "--role", "builder", "--agent", "codex", "--model", model], { cwd: f.root, home: f.home, env: { ...f.env, ...orca.env }, timeout: 30000 }); assert.equal(r.status, 0, r.stderr);
  const args = orca.calls().find((a) => a[1] === "worker-start")!; assert.equal(args[args.indexOf("--model") + 1], model);
  const manual = f.run("project", "start", "P001", "--role", "builder", "--launch", "--agent", "codex", "--model", model, "--no-launch"); assert.equal(manual.status, 0, manual.stderr);
  const command = manual.stdout.split("직접 열기: ")[1]!.trim();
  mkdirSync(bin); const recorded = join(f.home, "manual-args.json");
  const fake = join(bin, "codex"); writeFileSync(fake, `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(recorded)},JSON.stringify(process.argv.slice(2)));\n`); chmodSync(fake, 0o755);
  const executed = spawnSync("sh", ["-c", command], { env: { ...f.env, PATH: `${bin}:${process.env.PATH}` }, encoding: "utf8" }); assert.equal(executed.status, 0, executed.stderr);
  const captured = JSON.parse(readFileSync(recorded, "utf8")) as string[];
  assert.equal(captured[captured.indexOf("--model") + 1], model); assert.match(captured.at(-1)!, /^먼저 \.pace\/team\/builder\.md/);
  assert.equal(existsSync(join(f.worktree, "sentinel-role")), false);
});
test("project role: start record validation preserves legacy events and rejects malformed role rows", async () => {
  const { recordEvent, readEvents, validateEvent } = await import("../src/project/event-log.ts");
  const { validStartRole } = await import("../src/project/role-record.ts");
  const dir = tempDir("pace-role-record-"), role = { name: "builder", source: "option", definition: ".pace/team/builder.md", hash: "a".repeat(64), method: "prompt", model: "fixture-model", effort: "medium", settingsStatus: "arguments", toolsPermissionApplied: false, runtimeObserved: false } as const;
  const base = { ts: "2026-11-24T00:00:00Z", p: "P001", type: "start", by: "cli", ok: true, msg: "start" } as const;
  assert.equal(recordEvent(dir, base), true); assert.equal(recordEvent(dir, { ...base, role }), true);
  assert.equal(readEvents(dir).length, 2); assert.equal(Object.hasOwn(readEvents(dir)[0]!, "role"), false); assert.deepEqual(readEvents(dir)[1]!.role, role);
  for (const bad of [null, [], { ...role, hash: "bad" }, { ...role, definition: "../outside" }, { ...role, runtimeObserved: true }, { ...role, toolsPermissionApplied: true }, { ...role, model: "-danger" }, { ...role, model: "x".repeat(1025) }, { ...role, effort: "bad\nvalue" }, { ...role, extra: "not allowed" }]) {
    assert.equal(validStartRole(bad), false); assert.throws(() => validateEvent({ ...base, role: bad } as never));
    writeFileSync(join(dir, "log.jsonl"), JSON.stringify({ ...base, role: bad }) + "\n", { flag: "a" });
  }
  assert.throws(() => validateEvent({ ...base, type: "note", role }));
  assert.equal(readEvents(dir).length, 2, "strict read policy excludes malformed rows without changing valid legacy start");
});

test("project role: role-free legacy PROJECT may be large and hardlinked", async () => {
  const f = fixture(), path = projectPath(f.root);
  const text = readFileSync(path, "utf8") + "\n## Large legacy body\n" + "x".repeat(70000);
  writeFileSync(path, text); linkSync(path, join(f.home, "legacy-project-copy.md"));
  const result = f.run("project", "start", "P001", "--agent", "codex", "--no-launch");
  assert.equal(result.status, 0, result.stderr); assert.equal(existsSync(f.worktree), true);
  assert.equal(Object.hasOwn(starts(f.worktree).at(-1)!, "role"), false);
  assert.equal(readFileSync(join(f.home, "legacy-project-copy.md"), "utf8"), text);
  const { resolveWorkerRole } = await import("../src/team/worker-role.ts");
  assert.equal(resolveWorkerRole(f.root, `projects/${projectPath(f.root).split(sep).at(-2)!}/PROJECT.md`, { ref: "project/P001", projectRef: "project/P001", agent: "codex", env: f.env }), undefined);
});
test("project role: ref PROJECT names use literal Git paths", async () => {
  const f = fixture(), folder = "P321_261124_[literal]", dir = join(f.root, "projects", folder);
  mkdirSync(dir); writeFileSync(join(dir, "PROJECT.md"), "# fixture\n\n- 작업자 역할: builder\n\n## 목적\nfixture\n");
  f.git("add", "projects"); f.git("commit", "-qm", "literal project fixture");
  const { resolveWorkerRole } = await import("../src/team/worker-role.ts");
  assert.equal(resolveWorkerRole(f.root, `projects/${folder}/PROJECT.md`, { ref: "HEAD", projectRef: "HEAD", agent: "codex", env: f.env })!.member.name, "builder");
});
test("project role: normalization guidance names CRLF to LF UTF-8 SHA256", async () => {
  const f = fixture(), { resolveWorkerRole, roleInstruction } = await import("../src/team/worker-role.ts");
  const path = join(f.root, ".pace/team/builder.md"), lf = readFileSync(path, "utf8");
  writeFileSync(path, lf.replace(/\n/g, "\r\n"));
  const role = resolveWorkerRole(f.root, `projects/${projectPath(f.root).split(sep).at(-2)!}/PROJECT.md`, { role: "builder", agent: "codex", env: f.env })!;
  assert.match(roleInstruction(role), /CRLF.*LF.*UTF-8.*SHA256/);
  assert.equal(roleInstruction(role).includes(role.member.hash), true);
  assert.equal(role.member.hash, createHash("sha256").update(lf).digest("hex"));
});
test("project role: unsafe settings reach semantic preflight and never create a worker", async () => {
  const { hasSecret } = await import("../src/project/secrets.ts");
  const synthetic = "gh" + "p_" + "x".repeat(36);
  assert.equal(hasSecret(synthetic), true);
  const cases = [
    { label: "leading dash", args: ["--model=-x"] },
    { label: "oversize model", args: ["--model", "x".repeat(1025)] },
    { label: "secret candidate", args: ["--model", synthetic] },
    { label: "C1 control", args: ["--model", "model\u0085value"] },
    { label: "bidi control", args: ["--model", "model\u202evalue"] },
    { label: "tier surrogate", args: [], tier: { model: "\ud800" } },
    { label: "tier oversize", args: [], tier: { effort: "x".repeat(1025) } },
  ];
  for (const c of cases) {
    const f = fixture(), orca = fakeOrca(f.home);
    if (c.tier) writeFileSync(join(f.home, "worker-tiers.json"), JSON.stringify({ codex: { medium: c.tier } }));
    const r = runPace(["project", "start", "P001", "--agent", "codex", "--role", "builder", ...c.args], { cwd: f.root, home: f.home, env: { ...f.env, ...orca.env } });
    assert.notEqual(r.status, 0, c.label); assert.equal(existsSync(f.worktree), false, c.label);
    assert.equal(orca.calls().length, 0, c.label); assert.equal(r.stderr.includes(synthetic), false);
  }
});
test("project role: secret-looking member names never reach logs or diagnostics", async () => {
  const { hasSecret } = await import("../src/project/secrets.ts"), { validStartRole } = await import("../src/project/role-record.ts");
  const name = "sk-" + "x".repeat(30); assert.equal(hasSecret(name), true);
  const f = fixture(), orca = fakeOrca(f.home);
  const result = runPace(["project", "start", "P001", "--role", name, "--agent", "codex"], { cwd: f.root, home: f.home, env: { ...f.env, ...orca.env } });
  assert.notEqual(result.status, 0); assert.equal(result.stderr.includes(name), false);
  assert.equal(existsSync(f.worktree), false); assert.equal(orca.calls().length, 0);
  const log = join(projectPath(f.root), "../log.jsonl");
  if (existsSync(log)) assert.equal(readFileSync(log, "utf8").includes(name), false);
  assert.equal(validStartRole({ name, source: "option", definition: `.pace/team/${name}.md`, hash: "a".repeat(64), method: "prompt", model: "fixture", settingsStatus: "planned", toolsPermissionApplied: false, runtimeObserved: false }), false);
});
test("project role: invalid PROJECT names and deleted PROJECT-selected sources hold before workers", () => {
  for (const name of ["../outside", "missing"]) {
    const f = fixture(), orca = fakeOrca(f.home), path = projectPath(f.root);
    writeFileSync(path, readFileSync(path, "utf8").replace(/^- 작업자 역할:.*$/m, `- 작업자 역할: ${name}`));
    const r = runPace(["project", "start", "P001", "--agent", "codex"], { cwd: f.root, home: f.home, env: { ...f.env, ...orca.env } });
    assert.notEqual(r.status, 0); assert.equal(existsSync(f.worktree), false); assert.equal(orca.calls().length, 0);
  }
  const f = fixture(), orca = fakeOrca(f.home), path = projectPath(f.root);
  writeFileSync(path, readFileSync(path, "utf8").replace(/^- 작업자 역할:.*$/m, "- 작업자 역할: builder"));
  assert.equal(f.run("project", "start", "P001", "--agent", "codex", "--no-launch").status, 0);
  unlinkSync(join(f.worktree, ".pace/team/builder.md"));
  const r = runPace(["project", "start", "P001", "--agent", "codex", "--launch"], { cwd: f.root, home: f.home, env: { ...f.env, ...orca.env } });
  assert.notEqual(r.status, 0); assert.equal(orca.calls().length, 0);
});
test("project role: unknown and failed launches retain distinct statuses without automatic retries", () => {
  for (const [mode, status] of [["unknown", "unconfirmed"], ["fail", "rejected"]] as const) {
    const f = fixture(), orca = fakeOrca(f.home, mode);
    const r = runPace(["project", "start", "P001", "--role", "builder", "--agent", "codex"], { cwd: f.root, home: f.home, env: { ...f.env, ...orca.env }, timeout: 30000 });
    assert.equal(r.status, 0, r.stderr); assert.equal(starts(f.worktree).at(-1)!.role.settingsStatus, status);
    assert.equal(starts(f.worktree).at(-1)!.ok, true, "legacy command-result semantics are preserved");
    assert.equal(orca.calls().filter((args) => args[1] === "worker-start").length, 1);
  }
});
