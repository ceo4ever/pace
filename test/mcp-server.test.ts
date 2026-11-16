import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, linkSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PaceMcpServer, type McpServerConfig } from "../src/mcp/server.ts";
import { MCP_READ_TOOLS, MCP_WRITE_TOOLS } from "../src/mcp/names.ts";
import { addMemory, profileMemoryDir, projectMemoryDir } from "../src/memory/memory.ts";
import { addPage, initBrain } from "../src/project/brain.ts";
import { createProfile } from "../src/profile/profile.ts";
import { profileDir } from "../src/core/paths.ts";
import { ALTU, tempDir } from "./helpers.ts";

interface Env { home: string; ws: string; outside: string; env: NodeJS.ProcessEnv }

/** 프로젝트 메모리·브레인·백로그·프로젝트가 있는 워크스페이스, 프로필 메모리, 그리고 밖에 있는 비밀 폴더 */
function setup(): Env {
  const home = realpathSync.native(tempDir());
  createProfile(home, ALTU);
  addMemory(profileMemoryDir(profileDir(home, "default")), "profile", { type: "rule", name: "프로필 규칙", description: "프로필 쪽 규칙 하나", body: "" });
  const ws = realpathSync.native(tempDir());
  addMemory(projectMemoryDir(ws), "project", { type: "note", name: "코드워드", description: "코드워드는 zebra-7", body: "본문 zebra" });
  initBrain(ws);
  addPage(ws, { type: "concept", title: "펭귄 개념", summary: "펭귄 요약", body: "## 펭귄\n남극에 산다 flamingo-keyword" });
  mkdirSync(join(ws, "backlogs", "BL261111_01_예시"), { recursive: true });
  writeFileSync(join(ws, "backlogs", "BL261111_01_예시", "BACKLOG.md"), "# 예시\n\n- 상태: 진행\n\n본문 백로그\n");
  writeFileSync(join(ws, "backlogs", "BL261111_01_예시", "BR03_ACP.md"), "# BR03\n브리프 본문\n");
  mkdirSync(join(ws, "projects", "P001_테스트"), { recursive: true });
  writeFileSync(join(ws, "projects", "P001_테스트", "PROJECT.md"), "# P001 테스트\n\n- 상태: 진행\n\n## 태스크\n\n| T | 이름 | 상태 | 커밋 |\n|---|---|---|---|\n| T01 | 첫째 | 완료 | abc |\n| T02 | 둘째 | 진행 | |\n\n## 다음\n");
  const outside = realpathSync.native(tempDir());
  writeFileSync(join(outside, "secret.md"), "---\nname: 밖 비밀\ndescription: 밖\ntype: note\ncreated: 2026-01-01\nupdated: 2026-01-01\n---\nOUTSIDE-SECRET\n");
  return { home, ws, outside, env: { PACE_HOME: home, PACE_PROFILE: "default" } };
}

function server(e: Env, access: "read-only" | "write", extra: Partial<McpServerConfig> = {}): PaceMcpServer {
  return new PaceMcpServer({ workspace: e.ws, access, env: e.env, ...extra });
}

let nextId = 1;
async function call(s: PaceMcpServer, name: string, args: unknown = {}): Promise<{ text: string; isError: boolean; raw: any }> {
  const r: any = await s.handle({ jsonrpc: "2.0", id: nextId++, method: "tools/call", params: { name, arguments: args } });
  if (r.error) return { text: r.error.message, isError: true, raw: r };
  return { text: r.result.content.map((c: any) => c.text).join("\n"), isError: r.result.isError === true, raw: r };
}

test("S-1 initialize·ping·tools/list·도구 조회가 워크스페이스 데이터를 돌려준다", async () => {
  const e = setup();
  const s = server(e, "read-only");
  const init: any = await s.handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "1" } } });
  assert.equal(init.result.protocolVersion, "2025-03-26");
  assert.equal(init.result.serverInfo.name, "pace");
  assert.ok(init.result.capabilities.tools);
  const future: any = await s.handle({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "2099-01-01" } });
  assert.equal(future.result.protocolVersion, "2025-06-18");
  assert.equal(await s.handle({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
  assert.deepEqual((await s.handle({ jsonrpc: "2.0", id: 3, method: "ping" }) as any).result, {});
  const list: any = await s.handle({ jsonrpc: "2.0", id: 4, method: "tools/list" });
  assert.deepEqual(list.result.tools.map((t: any) => t.name), [...MCP_READ_TOOLS]);
  const unknownMethod: any = await s.handle({ jsonrpc: "2.0", id: 5, method: "resources/list" });
  assert.equal(unknownMethod.error.code, -32601);

  assert.match((await call(s, "memory_list")).text, /코드워드\tnote\t코드워드는 zebra-7/);
  assert.match((await call(s, "memory_show", { slug: "코드워드" })).text, /본문 zebra/);
  assert.match((await call(s, "memory_list", { scope: "profile" })).text, /프로필-규칙|프로필 규칙|rule/);
  assert.match((await call(s, "project_list")).text, /P001 · 테스트 · 진행 · 진행 T02 둘째/);
  assert.match((await call(s, "backlog_list")).text, /BL261111_01_예시 · 진행/);
  assert.match((await call(s, "backlog_show", { name: "BL261111_01_예시" })).text, /본문 백로그/);
  assert.match((await call(s, "backlog_show", { name: "BL261111_01_예시", brief: "BR03" })).text, /브리프 본문/);
  const brain = await call(s, "brain_search", { query: "펭귄" });
  assert.equal(brain.isError, false);
  assert.match(brain.text, /펭귄/);
  const unknown: any = await s.handle({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "rm_rf", arguments: {} } });
  assert.equal(unknown.error.code, -32602);
});

test("S-2 읽기 전용: 목록에서 숨기고, 직접 호출해도 서버가 거부하며 파일이 변하지 않는다", async () => {
  const e = setup();
  const s = server(e, "read-only");
  const list: any = await s.handle({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  for (const t of MCP_WRITE_TOOLS) assert.ok(!list.result.tools.some((x: any) => x.name === t));
  const r = await call(s, "memory_add", { type: "note", name: "침입", description: "읽기 전용인데 추가", body: "" });
  assert.equal(r.isError, true);
  assert.match(r.text, /읽기 전용/);
  assert.ok(!existsSync(join(projectMemoryDir(e.ws), "침입.md")));
  const w = server(e, "write");
  const wl: any = await w.handle({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.ok(wl.result.tools.some((x: any) => x.name === "memory_add"));
});

test("S-3 다른 워크스페이스(다른 경로·부모·형제)를 지정하면 모든 도구가 거부한다", async () => {
  const e = setup();
  const sibling = realpathSync.native(tempDir());
  mkdirSync(join(sibling, ".pace", "memory"), { recursive: true });
  for (const access of ["read-only", "write"] as const) {
    const s = server(e, access);
    for (const other of [sibling, join(e.ws, ".."), e.outside, join(e.ws, "projects")]) {
      for (const [name, args] of [["memory_list", {}], ["project_list", {}], ["backlog_list", {}], ["brain_search", { query: "펭귄" }]] as const) {
        const r = await call(s, name, { ...args, workspace: other });
        assert.equal(r.isError, true, `${name} ${other}`);
        assert.match(r.text, /고정된 워크스페이스/);
      }
    }
    // 같은 폴더(다른 표기)는 허용
    assert.equal((await call(s, "memory_list", { workspace: join(e.ws, ".") })).isError, false);
    assert.equal((await call(s, "memory_list", { workspace: 7 })).isError, true);
  }
});

test("S-4 경로성 인자(slug·백로그 이름·브리프)로 밖을 읽지 못한다", async () => {
  const e = setup();
  const s = server(e, "read-only");
  for (const slug of ["../secret", `..${"\\"}x`, "a/b", e.outside, join(e.outside, "secret"), "", "STATUS/../x"]) {
    const r = await call(s, "memory_show", { slug });
    assert.equal(r.isError, true, slug);
    assert.doesNotMatch(r.text, /OUTSIDE-SECRET/);
  }
  assert.equal((await call(s, "memory_show", { slug: 5 })).isError, true);
  for (const name of ["..", "../..", "BL261111_01_예시/..", "BL261111_01_예시\\..\\..", join(e.ws, "backlogs"), "BL999999_99_없음", "BACKLOG.md"]) {
    const r = await call(s, "backlog_show", { name });
    assert.equal(r.isError, true, name);
  }
  for (const brief of ["../BACKLOG", "..\\..\\x", "BR99", "BR03_ACP/../../BACKLOG.md", ""]) {
    const r = await call(s, "backlog_show", { name: "BL261111_01_예시", brief });
    assert.equal(r.isError, true, brief);
  }
  assert.equal((await call(s, "backlog_show", { name: "BL261111_01_예시", brief: "BR03_ACP.md" })).isError, false);
});

test("S-5 쓰기 세션: memory_add 성공·가드 위반 거부·force 거부·중복 거부", async () => {
  const e = setup();
  const s = server(e, "write");
  const ok = await call(s, "memory_add", { type: "note", name: "새 메모", description: "서버가 추가한 메모", body: "내용" });
  assert.equal(ok.isError, false);
  assert.match(ok.text, /기억 추가/);
  assert.match((await call(s, "memory_list")).text, /서버가 추가한 메모/);
  assert.match((await call(s, "memory_show", { slug: "새-메모" })).text, /내용/);
  const secret = await call(s, "memory_add", { type: "note", name: "비밀", description: "토큰 값", body: "sk-ant-api03-" + "a".repeat(40) });
  assert.equal(secret.isError, true);
  const dup = await call(s, "memory_add", { type: "note", name: "새 메모", description: "중복", body: "" });
  assert.equal(dup.isError, true);
  const force = await call(s, "memory_add", { type: "note", name: "강제", description: "x", body: "", force: true });
  assert.equal(force.isError, true);
  assert.match(force.text, /받지 않는 인자/);
  const status = await call(s, "memory_add", { type: "status", name: "s", description: "d", body: "b" });
  assert.equal(status.isError, true);
  const tooLong = await call(s, "memory_add", { type: "note", name: "긴 메모", description: "d", body: "가".repeat(600) });
  assert.equal(tooLong.isError, true);
  assert.ok(!existsSync(join(projectMemoryDir(e.ws), "긴-메모.md")));
});

test("S-6 상위 폴더에만 브레인이 있으면 올라가 읽지 않는다", async () => {
  const e = setup();
  const child = join(e.ws, "sub", "inner");
  mkdirSync(child, { recursive: true });
  const s = new PaceMcpServer({ workspace: child, access: "read-only", env: e.env });
  assert.equal((await call(s, "brain_search", { query: "펭귄" })).text, "브레인 없음");
  assert.equal((await call(s, "memory_list")).text, "(기억 없음)");
});

const linkFixtures: { name: string; make: (e: Env) => void; tool: [string, object] }[] = [
  { name: ".pace/memory가 밖을 가리키는 junction", make: (e) => { rmSync(projectMemoryDir(e.ws), { recursive: true }); mkdirSync(join(e.outside, "mem")); writeFileSync(join(e.outside, "mem", "x.md"), "---\nname: x\ndescription: x\ntype: note\ncreated: 2026-01-01\nupdated: 2026-01-01\n---\nOUTSIDE-SECRET\n"); symlinkSync(join(e.outside, "mem"), projectMemoryDir(e.ws), "junction"); }, tool: ["memory_list", {}] },
  { name: ".pace/brain이 밖을 가리키는 junction", make: (e) => { rmSync(join(e.ws, ".pace", "brain"), { recursive: true }); symlinkSync(e.outside, join(e.ws, ".pace", "brain"), "junction"); }, tool: ["brain_search", { query: "OUTSIDE" }] },
  { name: "backlogs 안 백로그 폴더가 밖을 가리키는 junction", make: (e) => { rmSync(join(e.ws, "backlogs", "BL261111_01_예시"), { recursive: true }); symlinkSync(e.outside, join(e.ws, "backlogs", "BL261111_01_예시"), "junction"); }, tool: ["backlog_list", {}] },
  { name: "중첩 파일 링크(폴더는 정상, .md 하나가 링크)", make: (e) => { symlinkSync(join(e.outside, "secret.md"), join(projectMemoryDir(e.ws), "링크.md"), "file"); }, tool: ["memory_list", {}] },
  { name: "projects/P001 폴더가 밖을 가리키는 junction", make: (e) => { rmSync(join(e.ws, "projects", "P001_테스트"), { recursive: true }); symlinkSync(e.outside, join(e.ws, "projects", "P001_테스트"), "junction"); }, tool: ["project_list", {}] },
  { name: "PROJECT.md가 밖 파일의 링크", make: (e) => { rmSync(join(e.ws, "projects", "P001_테스트", "PROJECT.md")); symlinkSync(join(e.outside, "secret.md"), join(e.ws, "projects", "P001_테스트", "PROJECT.md"), "file"); }, tool: ["project_list", {}] },
];

for (const fx of linkFixtures) {
  test(`S-6b 경계 밖을 가리키는 링크는 거부한다 — ${fx.name}`, async () => {
    const e = setup();
    fx.make(e);
    const s = server(e, "write");
    const r = await call(s, fx.tool[0], fx.tool[1]);
    assert.equal(r.isError, true);
    assert.match(r.text, /링크|경계/);
    assert.doesNotMatch(r.text, /OUTSIDE-SECRET/);
  });
}

test("S-6b 부모 .pace이 링크이면 memory_add가 밖에 만들지 않는다", async () => {
  const e = setup();
  rmSync(join(e.ws, ".pace"), { recursive: true });
  symlinkSync(e.outside, join(e.ws, ".pace"), "junction");
  const s = server(e, "write");
  const r = await call(s, "memory_add", { type: "note", name: "밖에 쓰기", description: "시도", body: "" });
  assert.equal(r.isError, true);
  assert.ok(!existsSync(join(e.outside, "memory")));
  assert.ok(!existsSync(join(e.outside, "memory", "밖에-쓰기.md")));
});

test("S-6b 링크가 안쪽을 가리켜도 링크는 거부한다(예외 없음)", async () => {
  const e = setup();
  mkdirSync(join(e.ws, "real-mem"));
  rmSync(projectMemoryDir(e.ws), { recursive: true });
  symlinkSync(join(e.ws, "real-mem"), projectMemoryDir(e.ws), "junction");
  assert.equal((await call(server(e, "read-only"), "memory_list")).isError, true);
});

test("S-6c 프로필 메모리는 변경 도구로 바꿀 수 없고, brief는 이탈하지 못한다", async () => {
  const e = setup();
  const s = server(e, "write");
  const r = await call(s, "memory_add", { type: "rule", name: "프로필에 쓰기", description: "시도", body: "", scope: "profile" });
  assert.equal(r.isError, true);
  assert.ok(!existsSync(join(profileMemoryDir(profileDir(e.home, "default")), "프로필에-쓰기.md")));
  for (const brief of ["../../BACKLOG.md", "..", "BR03/../../../x"]) assert.equal((await call(s, "backlog_show", { name: "BL261111_01_예시", brief })).isError, true);
});

test("S-6d 프로필 메모리 루트의 링크는 거부하고, worktree처럼 main이 밖에 있어도 워크스페이스 안 projects만 읽는다", async () => {
  const e = setup();
  const memory = profileMemoryDir(profileDir(e.home, "default"));
  symlinkSync(join(e.outside, "secret.md"), join(memory, "탈출.md"), "file");
  const r = await call(server(e, "read-only"), "memory_list", { scope: "profile" });
  assert.equal(r.isError, true);
  assert.doesNotMatch(r.text, /OUTSIDE-SECRET/);
  const e2 = setup();
  // main 저장소(밖)에 프로젝트가 있어도 나열하지 않는다
  mkdirSync(join(e2.outside, "projects", "P777_밖"), { recursive: true });
  writeFileSync(join(e2.outside, "projects", "P777_밖", "PROJECT.md"), "- 상태: 진행\n");
  assert.doesNotMatch((await call(server(e2, "read-only"), "project_list")).text, /P777/);
});

test("S-6e 프로필 정상 읽기, 호출 사이 새 링크, 항목·깊이 상한, 길이 가드와 재조회", async () => {
  const e = setup();
  const s = server(e, "read-only");
  const prof = await call(s, "memory_list", { scope: "profile" });
  assert.equal(prof.isError, false);
  assert.match(prof.text, /프로필 쪽 규칙/);
  assert.equal((await call(s, "memory_list")).isError, false);
  symlinkSync(join(e.outside, "secret.md"), join(projectMemoryDir(e.ws), "새링크.md"), "file");
  assert.equal((await call(s, "memory_list")).isError, true, "링크가 생긴 다음 호출은 거부");
  // 항목 상한(주입한 작은 상한) — 부분 결과 없이 거부
  const e2 = setup();
  for (let i = 0; i < 6; i++) writeFileSync(join(projectMemoryDir(e2.ws), `x${i}.md`), "---\nname: x\ndescription: x\ntype: note\ncreated: 2026-01-01\nupdated: 2026-01-01\n---\nb\n");
  const limited = await call(server(e2, "read-only", { scan: { limits: { maxEntries: 4 } } }), "memory_list");
  assert.equal(limited.isError, true);
  assert.match(limited.text, /상한/);
  assert.doesNotMatch(limited.text, /기억 없음|note/);
  // 깊이 상한
  const e3 = setup();
  let deep = projectMemoryDir(e3.ws);
  for (let i = 0; i < 10; i++) { deep = join(deep, `d${i}`); mkdirSync(deep); }
  assert.match((await call(server(e3, "read-only"), "memory_list")).text, /깊이 상한/);
  // 길이 가드와 정상 저장 뒤 재조회
  const w = server(setup(), "write");
  assert.equal((await call(w, "memory_add", { type: "note", name: "길다", description: "나".repeat(300), body: "" })).isError, true);
  assert.equal((await call(w, "memory_add", { type: "note", name: "짧다", description: "짧은 요약", body: "" })).isError, false);
  assert.match((await call(w, "memory_list")).text, /짧은 요약/);
});

test("S-6f 파일 크기·총량·탐색 시간 상한을 넘으면 부분 결과 없이 거부한다", async () => {
  const e = setup();
  writeFileSync(join(projectMemoryDir(e.ws), "big.md"), "x".repeat(2000));
  const big = await call(server(e, "read-only", { scan: { limits: { maxFileBytes: 1000 } } }), "memory_list");
  assert.equal(big.isError, true);
  assert.match(big.text, /크기 상한/);
  const total = await call(server(e, "read-only", { scan: { limits: { maxTotalBytes: 500 } } }), "memory_list");
  assert.match(total.text, /총 크기 상한/);
  let t = 0;
  const slow = await call(server(e, "read-only", { scan: { now: () => (t += 3000), limits: { deadlineMs: 5000 } } }), "memory_list");
  assert.match(slow.text, /시간 상한/);
});

test("S-6g 모듈 호출 중 파일이 링크로 바뀌면 사후 scan이 잡아 결과를 버린다", async () => {
  const e = setup();
  const swap = () => {
    const dir = projectMemoryDir(e.ws);
    symlinkSync(join(e.outside, "secret.md"), join(dir, "들어옴.md"), "file");
  };
  const s = server(e, "read-only", { testHooks: { afterModuleRead: (root) => { if (root.endsWith("memory")) swap(); } } });
  const r = await call(s, "memory_list");
  assert.equal(r.isError, true);
  assert.doesNotMatch(r.text, /OUTSIDE-SECRET|코드워드/);
  // 변화 없는 호출은 정상
  const clean = await call(server(setup(), "read-only", { testHooks: { afterModuleRead: () => {} } }), "memory_list");
  assert.equal(clean.isError, false);
});

test("S-6h memory_add: 없는 .pace/memory에서 최초 성공, 호출 중 끼어든 링크, 교체된 루트, 하드링크, 총량 상한", async () => {
  // 빈 워크스페이스 최초 추가
  const fresh = realpathSync.native(tempDir());
  const f = new PaceMcpServer({ workspace: fresh, access: "write", env: { PACE_HOME: realpathSync.native(tempDir()) } });
  assert.equal((await call(f, "memory_list")).text, "(기억 없음)");
  const first = await call(f, "memory_add", { type: "note", name: "처음", description: "최초 추가", body: "" });
  assert.equal(first.isError, false);
  assert.ok(existsSync(join(projectMemoryDir(fresh), "처음.md")));
  assert.match((await call(f, "memory_list")).text, /최초 추가/);

  // 호출 중 새 링크 — 오류이면서 본문의 저장 여부가 실제와 일치
  const e = setup();
  const s = server(e, "write", { testHooks: { afterModuleRead: () => symlinkSync(join(e.outside, "secret.md"), join(projectMemoryDir(e.ws), "끼어듦.md"), "file") } });
  const r = await call(s, "memory_add", { type: "note", name: "저장됨", description: "저장 뒤 검사 실패", body: "" });
  assert.equal(r.isError, true);
  assert.match(r.text, /실제 저장 여부: 저장됨/);
  assert.ok(existsSync(join(projectMemoryDir(e.ws), "저장됨.md")));

  // 기동 뒤 워크스페이스 디렉터리가 다른 곳으로 교체됨
  const e2 = setup();
  const s2 = server(e2, "write");
  assert.equal((await call(s2, "memory_list")).isError, false);
  const moved = `${e2.ws}-moved`;
  renameSync(e2.ws, moved);
  mkdirSync(e2.ws);
  const swapped = await call(s2, "memory_list");
  assert.equal(swapped.isError, true);
  assert.match(swapped.text, /교체|사라졌/);
  assert.equal((await call(s2, "project_list")).isError, true);
  assert.equal((await call(s2, "memory_add", { type: "note", name: "교체뒤", description: "시도", body: "" })).isError, true);
  assert.ok(!existsSync(join(e2.ws, ".pace")));

  // 하드링크 파일이 든 루트는 읽기·쓰기 모두 거부
  const e3 = setup();
  linkSync(join(e3.outside, "secret.md"), join(projectMemoryDir(e3.ws), "하드.md"));
  const hard = await call(server(e3, "write"), "memory_list");
  assert.equal(hard.isError, true);
  assert.match(hard.text, /하드링크/);
  assert.equal((await call(server(e3, "write"), "memory_add", { type: "note", name: "하드뒤", description: "시도", body: "" })).isError, true);
  assert.ok(!existsSync(join(projectMemoryDir(e3.ws), "하드뒤.md")));
});
