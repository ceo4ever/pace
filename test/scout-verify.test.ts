import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { packageRoot } from "../src/core/paths.ts";
import type { Report } from "../src/scout/report.ts";
import { readSources, saveSource, type Source } from "../src/scout/source.ts";
import { checkDates, checkEstimates, checkIdeaSignals, checkLinks, checkQuotes, checkRefs, checkScores, measures, numbers } from "../src/scout/verify.ts";
import { runPace, tempDir } from "./helpers.ts";

const BODIES: Record<string, string> = {
  S1: "2026년 초등 학부모 1,000명 조사 결과 학부모 62%가 AI 튜터를 써 봤다. 업계는 시장이 커질 것이라 본다.",
  S2: "아이가 뭘 배웠는지 도무지 모르겠다. 매일 AI랑 공부하는데.",
  S3: "[00:10] 오늘은 AI 튜터 앱 3개를 비교합니다\n[03:41] 세 앱 모두 부모용 리포트는 없었어요",
};

function example(): Report {
  return JSON.parse(readFileSync(join(packageRoot, "templates/scout/example-report.json"), "utf8")) as Report;
}

/** 예시 보고서 + 같은 내용의 원문 3개가 든 실행 폴더. */
function fixture(home = tempDir()): { home: string; dir: string } {
  const dir = runPace(["scout", "new", "검사", "--out", tempDir()], { home }).stdout.trim();
  const r = example();
  for (const s of r.sources) saveSource(dir, { url: s.url, title: s.title, author: "", published: s.published, accessed: s.accessed, kind: s.kind as Source["meta"]["kind"], method: "web-read" }, BODIES[s.id]!);
  writeFileSync(join(dir, "report.json"), JSON.stringify(r));
  return { home, dir };
}

function sourcesOf(dir: string): Map<string, Source> {
  return new Map(readSources(dir).map((s) => [s.meta.id, s]));
}

test("수치 덩어리·크기 수치 뽑기", () => {
  assert.deepEqual(numbers("학부모 62%, 1,000명 [S2 03:41] I1 G2 S3 2026-10-01 2026년"), ["62", "1000", "2026", "10", "1", "2026"]);
  assert.deepEqual(measures("주 1회, 사실 1개, 월 9,900원, 12개 앱, 3배, 62%, 5천만 원, 2027년 출시, 2026"), ["9900", "12", "3", "62", "5"]);
  assert.deepEqual(numbers("[00:10] 앱 3개 [03:41] 리포트"), ["3"], "자막 시간은 수치가 아니다");
  assert.deepEqual(numbers("신청 끝남(2026-07-03), 최대 4천만원"), ["2026", "7", "3", "4"], "날짜는 앞자리 0을 뗀 수로 원문과 대조한다");
});

test("맞는 예시(원문 포함)는 검사 6종 모두 통과", () => {
  const { dir } = fixture();
  const r = example();
  const src = sourcesOf(dir);
  for (const c of [checkQuotes(r, src), checkRefs(r, src), checkIdeaSignals(r), checkScores(r), checkEstimates(r, src), checkDates(r, "2026-10-28")]) assert.equal(c.status, "pass", `${c.name}: ${c.detail ?? ""}`);
});

test("검사마다 일부러 틀린 데이터는 그 검사에서 실패한다", () => {
  const { dir } = fixture();
  const src = sourcesOf(dir);
  const fail = (r: Report, check: (r: Report) => { status: string; detail?: string }, pattern: RegExp) => {
    const out = check(r);
    assert.equal(out.status, "fail", pattern.source);
    assert.match(out.detail ?? "", pattern);
  };
  // ① 인용·수치
  let r = example();
  r.sources[1]!.claims[0]!.quote = "아이가 뭘 배웠는지 전혀 모르겠다";
  fail(r, (x) => checkQuotes(x, src), /S2 주장 1 인용이 원문에 없다/);
  r = example();
  r.sources[0]!.claims[0]!.text = "학부모의 72%가 AI 튜터를 써 봤다";
  fail(r, (x) => checkQuotes(x, src), /S1 주장 1 수치 72이 원문에 없다/);
  r = example();
  r.sources[2]!.claims[0]!.text = "리뷰한 앱 41개 모두 부모용 리포트가 없다";
  fail(r, (x) => checkQuotes(x, src), /S3 주장 1 수치 41이 원문에 없다/);
  r = example();
  r.sources[1]!.claims[0]!.text = "아이가 2번 물었다";
  fail(r, (x) => checkQuotes(x, src), /S2 주장 1 수치 2이 원문에 없다/);
  r = example();
  r.sources[0]!.claims[0]!.text = "학부모의 20%가 AI 튜터를 써 봤다";
  fail(r, (x) => checkQuotes(x, src), /수치 20이 원문에 없다/); // 원문의 2026 안에 20이 있어도 덩어리가 다르다
  r = example();
  r.sources[0]!.claims[0]!.text = "학부모의 62%가 AI 튜터를 써 봤다(조사 2026-08-31)";
  fail(r, (x) => checkQuotes(x, src), /수치 8이 원문에 없다/);
  r = example();
  r.sources[0]!.claims[0]!.text = "학부모의 62%가 AI 튜터를 써 봤다(2026년 조사)";
  assert.equal(checkQuotes(r, src).status, "pass", "원문에 있는 연도는 통과");
  r = example();
  r.sources[2]!.claims[0]!.quote = "[03:41]";
  fail(r, (x) => checkQuotes(x, src), /S3 주장 1 인용에 글이 없다/);
  r = example();
  r.sources[0]!.claims[0]!.quote = "학부모 62%가  AI 튜터를\n써 봤다.";
  assert.equal(checkQuotes(r, src).status, "pass", "공백·줄바꿈 차이는 같은 글");
  // ② 참조
  r = example();
  r.signals[0]!.description = "학부모 다수 [S9]";
  fail(r, (x) => checkRefs(x, src), /G1\.description: 없는 출처 S9/);
  r = example();
  r.signals[1]!.evidence = ["S3 05:00"];
  fail(r, (x) => checkRefs(x, src), /S3에 05:00 시간이 없다/);
  r = example();
  r.summary.recommendation = "I9";
  fail(r, (x) => checkRefs(x, src), /추천 I9이 후보에 없다/);
  r = example();
  r.scores[0]!.criterion = "nope";
  fail(r, (x) => checkRefs(x, src), /기준 nope이 평가 기준에 없다/);
  r = example();
  r.sources[2]!.id = "S1";
  fail(r, (x) => checkRefs(x, src), /출처 번호 S1가 겹친다/);
  r = example();
  r.ideas[0]!.signals = ["G7"];
  fail(r, (x) => checkRefs(x, src), /I1: 없는 신호 G7/);
  r = example();
  r.next_steps.experiment.idea = "I8";
  fail(r, (x) => checkRefs(x, src), /검증 실험의 I8이 후보에 없다/);
  r = example();
  r.next_steps.cards = ["I7"];
  fail(r, (x) => checkRefs(x, src), /카드 I7이 후보에 없다/);
  r = example();
  r.scores[0]!.idea = "I6";
  fail(r, (x) => checkRefs(x, src), /점수의 후보 I6가 없다/);
  r = example();
  r.sources[2]!.claims[0]!.time = "09:09";
  fail(r, (x) => checkRefs(x, src), /S3 주장의 시간 09:09이 자막에 없다/);
  r = example();
  r.scores[0]!.refs = ["S5"];
  fail(r, (x) => checkRefs(x, src), /I1\.evidence\.refs: 없는 출처 S5/);
  // ③ 근거 신호
  r = example();
  r.ideas[1]!.signals = [];
  fail(r, checkIdeaSignals, /I2 .*근거 신호가 없다/);
  // ④ 점수 근거
  r = example();
  r.scores[0]!.reason = " ";
  fail(r, checkScores, /I1×evidence: 점수 근거가 없다/);
  r = example();
  r.scores = r.scores.filter((s) => !(s.idea === "I3" && s.criterion === "fit"));
  fail(r, checkScores, /I3×fit: 점수가 없다/);
  r = example();
  Object.assign(r.scores[1]!, { refs: [], estimate: false });
  fail(r, checkScores, /I1×problem: 출처도 프로필·메모리 근거도 추정 표시도 없다/);
  r = example();
  Object.assign(r.scores.find((s) => s.idea === "I1" && s.criterion === "fit")!, { reason: "메모리: LLM 에이전트를 직접 만든다", refs: [], estimate: false });
  assert.equal(checkScores(r).status, "pass", "프로필·메모리 사실은 적합도 근거");
  Object.assign(r.scores.find((s) => s.idea === "I1" && s.criterion === "problem")!, { reason: "메모리: 루카스가 겪어 봤다", refs: [], estimate: false });
  fail(r, checkScores, /I1×problem: 출처도/);
  r = example();
  r.summary.recommendation = "I2";
  fail(r, checkScores, /추천 I2\(2\.60\)이 가중 합계 1위 I1\(3\.25\)가 아니다/);
  r.summary.reasons[2] = "비용이 낮다 — 1위가 아닌 이유는 따로 없다";
  fail(r, checkScores, /추천 I2/);
  r.summary.reasons[2] = "1위가 아닌 이유: 비용이 가장 낮아 먼저 검증한다";
  assert.equal(checkScores(r).status, "pass", "1위가 아닌 이유가 있으면 통과");
  r = example();
  r.scores.push({ ...r.scores[0]! });
  fail(r, checkScores, /I1×evidence: 점수가 2개다/);
  // ⑤ 추정 표시
  r = example();
  r.ideas[0]!.revenue = "월 구독 9,900원";
  r.ideas[0]!.estimates = [];
  fail(r, (x) => checkEstimates(x, src), /I1\.revenue: 수치 9900이 출처에 없는데 추정 표시가 없다/);
  r = example();
  r.summary.reasons[0] = "학부모 85%가 원한다";
  fail(r, (x) => checkEstimates(x, src), /summary\.reasons\[0\]: 수치 85/);
  r = example();
  r.ideas[0]!.revenue = "월 구독 9,900원";
  assert.equal(checkEstimates(r, src).status, "pass", "estimates 목록에 같은 수치가 있으면 면제");
  r = example();
  r.scores[2]!.reason = "시제품 비용 300만 원";
  assert.equal(r.scores[2]!.estimate, true);
  assert.equal(checkEstimates(r, src).status, "pass", "estimate 점수는 면제");
  r.scores[2]!.estimate = false;
  fail(r, (x) => checkEstimates(x, src), /I1\.feasibility\.reason: 수치 300/);
  r = example();
  r.signals[0]!.description = "학부모 77%가 써 봤다 [S1]";
  fail(r, (x) => checkEstimates(x, src), /G1\.description: 수치 77/);
  r = example();
  r.summary.reasons[0] = "학부모 41%가 원한다";
  fail(r, (x) => checkEstimates(x, src), /수치 41이 출처에 없는데/);
  r = example();
  r.summary.reasons[0] = "가정용 로봇 시장 500억";
  fail(r, (x) => checkEstimates(x, src), /수치 500이 출처에 없는데/);
  r = example();
  for (const negated of ["학부모 85%가 원한다(추정 불가)", "학부모 85%가 원한다 — 추정할 수 없음", "학부모 85%, 추정 근거 없음"]) {
    r.summary.reasons[0] = negated;
    fail(r, (x) => checkEstimates(x, src), /수치 85/);
  }
  r = example();
  r.summary.reasons[0] = "학부모 85%가 원한다(추정)";
  assert.equal(checkEstimates(r, src).status, "pass", "추정 표시가 있으면 통과");
  // ⑥ 날짜
  r = example();
  r.sources[0]!.published = "";
  fail(r, (x) => checkDates(x, "2026-10-28"), /S1: 발행일이 없거나 날짜가 아니다\(빈 값\)/);
  r = example();
  r.sources[1]!.accessed = "";
  fail(r, (x) => checkDates(x, "2026-10-28"), /S2: 접근일이 없거나 날짜가 아니다\(빈 값\)/);
  r = example();
  r.sources[1]!.published = "2026-11-02";
  fail(r, (x) => checkDates(x, "2026-10-28"), /S2: 발행일 2026-11-02이 접근일 2026-10-28보다 뒤다/);
  r = example();
  r.sources[2]!.accessed = "2026-12-01";
  fail(r, (x) => checkDates(x, "2026-10-28"), /S3: 접근일 2026-12-01이 오늘\(2026-10-28\)보다 뒤다/);
  r = example();
  r.sources[2]!.published = "2026-02-30";
  fail(r, (x) => checkDates(x, "2026-10-28"), /S3: 발행일이 없거나 날짜가 아니다\(2026-02-30\)/);
});

test("원문이 없으면 ①은 확인 못 함, 링크는 오프라인·연결 실패면 확인 못 함·4xx면 실패", async () => {
  const r = example();
  const none = checkQuotes(r, new Map());
  assert.equal(none.status, "unknown");
  assert.match(none.detail ?? "", /S1 원문 없음/);
  const noBodyRefs = checkRefs(r, new Map());
  assert.equal(noBodyRefs.status, "unknown", "원문이 없으면 시간 참조는 확인 못 함");
  assert.match(noBodyRefs.detail ?? "", /S3 원문 없음 — 시간 참조 확인 못 함/);
  assert.equal((await checkLinks(r, { offline: true })).status, "unknown");

  const server = createServer((req, res) => {
    if (req.url === "/ok") return res.writeHead(200, { "content-type": "text/html" }).end("<p>ok</p>");
    if (req.url === "/forbidden") return res.writeHead(403).end();
    if (req.url === "/busy") return res.writeHead(429).end();
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  try {
    const local = example();
    local.sources[0]!.url = `http://127.0.0.1:${port}/ok`;
    local.sources[1]!.url = `http://127.0.0.1:${port}/gone`;
    local.sources[2]!.url = "http://127.0.0.1:9/closed";
    const links = await checkLinks(local, { allowLocal: true, timeoutMs: 2000 });
    assert.equal(links.status, "fail");
    assert.match(links.detail ?? "", /S2: 열리지 않는다\(받지 못했다: HTTP 404\)/);
    assert.match(links.detail ?? "", /S3 확인 못 함/);
    assert.doesNotMatch(links.detail ?? "", /S1/);
    const closed = example();
    for (const s of closed.sources) s.url = "http://127.0.0.1:9/closed";
    const offline = await checkLinks(closed, { allowLocal: true, timeoutMs: 2000 });
    assert.equal(offline.status, "unknown", "연결 실패는 실패로 세지 않는다");
    assert.doesNotMatch(offline.detail ?? "", /열리지 않는다/);
    const allOk = example();
    for (const s of allOk.sources) s.url = `http://127.0.0.1:${port}/ok`;
    assert.equal((await checkLinks(allOk, { allowLocal: true })).status, "pass");
    const blocked = example();
    blocked.sources[0]!.url = `http://127.0.0.1:${port}/forbidden`;
    blocked.sources[1]!.url = `http://127.0.0.1:${port}/busy`;
    blocked.sources[2]!.url = `http://127.0.0.1:${port}/ok`;
    const bot = await checkLinks(blocked, { allowLocal: true });
    assert.equal(bot.status, "unknown", "403·429는 봇 차단일 수 있어 확인 못 함");
    assert.match(bot.detail ?? "", /S1 확인 못 함.*S2 확인 못 함/);
    const internal = await checkLinks(local);
    assert.equal(internal.status, "unknown", "내부 주소는 허용 없이 받지 않고 확인 못 함");
  } finally {
    server.close();
  }
});

test("CLI verify — 기록·재렌더·종료 코드, 첫 실행 실패 3개 안내", () => {
  const { home, dir } = fixture();
  const ok = runPace(["scout", "verify", dir, "--offline"], { home });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /통과 6 · 실패 0 · 확인 못 함 1/);
  assert.match(readFileSync(join(dir, "verify.log"), "utf8"), /\[확인 못 함\] 링크 열림\n  - S1 오프라인/);
  const saved = JSON.parse(readFileSync(join(dir, "report.json"), "utf8")) as Report;
  assert.equal(saved.verification!.checks.length, 7);
  assert.deepEqual(saved.verification!.checks.map((c) => c.status), ["pass", "pass", "pass", "pass", "pass", "pass", "unknown"]);
  const html = readFileSync(join(dir, "report.html"), "utf8");
  assert.match(html, /<span class="status-unknown">확인 못 함<\/span> 링크 열림/);
  assert.doesNotMatch(html, /아직 검사하지 않았다/);

  const bad = fixture(home).dir;
  const r = JSON.parse(readFileSync(join(bad, "report.json"), "utf8")) as Report;
  r.ideas[0]!.signals = [];
  r.scores[0]!.reason = "";
  r.sources[0]!.published = "";
  writeFileSync(join(bad, "report.json"), JSON.stringify(r));
  const first = runPace(["scout", "verify", bad, "--offline"], { home });
  assert.equal(first.status, 1);
  assert.match(first.stdout, /실패 3/);
  assert.match(first.stderr, /첫 검사에서 실패한 검사 3개 — 땜질하지 말고/);
  const two = fixture(home).dir;
  const r2 = JSON.parse(readFileSync(join(two, "report.json"), "utf8")) as Report;
  r2.ideas[0]!.signals = [];
  r2.sources[0]!.published = "";
  writeFileSync(join(two, "report.json"), JSON.stringify(r2));
  const twoOut = runPace(["scout", "verify", two, "--offline"], { home });
  assert.equal(twoOut.status, 1);
  assert.match(twoOut.stdout, /실패 2/);
  assert.equal(twoOut.stderr, "", "실패 2개는 안내하지 않는다(2개를 넘을 때만)");
  const second = runPace(["scout", "verify", bad, "--offline"], { home });
  assert.equal(second.status, 1);
  assert.equal(second.stderr, "", "두 번째 실행부터는 안내하지 않는다");

  // 기록 도중 실패하면 verify.log를 쓰지 않는다 — 다음 실행도 첫 실행으로 본다
  const broken = fixture(home).dir;
  mkdirSync(join(broken, "report.html", "x"), { recursive: true });
  assert.equal(runPace(["scout", "verify", broken, "--offline"], { home }).status, 1);
  assert.equal(existsSync(join(broken, "verify.log")), false);

  rmSync(join(dir, "sources"), { recursive: true });
  const cloned = runPace(["scout", "verify", dir, "--offline"], { home });
  assert.equal(cloned.status, 0, "원문이 없는 곳(git 무시)에서도 실패가 아니다");
  assert.match(cloned.stdout, /\[확인 못 함\] 인용·수치 원문 대조/);
  assert.ok(existsSync(join(dir, "report.html")));
});
