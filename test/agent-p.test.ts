import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { AgentError, runAgent } from "../src/agent/contract.ts";
import { claudeP, codexP, codexWindowsSandbox, createPExecutor as createExecutor, type PAdapter } from "../src/agent/p-executor.ts";
import { buildChildEnv, runProcess } from "../src/agent/process.ts";
import { runPace, tempDir, spawnTestChild as spawn } from "./helpers.ts";

// Windows에서는 shebang 대신 Node로 실행하고 POSIX는 실행 파일을 직접 띄운다.
function createPExecutor(adapter: PAdapter, options: Parameters<typeof createExecutor>[1] = {}) {
  const script = options.command;
  if (!script || process.platform !== "win32") return createExecutor(adapter, options);
  return createExecutor({ ...adapter, build(request) { const invocation = adapter.build(request); return { ...invocation, args: [script, ...invocation.args] }; } }, { ...options, command: process.execPath });
}
/** 가짜 CLI: 인자·stdin·환경을 dump 파일에 남기고 지정한 stdout을 낸다 */
function fakeCli(dir: string, name: string, body: string): string {
  const path = join(dir, name);
  writeFileSync(path, `#!/usr/bin/env node\nconst fs=require("fs");const dump=process.env.DUMP||${JSON.stringify(join(dir, "dump.json"))};\nconst stdin=fs.readFileSync(0,"utf8");\nfs.writeFileSync(dump,JSON.stringify({argv:process.argv.slice(2),stdin,env:process.env}));\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}
const dumpOf = (dir: string) => JSON.parse(readFileSync(join(dir, "dump.json"), "utf8"));
const req = (extra = {}) => ({ agent: "claude", mode: "p", prompt: "비밀 프롬프트 본문", cwd: tempDir(), ...extra });

test("claude -p: 프롬프트는 stdin, 읽기 전용은 도구 제한, env 허용 목록, 결과 정규화", async () => {
  const dir = tempDir();
  const cli = fakeCli(dir, "claude", `console.log(JSON.stringify({type:"result",result:"좋음",session_id:"s9",stop_reason:"end_turn",is_error:false,usage:{input_tokens:5,output_tokens:6},modelUsage:{"claude-x":{}}}));`);
  const exec = createPExecutor(claudeP, { command: cli, sessionDir: join(dir, "s"), env: { PATH: process.env.PATH, HOME: "/h", AWS_SECRET: "leak", OPENAI_API_KEY: "no", ANTHROPIC_API_KEY: "ok" } });
  const r = await runAgent(exec, req({ model: "m" }));
  assert.equal(dumpOf(dir).env.OPENAI_API_KEY, undefined);
  const d = dumpOf(dir);
  assert.equal(r.text, "좋음");
  assert.deepEqual(r.model, { value: "claude-x", source: "reported" });
  assert.deepEqual(r.provider, { value: "anthropic", source: "model" });
  assert.equal(r.session_id, "s9");
  assert.deepEqual(r.usage, { input_tokens: 5, output_tokens: 6 });
  assert.equal(d.stdin, "비밀 프롬프트 본문");
  assert.ok(!d.argv.join(" ").includes("비밀"), "argv에 프롬프트 없음");
  assert.ok(d.argv.includes("--tools") && d.argv.includes("Read,Grep,Glob"));
  assert.ok(!d.argv.includes("acceptEdits"));
  assert.equal(d.env.AWS_SECRET, undefined);
  assert.equal(d.env.OPENAI_API_KEY_X, undefined);
  assert.equal(d.env.PACE_AGENT_CHILD, "1");
  assert.match(r.enforcement, /--tools/);
});

const CODEX_OK = (sandbox = "read-only") => `process.stdout.write("ok\\n");process.stderr.write("OpenAI Codex v0\\n--------\\nworkdir: /w\\nmodel: gpt-6\\nprovider: openai\\napproval: never\\nsandbox: ${sandbox}\\nsession id: t1\\n--------\\nuser\\nx\\n\\ncodex\\nok\\ntokens used\\n1,234\\n");`;

test("codex exec: 텍스트 모드 머리글에서 모델·제공자·sandbox를 보고값으로 읽고, 미지원 옵션은 오류", async () => {
  const dir = tempDir();
  const cli = fakeCli(dir, "codex", CODEX_OK());
  const exec = createPExecutor(codexP, { command: cli, sessionDir: join(dir, "s") });
  const r = await runAgent(exec, req({ agent: "codex" }));
  const argv = dumpOf(dir).argv as string[];
  assert.equal(r.text, "ok");
  assert.equal(r.session_id, "t1");
  assert.deepEqual(r.provider, { value: "openai", source: "reported" });
  assert.deepEqual(r.model, { value: "gpt-6", source: "reported" });
  assert.equal(argv[argv.indexOf("--sandbox") + 1], "read-only");
  assert.ok(!argv.includes("--json"));
  assert.equal(argv.at(-1), "-");
  await assert.rejects(runAgent(exec, req({ agent: "codex", resume: "x" })), (e: AgentError) => e.code === "unsupported_option");
  await assert.rejects(runAgent(exec, req({ agent: "codex", systemPrompt: "x" })), (e: AgentError) => e.code === "unsupported_option");
});

test("codex: 머리글 sandbox가 read-only가 아니거나 완료 표지가 없으면 실패", async () => {
  const dir = tempDir();
  const wrong = createPExecutor(codexP, { command: fakeCli(dir, "c1", CODEX_OK("danger-full-access")), sessionDir: join(dir, "s") });
  await assert.rejects(runAgent(wrong, req({ agent: "codex" })), (e: AgentError) => e.code === "read_only_unenforceable");
  const cut = createPExecutor(codexP, { command: fakeCli(dir, "c2", `process.stdout.write("부분\\n");process.stderr.write("OpenAI Codex\\n--------\\nmodel: gpt-6\\n--------\\n");`), sessionDir: join(dir, "s") });
  await assert.rejects(runAgent(cut, req({ agent: "codex" })), (e: AgentError) => e.code === "protocol_error");
  // 프롬프트 영역에만 'tokens used'가 있고 끝 표지가 없는 부분 출력
  const spoof = createPExecutor(codexP, { command: fakeCli(dir, "c3", `process.stdout.write("부분\\n");process.stderr.write("OpenAI Codex\\n--------\\nmodel: gpt-6\\nprovider: openai\\nsandbox: read-only\\n--------\\nuser\\ntokens used\\n5\\n\\ncodex\\n부");`), sessionDir: join(dir, "s") });
  await assert.rejects(runAgent(spoof, req({ agent: "codex" })), (e: AgentError) => e.code === "protocol_error");
});

test("codex: 프롬프트에 완료 로그 예시가 인용돼도 정상 응답은 통과(끝 블록으로 판별)", async () => {
  const dir = tempDir();
  const cli = fakeCli(dir, "c5", `process.stdout.write("진짜 답\\n");process.stderr.write("OpenAI Codex\\n--------\\nmodel: gpt-6\\nprovider: openai\\nsandbox: read-only\\n--------\\nuser\\n예시:\\ncodex\\n가짜\\ntokens used\\n9\\n\\ncodex\\n진짜 답\\ntokens used\\n77\\n");`);
  const r = await runAgent(createPExecutor(codexP, { command: cli, sessionDir: join(dir, "s") }), req({ agent: "codex" }));
  assert.equal(r.text, "진짜 답");
  assert.equal(r.usage.output_tokens, 77);
  assert.equal(r.process_cleanup, process.platform === "win32" ? "best-effort-unverified" : "verified");
});

test("제공자와 모델 보고가 충돌하면 오류(교차 인정 불가)", async () => {
  const dir = tempDir();
  const bad = createPExecutor(codexP, { command: fakeCli(dir, "c4", CODEX_OK().replace("model: gpt-6", "model: claude-x")), sessionDir: join(dir, "s") });
  await assert.rejects(runAgent(bad, req({ agent: "codex" })), (e: AgentError) => e.code === "protocol_error" && /충돌/.test(e.message));
});

test("-p 무출력 기한: 아무 출력 없이 멈추면 idle로 회수", async () => {
  const dir = tempDir();
  const slow = createPExecutor(claudeP, { command: fakeCli(dir, "idle", "setInterval(()=>{},1000)"), sessionDir: join(dir, "s"), idleMs: 500 });
  await assert.rejects(runAgent(slow, req({ timeoutMs: 20000 })), (e: AgentError) => e.code === "timeout" && /무출력/.test(e.message));
});

test("세션 저장소: 느슨한 권한은 보정하고 심볼릭 링크는 거부", async () => {
  const dir = tempDir();
  const cwd = tempDir();
  const sessionDir = join(dir, "s");
  const exec = createPExecutor(claudeP, { command: fakeCli(dir, "claude", `console.log(JSON.stringify({type:"result",result:"r",session_id:"sidx",modelUsage:{"claude-x":{}}}));`), sessionDir });
  await runAgent(exec, req({ cwd }));
  const file = join(sessionDir, "claude-sidx.json");
  chmodSync(file, 0o644);
  chmodSync(sessionDir, 0o755);
  await runAgent(exec, req({ cwd, resume: "sidx" }));
  if (process.platform !== "win32") { // Windows mode는 ACL이 아니다.
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(statSync(sessionDir).mode & 0o777, 0o700);
  }
  const real = join(dir, "real");
  mkdirSync(real);
  symlinkSync(real, join(dir, "link"), process.platform === "win32" ? "junction" : "dir");
  const linked = createPExecutor(claudeP, { command: fakeCli(dir, "claude2", `console.log(JSON.stringify({type:"result",result:"r",session_id:"sidy"}));`), sessionDir: join(dir, "link") });
  await assert.rejects(runAgent(linked, req({ cwd })), (e: AgentError) => e.code === "session_mismatch");
});

test("제공자 출처: 에이전트가 다른 제공자를 보고하면 오류", async () => {
  const dir = tempDir();
  const liar = createPExecutor(claudeP, { command: fakeCli(dir, "l", `console.log(JSON.stringify({type:"result",result:"r",modelUsage:{"gpt-6":{}}}))`), sessionDir: join(dir, "s") });
  await assert.rejects(runAgent(liar, req()), (e: AgentError) => e.code === "protocol_error");
});

test("env: 대상 에이전트의 자격 증명만 넘긴다", () => {
  const parent = { PATH: "/bin", ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o", CODEX_HOME: "/c", CLAUDE_CONFIG_DIR: "/d" };
  const c = buildChildEnv(parent, "claude");
  assert.deepEqual([c.ANTHROPIC_API_KEY, c.OPENAI_API_KEY, c.CODEX_HOME, c.CLAUDE_CONFIG_DIR], ["a", undefined, undefined, "/d"]);
  const x = buildChildEnv(parent, "codex");
  assert.deepEqual([x.ANTHROPIC_API_KEY, x.OPENAI_API_KEY, x.CODEX_HOME], [undefined, "o", "/c"]);
});

test("이어가기: pace agent가 만든 세션만, 같은 cwd·접근에서만 재사용", async () => {
  const dir = tempDir();
  const sessionDir = join(dir, "s");
  const cwd = tempDir();
  const cli = fakeCli(dir, "claude", `console.log(JSON.stringify({type:"result",result:"r",session_id:"sid1",modelUsage:{"claude-x":{}}}));`);
  const exec = createPExecutor(claudeP, { command: cli, sessionDir });
  await assert.rejects(runAgent(exec, req({ cwd, resume: "sid1" })), (e: AgentError) => e.code === "session_mismatch", "미등록 ID 거부");
  await runAgent(exec, req({ cwd }));
  assert.equal((await runAgent(exec, req({ cwd, resume: "sid1" }))).text, "r");
  await assert.rejects(runAgent(exec, req({ cwd: tempDir(), resume: "sid1" })), (e: AgentError) => e.code === "session_mismatch");
  await assert.rejects(runAgent(exec, req({ cwd, resume: "sid1", access: "write" })), (e: AgentError) => e.code === "session_mismatch");
});

test("시스템 프롬프트는 argv가 아닌 파일로 전달하고 끝나면 지운다", async () => {
  const dir = tempDir();
  const cli = fakeCli(dir, "claude", `const f=process.argv[process.argv.indexOf("--append-system-prompt-file")+1];fs.writeFileSync("${dir.replaceAll("\\", "/")}/sys.txt",fs.readFileSync(f,"utf8")+"|"+f+"|"+(fs.statSync(f).mode&0o777).toString(8));console.log(JSON.stringify({type:"result",result:"r"}));`);
  await runAgent(createPExecutor(claudeP, { command: cli, sessionDir: join(dir, "s") }), req({ systemPrompt: "기밀 지시" }));
  const [text, file, mode] = readFileSync(join(dir, "sys.txt"), "utf8").split("|");
  assert.equal(text, "기밀 지시");
  if (process.platform !== "win32") assert.equal(mode, "600"); // Windows stat mode는 ACL이 아니다.
  assert.ok(!dumpOf(dir).argv.join(" ").includes("기밀"));
  assert.equal(existsSync(file!), false);
});

test("상대 cwd는 절대 경로로 정규화되어 중복 적용되지 않는다", async () => {
  const dir = tempDir();
  const cli = fakeCli(dir, "codex", CODEX_OK());
  const base = tempDir();
  mkdirSync(join(base, "sub"));
  const prev = process.cwd();
  process.chdir(base);
  try {
    await runAgent(createPExecutor(codexP, { command: cli, sessionDir: join(dir, "s") }), { ...req({ agent: "codex" }), cwd: "sub" });
  } finally {
    process.chdir(prev);
  }
  const argv = dumpOf(dir).argv as string[];
  const given = argv[argv.indexOf("-C") + 1]!;
  assert.equal(given, join(base, "sub"));
  assert.equal(realpathSync(given), realpathSync(join(base, "sub")));
});

test("호출 프로세스가 강제 종료돼도 독립 감시자가 자식 그룹을 회수한다", async () => {
  const dir = tempDir();
  const pidFile = join(dir, "child.pid");
  const driver = join(dir, "driver.ts");
  writeFileSync(driver, `import { runProcess, buildChildEnv } from ${JSON.stringify(pathToFileURL(join(import.meta.dirname, "../src/agent/process.ts")).href)};
import { writeFileSync } from "node:fs";
runProcess({ command: process.execPath, args: ["-e", ${JSON.stringify(`require("fs").writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(()=>{},1000)`)}], cwd: ${JSON.stringify(dir)}, env: buildChildEnv(process.env), input: "", timeoutMs: 600000, graceMs: 300 });
`);
  const proc = spawn(process.execPath, [driver], { stdio: "ignore" });
  for (let i = 0; i < 60 && !existsSync(pidFile); i++) await new Promise((r) => setTimeout(r, 100));
  const childPid = Number(readFileSync(pidFile, "utf8"));
  process.kill(childPid, 0); // 살아 있음
  proc.kill("SIGKILL");
  let gone = false;
  for (let i = 0; i < 40 && !gone; i++) {
    await new Promise((r) => setTimeout(r, 150));
    try {
      process.kill(childPid, 0);
    } catch {
      gone = true;
    }
  }
  assert.ok(gone, "부모가 죽은 뒤 자식이 회수됐다");
});

test("읽기 전용을 강제할 수 없는 어댑터는 실행 전에 거부", async () => {
  const dir = tempDir();
  const cli = fakeCli(dir, "x", `console.log("{}")`);
  const weak: PAdapter = { ...claudeP, build: () => ({ args: [], enforcement: null }) };
  await assert.rejects(runAgent(createPExecutor(weak, { command: cli, sessionDir: join(dir, "s") }), req()), (e: AgentError) => e.code === "read_only_unenforceable");
  assert.equal(existsSync(join(dir, "dump.json")), false, "프로세스를 띄우지 않았다");
});

test("실패·형식 오류 분류", async () => {
  const dir = tempDir();
  const fail = createPExecutor(claudeP, { command: fakeCli(dir, "f", `console.error("boom");process.exit(3)`), sessionDir: join(dir, "s") });
  await assert.rejects(runAgent(fail, req()), (e: AgentError) => e.code === "agent_failed" && /boom/.test(e.message));
  const junk = createPExecutor(claudeP, { command: fakeCli(dir, "j", `console.log("not json")`), sessionDir: join(dir, "s") });
  await assert.rejects(runAgent(junk, req()), (e: AgentError) => e.code === "protocol_error");
});

test("timeout: 프로세스 그룹 전체(자손 포함)를 회수한다", async () => {
  const dir = tempDir();
  const pidFile = join(dir, "grandchild.pid");
  const cli = fakeCli(dir, "slow", `const c=require("child_process").spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});fs.writeFileSync("${pidFile.replaceAll("\\", "/")}",String(c.pid));setInterval(()=>{},1000);`);
  const started = Date.now();
  const out = await runProcess({ command: process.platform === "win32" ? process.execPath : cli, args: process.platform === "win32" ? [cli] : [], cwd: dir, env: buildChildEnv(process.env), input: "", timeoutMs: 800, graceMs: 300 });
  assert.equal(out.timedOut, true);
  assert.equal(out.reaped, true);
  assert.ok(Date.now() - started < 5000);
  const pid = Number(readFileSync(pidFile, "utf8"));
  await new Promise((r) => setTimeout(r, 200));
  assert.throws(() => process.kill(pid, 0), /ESRCH/, "손자 프로세스가 남지 않았다");
});

test("rawDir를 주면 원본을 0600으로 보관하고 기본은 저장하지 않는다", async () => {
  const dir = tempDir();
  const exec = createPExecutor(claudeP, { command: fakeCli(dir, "c", `console.log(JSON.stringify({type:"result",result:"r"}))`), sessionDir: join(dir, "s") });
  assert.equal((await runAgent(exec, req())).raw_path, null);
  const rawDir = join(tempDir(), "raw");
  const r = await runAgent(exec, req({ rawDir }));
  assert.ok(r.raw_path && existsSync(r.raw_path));
});

test("자식 부트 차단: PACE_AGENT_CHILD=1이면 종료 0과 유효한 훅 JSON, 부트 맥락 없음", () => {
  const home = tempDir();
  const unknown = runPace(["boot", "--host", "claude", "--unknown"], { home, env: { PACE_AGENT_CHILD: "1" } });
  assert.equal(unknown.status, 0);
  assert.ok(JSON.parse(unknown.stdout));
  for (const host of ["claude", "codex", "cursor", "plain"]) {
    const r = runPace(["boot", "--host", host], { home, env: { PACE_AGENT_CHILD: "1" } });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /자식 세션/);
    if (host !== "plain") assert.ok(JSON.parse(r.stdout));
    assert.ok(!r.stdout.includes("프로필"), "부트 맥락 미포함");
  }
});

test("codex: Windows에서는 unelevated sandbox를 지정해 read-only에서도 파일을 읽게 한다(없으면 셸이 모두 blocked by policy)", () => {
  assert.deepEqual(codexWindowsSandbox("win32"), ["-c", 'windows.sandbox="unelevated"']);
  assert.deepEqual(codexWindowsSandbox("linux"), []);
  assert.deepEqual(codexWindowsSandbox("darwin"), []);
  for (const access of ["read-only", "write"] as const) {
    const { args } = codexP.build({ agent: "codex", mode: "p", prompt: "x", cwd: "/w", access, timeoutMs: 1000 });
    const sandbox = args.indexOf("--sandbox");
    assert.equal(args[sandbox + 1], access === "write" ? "workspace-write" : "read-only");
    if (process.platform === "win32") assert.ok(args.includes('windows.sandbox="unelevated"'), args.join(" "));
    else assert.ok(!args.some((a) => a.startsWith("windows.sandbox")), args.join(" "));
  }
});
