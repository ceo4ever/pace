import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { PaceMcpServer } from "../src/mcp/server.ts";
import { MAX_LINE_BYTES, serveStdio } from "../src/mcp/stdio.ts";
import { addMemory, projectMemoryDir } from "../src/memory/memory.ts";
import { PACE_BIN, runPace, sessionFreeEnv, spawnTestChild as spawn, tempDir } from "./helpers.ts";

function workspace(): string {
  const ws = realpathSync.native(tempDir());
  addMemory(projectMemoryDir(ws), "project", { type: "note", name: "코드워드", description: "코드워드는 zebra-7", body: "" });
  return ws;
}

function child(args: string[], env: NodeJS.ProcessEnv = {}) {
  const p = spawn(process.execPath, [PACE_BIN, "mcp", ...args], { env: { ...sessionFreeEnv(), PACE_HOME: tempDir(), ...env }, stdio: ["pipe", "pipe", "pipe"] });
  let out = "";
  let err = "";
  p.stdout.on("data", (d: Buffer) => { out += d.toString("utf8"); });
  p.stderr.on("data", (d: Buffer) => { err += d.toString("utf8"); });
  const exited = new Promise<number | null>((resolve) => p.on("close", (code: number | null) => resolve(code)));
  const lines = () => out.split("\n").filter(Boolean);
  const waitFor = async (n: number) => {
    for (let i = 0; i < 400 && lines().length < n; i++) await new Promise((r) => setTimeout(r, 25));
    assert.ok(lines().length >= n, `응답 ${n}개를 기다렸으나 ${lines().length}개: ${out.slice(0, 300)} / ${err.slice(0, 300)}`);
  };
  return { p, lines, waitFor, exited, err: () => err };
}

test("S-7 실제 pace mcp 프로세스가 stdio JSON-RPC를 왕복하고 stdout에는 프로토콜만 나온다", async () => {
  const ws = workspace();
  const c = child(["--workspace", ws, "--access", "read-only"]);
  c.p.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })}\n`);
  c.p.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
  c.p.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })}\n`);
  c.p.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "memory_list", arguments: {} } })}\n`);
  c.p.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "memory_add", arguments: { type: "note", name: "x", description: "y" } } })}\n`);
  await c.waitFor(4);
  const msgs = c.lines().map((l) => JSON.parse(l));
  assert.equal(msgs[0].id, 1);
  assert.equal(msgs[0].result.serverInfo.name, "pace");
  assert.ok(!msgs[1].result.tools.some((t: any) => t.name === "memory_add"));
  assert.match(msgs[2].result.content[0].text, /zebra-7/);
  assert.equal(msgs[3].result.isError, true);
  for (const l of c.lines()) assert.doesNotThrow(() => JSON.parse(l), "stdout에 프로토콜 외 출력");
  c.p.stdin.end();
  assert.equal(await c.exited, 0, "stdin EOF면 종료 코드 0");
});

test("S-7 잘못된 인자·없는 워크스페이스·access 누락은 종료 코드 2", () => {
  const ws = workspace();
  for (const args of [[], ["--workspace", ws], ["--access", "read-only"], ["--workspace", ws, "--access", "admin"], ["--workspace", join(ws, "없는폴더"), "--access", "read-only"], ["--workspace", ws, "--access", "write", "--extra"], ["--workspace", ws, "--access", "read-only", "더"]]) {
    const r = runPace(["mcp", ...args], { home: tempDir() });
    assert.equal(r.status, 2, `${args.join(" ")}: ${r.stderr}`);
    assert.equal(r.stdout, "");
  }
});

test("S-7b 깨진 JSON·알 수 없는 메서드·인자 타입 오류·초과 줄 뒤에도 서버가 계속 동작한다", async () => {
  const ws = workspace();
  const c = child(["--workspace", ws, "--access", "read-only"]);
  const send = (s: string) => c.p.stdin.write(s);
  send("{깨진 json\n");
  send(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "없는/메서드" })}\n`);
  send(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "memory_show", arguments: { slug: 5 } } })}\n`);
  send(`${JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "memory_list", arguments: [] } })}\n`);
  send("[1,2]\n");
  await c.waitFor(5);
  const m = c.lines().map((l) => JSON.parse(l));
  assert.equal(m[0].error.code, -32700);
  assert.equal(m[1].error.code, -32601);
  assert.equal(m[2].result.isError, true);
  assert.equal(m[3].result.isError, true);
  assert.equal(m[4].error.code, -32600);
  // 1MB 초과 줄(개행 포함) → -32600, 이어지는 정상 요청 처리
  send(`${"a".repeat(MAX_LINE_BYTES + 10)}\n`);
  await c.waitFor(6);
  assert.equal(JSON.parse(c.lines()[5]!).error.code, -32600);
  send(`${JSON.stringify({ jsonrpc: "2.0", id: 9, method: "ping" })}\n`);
  await c.waitFor(7);
  assert.equal(JSON.parse(c.lines()[6]!).id, 9);
  c.p.stdin.end();
  assert.equal(await c.exited, 0);
});

test("S-7b 개행 없는 1MB 초과 입력도 버퍼가 상한 안에서 유지되고 뒤따르는 정상 줄이 처리된다", async () => {
  const ws = workspace();
  const server = new PaceMcpServer({ workspace: ws, access: "read-only", env: { PACE_HOME: tempDir() } });
  const input = new PassThrough();
  const output = new PassThrough();
  let out = "";
  output.on("data", (d: Buffer) => { out += d.toString("utf8"); });
  const done = serveStdio(server, input, output, 1000);
  for (let i = 0; i < 50; i++) input.write("x".repeat(500)); // 개행 없이 25,000바이트
  input.write(`\n${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" })}\n`);
  input.end();
  await done;
  const msgs = out.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].error.code, -32600);
  assert.equal(msgs[1].id, 1);
});

test("S-7b 개행 없이 끝난 초과 입력도 EOF에서 오류를 정확히 한 번 응답한다", async () => {
  const server = new PaceMcpServer({ workspace: workspace(), access: "read-only", env: { PACE_HOME: tempDir() } });
  const input = new PassThrough();
  const output = new PassThrough();
  let out = "";
  output.on("data", (d: Buffer) => { out += d.toString("utf8"); });
  const done = serveStdio(server, input, output, 100);
  input.write("x".repeat(500));
  input.end();
  await done;
  const msgs = out.split(String.fromCharCode(10)).filter(Boolean).map((l) => JSON.parse(l));
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].error.code, -32600);
});

test("S-7 부모 폴더 이름만 다른 워크스페이스 인자도 실경로로 고정한다", async () => {
  const ws = workspace();
  mkdirSync(join(ws, "sub"));
  const c = child(["--workspace", join(ws, "sub", ".."), "--access", "read-only"]);
  c.p.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "memory_list", arguments: { workspace: ws } } })}\n`);
  await c.waitFor(1);
  assert.match(JSON.parse(c.lines()[0]!).result.content[0].text, /zebra-7/);
  c.p.stdin.end();
  await c.exited;
});

test("S-7b 출력이 막히면 역압을 기다리고(메모리 증가 방지), 출력이 닫히면 정리하고 끝난다", async () => {
  const ws = workspace();
  const server = new PaceMcpServer({ workspace: ws, access: "read-only", env: { PACE_HOME: tempDir() } });
  // 아주 작은 버퍼의 출력 — 아무도 읽지 않으면 write가 false를 돌려준다
  const input = new PassThrough();
  const output = new PassThrough({ highWaterMark: 16 });
  const done = serveStdio(server, input, output);
  for (let i = 0; i < 50; i++) input.write(`${JSON.stringify({ jsonrpc: "2.0", id: i + 1, method: "ping" })}\n`);
  input.end();
  await new Promise((r) => setTimeout(r, 200));
  let finished = false;
  void done.then(() => { finished = true; });
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(finished, false, "읽는 쪽이 없으면 끝나지 않고 기다린다");
  let out = "";
  output.on("data", (d: Buffer) => { out += d.toString("utf8"); });
  await done;
  assert.equal(out.split("\n").filter(Boolean).length, 50, "읽기 시작하면 응답이 전부 나온다");
  // 출력이 닫히면 서버가 멈춘다
  const input2 = new PassThrough();
  const output2 = new PassThrough();
  const done2 = serveStdio(server, input2, output2);
  output2.destroy();
  input2.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" })}\n`);
  await Promise.race([done2, new Promise((_, rej) => setTimeout(() => rej(new Error("출력이 닫혔는데 끝나지 않는다")), 3000))]);
});

test("S-7b 요청 하나의 이상한 입력(toString이 깨진 객체 이름)이 서버를 멈추지 않고, 한 청크의 많은 줄도 순차 처리한다", async () => {
  const ws = workspace();
  const server = new PaceMcpServer({ workspace: ws, access: "read-only", env: { PACE_HOME: tempDir() } });
  const input = new PassThrough();
  const output = new PassThrough();
  let out = "";
  output.on("data", (d: Buffer) => { out += d.toString("utf8"); });
  const done = serveStdio(server, input, output);
  const lines = [JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: { toString: null } } })];
  for (let i = 0; i < 500; i++) lines.push(JSON.stringify({ jsonrpc: "2.0", id: i + 2, method: "ping" }));
  input.write(lines.join("\n") + "\n"); // 한 청크에 501줄
  input.end();
  await done;
  const msgs = out.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  assert.equal(msgs.length, 501);
  assert.equal(msgs[0].error.code, -32602);
  assert.deepEqual(msgs.slice(1).map((m: any) => m.id), Array.from({ length: 500 }, (_, i) => i + 2), "순서대로 전부 응답");
});
