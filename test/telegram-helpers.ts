import { join } from "node:path";
import { createTelegramAdapter, telegramStateFile, writeTelegramSecret } from "../src/daemon/telegram/index.ts";
import { emptyTelegramState, saveTelegramState } from "../src/daemon/telegram/state.ts";
import type { TelegramAdapter, TelegramAdapterOptions } from "../src/daemon/telegram/adapter.ts";
import { makeRedactor } from "../src/daemon/secrets.ts";
import { harness, type Harness, type HarnessOptions } from "./daemon-helpers.ts";
import { MockTelegram } from "./telegram-mock.ts";

export const TOKEN = "123456789:AAH-test_token_value_0123456789abcdefXYZ";
export const OTHER_TOKEN = "987654321:BBZ-another_bot_token_9876543210fedcbaQRS";
export const CHAT = -1001;
export const U1 = 100;
export const U2 = 200;
export const STRANGER = 999;

export interface TgHarness {
  h: Harness;
  mock: MockTelegram;
  adapter: TelegramAdapter;
  home: string;
  redact: (t: string) => string;
  stop(): Promise<void>;
}

export interface TgOptions {
  topics?: Record<string, string>;
  hk?: HarnessOptions;
  adapter?: Partial<TelegramAdapterOptions>;
  /** 연결하지 않고 만들기만 한다 */
  noConnect?: boolean;
  mock?: MockTelegram;
  home?: string;
  skipSeed?: boolean;
}

const live: TgHarness[] = [];

/** 시험이 도중에 실패해 정리를 건너뛴 어댑터·Daemon·모의 서버를 모두 멈춘다(프로세스가 끝나지 않는 일을 막는다) */
export async function cleanupAll(): Promise<void> {
  for (const t of live.splice(0)) { try { await t.adapter.disconnect(); } catch { /* 정리 */ } try { await t.h.daemon.stop({ drain: false }); } catch { /* 정리 */ } try { await t.mock.close(); } catch { /* 이미 닫힘 */ } }
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function until(fn: () => boolean | Promise<boolean>, ms = 4000, what = "조건"): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return; await sleep(10); }
  throw new Error(`시간 초과: ${what}`);
}

export async function tgHarness(o: TgOptions = {}): Promise<TgHarness> {
  const mock = o.mock ?? (await new MockTelegram().start());
  const redact = makeRedactor([TOKEN]);
  const h = await harness({ ...o.hk, home: o.home ?? o.hk?.home, config: { allowedUsers: { telegram: [String(U1), String(U2)] }, ...(o.hk?.config ?? {}) }, extra: { redact, ...(o.hk?.extra ?? {}) } });
  const secret = { token: TOKEN, chatId: String(CHAT), apiBase: mock.base };
  writeTelegramSecret(h.home, secret);
  if (!o.skipSeed) saveTelegramState(telegramStateFile(h.home), { ...emptyTelegramState(), topics: o.topics ?? { "11": "a", "12": "b" } });
  const adapter = createTelegramAdapter({ daemon: h.daemon, home: h.home, config: h.config, secret, redact, overrides: { pollSeconds: 1, retryDelayMs: 5, tickMs: 50, editGapMs: 0, sleep: (ms) => sleep(Math.min(ms, 20)), ...(o.adapter ?? {}) } });
  if (!o.noConnect) await h.daemon.addAdapter(adapter);
  const handle: TgHarness = { h, mock, adapter, home: h.home, redact, async stop() { await adapter.disconnect(); await h.daemon.stop({ drain: false }); await mock.close(); } };
  live.push(handle);
  return handle;
}

export function stateFile(home: string): string { return telegramStateFile(home); }
export function dirOf(home: string, name: string): string { return join(home, "ws", name); }
