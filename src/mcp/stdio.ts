import type { Readable, Writable } from "node:stream";
import type { PaceMcpServer } from "./server.ts";

// 줄 단위 JSON-RPC stdio 전송. 입력은 청크 하나씩 읽어 줄마다 순차 처리하고(읽는 동안 입력은 멈춤),
// 출력 역압은 drain까지 기다린다 — 어느 단계에서도 대기 작업이 쌓이지 않는다.
// 입력 오류·요청 하나의 실패는 응답한 뒤에도 서버를 계속 돌린다. stdout에는 프로토콜 메시지만 쓴다.

export const MAX_LINE_BYTES = 1_000_000;

export function serveStdio(server: PaceMcpServer, input: Readable, output: Writable, maxLine = MAX_LINE_BYTES): Promise<void> {
  return new Promise((resolve) => {
    let chunks: Buffer[] = [];
    let size = 0;
    let discarding = false;
    let dead = false; // 출력이 닫혔다 — 더 처리하지 않고 정리한다
    let finished = false;
    let ended = false;
    let busy = false;
    const inbox: Buffer[] = [];
    const finish = () => { if (!finished) { finished = true; resolve(); } };
    output.on("error", () => { dead = true; input.pause(); finish(); });
    output.on("close", () => { dead = true; finish(); });

    /** 출력 역압: write가 false를 돌려주면 drain(또는 닫힘)까지 기다린다 */
    const write = async (message: unknown): Promise<void> => {
      if (dead) return;
      if (!output.write(`${JSON.stringify(message)}\n`)) {
        await new Promise<void>((done) => {
          const release = () => { output.off("drain", release); output.off("close", release); output.off("error", release); done(); };
          output.once("drain", release);
          output.once("close", release);
          output.once("error", release);
        });
      }
    };
    const tooLong = () => write({ jsonrpc: "2.0", id: null, error: { code: -32600, message: `한 줄이 ${maxLine}바이트를 넘어 버렸다` } });
    const handleLine = async (line: string): Promise<void> => {
      if (line.trim() === "") return;
      let parsed: unknown;
      try { parsed = JSON.parse(line); } catch { await write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON이 아니다" } }); return; }
      let response: unknown;
      try {
        response = await server.handle(parsed);
      } catch {
        // 요청 하나의 예외가 서버 전체를 멈추지 않게 한다
        const id = typeof parsed === "object" && parsed !== null && "id" in parsed ? (parsed as { id: unknown }).id : null;
        response = { jsonrpc: "2.0", id: typeof id === "string" || typeof id === "number" ? id : null, error: { code: -32603, message: "내부 오류" } };
      }
      if (response) await write(response);
    };
    const takeLine = (): string => {
      const line = Buffer.concat(chunks).toString("utf8");
      chunks = [];
      size = 0;
      return line;
    };
    const consume = async (data: Buffer): Promise<void> => {
      let start = 0;
      for (;;) {
        if (dead) return;
        const nl = data.indexOf(0x0a, start);
        const end = nl < 0 ? data.length : nl;
        if (discarding) {
          // 상한을 넘은 줄은 다음 개행까지 버린다
          if (nl >= 0) { discarding = false; await tooLong(); }
        } else {
          const piece = data.subarray(start, end);
          if (size + piece.length > maxLine) {
            chunks = [];
            size = 0;
            if (nl >= 0) await tooLong();
            else discarding = true;
          } else {
            chunks.push(piece);
            size += piece.length;
            if (nl >= 0) await handleLine(takeLine());
          }
        }
        if (nl < 0) return;
        start = nl + 1;
      }
    };
    const pump = async (): Promise<void> => {
      if (busy) return;
      busy = true;
      while (inbox.length > 0 && !dead) await consume(inbox.shift()!);
      if (ended && !dead) {
        if (discarding) await tooLong(); // 개행 없이 끝난 초과 입력도 오류를 한 번 응답한다
        else if (size > 0) await handleLine(takeLine());
        // 마지막 쓰기가 실제로 내보내졌는지 확인한 뒤 끝낸다
        if (!dead) await new Promise<void>((done) => { try { output.write("", () => done()); } catch { done(); } });
        busy = false;
        finish();
        return;
      }
      busy = false;
      if (!dead) input.resume();
    };
    input.on("data", (data: Buffer) => {
      input.pause();
      inbox.push(data);
      void pump();
    });
    const onEnd = () => { ended = true; void pump(); };
    input.on("end", onEnd);
    input.on("error", onEnd);
  });
}
