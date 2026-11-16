import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { main } from "../src/cli.ts";
import { buildLauncher, launcherPath, RUN_VALUE } from "../src/daemon/autostart.ts";
import { FakeSystem } from "./fake-system.ts";
import { runPace, tempDir } from "./helpers.ts";

/** HOME·USERPROFILE·PACE_HOME을 임시 폴더로 바꾸고 표준 출력을 모아 main(argv)을 부른다 */
async function installInProcess(home: string, sys: FakeSystem): Promise<{ code: number; text: string }> {
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, PACE_HOME: process.env.PACE_HOME, PACE_FROM_SCRIPT: process.env.PACE_FROM_SCRIPT };
  const write = process.stdout.write.bind(process.stdout);
  let text = "";
  process.env.HOME = home; process.env.USERPROFILE = home; process.env.PACE_HOME = join(home, ".pace"); delete process.env.PACE_FROM_SCRIPT;
  (process.stdout as unknown as { write: (chunk: string) => boolean }).write = (chunk: string) => { text += chunk; return true; };
  try {
    const code = await main(["install"], { autostart: { runner: sys.runner, platform: "win32" } });
    return { code, text };
  } finally {
    process.stdout.write = write;
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
}

test("S-9 daemon을 등록하지 않은 기기에서 pace install(실제 CLI 프로세스)은 daemon 문구도 등록 파일도 만들지 않는다", () => {
  const home = tempDir("pace-home-");
  const result = runPace(["install"], { home, timeout: 60_000 });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /daemon/i);
  assert.ok(!existsSync(join(home, "daemon-launch.vbs")));
  assert.ok(!readdirSync(home).some((f) => /daemon-launch|\.plist$/.test(f)));
});

test("S-9b 설치 진입점이 갱신을 실제로 호출한다: 등록된 런처가 설치본 경로로 바뀌고 설치기 출력에 한 줄", async () => {
  const home = tempDir("pace-home-");
  const dataHome = join(home, ".pace");
  mkdirSync(dataHome, { recursive: true });
  const sys = new FakeSystem();
  const worktreeBin = "D:\\x\\pace.wt\\P035\\bin\\pace.ts";
  writeFileSync(launcherPath(dataHome), buildLauncher({ nodePath: "C:\\node.exe", binPath: worktreeBin, home: dataHome, defaultHome: dataHome }));
  sys.registry.set(RUN_VALUE, `wscript.exe //B //Nologo "${launcherPath(dataHome)}"`);
  const { code, text } = await installInProcess(home, sys);
  assert.equal(code, 0);
  const installedBin = join(home, ".pace", "app", "bin", "pace.ts");
  const vbs = readFileSync(launcherPath(dataHome)).subarray(2).toString("utf16le");
  assert.ok(vbs.includes(installedBin) && !vbs.includes("pace.wt"));
  assert.equal(text.split("\n").filter((l) => /새 설치본으로 갱신했다/.test(l)).length, 1);
  assert.equal(sys.registry.size, 1);
  assert.ok(!sys.calls.some((c) => c.command === "reg" && c.args[0] !== "query"), "재설치는 레지스트리를 조회만 한다");
});

test("S-9b 등록이 없으면 같은 진입점이 한 줄도 내지 않고 가짜 레지스트리도 묻지 않는다", async () => {
  const home = tempDir("pace-home-");
  const sys = new FakeSystem();
  const { code, text } = await installInProcess(home, sys);
  assert.equal(code, 0);
  assert.doesNotMatch(text, /daemon/i);
  assert.equal(sys.calls.length, 0);
  assert.ok(!existsSync(launcherPath(join(home, ".pace"))));
});
