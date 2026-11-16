import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";

/**
 * LLM은 먼저 말할 수 없으므로(세션 시작 훅은 맥락만 넣는다) 첫 메시지를 미리 넣은 채로 CLI를 연다.
 * 각 CLI의 "시작 프롬프트 + 대화형 유지" 방식은 --help로 확인했다(2026-10-22).
 */
export const ONBOARD_TOOLS = ["claude", "codex", "gemini", "cursor-agent"] as const;
export type OnboardTool = (typeof ONBOARD_TOOLS)[number];

export const ONBOARD_PROMPT = "PACE 에이전트 온보딩을 시작해 줘.";

export function onboardCommand(tool: OnboardTool, extraArgs: string[] = []): [string, string[]] {
  switch (tool) {
    case "gemini":
      return ["gemini", [...extraArgs, "-i", ONBOARD_PROMPT]];
    default:
      return [tool, [...extraArgs, ONBOARD_PROMPT]];
  }
}

export function isOnboardTool(value: string): value is OnboardTool {
  return (ONBOARD_TOOLS as readonly string[]).includes(value);
}

/** PATH에서 처음 찾은 CLI. 없으면 null. */
export function detectTool(isAvailable: (name: string) => boolean = commandExists): OnboardTool | null {
  return ONBOARD_TOOLS.find((tool) => isAvailable(tool)) ?? null;
}

/**
 * 온보딩은 폴더와 상관없는 일이라 PACE 홈에서 연다. 아무 폴더에서나 열면 도구의 폴더 신뢰 창(기본값 "아니오, 종료")이
 * 처음 쓰는 폴더마다 떠서 Enter 한 번에 바로 종료될 수 있다.
 */
export function launch(tool: OnboardTool, extraArgs: string[], cwd: string): number {
  const [command, args] = onboardCommand(tool, extraArgs);
  mkdirSync(cwd, { recursive: true });
  process.stderr.write(
    `▸ ${command}를 열어 온보딩을 시작합니다 (작업 폴더: ${cwd})\n` +
      "  처음이면 폴더 신뢰를 묻습니다 — \"Yes, I trust this folder\"(신뢰)를 고르세요. 기본값은 종료입니다.\n",
  );
  // Windows의 npm 전역 CLI는 .cmd라 셸을 거쳐야 실행된다.
  const result = spawnSync(command, args, { stdio: "inherit", cwd, shell: process.platform === "win32" });
  if (result.error) throw new Error(`${command} 실행 실패: ${result.error.message}`);
  return result.status ?? 0;
}

function commandExists(name: string): boolean {
  const probe = process.platform === "win32" ? spawnSync("where", [name]) : spawnSync("/bin/sh", ["-c", `command -v ${name}`]);
  return probe.status === 0;
}
