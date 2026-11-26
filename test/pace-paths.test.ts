import { test } from "node:test";
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { paceHome } from "../src/core/paths.ts";
import { PACE_BIN, sessionFreeEnv, tempDir } from "./helpers.ts";

test("PACE home defaults to ~/.pace", () => {
  assert.equal(paceHome({ PACE_HOME: "pace-home" }), "pace-home");
  assert.equal(paceHome({}), join(homedir(), ".pace"));
});

test("PACE CLI reports the product version", () => {
  const home = tempDir();
  const result = spawnSync(process.execPath, [PACE_BIN, "--version"], { encoding: "utf8", env: { ...sessionFreeEnv(), PACE_HOME: home, HOME: home, USERPROFILE: home } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "0.1.4");
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
  assert.equal(manifest.version, "0.1.4");
  assert.equal(lock.version, "0.1.4");
  assert.equal(lock.packages[""].version, "0.1.4");
  assert.deepEqual(manifest.bin, { pace: "bin/pace.ts" });
});
