import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { resolveWindowsCommand } from "../agent/win-command.ts";

// 외부 명령 출력 해독과 실행자 (P035 T06). Windows 콘솔 도구(reg·schtasks 등)는 OEM 코드 페이지(한국어 949)로 출력해 UTF-8로 읽으면 깨진다.

export interface RunResult {
  /** 종료 코드. 실행하지 못했거나 신호·시간 초과면 null */
  status: number | null;
  stdout: string;
  stderr: string;
  /** 명령을 찾지 못했거나 안전하게 해석하지 못함 */
  notFound?: boolean;
  timedOut?: boolean;
}

export interface RunOptions {
  timeoutMs?: number;
  /** 표준 입출력을 사람 터미널에 그대로 잇는다(공식 로그인 등) — 출력은 수집하지 않는다 */
  inherit?: boolean;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
}

/** 외부 명령 실행자 — 시험은 가짜를 주입한다. 이 모듈의 기본 구현만 실제 프로세스를 만든다 */
export type CommandRunner = (command: string, args: string[], options?: RunOptions) => RunResult;

const CODE_PAGE_LABELS: Record<number, string> = {
  // 437(미국 OEM)은 TextDecoder 별칭이 없어 windows-1252로 대체한다(영문 오류 문장은 ASCII라 같다)
  437: "windows-1252", 949: "euc-kr", 932: "shift_jis", 936: "gbk", 950: "big5", 1250: "windows-1250", 1251: "windows-1251", 1252: "windows-1252", 65001: "utf-8",
};

/** UTF-8로 해독하되 올바르지 않은 바이트열이면 코드 페이지로 다시 해독한다. 코드 페이지를 모르면 UTF-8 대체 문자로 */
export function decodeConsoleOutput(bytes: Uint8Array, codePage?: number): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { /* UTF-8이 아니다 */ }
  const label = codePage === undefined ? undefined : CODE_PAGE_LABELS[codePage];
  if (label) {
    try { return new TextDecoder(label).decode(bytes); } catch { /* 런타임에 해당 인코딩이 없다 */ }
  }
  return new TextDecoder("utf-8").decode(bytes);
}

let cachedCodePage: number | null | undefined;

/** Windows 콘솔의 활성 코드 페이지(chcp). 못 알아내면 null */
export function consoleCodePage(): number | null {
  if (process.platform !== "win32") return null;
  if (cachedCodePage !== undefined) return cachedCodePage;
  try {
    const result = spawnSync(join(process.env.SystemRoot ?? "C:\Windows", "System32", "chcp.com"), [], { windowsHide: true, timeout: 5000 });
    const match = /(\d{3,5})\s*$/m.exec(new TextDecoder("latin1").decode(result.stdout ?? new Uint8Array()));
    cachedCodePage = match ? Number(match[1]) : null;
  } catch { cachedCodePage = null; }
  return cachedCodePage;
}

const WINDOWS_SYSTEM_TOOLS = new Set(["reg", "schtasks"]);

/** 기본 실행자: 셸을 거치지 않는다. Windows에서는 시스템 도구는 System32의 exe, 그 밖은 PATH의 exe·표준 npm shim만 해석한다 */
export const runCommand: CommandRunner = (command, args, options = {}) => {
  let target = { command, args };
  const env = options.env ?? process.env;
  if (process.platform === "win32") {
    if (WINDOWS_SYSTEM_TOOLS.has(command)) target = { command: join(env.SystemRoot ?? "C:\Windows", "System32", `${command}.exe`), args };
    else {
      try { target = resolveWindowsCommand(command, args, env); }
      catch (error) { return { status: null, stdout: "", stderr: (error as Error).message, notFound: true }; }
    }
  }
  const result = spawnSync(target.command, target.args, { windowsHide: true, env, cwd: options.cwd, timeout: options.timeoutMs ?? 30_000, stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"] });
  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;
    return { status: null, stdout: "", stderr: result.error.message, notFound: code === "ENOENT", timedOut: code === "ETIMEDOUT" };
  }
  const cp = consoleCodePage() ?? undefined;
  return { status: result.status, stdout: result.stdout ? decodeConsoleOutput(result.stdout, cp) : "", stderr: result.stderr ? decodeConsoleOutput(result.stderr, cp) : "" };
};
