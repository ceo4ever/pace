import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveSource, readSources } from "../src/scout/source.ts";
import { checkCdp, cleanPanel, orcaBin, PANEL_SCRIPT as PANEL_SCRIPT_TEXT, readTranscript, transcriptFromBrowser, type BrowserDriver } from "../src/scout/transcript.ts";
import { runPace, tempDir } from "./helpers.ts";

const PANEL = "동영상 정보\n챕터\n스크립트\nIntro: AI Stack\n0:00\n첫 문장 " + "가".repeat(600) + "\n3:41\n학부모 62%\n";
type FakeCommand = string | { command: string; args: string[] };
const fakeCommand = (bin: string): FakeCommand => process.platform === "win32" ? { command: process.execPath, args: [bin] } : bin;
const orcaOptions = (bin: FakeCommand, env: NodeJS.ProcessEnv = {}) => typeof bin === "string" ? { env: { ...env, ORCA_CLI_COMMAND: bin } } : { env, orcaCommand: bin };

function runWithVideo(home = tempDir()): string {
  const dir = runPace(["scout", "new", "자막", "--out", tempDir()], { home }).stdout.trim();
  saveSource(dir, { url: "https://www.youtube.com/watch?v=a", title: "영상", author: "채널", published: "2026-05-14", accessed: "2026-10-28", kind: "video", method: "description" }, "설명란");
  saveSource(dir, { url: "https://example.com/a", title: "기사", author: "", published: "2026-05-14", accessed: "2026-10-28", kind: "article", method: "fetch" }, "본문");
  return dir;
}

/** 가짜 orca: 받은 인자를 로그에 남기고, eval은 식에 따라 클릭 결과·패널 글(JSON 파일)을 돌려준다. */
function fakeOrca(panelJson: string, clickResult = "true"): { bin: FakeCommand; log: string } {
  const dir = tempDir();
  const bin = join(dir, "orca");
  const log = join(dir, "log");
  writeFileSync(join(dir, "panel.json"), panelJson);
  writeFileSync(bin, `#!/usr/bin/env node
const fs=require("fs"), a=process.argv.slice(2); fs.appendFileSync(${JSON.stringify(log)},a.join(" ")+"\\n");
if(a[0]==="tab"&&a[1]==="create") console.log(JSON.stringify({ok:true,result:{browserPageId:"p1"}}));
else if(a[0]==="eval") console.log(a.join(" ").includes("ENGAGEMENT_PANEL") ? fs.readFileSync(${JSON.stringify(join(dir, "panel.json"))},"utf8") : JSON.stringify({ok:true,result:{result:${JSON.stringify(clickResult)}}}));
else if((a[0]==="tab" && a[1]==="close") || a[0]==="wait" || a[0]==="goto") console.log(JSON.stringify({ok:true,result:{}}));
else console.log(JSON.stringify({ok:false,error:{message:"unknown"}}));`);
  chmodSync(bin, 0o755);
  return { bin: fakeCommand(bin), log };
}

test("cleanPanel·orcaBin·checkCdp — 탭 이름 떼기, Orca 터미널 안에서만(규칙 순서), --cdp는 이 기기 포트만", () => {
  assert.equal(cleanPanel("동영상 정보\n챕터\n스크립트\nIntro\n0:00\n글"), "Intro\n0:00\n글");
  assert.equal(orcaBin({}), null, "Orca 밖에서는 맨 orca를 부르지 않는다(리눅스 화면 낭독기)");
  assert.equal(orcaBin({ ORCA_TERMINAL_HANDLE: "t" }), "orca");
  assert.equal(orcaBin({ ORCA_TERMINAL_HANDLE: "t", ORCA_DEV_REPO_ROOT: "/r" }), "orca-dev");
  assert.equal(orcaBin({ ORCA_CLI_COMMAND: "/x/orca", ORCA_TERMINAL_HANDLE: "t" }), "/x/orca");
  assert.equal(checkCdp("9222"), "9222");
  assert.equal(checkCdp("ws://127.0.0.1:9222/devtools/browser/x"), "ws://127.0.0.1:9222/devtools/browser/x");
  for (const bad of ["--profile", "ws://10.0.0.1:9222/x", "http://example.com:9222", "1"]) assert.throws(() => checkCdp(bad), /--cdp는/, bad);
});

test("readTranscript — 버튼이 늦게 나타나도 기다렸다 누르고, 세 번 실패하면 이유와 함께 멈추며 늘 닫는다", () => {
  const calls: string[] = [];
  let clickAfter = 2;
  const late: BrowserDriver = {
    name: "fake",
    open: () => calls.push("open"),
    eval: (e) => (e.includes("ENGAGEMENT_PANEL") ? PANEL : clickAfter-- > 0 ? "false" : "true"),
    close: () => calls.push("close"),
  };
  assert.match(readTranscript(late, "u", { pollMs: 0 }), /^Intro: AI Stack\n0:00\n첫 문장/);
  assert.deepEqual(calls, ["open", "close"]);

  const opened: string[] = [];
  const empty: BrowserDriver = { name: "fake", open: () => opened.push("open"), eval: (e) => (e.includes("ENGAGEMENT_PANEL") ? "" : "true"), close: () => opened.push("close") };
  assert.throws(() => readTranscript(empty, "u", { pollMs: 0, polls: 3 }), /fake로 3번 시도했지만 스크립트를 받지 못했다\(1차: 패널이 비어 있음 \/ 2차: 패널이 비어 있음 \/ 3차: 패널이 비어 있음\)/);
  assert.deepEqual(opened, ["open", "open", "open", "close"], "세 번 다시 열고 마지막에 한 번 닫는다");
});

test("transcriptFromBrowser — Orca 경로로 저장(method browser, [mm:ss]), 실패하면 다음 수단·붙여넣기 안내", () => {
  const dir = runWithVideo();
  const { bin, log } = fakeOrca(JSON.stringify({ ok: true, result: { result: PANEL } }));
  const path = transcriptFromBrowser(dir, "S1", { ...orcaOptions(bin), agentBrowser: null, pollMs: 0 });
  assert.equal(path, join(dir, "sources/S1.md"));
  const s1 = readSources(dir)[0]!;
  assert.equal(s1.meta.method, "browser");
  assert.match(s1.body, /^Intro: AI Stack\n\[00:00\] 첫 문장 가+\n\[03:41\] 학부모 62%$/);
  assert.deepEqual([s1.meta.title, s1.meta.url], ["영상", "https://www.youtube.com/watch?v=a"]);
  const calls = readFileSync(log, "utf8");
  assert.match(calls, /^tab create --url https:\/\/www\.youtube\.com\/watch\?v=a --json$/m);
  assert.match(calls, /^tab close --page p1 --json$/m, "탭을 닫는다");

  const noButton = fakeOrca("{}", "false");
  const notes: string[] = [];
  assert.throws(
    () => transcriptFromBrowser(dir, "S1", { ...orcaOptions(noButton.bin), agentBrowser: null, pollMs: 0, polls: 2 }, (m) => notes.push(m)),
    /브라우저로 스크립트를 받지 못했다\(1개 수단 — 이유는 위에\) — LLM 도구의 브라우저로 읽거나 사용자에게 붙여넣기를 요청한다\(scout add --replace S1 --method browser\|pasted\)/,
  );
  assert.match(notes[0]!, /orca로 3번 시도했지만.*'스크립트 표시' 버튼 없음/);
  assert.equal(readSources(dir)[0]!.body, s1.body, "실패하면 저장된 출처를 바꾸지 않는다");

  assert.throws(() => transcriptFromBrowser(dir, "S2", { ...orcaOptions(bin) }), /S2는 유튜브 영상이 아니다/);
  assert.throws(() => transcriptFromBrowser(dir, "S9", {}), /출처가 없다: S9/);
  assert.throws(() => transcriptFromBrowser(dir, "S1", { env: {}, agentBrowser: null }), /쓸 수 있는 브라우저가 없다/);
  assert.throws(() => transcriptFromBrowser(dir, "S1", { ...orcaOptions(bin), cdp: "--x" }), /--cdp는/, "잘못된 --cdp는 시도 전에 거부");
  assert.equal(readFileSync(log, "utf8").split("\n").filter((l) => l.startsWith("tab create")).length, 1, "거부할 때는 Orca도 부르지 않는다");
  assert.throws(() => transcriptFromBrowser(dir, "S1", { via: "orca", env: {} }), /Orca 안이 아니다/);
  assert.throws(() => transcriptFromBrowser(dir, "S1", { via: "agent-browser", env: {}, agentBrowser: null }), /agent-browser가 없다/);
});

test("transcriptFromBrowser — agent-browser는 --cdp로 붙고 같은 세션으로 열기·eval·닫기", () => {
  const dir = runWithVideo();
  const { bin, log } = fakeAgentBrowser();
  transcriptFromBrowser(dir, "S1", { via: "agent-browser", env: {}, agentBrowser: bin, cdp: "9222", pollMs: 0, waitMs: 0 });
  assert.equal(readSources(dir)[0]!.meta.method, "browser");
  const calls = readFileSync(log, "utf8").trim().split("\n");
  const session = calls[0]!.split(" ").slice(0, 2).join(" ");
  assert.match(session, /^--session pace-scout-\d+$/);
  assert.ok(calls.every((c) => c.startsWith(session)), "모든 호출이 같은 세션");
  assert.deepEqual(calls.map((c) => c.split(" ")[2]), ["connect", "open", "wait", "eval", "eval", "eval", "close"]);
  assert.ok(!calls.some((c) => /user-agent|AutomationControlled|--profile|auto-connect/.test(c)), "위장·로그인 프로필 옵션을 쓰지 않는다");
});

test("CLI scout transcript — --via 검사", () => {
  const home = tempDir();
  const dir = runWithVideo(home);
  assert.equal(runPace(["scout", "transcript", dir, "S1", "--via", "chrome"], { home }).status, 2);
});

/** 가짜 agent-browser: 인자를 기록하고, connect 실패 여부·패널 글을 흉내 낸다. */
function fakeAgentBrowser(opts: { failConnect?: boolean } = {}): { bin: FakeCommand; log: string } {
  const tmp = tempDir();
  const bin = join(tmp, "agent-browser");
  const log = join(tmp, "log");
  writeFileSync(join(tmp, "panel.txt"), JSON.stringify(PANEL));
  writeFileSync(bin, `#!/usr/bin/env node
const fs=require("fs"), a=process.argv.slice(2); fs.appendFileSync(${JSON.stringify(log)},a.join(" ")+"\\n");
if(a[2]==="connect" && ${Boolean(opts.failConnect)}) { console.error("connect refused"); process.exit(1); }
if(a[2]==="eval") console.log(a.join(" ").includes("ENGAGEMENT_PANEL") ? fs.readFileSync(${JSON.stringify(join(tmp, "panel.txt"))},"utf8") : "true");
else console.log("✓ Done");`);
  chmodSync(bin, 0o755);
  return { bin: fakeCommand(bin), log };
}

/** 가짜 Chrome: 인자·pid를 남기고, --user-data-dir에 DevToolsActivePort를 적고 /json/version에 답한다. */
function fakeChrome(): { bin: FakeCommand; args: string; pid: string } {
  const tmp = tempDir();
  const bin = join(tmp, "chrome");
  const args = join(tmp, "args.json");
  const pid = join(tmp, "pid");
  writeFileSync(bin, `#!${process.execPath}
const fs = require("fs"), http = require("http"), path = require("path");
fs.writeFileSync(${JSON.stringify(args)}, JSON.stringify(process.argv.slice(2)));
fs.writeFileSync(${JSON.stringify(pid)}, String(process.pid));
const dir = process.argv.find((a) => a.startsWith("--user-data-dir=")).slice(16);
const server = http.createServer((req, res) => res.end("{}")).listen(0, "127.0.0.1", () => fs.writeFileSync(path.join(dir, "DevToolsActivePort"), server.address().port + "\\n/devtools/browser/x\\n"));
`);
  chmodSync(bin, 0o755);
  return { bin: fakeCommand(bin), args, pid };
}

/** 끝난 자식은 이벤트 루프가 돌아야 거둬지므로 잠깐 기다린 뒤 본다. */
async function alive(pid: number): Promise<boolean> {
  await new Promise((r) => setTimeout(r, 300));
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test("agent-browser + 가짜 Chrome — 빈 임시 프로필로 띄우고(위장 옵션 없음) 포트로 연결, 끝나면 Chrome 종료·프로필 삭제", async () => {
  const dir = runWithVideo();
  const ab = fakeAgentBrowser();
  const chrome = fakeChrome();
  const before = readdirSync(tmpdir()).filter((n) => n.startsWith("pace-scout-chrome-")).length;
  transcriptFromBrowser(dir, "S1", { via: "agent-browser", env: {}, agentBrowser: ab.bin, chrome: chrome.bin, pollMs: 0, waitMs: 0 });
  const args = JSON.parse(readFileSync(chrome.args, "utf8")) as string[];
  const profile = args.find((a) => a.startsWith("--user-data-dir="))!.slice(16);
  assert.match(profile, /pace-scout-chrome-/);
  assert.ok(args.includes("--remote-debugging-port=0"));
  assert.ok(!args.some((a) => /AutomationControlled|user-agent|profile-directory|enable-automation|headless/.test(a)), args.join(" "));
  const calls = readFileSync(ab.log, "utf8");
  assert.match(calls, /connect \d+\n/, "Chrome이 고른 포트로 연결");
  assert.equal(existsSync(profile), false, "임시 프로필 삭제");
  assert.equal(await alive(Number(readFileSync(chrome.pid, "utf8"))), false, "Chrome 종료");
  assert.equal(readdirSync(tmpdir()).filter((n) => n.startsWith("pace-scout-chrome-")).length, before);
});

test("agent-browser — 연결이 실패하면 open하지 않는다(자기 자동화 브라우저로 넘어가지 않음)", async () => {
  const dir = runWithVideo();
  const ab = fakeAgentBrowser({ failConnect: true });
  const chrome = fakeChrome();
  assert.throws(() => transcriptFromBrowser(dir, "S1", { via: "agent-browser", env: {}, agentBrowser: ab.bin, chrome: chrome.bin, pollMs: 0, waitMs: 0 }), /브라우저로 스크립트를 받지 못했다/);
  const verbs = readFileSync(ab.log, "utf8").trim().split("\n").map((c) => c.split(" ")[2]);
  assert.ok(!verbs.includes("open"), verbs.join(","));
  assert.deepEqual(verbs.filter((v) => v === "connect").length, 3, "시도마다 다시 연결을 시도한다");
  assert.equal(await alive(Number(readFileSync(chrome.pid, "utf8"))), false);
  assert.throws(() => transcriptFromBrowser(dir, "S1", { via: "agent-browser", env: {}, agentBrowser: ab.bin, chrome: "/없는/chrome", pollMs: 0 }), /브라우저로 스크립트를 받지 못했다/);
});

test("auto — Orca가 세 번 실패하면 알리고 agent-browser로 넘어가 저장한다, 한 시도의 명령 오류 뒤 다시 시도한다", () => {
  const dir = runWithVideo();
  const orca = fakeOrca("{}", "false");
  const ab = fakeAgentBrowser();
  const notes: string[] = [];
  transcriptFromBrowser(dir, "S1", { ...orcaOptions(orca.bin, { ORCA_TERMINAL_HANDLE: "t" }), agentBrowser: ab.bin, cdp: "9222", pollMs: 0, polls: 2, waitMs: 0 }, (m) => notes.push(m));
  assert.equal(notes.length, 1);
  assert.match(notes[0]!, /^orca로 3번 시도했지만/);
  assert.ok(existsSync(orca.log) && existsSync(ab.log), "두 수단 모두 실행");
  assert.equal(readSources(dir)[0]!.meta.method, "browser");

  // 첫 wait만 실패하는 Orca — 2차 시도에서 받는다
  const flaky = tempDir();
  const bin = join(flaky, "orca");
  writeFileSync(join(flaky, "panel.json"), JSON.stringify({ ok: true, result: { result: PANEL } }));
  writeFileSync(bin, `#!/usr/bin/env node
const fs=require("fs"), a=process.argv.slice(2), marker=${JSON.stringify(join(flaky, "waited"))};
if(a[0]==="tab" && a[1]==="create") console.log(JSON.stringify({ok:true,result:{browserPageId:"p1"}}));
else if(a[0]==="wait" && !fs.existsSync(marker)) { fs.writeFileSync(marker,""); console.log(JSON.stringify({ok:false,error:{message:"timeout"}})); }
else if(a[0]==="eval") console.log(a.join(" ").includes("ENGAGEMENT_PANEL") ? fs.readFileSync(${JSON.stringify(join(flaky, "panel.json"))},"utf8") : JSON.stringify({ok:true,result:{result:"true"}}));
else console.log(JSON.stringify({ok:true,result:{}}));`);
  chmodSync(bin, 0o755);
  const again = runWithVideo();
  transcriptFromBrowser(again, "S1", { ...orcaOptions(fakeCommand(bin)), agentBrowser: null, pollMs: 0 });
  assert.equal(readSources(again)[0]!.meta.method, "browser");
});

test("패널 판정 — 시간 줄이 둘 이상이고 다 그려졌을 때(직전과 같을 때)만, 짧은 영상도", () => {
  let n = 0;
  const growing: BrowserDriver = { name: "g", open: () => {}, eval: (e) => (e.includes("ENGAGEMENT_PANEL") ? ["0:00\n짧", "0:00\n짧은\n0:03\n영상", "0:00\n짧은\n0:03\n영상"][Math.min(n++, 2)]! : "true"), close: () => {} };
  assert.equal(readTranscript(growing, "u", { pollMs: 0 }), "0:00\n짧은\n0:03\n영상");
  assert.match(PANEL_SCRIPT_TEXT, /engagement-panel-searchable-transcript/, "스크립트 패널만 읽는다");
});
