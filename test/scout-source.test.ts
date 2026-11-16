import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { chmodSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { captionTracks, extractArticle, fetchSource, fetchSources, fetchText, findOnPath, parseCaptions, isInternalHost, normalizeTranscript, parseSource, parseUrl, readSources, saveSource, transcriptHint } from "../src/scout/source.ts";
import { redactSecrets } from "../src/project/secrets.ts";
import { PACE_BIN, runPace, sessionFreeEnv, tempDir, spawnTestChild as spawn } from "./helpers.ts";

/** 가짜 비밀 값 — 소스에 비밀 모양 글자를 남기지 않도록 실행 중에 조립한다(scripts/secret-scan.ts). */
const FAKE_TOKEN = ["abcd1234", "efgh5678"].join("");
const FAKE_SK = ["sk", "abcdefghijklmnopqrstuvwx"].join("-");
const FAKE_GHP = ["ghp", "abcdefghijklmnopqrstuvwxyz0123456789"].join("_");
const FAKE_KEY = ["-----BEGIN RSA ", "PRIVATE KEY-----\nAAA\n-----END RSA ", "PRIVATE KEY-----"].join("");

const ARTICLE = `<!doctype html><html><head><title>무시될 제목</title>
<meta property="og:title" content="AI 튜터 시장 &amp; 학부모">
<meta name="author" content="김기자">
<meta property="article:published_time" content="2026-10-01T09:00:00+09:00">
<script>window.bad = "<p>스크립트 글</p>"</script><style>p{}</style></head>
<body><nav>메뉴 글</nav><article><nav>기사 안 메뉴</nav><h1>제목</h1><p>학부모 62%가 AI 튜터를 써 봤다.</p><p>둘째&nbsp;문단 &#8220;인용&#8221;</p></article><footer>저작권</footer></body></html>`;

/** 테스트 서버 — CLI가 다른 프로세스라 실제 HTTP로 응답한다. */
async function serve(): Promise<{ base: string; server: Server }> {
  const server = createServer((req, res) => {
    if (req.url === "/news/1") return res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(ARTICLE);
    if (req.url === "/blog/post") return res.writeHead(200, { "content-type": "text/html" }).end(`<html><head><script type="application/ld+json">{"@graph":[{"datePublished":"2026-09-30","author":{"name":"블로거"}}]}</script></head><body><main><time datetime="2026-01-01">x</time><p>블로그 본문 token=${FAKE_TOKEN}</p></main></body></html>`);
    if (req.url === "/image") return res.writeHead(200, { "content-type": "image/png" }).end("png");
    if (req.url === "/big") return res.writeHead(200, { "content-type": "text/html" }).end("x".repeat(6 * 1024 * 1024));
    if (req.url === "/slow") return void res.writeHead(200, { "content-type": "text/html" }).write("<html>");
    if (req.url === "/reset") {
      res.writeHead(200, { "content-type": "text/html", "content-length": "1000" }).write("<html>");
      return void setTimeout(() => res.socket?.destroy(), 20);
    }
    if (req.url === "/euckr") return res.writeHead(200, { "content-type": "text/html; charset=euc-kr" }).end(Buffer.concat([Buffer.from("<html><body><p>"), Buffer.from([0xc7, 0xd1, 0xb1, 0xdb]), Buffer.from("</p></body></html>")]));
    if (req.url === "/empty") return res.writeHead(200, { "content-type": "text/html" }).end("<html><body><script>x</script></body></html>");
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return { base: `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`, server };
}

function runDir(home: string): string {
  const made = runPace(["scout", "new", "테스트", "--out", tempDir()], { home });
  assert.equal(made.status, 0, made.stderr);
  return made.stdout.trim();
}

/** 서버가 같은 프로세스에 있어 spawnSync로는 응답할 수 없으므로 비동기 실행. */
function paceAsync(args: string[], home: string, input?: string): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [PACE_BIN, ...args], { cwd: home, env: { ...sessionFreeEnv(), HOME: home, PACE_HOME: home } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(input ?? "");
  });
}


test("내부 주소·리다이렉트·비밀 든 URL 거부", async () => {
  for (const host of ["http://localhost/", "http://127.0.0.1/", "http://10.1.2.3/", "http://172.20.0.1/", "http://192.168.0.1/", "http://169.254.169.254/latest", "http://[::1]/", "http://printer.local/"]) assert.ok(isInternalHost(new URL(host)), host);
  for (const host of ["https://example.com/", "http://8.8.8.8/", "http://172.32.0.1/"]) assert.equal(isInternalHost(new URL(host)), false, host);
  const hops: string[] = [];
  const redirectTo = (target: string) => (async (input: URL, init: RequestInit) => {
    assert.equal(init.redirect, "manual", "리다이렉트는 직접 따라간다");
    hops.push(String(input));
    if (String(input) === "https://example.com/") return new Response(null, { status: 302, headers: { location: target } });
    return new Response("<p>x</p>", { headers: { "content-type": "text/html" } });
  }) as unknown as typeof fetch;
  await assert.rejects(fetchText(new URL("https://example.com/"), { fetch: redirectTo("http://10.0.0.1/admin") }), /내부 주소로 리다이렉트/);
  assert.deepEqual(hops, ["https://example.com/"], "내부 주소에는 요청을 보내지 않는다");
  await assert.rejects(fetchText(new URL("https://example.com/"), { fetch: redirectTo("ftp://example.com/x") }), /http·https URL만/);
  assert.equal(await fetchText(new URL("https://example.com/"), { fetch: redirectTo("/next") }), "<p>x</p>");
  let calls = 0;
  const loop = (async () => (calls++, new Response(null, { status: 301, headers: { location: "https://example.com/again" } }))) as unknown as typeof fetch;
  await assert.rejects(fetchText(new URL("https://example.com/"), { fetch: loop }), /리다이렉트가 5번을 넘는다/);
  assert.equal(calls, 6);
  assert.ok(isInternalHost(new URL("http://localhost./")));
  assert.equal(parseUrl(`https://www.reuters.com/technology/${["sk", "hynix-posts-record-quarterly-profit-2026-10-24/"].join("-")}`).pathname.includes("sk-hynix"), true);
  const sized = (async () => new Response("<p>x</p>", { headers: { "content-type": "text/html", "content-length": "999" } })) as unknown as typeof fetch;
  await assert.rejects(fetchText(new URL("https://example.com/"), { fetch: sized, maxBytes: 10 }), /크기 상한/);
  assert.throws(() => parseUrl(`https://example.com/x?token=${FAKE_TOKEN}`), /비밀로 보이는 값/);
});

test("extractArticle — og·meta·JSON-LD·time 순으로 메타, 스크립트·nav·footer 뺀 본문", () => {
  const got = extractArticle(ARTICLE);
  assert.equal(got.title, "AI 튜터 시장 & 학부모");
  assert.equal(got.author, "김기자");
  assert.equal(got.published, "2026-10-01T09:00:00+09:00");
  assert.equal(got.text, "제목\n학부모 62%가 AI 튜터를 써 봤다.\n둘째 문단 “인용”");
  const fallback = extractArticle(`<html><head><title> 제목만 </title></head><body><time datetime="2026-02-03">t</time><p>본문</p></body></html>`);
  const unclosed = "<nav x".repeat(40_000) + "<p>끝</p>";
  const started = Date.now();
  assert.equal(extractArticle(`<body>${unclosed}</body>`).text, "끝");
  assert.equal(extractArticle(`<body>${"<script>".repeat(60_000)}<p>끝</p></body>`).text, "끝");
  assert.ok(Date.now() - started < 2000, "닫히지 않은 태그도 선형 시간");
  assert.equal(extractArticle("<body><ul><li>하나</li><li>둘</li></ul></body>").text, "- 하나\n- 둘");
  assert.deepEqual(fallback, { title: "제목만", author: "", published: "2026-02-03", text: "t\n본문" });
});

test("scout fetch — 기사·블로그 저장 형식, 실패 이유와 계속, 중복·형식 거부, 비밀 제거·.gitignore", async () => {
  const { base, server } = await serve();
  try {
    const home = tempDir();
    const dir = runDir(home);
    const urls = [`${base}/news/1`, `${base}/blog/post`, `${base}/missing`, `${base}/image`, `${base}/big`, `${base}/empty`, "ftp://example.com/a"];
    const blocked = await paceAsync(["scout", "fetch", dir, `${base}/news/1`], home);
    assert.equal(blocked.status, 1);
    assert.match(blocked.stderr, /내부 주소는 받지 않는다: 127\.0\.0\.1/);
    const out = await paceAsync(["scout", "fetch", dir, ...urls, "--allow-local"], home);
    assert.equal(out.status, 1, `scout fetch 비정상 종료: ${out.stderr}`);
    assert.deepEqual(out.stdout.trim().split("\n"), [join(dir, "sources/S1.md"), join(dir, "sources/S2.md")]);
    for (const reason of ["missing — 받지 못했다: HTTP 404", "image — HTML·텍스트가 아니다", "big — 크기 상한", "empty — 본문을 찾지 못했다", "ftp://example.com/a — http·https URL만"]) assert.ok(out.stderr.includes(reason), reason);
    const [s1, s2] = readSources(dir);
    assert.deepEqual(s1!.meta, { id: "S1", url: `${base}/news/1`, title: "AI 튜터 시장 & 학부모", author: "김기자", published: "2026-10-01T09:00:00+09:00", accessed: s1!.meta.accessed, kind: "article", method: "fetch" });
    assert.match(s1!.meta.accessed, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(s1!.body.includes("학부모 62%가 AI 튜터를 써 봤다."));
    assert.deepEqual([s2!.meta.kind, s2!.meta.author, s2!.meta.published], ["blog", "블로거", "2026-09-30"]);
    assert.equal(s2!.body.includes(FAKE_TOKEN), false);
    assert.ok(s2!.body.includes("token=[제거됨]"));
    assert.equal(readFileSync(join(dir, ".gitignore"), "utf8"), "sources/\n");
    const again = await paceAsync(["scout", "fetch", dir, `${base}/news/1`, "--allow-local"], home);
    assert.equal(again.status, 1);
    assert.match(again.stderr, /이미 저장한 출처다: S1 .* --replace S1/);
    assert.equal(readSources(dir).length, 2);
    const notRun = await paceAsync(["scout", "fetch", tempDir(), `${base}/news/1`, "--allow-local"], home);
    assert.match(notRun.stderr, /탐색 실행 폴더가 아니다/);
    // 시간 제한은 본문 읽기까지, 도중에 끊긴 연결도 ScoutError(받지 못했다)
    const started = Date.now();
    await assert.rejects(fetchText(new URL(`${base}/slow`), { timeoutMs: 200, allowLocal: true }), /받지 못했다/);
    assert.ok(Date.now() - started < 2000, "주어진 시간 제한에서 멈춘다");
    await assert.rejects(fetchText(new URL(`${base}/reset`), { allowLocal: true }), /받지 못했다/);
    assert.equal(await fetchText(new URL(`${base}/euckr`), { allowLocal: true }), "<html><body><p>한글</p></body></html>");
  } finally {
    server.close();
  }
});

test("유튜브 — 설명란만 저장(method description), add로 자막 붙여넣기·메타만 보정", async () => {
  const page = `<html><head><meta property="og:title" content="AI 튜터 리뷰"><meta itemprop="datePublished" content="2026-09-01T10:00:00-07:00"><link itemprop="name" content="교육채널"></head><body><script>var x = {"shortDescription":"설명 첫 줄\\n둘째 줄 \\"따옴표\\""};</script></body></html>`;
  const fake = (async () => new Response(page, { headers: { "content-type": "text/html" } })) as unknown as typeof fetch;
  const got = await fetchSource("https://youtu.be/abc123", { fetch: fake, date: "2026-10-28", ytDlp: null });
  assert.match(transcriptHint("/tmp/a b", "S1"), /pace scout transcript '\/tmp\/a b' S1\(일반 브라우저로 '스크립트 표시' 읽기\), 안 되면 LLM 도구 브라우저로 읽어 pace scout add '\/tmp\/a b' --replace S1 --method browser, 그래도 안 되면 사용자에게 붙여넣기를 받아 --method pasted/);
  const bare = (async () => new Response("<html><head><title>빈 영상 - YouTube</title></head></html>", { headers: { "content-type": "text/html" } })) as unknown as typeof fetch;
  const empty = await fetchSource("https://www.youtube.com/watch?v=x", { fetch: bare, ytDlp: null });
  assert.deepEqual([empty.title, empty.method, empty.body], ["빈 영상", "description", "(설명란 없음 — 자막을 붙여 넣는다)"]);
  assert.deepEqual(got, { url: "https://youtu.be/abc123", title: "AI 튜터 리뷰", author: "교육채널", published: "2026-09-01T10:00:00-07:00", accessed: "2026-10-28", kind: "video", method: "description", body: '설명 첫 줄\n둘째 줄 "따옴표"', notes: ["공개 자막 트랙 없음", "yt-dlp 없음"] });

  const home = tempDir();
  const dir = runDir(home);
  const { body, notes: _notes, ...meta } = got;
  saveSource(dir, meta, body);
  const pasted = runPace(["scout", "add", dir, "--replace", "S1", "--method", "pasted"], { home, input: "0:00\n인트로\n3:41\n학부모 62%\n1:02:03 끝 인사\n" });
  assert.equal(pasted.status, 0, pasted.stderr);
  const s1 = readSources(dir)[0]!;
  assert.equal(s1.body, "[00:00] 인트로\n[03:41] 학부모 62%\n[1:02:03] 끝 인사");
  assert.deepEqual([s1.meta.method, s1.meta.title, s1.meta.published], ["pasted", "AI 튜터 리뷰", "2026-09-01T10:00:00-07:00"]);

  const fixed = runPace(["scout", "add", dir, "--replace", "S1", "--published", "2026-09-02"], { home });
  assert.equal(fixed.status, 0, fixed.stderr);
  assert.deepEqual([readSources(dir)[0]!.body, readSources(dir)[0]!.meta.method, readSources(dir)[0]!.meta.published], [s1.body, "pasted", "2026-09-02"]);

  const web = runPace(["scout", "add", dir, "--url", "https://example.com/a", "--title", "웹 읽기", "--published", "2026-10-02"], { home, input: "웹 읽기로 얻은 본문" });
  assert.equal(web.status, 0, web.stderr);
  assert.deepEqual(readSources(dir)[1]!.meta, { id: "S2", url: "https://example.com/a", title: "웹 읽기", author: "", published: "2026-10-02", accessed: readSources(dir)[1]!.meta.accessed, kind: "article", method: "web-read" });
  assert.equal(runPace(["scout", "add", dir, "--url", "https://example.com/b", "--title", "빈 본문"], { home, input: "" }).status, 1);
  assert.equal(runPace(["scout", "add", dir, "--replace", "S9"], { home }).status, 2);
  assert.equal(runPace(["scout", "add", dir, "--replace", "S1", "--method", "fetch"], { home }).status, 2);
  const browser = runPace(["scout", "add", dir, "--replace", "S1", "--method", "browser"], { home, input: "Intro\n0:00\n첫 문장\n3:41\n학부모 62%\n" });
  assert.equal(browser.status, 0, browser.stderr);
  assert.deepEqual([readSources(dir)[0]!.meta.method, readSources(dir)[0]!.body], ["browser", "Intro\n[00:00] 첫 문장\n[03:41] 학부모 62%"]);
  assert.match(runPace(["scout", "add", dir, "--replace", "S1", "--url", "https://example.com/a"], { home, input: "x" }).stderr, /같은 URL의 출처가 따로 있다: S2/);
  assert.equal(runPace(["scout", "add", dir, "--url", "https://u:p@example.com/", "--title", "t"], { home, input: "x" }).status, 1);
});

test("유튜브 자막 — ① 공개 자막 주소(수동 먼저) ② yt-dlp, 못 얻으면 설명란", async () => {
  const xml = `<?xml version="1.0"?><transcript><text start="0.5" dur="2">첫 &amp;amp; 문장</text><text start="221.2" dur="3">학부모 62%</text><text start="3723" dur="1">끝</text></transcript>`;
  const page = `<html><head><meta property="og:title" content="리뷰"></head><body><script>var p = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=a&lang=ko&kind=asr","kind":"asr"},{"baseUrl":"https://www.youtube.com/api/timedtext?v=a&lang=ko"}]}},"shortDescription":"설명"};</script></body></html>`;
  const asked: string[] = [];
  const fake = (async (input: URL) => {
    asked.push(String(input));
    if (String(input).includes("timedtext")) return new Response(String(input).includes("asr") ? "" : xml, { headers: { "content-type": "text/xml" } });
    return new Response(page, { headers: { "content-type": "text/html" } });
  }) as unknown as typeof fetch;
  const got = await fetchSource("https://www.youtube.com/watch?v=a", { fetch: fake, ytDlp: null });
  assert.equal(got.method, "fetch");
  assert.equal(got.body, "[00:00] 첫 & 문장\n[03:41] 학부모 62%\n[1:02:03] 끝");
  assert.ok(asked[1]!.endsWith("lang=ko"), "수동 자막을 먼저 받는다");

  const empty = (async (input: URL) => new Response(String(input).includes("timedtext") ? "" : page, { headers: { "content-type": "text/html" } })) as unknown as typeof fetch;
  const bin = join(tempDir(), process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
  // 가짜 yt-dlp: 설정 무시·재생목록 아님·영상 받지 않음이 없으면 실패. 수동 자막(ko·en)을 둘 다 쓰고 비0으로 끝난다 — ko를 골라야 한다.
  writeFileSync(bin, `#!/usr/bin/env node
const fs=require("node:fs"), a=process.argv.slice(2); if (!["--ignore-config","--no-playlist","--skip-download","--write-subs"].every(x=>a.includes(x))) process.exit(3); const p=a[a.indexOf("-o")+1]; fs.writeFileSync(p+".en.vtt", "WEBVTT\\n\\n00:00:01.000 --> 00:00:03.000\\nhello\\n"); fs.writeFileSync(p+".ko.vtt", "WEBVTT\\n\\n00:00:01.000 --> 00:00:03.000\\n안녕\\n\\n00:00:03.000 --> 00:00:05.000\\n안녕\\n\\n00:03:41.000 --> 00:03:43.000\\n<c>학부모</c> 62%\\n"); process.exit(1);`);
  chmodSync(bin, 0o755);
  const viaYtDlp = await fetchSource("https://www.youtube.com/watch?v=a", { fetch: empty, ytDlp: process.platform === "win32" ? { command: process.execPath, args: [bin] } : bin });
  assert.deepEqual([viaYtDlp.method, viaYtDlp.body], ["fetch", "[00:01] 안녕\n[03:41] 학부모 62%"]);
  const none = await fetchSource("https://www.youtube.com/watch?v=a", { fetch: empty, ytDlp: null });
  const home = tempDir();
  const run = runPace(["scout", "new", "영상", "--out", tempDir()], { home }).stdout.trim();
  const notes: string[] = [];
  const saved: string[] = [];
  assert.equal(await fetchSources(run, ["https://www.youtube.com/watch?v=a", "ftp://x/y"], { fetch: empty, ytDlp: null }, { saved: (p) => saved.push(p), note: (m) => notes.push(m) }), 1);
  assert.deepEqual(saved, [join(run, "sources/S1.md")]);
  assert.match(notes[0]!, /watch\?v=a — 공개 자막 주소가 빈 응답, 공개 자막 주소가 빈 응답, yt-dlp 없음\. 자막을 받지 못해 설명란만 저장했다.*--replace S1 --method browser/);
  assert.match(notes[1]!, /ftp:\/\/x\/y — http·https URL만/);
  assert.deepEqual([none.method, none.body], ["description", "설명"]);
  assert.equal(findOnPath("yt-dlp", tempDir()), null);
  assert.equal(findOnPath("yt-dlp", dirname(bin)), bin);
  assert.equal(parseCaptions("아무 글"), "");
  // 자동 자막(원어 *-orig만): 수동이 없으면 두 번째 시도에서 -orig 파일을 고른다. 번역 트랙은 받지 않는다.
  const autoBin = join(tempDir(), "yt-dlp-script");
  writeFileSync(autoBin, `#!/usr/bin/env node
const fs=require("node:fs"), a=process.argv.slice(2); if (!a.includes("--write-auto-subs") || !a.includes(".*-orig")) process.exit(0); const p=a[a.indexOf("-o")+1]; fs.writeFileSync(p+".de.vtt", "WEBVTT\\n\\n00:00:01.000 --> 00:00:02.000\\n번역\\n"); fs.writeFileSync(p+".en-orig.vtt", "WEBVTT\\n\\n00:00:01.000 --> 00:00:02.000\\noriginal\\n");`);
  chmodSync(autoBin, 0o755);
  assert.equal((await fetchSource("https://www.youtube.com/watch?v=a", { fetch: empty, ytDlp: process.platform === "win32" ? { command: process.execPath, args: [autoBin] } : autoBin })).body, "[00:01] original");
  // 굴러가는 자동 자막: 새 말은 글자 시간 태그가 붙은 줄에만
  const rolling = "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nhello<00:00:01.500><c> everyone</c><00:00:02.000><c> welcome</c>\n\n00:00:03.000 --> 00:00:03.010\nhello everyone welcome\n\n00:00:03.010 --> 00:00:05.000\nhello everyone welcome\nto<00:00:03.500><c> the</c><00:00:04.000><c> show</c>\n";
  assert.equal(parseCaptions(rolling), "[00:01] hello everyone welcome\n[00:03] to the show");
  // 트랙 이름에 대괄호가 있어도 배열을 끝까지 읽는다
  assert.deepEqual(captionTracks(`"captionTracks":[{"baseUrl":"https://x/a","name":{"runs":[{"text":"한국어 [자동]"}]},"kind":"asr"},{"baseUrl":"https://x/b"}],"audioTracks":[]`), ["https://x/b", "https://x/a"]);
  // PATH의 상대 항목·실행 못 하는 파일은 보지 않는다
  const noExec = join(tempDir(), "yt-dlp");
  writeFileSync(noExec, "x");
  assert.equal(findOnPath("yt-dlp", `.${delimiter}${dirname(noExec)}`), null);
  const cwd = process.cwd();
  try {
    process.chdir(dirname(bin)); // 실행 가능한 yt-dlp가 있는 폴더 — 상대 항목 "."으로는 찾지 않는다
    assert.equal(findOnPath("yt-dlp", "."), null);
  } finally {
    process.chdir(cwd);
  }
});

test("저장 형식 왕복·sources 심볼릭 링크 거부·자막 정리·비밀 제거", () => {
  const home = tempDir();
  const dir = runDir(home);
  const path = saveSource(dir, { url: "https://example.com/x", title: `a: "b" #c\n줄 ${FAKE_SK}`, author: FAKE_GHP, published: "", accessed: "2026-10-28", kind: "article", method: "web-read" }, "본문");
  const saved = parseSource(readFileSync(path, "utf8")).meta;
  assert.deepEqual([saved.title, saved.author], ['a: "b" #c 줄 [제거됨]', "[제거됨]"]);
  // 번호는 파일 이름이 정본 — 머리말 id를 바꿔도 밖을 가리키지 않는다
  writeFileSync(path, readFileSync(path, "utf8").replace("id: S1", "id: ../x"));
  assert.equal(readSources(dir)[0]!.meta.id, "S1");
  assert.throws(() => saveSource(dir, { url: "https://example.com/y", title: "t", author: "", published: "", accessed: "2026-10-28", kind: "article", method: "web-read" }, "x", "../x"), /바꿀 출처가 없다/);
  const linked = runDir(home);
  const target = tempDir();
  symlinkSync(target, join(linked, "sources"));
  assert.throws(() => saveSource(linked, { url: "https://example.com/x", title: "t", author: "", published: "", accessed: "2026-10-28", kind: "article", method: "web-read" }, "x"), /심볼릭/);
  assert.equal(normalizeTranscript("시간 없는 글\n둘째"), "시간 없는 글\n둘째");
  assert.equal(normalizeTranscript("[00:05] 이미 정리됨\n이어진 줄"), "[00:05] 이미 정리됨 이어진 줄");
  assert.equal(redactSecrets(`key ${FAKE_SK} and password=$PASS and ${FAKE_KEY}`), "key [제거됨] and password=$PASS and [제거됨]");
  assert.deepEqual(readdirSync(target), []);
});

test("redactSecrets: END 줄 없는 개인 키는 텍스트 끝까지 지워 본문이 남지 않는다", () => {
  const head = ["-----BEGIN", "RSA PRIVATE KEY-----"].join(" ");
  const body = "MIIEpA" + "Kq7".repeat(30);
  const out = redactSecrets(`앞 문장\n${head}\n${body}\n`);
  assert.equal(out, "앞 문장\n[제거됨]");
  assert.equal(redactSecrets(`${head}\n${body}\n\n뒤 문단`), "[제거됨]\n\n뒤 문단", "빈 줄 뒤 문단은 남긴다");
  // 옛 암호화 PEM: 머리 줄과 빈 줄 뒤 본문
  const pem = `${head}\nProc-Type: 4,ENCRYPTED\nDEK-Info: AES-128-CBC,ABCDEF0123\n\n${body}\n\n뒤 문단`;
  assert.equal(redactSecrets(pem), "[제거됨]\n\n뒤 문단");
  // CRLF
  assert.equal(redactSecrets(`${head}\r\n${body}\r\n\r\n뒤 문단`), "[제거됨]\r\n\r\n뒤 문단");
});
