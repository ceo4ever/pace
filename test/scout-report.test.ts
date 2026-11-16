import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { packageRoot } from "../src/core/paths.ts";
import { escapeHtml, loadSchema, renderHtml, schemaPath, totalScore, type Report } from "../src/scout/report.ts";
import { validate } from "../src/scout/schema.ts";
import { runPace, tempDir } from "./helpers.ts";

const EXAMPLE = join(packageRoot, "templates/scout/example-report.json");

function example(): Report {
  return JSON.parse(readFileSync(EXAMPLE, "utf8")) as Report;
}

function runWith(home: string, report: unknown): string {
  const dir = runPace(["scout", "new", "렌더", "--out", tempDir()], { home }).stdout.trim();
  writeFileSync(join(dir, "report.json"), typeof report === "string" ? report : JSON.stringify(report));
  return dir;
}

test("예시 report.json은 schema를 통과하고 CLI render가 D5 섹션의 report.html을 만든다", () => {
  assert.deepEqual(validate(loadSchema(), example()), []);
  const home = tempDir();
  const dir = runWith(home, example());
  const out = runPace(["scout", "render", dir], { home });
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stdout.trim(), join(dir, "report.html"));
  const html = readFileSync(join(dir, "report.html"), "utf8");
  for (const id of ["glance", "sources", "signals", "ideas", "scores", "next", "appendix"]) assert.match(html, new RegExp(`<section id="${id}">`), id);
  assert.match(html, /추천: I1 AI 학습 주간 요약 리포트/);
  assert.match(html, /<article class="card" id="S3">/);
  assert.match(html, /리뷰한 앱에 부모 리포트가 없다 <a class="ref" href="#S3">\[S3 03:41\]<\/a><\/p>/, "본문 출처 표기는 출처 카드 링크");
  assert.match(html, /<details><summary>주장 2개<\/summary>/, "상세는 접기");
  assert.match(html, /<span class="tag estimate">추정<\/span>/);
  assert.match(html, /<span class="tag fact">사실<\/span>/);
  assert.match(html, /<tr class="total"><th>가중 합계<\/th><td>3\.25 \/ 5<\/td><td>2\.60 \/ 5<\/td><td>2\.60 \/ 5<\/td><\/tr>/);
  assert.match(html, /아직 검사하지 않았다/);
  assert.doesNotMatch(html, /<link\b|<script\b[^>]*\bsrc=|@import|https?:\/\/[^"]*\.(?:css|js)\b/, "외부 의존 없음");
  assert.equal(runPace(["scout", "schema"], { home }).stdout.trim(), schemaPath);
});

test("가중 합계 — 가중 평균, 가중치 0이면 단순 평균", () => {
  const r = example();
  assert.equal(totalScore(r, "I1"), 3.25);
  r.criteria = r.criteria.map((c) => ({ ...c, weight: 0 }));
  assert.equal(totalScore(r, "I1"), 3.33);
});

test("schema에 어긋나면 칸 경로를 모두 알리고 렌더하지 않는다", () => {
  const broken = example() as unknown as Record<string, any> & { constructor: unknown };
  delete broken.summary.biggest_assumption;
  broken.sources[0].kind = "podcast";
  broken.sources[1].url = "ftp://example.com/x";
  broken.scores[0].score = 6;
  broken.ideas[0].kill_assumptions = ["a", "b", "c"];
  broken.ideas[1].extra = "추가";
  broken.signals[0].evidence = ["S1 3분"];
  broken.meta.title = " ";
  broken.scores[1].score = 0;
  broken.constructor = "x";
  broken.meta.toString = 1;
  broken.sources[2].claims = [];
  const errors = validate(loadSchema(), broken);
  for (const e of [
    "$.summary.biggest_assumption: 필수 칸이 없다",
    "$.sources[0].kind: article|blog|video 중 하나여야 한다",
    "$.sources[1].url: 형식이 맞지 않다",
    "$.scores[0].score: 5 이하여야 한다",
    "$.ideas[0].kill_assumptions: 항목이 2개 이하여야 한다",
    "$.ideas[1].extra: schema에 없는 칸이다",
    "$.signals[0].evidence[0]: 형식이 맞지 않다",
    "$.meta.title: 비어 있다",
    "$.scores[1].score: 1 이상이어야 한다",
    "$.constructor: schema에 없는 칸이다",
    "$.meta.toString: schema에 없는 칸이다",
    "$.sources[2].claims: 항목이 1개 이상이어야 한다",
  ]) assert.ok(errors.some((x) => x.startsWith(e)), e);
  assert.deepEqual(validate({ type: "integer" }, 1.5), ["$: integer여야 한다(지금 number)"]);
  assert.deepEqual(validate({ type: "object", required: ["a"] }, { a: null }), ["$.a: 필수 칸이 없다"]);

  const home = tempDir();
  const dir = runWith(home, broken);
  const out = runPace(["scout", "render", dir], { home });
  assert.equal(out.status, 1);
  assert.match(out.stderr, /schema에 맞지 않다/);
  assert.match(out.stderr, /\$\.summary\.biggest_assumption: 필수 칸이 없다/);
  assert.match(out.stderr, /\$\.scores\[0\]\.score/);
  assert.equal(existsSync(join(dir, "report.html")), false);

  const notJson = runWith(home, "{ 깨짐");
  const notJsonOut = runPace(["scout", "render", notJson], { home });
  assert.equal(notJsonOut.status, 1);
  assert.match(notJsonOut.stderr, /JSON이 아니다/);
  assert.equal(existsSync(join(notJson, "report.html")), false);
  const empty = tempDir();
  const missing = runPace(["scout", "render", empty], { home });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /report.json이 없다/);
  assert.equal(existsSync(join(empty, "report.html")), false);
  const linked = runWith(home, example());
  const outside = join(tempDir(), "x.html");
  writeFileSync(outside, "원본");
  symlinkSync(outside, join(linked, "report.html"));
  assert.equal(runPace(["scout", "render", linked], { home }).status, 1);
  assert.equal(readFileSync(outside, "utf8"), "원본");
});

test("데이터 문자열은 모두 글자 — <script>·속성 탈출·javascript: 링크가 실행되지 않는다", () => {
  const r = example();
  r.meta.title = "</title><script>alert(1)</script>";
  r.sources[1]!.title = "<script>window.pwned=1</script>";
  r.sources[1]!.claims[0]!.quote = '"><img src=x onerror=alert(1)>';
  r.sources[0]!.url = "https://example.com/a\"onmouseover=\"alert(1)";
  r.signals[0]!.description = "<b>굵게</b> [S1] [S9 <i>]";
  assert.deepEqual(validate(loadSchema(), r), []);
  const html = renderHtml(r);
  const scripts = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/g) ?? [];
  assert.equal(scripts.length, 1, "인쇄용 스크립트 하나뿐");
  assert.match(html, /&lt;script&gt;window\.pwned=1&lt;\/script&gt;/);
  assert.match(html, /<title>&lt;\/title&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/title>/);
  assert.match(html, /&quot;&gt;&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img|<b>굵게/);
  assert.match(html, /href="https:\/\/example\.com\/a&quot;onmouseover=&quot;alert\(1\)"/);
  assert.match(html, /&lt;b&gt;굵게&lt;\/b&gt; <a class="ref" href="#S1">\[S1\]<\/a> \[S9 &lt;i&gt;\]/);
  // href에는 http(s)만 — 스키마를 우회한 데이터도
  const js = example();
  js.sources[0]!.url = "javascript:alert(1)";
  assert.match(renderHtml(js), /<a href="#" rel="noreferrer noopener">원문<\/a>/);
  // CSP: 기본 차단, 스크립트는 인쇄 스크립트의 해시만
  const body = /<script>([\s\S]*?)<\/script>/.exec(html)![1]!;
  const hash = createHash("sha256").update(body).digest("base64");
  assert.match(html, new RegExp(`default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-${hash.replace(/[+/]/g, "\\$&")}'`));
  assert.equal(escapeHtml(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;");
});
