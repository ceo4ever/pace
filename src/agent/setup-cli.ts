import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { paceHome, profileDir } from "../core/paths.ts";
import { askLine, askYesNo, isInteractive } from "../core/prompt.ts";
import { runCommand } from "../core/console-decode.ts";
import { resolveProfileName } from "../profile/profile.ts";
import { defaultChainFile } from "./chain.ts";
import { type SetupDeps } from "./setup.ts";

/** 프로필의 체인 설정 위치. 프로필이 없거나 폴더가 없으면 null(새 폴더를 만들지 않는다) */
export function profileChainFile(home: string = paceHome()): string | null {
  const name = resolveProfileName(home);
  if (!name) return null;
  const dir = profileDir(home, name);
  return existsSync(dir) ? defaultChainFile(dir) : null;
}

/** `npm install -g`를 돌릴 명령. Windows의 npm은 .cmd라 이 node 옆의 npm-cli.js를 node로 직접 실행한다 */
export function defaultNpm(platform: NodeJS.Platform = process.platform, nodePath: string = process.execPath): SetupDeps["npm"] {
  if (platform !== "win32") return { command: "npm", args: [] };
  const cli = join(dirname(nodePath), "node_modules", "npm", "bin", "npm-cli.js");
  return existsSync(cli) ? { command: nodePath, args: [cli] } : null;
}

export function terminalSetupDeps(out: (line: string) => void, overrides: Partial<SetupDeps> = {}): SetupDeps {
  return {
    runner: runCommand,
    platform: process.platform,
    interactive: isInteractive(),
    ask: askYesNo,
    askLine,
    out,
    chainFile: profileChainFile(),
    npm: defaultNpm(),
    ...overrides,
  };
}
