/** 부트 조회 성능 실험. 운영 경로를 바꾸지 않는다. 결과: 지정 폴더/results.json. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { cpus, platform, release, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { bootNotice, buildBootContext } from "../src/boot.ts";
import { createProfile } from "../src/profile/profile.ts";
import { listMemories } from "../src/memory/memory.ts";

const self = fileURLToPath(import.meta.url);
const repo = fileURLToPath(new URL("../", import.meta.url));
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const estimate = (value: string) => {
  let ascii = 0, other = 0;
  for (const char of value) { if (char.codePointAt(0)! < 128) ascii++; else other++; }
  return Math.ceil(ascii / 4 + other / 2);
};
function summary(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.ceil(p * sorted.length) - 1]!;
  return { n: sorted.length, p50: at(0.5), p95: at(0.95), min: sorted[0]!, max: sorted.at(-1)! };
}
function timed<T>(fn: () => T): { ms: number; value: T } {
  const start = performance.now();
  const value = fn();
  return { ms: performance.now() - start, value };
}
function row(path: string, text: string) {
  return { at: new Date().toISOString(), path, sha256: hash(text), chars: text.length, bytes: Buffer.byteLength(text), estimatedTokens: estimate(text), tokenMethod: "ascii/4 + non-ascii/2 heuristic", cacheHit: false };
}
function bundle(root: string, files: string[], mode: "read" | "observe" | "log"): string {
  const rows: (ReturnType<typeof row> & { readMs: number })[] = [];
  const texts = files.map((file) => {
    const start = performance.now();
    const text = readFileSync(join(root, file), "utf8");
    const readMs = performance.now() - start;
    if (mode !== "read") rows.push({ ...row(file, text), readMs });
    return `## ${file}\n${text}\n`;
  });
  if (mode === "log") appendFileSync(join(root, "boot-log.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return texts.join("");
}

if (process.argv[2] === "--read") {
  const manifest = JSON.parse(readFileSync(process.argv[3]!, "utf8")) as { root: string; files: string[] };
  process.stdout.write(bundle(manifest.root, manifest.files, process.argv[4] === "log" ? "log" : "read"));
} else {
  const out = resolve(process.argv[2] ?? join(tmpdir(), "pace-boot-bench-results"));
  mkdirSync(out, { recursive: true });
  const root = mkdtempSync(join(tmpdir(), "pace-boot-bench-"));
  const env: NodeJS.ProcessEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(ORCA_|CLAUDE_|CODEX_|GEMINI_|CURSOR_|PACE_|GIT_)/.test(key) && !["TERM_PROGRAM", "CLAUDECODE"].includes(key)));
  Object.assign(env, { HOME: root, USERPROFILE: root, PACE_HOME: join(root, "home"), PACE_PROFILE: "", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_TEMPLATE_DIR: "", GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z" });
  // buildBootContext 안의 git 호출도 같은 격리 환경을 물려받는다. 이 실험 프로세스에만 적용된다.
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, env);
  function command(bin: string, args: string[], cwd = root) {
    const result = spawnSync(bin, args, { cwd, env, input: "", encoding: "utf8", timeout: 15_000, maxBuffer: 4 * 1024 * 1024 });
    assert.equal(result.status, 0, result.error?.message ?? result.stderr);
    return result.stdout;
  }
  try {
    const fileCases = [];
    for (const count of [4, 24, 104]) {
      const dir = join(root, `files-${count}`);
      mkdirSync(dir);
      const files = Array.from({ length: count }, (_, i) => `file-${String(i).padStart(3, "0")}.md`);
      files.forEach((file, i) => writeFileSync(join(dir, file), `# Synthetic boot source ${i}\n` + "자비스 프로젝트 역할과 지식 위치. Jarvis project role and knowledge paths.\n".repeat(16)));
      const firstRead = timed(() => bundle(dir, files, "read"));
      const expected = firstRead.value;
      const first = timed(() => bundle(dir, files, "log"));
      assert.equal(first.value, expected);
      const samples: Record<string, number[]> = { read: [], observe: [], log: [], added: [] };
      const modes = ["read", "observe", "log"] as const;
      for (let i = 0; i < 200; i++) {
        const pair: Record<string, number> = {};
        for (let j = 0; j < modes.length; j++) {
          const mode = modes[(i + j) % modes.length]!;
          const sample = timed(() => bundle(dir, files, mode));
          assert.equal(sample.value, expected);
          samples[mode]!.push(sample.ms);
          pair[mode] = sample.ms;
        }
        samples.added!.push(pair.log! - pair.read!);
      }
      const lines = readFileSync(join(dir, "boot-log.jsonl"), "utf8").trimEnd().split("\n");
      assert.equal(lines.length, 201 * count);
      for (const line of lines) {
        const event = JSON.parse(line) as ReturnType<typeof row>;
        assert.ok(files.includes(event.path));
        assert.equal(event.sha256, hash(readFileSync(join(dir, event.path), "utf8")));
        assert.ok(!("text" in event));
      }
      writeFileSync(join(out, `boot-log-${count}.sample.jsonl`), lines.slice(0, count).join("\n") + "\n");
      const processSamples: Record<string, number[]> = { batch: [], batchLog: [], perFile: [] };
      if (count <= 24) {
        const manifest = join(dir, "manifest.json");
        writeFileSync(manifest, JSON.stringify({ root: dir, files }));
        const singleManifests = files.map((file, i) => {
          const name = join(dir, `single-${i}.json`);
          writeFileSync(name, JSON.stringify({ root: dir, files: [file] }));
          return name;
        });
        for (let i = 0; i < 12; i++) {
          const calls = {
            batch: () => command(process.execPath, [self, "--read", manifest]),
            batchLog: () => command(process.execPath, [self, "--read", manifest, "log"]),
            perFile: () => singleManifests.map((path) => command(process.execPath, [self, "--read", path])).join(""),
          };
          const keys = ["batch", "batchLog", "perFile"] as const;
          for (let j = 0; j < keys.length; j++) {
            const key = keys[(i + j) % keys.length]!;
            const sample = timed(calls[key]);
            assert.equal(sample.value, expected);
            processSamples[key]!.push(sample.ms);
          }
        }
      }
      fileCases.push({ count, payloadBytes: Buffer.byteLength(expected), firstReadMs: firstRead.ms, firstLoggedMs: first.ms, note: "first logged run after baseline read; OS cold cache is not claimed", samplesMs: samples, summaryMs: Object.fromEntries(Object.entries(samples).map(([k, v]) => [k, summary(v)])), processSamplesMs: processSamples, processSummaryMs: Object.fromEntries(Object.entries(processSamples).filter(([, v]) => v.length).map(([k, v]) => [k, summary(v)])) });
    }
    const home = env.PACE_HOME!;
    const profile = createProfile(home, { name: "default", displayName: "Benchmark Jarvis", alias: "bench", ownerName: "Synthetic User", tone: "존댓말", personality: "간결", language: "ko" });
    const cwd = join(root, "project");
    mkdirSync(join(cwd, ".pace", "memory"), { recursive: true });
    writeFileSync(join(cwd, "AGENTS.md"), "# Synthetic project\n");
    for (const dir of [join(profile, "memory"), join(cwd, ".pace", "memory")]) {
      for (let i = 0; i < 20; i++) writeFileSync(join(dir, `note-${i}.md`), `---\ntype: ${dir.startsWith(profile) ? "rule" : "note"}\nname: Synthetic note ${i}\ndescription: Synthetic project context ${i}\ncreated: 2026-11-01\nupdated: 2026-11-01\n---\n\nSynthetic fixture only.\n`);
      assert.equal(listMemories(dir).length, 20);
    }
    command("git", ["init", "-b", "main", cwd]);
    command("git", ["add", "."], cwd);
    command("git", ["-c", "core.hooksPath=/dev/null", "-c", "user.name=Benchmark", "-c", "user.email=benchmark@example.invalid", "commit", "-m", "synthetic fixture"], cwd);
    const options = { home, cwd, env, userHome: root };
    const observationOnlyMs: number[] = [];
    function current(logged: boolean) {
      const context = buildBootContext(options);
      assert.ok(context.includes("## SOUL") && context.includes("Synthetic note 0"));
      bootNotice(options);
      if (logged) {
        const start = performance.now();
        appendFileSync(join(root, "current-boot-log.jsonl"), context.split(/(?=^## )/m).map((section, i) => JSON.stringify(row(`rendered-section-${i}`, section))).join("\n") + "\n");
        observationOnlyMs.push(performance.now() - start);
      }
      return context;
    }
    const currentSamples = { baseline: [] as number[], logged: [] as number[], added: [] as number[] };
    for (let i = 0; i < 40; i++) {
      const modes = i % 2 ? [true, false] : [false, true];
      const pair = new Map<boolean, number>();
      const outputs = [];
      for (const logged of modes) {
        const sample = timed(() => current(logged));
        currentSamples[logged ? "logged" : "baseline"].push(sample.ms);
        pair.set(logged, sample.ms);
        outputs.push(sample.value);
      }
      assert.equal(outputs[0], outputs[1]);
      currentSamples.added.push(pair.get(true)! - pair.get(false)!);
    }
    const cliSamples = Array.from({ length: 20 }, () => timed(() => {
      const output = command(process.execPath, [join(repo, "bin", "pace.ts"), "boot", "--host", "plain", "--cwd", cwd]);
      assert.ok(output.startsWith("[PACE-BOOT] 프로필: default") && output.includes("## SOUL") && !output.includes("부트 실패:"));
      return output;
    }).ms);
    const breached = fileCases.filter((c) => c.summaryMs.added!.p95 > 20 || c.summaryMs.log!.p95 > 100).map((c) => c.count);
    const result = {
      recordedAt: new Date().toISOString(), environment: { node: process.version, platform: platform(), release: release(), cpu: cpus()[0]?.model, logicalCpus: cpus().length },
      method: { appCache: false, osCache: "not flushed", tokenEstimate: "unvalidated ASCII/4 + non-ASCII/2 heuristic; not model tokens", log: "buffered append, no fsync", loopSamples: 200, processSamples: 12, currentSamples: 40, cliSamples: 20, scope: "local file IO, metadata, logging and Node process costs; no host transport, model prefill, provider caching or first response measurement" },
      fileCases, currentBoot: { fixture: "20 profile rules + 20 project notes, synthetic git repository", samplesMs: currentSamples, summaryMs: Object.fromEntries(Object.entries(currentSamples).map(([k, v]) => [k, summary(v)])), observationOnlySamplesMs: observationOnlyMs, observationOnlySummaryMs: summary(observationOnlyMs), cliSamplesMs: cliSamples, cliSummaryMs: summary(cliSamples) },
      cacheDecision: { threshold: "file bundle logged p95 >100ms OR paired additional p95 >20ms; provisional local threshold", breachedFileCounts: breached, currentAdditionalBreached: summary(currentSamples.added).p95 > 20, candidate: breached.length > 0 || summary(currentSamples.added).p95 > 20 },
    };
    writeFileSync(join(out, "results.json"), JSON.stringify(result, null, 2) + "\n");
    process.stdout.write(JSON.stringify({ fileCases: fileCases.map((c) => ({ count: c.count, bytes: c.payloadBytes, summaryMs: c.summaryMs, processSummaryMs: c.processSummaryMs })), currentBoot: result.currentBoot.summaryMs, observationOnly: result.currentBoot.observationOnlySummaryMs, cli: result.currentBoot.cliSummaryMs, cacheDecision: result.cacheDecision }, null, 2) + "\n");
  } finally { rmSync(root, { recursive: true, force: true }); }
}
