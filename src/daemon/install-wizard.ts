import { existsSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { loadChainConfig, resolveChain } from "../agent/chain.ts";
import { type SetupOptions, type SetupOutcome } from "../agent/setup.ts";
import { applyAutostart, buildAutostartPlan, describePlan, startDaemonNow, type AutostartEnv } from "./autostart.ts";
import { defaultDeviceName, normalizeDeviceName, readRawConfigFile, updateConfigFile } from "./config.ts";
import { makeRedactor } from "./secrets.ts";
import { readTelegramSecret, writeTelegramSecret } from "./telegram/index.ts";

// `pace daemon install|uninstall|start` 마법사 (P035 T06, BR06).
// install: 계획 출력 → 확인(--yes 또는 터미널 [y/N]) → 에이전트 설정 확인(없으면 setup을 이어서) → 기기 이름 → Telegram(봇 확인·chat id·허용 사용자 찾기) → 워크스페이스 등록 → 자동 실행 등록 → 지금 시작.
// 터미널이 아니면(표준 입력이 TTY 아님) `--yes` 없이는 계획만 출력하고 아무것도 바꾸거나 실행하지 않는다.

export interface BotApi {
  call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
}

export interface WizardDeps {
  env: AutostartEnv;
  out: (line: string) => void;
  /** 터미널에서 질문할 수 있는가 */
  interactive: boolean;
  ask: (question: string) => Promise<boolean>;
  askLine: (question: string, fallback: string) => Promise<string>;
  readSecret: (question: string) => Promise<string>;
  chainFile: string | null;
  runSetup: (options: SetupOptions) => Promise<SetupOutcome>;
  /** daemon이 지금 응답하는가(인스턴스 포트) */
  isRunning: () => Promise<boolean>;
  /** Bot API 클라이언트 — 시험은 가짜 fetch를 낀 것을 넣는다 */
  makeTelegramApi: (token: string) => BotApi;
  /** 현재 작업 폴더(워크스페이스 제안) */
  cwd: string;
  /** 컴퓨터 이름(기기 이름 기본값) */
  hostName?: string;
  /** 시작 확인 대기 간격·횟수(시험 단축) */
  pollMs?: number;
  pollTries?: number;
}

export interface WizardOptions extends SetupOptions {
  yes?: boolean;
  uninstall?: boolean;
  /** 등록 뒤 묻지 않고 바로 시작 */
  start?: boolean;
}

/** 자유 대화가 쓰는 `default` 체인을 해석할 수 있는가 */
export function chainReady(chainFile: string | null): boolean {
  if (!chainFile) return false;
  try { resolveChain(loadChainConfig(chainFile), "default"); return true; } catch { return false; }
}

const TOKEN_FORMAT = /^[0-9]{6,}:[A-Za-z0-9_-]{30,}$/;
const NAME_FORMAT = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 사용자가 정한 이름(그룹·사람)을 화면에 낼 때 제어 문자를 지우고 길이를 자른다 */
const shown = (text: unknown): string => String(text ?? "").replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/g, " ").trim().slice(0, 40);

// ---- 시작 ----

/** `pace daemon start` — 이미 떠 있으면 아무것도 하지 않고, 아니면 등록과 같은 방식으로 백그라운드 시작 뒤 응답을 기다린다 */
export async function startDaemon(deps: Pick<WizardDeps, "env" | "out" | "isRunning" | "pollMs" | "pollTries">): Promise<number> {
  const { out, env } = deps;
  if (await deps.isRunning()) { out("daemon이 이미 실행 중이다"); return 0; }
  const result = startDaemonNow(env);
  for (const line of result.lines) out(line);
  if (!result.ok) return 1;
  for (let i = 0; i < (deps.pollTries ?? 20); i++) {
    if (await deps.isRunning()) { out("daemon이 시작됐다 — 상태는 `pace daemon status`, 로그는 `pace daemon logs`"); return 0; }
    await sleep(deps.pollMs ?? 500);
  }
  out("시작을 요청했지만 daemon이 아직 응답하지 않는다 — `pace daemon logs`로 확인한다");
  return 1;
}

// ---- 기기 이름 ----

async function offerDevice(deps: WizardDeps, home: string): Promise<boolean> {
  const raw = readRawConfigFile(home);
  if (raw.device !== undefined) return false;
  const fallback = deps.hostName !== undefined ? normalizeDeviceName(deps.hostName) : defaultDeviceName();
  const answer = (await deps.askLine(`이 기기의 이름(알림·상태에 표시, 영문·숫자·_.-, Enter=${fallback}):`, fallback)).trim();
  const device = NAME_FORMAT.test(answer) ? answer : normalizeDeviceName(answer);
  if (device !== answer) deps.out(`형식에 맞게 ${device}로 정했다`);
  updateConfigFile(home, (c) => { c.device = device; });
  deps.out(`기기 이름: ${device}`);
  return true;
}

// ---- Telegram ----

interface ChatCandidate { chatId: string; title: string; forum: boolean; senders: Map<string, string> }

type Json = Record<string, unknown>;

function collectCandidates(updates: Json[]): ChatCandidate[] {
  const chats = new Map<string, ChatCandidate>();
  const touch = (chat: Json, topic: boolean): ChatCandidate | null => {
    if (chat.type !== "supergroup" && chat.type !== "group") return null;
    const id = String(chat.id);
    let c = chats.get(id);
    if (!c) { c = { chatId: id, title: shown(chat.title) || id, forum: false, senders: new Map() }; chats.set(id, c); }
    if (chat.is_forum === true || topic) c.forum = true;
    return c;
  };
  for (const u of updates) {
    const message = u.message as Json | undefined;
    if (message && typeof message.chat === "object" && message.chat !== null) {
      const c = touch(message.chat as Json, message.is_topic_message === true);
      const from = message.from as Json | undefined;
      if (c && from && from.is_bot !== true && (typeof from.id === "number" || typeof from.id === "string")) {
        c.senders.set(String(from.id), shown([from.first_name, from.last_name].filter(Boolean).join(" ")) || (from.username ? `@${shown(from.username)}` : String(from.id)));
      }
    }
    const member = u.my_chat_member as Json | undefined;
    if (member && typeof member.chat === "object" && member.chat !== null) touch(member.chat as Json, false);
  }
  return [...chats.values()].sort((a, b) => Number(b.forum) - Number(a.forum));
}

async function chooseIndex(deps: WizardDeps, question: string, count: number, fallback: string): Promise<number | "manual" | null> {
  const answer = (await deps.askLine(question, fallback)).trim().toLowerCase();
  if (answer === "m") return "manual";
  if (answer === "") return null;
  const n = Number(answer);
  return Number.isInteger(n) && n >= 1 && n <= count ? n - 1 : null;
}

/** 봇 토큰 → 봇 확인 → 그룹 메시지로 chat id·보낸 사람 ID 찾기. 실패하면 직접 입력으로 이어 간다 */
async function offerTelegram(deps: WizardDeps, home: string): Promise<boolean> {
  const { out } = deps;
  let existing = null;
  try { existing = readTelegramSecret(home); } catch { /* 손상된 시크릿은 새로 받는다 */ }
  if (existing) { out("Telegram 설정이 이미 있다 — 그대로 둔다"); return false; }
  if (!(await deps.ask("Telegram 채널을 지금 설정할까요? (나중에 `pace daemon telegram init`으로도 할 수 있다)"))) { out("Telegram 설정은 건너뛴다"); return false; }
  const token = (await deps.readSecret("봇 토큰(BotFather가 준 값, 입력은 보이지 않는다):")).trim();
  if (!TOKEN_FORMAT.test(token)) { out("봇 토큰 형식이 올바르지 않아 Telegram 설정을 건너뛴다"); return false; }
  const redact = makeRedactor([token]);
  const errText = (error: unknown): string => redact(String((error as Error)?.message ?? error)).slice(0, 200);
  const api = deps.makeTelegramApi(token);

  try {
    const me = await api.call<Json>("getMe");
    out(`봇 확인: ${shown(me.first_name)}${me.username ? ` (@${shown(me.username)})` : ""}`);
  } catch (error) { out(`봇 토큰을 확인하지 못해 Telegram 설정을 건너뛴다: ${errText(error)}`); return false; }

  let chatId = "";
  const allowed: string[] = [];
  let found = false;

  // webhook이 걸려 있으면 getUpdates가 거부된다 — 원인을 알리고 직접 입력으로
  let webhook = false;
  try {
    const info = await api.call<Json>("getWebhookInfo");
    if (typeof info.url === "string" && info.url !== "") {
      webhook = true;
      let host = "알 수 없는 주소";
      try { host = new URL(info.url).host; } catch { /* 표시용 */ }
      out(`이 봇에는 webhook이 걸려 있어(${host}) 메시지로 chat id를 찾을 수 없다. 다른 서비스가 쓰는 봇이면 새 봇을 만들고, 쓰지 않는 webhook이면 해제(Bot API deleteWebhook)한 뒤 다시 실행한다. 지금은 직접 입력으로 이어 간다.`);
    }
  } catch (error) { out(`webhook 상태를 확인하지 못했다: ${errText(error)}`); }

  if (!webhook) {
    out("1) 봇을 포럼 그룹(토픽이 켜진 그룹)에 추가하고 관리자로 올린다(토픽 관리 권한 필요).");
    out("2) 그 그룹의 아무 토픽에서 허용할 사람이 메시지를 한 줄 보낸다(여러 명이면 각자 보낸다).");
    const go = (await deps.askLine("보냈으면 Enter, 직접 입력하려면 m:", "")).trim().toLowerCase();
    if (go !== "m") {
      try {
        const updates = await api.call<Json[]>("getUpdates", { timeout: 0, limit: 100, allowed_updates: ["message", "my_chat_member"] });
        const candidates = collectCandidates(Array.isArray(updates) ? updates : []);
        if (candidates.length === 0) out("받은 그룹 메시지가 없다 — 봇이 그룹에 있는지, 메시지를 보냈는지 확인한다. 직접 입력으로 이어 간다.");
        else {
          candidates.forEach((c, i) => out(`${i + 1}) ${c.title} (chat id ${c.chatId})${c.forum ? "" : " — 토픽이 켜진 그룹인지 확인되지 않았다"}`));
          const pick = await chooseIndex(deps, "사용할 그룹 번호(직접 입력하려면 m, Enter=1):", candidates.length, "1");
          const chosen = typeof pick === "number" ? candidates[pick] : undefined;
          if (chosen) {
            if (!chosen.forum) out("이 그룹에서 토픽이 켜져 있는지(그룹 설정 → Topics) 확인한다 — 꺼져 있으면 프로젝트 토픽을 만들 수 없다");
            chatId = chosen.chatId;
            found = true;
            const senders = [...chosen.senders.entries()];
            if (senders.length === 1) {
              const [id, name] = senders[0]!;
              if (await deps.ask(`${name} (사용자 ID ${id})를 허용 사용자로 추가할까요?`)) allowed.push(id);
            } else if (senders.length > 1) {
              senders.forEach(([id, name], i) => out(`${i + 1}) ${name} (사용자 ID ${id})`));
              const answer = (await deps.askLine("허용할 사람 번호(쉼표로 여러 명, Enter=아무도 추가 안 함):", "")).trim();
              for (const part of answer.split(",").map((x) => x.trim()).filter(Boolean)) {
                const n = Number(part);
                if (Number.isInteger(n) && n >= 1 && n <= senders.length) allowed.push(senders[n - 1]![0]);
              }
            }
          }
        }
      } catch (error) { out(`메시지를 가져오지 못했다(같은 봇을 다른 곳이 쓰는 중일 수 있다): ${errText(error)} — 직접 입력으로 이어 간다.`); }
    }
  }

  if (!found) {
    chatId = (await deps.askLine("포럼 그룹 chat id(숫자, 예: -1001234567890):", "")).trim();
    if (!/^-?\d+$/.test(chatId)) { out("chat id 형식이 올바르지 않아 Telegram 설정을 건너뛴다"); return false; }
    const userId = (await deps.askLine("허용할 사용자 ID(숫자, 비우면 나중에 config.json에 넣는다):", "")).trim();
    if (/^\d+$/.test(userId)) allowed.push(userId);
    else if (userId !== "") out("사용자 ID 형식이 올바르지 않아 허용 사용자는 추가하지 않는다");
  }

  writeTelegramSecret(home, { token, chatId });
  out("Telegram 시크릿을 저장했다(토큰은 표시하지 않는다)");
  if (allowed.length > 0) {
    updateConfigFile(home, (c) => {
      const users = (typeof c.allowedUsers === "object" && c.allowedUsers !== null && !Array.isArray(c.allowedUsers) ? c.allowedUsers : {}) as Record<string, unknown>;
      const list = Array.isArray(users.telegram) ? (users.telegram as unknown[]).map(String) : [];
      for (const id of allowed) if (!list.includes(id)) list.push(id);
      users.telegram = list;
      c.allowedUsers = users;
    });
    out(`허용 사용자를 config.json의 allowedUsers.telegram에 저장했다(${allowed.length}명)`);
  } else out("허용 사용자가 없어 지금은 모든 요청이 거부된다 — config.json의 allowedUsers.telegram에 사용자 ID를 넣는다");
  return true;
}

// ---- 워크스페이스 ----

function findGitRoot(start: string): string | null {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const samePath = (a: string, b: string): boolean => (process.platform === "win32" ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b));

function suggestName(path: string): string {
  const cleaned = basename(path).replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^[^A-Za-z0-9]+/, "").slice(0, 40).replace(/[-_.]+$/, "");
  return cleaned === "" ? "workspace" : cleaned;
}

async function offerWorkspace(deps: WizardDeps, home: string): Promise<boolean> {
  const { out } = deps;
  const raw = readRawConfigFile(home);
  const list = Array.isArray(raw.workspaces) ? (raw.workspaces as { name?: unknown; path?: unknown }[]) : [];
  const root = findGitRoot(deps.cwd);
  let path: string;
  if (root !== null) {
    const known = list.find((w) => typeof w.path === "string" && samePath(w.path, root));
    if (known) { out(`현재 폴더는 이미 워크스페이스 ${String(known.name)}로 등록돼 있다 — 그대로 둔다`); return false; }
    if (!(await deps.ask(`현재 폴더(${root})가 git 저장소다. 워크스페이스로 등록할까요?`))) { out("워크스페이스 등록은 건너뛴다"); return false; }
    path = (await deps.askLine("워크스페이스 경로(Enter=현재 폴더):", root)).trim();
  } else {
    path = (await deps.askLine("등록할 워크스페이스 폴더의 절대 경로(비우면 건너뜀):", "")).trim();
    if (path === "") { out("워크스페이스 등록은 건너뛴다"); return false; }
  }
  if (!isAbsolute(path) || !existsSync(path) || !statSync(path).isDirectory()) { out("절대 경로의 기존 폴더가 아니어서 워크스페이스 등록을 건너뛴다"); return false; }
  path = resolve(path);
  const same = list.find((w) => typeof w.path === "string" && samePath(w.path, path));
  if (same) { out(`그 폴더는 이미 워크스페이스 ${String(same.name)}로 등록돼 있다 — 그대로 둔다`); return false; }
  let name = (await deps.askLine("워크스페이스 이름(영문·숫자·_.-):", suggestName(path))).trim();
  for (let tries = 0; !NAME_FORMAT.test(name) || list.some((w) => w.name === name); tries++) {
    if (tries >= 1) { out("이름이 올바르지 않거나 이미 있어 워크스페이스 등록을 건너뛴다"); return false; }
    out(NAME_FORMAT.test(name) ? `이름 ${name}은 이미 쓰고 있다` : "이름 형식이 올바르지 않다");
    name = (await deps.askLine("다른 이름:", "")).trim();
  }
  try { updateConfigFile(home, (c) => { const ws = Array.isArray(c.workspaces) ? (c.workspaces as unknown[]) : []; ws.push({ name, path }); c.workspaces = ws; }); }
  catch (error) { out(`워크스페이스를 저장하지 못했다: ${String((error as Error).message)}`); return false; }
  out(`워크스페이스 ${name}를 등록했다(${path})`);
  let hasTelegram = false;
  try { hasTelegram = readTelegramSecret(home) !== null; } catch { /* 안내만 달라진다 */ }
  out(hasTelegram
    ? `Telegram 포럼 그룹에서 토픽을 하나 만들고, 그 토픽에서 \`/bind ${name}\`을 보내면 이 워크스페이스와 이어진다.`
    : `Telegram을 설정한 뒤 포럼 그룹에서 토픽을 만들고 \`/bind ${name}\`을 보내면 이 워크스페이스와 이어진다.`);
  return true;
}

// ---- 마법사 ----

export async function runDaemonInstall(deps: WizardDeps, options: WizardOptions): Promise<number> {
  const { out, env } = deps;
  const uninstall = options.uninstall === true;
  out(describePlan(buildAutostartPlan(env, uninstall)));
  if (!uninstall) out(chainReady(deps.chainFile) ? "에이전트 체인(default)은 준비돼 있다." : "에이전트 체인(default)이 없다 — 등록할 때 `pace agent setup`이 이어서 실행된다.");
  let yes = options.yes === true;
  if (!yes) {
    // 터미널이 아니면 계획만 출력한다. 터미널이면 계획을 보여 준 뒤 [y/N]으로 확인받는다 — 변경은 허락했을 때만 한다
    if (!deps.interactive) { out(`계획만 출력했다. 실제로 ${uninstall ? "해제" : "등록"}하려면 사람이 확인한 뒤 --yes를 붙인다.`); return 0; }
    if (!(await deps.ask(`위 계획대로 ${uninstall ? "해제" : "등록"}할까요?`))) { out("취소했다 — 아무것도 바꾸지 않았다"); return 0; }
    yes = true;
  }
  if (uninstall) {
    const result = applyAutostart(env, true);
    for (const line of result.lines) out(line);
    return result.ok ? 0 : 1;
  }
  let changed = false; // 실행 중 daemon이 모르는 설정을 바꿨는가(재시작 안내)
  if (!chainReady(deps.chainFile)) {
    out("에이전트 체인(default)이 없어 에이전트 설정을 이어서 실행한다");
    const outcome = await deps.runSetup({ agents: options.agents, yes, login: options.login, installAdapters: options.installAdapters });
    if (outcome.code !== 0 || !chainReady(deps.chainFile)) { out("에이전트 설정이 끝나지 않아 자동 실행을 등록하지 않았다 — `pace agent setup` 뒤 다시 실행한다"); return 1; }
    changed = true;
  }
  if (deps.interactive) {
    try {
      if (await offerDevice(deps, env.home)) changed = true;
      if (await offerTelegram(deps, env.home)) changed = true;
      if (await offerWorkspace(deps, env.home)) changed = true;
    } catch (error) { out(`기기 설정을 저장하지 못했다(config.json을 확인한다): ${String((error as Error).message)}`); }
  } else if (!readableTelegram(env.home)) out("Telegram은 나중에 `pace daemon telegram init --chat-id <id>`(토큰은 표준 입력)로 설정한다");
  const result = applyAutostart(env, false);
  for (const line of result.lines) out(line);
  if (!result.ok) return 1;

  const running = await deps.isRunning();
  if (running) {
    out(changed ? "daemon이 이미 실행 중이라 바꾼 설정은 아직 적용되지 않았다 — `pace daemon stop` 뒤 `pace daemon start`로 재시작한다" : "daemon이 이미 실행 중이다");
    return 0;
  }
  if (options.start === true || (deps.interactive && await deps.ask("지금 바로 daemon을 시작할까요? (아니면 다음 로그온 때 시작된다)"))) return startDaemon(deps);
  out("지금 시작하려면 `pace daemon start`");
  return 0;
}

function readableTelegram(home: string): boolean {
  try { return readTelegramSecret(home) !== null; } catch { return false; }
}
