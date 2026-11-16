import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { today } from "../core/fsutil.ts";
import { findOnPath, isYouTube, normalizeTranscript, parseUrl, readSources, saveSource, ScoutError } from "./source.ts";

/**
 * 브라우저로 유튜브 '스크립트 표시' 패널을 읽는다(D16).
 * 자동화 도구가 직접 띄운 브라우저는 자막 요청이 거절되므로, 일반 브라우저만 쓴다:
 * Orca 내장 브라우저, 또는 임시 프로필로 띄운 일반 Chrome에 agent-browser를 CDP로 연결.
 * 사용자 에이전트 위장·자동화 표시 숨기기·로그인 프로필은 쓰지 않는다.
 */

/** 페이지 안에서 실행하는 고정 스크립트 — 페이지 글을 셸이나 명령에 넣지 않는다. */
export const CLICK_SCRIPT = `(() => { document.querySelector('#expand')?.click(); const b = [...document.querySelectorAll('button')].find((b) => /스크립트 표시|Show transcript/.test(b.innerText || b.getAttribute('aria-label') || '')); b?.click(); return !!b; })()`;
// 스크립트 패널만 읽는다 — 챕터 패널(시간 줄이 있다)을 자막으로 읽지 않게.
export const PANEL_SCRIPT = `(() => { const p = [...document.querySelectorAll('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]')].find((x) => x.getAttribute('visibility') === 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED'); return p ? p.innerText : ''; })()`;

export interface BrowserDriver {
  name: string;
  open(url: string): void;
  eval(expression: string): string;
  close(): void;
}

type Command = string | { command: string; args: string[] };
function commandParts(bin: Command): { command: string; args: string[] } {
  return typeof bin === "string" ? { command: bin, args: [] } : bin;
}

function run(bin: Command, args: string[], timeoutMs = 60_000): string {
  const parts = commandParts(bin);
  const out = spawnSync(parts.command, [...parts.args, ...args], { encoding: "utf8", timeout: timeoutMs });
  if (out.error) throw new ScoutError(`${parts.command} 실행 실패: ${out.error.message}`);
  if (out.status !== 0) throw new ScoutError(`${parts.command} ${args[0]} 실패: ${(out.stderr || out.stdout).trim().split("\n").at(-1) ?? ""}`);
  return out.stdout;
}

/**
 * Orca 실행 파일 — orca-cli 규칙 순서: ORCA_CLI_COMMAND → 개발 체크아웃이면 orca-dev → orca.
 * Orca 터미널 밖에서는 기본으로 쓰지 않는다(리눅스의 맨 `orca`는 화면 낭독기다).
 */
export function orcaBin(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.ORCA_CLI_COMMAND) return env.ORCA_CLI_COMMAND;
  if (!env.ORCA_TERMINAL_HANDLE) return null;
  return env.ORCA_DEV_REPO_ROOT ? "orca-dev" : "orca";
}

export function orcaDriver(bin: Command): BrowserDriver {
  let page = "";
  const json = (args: string[]) => {
    const text = run(bin, [...args, "--json"]);
    let data: { ok?: boolean; result?: Record<string, unknown>; error?: { message?: string } };
    try {
      data = JSON.parse(text) as typeof data;
    } catch {
      throw new ScoutError(`orca 응답을 읽지 못했다: ${args[0]}`);
    }
    if (data.ok === false) throw new ScoutError(`orca ${args[0]} 실패: ${data.error?.message ?? ""}`);
    return data.result ?? {};
  };
  return {
    name: "orca",
    open(url) {
      if (page) {
        json(["goto", "--page", page, "--url", url]);
      } else {
        page = String(json(["tab", "create", "--url", url]).browserPageId ?? "");
        if (!page) throw new ScoutError("orca 탭을 열지 못했다");
      }
      json(["wait", "--page", page, "--load", "networkidle"]);
    },
    eval(expression) {
      const result = json(["eval", "--page", page, "--expression", expression]);
      return String(result.result ?? "");
    },
    close() {
      if (page) {
        try {
          json(["tab", "close", "--page", page]);
        } catch {
          // 이미 닫혔다
        }
      }
    },
  };
}

/** `--cdp`는 이 기기의 포트 번호나 ws://127.0.0.1 주소만 — 옵션처럼 읽힐 값·다른 기기는 받지 않는다. */
export function checkCdp(value: string): string {
  if (/^\d{2,5}$/.test(value) || /^ws:\/\/(127\.0\.0\.1|localhost):\d{2,5}\//.test(value)) return value;
  throw new ScoutError(`--cdp는 포트 번호나 ws://127.0.0.1:<포트>/… 주소: ${value}`);
}

/**
 * agent-browser를 CDP로 일반 Chrome에 붙인다. cdp를 주지 않으면 빈 임시 프로필로 Chrome을 띄운다.
 * 연결에 성공하기 전에는 open하지 않는다 — 연결되지 않은 agent-browser는 자기 자동화 브라우저를 띄우기 때문이다(D16 금지).
 */
export function agentBrowserDriver(bin: Command, options: { cdp?: string; chrome?: Command; waitMs?: number }): BrowserDriver {
  const session = `pace-scout-${process.pid}`;
  let chrome: ChildProcess | null = null;
  let profile = "";
  let connected = false;
  const ab = (args: string[]) => run(bin, ["--session", session, ...args]);
  const connect = () => {
    let endpoint = options.cdp ? checkCdp(options.cdp) : "";
    if (!endpoint) {
      if (!chrome) {
        const exe = options.chrome ?? findChrome();
        const parts = exe ? commandParts(exe) : null;
        if (!parts || !existsSync(parts.command)) throw new ScoutError(`일반 Chrome을 찾지 못했다${parts ? `: ${parts.command}` : ""} — --chrome <경로>`);
        profile = mkdtempSync(join(tmpdir(), "pace-scout-chrome-"));
        // 빈 임시 프로필의 일반 Chrome — 로그인·사용자 프로필·위장 옵션을 쓰지 않는다. 포트는 Chrome이 고른다(경합 없음).
        chrome = spawn(parts.command, [...parts.args, "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: "ignore" });
        chrome.on("error", () => {}); // 실행 실패는 아래 대기에서 알린다
      }
      endpoint = String(waitForCdp(profile));
    }
    ab(["connect", endpoint]);
    connected = true;
  };
  return {
    name: "agent-browser",
    open(url) {
      if (!connected) connect();
      ab(["open", url]);
      ab(["wait", String(options.waitMs ?? 4000)]);
    },
    eval(expression) {
      const out = ab(["eval", expression]).trim();
      try {
        const value = JSON.parse(out) as unknown;
        return typeof value === "string" ? value : String(value);
      } catch {
        return out;
      }
    },
    close() {
      try {
        if (connected) ab(["close"]);
      } catch {
        // 이미 닫혔다
      }
      if (chrome) stopProcess(chrome);
      if (profile) {
        try {
          rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
        } catch {
          // 남은 임시 폴더는 OS가 치운다 — 정리 실패가 결과를 덮지 않게 한다
        }
      }
    },
  };
}

/** 끝나기를 기다린다(최대 5초), 안 끝나면 강제로. */
function stopProcess(child: ChildProcess): void {
  if (child.exitCode !== null || child.pid === undefined) return;
  child.kill();
  for (let i = 0; i < 25; i++) {
    if (!running(child.pid)) return;
    sleep(200);
  }
  child.kill("SIGKILL");
}

/** 살아 있는가 — 동기 흐름에서는 끝난 자식이 아직 거둬지지 않아(좀비) kill(0)이 성공하므로 상태도 본다. */
function running(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  if (process.platform === "win32") return true;
  const stat = spawnSync("ps", ["-o", "stat=", "-p", String(pid)], { encoding: "utf8" });
  return stat.status === 0 && !stat.stdout.trim().startsWith("Z");
}

export function findChrome(platform = process.platform): string | null {
  const mac = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (platform === "darwin" && existsSync(mac)) return mac;
  if (platform === "win32") {
    for (const base of [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA]) {
      if (!base) continue;
      const chrome = join(base, "Google", "Chrome", "Application", "chrome.exe");
      if (existsSync(chrome)) return chrome;
    }
  }
  for (const name of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    const found = findOnPath(name);
    if (found) return found;
  }
  return null;
}

/** Chrome이 프로필에 적는 DevToolsActivePort에서 포트를 읽고, 응답할 때까지 기다린다(최대 10초). */
function waitForCdp(profile: string): number {
  const file = join(profile, "DevToolsActivePort");
  for (let i = 0; i < 40; i++) {
    const port = existsSync(file) ? Number(readFileSync(file, "utf8").split("\n")[0]) : 0;
    if (port > 0 && spawnSync(process.execPath, ["-e", `fetch('http://127.0.0.1:${port}/json/version').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))`]).status === 0) return port;
    sleep(250);
  }
  throw new ScoutError("Chrome 디버깅 포트가 열리지 않았다");
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** 패널 글 머리(탭 이름)를 뗀다. */
export function cleanPanel(text: string): string {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  while (lines.length > 0 && /^(동영상 정보|챕터|스크립트|In this video|Chapters|Transcript|)$/.test(lines[0]!)) lines.shift();
  return lines.join("\n");
}

/** 시간 줄이 둘 이상이고 직전 폴링과 같으면(다 그려짐) 받은 것으로 본다 — 짧은 영상도 된다. */
const stamps = (text: string) => text.split(/\r?\n/).filter((l) => /^\s*(\d+:)?\d{1,2}:\d{2}\s*$/.test(l)).length;

/** 한 수단으로 최대 tries번 — 패널이 비면 페이지를 다시 연다. 실패한 시도 이유를 모아 던진다. */
export function readTranscript(driver: BrowserDriver, url: string, options: { tries?: number; pollMs?: number; polls?: number } = {}): string {
  const tries = options.tries ?? 3;
  const reasons: string[] = [];
  try {
    for (let attempt = 1; attempt <= tries; attempt++) {
      try {
        driver.open(url);
        // 첫 방문 때 유튜브가 페이지를 한 번 다시 그린다(themeRefresh) — 버튼이 나타날 때까지 기다렸다 누른다.
        let clicked = false;
        for (let i = 0; i < (options.polls ?? 30) && !clicked; i++) {
          clicked = driver.eval(CLICK_SCRIPT) === "true";
          if (!clicked) sleep(options.pollMs ?? 1000);
        }
        if (!clicked) {
          reasons.push(`${attempt}차: '스크립트 표시' 버튼 없음`);
          continue;
        }
        let previous = "";
        for (let i = 0; i < (options.polls ?? 30); i++) {
          const text = driver.eval(PANEL_SCRIPT);
          if (stamps(text) >= 2 && text === previous) return cleanPanel(text);
          previous = text;
          // 클릭 직후 페이지가 다시 그려졌으면 버튼을 다시 누른다(패널이 닫혀 있다).
          if (i > 0 && i % 5 === 0 && text === "") driver.eval(CLICK_SCRIPT);
          sleep(options.pollMs ?? 1000);
        }
        reasons.push(`${attempt}차: 패널이 비어 있음`);
      } catch (error) {
        if (!(error instanceof ScoutError)) throw error;
        reasons.push(`${attempt}차: ${error.message}`);
      }
    }
  } finally {
    driver.close();
  }
  throw new ScoutError(`${driver.name}로 ${tries}번 시도했지만 스크립트를 받지 못했다(${reasons.join(" / ")})`);
}

export interface TranscriptOptions {
  via?: "auto" | "orca" | "agent-browser";
  cdp?: string;
  chrome?: Command;
  env?: NodeJS.ProcessEnv;
  orcaCommand?: Command;
  agentBrowser?: Command | null;
  tries?: number;
  pollMs?: number;
  polls?: number;
  waitMs?: number;
}

/**
 * 실행 폴더의 영상 출처 S#의 스크립트를 브라우저로 읽어 method browser로 바꿔 저장한다.
 * auto: Orca 안이면 Orca 브라우저 → agent-browser + 일반 Chrome. 한 수단이 세 번 실패하면 알리고 다음 수단으로.
 */
export function transcriptFromBrowser(run: string, id: string, options: TranscriptOptions = {}, note: (message: string) => void = () => {}): string {
  const source = readSources(run).find((s) => s.meta.id === id);
  if (!source) throw new ScoutError(`출처가 없다: ${id}`);
  const url = parseUrl(source.meta.url);
  if (!isYouTube(url)) throw new ScoutError(`${id}는 유튜브 영상이 아니다: ${url.href}`);
  const via = options.via ?? "auto";
  if (options.cdp) checkCdp(options.cdp); // 잘못된 값은 시도 전에 바로 거부한다
  const drivers: (() => BrowserDriver)[] = [];
  const orca = options.orcaCommand ?? orcaBin(options.env);
  if (via === "orca" || (via === "auto" && orca)) {
    if (!orca) throw new ScoutError("Orca 안이 아니다 — ORCA_CLI_COMMAND를 주거나 --via agent-browser");
    drivers.push(() => orcaDriver(orca));
  }
  const agentBrowser = options.agentBrowser === undefined ? findOnPath("agent-browser") : options.agentBrowser;
  if (via === "agent-browser" || (via === "auto" && agentBrowser)) {
    if (!agentBrowser) throw new ScoutError("agent-browser가 없다 — 설치하거나 LLM 도구의 브라우저(Playwright MCP 등)로 읽어 scout add --method browser");
    drivers.push(() => agentBrowserDriver(agentBrowser, options));
  }
  if (drivers.length === 0) throw new ScoutError("쓸 수 있는 브라우저가 없다(Orca 밖·agent-browser 없음) — LLM 도구의 브라우저로 읽어 scout add --method browser, 안 되면 붙여넣기");
  const failures: string[] = [];
  for (const make of drivers) {
    let text: string;
    try {
      text = readTranscript(make(), url.href, options);
    } catch (error) {
      if (!(error instanceof ScoutError)) throw error;
      failures.push(error.message);
      note(error.message);
      continue;
    }
    // 저장 실패는 브라우저 실패가 아니다 — 다음 수단으로 넘기지 않고 그대로 알린다.
    const { id: _id, ...meta } = source.meta;
    return saveSource(run, { ...meta, accessed: today(), method: "browser" }, normalizeTranscript(text), id);
  }
  throw new ScoutError(`브라우저로 스크립트를 받지 못했다(${failures.length}개 수단 — 이유는 위에) — LLM 도구의 브라우저로 읽거나 사용자에게 붙여넣기를 요청한다(scout add --replace ${id} --method browser|pasted)`);
}

