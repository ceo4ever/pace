import { mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { Daemon, type DaemonOptions } from "../src/daemon/core.ts";
import { defaultConfig, type DaemonConfig } from "../src/daemon/config.ts";
import { StateStore } from "../src/daemon/store.ts";
import type { Block, ChannelAdapter, ChannelCaps, ChannelSink, RunCtl, RunJob, RunResult, Runner } from "../src/daemon/types.ts";
import { tempDir } from "./helpers.ts";

export const CAPS: ChannelCaps = { maxLength: 4000, canEdit: false, buttons: false, richBlocks: false, commandPrefix: "/" };

export class FakeAdapter implements ChannelAdapter {
  readonly name: string;
  readonly caps: ChannelCaps;
  sink!: ChannelSink;
  sent: { conversation: string; blocks: Block[] }[] = [];
  prompts: { conversation: string; id: string }[] = [];
  failSend = false;
  constructor(name = "fake", caps: Partial<ChannelCaps> = {}) { this.name = name; this.caps = { ...CAPS, ...caps }; }
  async connect(sink: ChannelSink) { this.sink = sink; }
  async disconnect() {}
  async send(conversation: string, blocks: Block[]) { if (this.failSend) throw new Error("전송 실패"); this.sent.push({ conversation, blocks }); return null; }
  async askApproval(conversation: string, prompt: { id: string }) { this.prompts.push({ conversation, id: prompt.id }); }
  texts(): string[] { return this.sent.flatMap((s) => s.blocks.map((b) => (b.type === "text" ? b.text : JSON.stringify(b)))); }
}

/** 프롬프트로 구분하는 제어 가능한 실행자: release(prompt)가 풀어 줄 때까지 기다린다 */
export class ControlledRunner {
  started: string[] = [];
  running = 0;
  maxRunning = 0;
  jobs: RunJob[] = [];
  private gates = new Map<string, (r: Partial<RunResult>) => void>();
  private ctls = new Map<string, RunCtl>();
  /** 취소 신호를 받으면 이 값으로 끝낸다 */
  onAbort: Partial<RunResult> = { status: "cancelled", cleanupUnconfirmed: false, text: "" };
  immediate = new Set<string>();
  readonly run: Runner = async (job, ctl) => {
    this.started.push(job.prompt);
    this.jobs.push(job);
    this.running++;
    this.maxRunning = Math.max(this.maxRunning, this.running);
    this.ctls.set(job.prompt, ctl);
    try {
      if (this.immediate.has(job.prompt)) return { status: "done", text: `끝:${job.prompt}`, cleanupUnconfirmed: false };
      const result = await new Promise<Partial<RunResult>>((resolve) => {
        this.gates.set(job.prompt, resolve);
        ctl.signal.addEventListener("abort", () => resolve(this.onAbort), { once: true });
      });
      return { status: "done", text: `끝:${job.prompt}`, cleanupUnconfirmed: false, ...result } as RunResult;
    } finally { this.running--; }
  };
  release(prompt: string, result: Partial<RunResult> = {}) { this.gates.get(prompt)?.(result); }
  ctl(prompt: string) { return this.ctls.get(prompt)!; }
  async waitStarted(prompt: string, ms = 3000) {
    const end = Date.now() + ms;
    while (!this.started.includes(prompt)) { if (Date.now() > end) throw new Error(`시작되지 않음: ${prompt}`); await new Promise((r) => setTimeout(r, 5)); }
  }
}

export interface Harness {
  daemon: Daemon;
  adapter: FakeAdapter;
  runner: ControlledRunner;
  store: StateStore;
  home: string;
  config: DaemonConfig;
  dirs: Record<string, string>;
  restart(extra?: Partial<DaemonOptions>): Promise<Harness>;
}

export interface HarnessOptions { workspaces?: string[]; maxConcurrent?: number; config?: Partial<DaemonConfig>; home?: string; extra?: Partial<DaemonOptions>; runner?: ControlledRunner; adapterCaps?: Partial<ChannelCaps>; adapterFailSend?: boolean }

export async function harness(options: HarnessOptions = {}): Promise<Harness> {
  const home = options.home ?? tempDir();
  const dirs: Record<string, string> = {};
  const config = defaultConfig();
  config.maxConcurrent = options.maxConcurrent ?? 2;
  config.approvalTtlSeconds = 600;
  config.allowedUsers = { fake: ["u1", "u2"] };
  config.workspaces = (options.workspaces ?? ["a", "b"]).map((name) => {
    const path = join(home, "ws", name);
    mkdirSync(path, { recursive: true });
    dirs[name] = realpathSync.native(path);
    return { name, path, worktrees: { main: path } };
  });
  Object.assign(config, options.config);
  const store = StateStore.open(home);
  const runner = options.runner ?? new ControlledRunner();
  const adapter = new FakeAdapter("fake", options.adapterCaps);
  adapter.failSend = options.adapterFailSend === true;
  const daemon = new Daemon({ config, store, runner: runner.run, sweepMs: 20, snapshot: () => ({ head: "h", index: "i", worktree: "w", pace: "o", ignored: "g" }), summarize: () => "요약", ...options.extra });
  await daemon.start();
  await daemon.addAdapter(adapter);
  return {
    daemon, adapter, runner, store, home, config, dirs,
    async restart(extra = {}) { return harness({ ...options, home, runner, extra: { ...options.extra, ...extra } }); },
  };
}

export const msg = (text: string, id: string, user = "u1", conversation = "c1") => ({ channel: "fake", conversation, user, messageId: id, text });
export const actor = (user = "u1", conversation = "c1") => ({ channel: "fake", conversation, user });
