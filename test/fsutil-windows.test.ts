import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { tempDir } from "./helpers.ts";

test("원자적 파일 교체는 Windows의 일시적 공유 위반을 기다리고 내용을 보존한다", () => {
  const dir = tempDir();
  const path = join(dir, "data.txt");
  const preload = join(dir, "rename-race.mjs");
  writeFileSync(path, "before");
  writeFileSync(preload, `import fs from "node:fs"; import {syncBuiltinESMExports} from "node:module";
const rename=fs.renameSync; let left=30; const target=${JSON.stringify(path)};
fs.renameSync=function(source,dest) { if(process.platform==="win32" && String(dest)===target && left-- > 0) throw Object.assign(new Error("sharing violation"),{code:"EPERM"}); return rename(source,dest); }; syncBuiltinESMExports();`);
  const script = `import {writeFileAtomic} from ${JSON.stringify(new URL("../src/core/fsutil.ts", import.meta.url).href)}; writeFileAtomic(${JSON.stringify(path)}, "after");`;
  const result = spawnSync(process.execPath, [`--import=${pathToFileURL(preload).href}`, "--input-type=module", "-e", script], { encoding: "utf8", timeout: 5000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(readFileSync(path, "utf8"), "after");
});

test("원자적 파일 교체가 계속 실패하면 이전 내용을 보존하고 멈춘다", () => {
  const dir = tempDir();
  const path = join(dir, "data.txt");
  const preload = join(dir, "rename-failure.mjs");
  writeFileSync(path, "before");
  writeFileSync(preload, `import fs from "node:fs"; import {syncBuiltinESMExports} from "node:module";
let attempts=0; process.on("exit",()=>console.log(attempts));
fs.renameSync=function() { attempts++; throw Object.assign(new Error("cannot replace"),{code:"EPERM"}); }; syncBuiltinESMExports();`);
  const script = `import {writeFileAtomic} from ${JSON.stringify(new URL("../src/core/fsutil.ts", import.meta.url).href)}; try { writeFileAtomic(${JSON.stringify(path)}, "after"); process.exitCode=2; } catch {}`;
  const result = spawnSync(process.execPath, [`--import=${pathToFileURL(preload).href}`, "--input-type=module", "-e", script], { encoding: "utf8", timeout: 5000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stdout.trim(), process.platform === "win32" ? "101" : "1");
  assert.equal(readFileSync(path, "utf8"), "before");
  assert.deepEqual(readdirSync(dir).filter((name) => name.endsWith(".tmp")), []);
});
