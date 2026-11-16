import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { type CommandRunner } from "../core/console-decode.ts";

// 로그온 자동 실행 등록 (P035 T06, BR06). 관리자 권한이 필요 없는 사용자 단위 방식만 쓴다.
//  - Windows: HKCU\...\Run 값 + 콘솔 창 없는 VBS 런처(wscript). 작업 스케줄러 ONLOGON은 일반 권한에서 액세스 거부라 쓰지 않는다.
//  - macOS: 사용자 launchd(LaunchAgents plist).
// 외부 명령은 주입한 실행자(CommandRunner)로만 부른다 — 시험은 가짜 실행자를 쓰고 실제 레지스트리를 건드리지 않는다.

export const RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
export const RUN_VALUE = "PACE Daemon";
export const LEGACY_TASK_NAME = "PACE Daemon";
export const LAUNCHD_LABEL = "io.pace.daemon";

export interface AutostartEnv {
  platform: NodeJS.Platform;
  runner: CommandRunner;
  /** PACE 데이터 폴더(PACE_HOME) */
  home: string;
  /** PACE_HOME 환경값이 없을 때의 기본 폴더 — home이 이와 다르면 런처가 PACE_HOME을 설정한다 */
  defaultHome: string;
  nodePath: string;
  binPath: string;
  /** macOS LaunchAgents 폴더(시험용으로 바꾼다) */
  launchAgentsDir?: string;
}

export interface PlanStep { description: string; command: string; args: string[] }
export interface PlanFile { path: string; content: string | Buffer }
export interface InstallPlan { platform: NodeJS.Platform; steps: PlanStep[]; files: PlanFile[]; removals: string[]; notes: string[] }

export function defaultDataHome(): string { return join(homedir(), ".pace"); }

export function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function launcherPath(home: string): string { return join(home, "daemon-launch.vbs"); }
export function launcherRunValue(home: string): string { return `wscript.exe //B //Nologo "${launcherPath(home)}"`; }
export function plistPath(env: Pick<AutostartEnv, "launchAgentsDir">): string {
  return join(env.launchAgentsDir ?? join(homedir(), "Library", "LaunchAgents"), `${LAUNCHD_LABEL}.plist`);
}

const vbsString = (s: string) => `"${s.replace(/"/g, '""')}"`;

/** 콘솔 창 없이(창 스타일 0) 기다리지 않고 daemon을 시작하는 VBS. 경로의 큰따옴표는 두 번 쓴다 */
export function buildLauncher(env: Pick<AutostartEnv, "nodePath" | "binPath" | "home" | "defaultHome">): Buffer {
  const command = `"${env.nodePath}" "${env.binPath}" daemon run`;
  const lines = ['Set sh = CreateObject("WScript.Shell")'];
  if (env.home !== env.defaultHome) lines.push(`sh.Environment("Process")("PACE_HOME") = ${vbsString(env.home)}`);
  lines.push(`sh.Run ${vbsString(command)}, 0, False`);
  // wscript는 BOM이 있는 UTF-16LE를 읽는다 — 한글 경로를 ANSI 코드 페이지에 맡기지 않는다
  return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(`${lines.join("\r\n")}\r\n`, "utf16le")]);
}

export function buildPlist(env: Pick<AutostartEnv, "nodePath" | "binPath" | "home" | "defaultHome">): string {
  const environment = env.home !== env.defaultHome ? `<key>EnvironmentVariables</key><dict><key>PACE_HOME</key><string>${xmlEscape(env.home)}</string></dict>\n` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n<key>Label</key><string>${LAUNCHD_LABEL}</string>\n<key>ProgramArguments</key><array><string>${xmlEscape(env.nodePath)}</string><string>${xmlEscape(env.binPath)}</string><string>daemon</string><string>run</string></array>\n${environment}<key>RunAtLoad</key><true/>\n<key>KeepAlive</key><false/>\n</dict></plist>\n`;
}

export function buildAutostartPlan(env: AutostartEnv, uninstall = false): InstallPlan {
  if (env.platform === "win32") {
    const launcher = launcherPath(env.home);
    return uninstall
      ? { platform: env.platform, files: [], removals: [launcher], notes: [], steps: [{ description: `시작 항목 ${RUN_VALUE} 삭제(현재 사용자)`, command: "reg", args: ["delete", RUN_KEY, "/v", RUN_VALUE, "/f"] }] }
      : { platform: env.platform, files: [{ path: launcher, content: buildLauncher(env) }], removals: [], notes: ["관리자 권한은 필요 없다. 다음 로그온부터 콘솔 창 없이 실행된다."], steps: [{ description: `로그온 때 실행하는 시작 항목 ${RUN_VALUE} 등록(현재 사용자, 콘솔 창 없음)`, command: "reg", args: ["add", RUN_KEY, "/v", RUN_VALUE, "/t", "REG_SZ", "/d", launcherRunValue(env.home), "/f"] }] };
  }
  if (env.platform === "darwin") {
    const plist = plistPath(env);
    return uninstall
      ? { platform: env.platform, files: [], removals: [plist], notes: [], steps: [{ description: "launchd 항목 해제", command: "launchctl", args: ["unload", plist] }] }
      : { platform: env.platform, files: [{ path: plist, content: buildPlist(env) }], removals: [], notes: ["다음 로그인부터 실행된다."], steps: [{ description: "launchd 항목 로드(로그인 때 실행)", command: "launchctl", args: ["load", plist] }] };
  }
  return { platform: env.platform, files: [], removals: [], steps: [], notes: [`이 플랫폼(${env.platform})의 자동 실행 등록은 아직 지원하지 않는다 — \`pace daemon run\`을 직접 실행한다.`] };
}

export function describePlan(plan: InstallPlan): string {
  const lines = [`플랫폼: ${plan.platform}`];
  for (const f of plan.files) lines.push(`파일 작성: ${f.path}`);
  for (const r of plan.removals) lines.push(`파일 삭제: ${r}`);
  const shown = (arg: string) => (/[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg);
  for (const s of plan.steps) lines.push(`${s.description}\n  $ ${s.command} ${s.args.map(shown).join(" ")}`);
  if (plan.steps.length === 0 && plan.files.length === 0 && plan.removals.length === 0) lines.push("실행할 단계 없음");
  lines.push(...plan.notes);
  return lines.join("\n");
}

const failText = (r: { stdout: string; stderr: string; notFound?: boolean; timedOut?: boolean }): string =>
  (r.timedOut ? "시간 초과" : r.notFound ? `명령을 찾지 못했다: ${r.stderr}` : (r.stderr || r.stdout)).replace(/\s+/g, " ").trim().slice(0, 300);

/** Windows 시작 항목의 현재 값. 없거나 읽지 못하면 null */
export function registeredRunValue(env: Pick<AutostartEnv, "runner">): string | null {
  const result = env.runner("reg", ["query", RUN_KEY, "/v", RUN_VALUE]);
  if (result.status !== 0) return null;
  const match = /REG_SZ\s+(.+?)\s*$/m.exec(result.stdout);
  return match ? match[1]! : null;
}

/** 등록 값이 이 데이터 폴더의 런처를 그대로 부르는 값인가(경로를 포함하기만 하는 다른 명령은 아니다) */
export function ownsRunValue(home: string, value: string): boolean {
  return value.trim().toLowerCase() === launcherRunValue(home).toLowerCase();
}

const PLIST_HOME = /<key>\s*PACE_HOME\s*<\/key>\s*<string>([^<]*)<\/string>/;
const PLIST_ARGS = /<key>\s*ProgramArguments\s*<\/key>\s*<array>[\s\S]*?<\/array>/;

/** plist가 PACE daemon 등록이고 이 데이터 폴더의 것인가(기본 폴더는 PACE_HOME 환경값이 없다) */
export function plistOwnedBy(env: Pick<AutostartEnv, "home" | "defaultHome">, xml: string): boolean {
  if (!/<key>\s*Label\s*<\/key>\s*<string>io\.pace\.daemon<\/string>/.test(xml)) return false;
  const custom = PLIST_HOME.exec(xml);
  return env.home === env.defaultHome ? custom === null : custom !== null && custom[1] === xmlEscape(env.home);
}

/** 예전 버전이 작업 스케줄러에 남긴 항목이 있는지(Windows) */
export function legacyTaskExists(env: Pick<AutostartEnv, "platform" | "runner">): boolean {
  return env.platform === "win32" && env.runner("schtasks", ["/Query", "/TN", LEGACY_TASK_NAME]).status === 0;
}

export interface ApplyResult { ok: boolean; lines: string[] }

/** 계획을 적용한다. 설치는 (옛 항목 안내) → 파일 → 등록 순, 해제는 등록 → 파일 순이고 이미 없으면 "이미 없음" */
export function applyAutostart(env: AutostartEnv, uninstall: boolean): ApplyResult {
  const plan = buildAutostartPlan(env, uninstall);
  const lines: string[] = [];
  if (plan.steps.length === 0) return { ok: false, lines: plan.notes };
  const step = plan.steps[0]!;
  if (uninstall) {
    let registered = false;
    if (env.platform === "win32") {
      const value = registeredRunValue(env);
      // Run 값 이름은 기기당 하나라 다른 PACE_HOME의 등록일 수 있다 — 이 데이터 폴더의 런처를 가리킬 때만 지운다
      if (value !== null && !ownsRunValue(env.home, value)) return { ok: true, lines: ["시작 항목 PACE Daemon이 다른 데이터 폴더(PACE_HOME)의 등록이라 지우지 않았다"] };
      registered = value !== null;
      if (!registered && existsSync(launcherPath(env.home)) && !readFileSync(launcherPath(env.home)).equals(buildLauncher(env))) return { ok: true, lines: ["등록되지 않은 런처의 소유권을 확인할 수 없어 보존한다"] };
    } else if (existsSync(plistPath(env))) {
      if (!plistOwnedBy(env, readFileSync(plistPath(env), "utf8"))) return { ok: true, lines: ["launchd 항목 io.pace.daemon이 다른 데이터 폴더(PACE_HOME)의 등록이라 지우지 않았다"] };
      registered = true;
    }
    if (registered) {
      const r = env.runner(step.command, step.args);
      // launchd는 로드되지 않은 항목의 unload가 실패한다 — 이미 내려가 있는 것이니 파일 삭제는 계속한다
      if (r.status !== 0 && env.platform === "darwin") lines.push(`launchctl unload가 실패했다(이미 내려가 있을 수 있다): ${failText(r)}`);
      else if (r.status !== 0) return { ok: false, lines: [`실패: ${step.command} — ${failText(r)}`] };
    }
    let removedFile = false;
    for (const path of plan.removals) { if (existsSync(path)) { rmSync(path, { force: true }); removedFile = true; } }
    lines.push(registered || removedFile ? "등록을 해제했다" : "이미 없음 — 해제할 등록이 없다");
    return { ok: true, lines };
  }
  if (env.platform === "win32") {
    const current = registeredRunValue(env);
    if (current !== null && !ownsRunValue(env.home, current)) return { ok: false, lines: ["기존 PACE Daemon 등록이 다른 명령을 가리켜 보존한다"] };
    const launcher = launcherPath(env.home);
    if (existsSync(launcher) && current === null && !readFileSync(launcher).equals(buildLauncher(env))) return { ok: false, lines: ["기존 런처의 소유권을 확인할 수 없어 보존한다"] };
  }
  if (env.platform === "darwin" && existsSync(plistPath(env)) && !plistOwnedBy(env, readFileSync(plistPath(env), "utf8"))) return { ok: false, lines: ["기존 launchd 항목의 소유권을 확인할 수 없어 보존한다"] };
  // 다시 설치할 때 이미 로드된 launchd 항목은 먼저 내린다(load는 이미 로드된 항목에서 실패할 수 있다) — 결과는 무시
  if (env.platform === "darwin" && existsSync(plistPath(env))) env.runner("launchctl", ["unload", plistPath(env)]);
  for (const f of plan.files) { mkdirSync(dirname(f.path), { recursive: true }); writeFileSync(f.path, f.content); }
  const r = env.runner(step.command, step.args);
  if (r.status !== 0) return { ok: false, lines: [...lines, `실패: ${step.command} — ${failText(r)}`] };
  // 계획 출력이 이미 notes를 보였다 — 같은 문구를 두 번 내지 않는다
  lines.push("등록했다");
  return { ok: true, lines };
}

/**
 * 지금 백그라운드로 daemon을 시작한다 — 등록된 시작 항목과 같은 방식(Windows wscript 숨김 VBS, macOS launchctl).
 * 런처·plist 파일이 없으면 등록 없이 파일만 만든다(레지스트리·launchd 등록은 바꾸지 않는다). 시작 요청까지만 하고 기동 확인은 호출자가 한다.
 */
export function startDaemonNow(env: AutostartEnv): ApplyResult {
  if (env.platform === "win32") {
    const launcher = launcherPath(env.home);
    const next = buildLauncher(env);
    if (existsSync(launcher) && !readFileSync(launcher).equals(next)) return { ok: false, lines: ["기존 런처가 예상과 달라 실행하지 않는다"] };
    if (!existsSync(launcher)) { mkdirSync(dirname(launcher), { recursive: true }); writeFileSync(launcher, next); }
    const r = env.runner("wscript.exe", ["//B", "//Nologo", launcher]);
    if (r.status !== 0) return { ok: false, lines: [`실패: wscript — ${failText(r)}`] };
    return { ok: true, lines: ["백그라운드 시작을 요청했다"] };
  }
  if (env.platform === "darwin") {
    const plist = plistPath(env);
    if (existsSync(plist) && !plistOwnedBy(env, readFileSync(plist, "utf8"))) return { ok: false, lines: ["기존 launchd 항목의 소유권을 확인할 수 없어 실행하지 않는다"] };
    if (!existsSync(plist)) { mkdirSync(dirname(plist), { recursive: true }); writeFileSync(plist, buildPlist(env)); }
    let r = env.runner("launchctl", ["load", plist]);
    // 이미 로드된 항목이면 load가 실패할 수 있다 — 바로 시작을 요청한다
    if (r.status !== 0) r = env.runner("launchctl", ["start", LAUNCHD_LABEL]);
    if (r.status !== 0) return { ok: false, lines: [`실패: launchctl — ${failText(r)}`] };
    return { ok: true, lines: ["백그라운드 시작을 요청했다"] };
  }
  return { ok: false, lines: [`이 플랫폼(${env.platform})의 백그라운드 시작은 아직 지원하지 않는다 — \`pace daemon run\`을 직접 실행한다.`] };
}

/** 재설치 뒤 호출: 이 데이터 폴더의 PACE daemon 등록이 이미 있을 때만 실행 경로를 새 설치본으로 바꾼다. 등록이 없으면 아무것도 하지 않는다. 바꿨으면 한 줄 */
export function refreshAutostart(env: AutostartEnv): string | null {
  if (env.platform === "win32") {
    const launcher = launcherPath(env.home);
    if (!existsSync(launcher)) return null; // 등록 안 한 기기·다른 PACE_HOME — 레지스트리도 묻지 않는다
    const value = registeredRunValue(env);
    if (value === null || !ownsRunValue(env.home, value)) return null;
    const next = buildLauncher(env);
    if (readFileSync(launcher).equals(next)) return null;
    writeFileSync(launcher, next);
    return "daemon 자동 실행 등록의 경로를 새 설치본으로 갱신했다(다음 로그온부터 적용)";
  }
  if (env.platform === "darwin") {
    const plist = plistPath(env);
    if (!existsSync(plist)) return null;
    const current = readFileSync(plist, "utf8");
    if (!plistOwnedBy(env, current)) return null;
    // plist 전체를 다시 쓰지 않고 실행 인자만 바꾼다 — 사용자가 더한 launchd 설정은 남긴다
    const block = PLIST_ARGS.exec(buildPlist(env))![0];
    const existing = PLIST_ARGS.exec(current);
    if (!existing || existing[0] === block) return null;
    writeFileSync(plist, current.replace(existing[0], () => block));
    return "daemon 자동 실행 등록의 경로를 새 설치본으로 갱신했다(다음 로그인부터 적용)";
  }
  return null;
}
