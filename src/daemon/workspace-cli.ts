import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadConfig } from "./config.ts";
import { gatewayTokenFile } from "./gateway.ts";
import { acquireInstance, InstanceBusyError, readLockInfo, readStatus } from "./instance.ts";
import { makeTelegramRedactor, promoteStoredLegacyBinding, readTelegramSecret, telegramStateFile, TelegramApi } from "./telegram/index.ts";
import { forumKey, forumProof, isTopicState, topicIsBound, topicStateText, type TopicState } from "./telegram/provisioning.ts";
import { loadTelegramState } from "./telegram/state.ts";
import { approveWorkspacePlan, persistRegisteredWorkspace, planWorkspaceAdd, WorkspaceError, workspaceErrorText, workspaceLinkStatus, type WorkspacePlan } from "./workspace.ts";

export const WORKSPACE_USAGE = "pace daemon workspace list | workspace add [<경로>] [--name <이름>] [--yes]";

interface WorkspaceCliOptions {
  home: string;
  cwd: string;
  out: (line: string) => void;
  interactive: boolean;
  ask: (question: string) => Promise<boolean>;
  telegramFetch?: typeof fetch;
}

function gitRoot(cwd: string): string {
  try {
    const env = { ...process.env, GIT_TERMINAL_PROMPT: "0" } as NodeJS.ProcessEnv;
    for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_PREFIX"]) delete env[name];
    const root = execFileSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
      encoding: "utf8", timeout: 5000, windowsHide: true, env, stdio: ["ignore", "pipe", "pipe"],
    }).replace(/\r?\n$/, "");
    if (isAbsolute(root)) return root;
  } catch { /* git 원문에는 로컬 경로가 포함된다 */ }
  throw new WorkspaceError("현재 폴더의 git 최상위를 확인할 수 없다 — 경로를 지정한다");
}

async function resolveForum(options: WorkspaceCliOptions): Promise<{ title: string; proof: string | null }> {
  try {
    const secret = readTelegramSecret(options.home);
    if (!secret) return { title: "Telegram 미설정", proof: null };
    const redact = makeTelegramRedactor(secret);
    const api = new TelegramApi({ token: secret.token, base: secret.apiBase, fetchImpl: options.telegramFetch, redact, totalMs: 2500 });
    const chat = await api.call<{ id?: number; is_forum?: boolean; title?: string }>("getChat", { chat_id: secret.chatId });
    if (String(chat.id) === secret.chatId && chat.is_forum === true && typeof chat.title === "string") {
      const title = redact(chat.title).replaceAll(secret.chatId, "[식별자 제거됨]").replace(/[\p{C}\p{Zl}\p{Zp}]/gu, " ").trim().slice(0, 160);
      if (title) return { title, proof: forumProof(secret) };
    }
  } catch { /* 제목 확인 실패에는 API 오류 원문을 표시하지 않는다 */ }
  return { title: "포럼 이름 확인 불가", proof: null };
}

export async function daemonWorkspaceCommand(args: string[], options: WorkspaceCliOptions): Promise<number> {
  const [action, ...rest] = args;
  const { home, out } = options;
  if (action === "list" && rest.length === 0) {
    try {
      const entries = loadConfig(home).workspaces;
      for (const entry of entries) out(`${entry.name} — ${workspaceLinkStatus(home, entry)}`);
      if (entries.length === 0) out("daemon 워크스페이스가 없다");
      return 0;
    } catch (error) { out(workspaceErrorText(error)); return 2; }
  }
  if (action !== "add") throw new WorkspaceError(WORKSPACE_USAGE);
  let registered = false;
  try {
    const parsed = parseArgs({ args: rest, options: { name: { type: "string" }, yes: { type: "boolean" } }, allowPositionals: true, strict: true });
    if (parsed.positionals.length > 1) throw new WorkspaceError(WORKSPACE_USAGE);
    const path = parsed.positionals[0] === undefined ? gitRoot(options.cwd) : resolve(options.cwd, parsed.positionals[0]);
    const plan = planWorkspaceAdd(home, path, parsed.values.name);
    let forum: Awaited<ReturnType<typeof resolveForum>> | undefined;
    if (!parsed.values.yes) {
      out(`워크스페이스: ${plan.name}`);
      out(`실경로: ${JSON.stringify(plan.real)}`);
      out(plan.registryId ? "전역 등록부: 기존 활성 등록 사용" : "전역 등록부: 새 활성 등록");
      out(`.pace/AGENT.md: ${plan.definitionId ? "기존 정의 사용" : "새로 생성"}`);
      forum = await resolveForum(options);
      out(`접근: read-only · 토픽: ${plan.name} · 포럼: ${forum.title}`);
      if (!options.interactive) { out("계획을 확인한 뒤 --yes로 실행한다"); return 0; }
      if (!await options.ask("이 저장소를 daemon에 추가하고 실행 중이면 확인한 포럼에 결속할까요?")) { out("취소했다"); return 0; }
    }
    const approve = () => {
      const request = approveWorkspacePlan(home, plan);
      registered = true;
      return request;
    };
    let owner;
    try { owner = await acquireInstance(home); }
    catch (error) {
      if (!(error instanceof InstanceBusyError)) throw error;
      const result = await addViaGateway(home, approve, (forum ?? await resolveForum(options)).proof);
      const report = result.topic && !topicIsBound(result.topic) ? topicStateText(result.topic, plan.name) : undefined;
      const binding = result.bound ? (result.topic === "bound" ? "결속 완료" : "기존 결속") : "미결속";
      out(`${plan.name} — 설정 반영 완료 · 토픽 ${binding}`);
      if (report) out(report);
      return 0;
    }
    let binding = "미결속";
    try {
      const request = approve();
      persistRegisteredWorkspace(home, request, (legacy) => promoteStoredLegacyBinding(home, legacy.name, request.registryId));
      try {
        const saved = loadTelegramState(telegramStateFile(home));
        const secret = readTelegramSecret(home);
        if (saved && (!saved.forumKey || (secret && saved.forumKey === forumKey(secret))) &&
          Object.values(saved.topics).some((topic) => typeof topic !== "string" && topic.name === request.name && topic.registryId === request.registryId)) binding = "기존 결속";
        else if (saved?.forumKey && (!secret || saved.forumKey !== forumKey(secret))) binding = "상태 확인 불가";
      } catch { binding = "상태 확인 불가"; }
    } finally { await owner.release(); }
    out(`${plan.name} — 설정 기록 완료(다음 daemon 기동 때 반영) · 토픽 ${binding}`);
    if (binding !== "기존 결속") out(`기동 뒤 다시 add하거나, 포럼의 토픽에서 /bind ${plan.name}으로 결속한다`);
    return 0;
  } catch (error) {
    out(workspaceErrorText(error));
    if (registered) out("전역 등록은 확인했다 · daemon 설정 및 토픽 상태는 다시 add하여 확인한다");
    return 2;
  }
}

function addViaGateway(home: string, approve: () => ReturnType<typeof approveWorkspacePlan>, forum: string | null): Promise<{ bound: boolean; topic?: TopicState }> {
  const lock = readLockInfo(home);
  const status = readStatus(home);
  if (!status || status.state !== "running" || !lock || status.bootId !== lock.bootId || status.pid !== lock.pid ||
    !Number.isInteger(status.gatewayPort) || status.gatewayPort < 1 || status.gatewayPort > 65535) {
    throw new WorkspaceError("실행 소유자의 Gateway를 확인할 수 없다 — 잠시 뒤 workspace add를 다시 실행한다");
  }
  let token: string;
  try { token = readFileSync(gatewayTokenFile(home), "utf8").trim(); }
  catch { throw new WorkspaceError("Gateway 인증 정보를 확인할 수 없다"); }
  if (!/^[0-9a-f]{64}$/.test(token)) throw new WorkspaceError("Gateway 인증 정보를 확인할 수 없다");

  return new Promise((done, fail) => {
    const socket = new WebSocket(`ws://127.0.0.1:${status.gatewayPort}`);
    let sent = false;
    let settled = false;
    const finish = (result: { bound: boolean; topic?: TopicState } | Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
      if (result instanceof Error) fail(result);
      else done(result);
    };
    const disconnected = () => finish(new WorkspaceError(sent
      ? "Gateway의 설정 반영과 토픽 결속 결과를 확인할 수 없다 — 같은 workspace add로 확인한다"
      : "실행 소유자의 Gateway에 연결하지 못했다"));
    let timer = setTimeout(disconnected, 8000);
    socket.onopen = () => socket.send(JSON.stringify({ type: "auth", token }));
    socket.onclose = disconnected;
    socket.onerror = disconnected;
    socket.onmessage = (event) => {
      if (settled) return;
      try {
        const reply = JSON.parse(String(event.data));
        if (reply?.type === "ready" && !sent && reply.bootId === lock.bootId) {
          const workspace = approve();
          socket.send(JSON.stringify({ type: "workspace_add", id: "workspace-add", workspace, forum }));
          sent = true;
          clearTimeout(timer);
          timer = setTimeout(disconnected, 38_000);
        } else if (reply?.type === "ack" && sent && reply.id === "workspace-add" && reply.result?.ok === true) {
          finish({ bound: reply.result.bound === true, ...(isTopicState(reply.result.topic) ? { topic: reply.result.topic } : {}) });
        } else if (reply?.type === "ack" || reply?.type === "error" || reply?.type === "ready") {
          finish(new WorkspaceError("Gateway에서 워크스페이스를 거부했다 — 등록부와 daemon 설정을 확인한다"));
        }
      } catch (error) { finish(new WorkspaceError(workspaceErrorText(error))); }
    };
  });
}
