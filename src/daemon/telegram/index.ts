import { chmodSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "../../core/fsutil.ts";
import { secretsDir, type DaemonConfig } from "../config.ts";
import { registeredWorkspaceRoot, sameWorkspaceRoot } from "../workspace.ts";
import type { Daemon } from "../core.ts";
import { makeRedactor, type Redactor } from "../secrets.ts";
import { TelegramApi } from "./api.ts";
import { TelegramAdapter, type TelegramAdapterOptions, type TelegramHost } from "./adapter.ts";
import { loadTelegramState, promoteLegacyBinding, saveTelegramState } from "./state.ts";

// Telegram 결선 — 시크릿 읽기·쓰기, 호스트(코어·설정과의 연결) 구현, 어댑터 생성.

export interface TelegramSecret {
  token: string;
  chatId: string;
  /** 시험·프록시용 기준 URL(http/https만) */
  apiBase?: string;
  /** 어댑터가 처음 시작에 성공한 시각 — offset 유실 판단의 운영 표식 */
  initializedAt?: string;
}

export function telegramSecretFile(home: string): string { return join(secretsDir(home), "telegram.json"); }
export function telegramStateFile(home: string): string { return join(home, "daemon", "telegram.json"); }

/** 없으면 null, 형식이 틀리면 던진다. 토큰 값은 오류 메시지에 넣지 않는다 */
export function readTelegramSecret(home: string): TelegramSecret | null {
  const file = telegramSecretFile(home);
  if (!existsSync(file)) return null;
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(file, "utf8")); } catch { throw new Error("Telegram 시크릿 파일을 읽을 수 없다(JSON 오류)"); }
  const o = raw as Record<string, unknown>;
  if (typeof o !== "object" || o === null) throw new Error("Telegram 시크릿 파일이 객체가 아니다");
  if (typeof o.token !== "string" || !/^[0-9]{6,}:[A-Za-z0-9_-]{30,}$/.test(o.token)) throw new Error("Telegram 시크릿의 token 형식이 올바르지 않다");
  if (typeof o.chatId !== "string" && typeof o.chatId !== "number") throw new Error("Telegram 시크릿의 chatId가 없다");
  if (o.apiBase !== undefined && (typeof o.apiBase !== "string" || !/^https?:\/\//.test(o.apiBase))) throw new Error("apiBase는 http(s) URL");
  return { token: o.token, chatId: String(o.chatId), apiBase: o.apiBase as string | undefined, initializedAt: typeof o.initializedAt === "string" ? o.initializedAt : undefined };
}

export function writeTelegramSecret(home: string, secret: TelegramSecret): void {
  const file = telegramSecretFile(home);
  writeFileAtomic(file, JSON.stringify(secret, null, 2));
  try { chmodSync(file, 0o600); } catch { /* Windows는 ACL 미검증 — 한계로 기록 */ }
}

/** 로드한 시크릿에서 비밀 제거기를 만든다 — 시크릿이 없으면 토큰 형태 제거만 한다 */
export function makeTelegramRedactor(secret: TelegramSecret | null): Redactor {
  return makeRedactor(secret ? [secret.token] : []);
}

export function promoteStoredLegacyBinding(home: string, name: string, registryId: string): void {
  const file = telegramStateFile(home);
  const state = loadTelegramState(file);
  if (state && promoteLegacyBinding(state, name, registryId)) saveTelegramState(file, state);
}

export function createTelegramHost(o: { daemon: Daemon; home: string; config: DaemonConfig; secret: TelegramSecret }): TelegramHost {
  const { daemon, home, config } = o;
  return {
    device: config.device,
    registryHome: home,
    isAllowed: (actor) => daemon.isAllowed(actor),
    pendingApprovals: (from) => daemon.pendingApprovals(from),
    overview: () => daemon.overview(),
    workspaces: () => config.workspaces,
    workspaceRootInfo: (name) => daemon.workspaceRootInfo(name, false),
    registerLegacyWorkspace: (entry, root) => daemon.registerLegacyWorkspace(entry, root, home),
    matchesLegacyBinding(entry, id) {
      const approved = daemon.workspaceRootInfo(entry.name);
      if (!approved) return false;
      try { return sameWorkspaceRoot(registeredWorkspaceRoot(home, approved.real, id), approved); }
      catch { return false; }
    },
    flushOutbox: () => daemon.flushOutbox(),
    hasPriorActivity: () => daemon.hasChannelActivity("telegram"),
    readMarker: () => { try { return readTelegramSecret(home)?.initializedAt !== undefined; } catch { return false; } },
    writeMarker: () => { const cur = readTelegramSecret(home); if (cur && !cur.initializedAt) writeTelegramSecret(home, { ...cur, initializedAt: new Date().toISOString() }); },
    stateFile: telegramStateFile(home),
  };
}

export function createTelegramAdapter(o: { daemon: Daemon; home: string; config: DaemonConfig; secret: TelegramSecret; redact: Redactor; log?: (event: string, fields?: Record<string, unknown>) => void; overrides?: Partial<TelegramAdapterOptions> }): TelegramAdapter {
  const api = new TelegramApi({ token: o.secret.token, base: o.secret.apiBase, redact: o.redact });
  return new TelegramAdapter({
    api,
    chatId: o.secret.chatId,
    host: createTelegramHost(o),
    redact: o.redact,
    log: o.log,
    holdOffset: process.env.PACE_TELEGRAM_HOLD_OFFSET === "1",
    ...o.overrides,
  });
}

export { TelegramAdapter, TelegramApi };
