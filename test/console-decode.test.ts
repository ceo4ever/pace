import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { decodeConsoleOutput, runCommand } from "../src/core/console-decode.ts";

const CP949 = Buffer.from("bed7bcbcbdbab0a120b0c5baceb5c7befabdc0b4cfb4d92e", "hex"); // "액세스가 거부되었습니다." (cp949)

test("S-1 cp949 바이트는 코드 페이지 949로 해독하면 한글이 깨지지 않는다", () => {
  assert.equal(decodeConsoleOutput(CP949, 949), "액세스가 거부되었습니다.");
  // UTF-8은 코드 페이지와 상관없이 그대로
  assert.equal(decodeConsoleOutput(Buffer.from("액세스가 거부되었습니다.", "utf8"), 949), "액세스가 거부되었습니다.");
  assert.equal(decodeConsoleOutput(Buffer.from("plain ascii"), undefined), "plain ascii");
});

test("S-1 코드 페이지를 모르거나 지원하지 않으면 죽지 않고 대체 문자로 해독한다", () => {
  const unknown = decodeConsoleOutput(CP949, undefined);
  assert.ok(unknown.includes("�"));
  assert.doesNotThrow(() => decodeConsoleOutput(CP949, 12345));
  assert.doesNotThrow(() => decodeConsoleOutput(new Uint8Array([0xff, 0xfe, 0x00]), 949));
  assert.equal(decodeConsoleOutput(new Uint8Array(), 949), "");
});

test("S-1 다른 코드 페이지(932·936·1252)도 해독한다", () => {
  assert.equal(decodeConsoleOutput(Buffer.from("e9", "hex"), 1252), "é");
  assert.equal(decodeConsoleOutput(Buffer.from("82a0", "hex"), 932), "あ");
  assert.equal(decodeConsoleOutput(Buffer.from("c4e3", "hex"), 936), "你");
});

test("기본 실행자 runCommand는 자식의 UTF-8 한글 출력과 종료 코드를 그대로 돌려준다", () => {
  const r = runCommand(process.execPath, ["-e", "process.stdout.write('한글 출력'); process.stderr.write('오류 문구'); process.exit(3)"], { timeoutMs: 20_000 });
  assert.equal(r.status, 3);
  assert.equal(r.stdout, "한글 출력");
  assert.equal(r.stderr, "오류 문구");
});

test("기본 실행자는 없는 명령을 notFound로 알리고 시간 초과를 표시한다", () => {
  const missing = runCommand("pace-no-such-command-xyz", []);
  assert.equal(missing.status, null);
  assert.equal(missing.notFound, true);
  const slow = runCommand(process.execPath, ["-e", "setTimeout(() => {}, 30000)"], { timeoutMs: 300 });
  assert.equal(slow.status, null);
  assert.equal(slow.timedOut, true);
  assert.ok(spawnSync);
});
