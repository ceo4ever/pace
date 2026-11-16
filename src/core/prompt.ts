import { createInterface } from "node:readline/promises";

// 터미널 질문 도구 (P035 T06). 터미널이 아닐 때(파이프·CI·에이전트 셸)는 호출하지 않는다 — 호출자가 `isInteractive()`로 먼저 가른다.

export function isInteractive(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

export async function askLine(question: string, fallback: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try { const answer = await rl.question(`${question} `); return answer.trim() === "" ? fallback : answer; } finally { rl.close(); }
}

export async function askYesNo(question: string): Promise<boolean> {
  const answer = await askLine(`${question} [y/N]`, "n");
  return /^y(es)?$/i.test(answer.trim());
}

/** 입력을 화면에 보이지 않게 한 줄 받는다(봇 토큰 등). Ctrl-C는 빈 문자열 */
export function readSecretLine(question: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(`${question} `);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const finish = (result: string) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      process.stdout.write("\n");
      resolve(result);
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return finish(value);
        if (ch === "\u0003") return finish("");
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}
