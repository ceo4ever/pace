import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { connect, type Socket } from "node:net";
import { join } from "node:path";
import { spawnSync, type ChildProcess } from "node:child_process";
import { readStatus } from "../src/daemon/instance.ts";
import { PACE_BIN, preserveTestTemp, sessionFreeEnv, spawnTestChild, tempDir } from "./helpers.ts";

const FIXTURE = join(import.meta.dirname, "fixtures", "daemon-main.ts");
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function daemonHome(extraConfig: Record<string, unknown> = {}): { home: string; dirs: Record<string, string> } {
  const home = tempDir();
  const dirs: Record<string, string> = {};
  const workspaces = ["a", "b", "c"].map((name) => {
    const path = join(home, "ws", name);
    mkdirSync(path, { recursive: true });
    dirs[name] = realpathSync.native(path);
    // 쓰기 작업은 시작 전 변경 스냅샷(git)이 필요하다
    spawnSync("git", ["init", "-q"], { cwd: path });
    return { name, path };
  });
  mkdirSync(join(home, "daemon"), { recursive: true });
  writeFileSync(join(home, "daemon", "config.json"), JSON.stringify({ device: "test-box", maxConcurrent: 4, drainTimeoutMs: 4000, workspaces, ...extraConfig }));
  return { home, dirs };
}

export interface Proc { child: ChildProcess; exited: Promise<number | null>; kill(): void; diagnostics(): Record<string, unknown> }

function wrap(child: ChildProcess): Proc {
  let stdout = "", stderr = "", spawnError: string | null = null;
  child.stdout?.on("data", (chunk: Buffer) => { stdout = (stdout + chunk.toString("utf8")).slice(-32_768); });
  child.stderr?.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString("utf8")).slice(-32_768); });
  child.once("error", (error) => { spawnError = error.message; });
  const exited = new Promise<number | null>((resolve) => child.once("close", (code) => resolve(code)));
  return { child, exited, kill: () => { child.kill("SIGKILL"); }, diagnostics: () => ({ pid: child.pid, exitCode: child.exitCode, signal: child.signalCode, spawnError, stdout, stderr }) };
}

/** 가짜 실행자 daemon(test/fixtures/daemon-main.ts) */
export function startFixtureDaemon(home: string, extraEnv: Record<string, string> = {}): Proc {
  return wrap(spawnTestChild(process.execPath, [FIXTURE], { env: { ...sessionFreeEnv(), HOME: home, USERPROFILE: home, PACE_HOME: home, PACE_PROFILE: "", ...extraEnv }, stdio: ["ignore", "pipe", "pipe"] }));
}

/** 실제 `pace daemon run` */
export function startRealDaemon(home: string): Proc {
  return wrap(spawnTestChild(process.execPath, [PACE_BIN, "daemon", "run"], { env: { ...sessionFreeEnv(), HOME: home, USERPROFILE: home, PACE_HOME: home, PACE_PROFILE: "" }, stdio: ["ignore", "pipe", "pipe"] }));
}

export async function waitReady(home: string, proc: Proc, ms = 15_000): Promise<number> {
  const end = Date.now() + ms;
  let exited = false;
  void proc.exited.then(() => { exited = true; });
  while (Date.now() < end) {
    const s = readStatus(home);
    if (s && s.state === "running" && s.pid === proc.child.pid) return s.gatewayPort;
    if (exited) throw readinessFailure(home, proc, "daemon이 준비 전에 종료됐다");
    await sleep(50);
  }
  throw readinessFailure(home, proc, "daemon 준비 시간 초과");
}

/** 실패 원인을 숨기지 않고 이 시험의 임시 루트에 보존한다. 재시도하거나 통과로 바꾸지 않는다. */
function readinessFailure(home: string, proc: Proc, reason: string): Error {
  const read = (name: string) => {
    try { return readFileSync(join(home, "daemon", name), "utf8").slice(-32_768); }
    catch (error) { return `읽기 실패: ${(error as NodeJS.ErrnoException).code}`; }
  };
  const snapshot = { at: new Date().toISOString(), reason, process: proc.diagnostics(), lock: read("daemon.lock"), status: read("status.json"), log: read("daemon.log") };
  const path = join(home, "daemon", "test-readiness-failure.json");
  const detail = JSON.stringify(snapshot);
  let saved = path;
  try { writeFileSync(path, detail + "\n"); } catch (error) { saved = `저장 실패: ${(error as NodeJS.ErrnoException).code}`; }
  preserveTestTemp();
  return new Error(`${reason}; 진단=${saved}; ${detail}`);
}

export const tokenOf = (home: string) => readFileSync(join(home, "secrets", "gateway-token"), "utf8").trim();

export interface WsClient { ws: WebSocket; messages: Record<string, unknown>[]; send(obj: unknown): void; next(pred: (m: Record<string, any>) => boolean, ms?: number): Promise<Record<string, any>>; close(): void; closed: Promise<number> }

export async function wsConnect(port: number, token: string | null): Promise<WsClient> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const messages: Record<string, unknown>[] = [];
  const waiters: { pred: (m: Record<string, any>) => boolean; resolve: (m: Record<string, any>) => void }[] = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data)) as Record<string, any>;
    const w = waiters.findIndex((x) => x.pred(m));
    if (w >= 0) waiters.splice(w, 1)[0]!.resolve(m); else messages.push(m);
  };
  const closed = new Promise<number>((resolve) => { ws.onclose = (e) => resolve(e.code); });
  await new Promise<void>((resolve, reject) => { ws.onopen = () => resolve(); ws.onerror = () => reject(new Error("연결 실패")); });
  const client: WsClient = {
    ws, messages, closed, close: () => ws.close(),
    send: (obj) => ws.send(JSON.stringify(obj)),
    next(pred, ms = 8000) {
      const i = messages.findIndex((m) => pred(m as Record<string, any>));
      if (i >= 0) return Promise.resolve(messages.splice(i, 1)[0] as Record<string, any>);
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`메시지 대기 시간 초과 — 쌓인 메시지: ${JSON.stringify(messages).slice(0, 1500)}`)), ms);
        waiters.push({ pred, resolve: (m) => { clearTimeout(t); resolve(m); } });
      });
    },
  };
  if (token !== null) {
    client.send({ type: "auth", token });
    await client.next((m) => m.type === "ready");
  }
  return client;
}

/** 원시 소켓 WebSocket — 비정상 프레임 시험용 */
export async function rawSocket(port: number, headers: Record<string, string> = {}): Promise<{ socket: Socket; status: string; write(buf: Buffer): void; closedCode(): Promise<number | null>; chunks: Buffer[] }> {
  const socket = connect({ port, host: "127.0.0.1" });
  await new Promise<void>((resolve, reject) => { socket.once("connect", () => resolve()); socket.once("error", reject); });
  const key = randomBytes(16).toString("base64");
  const extra = Object.entries(headers).map(([k, v]) => `${k}: ${v}\r\n`).join("");
  socket.write(`GET / HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n${extra}\r\n`);
  const chunks: Buffer[] = [];
  socket.on("data", (c: Buffer) => chunks.push(c));
  socket.on("error", () => {});
  const start = Date.now();
  while (Buffer.concat(chunks).indexOf("\r\n\r\n") < 0 && Date.now() - start < 3000) { if (socket.destroyed) break; await sleep(10); }
  const status = Buffer.concat(chunks).toString("utf8").split("\r\n")[0] ?? "";
  void createHash;
  return {
    socket, status, chunks,
    write: (buf) => { try { socket.write(buf); } catch { /* 닫힘 */ } },
    async closedCode() {
      const end = Date.now() + 4000;
      while (Date.now() < end) {
        const all = Buffer.concat(chunks);
        const headEnd = all.indexOf("\r\n\r\n");
        if (headEnd >= 0) {
          const rest = all.subarray(headEnd + 4);
          if (rest.length >= 4 && (rest[0]! & 0x0f) === 8) return rest.readUInt16BE(2);
        }
        if (socket.destroyed && chunks.length > 0) return null;
        await sleep(20);
      }
      return null;
    },
  };
}

/** 클라이언트→서버 마스킹 프레임 */
export function maskedFrame(opcode: number, payload: Buffer, fin = true): Buffer {
  const mask = randomBytes(4);
  const n = payload.length;
  const head = n < 126 ? Buffer.from([(fin ? 0x80 : 0) | opcode, 0x80 | n]) : Buffer.from([(fin ? 0x80 : 0) | opcode, 0x80 | 126, n >> 8, n & 255]);
  const body = Buffer.from(payload);
  for (let i = 0; i < body.length; i++) body[i] = body[i]! ^ mask[i % 4]!;
  return Buffer.concat([head, mask, body]);
}
