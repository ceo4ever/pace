import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { daemonCommand } from "../src/daemon/cli.ts";
import { buildLauncher, launcherPath, plistPath, refreshAutostart, RUN_VALUE, type AutostartEnv } from "../src/daemon/autostart.ts";
import { FakeSystem } from "./fake-system.ts";
import { tempDir } from "./helpers.ts";

const NODE = "C:\\Program Files\\nodejs\\node.exe";
const BIN = "C:\\Users\\캡틴 & 사용자\\pace.wt\\P035\\bin\\pace.ts";

function setup(platform: NodeJS.Platform = "win32") {
  const home = tempDir("pace-home-");
  const sys = new FakeSystem();
  const out: string[] = [];
  const launchAgentsDir = join(tempDir("pace-la-"), "LaunchAgents");
  const run = (args: string[], extra: Record<string, unknown> = {}) => {
    process.env.PACE_HOME = home;
    return daemonCommand(args, { runner: sys.runner, out: (l) => out.push(l), platform, nodePath: NODE, binPath: BIN, interactive: false, chainFile: join(home, "chains.json"), launchAgentsDir, ...extra });
  };
  return { home, sys, out, run, launchAgentsDir };
}
type Setup = ReturnType<typeof setup>;
const envOf = (s: Setup, platform: NodeJS.Platform = "win32", binPath = BIN): AutostartEnv => ({ platform, runner: s.sys.runner, home: s.home, defaultHome: join(s.home, "..default"), nodePath: NODE, binPath, launchAgentsDir: s.launchAgentsDir });
function chain(home: string) { writeFileSync(join(home, "chains.json"), JSON.stringify({ chains: { default: { steps: [{ agent: "codex", mode: "p" }] } } })); }
const decodeVbs = (file: string) => readFileSync(file).subarray(2).toString("utf16le");

test("S-2 등록이 액세스 거부로 실패하면 cp949 오류가 깨지지 않은 한글로 나오고 종료 1", async () => {
  const s = setup(); chain(s.home);
  s.sys.denyRegAdd = true;
  assert.equal(await s.run(["install", "--yes"]), 1);
  assert.match(s.out.join("\n"), /실패: reg — 액세스가 거부되었습니다\./);
});

test("S-3 Windows 등록: HKCU Run 값 한 개 + UTF-16 숨김 VBS 런처, 작업 스케줄러 생성 없음", async () => {
  const s = setup(); chain(s.home);
  assert.equal(await s.run(["install", "--yes"]), 0);
  assert.equal(s.sys.registry.size, 1);
  const value = s.sys.registry.get(RUN_VALUE)!;
  assert.match(value, /^wscript\.exe \/\/B \/\/Nologo "/);
  assert.ok(value.includes(launcherPath(s.home)));
  const add = s.sys.calls.find((c) => c.command === "reg" && c.args[0] === "add")!;
  assert.deepEqual(add.args.slice(0, 4), ["add", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "/v", RUN_VALUE]);
  assert.ok(add.args.includes("/f"));
  assert.ok(!s.sys.calls.some((c) => c.command === "schtasks" && c.args[0] === "/Create"));
  const raw = readFileSync(launcherPath(s.home));
  assert.deepEqual([raw[0], raw[1]], [0xff, 0xfe], "UTF-16LE BOM");
  const vbs = decodeVbs(launcherPath(s.home));
  assert.match(vbs, /sh\.Run ".*", 0, False/); // 창 스타일 0 = 숨김, 기다리지 않음
  assert.ok(vbs.includes(`""${NODE}"" ""${BIN}"" daemon run`), "공백·&·한글 경로는 따옴표로 감싸고 VBS 문자열 안에서 큰따옴표를 두 번 쓴다");
  assert.ok(vbs.includes(`sh.Environment("Process")("PACE_HOME") = "${s.home}"`), "기본 폴더가 아니면 런처가 PACE_HOME을 설정한다");
  assert.doesNotMatch(s.out.join("\n"), /약관|확인 전/);
});

test("S-3 런처는 데이터 폴더가 기본 폴더면 PACE_HOME을 설정하지 않고 경로의 큰따옴표를 이스케이프한다", () => {
  const vbs = buildLauncher({ nodePath: 'C:\\n"x\\node.exe', binPath: "C:\\b\\pace.ts", home: "C:\\h", defaultHome: "C:\\h" }).subarray(2).toString("utf16le");
  assert.doesNotMatch(vbs, /PACE_HOME/);
  assert.ok(vbs.includes('""C:\\n""x\\node.exe""'));
});

test("S-4 같은 install을 두 번 해도 항목 하나, uninstall은 값·런처를 지우고 두 번째는 이미 없음·종료 0", async () => {
  const s = setup(); chain(s.home);
  assert.equal(await s.run(["install", "--yes"]), 0);
  assert.equal(await s.run(["install", "--yes"]), 0);
  assert.equal(s.sys.registry.size, 1);
  s.out.length = 0;
  assert.equal(await s.run(["uninstall", "--yes"]), 0);
  assert.equal(s.sys.registry.size, 0);
  assert.ok(!existsSync(launcherPath(s.home)));
  assert.match(s.out.join("\n"), /해제했다/);
  s.out.length = 0;
  const deletesBefore = s.sys.calls.filter((c) => c.command === "reg" && c.args[0] === "delete").length;
  assert.equal(await s.run(["uninstall", "--yes"]), 0);
  assert.match(s.out.join("\n"), /이미 없음/);
  assert.equal(s.sys.calls.filter((c) => c.command === "reg" && c.args[0] === "delete").length, deletesBefore, "등록이 없으면 reg delete를 부르지 않는다");
});

test("S-5 기존 작업 스케줄러 항목을 건드리지 않고 등록한다", async () => {
  const s = setup(); chain(s.home);
  s.sys.legacyTask = true; s.sys.legacyDeleteDenied = true;
  assert.equal(await s.run(["install", "--yes"]), 0);
  assert.equal(s.sys.registry.size, 1);
  assert.equal(s.sys.legacyTask, true);
  assert.ok(!s.sys.calls.some((c) => c.command === "schtasks"));
});

test("S-6 macOS: plist를 쓰고 launchctl load, 해제는 unload 뒤 plist 삭제", async () => {
  const s = setup("darwin"); chain(s.home);
  assert.equal(await s.run(["install", "--yes"]), 0);
  const plist = plistPath({ launchAgentsDir: s.launchAgentsDir });
  const xml = readFileSync(plist, "utf8");
  assert.ok(xml.includes("<string>io.pace.daemon</string>"));
  assert.ok(xml.includes(s.home.replace(/&/g, "&amp;")), "PACE_HOME");
  assert.ok(s.sys.calls.some((c) => c.command === "launchctl" && c.args[0] === "load" && c.args[1] === plist));
  assert.equal(await s.run(["uninstall", "--yes"]), 0);
  assert.ok(s.sys.calls.some((c) => c.command === "launchctl" && c.args[0] === "unload"));
  assert.ok(!existsSync(plist));
});

test("S-7 재설치: worktree 경로로 등록한 런처가 새 설치본 경로로 바뀌고 한 줄 결과, 레지스트리 값은 그대로", async () => {
  const s = setup(); chain(s.home);
  const worktreeBin = "D:\\DockerStudio\\services\\pace.wt\\P035\\bin\\pace.ts";
  const installed = "C:\\Users\\u\\.pace\\app\\bin\\pace.ts";
  assert.equal(await s.run(["install", "--yes"], { binPath: worktreeBin }), 0);
  const before = s.sys.registry.get(RUN_VALUE);
  assert.ok(decodeVbs(launcherPath(s.home)).includes("pace.wt"));
  const line = refreshAutostart(envOf(s, "win32", installed));
  assert.match(line ?? "", /새 설치본으로 갱신했다/);
  const vbs = decodeVbs(launcherPath(s.home));
  assert.ok(vbs.includes(installed) && !vbs.includes("pace.wt"));
  assert.equal(s.sys.registry.get(RUN_VALUE), before);
  assert.equal(refreshAutostart(envOf(s, "win32", installed)), null, "이미 같으면 아무 줄도 없다");
});

test("S-8 등록이 없으면 갱신은 아무것도 하지 않고 레지스트리도 묻지 않는다", () => {
  const none = setup();
  assert.equal(refreshAutostart(envOf(none)), null);
  assert.equal(none.sys.calls.length, 0, "런처가 없으면 reg 호출 0");
  assert.ok(!existsSync(launcherPath(none.home)));
  // 런처는 있으나 레지스트리 값이 없다
  const orphan = setup();
  writeFileSync(launcherPath(orphan.home), "old");
  assert.equal(refreshAutostart(envOf(orphan)), null);
  assert.equal(readFileSync(launcherPath(orphan.home), "utf8"), "old");
  // 레지스트리 값이 다른 PACE_HOME의 런처를 가리킨다
  const other = setup();
  writeFileSync(launcherPath(other.home), "old");
  other.sys.registry.set(RUN_VALUE, 'wscript.exe //B //Nologo "C:\\elsewhere\\daemon-launch.vbs"');
  assert.equal(refreshAutostart(envOf(other)), null);
  assert.equal(readFileSync(launcherPath(other.home), "utf8"), "old");
  assert.equal(other.sys.registry.size, 1);
});

test("S-7m macOS 재설치: 옛 경로 plist는 새 경로로, plist가 없거나 다른 PACE_HOME이면 변경 0·launchctl 호출 0", () => {
  const s = setup("darwin");
  const env = (bin: string, home = s.home): AutostartEnv => ({ ...envOf(s, "darwin", bin), home });
  assert.equal(refreshAutostart(env("/opt/pace/bin/pace.ts")), null, "plist 없음");
  const plist = plistPath({ launchAgentsDir: s.launchAgentsDir });
  mkdirSync(dirname(plist), { recursive: true });
  writeFileSync(plist, `<plist><dict><key>Label</key><string>io.pace.daemon</string><key>ProgramArguments</key><array><string>/n</string><string>/wt/bin/pace.ts</string></array><key>EnvironmentVariables</key><dict><key>PACE_HOME</key><string>${s.home}</string></dict></dict></plist>`);
  assert.match(refreshAutostart(env("/home/u/.pace/app/bin/pace.ts")) ?? "", /새 설치본으로 갱신했다/);
  assert.ok(readFileSync(plist, "utf8").includes("/home/u/.pace/app/bin/pace.ts"));
  const before = readFileSync(plist, "utf8");
  assert.equal(refreshAutostart(env("/x/pace.ts", join(s.home, "other"))), null, "다른 PACE_HOME의 plist는 건드리지 않는다");
  assert.equal(readFileSync(plist, "utf8"), before);
  assert.equal(s.sys.calls.filter((c) => c.command === "launchctl").length, 0);
});

test("S-6p macOS: plist에 등록 때의 PATH를 넣어 launchd에서도 실행기를 찾는다", async () => {
  const s = setup("darwin"); chain(s.home);
  assert.equal(await s.run(["install", "--yes"], { path: "/Users/u/.local/bin:/usr/bin:/bin" }), 0);
  const xml = readFileSync(plistPath({ launchAgentsDir: s.launchAgentsDir }), "utf8");
  assert.match(xml, /<key>EnvironmentVariables<\/key><dict><key>PATH<\/key><string>\/Users\/u\/\.local\/bin:\/usr\/bin:\/bin<\/string><key>PACE_HOME<\/key>/);
});

test("S-6q macOS: PATH가 없으면 EnvironmentVariables에 PATH를 넣지 않는다", async () => {
  const s = setup("darwin"); chain(s.home);
  assert.equal(await s.run(["install", "--yes"], { path: undefined }), 0);
  assert.ok(!readFileSync(plistPath({ launchAgentsDir: s.launchAgentsDir }), "utf8").includes("<key>PATH</key>"));
});

test("S-7p macOS 재설치: PATH 없는 옛 plist에 PATH를 더하고, 이미 있는 PATH는 바꾸지 않는다", () => {
  const s = setup("darwin");
  const env = (path: string): AutostartEnv => ({ ...envOf(s, "darwin", "/home/u/.pace/app/bin/pace.ts"), path });
  const plist = plistPath({ launchAgentsDir: s.launchAgentsDir });
  mkdirSync(dirname(plist), { recursive: true });
  writeFileSync(plist, `<plist><dict><key>Label</key><string>io.pace.daemon</string><key>ProgramArguments</key><array><string>${NODE}</string><string>/home/u/.pace/app/bin/pace.ts</string><string>daemon</string><string>run</string></array><key>EnvironmentVariables</key><dict><key>PACE_HOME</key><string>${s.home}</string></dict><key>RunAtLoad</key><true/></dict></plist>`);
  assert.match(refreshAutostart(env("/a:/usr/bin")) ?? "", /갱신했다/, "같은 실행 경로여도 PATH가 없으면 갱신");
  assert.match(readFileSync(plist, "utf8"), /<dict><key>PATH<\/key><string>\/a:\/usr\/bin<\/string><key>PACE_HOME<\/key>/);
  assert.equal(refreshAutostart(env("/b:/usr/bin")), null, "이미 있는 PATH는 사용자 설정으로 보고 두기");
  assert.ok(readFileSync(plist, "utf8").includes("/a:/usr/bin"));
  writeFileSync(plist, `<plist><dict><key>Label</key><string>io.pace.daemon</string><key>ProgramArguments</key><array><string>${NODE}</string><string>/home/u/.pace/app/bin/pace.ts</string><string>daemon</string><string>run</string></array>\n<key>RunAtLoad</key><true/></dict></plist>`);
  const s2: AutostartEnv = { ...env("/c"), defaultHome: s.home };
  assert.match(refreshAutostart(s2) ?? "", /갱신했다/, "EnvironmentVariables가 없으면 만든다");
  assert.match(readFileSync(plist, "utf8"), /<key>EnvironmentVariables<\/key><dict><key>PATH<\/key><string>\/c<\/string><\/dict>\n<key>RunAtLoad<\/key>/);
});

test("지원하지 않는 플랫폼은 등록하지 않고 직접 실행을 안내한다", async () => {
  const s = setup("linux"); chain(s.home);
  assert.equal(await s.run(["install", "--yes"]), 1);
  assert.match(s.out.join("\n"), /지원하지 않는다/);
  assert.equal(s.sys.calls.length, 0);
});

test("해제는 다른 PACE_HOME의 등록(값이 다른 런처)을 지우지 않고, 값이 런처 경로를 포함하기만 해도 소유로 보지 않는다", async () => {
  const s = setup(); chain(s.home);
  s.sys.registry.set(RUN_VALUE, 'wscript.exe //B //Nologo "C:\elsewhere\daemon-launch.vbs"');
  writeFileSync(launcherPath(s.home), "mine");
  assert.equal(await s.run(["uninstall", "--yes"]), 0);
  assert.match(s.out.join("\n"), /다른 데이터 폴더/);
  assert.equal(s.sys.registry.size, 1, "남의 등록은 그대로");
  assert.equal(readFileSync(launcherPath(s.home), "utf8"), "mine");
  // 런처 경로를 인자로만 포함하는 다른 명령은 소유가 아니다
  const t = setup();
  writeFileSync(launcherPath(t.home), "old");
  t.sys.registry.set(RUN_VALUE, `other.exe --arg "${launcherPath(t.home)}"`);
  assert.equal(refreshAutostart(envOf(t)), null);
  assert.equal(readFileSync(launcherPath(t.home), "utf8"), "old");
});

test("macOS 갱신: 줄바꿈·공백이 있는 plist도 PACE_HOME을 해석하고, 실행 인자만 바꾸며 다른 launchd 설정은 남긴다", () => {
  const s = setup("darwin");
  const plist = plistPath({ launchAgentsDir: s.launchAgentsDir });
  mkdirSync(dirname(plist), { recursive: true });
  const body = (home: string) => `<plist version="1.0">
<dict>
  <key>Label</key>
  <string>io.pace.daemon</string>
  <key>ProgramArguments</key>
  <array>
    <string>/n</string>
    <string>/wt/bin/pace.ts</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PACE_HOME</key>
    <string>${home}</string>
  </dict>
  <key>ThrottleInterval</key><integer>30</integer>
</dict>
</plist>`;
  const env = (home: string): AutostartEnv => ({ ...envOf(s, "darwin", "/new/pace.ts"), home, defaultHome: join(s.home, "..default") });
  // 다른 PACE_HOME(줄바꿈 형식) — 건드리지 않는다
  writeFileSync(plist, body("/other/home"));
  assert.equal(refreshAutostart(env(s.home)), null);
  assert.equal(readFileSync(plist, "utf8"), body("/other/home"));
  // 같은 PACE_HOME — 실행 인자만 바뀌고 ThrottleInterval은 남는다
  writeFileSync(plist, body(s.home));
  assert.match(refreshAutostart(env(s.home)) ?? "", /새 설치본/);
  const next = readFileSync(plist, "utf8");
  assert.ok(next.includes("/new/pace.ts") && !next.includes("/wt/bin/pace.ts"));
  assert.ok(next.includes("<key>ThrottleInterval</key><integer>30</integer>"));
  // 기본 폴더 설치는 PACE_HOME이 있는 plist를 자기 것으로 오인하지 않는다
  writeFileSync(plist, body("/some/custom"));
  assert.equal(refreshAutostart({ ...env("/default/home"), defaultHome: "/default/home" }), null);
});

test("macOS 재실행: 이미 있는 항목은 unload 뒤 load, 해제는 unload가 실패해도 plist를 지운다", async () => {
  const s = setup("darwin"); chain(s.home);
  assert.equal(await s.run(["install", "--yes"]), 0);
  const first = s.sys.calls.filter((c) => c.command === "launchctl").map((c) => c.args[0]);
  assert.deepEqual(first, ["load"], "처음 설치는 load만");
  assert.equal(await s.run(["install", "--yes"]), 0);
  assert.deepEqual(s.sys.calls.filter((c) => c.command === "launchctl").map((c) => c.args[0]), ["load", "unload", "load"]);
  s.sys.unloadFails = true;
  assert.equal(await s.run(["uninstall", "--yes"]), 0);
  assert.ok(!existsSync(plistPath({ launchAgentsDir: s.launchAgentsDir })));
  assert.match(s.out.join("\n"), /unload가 실패했다/);
});

test("다른 데이터 폴더의 기존 시작 항목은 보존한다", async () => {
  const s = setup(); chain(s.home);
  s.sys.registry.set(RUN_VALUE, 'wscript.exe //B //Nologo "C:\elsewhere\daemon-launch.vbs"');
  const original = s.sys.registry.get(RUN_VALUE);
  assert.equal(await s.run(["install", "--yes"]), 1);
  assert.match(s.out.join("\n"), /다른 명령을 가리켜 보존한다/);
  assert.equal(s.sys.registry.get(RUN_VALUE), original);
});

test("--agents에 모르는 이름이면 --yes 없이도 사용 오류", async () => {
  const s = setup();
  await assert.rejects(() => s.run(["install", "--agents", "gemini"]), /--agents는/);
});
