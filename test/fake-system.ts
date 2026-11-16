import { decodeConsoleOutput, type CommandRunner, type RunResult } from "../src/core/console-decode.ts";

// 가짜 외부 시스템(레지스트리·작업 스케줄러·claude·codex·npm·launchctl). 시험이 실제 reg·schtasks·npm·CLI를 부르지 않도록
// 모든 외부 명령은 이 실행자만 거친다 — 모르는 명령은 즉시 예외(S-22).

export interface Call { command: string; args: string[]; inherit: boolean }

const ok = (stdout = ""): RunResult => ({ status: 0, stdout, stderr: "" });
const fail = (stderr: string, status = 1): RunResult => ({ status, stdout: "", stderr });

export class FakeSystem {
  calls: Call[] = [];
  /** HKCU Run 값 */
  registry = new Map<string, string>();
  legacyTask = false;
  legacyDeleteDenied = false;
  /** reg add가 액세스 거부로 실패 — 오류는 cp949 바이트를 해독한 문장 */
  denyRegAdd = false;
  claude = { installed: true, loggedIn: true, loginSucceeds: true };
  codex = { installed: true, loggedIn: true, loginSucceeds: true };
  adapter = false;
  adapterVersion = "0.81.1";
  npmFails = false;
  hasNpm = true;
  /** launchctl unload가 로드되지 않은 항목이라 실패 */
  unloadFails = false;
  /** 백그라운드 시작 요청 횟수(wscript·launchctl load/start) */
  started = 0;
  wscriptFails = false;
  loadFails = false;

  readonly runner: CommandRunner = (command, args, options) => {
    this.calls.push({ command, args, inherit: options?.inherit === true });
    const key = `${command} ${args.join(" ")}`;
    switch (command) {
      case "reg": {
        const [verb, , flag, name] = args;
        if (verb === "add") {
          if (this.denyRegAdd) return fail(decodeConsoleOutput(Buffer.from("bed7bcbcbdbab0a120b0c5baceb5c7befabdc0b4cfb4d92e", "hex"), 949));
          this.registry.set(args[3]!, args[args.indexOf("/d") + 1]!);
          return ok("작업을 완료했습니다.");
        }
        if (verb === "query" && flag === "/v") return this.registry.has(name!) ? ok(`\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\r\n    ${name}    REG_SZ    ${this.registry.get(name!)}\r\n\r\n`) : fail("오류: 지정된 레지스트리 키 또는 값을 찾을 수 없습니다.");
        if (verb === "delete") return this.registry.delete(name!) ? ok() : fail("오류: 지정된 레지스트리 키 또는 값을 찾을 수 없습니다.");
        break;
      }
      case "schtasks":
        if (args[0] === "/Query") return this.legacyTask ? ok() : fail("오류: 지정된 파일을 찾을 수 없습니다.");
        if (args[0] === "/Delete") { if (this.legacyDeleteDenied) return fail("오류: 액세스가 거부되었습니다."); this.legacyTask = false; return ok(); }
        break;
      case "wscript.exe": if (this.wscriptFails) return fail("스크립트를 실행할 수 없다"); this.started += 1; return ok();
      case "launchctl": if (args[0] === "load" || args[0] === "start") { if (args[0] === "load" && this.loadFails) return fail("already loaded"); this.started += 1; return ok(); } return args[0] === "unload" && this.unloadFails ? fail("Could not find specified service") : ok();
      case "claude":
        if (!this.claude.installed) return { status: null, stdout: "", stderr: "ENOENT", notFound: true };
        if (args[0] === "--version") return ok("2.1.322 (Claude Code)\n");
        if (args[0] === "auth" && args[1] === "status") return this.claude.loggedIn ? ok(JSON.stringify({ loggedIn: true, authMethod: "claude.ai" })) : { status: 1, stdout: JSON.stringify({ loggedIn: false }), stderr: "" };
        if (args[0] === "auth" && args[1] === "login") { if (this.claude.loginSucceeds) this.claude.loggedIn = true; return { status: this.claude.loginSucceeds ? 0 : 1, stdout: "", stderr: "" }; }
        break;
      case "codex":
        if (!this.codex.installed) return { status: null, stdout: "", stderr: "ENOENT", notFound: true };
        if (args[0] === "--version") return ok("codex-cli 0.167.1\n");
        if (args[0] === "login" && args[1] === "status") return this.codex.loggedIn ? ok("Logged in using ChatGPT\n") : fail("Not logged in");
        if (args[0] === "login" && args.length === 1) { if (this.codex.loginSucceeds) this.codex.loggedIn = true; return { status: this.codex.loginSucceeds ? 0 : 1, stdout: "", stderr: "" }; }
        break;
      case "where": return args[0] === "claude-agent-acp" && this.adapter ? ok("C:\\x\\claude-agent-acp.cmd\n") : fail("");
      case "/bin/sh": return args[1] === "command -v claude-agent-acp" && this.adapter ? ok("/usr/bin/claude-agent-acp\n") : fail("");
      case "fake-npm":
        if (args.includes("install") && args.includes("-g")) { if (this.npmFails) return fail("npm ERR! 네트워크 오류"); this.adapter = true; this.adapterVersion = "0.81.1"; return ok(); }
        if (args.includes("ls")) return ok(JSON.stringify(this.adapter ? { dependencies: { "@agentclientprotocol/claude-agent-acp": { version: this.adapterVersion } } } : {}));
        break;
    }
    throw new Error(`허용되지 않은 외부 명령: ${key}`);
  };

  get npm(): { command: string; args: string[] } | null { return this.hasNpm ? { command: "fake-npm", args: [] } : null; }
  /** 상태 조회가 아닌(부작용이 있는) 호출만 */
  effects(): Call[] {
    return this.calls.filter((c) => !(
      (c.command === "claude" && (c.args[0] === "--version" || (c.args[0] === "auth" && c.args[1] === "status"))) ||
      (c.command === "codex" && (c.args[0] === "--version" || (c.args[0] === "login" && c.args[1] === "status"))) ||
      c.command === "where" || c.command === "/bin/sh" || (c.command === "fake-npm" && c.args.includes("ls")) ||
      (c.command === "reg" && c.args[0] === "query") || (c.command === "schtasks" && c.args[0] === "/Query")));
  }
}
