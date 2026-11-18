import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Preserve the nested runner's whole TAP, which the existing wrapper truncates on failure.
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");
const out = join(here, "evidence", `nested-diagnostic-${new Date().toISOString().replace(/[:.]/g, "-")}`);
mkdirSync(out, { recursive: true });
const temp = mkdtempSync(join(tmpdir(), "pace-p004-nested-"));
const env: NodeJS.ProcessEnv = { ...process.env, TMP: temp, TEMP: temp, TMPDIR: temp, PACE_HOME: join(temp, "pace-home") };
delete env.NODE_TEST_CONTEXT;
const selected = process.argv[2];
const names = readdirSync(join(root, "test/playbook")).filter((name) => name.endsWith(".test.mjs") && (!selected || name === selected));
if (names.length === 0) throw new Error("Unknown nested test file");
const files = names.map((name) => join(root, "test/playbook", name));
const argv = ["--test", "--test-reporter=tap", ...files];
const log = join(out, "nested.log");
writeFileSync(log, "");
const started = new Date().toISOString(), begin = performance.now();
const child = spawn(process.execPath, argv, { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
child.stdout.on("data", (data: Buffer) => appendFileSync(log, data));
child.stderr.on("data", (data: Buffer) => appendFileSync(log, data));
child.on("error", (error) => { process.exitCode = 1; appendFileSync(log, String(error)); });
child.on("close", (status, signal) => {
  writeFileSync(join(out, "result.json"), JSON.stringify({ started, ended: new Date().toISOString(), elapsedMs: performance.now() - begin, status, signal, temp, argv }, null, 2) + "\n");
  process.exitCode = status ?? 1;
  console.log(`Nested diagnostic exit ${status}: ${out}`);
});
console.log(`Nested diagnostic: ${out}`);
