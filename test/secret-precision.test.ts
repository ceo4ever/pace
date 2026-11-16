import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { packageRoot } from "../src/core/paths.ts";
import { hasSecret, redactSecrets } from "../src/project/secrets.ts";
import { sessionFreeEnv, tempDir } from "./helpers.ts";

// 이 파일 자체가 보안 검사에 걸리지 않도록 가짜 값은 조립해서 쓴다(제외 목록에 더하지 않는다).
const assign = (key: string, value: string, op = " = ") => `${key}${op}${value}`;
const quoted = (key: string, value: string, quote = '"', op = " = ") => assign(key, `${quote}${value}${quote}`, op);
const FAKE = "abcdefgh12345";
const KEYS = ["token", "secret", "password", "apiKey", "api_key"];

test("디자인 토큰: 경계가 닫힌 data-token 경로만 보존한다", () => {
  for (const value of ["color/sidebar", "font-size/body", "border-width/thin", "palette/neutral/100"]) {
    for (const quote of ['"', "'"]) for (const end of [">", " />", " class='sample'>"]) {
      const html = `<div ${quoted("data-token", value, quote)}${end}`;
      assert.equal(hasSecret(html), false, html);
      assert.equal(hasSecret(html, { code: true }), false, html);
      assert.equal(redactSecrets(html), html);
    }
  }
});

test("디자인 토큰: 유사 속성·잘못된 경계·자격증명은 탐지와 마스킹을 유지한다", () => {
  const path = "color/sidebar";
  const cases: [string, string][] = [
    [quoted("foo-data-token", path), path],
    [quoted("token", path), path],
    [quoted("data-token", "unknown/sidebar"), "unknown/sidebar"],
    [quoted("data-token", "color/" + "a".repeat(17)), "color/" + "a".repeat(17)],
    [quoted("data-token", "color/" + "a-".repeat(30) + "abc"), "color/" + "a-".repeat(30) + "abc"],
    [assign("data-token", path), path + ">"],
    [assign("data-token", '"' + path), path + ">"],
    [assign("data-token", '"' + path + "'"), path],
    [quoted("data-token", path) + "suffix", path],
    [quoted('data-token"', path), path],
    [quoted("data-token", FAKE), FAKE],
    [quoted("data-token", "color/../sidebar"), "color/../sidebar"],
  ];
  for (const key of KEYS) cases.push([quoted(key, FAKE), FAKE]);
  for (const [attribute, value] of cases) {
    const html = `<div ${attribute}>`;
    assert.equal(hasSecret(html), true, html);
    assert.equal(redactSecrets(html), html.replace(value, "[제거됨]"), html);
  }
  const secrets = [
    "AKIA" + "A".repeat(16), "gh" + "p_" + "a".repeat(32), "sk-" + "a".repeat(24),
    "xox" + "b-" + "a".repeat(20), "Bearer " + "a".repeat(30),
    "eyJ" + "a".repeat(12) + "." + "b".repeat(12) + "." + "c".repeat(6),
    "-----BEGIN " + "PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
  ];
  for (const secret of secrets) {
    for (const value of [secret, "color/" + secret]) {
      const html = `<div ${quoted("data-token", value)}>`;
      assert.equal(hasSecret(html), true);
      assert.equal(redactSecrets(html), html.replace(value, "[제거됨]"));
    }
    const mixed = `<div ${quoted("data-token", path)}> ${secret}`;
    assert.equal(hasSecret(mixed), true);
    assert.equal(redactSecrets(mixed), mixed.replace(secret, "[제거됨]"));
  }
});

test("secret-scan: GUIDE 디자인 토큰은 통과하고 같은 파일의 비밀은 차단한다", () => {
  const root = tempDir("pace-scan-design-");
  assert.equal(spawnSync("git", ["-C", root, "init", "-q"]).status, 0);
  const scan = () => spawnSync(process.execPath, [join(packageRoot, "scripts", "secret-scan.ts"), root], { encoding: "utf8", env: sessionFreeEnv() });
  const guide = `<div ${quoted("data-token", "color/sidebar")}>`;
  writeFileSync(join(root, "GUIDE.html"), guide);
  assert.equal(scan().status, 0);
  writeFileSync(join(root, "GUIDE.html"), guide + quoted("token", FAKE));
  assert.equal(scan().status, 1);
});

test("hasSecret: 비밀 이름에 따옴표 문자열 리터럴이 대입·지정되면 계속 잡는다", () => {
  for (const key of KEYS) for (const quote of ['"', "'"]) for (const op of [" = ", ": ", "="]) {
    assert.equal(hasSecret(quoted(key, FAKE, quote, op)), true, `${key} ${quote} ${op}`);
  }
  assert.equal(hasSecret(quoted("const botToken", FAKE).replace("botToken", "token")), true);
  assert.equal(hasSecret(`{ ${quoted("token", FAKE, '"', ": ")} }`), true);
  assert.equal(hasSecret(quoted('"secret"', FAKE, '"', ": ")), true, "JSON 키");
  // 따옴표 없는 원문 값(설정·문서)과 이미 잡던 토큰 형태
  assert.equal(hasSecret(assign("secret", FAKE, ": ")), true);
  assert.equal(hasSecret(assign("password", "hunter2hunter2", "=")), true);
  assert.equal(hasSecret("AKIA" + "ABCDEFGHIJKLMNOP"), true);
  assert.equal(hasSecret("gh" + "p_" + "a".repeat(36)), true);
  // 설정·문서의 코드처럼 생긴 원문 비밀(줄 끝 기호 없음·숫자 섞인 호출)도 잡는다
  assert.equal(hasSecret(assign("password", "correct.horse.battery.staple")), true);
  assert.equal(hasSecret(assign("secret", "CorrectHorseBatteryStaple", ": ")), true);
  assert.equal(hasSecret(assign("password", "abcdefgh123(456)")), true);
  assert.equal(hasSecret(assign("password", "abcdefgh123(456);")), true);
  assert.equal(redactSecrets(assign("password", "correct.horse.battery.staple")).includes("horse"), false);
  // 주석·문서 줄의 원문 비밀은 줄 끝 기호가 있어도 잡는다
  assert.equal(hasSecret("// " + assign("password", "correct.horse.battery.staple;")), true);
  assert.equal(hasSecret("# " + assign("secret", "correct.horse.battery.staple,")), true);
  assert.equal(redactSecrets("// " + assign("password", "correct.horse.battery.staple;")).includes("horse"), false);
  // 리터럴이면 호출처럼 보여도 잡는다
  assert.equal(hasSecret(quoted("token", "readFileSync(abcdefgh)")), true);
});

test("hasSecret: 코드 파일에서는 함수 호출·식별자·타입 표기·멤버 접근을 오탐으로 보지 않는다", () => {
  const benign = [
    assign("const token", "readFileSync(tokenFile, 'utf8').trim();"),
    assign("const token", "randomBytes(32).toString('hex');"),
    assign("const token", "(deps.readStdin ?? readStdinText)();"),
    assign("const secret", "readTelegramSecret(home);"),
    assign("token", "ensureGatewayToken(home),", ": "),
    assign("token", "o.secret.token,", ": "),
    assign("token", "deps.tokenValue;", " = "),
    assign("secret", "TelegramSecret;", ": "),
    assign("function f(secret", "TelegramSecret): void {", ": "),
    assign("token", "string;", ": "),
    assign("token", "loadToken2();"),
    assign("token", "deps.token2;"),
    assign("secret", "SecretV2;", ": "),
    assign("token", "ENV_TOKEN_NAME"),
    assign("token", "${process.env.X_TOKEN}"),
  ];
  for (const line of benign) assert.equal(hasSecret(line, { code: true }), false, line);
  assert.equal(hasSecret(benign[0]!), true, "코드 파일이 아니면 같은 줄도 엄격하게 본다");
  // redact도 같은 규칙 — 코드 식별자는 그대로, 리터럴만 지운다
  assert.match(redactSecrets(quoted("token", FAKE)), /\[제거됨\]/);
});

test("secret-scan: 같은 문장도 마크다운·설정에서는 잡고 코드 파일에서는 표현식이면 통과, 코드 파일의 리터럴은 잡는다", () => {
  const root = tempDir("pace-scan-kinds-");
  assert.equal(spawnSync("git", ["-C", root, "init", "-q"]).status, 0);
  const scan = () => spawnSync(process.execPath, [join(packageRoot, "scripts", "secret-scan.ts"), root], { encoding: "utf8", env: sessionFreeEnv() });
  const NL = String.fromCharCode(10);
  const expr = assign("const password", "correct.horse.battery.staple;") + NL;
  const kinds: [string, number][] = [["a.ts", 0], ["a.js", 0], ["a.mjs", 0], ["a.cjs", 0], ["a.tsx", 0], ["a.jsx", 0], ["a.mts", 1], ["a.cts", 1], ["a.md", 1], ["a.json", 1], ["a.yaml", 1], ["a.env", 1], ["a.txt", 1]];
  for (const [name, status] of kinds) {
    writeFileSync(join(root, name), expr);
    assert.equal(scan().status, status, name);
    writeFileSync(join(root, name), "ok" + NL);
  }
  writeFileSync(join(root, "a.ts"), quoted("const token", FAKE) + ";" + NL);
  assert.equal(scan().status, 1, "코드 파일의 리터럴");
  writeFileSync(join(root, "a.ts"), "- " + assign("password", "correct.horse.battery.staple;") + NL);
  assert.equal(scan().status, 0, "코드 파일 안이면 표현식(원문 비밀이 아님)");
  writeFileSync(join(root, "a.ts"), "ok" + NL);
  writeFileSync(join(root, "a.md"), "- " + assign("password", "correct.horse.battery.staple;") + NL);
  assert.equal(scan().status, 1, "마크다운 목록");
});

const DAEMON_FILES = ["src/daemon/cli.ts", "src/daemon/gateway.ts", "src/daemon/index.ts", "src/daemon/telegram/index.ts"];

test("secret-scan: daemon 4개 파일 원문은 통과하고, 가짜 리터럴 토큰을 넣으면 잡는다", () => {
  const root = tempDir("pace-scan-daemon-");
  assert.equal(spawnSync("git", ["-C", root, "init", "-q"]).status, 0);
  const scan = () => spawnSync(process.execPath, [join(packageRoot, "scripts", "secret-scan.ts"), root], { encoding: "utf8", env: sessionFreeEnv() });
  for (const file of DAEMON_FILES) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), readFileSync(join(packageRoot, file)));
  }
  const clean = scan();
  assert.equal(clean.status, 0, clean.stderr);
  for (const file of DAEMON_FILES) {
    const original = readFileSync(join(packageRoot, file));
    writeFileSync(join(root, file), Buffer.concat([original, Buffer.from(`\n${quoted("const token", FAKE)};\n`)]));
    const bad = scan();
    assert.equal(bad.status, 1, file);
    assert.match(bad.stderr, new RegExp(`- ${file.replace(/[./]/g, "\$&")}`));
    writeFileSync(join(root, file), original);
  }
  assert.equal(scan().status, 0);
});

test("secret-scan: 대시보드 data.js는 파일째 제외하지 않고 JSON을 풀어 검사한다", () => {
  const root = tempDir("pace-scan-dash-");
  assert.equal(spawnSync("git", ["-C", root, "init", "-q"]).status, 0);
  const scan = () => spawnSync(process.execPath, [join(packageRoot, "scripts", "secret-scan.ts"), root], { encoding: "utf8", env: sessionFreeEnv() });
  mkdirSync(join(root, "backlogs", "dashboard"), { recursive: true });
  const write = (body: string) => writeFileSync(join(root, "backlogs", "dashboard", "data.js"), `// 생성 산출물\nwindow.PACE_DATA = ${JSON.stringify({ files: { "a.ts": body } }).replace(/</g, String.raw`<`)};\n`);
  write(`${assign("const token", "readFileSync(f)")};\n${assign("secret", "TelegramSecret;", ": ")}\n`);
  const clean = scan();
  assert.equal(clean.status, 0, clean.stderr);
  write(`${quoted("const token", FAKE)};\n`);
  const bad = scan();
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /backlogs\/dashboard\/data\.js/);
  // 키·값 관계(문자열·숫자)와 JSON 밖의 내용도 잡는다
  const raw = (body: string) => writeFileSync(join(root, "backlogs", "dashboard", "data.js"), body);
  const NL = String.fromCharCode(10);
  raw(`window.PACE_DATA = ${JSON.stringify({ [["tok", "en"].join("")]: FAKE })};` + NL);
  assert.equal(scan().status, 1, "키·값 관계");
  raw(`window.PACE_DATA = ${JSON.stringify({ [["pass", "word"].join("")]: 123456789 })};` + NL);
  assert.equal(scan().status, 1, "숫자 값");
  raw(`window.PACE_DATA = {"files":{}};` + NL + quoted("const token", FAKE) + ";" + NL);
  assert.equal(scan().status, 1, "JSON 밖");
  // 표현식 완화는 키가 코드 파일 경로인 본문에만
  const keyed = (path: string, body: string) => raw(`window.PACE_DATA = ${JSON.stringify({ files: { [path]: body } })};` + NL);
  keyed("x.md", assign("const password", "correct.horse.battery.staple;"));
  assert.equal(scan().status, 1, "마크다운 키는 엄격");
  keyed("x.ts", assign("const password", "correct.horse.battery.staple;"));
  assert.equal(scan().status, 0, "코드 파일 키는 표현식 통과");
  keyed("x.ts", quoted("const token", FAKE));
  assert.equal(scan().status, 1, "코드 파일 키의 리터럴");
  raw(`window.PACE_DATA = {"${["tok", "en"].join("")}":"${FAKE}","${["tok", "en"].join("")}":"ENV_TOKEN"};` + NL);
  assert.equal(scan().status, 1, "중복 키 앞쪽 값");
  raw("window.PACE_DATA = {not json");
  assert.equal(scan().status, 0, "해석 못 하면 원문 검사로 돌아간다");
  // 생성기와 같은 형태의 data.js는 해독 뒤 통과한다(<·줄바꿈 이스케이프 포함)
  const files = { "backlogs/BL1/BACKLOG.md": "# 백로그\n<b>표</b>\n- 상태: 진행\n" };
  const real = `// 생성 산출물\nwindow.PACE_DATA = ${JSON.stringify({ generated: "2026-11-16T00:00:00.000Z", files, assets: {}, catalog: Object.keys(files) }).replace(/</g, "\\u003c")};\n`;
  assert.ok(real.includes(String.fromCharCode(92) + "u003c"));
  raw(real);
  const ok = scan();
  assert.equal(ok.status, 0, ok.stderr);
});
