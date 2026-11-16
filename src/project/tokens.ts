import { StringDecoder } from "node:string_decoder";
import { closeSync, existsSync, lstatSync, openSync, readFileSync, readSync, readdirSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import type { ProjectRef, Repo } from "./harness.ts";
import { collectStats, formatStats } from "./metrics.ts";
import type { ProjectStats, TimeStats } from "./metrics.ts";

export interface TokenUsage {
  input: number; cachedInput: number; cacheCreationInput: number;
  output: number; reasoningOutput: number; tool: number;
}
export type TokenTool = "Claude Code" | "Codex" | "Gemini CLI" | "Cursor" | "Antigravity";
export interface TokenStats { tool: TokenTool; status: "recorded" | "missing"; usage: TokenUsage; samples: number; }
interface Sample { tool: TokenTool; ts: number; usage: TokenUsage; }
interface CodexSession { samples: { ts: number; usage: TokenUsage }[]; }
export interface TokenOptions { home?: string; env?: NodeJS.ProcessEnv; now?: string; finishing?: boolean; }
export interface FullStats extends ProjectStats { coordinatorTokens: TokenStats[]; tokens: TokenStats[]; taskTokens: { id: string; tokens: TokenStats[] }[]; }
const zero = (): TokenUsage => ({ input: 0, cachedInput: 0, cacheCreationInput: 0, output: 0, reasoningOutput: 0, tool: 0 });
const count = (n: unknown): number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : 0;
const object = (v: unknown): Record<string, any> => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {};
function add(a: TokenUsage, b: TokenUsage): void { for (const k of Object.keys(a) as (keyof TokenUsage)[]) a[k] += b[k]; }
function normalPath(path: string): string { try { return realpathSync(path); } catch { return resolve(path); } }
function matches(path: unknown, cwd: string): boolean { return typeof path === "string" && normalPath(path) === normalPath(cwd); }
function plain(path: string): boolean { try { return !lstatSync(path).isSymbolicLink(); } catch { return false; } }
function children(dir: string): string[] { try { return plain(dir) ? readdirSync(dir).map((n) => join(dir, n)) : []; } catch { return []; } }
function* files(dir: string, suffix: string, depth = 8): Generator<string> {
  if (depth < 0) return;
  for (const file of children(dir)) {
    try {
      const stat = lstatSync(file);
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) yield* files(file, suffix, depth - 1);
      else if (stat.isFile() && file.endsWith(suffix)) yield file;
    } catch { /* Inaccessible or concurrently removed history. */ }
  }
}
/** Bounded line buffering; a malformed/oversized line cannot discard other sessions. */
function* jsonLines(file: string): Generator<Record<string, any>> {
  let fd: number | undefined;
  try {
    fd = openSync(file, "r");
    const buffer = Buffer.alloc(64 * 1024); const decoder = new StringDecoder("utf8"); let pending = ""; let oversized = false;
    for (;;) {
      const size = readSync(fd, buffer); if (!size) break;
      // Keep multibyte paths intact when a character spans chunks.
      pending += decoder.write(buffer.subarray(0, size));
      let index: number;
      while ((index = pending.indexOf("\n")) !== -1) {
        const line = pending.slice(0, index); pending = pending.slice(index + 1);
        if (!oversized) { try { yield object(JSON.parse(line)); } catch { /* damaged line */ } }
        oversized = false;
      }
      if (pending.length > 8 * 1024 * 1024) { pending = ""; oversized = true; }
    }
    pending += decoder.end();
    if (pending && !oversized) { try { yield object(JSON.parse(pending)); } catch { /* incomplete write */ } }
  } catch { /* Missing/unreadable history is not a harness failure. */ }
  finally { if (fd !== undefined) closeSync(fd); }
}
function homeRoots(home: string, env: NodeJS.ProcessEnv, prefix: string, setting: string): string[] {
  const roots = children(home).filter((path) => new RegExp(`[/\\\\]\\.${prefix}(?:$|[_-])`).test(path));
  if (env[setting]) roots.push(env[setting]!);
  return [...new Set(roots.filter(plain).map(normalPath))];
}
function claudeSamples(roots: string[], cwd: string): Sample[] {
  const messages = new Map<string, Sample>();
  for (const root of roots) for (const project of children(join(root, "projects"))) {
    // Claude encodes every non-alphanumeric worktree path character as '-'.
    if (project.split(/[\/\\]/).at(-1) !== cwd.replace(/[^a-zA-Z0-9]/g, "-")) continue;
    for (const file of files(project, ".jsonl")) {
      let row = 0;
      for (const entry of jsonLines(file)) {
        row++;
        if (entry.cwd !== undefined && !matches(entry.cwd, cwd)) continue;
        const message = object(entry.message); const usage = object(message.usage);
        if (!Object.keys(usage).length || !Number.isFinite(Date.parse(entry.timestamp))) continue;
        const sample: Sample = { tool: "Claude Code", ts: Date.parse(entry.timestamp), usage: { ...zero(), input: count(usage.input_tokens), cachedInput: count(usage.cache_read_input_tokens), cacheCreationInput: count(usage.cache_creation_input_tokens), output: count(usage.output_tokens) } };
        const key = typeof message.id === "string" ? message.id : `${file}:${row}`;
        const previous = messages.get(key);
        if (previous) {
          for (const k of Object.keys(sample.usage) as (keyof TokenUsage)[]) sample.usage[k] = Math.max(sample.usage[k], previous.usage[k]);
          sample.ts = Math.max(sample.ts, previous.ts);
        }
        messages.set(key, sample);
      }
    }
  }
  return [...messages.values()];
}
function codexSessions(roots: string[], cwd: string): CodexSession[] {
  const sessions = new Map<string, Map<number, TokenUsage>>();
  for (const root of roots) for (const file of files(join(root, "sessions"), ".jsonl")) {
    let session: Map<number, TokenUsage> | undefined;
    let identified = false;
    for (const entry of jsonLines(file)) {
      const payload = object(entry.payload);
      // Subagent rollouts may later repeat their parent's metadata. Only the
      // first metadata identifies this rollout; switching maps mixes counters.
      if (entry.type === "session_meta" && !identified) {
        identified = true;
        if (!matches(payload.cwd, cwd)) break;
        const id = typeof payload.id === "string" ? payload.id : file;
        session = sessions.get(id) ?? new Map(); sessions.set(id, session);
      }
      if (!session || entry.type !== "event_msg" || payload.type !== "token_count") continue;
      const usage = object(object(payload.info).total_token_usage);
      const ts = Date.parse(entry.timestamp);
      if (!Object.keys(usage).length || !Number.isFinite(ts)) continue;
      if (!["input_tokens", "output_tokens"].every((key) => typeof usage[key] === "number" && Number.isSafeInteger(usage[key]) && usage[key] >= 0)) continue;
      if (["cached_input_tokens", "reasoning_output_tokens"].some((key) => usage[key] !== undefined && (typeof usage[key] !== "number" || !Number.isSafeInteger(usage[key]) || usage[key] < 0))) continue;
      session.set(ts, { ...zero(), input: count(usage.input_tokens), cachedInput: count(usage.cached_input_tokens), output: count(usage.output_tokens), reasoningOutput: count(usage.reasoning_output_tokens) });
    }
  }
  return [...sessions.values()].map((session) => ({ samples: [...session.entries()].sort(([a], [b]) => a - b).map(([ts, usage]) => ({ ts, usage })) }));
}
function geminiSamples(roots: string[], cwd: string): Sample[] {
  const samples = new Map<string, Sample>();
  for (const root of roots) for (const project of children(join(root, "tmp"))) {
    try {
      if (!plain(project) || !lstatSync(project).isDirectory()) continue;
      const rootFile = join(project, ".project_root");
      if (!plain(rootFile) || !lstatSync(rootFile).isFile() || !matches(readFileSync(rootFile, "utf8").trim(), cwd)) continue;
      for (const file of files(join(project, "chats"), ".json")) {
        try {
          const data = object(JSON.parse(readFileSync(file, "utf8")));
          const session = typeof data.sessionId === "string" ? data.sessionId : file;
          for (const [i, value] of (Array.isArray(data.messages) ? data.messages : []).entries()) {
            const message = object(value); const usage = object(message.tokens); const ts = Date.parse(message.timestamp);
            if (!Object.keys(usage).length || !Number.isFinite(ts)) continue;
            samples.set(`${session}:${message.id ?? i}`, { tool: "Gemini CLI", ts, usage: { ...zero(), input: count(usage.input), cachedInput: count(usage.cached), output: count(usage.output), reasoningOutput: count(usage.thoughts), tool: count(usage.tool) } });
          }
        } catch { /* Invalid individual chat. */ }
      }
    } catch { /* Missing project marker. */ }
  }
  return [...samples.values()];
}
function aggregate(samples: Sample[], codex: CodexSession[], range: TimeStats, now: string): TokenStats[] {
  const start = range.start ? Date.parse(range.start) : Infinity;
  const end = Date.parse(range.done ?? range.finish ?? range.merge ?? now);
  return (["Claude Code", "Codex", "Gemini CLI", "Cursor", "Antigravity"] as TokenTool[]).map((tool) => {
    if (tool === "Codex") {
      const usage = zero(); let samples = 0;
      for (const session of codex) {
        const inside = session.samples.filter((s) => s.ts >= start && s.ts <= end);
        const last = inside.at(-1); if (!last) continue;
        const baseline = session.samples.findLast((s) => s.ts < start)?.usage ?? zero();
        const delta = zero();
        for (const key of Object.keys(delta) as (keyof TokenUsage)[]) delta[key] = Math.max(0, last.usage[key] - baseline[key]);
        add(usage, delta); samples += inside.length;
      }
      return { tool, status: samples ? "recorded" : "missing", usage, samples };
    }
    const matching = samples.filter((s) => s.tool === tool && s.ts > start && s.ts <= end);
    const usage = zero(); for (const s of matching) add(usage, s.usage);
    return { tool, status: matching.length ? "recorded" : "missing", usage, samples: matching.length };
  });
}
export function collectProjectStats(repo: Repo, ref: ProjectRef, options: TokenOptions = {}): FullStats {
  const home = options.home ?? homedir(); const env = options.env ?? process.env; const now = options.now ?? new Date().toISOString();
  const stats = collectStats(repo, ref, now, options.finishing);
  if (options.finishing) {
    stats.project.finish = now;
    stats.project.durationMs = stats.project.start ? Math.max(0, Date.parse(now) - Date.parse(stats.project.start)) : null;
  }
  const codex = homeRoots(home, env, "codex", "CODEX_HOME");
  const orca = join(home, "Library", "Application Support", "orca", "codex-runtime-home", "home");
  if (existsSync(orca) && plain(orca)) codex.push(orca);
  const header = readFileSync(join(repo.root, "projects", ref.dir, "PROJECT.md"), "utf8");
  const declared = /worktree:\s*`([^`]+)`/.exec(header)?.[1];
  // Resolve against the main checkout even when the worktree no longer exists.
  const workerPath = declared ? resolve(repo.mainRoot, declared) : ref.worktree;
  const samplesAt = (cwd: string) => [
    ...claudeSamples(homeRoots(home, env, "claude", "CLAUDE_CONFIG_DIR"), cwd),
    ...geminiSamples(homeRoots(home, env, "gemini", "GEMINI_CLI_HOME"), cwd),
  ];
  const samples = samplesAt(workerPath);
  const cumulative = codexSessions([...new Set(codex)], workerPath);
  const coordinatorTokens = normalPath(workerPath) === normalPath(repo.mainRoot) ? [] : aggregate(samplesAt(repo.mainRoot), codexSessions([...new Set(codex)], repo.mainRoot), { ...stats.project, finish: stats.project.merge ?? now }, now);
  return { ...stats, coordinatorTokens, tokens: aggregate(samples, cumulative, stats.project, now), taskTokens: stats.tasks.map((task) => ({ id: task.id, tokens: aggregate(samples, cumulative, task, now) })) };
}
export function formatProjectStats(stats: FullStats): string {
  const rows = (id: string, tokens: TokenStats[]) => tokens.map((t) => `| ${id} | ${t.tool} | ${t.status === "missing" ? "기록 없음" : `${t.usage.input} | ${t.usage.cachedInput} | ${t.usage.cacheCreationInput} | ${t.usage.output} | ${t.usage.reasoningOutput} | ${t.usage.tool}`} |`);
  return `${formatStats(stats)}\n\n| 대상 | 도구 | 입력 | 캐시 읽기 | 캐시 생성 | 출력 | 추론 | 도구 |\n|---|---|---|---|---|---|---|---|\n${[...rows(`${stats.project.id} 작업자`, stats.tokens), ...rows(`${stats.project.id} 코디네이터`, stats.coordinatorTokens), ...stats.taskTokens.flatMap((t) => rows(t.id, t.tokens))].join("\n")}\n\n캐시·추론은 도구별 의미가 다르므로 필드끼리 더하지 않습니다. Codex는 [착수, 완료] 마지막 누적값−착수 전 누적값을 rollout별로 계산하고, Claude/Gemini는 (착수, 완료] 메시지별 사용량입니다. 진행 중은 조회 시각까지. 작업 경과는 러닝 시간에서 질의 대기를 뺀 값이며, 승인/질의 대기는 질의와 finish→merge 대기의 합입니다. 계약 승인 전 대기는 기록 없음(start에서 과거 승인 확인).`;
}
